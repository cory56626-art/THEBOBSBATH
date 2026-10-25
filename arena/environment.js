import * as THREE from '../house/vendor/three.module.js';

// All textures are authored locally. No network requests are made by the arena.
const mats = new Map();
const textures = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 9);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
const taperGeometry = new THREE.CylinderGeometry(.6, 1, 1, 10);
const v = new THREE.Vector3();
const material = (color, metalness = 0, roughness = .75) => {
  const key = `${color}:${metalness}:${roughness}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  return mats.get(key);
};

function box(group, size, position, mat, rotation) {
  const mesh = new THREE.Mesh(boxGeometry, mat);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function sphere(group, size, position, mat) {
  const mesh = new THREE.Mesh(sphereGeometry, mat);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cylinder(group, size, position, mat, rotation = [0, 0, 0], tapered = false) {
  const mesh = new THREE.Mesh(tapered ? taperGeometry : cylinderGeometry, mat);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function canvasTexture(key, width, height, draw, repeat) {
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  textures.set(key, texture);
  return texture;
}

function groundTexture(type) {
  return canvasTexture(`ground-${type}`, 512, 512, (ctx, w, h) => {
    const random = rng(type === 'grass' ? 6204 : 47271);
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = random() - .5;
      const patch = Math.sin(x * .036) * Math.cos(y * .024) + Math.sin((x+y) * .06) * .3;
      const i = (x + y * w) * 4;
      if (type === 'grass') {
        image.data[i] = 74 + n * 33 + patch * 10;
        image.data[i+1] = 94 + n * 45 + patch * 15;
        image.data[i+2] = 46 + n * 22 + patch * 5;
      } else {
        const shade = 66 + n * 22 + patch * 3;
        image.data[i] = shade;
        image.data[i+1] = shade + 2;
        image.data[i+2] = shade + 3;
      }
      image.data[i+3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (type === 'grass') {
      for (let i = 0; i < 8000; i++) {
        const x=random()*w, y=random()*h;
        ctx.strokeStyle = random()>.5 ? '#7e884e66' : '#303d2755';
        ctx.lineWidth = .5;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*2-1,y-random()*5);ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#22272a38';ctx.lineWidth = .7;
      for (let i=0;i<18;i++) {
        let x=random()*w, y=random()*h;
        ctx.beginPath();ctx.moveTo(x,y);
        for (let j=0;j<6;j++) {x+=random()*16-8;y+=random()*12;ctx.lineTo(x,y);}
        ctx.stroke();
      }
    }
  }, type === 'grass' ? [24, 24] : [32, 32]);
}

function facadeTexture(width, height, tone = 0) {
  const cols = Math.max(2, Math.round(width / 1.7));
  const rows = Math.max(3, Math.round(height / 2));
  return canvasTexture(`facade-${cols}-${rows}-${tone}`, cols*64, rows*64, (ctx,w,h) => {
    const random = rng(cols*120+rows*38+tone);
    ctx.fillStyle = ['#aaa79d','#7f8586','#b1aca0','#8c9699'][tone%4];
    ctx.fillRect(0,0,w,h);
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
      const xx=x*64, yy=y*64;
      ctx.fillStyle='#ffffff14';ctx.fillRect(xx,yy,w,2);
      ctx.fillStyle='#333b3d';ctx.fillRect(xx+9,yy+9,46,45);
      const gradient=ctx.createLinearGradient(0,yy+9,0,yy+54);
      gradient.addColorStop(0,random()>.6?'#6d8b9b':'#80929b');
      gradient.addColorStop(.48,'#33434b');gradient.addColorStop(.5,'#76838a');gradient.addColorStop(1,'#354550');
      ctx.fillStyle=gradient;ctx.fillRect(xx+11,yy+11,42,40);
      ctx.fillStyle='#c4c3b04f';ctx.fillRect(xx+11,yy+11,2,40);
      ctx.fillStyle='#2026298c';ctx.fillRect(xx+31,yy+11,2,40);
      if(random()>.7) {ctx.fillStyle='#afa594';ctx.fillRect(xx+12,yy+12,39,12+random()*20);}
      ctx.fillStyle='#1c21254d';ctx.fillRect(xx+7,yy+55,51,3);
      if(random()>.75){ctx.fillStyle='#a1a3a0';ctx.fillRect(xx+39,yy+46,15,9);ctx.fillStyle='#4e5353';ctx.fillRect(xx+41,yy+49,11,2);}
    }
  });
}

function makeSky(type) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { topColor: {value:new THREE.Color(type === 'city' ? '#8babbc' : '#9abacd')}, bottomColor:{value:new THREE.Color('#e0d9c6')} },
    vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 topColor;uniform vec3 bottomColor;varying vec3 vPos;void main(){float f=pow(max(normalize(vPos).y,0.),.55);gl_FragColor=vec4(mix(bottomColor,topColor,f),1.);}',
    side:THREE.BackSide, depthWrite:false
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(480,24,12),mat);
  sky.renderOrder=-100;
  return sky;
}

function addTrees(group, locations, random) {
  const trunkMat = material('#5d5141');
  const leafMat = material('#4b6745');
  const trunks = new THREE.InstancedMesh(taperGeometry,trunkMat,locations.length);
  const foliage = new THREE.InstancedMesh(sphereGeometry,leafMat,locations.length*3);
  const matrix=new THREE.Matrix4(), quaternion=new THREE.Quaternion();
  const pos=new THREE.Vector3(),scale=new THREE.Vector3();
  let i=0;
  for(const [x,z] of locations){
    const h=4+random()*3;
    pos.set(x,h*.4,z);scale.set(.22,h*.8,.22);matrix.compose(pos,quaternion,scale);trunks.setMatrixAt(i,matrix);
    for(let j=0;j<3;j++){
      pos.set(x+(j-1)*.8,h*.75+(j===1?1.1:0),z+(random()-.5));
      scale.set(1.7+random()*.7,1.9+random()*.6,1.6+random()*.5);matrix.compose(pos,quaternion,scale);foliage.setMatrixAt(i*3+j,matrix);
    }
    i++;
  }
  trunks.castShadow=foliage.castShadow=true;
  trunks.receiveShadow=foliage.receiveShadow=true;
  group.add(trunks,foliage);
}

function addStreetLamp(group,x,z,angle) {
  const pole=material('#4d5354',.65,.45), lamp=material('#d9d5b8',.25,.4);
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;group.add(g);
  cylinder(g,[.085,7,.085],[0,3.5,0],pole);
  cylinder(g,[.065,1.7,.065],[.73,6.8,0],pole,[0,0,Math.PI/2]);
  box(g,[.85,.12,.34],[1.35,6.75,0],pole);
  box(g,[.65,.035,.24],[1.35,6.68,0],lamp);
  cylinder(g,[.2,.22,.2],[0,.11,0],pole);
}

function roadMarkings(group) {
  const paint=material('#d4c7a1',0,.96), white=material('#d5d5cd',0,.96);
  // Two lanes in each direction leave an open, legible battle intersection.
  for(let n=-50;n<=50;n+=6) if(Math.abs(n)>12){
    box(group,[.11,.012,3.1],[-.19,.012,n],paint);box(group,[.11,.012,3.1],[.19,.012,n],paint);
    box(group,[3.1,.012,.11],[n,.012,-.19],paint);box(group,[3.1,.012,.11],[n,.012,.19],paint);
  }
  for(let j=-4;j<=4;j++) for(const side of [-1,1]){
    box(group,[.7,.013,3],[j*1.13,.018,side*11],white);
    box(group,[3,.013,.7],[side*11,.018,j*1.13],white);
  }
  for(const side of [-1,1]){
    box(group,[.09,.012,78],[side*6.1,.012,0],white);
    box(group,[78,.012,.09],[0,.012,side*6.1],white);
  }
}

const civilianBatchMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:0});
const colorBatchMaterials=new Map();

function batchStaticGeometry(group, exclusions=[], vertexColors=false) {
  // Bake rigid submeshes per material. Moving civilian limbs are independent
  // batches so their parent transforms and animation references stay intact.
  group.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets=new Map(), originals=new Set();
  group.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh.material.isShaderMaterial)return;
    for(let ancestor=mesh;ancestor&&ancestor!==group;ancestor=ancestor.parent)if(exclusions.includes(ancestor))return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);source.applyMatrix4(matrix);
    const ranges=Array.isArray(mesh.material)&&source.groups.length?source.groups:[{start:0,count:source.attributes.position.count,materialIndex:0}];
    for(const range of ranges){
      const mat=materials[range.materialIndex||0];if(!mat)continue;
      const useColors=vertexColors===true||(vertexColors==='compatible'&&!mat.map&&!mat.emissiveMap&&!mat.normalMap&&!mat.roughnessMap&&!mat.metalnessMap&&!mat.transparent);
      let batchMaterial=mat,key=mat.uuid;
      if(useColors){
        key=vertexColors===true?'vertex-colors':`color-${mat.metalness}-${mat.roughness}-${mat.emissive?.getHex()||0}-${mat.emissiveIntensity||0}`;
        if(vertexColors===true)batchMaterial=civilianBatchMaterial;
        else {
          if(!colorBatchMaterials.has(key)){const m=mat.clone();m.color.set(0xffffff);m.vertexColors=true;colorBatchMaterials.set(key,m);}
          batchMaterial=colorBatchMaterials.get(key);
        }
      }
      if(!buckets.has(key))buckets.set(key,{mat:batchMaterial,pieces:[],colors:useColors});
      const piece={count:range.count};
      for(const [name,stride] of [['position',3],['normal',3],['uv',2]]){
        const attribute=source.attributes[name];
        if(attribute)piece[name]=attribute.array.slice(range.start*stride,(range.start+range.count)*stride);
      }
      if(useColors){
        piece.color=new Float32Array(range.count*3);
        for(let i=0;i<range.count;i++){
          piece.color[i*3]=mat.color.r;piece.color[i*3+1]=mat.color.g;piece.color[i*3+2]=mat.color.b;
        }
      }
      buckets.get(key).pieces.push(piece);
    }
    source.dispose();originals.add(mesh);
  });
  for(const {mat,pieces,colors} of buckets.values()){
    const count=pieces.reduce((sum,piece)=>sum+piece.count,0);
    const geometry=new THREE.BufferGeometry();
    for(const [name,stride] of [['position',3],['normal',3],['uv',2],...(colors?[['color',3]]:[])]){
      const data=new Float32Array(count*stride);let offset=0;
      for(const piece of pieces){if(piece[name])data.set(piece[name],offset);offset+=piece.count*stride;}
      geometry.setAttribute(name,new THREE.BufferAttribute(data,stride));
    }
    geometry.computeBoundingSphere();
    const merged=new THREE.Mesh(geometry,mat);merged.castShadow=true;merged.receiveShadow=true;
    group.add(merged);
  }
  for(const mesh of originals)mesh.removeFromParent();
}

export function createEnvironment(scene,type='city') {
  const group=new THREE.Group();group.name=`environment-${type}`;scene.add(group);
  scene.background=new THREE.Color(type==='city'?'#afbfbd':'#b9c8bd');
  scene.fog=new THREE.FogExp2(type==='city'?'#afbfbd':'#bec9b8',type==='city'?.0075:.005);
  group.add(makeSky(type));
  const groundMat=new THREE.MeshStandardMaterial({map:groundTexture(type==='grass'?'grass':'asphalt'),roughness:.98,metalness:0});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(900,900),groundMat);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;group.add(ground);
  const random=rng(14483);
  if(type==='city') {
    roadMarkings(group);
    const curb=material('#aaa89e'), sidewalk=material('#a4a399'), soil=material('#5e6653');
    for(const x of [-1,1]) for(const z of [-1,1]) {
      box(group,[42,.18,42],[x*34,.04,z*34],curb);
      // Pavement relief is low enough to stay out of the collision silhouette.
      box(group,[39,.2,39],[x*34,.05,z*34],sidewalk);
      addStreetLamp(group,x*13.5,z*14.5,x>0?Math.PI:0);
      box(group,[3.6,.26,2.2],[x*15.5,.18,z*18],material('#7a7e73'));
      box(group,[3.25,.04,1.9],[x*15.5,.34,z*18],soil);
      // Strong concrete kerbs and subtle paving seams ground the buildings.
      for(let n=16;n<55;n+=4) {
        box(group,[.025,.012,42],[x*n,.155,z*34],material('#878a83'));
        box(group,[42,.012,.025],[x*34,.155,z*n],material('#878a83'));
      }
      const light=material('#333d3e',.65);
      box(group,[.09,3.2,.09],[x*12.8,1.6,z*13.1],light);
      const signal=box(group,[.28,.7,.23],[x*12.8,3,z*13.1],light);
      sphere(group,[.065,.065,.025],[x*12.8,3.18,z*13.1+.125],material('#b83b2a'));
    }
    const locations=[];
    for(const x of [-1,1]) for(const z of [-1,1]) {locations.push([x*15.5,z*18]);locations.push([x*15.5,z*38]);locations.push([x*38,z*15.5]);}
    addTrees(group,locations,random);
    // Distant skyline lies beyond the physics bounds; foreground buildings are sim props.
    const skyline=new THREE.InstancedMesh(boxGeometry,material('#85918e'),40);
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
    for(let i=0;i<40;i++){
      const angle=i/40*Math.PI*2, radius=100+random()*45,h=14+random()*46;
      matrix.compose(new THREE.Vector3(Math.sin(angle)*radius,h*.5,Math.cos(angle)*radius),q,new THREE.Vector3(8+random()*10,h,8+random()*10));skyline.setMatrixAt(i,matrix);
    }group.add(skyline);
  } else {
    const locations=[];
    for(let i=0;i<90;i++){const a=i/90*Math.PI*2;const d=65+random()*65;locations.push([Math.sin(a)*d,Math.cos(a)*d]);}
    addTrees(group,locations,random);
    const stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),material('#82877b'),50);
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
    for(let i=0;i<50;i++){const a=random()*Math.PI*2,d=43+random()*80,s=.35+random()*1.7; q.setFromEuler(new THREE.Euler(random(),random(),random()));matrix.compose(new THREE.Vector3(Math.sin(a)*d,s*.3,Math.cos(a)*d),q,new THREE.Vector3(s,s*.65,s*.8));stones.setMatrixAt(i,matrix);}
    stones.castShadow=true;stones.receiveShadow=true;group.add(stones);
    // A low distant terrain ring preserves a truly flat playable field.
    const hills=new THREE.InstancedMesh(sphereGeometry,material('#819176'),22);
    for(let i=0;i<22;i++){const a=i/22*Math.PI*2;matrix.compose(new THREE.Vector3(Math.sin(a)*280,-4,Math.cos(a)*280),new THREE.Quaternion(),new THREE.Vector3(65+random()*55,12+random()*20,55+random()*40));hills.setMatrixAt(i,matrix);}group.add(hills);
  }
  batchStaticGeometry(group,[],'compatible');
  return {group,update(){},dispose(){scene.remove(group);group.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();if(obj.isMesh&&obj.geometry!==boxGeometry&&obj.geometry!==sphereGeometry&&obj.geometry!==cylinderGeometry&&obj.geometry!==taperGeometry)obj.geometry.dispose();});groundMat.dispose();}};
}

const facadeMaterials=new Map();
function buildingMaterials(w,h,d,tone){
  const key=`${w}-${h}-${d}-${tone}`;
  if(!facadeMaterials.has(key))facadeMaterials.set(key,{
    front:new THREE.MeshStandardMaterial({map:facadeTexture(w,h,tone),roughness:.86,metalness:.13}),
    side:new THREE.MeshStandardMaterial({map:facadeTexture(d,h,tone),roughness:.86,metalness:.13})
  });
  return facadeMaterials.get(key);
}

// The breach mask is identical to the simulation's rebuilt lower collision
// cells. Only exposed faces are emitted; surviving tower floors do not vanish.
function fracturedBuilding(group,prop,front,side){
  const [w,h,d]=prop.size,lower=prop.fractureHeight??Math.min(12,h);
  const nx=Math.ceil(w/2.8),ny=Math.ceil(lower/2.8),nz=Math.ceil(d/2.8),cx=w/nx,cy=lower/ny,cz=d/nz;
  const fractures=prop.fractures||[],tolerance=Math.hypot(cx,cy,cz)*.15;
  const solid=new Uint8Array(nx*ny*nz),index=(x,y,z)=>(y*nz+z)*nx+x;
  for(let iy=0;iy<ny;iy++)for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    const x=-w/2+cx*(ix+.5),y=-h/2+cy*(iy+.5),z=-d/2+cz*(iz+.5);
    solid[index(ix,iy,iz)]=fractures.some(f=>Math.hypot(x-f.x,y-f.y,z-f.z)<f.radius+tolerance)?0:1;
  }
  const buckets=[{positions:[],normals:[],uvs:[],mat:side},{positions:[],normals:[],uvs:[],mat:front},{positions:[],normals:[],uvs:[],mat:material('#77796f',0,.96)}];
  const dirs=[{n:[1,0,0],u:[0,0,-1],v:[0,1,0],axis:0},{n:[-1,0,0],u:[0,0,1],v:[0,1,0],axis:0},{n:[0,1,0],u:[1,0,0],v:[0,0,-1],axis:1},{n:[0,-1,0],u:[1,0,0],v:[0,0,1],axis:1},{n:[0,0,1],u:[1,0,0],v:[0,1,0],axis:2},{n:[0,0,-1],u:[-1,0,0],v:[0,1,0],axis:2}];
  function face(center,dims,dir,exterior){
    const {n,u,v,axis}=dir,su=axis===0?dims[2]:dims[0],sv=axis===1?dims[2]:dims[1];
    const target=buckets[exterior&&axis!==1?(axis===0?0:1):2];
    const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>center.map((val,j)=>val+n[j]*dims[axis]/2+u[j]*a*su/2+v[j]*b*sv/2));
    for(const k of [0,1,2,0,2,3]){const p=points[k];target.positions.push(...p);target.normals.push(...n);
      target.uvs.push(axis===0?(n[0]>0?-p[2]/d+.5:p[2]/d+.5):(n[2]<0?-p[0]/w+.5:p[0]/w+.5),p[1]/h+.5);
    }
  }
  for(let iy=0;iy<ny;iy++)for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    if(!solid[index(ix,iy,iz)])continue;
    const center=[-w/2+cx*(ix+.5),-h/2+cy*(iy+.5),-d/2+cz*(iz+.5)];
    for(const dir of dirs){const tx=ix+dir.n[0],ty=iy+dir.n[1],tz=iz+dir.n[2];
      const exterior=tx<0||tx>=nx||tz<0||tz>=nz||ty<0;
      // Lower cells meet the intact upper volume without an internal face.
      if(ty>=ny&&lower<h)continue;
      if(tx>=0&&tx<nx&&ty>=0&&ty<ny&&tz>=0&&tz<nz&&solid[index(tx,ty,tz)])continue;
      face(center,[cx,cy,cz],dir,exterior);
    }
  }
  if(h>lower){const center=[0,lower/2,0],dims=[w,h-lower,d];for(const dir of dirs)face(center,dims,dir,true);}
  for(const bucket of buckets){if(!bucket.positions.length)continue;const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(bucket.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uvs,2));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,bucket.mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  const rebar=material('#3f4543',.65,.8);
  for(let n=0;n<fractures.length;n++){
    const f=fractures[n];
    for(let j=0;j<5;j++){
      const angle=j/5*Math.PI*2,x=f.x+Math.cos(angle)*f.radius*.85,y=f.y+Math.sin(angle)*f.radius*.65;
      if(Math.abs(x)<w*.5&&y>-h*.5&&y<-h*.5+lower){
        const z=Math.max(-d*.5+.12,Math.min(d*.5-.12,f.z));
        cylinder(group,[.022,.65+.12*j,.022],[x,y,z],rebar,[.18*j,0,.45*Math.sin(j*2+n)]);
      }
    }
  }
}

export function createProp(prop) {
  const group=new THREE.Group();
  group.name=`prop-${prop.id}`;
  const size=prop.size || [1,1,1], [w,h,d]=size;
  const kind=prop.kind || 'rubble';
  const steel=material('#626d6e',.6,.5),dark=material('#232b2c',.3,.75),rubber=material('#171c1b',.05,.94);
  if(kind==='building'){
    const seed=String(prop.id).split('').reduce((a,b)=>a+b.charCodeAt(0),0),tone=seed%4;
    const {front,side}=buildingMaterials(w,h,d,tone);
    if(prop.fractures?.length)fracturedBuilding(group,prop,front,side);
    else {
      const body=new THREE.Mesh(boxGeometry,[side,side,material('#8d8f85'),material('#6b6e66'),front,front]);
      body.scale.set(w,h,d);body.castShadow=true;body.receiveShadow=true;group.add(body);
    }
    box(group,[w+.24,.28,d+.24],[0,h/2+.08,0],material('#b7b8ad'));
    box(group,[w*.48,.5,d*.35],[0,h/2+.45,0],material('#687271',.3));
    const frontBreached=prop.fractures?.some(f=>Math.abs(f.z-d/2)<f.radius+1&&f.y<-h/2+5);
    if(!frontBreached){
    const shopTexture=canvasTexture(`shop-${seed%5}`,512,128,(ctx,cw,ch)=>{
      ctx.fillStyle=['#284b4a','#575149','#554a3c','#33424c','#3f4940'][seed%5];ctx.fillRect(0,0,cw,ch);
      ctx.fillStyle='#d8cdb1';ctx.font='bold 37px sans-serif';ctx.textAlign='center';ctx.fillText(['MOKA  COFFEE','ROSEBANK  TRADING','ATLAS  &  CO.','CENTRAL  HOTEL','STANDARD  HOUSE'][seed%5],cw/2,78);
    });
    const sign=new THREE.MeshStandardMaterial({map:shopTexture,roughness:.8});
    box(group,[w*.88,.62,.07],[0,-h/2+2.4,d/2+.05],sign);
    box(group,[w*.88,.12,.7],[0,-h/2+2.75,d/2+.3],material('#70756b'));
    box(group,[w*.88,1.9,.035],[0,-h/2+1,d/2+.027],material('#23393f',.4,.35));
    for(const x of [-.38,0,.38])box(group,[.12,2.1,.12],[w*x,-h/2+1.05,d/2+.12],material('#afa99a'));
    }
  } else if(kind==='car') {
    const palette=['#c7c4b8','#646f73','#873d35','#b7b7ae','#3f5262'];
    const color=palette[Math.abs(Number(String(prop.id??'1').replace(/\D/g,''))||1)%palette.length];
    const paint=material(color,.55,.37),glass=material('#243943',.6,.22);
    box(group,[w*.92,h*.4,d*.96],[0,-h*.15,0],paint);
    box(group,[w*.84,h*.34,d*.52],[0,h*.2,-d*.05],glass);
    box(group,[w*.86,.07,d*.45],[0,h*.39,-d*.08],paint);
    box(group,[w*.86,.075,d*.24],[0,h*.065,d*.35],paint);
    box(group,[w*.86,.08,d*.19],[0,h*.055,-d*.37],paint);
    for(const x of [-1,1]){
      for(const z of [-.29,.29]){
        cylinder(group,[h*.22,w*.12,h*.22],[x*w*.46,-h*.28,z*d],rubber,[0,0,Math.PI/2]);
        cylinder(group,[h*.12,w*.125,h*.12],[x*w*.47,-h*.28,z*d],steel,[0,0,Math.PI/2]);
      }
      box(group,[.06,h*.36,.08],[x*w*.43,h*.21,d*.19],paint,[.25,0,0]);
      box(group,[.06,h*.36,.08],[x*w*.43,h*.21,-d*.29],paint,[-.15,0,0]);
      box(group,[.08,h*.34,.09],[x*w*.43,h*.21,-d*.03],paint);
      box(group,[w*.18,.12,.05],[x*w*.29,-h*.04,d*.49],material('#d8d6bd',.4,.2));
      box(group,[w*.18,.1,.05],[x*w*.29,-h*.05,-d*.49],material('#a33126',.4,.3));
      box(group,[.23,.12,.18],[x*w*.54,h*.15,d*.13],paint);
    }
    box(group,[w*.55,.14,.06],[0,-h*.2,d*.49],dark);
  } else if(kind==='tank') {
    const olive=material('#666c51',.25,.85),track=material('#30372e',.4,.84);
    box(group,[w*.8,h*.46,d*.9],[0,-h*.13,0],olive);
    box(group,[w*.7,h*.17,d*.8],[0,h*.12,0],olive);
    for(const x of [-1,1]){
      box(group,[w*.22,h*.4,d],[x*w*.4,-h*.28,0],track);
      for(let i=-2;i<=2;i++)cylinder(group,[h*.18,w*.235,h*.18],[x*w*.41,-h*.3,i*d*.17],olive,[0,0,Math.PI/2]);
    }
    cylinder(group,[w*.29,h*.3,w*.29],[0,h*.27,-d*.06],olive,[0,0,0],true);
    box(group,[w*.56,h*.22,d*.4],[0,h*.3,-d*.04],olive);
    cylinder(group,[.12,d*.7,.12],[0,h*.32,d*.4],olive,[Math.PI/2,0,0]);
    box(group,[.27,.25,.42],[0,h*.32,d*.76],dark);
    cylinder(group,[.2,.08,.2],[.2,h*.45,-d*.13],steel);
    cylinder(group,[.018,1.2,.018],[-w*.2,h*.98,-d*.13],dark);
  } else if(kind==='sentry'||kind==='drone') {
    const silver=material('#7d8788',.75,.32),red=material('#dc342c',.4,.3);
    box(group,[w*.55,h*.55,d*.65],[0,0,0],silver);
    sphere(group,[w*.24,h*.18,d*.29],[0,h*.37,0],silver);
    box(group,[w*.32,.06,.06],[0,h*.38,d*.29],red);
    for(const x of [-1,1]) {
      box(group,[w*.15,h*.55,d*.22],[x*w*.4,-h*.08,0],silver);
      cylinder(group,[.09,.22,.09],[x*w*.4,-h*.36,0],red);
    }
  } else if(kind==='repairModule') {
    // Sunday dispatches a physical engine-sized component, not a healing orb.
    const armor=material('#555f64',.76,.34),cap=material('#84252a',.68,.37),bright=material('#b8c3c7',.82,.25);
    const hot=new THREE.MeshBasicMaterial({color:0xff3e2c});
    box(group,[w*.84,h*.72,d*.82],[0,0,0],armor);
    for(const side of [-1,1]){
      box(group,[w*.14,h*.92,d*.95],[side*w*.39,0,0],cap);
      cylinder(group,[w*.12,h*.78,w*.12],[side*w*.28,0,d*.15],bright);
      for(let n=0;n<3;n++)box(group,[w*.18,h*.07,d*.55],[side*w*.23,-h*.18+n*h*.18,0],dark);
    }
    box(group,[w*.42,h*.1,d*.5],[0,h*.42,0],bright);
    cylinder(group,[w*.18,h*.2,w*.18],[0,-h*.41,0],dark);
    cylinder(group,[w*.12,h*.025,w*.12],[0,-h*.52,0],hot);
    box(group,[w*.18,h*.24,d*.035],[0,0,d*.43],cap);
  } else if(kind==='crate') {
    box(group,[w,h,d],[0,0,0],material('#85745a',.1,.92));
    const strapping=material('#504f43',.45,.65);
    for(const x of [-.35,.35])box(group,[w*.05,h*1.02,d*1.01],[x*w,0,0],strapping);
    box(group,[w*1.01,h*.07,d*1.01],[0,h*.27,0],strapping);
  } else if(kind==='rubble'&&Math.max(w,h,d)>.9){
    const geo=boxGeometry.clone();const pos=geo.attributes.position;
    const random=rng(Number(prop.id)||17);
    for(let i=0;i<pos.count;i++){pos.setXYZ(i,pos.getX(i)+(random()-.5)*.12,pos.getY(i)+(random()-.5)*.14,pos.getZ(i)+(random()-.5)*.12);}
    geo.computeVertexNormals();
    const chunk=new THREE.Mesh(geo,material(prop.color??'#87867b',0,.95));chunk.scale.set(w,h,d);chunk.castShadow=true;chunk.receiveShadow=true;group.add(chunk);
    if(w>1.4)cylinder(group,[.025,w*.8,.025],[0,h*.15,0],material('#4c504a',.7,.8),[0,0,Math.PI/2]);
  } else {
    const metal=kind==='armor'||kind==='armorDebris'||kind==='metalDebris';
    const color=prop.color??(kind==='armorDebris'?'#7f3027':kind==='metalDebris'?'#75828b':kind==='organicDebris'?'#692d2e':'#777c74');
    const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),material(color,metal?.6:0,.89));
    stone.scale.set(w*.57,h*.62,d*.57);stone.castShadow=true;stone.receiveShadow=true;group.add(stone);
  }
  batchStaticGeometry(group,[],'compatible');
  return group;
}

export function createCivilian(civ) {
  const group=new THREE.Group();group.name=`civilian-${civ.id}`;
  const id=String(civ.id||'1').split('').reduce((a,b)=>a+b.charCodeAt(0),0);
  const soldier=civ.kind==='soldier'||civ.soldier||civ.type==='soldier'||civ.military;
  const clothes=material(soldier?'#666c52':['#687b87','#a2856c','#8b8178','#74697a','#bfaa8a','#4b625c'][id%6]);
  const trousers=material(soldier?'#555c45':['#3b464b','#544f4c','#444e59'][id%3]);
  const skin=material(['#8b6650','#bb9275','#5e4436','#c4a087'][id%4]);
  const hair=material('#302b27');
  const torso=box(group,[.42,.58,.24],[0,1.05,0],clothes);
  sphere(group,[.14,.18,.14],[0,1.56,.015],skin);
  sphere(group,[.145,.09,.145],[0,1.68,0],soldier?clothes:hair);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.26,1.3,0);group.add(arm);
    box(arm,[.14,.56,.15],[0,-.24,0],clothes);
    sphere(arm,[.07,.085,.075],[0,-.54,0],skin);
    const leg=new THREE.Group();leg.position.set(side*.12,.8,0);group.add(leg);
    box(leg,[.17,.69,.18],[0,-.32,0],trousers);
    box(leg,[.18,.12,.29],[0,-.68,.045],material('#343432'));
    limbs.push({arm,leg,side});
  }
  if(soldier){box(group,[.4,.36,.32],[0,1.08,.015],material('#444b38'));box(group,[.08,.08,.65],[.17,1,.28],material('#282e2b',.6));box(group,[.09,.17,.13],[.17,.9,.15],material('#2d322c',.5));}
  for(const {arm,leg} of limbs){batchStaticGeometry(arm,[],true);batchStaticGeometry(leg,[],true);}
  batchStaticGeometry(group,limbs.flatMap(({arm,leg})=>[arm,leg]),true);
  group.userData.limbs=limbs;group.userData.soldier=!!soldier;group.userData.torso=torso;
  return group;
}

export function updateCivilian(mesh,civ,time) {
  const state=String(civ.state||'').toLowerCase();
  const running=state.includes('flee')||state.includes('run');
  const dead=civ.health<=0||state==='dead';
  const phase=time*(running?11:3.4)+String(civ.id).length;
  for(const {arm,leg,side} of mesh.userData.limbs||[]){
    leg.rotation.x=dead?0:Math.sin(phase+side*Math.PI*.5)*(running?.8:.1);
    arm.rotation.x=dead?0:-Math.sin(phase+side*Math.PI*.5)*(running?.9:.1);
    arm.rotation.z=dead?side*.6:side*.07;
  }
  mesh.rotation.z=dead?Math.PI/2:0;
  if(civ.heading!==undefined)mesh.rotation.y=civ.heading;
  else if(civ.vx!==undefined&&civ.vz!==undefined&&Math.hypot(civ.vx,civ.vz)>.1)mesh.rotation.y=Math.atan2(civ.vx,civ.vz);
}

export function createProjectile(p) {
  const group=new THREE.Group();
  if(p.kind==='missile'){
    const body=material('#9da5a8',.78,.31),red=material('#8b252a',.66,.37),dark=material('#30383c',.7,.45);
    cylinder(group,[.092,.64,.092],[0,0,-.035],body,[Math.PI/2,0,0]);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.095,.24,10),dark);nose.rotation.x=Math.PI/2;nose.position.z=.405;nose.castShadow=true;group.add(nose);
    cylinder(group,[.097,.09,.097],[0,0,.235],red,[Math.PI/2,0,0]);
    for(const sign of [-1,1]){
      box(group,[.2,.025,.22],[sign*.105,0,-.25],red,[0,sign*.17,0]);
      box(group,[.025,.2,.22],[0,sign*.105,-.25],red,[sign*.17,0,0]);
    }
    cylinder(group,[.07,.06,.07],[0,0,-.38],dark,[Math.PI/2,0,0]);
    const exhaust=new THREE.Mesh(sphereGeometry,new THREE.MeshBasicMaterial({color:0xff5936}));exhaust.scale.set(.055,.055,.1);exhaust.position.z=-.415;group.add(exhaust);
    group.userData.projectileAxis='+Z';batchStaticGeometry(group,[],'compatible');return group;
  }
  const color=p.kind==='ultron'||p.kind==='blast'?0xf65c3f:p.kind==='carnage'?0xc7343c:p.kind==='bullet'?0xffe9aa:0x87e5ff;
  const mat=new THREE.MeshBasicMaterial({color});
  const bullet=new THREE.Mesh(sphereGeometry,mat);bullet.scale.set(p.kind==='bullet'?.045:.12,p.kind==='bullet'?.045:.12,p.kind==='bullet'?.12:.25);group.add(bullet);
  const halo=new THREE.Mesh(sphereGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,depthWrite:false}));halo.scale.set(.24,.24,.4);group.add(halo);
  return group;
}

// A cheap animated surface for the same flood depth consumed by the simulation.
// It adds no buoyancy or immunity; those decisions stay in the physics module.
export function createWater(scene, depth=0) {
  const group=new THREE.Group();group.name='battlefield-water';group.userData.depth=Math.max(0,Number(depth)||0);scene.add(group);
  if(group.userData.depth<=0)return {group,update(){},dispose(){scene.remove(group);}};
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    time:{value:0},deepColor:{value:new THREE.Color('#285c67')},shallowColor:{value:new THREE.Color('#5a8990')}
  }]);
  const waterMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,
    vertexShader:`
      uniform float time;varying vec3 vWaterPosition;varying vec3 vWaterNormal;
      #include <fog_pars_vertex>
      void main(){
        vec3 p=position;
        float a=p.x*.19+time*.8,b=p.y*.24-time*.6;
        p.z+=sin(a)*.026+sin(b)*.021;
        vec4 world=modelMatrix*vec4(p,1.);
        vWaterPosition=world.xyz;vWaterNormal=normalize(mat3(modelMatrix)*vec3(-cos(a)*.0049,-cos(b)*.005,1.));
        vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform float time;uniform vec3 deepColor;uniform vec3 shallowColor;
      varying vec3 vWaterPosition;varying vec3 vWaterNormal;
      #include <fog_pars_fragment>
      void main(){
        vec2 p=vWaterPosition.xz;
        float ripples=sin(p.x*1.7+sin(p.y*.7+time)*1.3+time*1.1)*sin(p.y*2.-time*.8);
        float smallWave=sin(p.x*.35-p.y*.46+time*.7);
        vec3 view=normalize(cameraPosition-vWaterPosition);
        float fresnel=pow(1.-abs(dot(view,normalize(vWaterNormal))),3.);
        float streak=pow(max(0.,ripples),12.)*.14;
        vec3 color=mix(deepColor,shallowColor,.32+smallWave*.12+fresnel*.4)+vec3(.26,.32,.31)*streak;
        gl_FragColor=vec4(color,.31+fresnel*.19);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(500,500,40,40),waterMaterial);surface.rotation.x=-Math.PI/2;surface.position.y=group.userData.depth;surface.renderOrder=2;group.add(surface);
  return {group,update(time=0){uniforms.time.value=Number.isFinite(time)?time:0;},dispose(){scene.remove(group);surface.geometry.dispose();waterMaterial.dispose();}};
}
