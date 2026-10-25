import * as THREE from '../house/vendor/three.module.js';

// Authored, film-inspired geometry. Every returned group attaches to one rigid body.
let modelQuality='high';
const primitiveCache={high:{sphere:new THREE.SphereGeometry(1,20,14),cylinder:new THREE.CylinderGeometry(1,1,1,16)}};
let S=primitiveCache.high.sphere,C=primitiveCache.high.cylinder;

// Affects newly created rigid meshes. Existing merged geometry stays valid.
export function configureModelQuality(quality='high'){
  const next=quality==='low'?'low':'high';if(next===modelQuality)return;
  if(!primitiveCache[next])primitiveCache[next]={sphere:new THREE.SphereGeometry(1,12,8),cylinder:new THREE.CylinderGeometry(1,1,1,10)};
  modelQuality=next;S=primitiveCache[next].sphere;C=primitiveCache[next].cylinder;roundedGeometry=undefined;
}
const B = new THREE.BoxGeometry(1, 1, 1);
const mat = (color, metalness = 0, roughness = .55, more = {}) => new THREE.MeshStandardMaterial({color, metalness, roughness, ...more});
const M = {
  red: mat(0x851c1c,.74,.29), redLight: mat(0xac2927,.7,.29), redDark: mat(0x421315,.75,.42),
  gold: mat(0xc49b54,.8,.3), goldDark: mat(0x8d6935,.8,.38), steel: mat(0x919da7,.76,.31),
  silver: mat(0xb2bbc0,.74,.27), bright: mat(0xd5dadd,.8,.24), gun: mat(0x283039,.83,.36), black: mat(0x10161c,.55,.38),
  blue: mat(0xb8f7ff,.3,.18,{emissive:0x57dfff,emissiveIntensity:3}), hot: mat(0xff4b39,.25,.2,{emissive:0xee1508,emissiveIntensity:2.2}),
  skin: mat(0x547d39,0,.72), skinDark: mat(0x3e5a2a,0,.74), skinLight: mat(0x638d43,0,.7),
  purple: mat(0x342f40,0,.9), hair: mat(0x151e12,0,.9), venom: mat(0x11181c,.2,.23), sinew: mat(0x1c282c,.3,.3),
  vein: mat(0x687678,.15,.5), white: mat(0xe6ece0,0,.45), eye: mat(0xc0c7a2,0,.4), teeth: mat(0xe1d6b8,0,.4),
  mouth: mat(0x210d14,0,.55), tongue: mat(0x813d4d,0,.4), blood: mat(0x720f18,0,.5), woundDark: mat(0x2b1922,0,.8),
};
// Small procedural micro-surface maps add pores and brushed wear without downloads.
if (typeof document !== 'undefined') {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d');const data=context.createImageData(128,128);
  let seed=7123;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const c=150+(seed>>>25);data.data[i]=data.data[i+1]=data.data[i+2]=c;data.data[i+3]=255;}
  context.putImageData(data,0,0);const pores=new THREE.CanvasTexture(canvas);pores.wrapS=pores.wrapT=THREE.RepeatWrapping;pores.repeat.set(4,4);
  for(const material of [M.skin,M.skinDark,M.skinLight]){material.bumpMap=pores;material.bumpScale=.017;material.roughnessMap=pores;}
  for(const material of [M.red,M.redLight,M.redDark,M.gold,M.goldDark,M.silver,M.steel]){material.bumpMap=pores;material.bumpScale=.003;material.roughnessMap=pores;}
}
let roundedGeometry;
function bevelBox() {
  if (roundedGeometry) return roundedGeometry;
  const s = new THREE.Shape(); const r=.12;
  s.moveTo(-.5+r,-.5); s.lineTo(.5-r,-.5); s.quadraticCurveTo(.5,-.5,.5,-.5+r);
  s.lineTo(.5,.5-r); s.quadraticCurveTo(.5,.5,.5-r,.5); s.lineTo(-.5+r,.5);
  s.quadraticCurveTo(-.5,.5,-.5,.5-r); s.lineTo(-.5,-.5+r); s.quadraticCurveTo(-.5,-.5,-.5+r,-.5);
  roundedGeometry=new THREE.ExtrudeGeometry(s,{depth:.8,bevelEnabled:true,bevelSegments:modelQuality==='low'?1:2,steps:1,bevelSize:.08,bevelThickness:.1,curveSegments:modelQuality==='low'?2:3});
  roundedGeometry.translate(0,0,-.4); return roundedGeometry;
}
function add(g, geo, material, p, sc, rot) {
  const mesh=new THREE.Mesh(geo,material); if(p) mesh.position.set(...p); if(sc)mesh.scale.set(...sc); if(rot) mesh.rotation.set(...rot);
  mesh.castShadow=true; mesh.receiveShadow=true; g.add(mesh); return mesh;
}
const ell=(g,m,p,sc,rot)=>add(g,S,m,p,sc,rot);
const box=(g,m,p,sc,rot)=>add(g,bevelBox(),m,p,sc,rot);
const cyl=(g,m,p,sc,rot)=>add(g,C,m,p,sc,rot);
function panel(g,m,points,depth=.06,p=[0,0,0]) {
  const shape=new THREE.Shape(); points.forEach((v,i)=>i?shape.lineTo(...v):shape.moveTo(...v)); shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.025,bevelSize:.018,bevelSegments:1,curveSegments:2});
  return add(g,geo,m,p);
}
function rod(g,m,a,b,r=.025) {
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
  const mesh=cyl(g,m,av.clone().add(bv).multiplyScalar(.5).toArray(),[r,delta.length(),r]);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
}
function ring(g,m,p,r,t=.03) {return add(g,new THREE.TorusGeometry(r,t,modelQuality==='low'?4:6,modelQuality==='low'?16:24),m,p);}
function light(g,p,r=.08,red=false) {cyl(g,red?M.hot:M.blue,p,[r,.025,r],[Math.PI/2,0,0]);}
function fasten(g,positions){positions.forEach(p=>ell(g,M.gun,p,[.022,.022,.012]));}
// A single PBR draw per rigid surface batch. Per-vertex finish and emission
// retain the original paint, gold, steel, skin and reactor response without
// spending a draw call on every color and tiny fastener.
const surfaceMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,metalness:1,roughness:1,emissive:0xffffff});
surfaceMaterial.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec2 modelSurface;
attribute vec3 modelEmission;
varying vec2 vModelSurface;
varying vec3 vModelEmission;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vModelSurface=modelSurface;
vModelEmission=modelEmission;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vModelSurface;
varying vec3 vModelEmission;`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=vModelSurface.x;`).replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
metalnessFactor=vModelSurface.y;`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance=vModelEmission*emissive;`);
};
surfaceMaterial.customProgramCacheKey=()=> 'model-surface-v1';
function mergePart(group) {
  const meshes=group.children.filter(mesh=>mesh.isMesh);if(!meshes.length)return;
  const count=meshes.reduce((n,mesh)=>n+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count),0);
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2),colors=new Float32Array(count*3),surfaces=new Float32Array(count*2),emissions=new Float32Array(count*3);
  const normalMatrix=new THREE.Matrix3(),p=new THREE.Vector3(),n=new THREE.Vector3();let offset=0;
  for(const mesh of meshes){
    const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
    const pos=geo.attributes.position,nor=geo.attributes.normal,uv=geo.attributes.uv,m=mesh.material;
    mesh.updateMatrix();normalMatrix.getNormalMatrix(mesh.matrix);
    const emission=m.emissive??new THREE.Color(0),brightness=m.emissiveIntensity??1;
    for(let i=0;i<pos.count;i++){
      const index=offset+i;p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrix);positions.set([p.x,p.y,p.z],index*3);
      n.fromBufferAttribute(nor,i).applyMatrix3(normalMatrix).normalize();normals.set([n.x,n.y,n.z],index*3);
      if(uv)uvs.set([uv.getX(i),uv.getY(i)],index*2);
      colors.set([m.color.r,m.color.g,m.color.b],index*3);
      surfaces.set([Math.max(.04,m.roughness*(m.roughnessMap?.isTexture ? .67 : 1)),m.metalness],index*2);
      emissions.set([emission.r*brightness,emission.g*brightness,emission.b*brightness],index*3);
    }
    offset+=pos.count;group.remove(mesh);if(geo!==mesh.geometry)geo.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,data,stride]of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3],['modelSurface',surfaces,2],['modelEmission',emissions,3]])geometry.setAttribute(name,new THREE.BufferAttribute(data,stride));
  geometry.computeBoundingSphere();add(group,geometry,surfaceMaterial);
}

