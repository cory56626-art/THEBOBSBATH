import * as T from 'three';
import {SPECIES,clamp,height} from './data.js';
export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const qx=x=>new T.Quaternion().setFromAxisAngle(V(1,0,0),x);
export function makeRig(species){
 const s=SPECIES[species],group=new T.Group(),bones=[],parts=[],legs=[],volumes=[];
 function bone(name,parent,pos){let b=new T.Bone();b.name=name;b.position.fromArray(pos);(parent||group).add(b);b.userData.index=bones.length;bones.push(b);return b;}
 const root=bone('body',null,[0,s.height,0]),neck=bone('neck',root,[0,.08,-s.length*.69]),head=bone('head',neck,[0,species==='deer'?.43:species==='chimp'?.36:.12,-.24]);
 function part(b,offset,scale,color=s.color,shape='ellipsoid'){parts.push({bone:b,offset,scale,color,shape});}
 part(root,[0,0,0],[s.width,species==='chimp'?.52:.39,s.length]);
 part(neck,[0,species==='deer'?.2:.09,-.05],[s.width*.64,species==='deer'?.42:.34,.39]);
 part(head,[0,0,-.06],species==='chimp'?[.31,.34,.28]:species==='deer'?[.21,.26,.37]:[.33,.27,.35]);
 part(head,[0,-.06,-.28],species==='chimp'?[.23,.17,.18]:[species==='deer'?.14:.25,.14,.21],species==='chimp'?0x958774:species==='deer'?0xbda887:0xe0c592);
 part(head,[0,-.025,-.51],[.1,.075,.055],0x272e29);
 for(let side of[-1,1]){
   part(head,[side*(species==='deer'?.16:.25),.22,-.01],species==='deer'?[.115,.26,.09]:[.11,.12,.07],species==='chimp'?0x8a806d:s.color);
   part(head,[side*(species==='chimp'?.12:species==='deer'?.18:.245),.09,species==='chimp'?-.33:-.27],[.045,.042,.035],0x111a17);
   part(head,[side*(species==='chimp'?.12:species==='deer'?.18:.245),.10,species==='chimp'?-.36:-.298],[.012,.013,.009],0xd9d5a3);
   if(species==='chimp')part(head,[side*.115,.07,-.253],[.14,.16,.055],0x9b907f);
 }
 for(let side of[-1,1])for(let front of[true,false]){
   let L1=species==='chimp'?(front?.51:.42):s.height*.44,L2=species==='chimp'?(front?.51:.5):s.height*.49;
   let hip=bone((front?'fore':'hind')+side,root,[side*s.width*.82,-.06,front?-s.length*.65:s.length*.64]);
   let knee=bone('joint',hip,[0,-L1,0]),foot=bone('foot',knee,[0,-L2,0]);
   let thick=species==='chimp'?(front?.145:.2):front?.14:.19;
   part(hip,[0,-L1*.42,.025],[thick,L1*.66,thick]);part(knee,[0,-L2*.48,0],[thick*.67,L2*.64,thick*.7]);
   part(foot,[0,-.025,-.06],[species==='chimp'?.14:.115,.095,.18],species==='deer'?0x39362c:species==='chimp'?0x51564b:s.color);
   legs.push({hip,knee,foot,L1,L2,side,front,phase:(side===1?Math.PI:0)+(front?0:Math.PI),contact:0});
 }
 if(species==='jaguar'){
   let b=root;for(let i=0;i<7;i++){b=bone('tail'+i,b,[0,i===0?.04:0,i===0?s.length*.85:.23]);part(b,[0,0,.11],[.085-i*.006,.085-i*.006,.2]);}
 }else if(species==='deer')part(root,[0,.12,s.length*.94],[.09,.13,.23],0xd1c4aa);
 // Fictional, hidden response volumes; not a biological model or a targeting guide.
 volumes.push({bone:root,offset:V(),r:V(s.width,.38,s.length),layer:'outer',resistance:9});
 volumes.push({bone:head,offset:V(0,0,-.07),r:V(.3,.28,.34),layer:'outer',resistance:9});
 volumes.push({bone:root,offset:V(0,.14,0),r:V(.12,.11,s.length*.8),layer:'frame',resistance:85});
 volumes.push({bone:root,offset:V(0,.01,-s.length*.22),r:V(s.width*.68,.24,s.length*.37),layer:'vital',resistance:16});
 volumes.push({bone:root,offset:V(0,-.08,s.length*.38),r:V(s.width*.68,.19,s.length*.28),layer:'reserve',resistance:13});
 for(let l of legs){volumes.push({bone:l.hip,offset:V(0,-l.L1*.5,0),r:V(.16,l.L1*.62,.16),layer:'outer',resistance:9},{bone:l.hip,offset:V(0,-l.L1*.5,0),r:V(.06,l.L1*.48,.06),layer:'frame',resistance:55});}
 group.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
 return {species,group,bones,root,neck,head,legs,parts,volumes,skeleton};
}
export function poseRig(r,a,t){
 let s=SPECIES[r.species],p=a.body.translation(),vel=a.body.linvel(),speed=Math.hypot(vel.x,vel.z),rest=a.state==='rest'||a.state==='down';
 r.group.position.set(p.x,p.y-a.clearance,p.z);r.group.rotation.y=a.yaw;
 if(a.state==='dead'){r.root.position.y=.36;r.root.rotation.set(0,0,Math.PI/2);r.neck.rotation.x=.25;for(let l of r.legs){l.hip.rotation.x=.55;l.knee.rotation.x=-1.1;l.foot.rotation.x=.2;}r.group.updateMatrixWorld(true);r.skeleton.update();return;}
 r.root.position.y=s.height-(rest?.26:0)+Math.sin(a.gait*2)*Math.min(.025,speed*.012);
 r.root.rotation.z=clamp(a.recoil||0,-.19,.19);r.root.rotation.x=clamp((height(p.x-Math.sin(a.yaw)*.5,p.z-Math.cos(a.yaw)*.5)-height(p.x+Math.sin(a.yaw)*.5,p.z+Math.cos(a.yaw)*.5))*.55,-.22,.22);
 r.neck.rotation.x=a.state==='drink'||a.state==='graze'?.7:rest?.23:Math.sin(t*.8)*.035;
 r.head.rotation.y=clamp(a.look||0,-.65,.65);r.head.rotation.x=a.attackTime>0?-.2*Math.sin(a.attackTime*9):0;
 r.group.updateMatrixWorld(true);
 for(let l of r.legs){
   let phase=a.gait+l.phase,stride=Math.min(.48,speed*.12),lift=speed>.1?Math.max(0,Math.sin(phase))*.19:0;
   let local=V(l.hip.position.x,0,l.hip.position.z+Math.cos(phase)*stride),world=r.group.localToWorld(local.clone());
   let ground=height(world.x,world.z)-r.group.position.y+.075+lift;
   let dy=ground-(r.root.position.y+l.hip.position.y),dz=local.z-l.hip.position.z;
   let d=clamp(Math.hypot(dy,dz),.22,l.L1+l.L2-.008),theta=Math.atan2(-dz,-dy),sign=l.front?1:-1;
   let alpha=Math.acos(clamp((l.L1*l.L1+d*d-l.L2*l.L2)/(2*l.L1*d),-1,1));
   let knee=Math.PI-Math.acos(clamp((l.L1*l.L1+l.L2*l.L2-d*d)/(2*l.L1*l.L2),-1,1));
   l.hip.rotation.x=clamp(theta-sign*alpha,-1.15,1.15);l.knee.rotation.x=clamp(sign*knee,-1.75,1.75);l.foot.rotation.x=clamp(-l.hip.rotation.x-l.knee.rotation.x,-.7,.7);l.contact=lift<.03?1:0;
 }
 for(let b of r.bones)if(b.name.startsWith('tail')){let i=+b.name.slice(4);b.rotation.y=Math.sin(t*1.8-i*.5)*.12;b.rotation.x=-.06+Math.sin(t-i*.3)*.07;}
 r.group.updateMatrixWorld(true);r.skeleton.update();
}
export function skinnedAnimal(r){
 const positions=[],normals=[],colors=[],indices=[],weights=[],skin=[];let count=0;
 r.group.updateMatrixWorld(true);
 for(const p of r.parts){
   const g=new T.SphereGeometry(1,12,8),base=new T.Matrix4().compose(V(...p.offset),new T.Quaternion(),V(...p.scale));
   const m=p.bone.matrixWorld.clone().premultiply(r.group.matrixWorld.clone().invert()).multiply(base),nm=new T.Matrix3().getNormalMatrix(m),col=new T.Color(p.color);
   const pos=g.attributes.position,nor=g.attributes.normal;
   for(let i=0;i<pos.count;i++){let v=V().fromBufferAttribute(pos,i).applyMatrix4(m),n=V().fromBufferAttribute(nor,i).applyMatrix3(nm).normalize();positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);let shade=1;
     if(r.species==='jaguar'&&p.color===SPECIES.jaguar.color){let a=Math.sin(v.x*29+Math.sin(v.z*7)*2)*Math.cos(v.z*22+Math.sin(v.y*11))*Math.sin(v.y*28);if(a>.30)shade=.29;else if(a>.17)shade=.60;}
     colors.push(col.r*shade,col.g*shade,col.b*shade);skin.push(p.bone.userData.index,0,0,0);weights.push(1,0,0,0);
   }
   for(let i of g.index.array)indices.push(i+count);count+=pos.count;g.dispose();
 }
 let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(skin,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));g.setIndex(indices);
 let mesh=new T.SkinnedMesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:.92}));mesh.add(r.root);r.group.add(mesh);mesh.bind(r.skeleton);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
// Analytic continuous segment/ellipsoid intersection in the animated bone frame.
export function volumeHit(volume,start,end,padding=0){let radius=volume.r.clone().addScalar(padding),m=volume.bone.matrixWorld,inv=m.clone().invert(),a=start.clone().applyMatrix4(inv).sub(volume.offset).divide(radius),b=end.clone().applyMatrix4(inv).sub(volume.offset).divide(radius),d=b.clone().sub(a);let A=d.lengthSq(),B=2*a.dot(d),C=a.lengthSq()-1,D=B*B-4*A*C;if(D<0||A<1e-12)return null;let t0=(-B-Math.sqrt(D))/(2*A),t1=(-B+Math.sqrt(D))/(2*A);if(t1<0||t0>1)return null;let f=Math.max(0,t0),point=start.clone().lerp(end,f),normal=a.addScaledVector(d,f).divide(radius).transformDirection(m);return {f,point,normal,exit:Math.min(1,t1),volume};}
