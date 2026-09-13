import * as T from 'three';
import {V,skinnedAnimal} from './rig.js';
import {height,terrainData,WATER,ITEMS,SPECIES,clamp,rng,LANDMARKS} from './data.js';
const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.92,...extra});
const wood=mat(0x6f5134),bark=mat(0x504637),leaf=mat(0x647e49),rock=mat(0x79887d),bone=mat(0xb8c3bb),fiber=mat(0x9baf70);
const boxGeo=new T.BoxGeometry(1,1,1),sphereGeo=new T.IcosahedronGeometry(1,1),cylinderGeo=new T.CylinderGeometry(1,1,1,8);
function mesh(g,m,p=[0,0,0],scale=[1,1,1],parent){let o=new T.Mesh(g,m);o.position.fromArray(p);o.scale.fromArray(scale);o.castShadow=true;o.receiveShadow=true;parent?.add(o);return o;}
function box(parent,p,scale,m){return mesh(boxGeo,m,p,scale,parent);}
function ell(parent,p,scale,m){return mesh(sphereGeo,m,p,scale,parent);}
function rod(parent,a,b,r,m){let start=V(...a),end=V(...b),o=mesh(cylinderGeo,m,start.clone().lerp(end,.5).toArray(),[r,start.distanceTo(end),r],parent);o.quaternion.setFromUnitVectors(V(0,1,0),end.sub(start).normalize());return o;}
export function itemModel(id,n=1){let g=new T.Group();
 if(id==='spear'){rod(g,[0,-.86,0],[0,.72,0],.035,wood);mesh(new T.ConeGeometry(.075,.27,4),bone,[0,.85,0],[1,1,1],g);for(let y of[.59,.63,.67])mesh(new T.TorusGeometry(.04,.012,4,8),fiber,[0,y,0],[1,1,1],g).rotation.x=Math.PI/2;}
 else if(id==='axe'){rod(g,[0,-.37,0],[0,.37,0],.045,wood);ell(g,[.1,.27,0],[.25,.15,.065],bone);for(let y of[.21,.27,.33])mesh(new T.TorusGeometry(.06,.018,4,8),fiber,[0,y,0],[1,1,1],g).rotation.x=Math.PI/2;}
 else if(id==='branch'){rod(g,[0,0,-.43],[0,0,.43],.047,wood);rod(g,[0,0,.14],[.16,.025,.3],.022,wood);}
 else if(id==='wood'||id==='plank')box(g,[0,0,0],id==='wood'?[.7,.24,.3]:[2,.24,.3],wood);
 else if(id==='stone')ell(g,[0,0,0],[.17,.13,.16],rock);
 else if(id==='fiber'){for(let i=0;i<5;i++)rod(g,[(i-2)*.03,-.06,-.13],[(i-2)*.03,.08,.13],.025,fiber);}
 else if(id==='berries'){for(let i=0;i<6;i++)ell(g,[Math.cos(i*2.4)*.075,i*.014,Math.sin(i*2.4)*.075],[.065,.065,.065],mat(0x9f5668));}
 else if(id==='mushroom'){rod(g,[0,-.11,0],[0,.08,0],.04,mat(0xd9cfb0));mesh(new T.SphereGeometry(.18,12,6,0,Math.PI*2,0,Math.PI/2),mat(0xd6a94b),[0,.07,0],[1,.55,1],g);}
 else if(id==='meal'){ell(g,[0,0,0],[.19,.07,.14],mat(0xb9773c));}
 else{box(g,[0,0,0],[.3,.2,.3],wood);rod(g,[-.17,.12,0],[.17,.12,0],.035,fiber);}
 return g;
}
function sign(text){let c=document.createElement('canvas');c.width=512;c.height=128;let ctx=c.getContext('2d');ctx.fillStyle='#283e32';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#9dae8b';ctx.lineWidth=3;ctx.strokeRect(8,8,496,112);ctx.fillStyle='#e3dec1';ctx.textAlign='center';ctx.font='500 31px sans-serif';ctx.fillText(text,256,76);let texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map:texture});}
export class View{
 constructor(canvas,sim,settings){
  this.sim=sim;this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new T.Scene();this.scene.background=new T.Color(0xa8c6b9);this.scene.fog=new T.FogExp2(0xa8c6b9,.014);
  this.camera=new T.PerspectiveCamera(70,innerWidth/innerHeight,.05,180);this.scene.add(this.camera);this.camera.rotation.order='YXZ';
  this.hemi=new T.HemisphereLight(0xd9ebda,0x57604a,2.05);this.scene.add(this.hemi);this.sun=new T.DirectionalLight(0xffe2aa,3.4);this.sun.position.set(-24,45,24);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:130});this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.04;this.scene.add(this.sun,this.sun.target);
  this.root=new T.Group();this.scene.add(this.root);this.objectMeshes=new Map();this.structureMeshes=new Map();this.treeMeshIndices=new Map();this.fx=[];
  this.buildTerrain();this.buildForest();this.buildLandmarks();this.buildTargets();
  for(let a of sim.animals){a.mesh=skinnedAnimal(a.rig);this.root.add(a.rig.group);}
  this.held=new T.Group();this.camera.add(this.held);this.heldItem=null;
  this.ghost=new T.Group();this.scene.add(this.ghost);this.ghostMat=mat(0xb7dc9c,{transparent:true,opacity:.28,depthWrite:false});this.ghostKind=null;
  this.buildWeather();this.resize();this.quality(settings.quality);this.lastEventTime=-1;
 }
 buildTerrain(){
  const td=terrainData(),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(td.positions,3));g.setIndex(new T.BufferAttribute(td.indices,1));g.computeVertexNormals();let colors=[];
  for(let i=0;i<td.positions.length;i+=3){let x=td.positions[i],y=td.positions[i+1],z=td.positions[i+2],noise=Math.sin(x*1.7+z*.93)*Math.cos(z*2.4)*.03,trail=Math.abs(x+Math.sin(z*.2)*2+5)<1.7&&z>-9&&z<20,shore=y<WATER+.48;let c=new T.Color(shore?0x89947a:trail?0x929776:0x687b4c);c.multiplyScalar(.94+noise+(y>4?.1:0));colors.push(c.r,c.g,c.b);}
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));this.terrain=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));this.terrain.receiveShadow=true;this.root.add(this.terrain);
  let wp=[],wi=[];for(let z=-13;z<23;z+=.7)for(let x=0;x<31;x+=.7)if(height(x,z)<WATER+.035){let i=wp.length/3;wp.push(x,WATER,z,x+.72,WATER,z,x,WATER,z+.72,x+.72,WATER,z+.72);wi.push(i,i+2,i+1,i+1,i+2,i+3);}
  let wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(wp,3));wg.setIndex(wi);wg.computeVertexNormals();
  this.waterMat=new T.ShaderMaterial({transparent:true,uniforms:{time:{value:0},tint:{value:new T.Color(0x70afa2)},light:{value:1}},vertexShader:'varying vec3 world; void main(){world=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 world;uniform float time;uniform float light;uniform vec3 tint;void main(){float wave=sin(world.x*2.4+time*.9+sin(world.z*2.1-time*.7))*.5+.5;float glint=pow(wave,28.);float caustic=pow(abs(sin(world.x*1.3+time*.2)*cos(world.z*1.1-time*.35)),14.);vec3 c=(tint+vec3(.30,.34,.23)*glint+caustic*.13)*light;gl_FragColor=vec4(c,.76);}' });this.water=new T.Mesh(wg,this.waterMat);this.root.add(this.water);
  let r=rng(442),count=2700,grass=new T.BufferGeometry(),gp=[-.035,0,0,.035,0,0,.012,.37,.02,-.025,0,-.03,.03,0,.03,-.1,.24,.04];grass.setAttribute('position',new T.Float32BufferAttribute(gp,3));grass.computeVertexNormals();this.grass=new T.InstancedMesh(grass,new T.MeshStandardMaterial({color:0x8b9a60,side:T.DoubleSide,roughness:1}),count);let dummy=new T.Object3D();
  for(let i=0;i<count;i++){let x=(r()-.5)*110,z=(r()-.5)*110,y=height(x,z);dummy.position.set(x,y-.02,z);let sc=y<WATER+.12?0:.7+r()*.9;dummy.scale.set(sc,sc,sc);dummy.rotation.y=r()*6.28;dummy.updateMatrix();this.grass.setMatrixAt(i,dummy.matrix);}this.root.add(this.grass);
  // Ferns are flexible foliage; all trunks and stones have solid physics shapes.
  let fernGeo=new T.ConeGeometry(.43,.35,5),ferns=new T.InstancedMesh(fernGeo,leaf,330);for(let i=0;i<330;i++){let x=(r()-.5)*103,z=(r()-.5)*103;dummy.position.set(x,height(x,z)+.15,z);dummy.scale.set(1,height(x,z)<WATER?0:1,1);dummy.rotation.set(0,r()*6,0);dummy.updateMatrix();ferns.setMatrixAt(i,dummy.matrix);}this.root.add(ferns);
  for(let r of this.sim.layout.rocks){let o=ell(this.root,[r.x,height(r.x,r.z)+r.sy*.5,r.z],[r.sx,r.sy,r.sz],rock);r.mesh=o;}
 }
 buildForest(){
  let trees=this.sim.layout.trees,dummy=new T.Object3D();this.trunks=new T.InstancedMesh(new T.CylinderGeometry(.23,.34,6,8),bark,trees.length);this.crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat(0x557348),trees.length*4);this.limbs=new T.InstancedMesh(cylinderGeo,bark,trees.length*2);
  this.trunks.castShadow=true;this.trunks.receiveShadow=true;this.crowns.castShadow=true;this.crowns.receiveShadow=true;
  trees.forEach((t,i)=>{let y=height(t.x,t.z),s=t.scale;dummy.position.set(t.x,y+3*s,t.z);dummy.rotation.set(0,t.seed*6.28,0);dummy.scale.set(s,s,s);dummy.updateMatrix();this.trunks.setMatrixAt(i,dummy.matrix);this.treeMeshIndices.set(t.id,i);
   for(let j=0;j<4;j++){let angle=j*2.4+t.seed*6;dummy.position.set(t.x+Math.cos(angle)*(j?1.5:0)*s,y+(6.5+(j%2)*.6)*s,t.z+Math.sin(angle)*(j?1.5:0)*s);dummy.scale.set((2.3+j*.17)*s,(1.75-j*.1)*s,(2+j*.15)*s);dummy.rotation.set(0,angle,0);dummy.updateMatrix();this.crowns.setMatrixAt(i*4+j,dummy.matrix);let col=new T.Color().setHSL(.24+t.seed*.025,.22+t.seed*.13,.25+t.seed*.09);this.crowns.setColorAt(i*4+j,col);}
   for(let j=0;j<2;j++){let a=V(t.x,y+3.9*s,t.z),b=V(t.x+Math.cos(t.seed*6+j*3)*1.8*s,y+5.7*s,t.z+Math.sin(t.seed*6+j*3)*1.8*s);dummy.position.copy(a).lerp(b,.5);dummy.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());dummy.scale.set(.12*s,a.distanceTo(b),.12*s);dummy.updateMatrix();this.limbs.setMatrixAt(i*2+j,dummy.matrix);}
  });this.root.add(this.trunks,this.crowns,this.limbs);
 }
 buildLandmarks(){
  for(let side of[-1,1])box(this.root,[-31+side*2.8,height(-31+side*2.8,-24)+2.6,-24],[2,5.2,2.5],rock);
  box(this.root,[-31,height(-31,-24)+5.1,-24],[8,2,2.8],rock);
  for(let i=0;i<5;i++)ell(this.root,[-32+i*.5,height(-31,-24)+6.25,-24],[.3,.14,.3],leaf);
  let post=new T.Group();post.position.set(-6,height(-6,14),14);rod(post,[0,0,0],[0,1.7,0],.07,wood);mesh(new T.PlaneGeometry(2.15,.54),sign('GLASSWATER  →'),[0,1.5,.08],[1,1,1],post);this.root.add(post);
  let rangeSign=new T.Group();rangeSign.position.set(-11,height(-11,1)+.55,1);mesh(new T.PlaneGeometry(3,.75),sign('THE OLD RANGE'),[0,.2,0],[1,1,1],rangeSign);rod(rangeSign,[-1,-.6,0],[-1,.6,0],.05,wood);rod(rangeSign,[1,-.6,0],[1,.6,0],.05,wood);this.root.add(rangeSign);
  // Distant terrain silhouettes sit outside the traversable valley boundary.
  let r=rng(728);for(let i=0;i<34;i++){let a=i/34*Math.PI*2,rad=83+r()*10;ell(this.root,[Math.cos(a)*rad,7+ r()*8,Math.sin(a)*rad],[9+r()*8,17+r()*15,12+r()*9],mat(i%2?0x788c7f:0x627b72));}
  this.fireflies=new T.Group();for(let i=0;i<22;i++){let a=i*2.4;let o=ell(this.fireflies,[32+Math.cos(a)*4,height(32,-30)+1+ i%3*.4,-30+Math.sin(a)*4],[.035,.035,.035],new T.MeshBasicMaterial({color:0xf0df9a}));o.userData.base=o.position.clone();}this.root.add(this.fireflies);
 }
 buildTargets(){for(let t of this.sim.targets){let p=t.p,y=height(p.x,p.z),g=new T.Group();g.position.copy(t.body.translation());let color=t.material==='soft'?0xb9a475:t.material==='wood'?0x946b43:0x84948c;box(g,[0,0,0],[1.64,1.64,t.material==='wood'?.2:.28],mat(color));for(let [i,c]of [0xded5b0,0x63795d,0xe0d7b4,0xb46e45].entries())mesh(new T.CylinderGeometry(.71-i*.16,.71-i*.16,.012,32),mat(c),[0,0,.155+i*.006],[1,1,1],g).rotation.x=Math.PI/2;this.root.add(g);t.mesh=g;
  box(this.root,[p.x-1.03,y+1.6,p.z],[.2,3.2,.24],wood);box(this.root,[p.x,y+3.25,p.z],[2.36,.2,.24],wood);mesh(new T.PlaneGeometry(2,.5),sign(t.material==='soft'?'WOVEN / LODGE':t.material==='wood'?'TIMBER / SWING':'STONE / DEFLECT'),[p.x,y+3.65,p.z],[1,1,1],this.root);
 }}
 structureModel(s,preview=false){let g=new T.Group(),m=preview?this.ghostMat:wood,thatch=preview?m:mat(0x94a168);g.position.copy(s.p);g.rotation.y=s.yaw;
  if(s.kind==='shelter'){for(let x of[-2,2])for(let z of[-1.5,1.5])rod(g,[x,0,z],[x,z<0?2.9:2,z],.11,m);let roof=box(g,[0,2.5,0],[4.6,.24,3.8],thatch);roof.rotation.x=-.29;box(g,[0,.85,-1.5],[4,1.7,.18],thatch);for(let x=-1.8;x<=1.8;x+=.3)rod(g,[x,1.2,-1.54],[x,2,-1.54],.018,m);box(g,[0,.045,0],[2.2,.07,1.3],preview?m:mat(0xaaa877));}
  else if(s.kind==='chest'){box(g,[0,.4,0],[1.3,.8,.84],m);for(let x of[-.5,.5])box(g,[x,.4,0],[.08,.86,.9],preview?m:bark);box(g,[0,.54,.435],[.15,.15,.03],preview?m:bone);}
  else if(s.kind==='campfire'){for(let i=0;i<9;i++){let a=i/9*6.28;ell(g,[Math.cos(a)*.53,.15,Math.sin(a)*.53],[.19,.17,.18],preview?m:rock);}for(let i=0;i<3;i++){let log=box(g,[0,.21+i*.07,0],[.85,.15,.17],m);log.rotation.y=i*2.1;}if(!preview){let flame=mesh(new T.ConeGeometry(.28,.65,7),new T.MeshBasicMaterial({color:0xf6b35e,transparent:true,opacity:.88}),[0,.61,0],[1,1,1],g);let ember=mesh(new T.ConeGeometry(.17,.42,5),new T.MeshBasicMaterial({color:0xffe49c}),[0,.49,0],[1,1,1],g);g.userData.flame=flame;g.userData.ember=ember;g.userData.light=new T.PointLight(0xffb15b,0,10,2);g.userData.light.position.set(0,.8,0);g.add(g.userData.light);}}
  else box(g,[0,.4,0],[2,.24,.3],m);return g;
 }
 buildWeather(){let pos=[],r=rng(818);for(let i=0;i<500;i++){let x=(r()-.5)*28,y=r()*16,z=(r()-.5)*28;pos.push(x,y,z,x-.07,y+.42,z);}let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));this.rain=new T.LineSegments(g,new T.LineBasicMaterial({color:0xc9e1d8,transparent:true,opacity:.25}));this.scene.add(this.rain);}
 quality(q){this.renderer.setPixelRatio(q==='low'?1:Math.min(devicePixelRatio,q==='high'?2:1.5));this.renderer.shadowMap.enabled=q!=='low';this.grass.visible=q!=='low';this.renderer.setSize(innerWidth,innerHeight);}
 resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
 setHeld(id){if(id===this.heldItem)return;this.held.clear();this.heldItem=id;if(!['spear','axe','branch','stone','berries','meal','mushroom'].includes(id))return;let obj=itemModel(id);obj.scale.setScalar(id==='spear'?.76:1);obj.rotation.set(-.35,0,-.35);this.held.add(obj);let hand=ell(this.held,[0,-.18,0],[.075,.11,.06],mat(0xb6a083));hand.castShadow=false;this.held.traverse(o=>{o.frustumCulled=false;o.castShadow=false;});}
 showGhost(kind,p,yaw,ok){if(kind!==this.ghostKind){this.ghost.clear();this.ghostKind=kind;if(kind)this.ghost.add(this.structureModel({kind,p:V(),yaw:0},true));}this.ghost.visible=!!kind;this.ghost.position.copy(p);this.ghost.rotation.y=yaw;this.ghostMat.color.set(ok?0xbcdc9f:0xd0816e);}
 update(dt,{playing,yaw,pitch,charge=0,swing=0,menuTime=0}){
  let sim=this.sim,time=sim.time,cycle=time%720,sunlight=cycle<80?.55+cycle/80*.45:cycle<460?1:cycle<550?1-(cycle-460)/90*.83:.17;
  if(sim.rain)sunlight*=.75;let day=new T.Color(0xb3cabe),night=new T.Color(0x233e44);this.scene.background.copy(night).lerp(day,sunlight);this.scene.fog.color.copy(this.scene.background);this.scene.fog.density=sim.rain?.024:.013;
  this.hemi.intensity=.35+sunlight*1.7;this.sun.intensity=.22+sunlight*3.0;this.sun.color.set(sim.phase==='Dusk'?0xffc17f:0xffe5b3);this.waterMat.uniforms.time.value=sim.elapsed+menuTime;this.waterMat.uniforms.light.value=.28+sunlight*.72;
  if(playing){let p=sim.position,v=sim.player.linvel(),speed=Math.hypot(v.x,v.z),bob=Math.sin(sim.elapsed*9)*.018*Math.min(1,speed/3);this.camera.position.set(p.x,p.y+(sim.input.crouch?.34:.76)+bob,p.z);this.camera.rotation.set(pitch,yaw,0);this.sun.position.set(p.x-24,45,p.z+24);this.sun.target.position.set(p.x,0,p.z);this.setHeld(sim.inv.slots[sim.selected]?.id);this.held.visible=true;this.held.position.set(.39,-.43-charge*.05-Math.sin(swing*Math.PI)*.17,-.62+charge*.23);this.held.rotation.set(charge*.7-Math.sin(swing*Math.PI)*1.3,0,-charge*.12);}
  else{this.held.visible=false;let t=menuTime*.018;this.camera.position.set(4+Math.sin(t)*2,4.2,24+Math.cos(t)*1.5);this.camera.lookAt(8,.7,-4);}
  for(let t of sim.targets){t.mesh.position.copy(t.body.translation());t.mesh.quaternion.copy(t.body.rotation());}
  let dummy=new T.Object3D();for(let t of sim.layout.trees)if(t.hp<=0&&!t.hidden){t.hidden=true;let i=this.treeMeshIndices.get(t.id);dummy.scale.set(0,0,0);dummy.updateMatrix();this.trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<4;j++)this.crowns.setMatrixAt(i*4+j,dummy.matrix);for(let j=0;j<2;j++)this.limbs.setMatrixAt(i*2+j,dummy.matrix);this.trunks.instanceMatrix.needsUpdate=this.crowns.instanceMatrix.needsUpdate=this.limbs.instanceMatrix.needsUpdate=true;}
  for(let o of sim.objects){let m=this.objectMeshes.get(o.id);if(!m){m=itemModel(o.item,o.n);this.objectMeshes.set(o.id,m);this.root.add(m);}m.position.copy(o.body.translation());m.quaternion.copy(o.body.rotation());}
  let ids=new Set(sim.objects.map(o=>o.id));for(let[id,m]of this.objectMeshes)if(!ids.has(id)){this.root.remove(m);this.objectMeshes.delete(id);}
  for(let s of sim.structures){let m=this.structureMeshes.get(s.id);if(!m){m=this.structureModel(s);this.structureMeshes.set(s.id,m);this.root.add(m);}if(s.kind==='campfire'){m.userData.flame.visible=m.userData.ember.visible=s.fuel>0;m.userData.flame.scale.set(1+Math.sin(sim.elapsed*17)*.08,1+Math.sin(sim.elapsed*13)*.17,1);m.userData.light.intensity=s.fuel>0?6+Math.sin(sim.elapsed*12)*.5:0;}}
  let sids=new Set(sim.structures.map(s=>s.id));for(let[id,m]of this.structureMeshes)if(!sids.has(id)){this.root.remove(m);this.structureMeshes.delete(id);}
  this.rain.visible=sim.rain;this.rain.position.set(this.camera.position.x,this.camera.position.y-4-(sim.elapsed*8)%5,this.camera.position.z);
  for(let o of this.fireflies.children){o.position.y=o.userData.base.y+Math.sin(menuTime*1.5+o.id)*.18;}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{if(o.geometry&&!['BoxGeometry','IcosahedronGeometry','CylinderGeometry'].includes(o.geometry.type))o.geometry.dispose();});this.renderer.dispose();}
}