function busterTorso(g) {
  ell(g,M.black,[0,-.05,0],[.43,.49,.38]);
  box(g,M.redDark,[0,-.24,-.02],[.88,.5,.68]);
  ell(g,M.red,[0,.16,-.02],[.64,.4,.49]);
  ell(g,M.redDark,[0,-.18,.015],[.52,.37,.44]);
  // Broad convex armored breast and a raised collar nest the small helmet.
  for(const side of [-1,1]){
    ell(g,M.red,[side*.29,.19,.19],[.36,.31,.31],[0,0,-side*.16]);
    ell(g,M.redLight,[side*.39,.39,-.055],[.27,.17,.33],[0,0,-side*.24]);
    ell(g,M.goldDark,[side*.205,.47,.02],[.19,.11,.29]);
    ell(g,M.red,[side*.32,-.4,.015],[.24,.22,.39]);
  }
  // Split sculpted chest, stepped gold collar and armored abdomen.
  for(const s of [-1,1]){
    panel(g,M.redLight,[[s*.05,.36],[s*.36,.41],[s*.57,.22],[s*.46,-.02],[s*.13,.02]],.1,[0,0,.31]);
    panel(g,M.gold,[[s*.07,.37],[s*.29,.45],[s*.39,.39],[s*.25,.29],[s*.08,.28]],.04,[0,0,.37]);
    panel(g,M.goldDark,[[s*.12,-.08],[s*.41,-.04],[s*.38,-.23],[s*.15,-.28]],.06,[0,0,.35]);
    box(g,M.red,[s*.32,-.4,.05],[.36,.25,.67],[0,0,s*.12]);
    box(g,M.gold,[s*.28,-.43,.36],[.24,.15,.06],[0,0,-s*.1]);
    box(g,M.gun,[s*.25,.18,-.41],[.25,.38,.11],[.08,0,0]);
    for(let i=0;i<4;i++)box(g,M.black,[s*.25,.08+i*.07,-.48],[.2,.025,.025]);
    cyl(g,M.goldDark,[s*.37,-.08,-.28],[.055,.56,.055],[0,0,s*.15]);
    light(g,[s*.35,.18,.405],.035);
  }
  box(g,M.goldDark,[0,-.15,.37],[.24,.32,.07]);
  for(let i=0;i<3;i++) box(g,i%2?M.redLight:M.red,[0,-.08-i*.095,.4],[.31-i*.02,.07,.07]);
  ring(g,M.gold,[0,.14,.463],.135,.035);ring(g,M.black,[0,.14,.484],.1,.019);light(g,[0,.14,.49],.082);
  cyl(g,M.gun,[0,.46,0],[.19,.14,.19]);
  fasten(g,[[-.38,.32,.41],[.38,.32,.41],[-.4,-.14,.38],[.4,-.14,.38]]);
}
function busterHead(g) {
  ell(g,M.redDark,[0,0,-.04],[.49,.48,.43]);
  ell(g,M.red,[0,.15,-.06],[.46,.36,.42]);
  panel(g,M.gold,[[-.3,.37],[.3,.37],[.35,.17],[.25,-.12],[.16,-.33],[-.16,-.33],[-.25,-.12],[-.35,.17]],.055,[0,0,.31]);
  panel(g,M.goldDark,[[-.22,-.22],[.22,-.22],[.16,-.38],[-.16,-.38]],.045,[0,0,.325]);
  for(const s of [-1,1]){
    panel(g,M.black,[[s*.045,.11],[s*.29,.16],[s*.27,.055],[s*.065,.035]],.015,[0,0,.394]);
    panel(g,M.blue,[[s*.07,.105],[s*.265,.135],[s*.245,.085],[s*.075,.065]],.012,[0,0,.412]);
    box(g,M.red,[s*.36,-.03,.08],[.18,.48,.49],[0,0,s*.06]);
    cyl(g,M.goldDark,[s*.47,.01,0],[.13,.065,.13],[0,0,Math.PI/2]);
    panel(g,M.goldDark,[[s*.05,.01],[s*.23,-.045],[s*.19,-.17],[s*.08,-.17]],.015,[0,0,.382]);
  }
  box(g,M.black,[0,-.23,.396],[.27,.026,.022]);
  box(g,M.gold,[0,-.3,.386],[.21,.055,.04]);
  // A little vertical overlap avoids the long exposed action-figure neck.
  for(const mesh of g.children)mesh.position.y-=.13;
}
function busterArm(g,forearm,s) {
  if(!forearm){
    cyl(g,M.black,[0,0,0],[.34,.94,.34]);
    ell(g,M.redDark,[0,.31,-.02],[.69,.43,.63]);
    ell(g,M.red,[0,.4,.015],[.72,.43,.64]);
    ell(g,M.redLight,[-s*.14,.52,.13],[.46,.26,.45],[0,0,s*.15]);
    ell(g,M.gold,[s*.25,.43,.21],[.25,.23,.29]);
    ell(g,M.red,[0,-.14,.03],[.48,.39,.46]);
    box(g,M.redLight,[0,-.13,.29],[.65,.43,.25],[.04,0,-s*.04]);
    box(g,M.goldDark,[s*.23,-.18,.38],[.17,.28,.09]);
    cyl(g,M.gun,[0,-.43,.02],[.29,.16,.29]);
    for(let i=0;i<3;i++)box(g,M.black,[s*.27,.5-i*.075,.588],[.26,.032,.025]);
    light(g,[-s*.17,.43,.61],.045);
  }else{
    ell(g,M.gun,[0,.37,0],[.35,.16,.35]);
    ell(g,M.redDark,[0,.05,0],[.55,.49,.51]);
    ell(g,M.red,[0,.1,.025],[.55,.44,.52]);
    box(g,M.red,[0,.02,.06],[.83,.73,.74]);
    box(g,M.redLight,[0,.1,.38],[.76,.57,.12]);
    panel(g,M.gold,[[-.36,.29],[-.17,.36],[-.12,-.19],[-.33,-.27]],.04,[0,0,.46]);
    box(g,M.goldDark,[s*.34,.09,.17],[.15,.52,.48]);
    for(const x of [-.24,.24]){cyl(g,M.gun,[x,.13,-.35],[.055,.57,.055]);cyl(g,M.steel,[x,.09,-.35],[.029,.65,.029]);}
    ell(g,M.redDark,[0,-.36,.04],[.47,.25,.45]);
    box(g,M.redDark,[0,-.38,.02],[.8,.3,.76]);
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.175;box(g,M.red,[x,-.41,.29],[.155,.25,.27]);
      box(g,M.gold,[x,-.31,.44],[.13,.11,.08]);
      box(g,M.black,[x,-.5,.32],[.125,.026,.12]);
    }
    box(g,M.red,[s*.45,-.34,.05],[.22,.28,.3],[0,0,s*.24]);
    ring(g,M.goldDark,[0,-.14,.45],.11,.027);light(g,[0,-.14,.48],.083);
    fasten(g,[[-.31,.28,.47],[.31,.28,.47],[-.31,-.12,.47],[.31,-.12,.47]]);
  }
}
function busterLeg(g,shin,s){
  cyl(g,M.black,[0,.02,0],[.31,.93,.31]);
  if(!shin){
    ell(g,M.redDark,[0,.02,-.02],[.58,.48,.54]);
    ell(g,M.red,[0,.05,.06],[.57,.46,.52]);
    box(g,M.red,[0,.03,.03],[.85,.76,.75]);
    panel(g,M.gold,[[s*-.29,.31],[s*.11,.33],[s*.31,.13],[s*.23,-.3],[s*-.15,-.34]],.05,[0,0,.39]);
    box(g,M.redLight,[-s*.32,.01,.09],[.25,.7,.59],[0,0,s*.06]);
    cyl(g,M.gun,[0,-.4,.1],[.33,.18,.33],[Math.PI/2,0,0]);
  }else{
    ell(g,M.redDark,[0,.04,-.02],[.56,.5,.49]);
    ell(g,M.red,[0,.02,.035],[.56,.47,.5]);
    box(g,M.red,[0,.01,.03],[.82,.8,.7]);
    ell(g,M.redLight,[0,.35,.26],[.59,.22,.38]);
    panel(g,M.gold,[[-.3,.45],[.3,.45],[.26,.27],[0,.21],[-.26,.27]],.04,[0,0,.54]);
    panel(g,M.gold,[[-.27,.18],[.27,.18],[.2,-.29],[-.21,-.29]],.045,[0,0,.39]);
    box(g,M.gun,[0,-.4,.18],[.94,.21,1.08]);
    box(g,M.red,[0,-.39,.39],[.97,.26,.79]);
    for(let i=0;i<3;i++)box(g,M.goldDark,[(i-1)*.27,-.34,.78],[.22,.075,.08]);
    for(const x of [-.28,.28])rod(g,M.steel,[x,.25,-.35],[x,-.29,-.39],.045);
    light(g,[0,.22,.485],.04);
  }
}
function muscleTorso(g,venom=false){
  const skin=venom?M.venom:M.skin, highlight=venom?M.sinew:M.skinLight;
  ell(g,skin,[0,.09,0],[.48,.48,.39]);ell(g,skin,[0,-.22,.01],[.34,.31,.31]);
  for(const s of [-1,1]){
    ell(g,highlight,[s*.23,.22,.21],[.28,.2,.23],[0,0,-s*.13]);
    ell(g,skin,[s*.35,.04,-.12],[.19,.34,.27],[0,0,s*.22]);
    ell(g,skin,[s*.18,.37,-.09],[.22,.17,.26],[0,0,-s*.26]);
    ell(g,highlight,[s*.24,-.17,.19],[.11,.27,.13],[0,0,-s*.16]);
    for(let i=0;i<3;i++)ell(g,highlight,[s*.105,.01-i*.105,.297-i*.015],[.104,.073,.06]);
    if(venom){for(let i=0;i<3;i++)rod(g,M.vein,[s*(.08+i*.1),.29,.39],[s*(.19+i*.1),.1,.35],.009);}
    else {rod(g,M.skinDark,[s*.31,.29,.37],[s*.15,.14,.43],.009);}
  }
  if(!venom){
    box(g,M.purple,[0,-.39,-.01],[.7,.25,.62]);
    box(g,M.black,[0,-.29,.304],[.67,.035,.025]);
    for(let i=0;i<7;i++)panel(g,M.purple,[[i*.09-.31,-.44],[i*.09-.23,-.44],[i*.09-.27,-.56]],.02,[0,0,.28]);
  }else{
    ell(g,M.venom,[0,-.39,0],[.38,.2,.3]);
    for(let i=0;i<6;i++)ell(g,M.sinew,[0,.24-i*.105,-.375],[.09,.064,.046]);
  }
  cyl(g,skin,[0,.46,-.015],[.17,.21,.18]);
}
function organicArm(g,forearm,s,venom=false){
  const skin=venom?M.venom:M.skin,hi=venom?M.sinew:M.skinLight;
  if(!forearm){
    ell(g,skin,[0,.29,0],[.49,.29,.45]);
    ell(g,hi,[0,-.05,.13],[.37,.36,.29],[0,0,-s*.06]);
    ell(g,skin,[0,-.12,-.16],[.36,.32,.24]);
    ell(g,skin,[0,-.42,.025],[.28,.13,.29]);
    rod(g,venom?M.vein:M.skinDark,[s*.14,.17,.39],[s*.2,-.3,.3],.014);
  }else{
    ell(g,hi,[0,.14,.02],[.37,.39,.34]);ell(g,skin,[0,-.27,.05],[.32,.24,.29]);
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.14;
      ell(g,skin,[x,-.43,.19],[.087,.16,.15]);
      if(venom)ell(g,M.black,[x,-.55,.22],[.04,.095,.07],[.35,0,0]);
    }
    ell(g,skin,[s*.3,-.29,.12],[.14,.18,.15],[0,0,s*.3]);
    for(let i=0;i<3;i++)rod(g,venom?M.vein:M.skinDark,[(i-1)*.11,.35,.29],[(i-1)*.14,-.24,.3],.012);
  }
}
function organicLeg(g,shin,s,venom=false){
  const skin=venom?M.venom:M.skin,hi=venom?M.sinew:M.skinLight;
  if(!shin){
    ell(g,skin,[0,.05,0],[.46,.47,.42]);
    ell(g,hi,[-s*.13,.03,.19],[.23,.39,.24],[0,0,s*.06]);
    if(!venom){box(g,M.purple,[0,.28,-.01],[.89,.46,.79]);for(let i=0;i<4;i++)panel(g,M.purple,[[i*.2-.4,.1],[i*.2-.2,.1],[i*.2-.29,-.06]],.04,[0,0,.34]);}
    ell(g,skin,[0,-.39,.12],[.28,.15,.25]);
  }else{
    ell(g,skin,[0,.14,-.03],[.32,.4,.31]);
    ell(g,hi,[0,-.05,.2],[.19,.37,.15]);
    ell(g,skin,[0,-.4,.18],[.38,.14,.47]);
    for(let i=0;i<5;i++)ell(g,skin,[(i-2)*.13,-.45,.48],[.082,.075,.17-i*.009]);
    if(venom)for(let i=0;i<3;i++)rod(g,M.vein,[(i-1)*.12,.34,.23],[(i-1)*.11,-.24,.29],.011);
  }
}
function hulkHead(g){
  ell(g,M.skin,[0,.04,0],[.42,.45,.36]);
  box(g,M.skinDark,[0,-.18,.18],[.65,.39,.48]);
  for(const s of [-1,1]){
    ell(g,M.skin,[s*.4,0,.01],[.12,.18,.13]);
    ell(g,M.skinLight,[s*.23,-.03,.285],[.17,.16,.11]);
    ell(g,M.skinDark,[s*.16,.14,.31],[.19,.09,.12],[0,0,s*.15]);
    ell(g,M.white,[s*.16,.085,.391],[.091,.04,.019]);
    ell(g,M.eye,[s*.146,.085,.41],[.029,.032,.01]);
    ell(g,M.black,[s*.143,.085,.422],[.014,.022,.006]);
    ell(g,M.skinLight,[s*.17,.2,.33],[.21,.065,.09],[0,0,s*.2]);
    rod(g,M.skinDark,[s*.3,-.04,.35],[s*.2,-.19,.416],.012);
  }
  ell(g,M.skin,[0,.005,.4],[.105,.15,.13]);ell(g,M.skinDark,[0,-.08,.449],[.12,.052,.072]);
  box(g,M.mouth,[0,-.21,.427],[.37,.095,.04]);
  for(let i=0;i<6;i++)box(g,M.teeth,[(i-2.5)*.052,-.193,.456],[.045,.036,.024]);
  ell(g,M.skinLight,[0,-.32,.3],[.26,.12,.17]);
  ell(g,M.hair,[0,.35,-.03],[.43,.16,.34]);
  // Uneven swept strands keep the silhouette from becoming a spherical cap.
  for(let i=0;i<13;i++){
    const x=Math.sin(i*2.4)*.32,z=Math.cos(i*2.4)*.22;
    ell(g,M.hair,[x,.37+Math.sin(i*1.7)*.035,z],[.14,.095,.12],[0,0,.2]);
  }
}
function venomHead(g){
  ell(g,M.venom,[0,.08,-.045],[.43,.47,.4]);
  ell(g,M.venom,[0,-.22,.1],[.39,.29,.31]);
  // Recessed maw, long asymmetric pointed eye patches, irregular curved teeth.
  ell(g,M.mouth,[0,-.15,.335],[.36,.225,.12]);
  for(const s of [-1,1]){
    panel(g,M.white,[[s*.035,.13],[s*.16,.22],[s*.39,.32],[s*.35,.12],[s*.24,.025],[s*.11,.035]],.014,[0,0,.34]);
    rod(g,M.sinew,[s*.06,.3,.34],[s*.32,.4,.16],.018);
    for(let i=0;i<7;i++){
      const x=s*(.035+i*.043),y=-.045-Math.pow(i/6,1.6)*.105;
      const cone=new THREE.ConeGeometry(.031,.13-i*.008,6);add(g,cone,M.teeth,[x,y,.421],[1,1,1],[0,0,Math.PI+s*.13]);
      add(g,new THREE.ConeGeometry(.028,.09+i*.005,6),M.teeth,[x,-.29+Math.pow(i/6,1.5)*.065,.408]);
    }
  }
  const tongueCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.25,.43),new THREE.Vector3(.035,-.39,.58),new THREE.Vector3(.2,-.46,.67),new THREE.Vector3(.24,-.38,.75)]);
  add(g,new THREE.TubeGeometry(tongueCurve,modelQuality==='low'?10:16,.052,modelQuality==='low'?5:7,false),M.tongue);
  rod(g,M.mouth,[.02,-.29,.48],[.13,-.43,.62],.009);
  for(let i=0;i<5;i++)rod(g,M.sinew,[-.3+i*.15,.36,.15],[-.32+i*.16,.2,.32],.009);
}
function ultronTorso(g){
  ell(g,M.gun,[0,.08,0],[.4,.47,.32]);
  cyl(g,M.black,[0,-.05,-.09],[.17,.9,.17]);
  for(const s of [-1,1]){
    panel(g,M.silver,[[s*.04,.36],[s*.29,.43],[s*.48,.26],[s*.36,.07],[s*.07,.13]],.08,[0,0,.23]);
    panel(g,M.gun,[[s*.07,.29],[s*.25,.33],[s*.35,.25],[s*.28,.17],[s*.08,.19]],.022,[0,0,.326]);
    rod(g,M.hot,[s*.09,.19,.36],[s*.27,.24,.36],.012);
    ell(g,M.steel,[s*.31,-.09,.02],[.12,.27,.27],[0,0,-s*.17]);
    for(let i=0;i<5;i++){
      box(g,M.silver,[s*.13,-.025-i*.078,.29],[.21,.043,.075],[0,0,s*.24]);
      box(g,M.hot,[s*.11,-.052-i*.078,.275],[.13,.012,.025],[0,0,s*.24]);
    }
    box(g,M.silver,[s*.22,-.38,.035],[.26,.2,.47],[0,0,s*.16]);
    box(g,M.gun,[s*.24,.13,-.29],[.22,.52,.18],[0,0,-s*.13]);
    for(let i=0;i<3;i++)light(g,[s*.24,.26-i*.11,-.39],.035,true);
  }
  rod(g,M.bright,[0,.39,-.33],[0,-.41,-.31],.055);
  cyl(g,M.gun,[0,.45,0],[.14,.22,.15]);
  for(let i=0;i<3;i++)cyl(g,M.silver,[0,.42+i*.045,0],[.18,.025,.18]);
}
function ultronHead(g){
  ell(g,M.gun,[0,.06,-.025],[.35,.46,.31]);
  panel(g,M.silver,[[-.25,.35],[-.06,.44],[.06,.44],[.25,.35],[.3,.07],[.19,-.25],[.11,-.39],[-.11,-.39],[-.19,-.25],[-.3,.07]],.04,[0,0,.2]);
  for(const s of [-1,1]){
    panel(g,M.gun,[[s*.045,.13],[s*.27,.19],[s*.24,.025],[s*.09,-.015]],.016,[0,0,.267]);
    panel(g,M.hot,[[s*.06,.105],[s*.245,.157],[s*.215,.075],[s*.08,.055]],.012,[0,0,.286]);
    panel(g,M.bright,[[s*.045,.2],[s*.21,.27],[s*.29,.2],[s*.08,.145]],.027,[0,0,.27]);
    panel(g,M.steel,[[s*.25,.04],[s*.16,-.1],[s*.24,-.25],[s*.3,-.14]],.04,[0,0,.255]);
    rod(g,M.gun,[s*.27,.04,.27],[s*.21,-.2,.29],.028);
    cyl(g,M.gun,[s*.34,.035,0],[.095,.07,.095],[0,0,Math.PI/2]);
  }
  panel(g,M.gun,[[-.12,-.1],[.12,-.1],[.16,-.28],[.07,-.33],[-.07,-.33],[-.16,-.28]],.02,[0,0,.274]);
  for(let i=0;i<4;i++)box(g,M.hot,[(i-1.5)*.055,-.205,.306],[.02,.11,.018],[0,0,(i-1.5)*-.06]);
  panel(g,M.silver,[[-.08,.13],[.08,.13],[.11,-.09],[0,-.13],[-.11,-.09]],.035,[0,0,.297]);
  rod(g,M.bright,[0,.42,.2],[0,.19,.29],.028);
}
function ultronLimb(g,part,s){
  const arm=part.includes('Arm')||part.includes('forearm'),lower=part.includes('forearm')||part.includes('shin');
  cyl(g,M.black,[0,0,0],[.19,.99,.19]);
  const width=arm?.31:.38;
  ell(g,M.gun,[0,.38,0],[width,.15,width]);
  for(const sign of [-1,1]){
    box(g,M.silver,[sign*.17,.02,.12],[.24,.77,.31],[0,0,sign*.07]);
    rod(g,M.steel,[sign*.19,.28,-.13],[sign*.17,-.33,-.16],.035);
    rod(g,M.hot,[sign*.23,.24,.3],[sign*.2,-.21,.3],.012);
  }
  panel(g,M.bright,[[-.18,.32],[.18,.32],[.25,.15],[.14,-.27],[-.14,-.27],[-.25,.15]],.04,[0,0,.26]);
  for(let i=0;i<4;i++)box(g,M.gun,[0,.19-i*.1,.32],[.25,.027,.022]);
  if(!lower && arm){ell(g,M.silver,[0,.34,0],[.49,.28,.43]);box(g,M.gun,[s*.3,.27,.22],[.2,.18,.17],[0,0,s*.2]);}
  if(lower && arm){
    box(g,M.gun,[0,-.35,.05],[.5,.28,.42]);
    for(let i=0;i<4;i++){box(g,M.silver,[(i-1.5)*.12,-.46,.18],[.085,.26,.16],[0,0,(i-1.5)*-.05]);box(g,M.gun,[(i-1.5)*.12,-.39,.27],[.07,.035,.025]);}
    ell(g,M.silver,[s*.27,-.31,.1],[.1,.2,.12],[0,0,s*.35]);light(g,[0,-.18,.34],.06,true);
  }
  if(lower&&!arm){box(g,M.gun,[0,-.41,.16],[.65,.2,.78]);box(g,M.silver,[0,-.37,.38],[.66,.17,.58]);for(let i=0;i<3;i++)box(g,M.gun,[(i-1)*.17,-.35,.67],[.035,.1,.025]);}
}

// Titan Breaker retains the heavy exoskeleton construction, with its own
// titanium palette and independently animated equipment rather than recoloring
// shared materials used by Hulkbuster.
const TITAN={
  plate:mat(0x555e65,.83,.32),raised:mat(0x7f898f,.85,.27),deep:mat(0x30383f,.79,.4),
  trim:mat(0x9ca6ab,.87,.26),darkTrim:mat(0x48525a,.82,.34),
  cyan:mat(0xa7f5ff,.35,.2,{emissive:0x44d6f0,emissiveIntensity:3.4}),
  exhaust:mat(0xff563d,.3,.25,{emissive:0xf82713,emissiveIntensity:2.6}),
  flame:mat(0xff8a54,.1,.3,{emissive:0xff2c0d,emissiveIntensity:4.1}),
};
function titanThruster(group,position,radius=.12,direction=[0,0,-1]){
  const point=new THREE.Vector3(...position),axis=new THREE.Vector3(...direction).normalize();
  const basis=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
  const nozzle=cyl(group,M.gun,position,[radius*1.45,.11,radius*1.45]);nozzle.quaternion.copy(basis);
  const inner=cyl(group,TITAN.exhaust,point.clone().addScaledVector(axis,.075).toArray(),[radius,.025,radius]);inner.quaternion.copy(basis);
  const jet=new THREE.Group();jet.name='titan-red-thruster';jet.position.copy(point);jet.quaternion.copy(basis);
  ell(jet,TITAN.flame,[0,.26,0],[radius*.85,.32,radius*.85]);
  ell(jet,TITAN.exhaust,[0,.53,0],[radius*.43,.26,radius*.43]);
  mergePart(jet);jet.visible=false;jet.userData.activation='visible';group.add(jet);return jet;
}
function titanPart(group,name,side){
  if(name==='torso')busterTorso(group);else if(name==='head')busterHead(group);
  else if(name.includes('Arm')||name.includes('forearm'))busterArm(group,name.includes('forearm'),side);
  else busterLeg(group,name.includes('shin'),side);
  const replacements=new Map([[M.red,TITAN.plate],[M.redLight,TITAN.raised],[M.redDark,TITAN.deep],[M.gold,TITAN.trim],[M.goldDark,TITAN.darkTrim],[M.blue,TITAN.cyan]]);
  group.traverse(o=>{if(o.isMesh&&replacements.has(o.material))o.material=replacements.get(o.material);});
  const missileFlaps=[],redThrusters=[];
  if(name==='torso'){
    // Overlapping breastplates, reinforced lower ribs and the exposed cyan core.
    for(const sign of [-1,1]){
      panel(group,TITAN.raised,[[sign*.12,.34],[sign*.49,.36],[sign*.57,.13],[sign*.31,.03],[sign*.14,.08]],.055,[0,0,.405]);
      box(group,TITAN.deep,[sign*.43,-.16,.11],[.15,.37,.59],[0,0,sign*.13]);
      for(let i=0;i<4;i++)box(group,M.black,[sign*.39,-.06-i*.065,.455],[.16,.028,.03],[0,0,sign*.12]);
      box(group,TITAN.plate,[sign*.27,.22,-.455],[.29,.42,.16]);
      redThrusters.push(titanThruster(group,[sign*.27,.15,-.56],.105));
    }
    ring(group,TITAN.trim,[0,.14,.53],.14,.024);light(group,[0,.14,.555],.10);
    for(const sign of [-1,1])box(group,TITAN.cyan,[sign*.16,-.33,.46],[.075,.025,.02]);
  }
  if(name.startsWith('upperArm')){
    // Elbow thrust ports sit behind the armored joint.
    box(group,TITAN.deep,[0,-.3,-.33],[.46,.25,.24]);
    redThrusters.push(titanThruster(group,[0,-.29,-.48],.085));
    for(let i=0;i<3;i++)box(group,M.gun,[side*.48,.4-i*.08,.04],[.028,.04,.32]);
  }
  if(name.startsWith('forearm')){
    // Fifteen recessed missile tubes per arm: three columns by five rows.
    box(group,TITAN.deep,[0,.055,.52],[.79,.68,.09]);
    for(let row=0;row<5;row++)for(let col=0;col<3;col++){
      const x=(col-1)*.215,y=.31-row*.13;
      cyl(group,M.black,[x,y,.59],[.066,.034,.066],[Math.PI/2,0,0]);
      cyl(group,TITAN.trim,[x,y,.615],[.042,.025,.042],[Math.PI/2,0,0]);
      cyl(group,TITAN.exhaust,[x,y,.632],[.014,.008,.014],[Math.PI/2,0,0]);
    }
    const flap=new THREE.Group();flap.name='titan-missile-bay-flap';flap.position.set(0,.4,.665);
    box(flap,TITAN.plate,[0,-.34,0],[.81,.7,.065]);
    box(flap,TITAN.raised,[0,-.32,.044],[.63,.48,.035]);
    for(const x of [-.27,.27])rod(flap,M.gun,[x,-.62,.065],[x,-.08,.065],.014);
    box(flap,TITAN.cyan,[0,-.15,.07],[.22,.022,.014]);mergePart(flap);
    flap.userData.capacity=15;flap.userData.closedAngle=0;flap.userData.openAngle=-1.45;
    group.add(flap);missileFlaps.push(flap);
    // Short armored wrist shield; it does not cover the opening bay.
    box(group,TITAN.deep,[side*.47,-.23,.09],[.13,.4,.55],[0,0,-side*.12]);
    panel(group,TITAN.raised,[[side*.39,-.02],[side*.64,-.1],[side*.61,-.48],[side*.42,-.42]],.08,[0,0,.27]);
    redThrusters.push(titanThruster(group,[side*.25,.22,-.44],.075));
  }
  if(name.startsWith('shin')){
    for(const sign of [-1,1])box(group,TITAN.raised,[sign*.35,.02,.02],[.17,.68,.7],[0,0,-sign*.03]);
    box(group,M.black,[0,-.37,.79],[.77,.14,.04]);
    for(let i=0;i<6;i++)box(group,TITAN.trim,[(i-2.5)*.118,-.365,.82],[.035,.13,.025]);
    box(group,TITAN.plate,[0,.34,.43],[.73,.18,.16]);
  }
  return {missileFlaps,redThrusters};
}

function addRemovableArmor(group,type,name){
  if((type!=='buster'&&type!=='ultron'&&type!=='titan')||name==='head')return [];
  const plates=[];
  const torso=name==='torso',arm=name.includes('Arm'),lower=name.includes('forearm');
  const z=torso?.505:arm?.585:lower?.515:.5;
  const y=torso?.01:arm?.35:lower?.06:-.07;
  const x=torso?.39:arm?.28:lower?.22:.23;
  for(const side of [-1,1]){
    box(group,M.black,[side*x,y,z-.01],[torso?.17:.13,.28,.025]);
    for(let i=0;i<3;i++)rod(group,M.steel,[side*x-.045,y-.09+i*.07,z+.009],[side*x+.045,y-.06+i*.07,z+.009],.008);
    const outer=new THREE.Group();outer.position.set(side*x,y,z+.018);
    box(outer,type==='titan'?TITAN.raised:type==='buster'?M.redLight:M.silver,[0,0,0],[torso?.19:.15,.31,.045],[0,0,-side*.08]);
    fasten(outer,[[-.045,.11,.027],[.045,-.11,.027]]);mergePart(outer);group.add(outer);plates.push(outer);
  }
  return plates;
}

// Movie-inspired additions, kept in the same per-body batching pipeline.
const NEW={
  red:mat(0x8e1925,.12,.4),darkRed:mat(0x42121c,.12,.45),vein:mat(0x1e161c,.1,.4),
  rock:mat(0xbf7136,0,.94),rockLight:mat(0xd88a46,0,.9),rockDark:mat(0x784226,0,1),
  yellow:mat(0xc8a52b,.12,.6),blue:mat(0x162d49,.12,.58),leather:mat(0x362e22,.08,.75),
  skin:mat(0xba8c68,0,.75),hair:mat(0x30251d,0,.9),claw:mat(0xb6c2c9,.9,.2),redBelt:mat(0x8f2824,.2,.6)
};
const rockGeometry=new THREE.DodecahedronGeometry(1,0);
function carnagePart(g,name,s){
  if(name==='torso')muscleTorso(g,true);else if(name==='head')venomHead(g);
  else if(name.includes('Arm')||name.includes('forearm'))organicArm(g,name.includes('forearm'),s,true);
  else organicLeg(g,name.includes('shin'),s,true);
  g.traverse(o=>{if(!o.isMesh)return;if(o.material===M.venom)o.material=NEW.red;else if(o.material===M.sinew)o.material=NEW.darkRed;else if(o.material===M.vein)o.material=NEW.vein;});
  if(name==='torso')for(const side of [-1,1])for(let i=0;i<3;i++){
    const points=[[side*.3,.3-i*.2,-.2],[side*(.7+i*.08),.5-i*.23,-.27],[side*(.82+i*.08),.82-i*.25,-.21]];
    rod(g,NEW.red,points[0],points[1],.055);rod(g,NEW.darkRed,points[1],points[2],.03);
  }
  if(name.startsWith('forearm'))for(let i=0;i<3;i++)panel(g,i%2?NEW.red:NEW.vein,[[-.07,-.4],[.07,-.4],[.02,-1.05]],.035,[(i-1)*.14,0,.24]);
}
function rockSurface(g,radii,center=[0,0,0],rows=5,columns=9){
  ell(g,NEW.rockDark,center,radii);
  for(let row=0;row<rows;row++){
    const latitude=-Math.PI*.42+(row+.5)/rows*Math.PI*.84;
    for(let col=0;col<columns;col++){
      const angle=(col+(row%2)*.5)/columns*Math.PI*2;
      const x=Math.cos(latitude)*Math.sin(angle),y=Math.sin(latitude),z=Math.cos(latitude)*Math.cos(angle);
      const mesh=add(g,rockGeometry,(row+col)%3?NEW.rock:NEW.rockLight,[center[0]+x*radii[0],center[1]+y*radii[1],center[2]+z*radii[2]],[radii[0]*.25,radii[1]/rows*.88,radii[2]*.25]);
      mesh.rotation.set(y*.4,angle,.12*Math.sin(col*3+row));
    }
  }
}
function thingPart(g,name,s){
  if(name==='torso'){
    rockSurface(g,[.52,.48,.39],[0,.02,0],6,11);
    box(g,NEW.blue,[0,-.43,0],[.87,.21,.68]);box(g,M.black,[0,-.36,.34],[.73,.04,.04]);
    ring(g,M.white,[0,-.4,.38],.067,.014);
  }else if(name==='head'){
    rockSurface(g,[.48,.45,.39],[0,.02,0],5,10);
    box(g,NEW.rockDark,[0,.02,.395],[.68,.11,.045]);
    for(const side of [-1,1]){box(g,M.white,[side*.19,.055,.43],[.15,.065,.035]);box(g,M.black,[side*.19,.055,.452],[.04,.05,.012]);ell(g,NEW.rock,[side*.19,.19,.4],[.25,.12,.1]);}
    box(g,NEW.rock,[0,-.07,.45],[.2,.17,.15]);box(g,NEW.rockDark,[0,-.24,.39],[.4,.035,.025]);
  }else{
    const lower=name.startsWith('forearm')||name.startsWith('shin');rockSurface(g,[.43,.45,.38],[0,.02,0],5,9);
    if(name.startsWith('upperArm'))rockSurface(g,[.53,.3,.45],[0,.3,0],3,8);
    if(name.startsWith('forearm')){rockSurface(g,[.44,.2,.36],[0,-.42,.12],3,8);for(let i=0;i<4;i++)ell(g,NEW.rockLight,[(i-1.5)*.18,-.43,.36],[.11,.12,.11]);}
    if(name.startsWith('thigh'))box(g,NEW.blue,[0,.32,0],[.78,.3,.69]);
    if(name.startsWith('shin'))rockSurface(g,[.45,.17,.52],[0,-.41,.2],3,8);
  }
}
function wolverinePart(g,name,s){
  if(name==='torso'){
    ell(g,NEW.blue,[0,.04,0],[.48,.48,.34]);
    for(const side of [-1,1]){
      ell(g,NEW.yellow,[side*.21,.18,.23],[.25,.31,.15]);
      panel(g,NEW.blue,[[side*.07,.4],[side*.35,.41],[side*.13,-.02]],.035,[0,0,.36]);
      box(g,NEW.blue,[side*.38,-.04,.12],[.18,.48,.35]);
      for(let i=0;i<3;i++)box(g,NEW.yellow,[side*.19,-.13-i*.075,.31],[.26,.055,.06]);
      box(g,NEW.leather,[side*.34,-.4,.24],[.17,.18,.16]);
    }
    box(g,NEW.redBelt,[0,-.34,.08],[.88,.1,.65]);cyl(g,M.gun,[0,-.34,.43],[.095,.035,.095],[Math.PI/2,0,0]);rod(g,NEW.redBelt,[-.045,-.385,.455],[.045,-.295,.455],.018);rod(g,NEW.redBelt,[-.045,-.295,.455],[.045,-.385,.455],.018);
  }else if(name==='head'){
    ell(g,NEW.yellow,[0,.04,0],[.46,.48,.4]);
    ell(g,NEW.skin,[0,-.21,.28],[.32,.23,.22]);
    for(const side of [-1,1]){
      panel(g,NEW.blue,[[side*.08,.12],[side*.42,.28],[side*.67,.75],[side*.48,-.19],[side*.24,-.2]],.07,[0,0,.31]);
      panel(g,M.white,[[side*.12,.09],[side*.36,.13],[side*.29,.015],[side*.13,.005]],.022,[0,0,.415]);
      box(g,NEW.hair,[side*.31,-.21,.27],[.08,.19,.11],[0,0,side*.13]);
    }
    ell(g,NEW.skin,[0,-.12,.48],[.08,.12,.08]);box(g,M.mouth,[0,-.29,.44],[.23,.035,.025]);
  }else if(name.startsWith('upperArm')){
    ell(g,NEW.skin,[0,-.07,0],[.4,.43,.34]);ell(g,NEW.skin,[0,-.12,.2],[.3,.28,.22]);
    ell(g,NEW.blue,[0,.33,0],[.53,.23,.43]);box(g,NEW.yellow,[0,.35,.31],[.63,.16,.16]);
    for(let i=0;i<3;i++)rod(g,NEW.leather,[s*.13+i*.045,-.19,.3],[s*.1+i*.045,.12,.3],.012);
  }else if(name.startsWith('forearm')){
    ell(g,NEW.skin,[0,.21,0],[.35,.28,.3]);box(g,NEW.blue,[0,-.11,0],[.64,.55,.58]);box(g,NEW.yellow,[0,.02,.31],[.45,.37,.07]);
    box(g,NEW.leather,[0,-.4,.07],[.61,.24,.5]);
    for(let i=0;i<3;i++){
      const x=(i-1)*.16;
      panel(g,NEW.claw,[[x-.018,-.44],[x+.018,-.44],[x+.01,-1.16],[x-.028,-1.31]],.024,[0,0,.3]);
      rod(g,M.gun,[x,-.43,.28],[x,-.32,.28],.032);
    }
  }else{
    ell(g,NEW.yellow,[0,.04,0],[.39,.48,.34]);
    box(g,NEW.blue,[s*.27,.04,.06],[.16,.65,.45]);
    if(name.startsWith('shin')){box(g,NEW.blue,[0,-.23,.1],[.72,.59,.66]);box(g,NEW.yellow,[0,.21,.32],[.5,.26,.12]);box(g,NEW.blue,[0,-.43,.27],[.75,.2,.82]);}
  }
}

export function createPart(type,partName,size=[1,1,1]){
  const g=new THREE.Group(); const s=partName.endsWith('L')?-1:1;let equipment={};
  if(type==='titan')equipment=titanPart(g,partName,s);
  else if(type==='carnage')carnagePart(g,partName,s);
  else if(type==='thing')thingPart(g,partName,s);
  else if(type==='wolverine')wolverinePart(g,partName,s);
  else if(type==='buster'){
    if(partName==='torso')busterTorso(g);else if(partName==='head')busterHead(g);
    else if(partName.includes('Arm')||partName.includes('forearm'))busterArm(g,partName.includes('forearm'),s);
    else busterLeg(g,partName.includes('shin'),s);
  }else if(type==='hulk'||type==='venom'){
    const venom=type==='venom';
    if(partName==='torso')muscleTorso(g,venom);else if(partName==='head')venom?venomHead(g):hulkHead(g);
    else if(partName.includes('Arm')||partName.includes('forearm'))organicArm(g,partName.includes('forearm'),s,venom);
    else organicLeg(g,partName.includes('shin'),s,venom);
  }else{
    if(partName==='torso')ultronTorso(g);else if(partName==='head')ultronHead(g);else ultronLimb(g,partName,s);
  }
  const armor=addRemovableArmor(g,type,partName);mergePart(g);g.scale.set(...size);g.name=`${type}-${partName}`;
  g.userData={type,partName,size:[...size],damageLevel:-1,wounds:new THREE.Group(),armor,...equipment};g.add(g.userData.wounds);
  return g;
}

export function setPartDamage(group,damageFraction,organic,bloodEnabled=true){
  const level=Math.min(4,Math.max(0,Math.floor(damageFraction*4.99)));
  const key=`${level}-${bloodEnabled}`;if(group.userData.damageLevel===key)return;group.userData.damageLevel=key;
  for(const [index,plate] of (group.userData.armor||[]).entries())plate.visible=level<index+2;
  const wounds=group.userData.wounds;if(!wounds)return;
  while(wounds.children.length){const child=wounds.children[0];wounds.remove(child);child.geometry?.dispose();}
  if(!level)return;
  for(let i=0;i<level;i++){
    const x=Math.sin(i*5.31+2)*.23,y=Math.cos(i*3.71+1)*.24,z=group.userData.partName==='head'?.42:.44;
    if(organic){
      ell(wounds,M.woundDark,[x,y,z],[.11+i*.008,.075,.014],[0,0,i*.7]);
      if(bloodEnabled){box(wounds,M.blood,[x,y,z+.015],[.13,.014,.012],[0,0,.7+i*.5]);rod(wounds,M.blood,[x+.025,y-.01,z+.012],[x+.014,y-.13,z+.008],.009);}
    }else{
      ell(wounds,M.black,[x,y,z],[.12,.085,.016]);
      rod(wounds,M.steel,[x-.06,y-.035,z+.023],[x+.07,y+.04,z+.023],.009);
      rod(wounds,M.gun,[x-.07,y+.04,z+.023],[x+.05,y-.025,z+.023],.012);
    }
  }
  mergePart(wounds);
}

export function createVeronica(){
  const g=new THREE.Group();
  cyl(g,M.redDark,[0,0,0],[1.15,.5,1.15]);cyl(g,M.red,[0,.23,0],[1,.23,1]);cyl(g,M.gold,[0,.36,0],[.74,.1,.74]);
  ell(g,M.gun,[0,.38,0],[.47,.22,.47]);cyl(g,M.gun,[0,.62,0],[.09,.7,.09]);ell(g,M.blue,[0,1,0],[.07,.07,.07]);
  const modules=[];
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,x=Math.cos(a)*1.35,z=Math.sin(a)*1.35;
    const pod=new THREE.Group();pod.position.set(x,0,z);pod.rotation.y=-a+Math.PI/2;
    box(pod,M.red,[0,0,0],[.7,.8,1.1]);box(pod,M.gold,[0,.3,.1],[.56,.15,.75]);box(pod,M.gun,[0,-.26,.05],[.58,.16,.9]);
    for(const s of [-1,1])rod(pod,M.steel,[s*.22,-.4,-.35],[s*.22,-.4,.3],.035);
    light(pod,[0,.05,.57],.09);mergePart(pod);g.add(pod);modules.push(pod);
    cyl(g,M.gun,[x*.72,-.36,z*.72],[.2,.27,.2]);cyl(g,M.blue,[x*.72,-.51,z*.72],[.145,.025,.145]);
    rod(g,M.gun,[Math.cos(a)*.68,0,Math.sin(a)*.68],[x,0,z],.11);
  }
  for(const s of [-1,1]){rod(g,M.gold,[s*.7,-.15,.6],[s*1.2,-.9,.9],.055);rod(g,M.gun,[s*1.2,-.9,.9],[s*.9,-1.2,1.1],.04);}
  mergePart(g);g.userData.modules=modules;g.name='veronica';return g;
}


// SUNDAY: an eight-module industrial delivery platform, distinct from Veronica.
// Module visibility is controlled by remaining physical repair stock in runtime.
export function createSunday(){
  const group=new THREE.Group();group.name='sunday';
  box(group,TITAN.deep,[0,0,0],[2.05,.68,1.55]);
  box(group,TITAN.plate,[0,.25,0],[1.84,.3,1.37]);
  box(group,TITAN.raised,[0,.44,0],[1.13,.13,.86]);
  cyl(group,M.gun,[0,.54,0],[.38,.16,.38]);
  cyl(group,TITAN.cyan,[0,.63,0],[.23,.025,.23]);
  const modules=[],redThrusters=[];
  for(let i=0;i<8;i++){
    const angle=i/8*Math.PI*2,x=Math.cos(angle)*1.6,z=Math.sin(angle)*1.42;
    const pod=new THREE.Group();pod.position.set(x,-.06,z);pod.rotation.y=-angle+Math.PI/2;
    box(pod,TITAN.deep,[0,0,0],[.64,.84,.96]);
    box(pod,TITAN.plate,[0,.1,.04],[.58,.58,.88]);
    box(pod,TITAN.raised,[0,.42,.04],[.55,.12,.82]);
    for(const side of [-1,1])rod(pod,M.gun,[side*.29,-.36,-.34],[side*.29,-.36,.34],.035);
    box(pod,TITAN.cyan,[0,.19,.5],[.29,.03,.018]);
    for(let j=0;j<3;j++)box(pod,M.black,[(j-1)*.13,-.15,.487],[.035,.22,.022]);
    mergePart(pod);group.add(pod);modules.push(pod);
    rod(group,TITAN.trim,[Math.cos(angle)*.7,0,Math.sin(angle)*.56],[x,0,z],.085);
  }
  for(const side of [-1,1]){
    box(group,TITAN.deep,[side*1.04,-.1,-.68],[.52,.5,.9]);
    redThrusters.push(titanThruster(group,[side*1.04,-.1,-1.2],.17));
    cyl(group,TITAN.deep,[side*.65,-.46,.45],[.25,.21,.25]);
    cyl(group,TITAN.exhaust,[side*.65,-.58,.45],[.16,.025,.16]);
    rod(group,M.gun,[side*.52,.41,-.32],[side*.7,1.05,-.49],.025);
    ell(group,TITAN.cyan,[side*.7,1.06,-.49],[.047,.047,.047]);
  }
  mergePart(group);group.userData={modules,redThrusters};return group;
}
