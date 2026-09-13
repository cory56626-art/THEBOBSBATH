import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {DT,SIZE,WATER,SAVE_VERSION,height,terrainData,worldLayout,rng,clamp,Inventory,ITEMS,SPECIES,LANDMARKS} from './data.js';
import {V,makeRig,poseRig,volumeHit} from './rig.js';
export {RAPIER};
let initialized;
export async function initPhysics(){if(!initialized)initialized=RAPIER.init();await initialized;}
const Q=()=>new T.Quaternion(),vec=p=>V(p.x,p.y,p.z),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const GROUP={terrain:1,actor:2,object:4,anatomy:8};
const MATERIALS={soft:{resistance:7,bounce:.12},wood:{resistance:30,bounce:.2},stone:{resistance:400,bounce:.5},soil:{resistance:22,bounce:.08}};
export class Simulation{
 constructor(saved=null){
  this.world=new RAPIER.World({x:0,y:-18,z:0});this.world.timestep=DT;this.world.numSolverIterations=8;this.world.maxCcdSubsteps=4;
  this.random=rng(91872);this.time=220;this.elapsed=0;this.accumulator=0;this.nextID=1;this.messages=[];this.events=[];this.meta=new Map();this.objects=[];this.structures=[];this.animals=[];this.targets=[];this.progress={gather:false,axe:false,spear:false,throw:false,wildlife:false,shelter:false,cook:false,save:false};this.discovered=[];this.metrics={steps:0,sweeps:0,impacts:0,anatomy:0,attacks:0};this.input={x:0,z:0,sprint:false,crouch:false,jump:false};
  this.layout=worldLayout();this.inv=new Inventory(20);this.selected=0;this.stats={health:100,hunger:100,thirst:100,stamina:100,exposure:0};this.dead=false;
  const td=terrainData();this.ground=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());this.addCollider(RAPIER.ColliderDesc.trimesh(td.positions,td.indices).setFriction(.9),this.ground,{type:'terrain',material:'soil'});
  this.statics=[];
  for(let tree of this.layout.trees){let y=height(tree.x,tree.z);tree.body=this.staticShape(RAPIER.ColliderDesc.cylinder(3*tree.scale,.27*tree.scale),{x:tree.x,y:y+3*tree.scale,z:tree.z},{type:'tree',material:'wood',ref:tree});this.statics.push({x:tree.x,z:tree.z,r:.4*tree.scale,type:'tree',ref:tree});}
  for(let rock of this.layout.rocks){let g=new T.IcosahedronGeometry(1,1);g.scale(rock.sx,rock.sy,rock.sz);rock.body=this.staticShape(RAPIER.ColliderDesc.convexHull(g.attributes.position.array).setFriction(.9),{x:rock.x,y:height(rock.x,rock.z)+rock.sy*.5,z:rock.z},{type:'rock',material:'stone',ref:rock});g.dispose();this.statics.push({x:rock.x,z:rock.z,r:Math.max(rock.sx,rock.sz),type:'rock'});}
  // A solid, navigable stone arch, with an open passage through the centre.
  for(let side of[-1,1]){this.staticShape(RAPIER.ColliderDesc.cuboid(1,2.6,1.25),{x:-31+side*2.8,y:height(-31+side*2.8,-24)+2.6,z:-24},{type:'arch',material:'stone'});this.statics.push({x:-31+side*2.8,z:-24,r:1.4,type:'rock'});}
  this.staticShape(RAPIER.ColliderDesc.cuboid(4,1,1.4),{x:-31,y:height(-31,-24)+5.1,z:-24},{type:'arch',material:'stone'});
  this.makeTargets();
  this.player=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,height(0,16)+1,16).lockRotations().setLinearDamping(.5).setCcdEnabled(true).setCanSleep(false));
  this.playerCollider=this.addCollider(RAPIER.ColliderDesc.capsule(.5,.34).setMass(65).setFriction(0).setCollisionGroups(0x00020007),this.player,{type:'player',material:'soft'});
  if(!saved){for(let res of this.layout.resources)this.spawnObject(res.item,res.n,V(res.x,height(res.x,res.z)+.33,res.z),{id:res.id});}
  const spawn=[['deer',-7,2],['deer',13,-13],['deer',22,21],['jaguar',-27,-12],['chimp',29,-8]];
  for(let [species,x,z]of spawn)this.makeAnimal(species,x,z);
  if(saved)this.restore(saved);
  this.world.step();for(let a of this.animals)poseRig(a.rig,a,0);
 }
 addCollider(desc,body,meta){let c=this.world.createCollider(desc,body);this.meta.set(c.handle,meta);return c;}
 staticShape(desc,p,meta){let b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x,p.y,p.z));this.addCollider(desc,b,meta);return b;}
 removeBody(body){if(!body?.isValid())return;for(let i=0;i<body.numColliders();i++)this.meta.delete(body.collider(i).handle);this.world.removeRigidBody(body);}
 notify(message){this.messages.push({message,t:this.elapsed});if(this.messages.length>12)this.messages.shift();return false;}
 event(type,p,power=1){this.events.push({type,p:{...p},power,t:this.elapsed});}
 get day(){return Math.floor(this.time/720)+1;}
 get phase(){let t=this.time%720;return t<100?'Dawn':t<450?'Day':t<530?'Dusk':'Night';}
 get rain(){return (this.time%1040)>600&&(this.time%1040)<850;}
 get position(){return this.player.translation();}
 get sheltered(){let p=this.position;return this.structures.some(s=>s.kind==='shelter'&&dist(s.p,p)<2.1);}
 makeTargets(){
  for(let [i,material]of ['soft','wood','stone'].entries()){
   let x=-16+i*3.8,z=-6,y=height(x,z),target={id:'target'+i,material,p:V(x,y+1.6,z),hits:0,moving:i===1};
   let anchor=this.staticShape(RAPIER.ColliderDesc.cuboid(.1,1.6,.12),{x:x-1.03,y:y+1.6,z},{type:'stand',material:'wood'});
   this.staticShape(RAPIER.ColliderDesc.cuboid(1.18,.1,.12),{x,y:y+3.25,z},{type:'stand',material:'wood'});
   if(target.moving){target.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y+1.65,z).setLinearDamping(.4).setAngularDamping(.6).setAdditionalSolverIterations(4));this.addCollider(RAPIER.ColliderDesc.cuboid(.82,.82,.1).setMass(5),target.body,{type:'target',material,ref:target});let joint=RAPIER.JointData.revolute({x:1.03,y:1.6,z:0},{x:0,y:1.55,z:0},{x:1,y:0,z:0});target.joint=this.world.createImpulseJoint(joint,anchor,target.body,true);target.joint.setLimits(-.6,.6);target.joint.setContactsEnabled(false);}
   else target.body=this.staticShape(RAPIER.ColliderDesc.cuboid(.82,.82,.14),{x,y:y+1.6,z},{type:'target',material,ref:target});
   this.targets.push(target);this.statics.push({x,z,r:1.2,type:'target'});
  }
 }
 makeAnimal(species,x,z){
  let s=SPECIES[species],clearance=.72,a={id:'animal'+this.animals.length,species,clearance,home:{x,z},yaw:0,gait:0,look:0,state:'roam',stateAge:0,target:{x:x+4,z:z-3},health:100,fatigue:0,thirst:20+this.random()*30,alert:0,recoil:0,attackTime:0,cooldown:0,attackHit:false,brainTimer:0,navSide:1};
  a.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,height(x,z)+clearance+.1,z).lockRotations().setLinearDamping(.5).setCcdEnabled(true).setCanSleep(false));
  this.addCollider(RAPIER.ColliderDesc.capsule(.25,.46).setMass(s.mass).setFriction(.1).setCollisionGroups(0x00020007),a.body,{type:'animal',material:'soft',ref:a});
  a.rig=makeRig(species);a.sensors=[];
  for(let vol of a.rig.volumes){let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());let collider=this.addCollider(RAPIER.ColliderDesc.cuboid(vol.r.x,vol.r.y,vol.r.z).setSensor(true).setCollisionGroups(0x00080000),body,{type:'anatomy',ref:a,volume:vol});a.sensors.push({body,collider,volume:vol});}
  this.animals.push(a);return a;
 }
 spawnObject(item,n,p,opts={}){
  if(this.objects.length>=180)return null;let def=ITEMS[item];
  let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.2).setAngularDamping(.8).setCcdEnabled(true));
  let shape=item==='spear'?RAPIER.ColliderDesc.capsule(.82,.045):item==='branch'?RAPIER.ColliderDesc.cuboid(.055,.055,.43):item==='wood'||item==='plank'?RAPIER.ColliderDesc.cuboid(item==='plank'?1:.35,.12,.15):RAPIER.ColliderDesc.ball(item==='stone'?.16:.12);
  shape.setMass(def.mass*n).setFriction(item==='stone'?.85:.65).setRestitution(item==='stone'?.18:.08).setCollisionGroups(opts.projectile?0x00040005:0x00040007);
  let o={id:opts.id||'drop'+this.nextID++,item,n,body,projectile:!!opts.projectile,age:0,attachment:null,hitLayers:[],lastTip:p.clone()};
  o.collider=this.addCollider(shape,body,{type:'object',material:def.material,ref:o});
  if(opts.rotation)body.setRotation(opts.rotation,true);else if(item==='spear')body.setRotation(Q().setFromAxisAngle(V(1,0,0),Math.PI/2),true);
  if(opts.velocity)body.setLinvel(opts.velocity,true);if(opts.angular)body.setAngvel(opts.angular,true);
  this.objects.push(o);return o;
 }
 removeObject(o){this.removeBody(o.body);this.objects=this.objects.filter(x=>x!==o);o.removed=true;}
 gather(o){
  if(!this.objects.includes(o)||dist(o.body.translation(),this.position)>3.8)return this.notify('Move closer to recover that.');
  if(!this.inv.add(o.item,o.n))return this.notify('Your pack is full. Drop or store a stack.');
  this.removeObject(o);this.progress.gather=true;this.notify(`+${o.n} ${ITEMS[o.item].name}`);this.event('gather',this.position);return true;
 }
 craft(id){let result=this.inv.craft(id);if(result.ok){if(id==='axe'||id==='spear')this.progress[id]=true;let slot=this.inv.slots.findIndex(s=>s?.id===id);if(slot>=0)this.selected=slot;this.event('craft',this.position);}this.notify(result.message);return result.ok;}
 drop(index=this.selected,all=false){let slot=this.inv.slots[index];if(!slot)return this.notify('That slot is empty.');let p=this.position,n=all?slot.n:1,o=this.spawnObject(slot.id,n,V(p.x,p.y+.45,p.z-1),{velocity:V(0,1,-1)});if(!o)return this.notify('Too many loose objects nearby. Recover or store some first.');this.inv.remove(slot.id,n);return o;}
 consume(index=this.selected){let slot=this.inv.slots[index];if(!slot||!ITEMS[slot.id].food)return this.notify('Select food in your pack first.');this.stats.hunger=clamp(this.stats.hunger+ITEMS[slot.id].food,0,100);this.stats.health=clamp(this.stats.health+3,0,100);this.inv.remove(slot.id,1);this.event('eat',this.position);this.notify('A little better.');return true;}
 drink(){if(height(this.position.x,this.position.z)>WATER+.8||dist(this.position,{x:15,z:5})>15)return this.notify('Get closer to the water’s edge.');this.stats.thirst=100;this.event('drink',this.position);this.notify('Freshwater. Thirst restored.');return true;}
 chop(tree){if(!tree||tree.hp<=0||dist(tree,this.position)>3.5)return this.notify('Move closer to a tree.');if(this.inv.slots[this.selected]?.id!=='axe')return this.notify('Equip a stone hatchet to harvest wood.');if(this.stats.stamina<10)return this.notify('Catch your breath before swinging.');if(this.chopCooldown>0)return false;this.chopCooldown=.6;this.stats.stamina-=10;tree.hp--;this.event('chop',tree,2);this.notify(tree.hp?`Chopping wood · ${4-tree.hp}/4`:'Timber! Recover the fallen wood.');if(tree.hp===0){this.removeBody(tree.body);tree.body=null;this.statics=this.statics.filter(s=>s.ref!==tree);for(let i=0;i<3;i++)this.spawnObject(i===2?'branch':'wood',i===2?3:4,V(tree.x+(i-1)*.6,height(tree.x,tree.z)+1.3,tree.z),{velocity:V((i-1)*1.4,1,1)});}return true;}
 placement(kind,p,yaw=0){
  if(!ITEMS[kind]?.build)return {ok:false,message:'Select a building kit.'};if(dist(this.position,p)>6)return {ok:false,message:'Place within reach.'};
  let y=height(p.x,p.z),r=kind==='shelter'?2.4:kind==='plank'?1.1:.8;
  if(y<WATER+.22)return {ok:false,message:'The ground is too wet to build here.'};
  if(Math.abs(p.x)>52||Math.abs(p.z)>52)return {ok:false,message:'Find level ground inside the valley.'};
  if(kind!=='plank'&&[-1,1].some(a=>[-1,1].some(b=>Math.abs(height(p.x+a*r,p.z+b*r)-y)>.7)))return {ok:false,message:'This slope is too steep. Try the clearing.'};
  if(this.statics.some(o=>dist(o,p)<o.r+r*.72)||this.structures.some(o=>dist(o.p,p)<(o.kind==='shelter'?2.6:1)+r*.75)||dist(this.position,p)<r+.45)return {ok:false,message:'Placement blocked. Leave space around the structure.'};
  if(this.animals.some(a=>dist(a.body.translation(),p)<r+.65))return {ok:false,message:'An animal is in the way.'};return {ok:true,p:V(p.x,y,p.z),yaw};
 }
 place(kind,p,yaw=0){let check=this.placement(kind,p,yaw);if(!check.ok)return this.notify(check.message);if(this.inv.count(kind)<1)return this.notify('Craft that kit first.');
  if(kind==='plank'){let o=this.spawnObject('plank',1,check.p.clone().add(V(0,1,0)),{rotation:Q().setFromAxisAngle(V(0,1,0),yaw)});if(!o)return this.notify('Recover some loose objects first.');}else this.makeStructure(kind,check.p,yaw);
  this.inv.remove(kind);if(kind==='shelter')this.progress.shelter=true;this.event('build',p);this.notify(kind==='plank'?'Timber released.':`${ITEMS[kind].name.replace(' kit','')} placed.`);return true;
 }
 makeStructure(kind,p,yaw=0,id=null){
  let s={id:id||'structure'+this.nextID++,kind,p:vec(p),yaw,fuel:0,cooking:0,cooked:0,storage:new Inventory(12),bodies:[]};
  let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x,p.y,p.z).setRotation(Q().setFromAxisAngle(V(0,1,0),yaw)));s.body=body;s.bodies.push(body);
  const add=(desc)=>this.addCollider(desc,body,{type:'structure',material:kind==='campfire'?'stone':'wood',ref:s});
  if(kind==='shelter'){
   for(let x of[-2,2])for(let z of[-1.5,1.5])add(RAPIER.ColliderDesc.cuboid(.11,z<0?1.45:1,.11).setTranslation(x,z<0?1.45:1,z));
   add(RAPIER.ColliderDesc.cuboid(2,.85,.09).setTranslation(0,.85,-1.5));
   let rotation=Q().setFromAxisAngle(V(0,1,0),yaw).multiply(Q().setFromAxisAngle(V(1,0,0),-.29));
   let roof=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y+2.5,p.z).setRotation(rotation).setAdditionalSolverIterations(4));
   this.addCollider(RAPIER.ColliderDesc.cuboid(2.3,.12,1.9).setMass(25),roof,{type:'structure',material:'wood',ref:s});s.bodies.push(roof);
   this.world.createImpulseJoint(RAPIER.JointData.fixed({x:0,y:2.5,z:0},Q().setFromAxisAngle(V(1,0,0),-.29),V(),Q()),body,roof,true).setContactsEnabled(false);
  }else add(kind==='chest'?RAPIER.ColliderDesc.cuboid(.65,.4,.42).setTranslation(0,.4,0):RAPIER.ColliderDesc.cylinder(.18,.7).setTranslation(0,.18,0));
  this.structures.push(s);return s;
 }
 dismantle(s){if(!this.structures.includes(s)||dist(s.p,this.position)>4)return this.notify('Move closer to dismantle.');if(s.cooking||s.cooked||s.storage.slots.some(Boolean))return this.notify('Empty the storage or cooking contents first.');if(!this.inv.add(s.kind))return this.notify('Make room in your pack first.');for(let o of this.objects)if(o.attachment?.structure===s.id)this.release(o);for(let b of s.bodies)this.removeBody(b);this.structures=this.structures.filter(x=>x!==s);s.removed=true;this.notify('Kit recovered.');return true;}
 fuel(s){if(s.kind!=='campfire'||dist(s.p,this.position)>4)return false;let id=this.inv.count('wood')?'wood':this.inv.count('branch')?'branch':null;if(!id)return this.notify('Add wood or a branch to light the campfire.');if(s.fuel>210)return this.notify('The campfire has enough fuel.');this.inv.remove(id);s.fuel+=id==='wood'?100:40;this.notify('The fire is burning.');return true;}
 cook(s){if(s.kind!=='campfire'||dist(s.p,this.position)>4)return false;if(s.cooked){if(!this.inv.add('meal',s.cooked))return this.notify('Make room for the cooked food.');s.cooked=0;this.progress.cook=true;return this.notify('Forest roast collected.'),true;}if(!s.fuel)return this.notify('Add fuel before cooking.');if(s.cooking)return this.notify('Still cooking.');if(!this.inv.remove('mushroom'))return this.notify('Cooking needs an amber cap. Gather the golden mushrooms.');s.cooking=8;this.notify('Cooking… eight seconds by the fire.');return true;}
 transfer(s,index,withdraw=false){if(s.kind!=='chest'||dist(s.p,this.position)>4)return this.notify('Move closer to the crate.');let from=withdraw?s.storage:this.inv,to=withdraw?this.inv:s.storage,slot=from.slots[index];if(!slot)return false;if(!to.add(slot.id,slot.n))return this.notify('There is no room for that stack.');from.slots[index]=null;return true;}
 rest(s){if(s.kind!=='shelter'||dist(s.p,this.position)>3)return this.notify('Rest beneath your shelter.');if(this.animals.some(a=>a.state==='pursue'&&dist(a.body.translation(),this.position)<12))return this.notify('An animal is too close to rest.');if(this.stats.hunger<20||this.stats.thirst<20)return this.notify('Eat and drink before resting.');this.stats.hunger-=12;this.stats.thirst-=14;this.stats.health=clamp(this.stats.health+28,0,100);this.stats.stamina=100;this.stats.exposure=0;this.time=(Math.floor(this.time/720)+1)*720+105;this.notify('A new morning. Your camp held through the night.');return true;}
 throwSpear(origin,direction,charge){
  if(!this.inv.count('spear'))return this.notify('Craft and equip a field spear first.');if(this.stats.stamina<9)return this.notify('Not enough stamina to throw.');if(this.objects.length>=180)return this.notify('Recover some loose objects first.');
  let d=direction.clone().normalize(),o=origin.clone().addScaledVector(d,.8),ray=new RAPIER.Ray(origin,d),block=this.world.castRay(ray,1.6,true,undefined,undefined,undefined,this.player,c=>this.meta.get(c.handle)?.type!=='anatomy');
  if(block&&block.timeOfImpact<1.55)return this.notify('Your release is blocked. Step back from the surface.');
  let speed=11+clamp(charge,0,1)*25,v=d.clone().multiplyScalar(speed).add(vec(this.player.linvel()).multiplyScalar(.4)),rotation=Q().setFromUnitVectors(V(0,1,0),d);
  let obj=this.spawnObject('spear',1,o,{projectile:true,velocity:v,rotation,angular:d.clone().multiplyScalar(.7)});this.inv.remove('spear');this.stats.stamina-=9;obj.lastTip=o.clone().addScaledVector(d,.87);this.event('throw',o,3);return obj;
 }
 lodge(o,hit,reference){
  let q=new T.Quaternion().copy(o.body.rotation()),direction=V(0,1,0).applyQuaternion(q),center=hit.point.clone().addScaledVector(direction,-.74);
  let matrix=reference.bone?reference.bone.matrixWorld:new T.Matrix4().compose(vec(reference.body.translation()),new T.Quaternion().copy(reference.body.rotation()),V(1,1,1));
  let inv=matrix.clone().invert(),local=center.clone().applyMatrix4(inv),rq=Q().setFromRotationMatrix(matrix).invert().multiply(q);
  o.attachment={...reference,local,rotation:rq};o.projectile=false;o.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);o.body.setLinvel(V(),true);o.body.setAngvel(V(),true);o.collider.setCollisionGroups(0);o.body.setTranslation(center,true);o.body.setRotation(q,true);this.updateAttachment(o);
 }
 updateAttachment(o){let a=o.attachment;if(!a)return;let matrix;if(a.bone){a.bone.updateWorldMatrix(true,false);matrix=a.bone.matrixWorld;}else if(a.body?.isValid())matrix=new T.Matrix4().compose(vec(a.body.translation()),new T.Quaternion().copy(a.body.rotation()),V(1,1,1));else {this.release(o);return;}let p=a.local.clone().applyMatrix4(matrix),q=Q().setFromRotationMatrix(matrix).multiply(a.rotation);o.body.setNextKinematicTranslation(p);o.body.setNextKinematicRotation(q);}
 release(o){o.attachment=null;o.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);o.collider.setCollisionGroups(0x00040007);}
 sweepProjectile(o){
  let p=vec(o.body.translation()),v=vec(o.body.linvel());if(v.length()<2||o.age>12){o.projectile=false;return;}
  let q=Q().copy(o.body.rotation()),axis=V(0,1,0).applyQuaternion(q),start=p.clone().addScaledVector(axis,.87),end=start.clone().addScaledVector(v,DT).add(V(0,-9*DT*DT,0)),delta=end.clone().sub(start),length=delta.length();if(length<1e-8)return;
  let dir=delta.clone().normalize(),closest=null;
  // Five continuous ray sweeps cover the shaft radius; Rapier CCD also protects the body.
  for(let offset of[V(),V(.035,0,0),V(-.035,0,0),V(0,.035,0),V(0,-.035,0)]){this.metrics.sweeps++;let ray=new RAPIER.Ray(start.clone().add(offset),dir),hit=this.world.castRayAndGetNormal(ray,length,true,undefined,undefined,o.collider,this.player,c=>!['animal','anatomy'].includes(this.meta.get(c.handle)?.type));if(hit&&(!closest||hit.timeOfImpact/length<closest.f)){closest={f:hit.timeOfImpact/length,point:start.clone().addScaledVector(dir,hit.timeOfImpact),normal:vec(hit.normal),meta:this.meta.get(hit.collider.handle)||{material:'stone'},collider:hit.collider};}}
  let anatomical=[];for(let a of this.animals){if(dist(a.body.translation(),p)>4)continue;for(let volume of a.rig.volumes){let hit=volumeHit(volume,start,end);if(hit&&!o.hitLayers.includes(a.id+':'+a.rig.volumes.indexOf(volume)))anatomical.push({...hit,animal:a});}}
  anatomical.sort((a,b)=>a.f-b.f);
  let energy=.5*ITEMS.spear.mass*v.lengthSq()*.12;
  for(let hit of anatomical){if(closest&&hit.f>closest.f)break;let a=hit.animal,vol=hit.volume,key=a.id+':'+a.rig.volumes.indexOf(vol);o.hitLayers.push(key);this.metrics.anatomy++;let incidence=Math.abs(dir.dot(hit.normal)),cost=vol.resistance/Math.max(.24,incidence);this.event('impact',hit.point,.5);a.alert=12;a.state='retreat';a.stateAge=0;a.recoil=.17;let loss=vol.layer==='vital'?24:vol.layer==='reserve'?16:vol.layer==='frame'?10:5;a.health=Math.max(0,a.health-loss);a.fatigue+=vol.layer==='reserve'?20:2;a.body.applyImpulse(v.clone().multiplyScalar(.26),true);this.progress.wildlife=true;
   if(energy<=cost||vol.layer==='frame'){this.lodge(o,hit,{bone:vol.bone,animal:a.id,boneIndex:vol.bone.userData.index});this.notify(vol.layer==='frame'?'Frame contact · spear held.':'Spear lodged · animal retreating.');if(a.health<=0)a.state='down';return;}
   energy-=cost;v.multiplyScalar(Math.sqrt(Math.max(.03,energy/(energy+cost))));o.body.setLinvel(v,true);
  }
  if(closest){let h=closest,m=MATERIALS[h.meta.material]||MATERIALS.stone,incidence=Math.abs(dir.dot(h.normal));this.metrics.impacts++;this.event('impact',h.point,.8);if(h.meta.type==='target'){h.meta.ref.hits++;this.progress.throw=true;h.meta.ref.body.applyImpulseAtPoint(v.clone().multiplyScalar(.45),h.point,true);}
   if((h.meta.material==='soft'||h.meta.material==='wood'||h.meta.material==='soil')&&incidence>.25){let body=h.collider.parent();this.lodge(o,h,{body,target:h.meta.ref?.id,structure:h.meta.type==='structure'?h.meta.ref.id:null});this.notify(`${h.meta.type==='target'?'Range hit':h.meta.material==='soil'?'Ground contact':'Wood contact'} · spear recoverable.`);}else{let bounce=v.reflect(h.normal).multiplyScalar(m.bounce);o.body.setTranslation(h.point.clone().addScaledVector(h.normal,.15).addScaledVector(axis,-.87),true);o.body.setLinvel(bounce,true);o.body.setAngvel(V(3,2,-2),true);o.projectile=false;this.notify('Hard surface · spear deflected.');}
  }else{let desired=v.clone().normalize(),cross=axis.clone().cross(desired).multiplyScalar(16);o.body.setAngvel(cross.addScaledVector(desired,.4),true);}
 }
 lineVisible(a,b,exclude){let d=vec(b).sub(vec(a)),len=d.length();if(!len)return true;let hit=this.world.castRay(new RAPIER.Ray(a,d.normalize()),len,true,undefined,undefined,undefined,exclude,c=>['tree','rock','structure','arch'].includes(this.meta.get(c.handle)?.type));return !hit;}
 setState(a,state){if(a.state!==state){a.state=state;a.stateAge=0;if(state==='pursue')a.attackHit=false;}}
 animalBrain(a){
  let p=a.body.translation(),s=SPECIES[a.species],player=this.position,d=dist(p,player),homeDist=dist(p,a.home),fire=this.structures.some(s=>s.fuel>0&&dist(s.p,p)<7),night=this.phase==='Night';
  if(a.health<=0){this.setState(a,'down');return;}
  let dx=player.x-p.x,dz=player.z-p.z,forward=-Math.sin(a.yaw)*dx-Math.cos(a.yaw)*dz,canSee=d<s.alert&&forward>-d*.45&&this.lineVisible({x:p.x,y:p.y+.3,z:p.z},{x:player.x,y:player.y+.25,z:player.z},a.body),noise=this.events.some(e=>this.elapsed-e.t<1.2&&dist(e.p,p)<e.power*4);
  if(canSee||noise){a.alert=Math.max(a.alert,3);if(d<13)this.progress.wildlife=true;}
  if(a.state==='retreat'&&a.stateAge<7||a.health<38&&d<18||fire){this.setState(a,'retreat');let len=d||1;a.target={x:clamp(p.x-dx/len*10,-49,49),z:clamp(p.z-dz/len*10,-49,49)};return;}
  if(a.species==='deer'&&a.alert>0&&d<s.alert+5){this.setState(a,'retreat');a.target={x:clamp(p.x-dx/(d||1)*12,-49,49),z:clamp(p.z-dz/(d||1)*12,-49,49)};return;}
  if(a.species!=='deer'&&a.alert>0&&d<s.alert&&homeDist<s.territory&&a.fatigue<70&&!this.sheltered){let territorial=dist(player,a.home)<(a.species==='chimp'?7:night?20:12);if(territorial||a.health<92){this.setState(a,d<2.8?'attack':'pursue');a.target={x:player.x,z:player.z};return;}this.setState(a,'watch');return;}
  if(['attack','pursue','watch','retreat'].includes(a.state)){this.setState(a,'roam');a.target={...a.home};}
  if(a.thirst>65){this.setState(a,'drink');a.target={x:8,z:4};if(dist(p,a.target)<2)a.thirst=Math.max(0,a.thirst-10);return;}
  if((a.fatigue>55||night&&a.species!=='jaguar')&&a.alert<=0){this.setState(a,'rest');return;}
  if(a.state==='rest'){if(a.fatigue<10&&!night)this.setState(a,'roam');return;}
  if(a.state==='graze'){if(a.stateAge>7){this.setState(a,'roam');a.target={x:a.home.x+(this.random()-.5)*18,z:a.home.z+(this.random()-.5)*18};}return;}
  if(dist(p,a.target)<2||a.stateAge>15){if(a.species==='deer'&&this.random()<.5)this.setState(a,'graze');else{this.setState(a,'roam');a.stateAge=0;a.target={x:clamp(a.home.x+(this.random()-.5)*22,-47,47),z:clamp(a.home.z+(this.random()-.5)*22,-47,47)};}}
 }
 stepAnimal(a){
  let p=a.body.translation(),s=SPECIES[a.species];a.stateAge+=DT;a.brainTimer-=DT;a.alert=Math.max(0,a.alert-DT);a.cooldown=Math.max(0,a.cooldown-DT);a.recoil*=.91;a.thirst+=DT*.045;
  if(a.brainTimer<=0){this.animalBrain(a);a.brainTimer=dist(p,this.position)>40?.65:.2;}
  let moving=['roam','retreat','pursue','drink'].includes(a.state),running=['retreat','pursue'].includes(a.state),speed=moving?(running?s.run:s.speed):0;
  if(a.state==='drink'&&dist(p,a.target)<2)speed=0;
  a.fatigue=clamp(a.fatigue+DT*(running?.8:a.state==='rest'?-3:-.12),0,100);if(a.state==='down'){a.health=Math.min(35,a.health+DT*.5);if(a.health>=30){a.state='rest';a.stateAge=0;}}
  let desired=V(a.target.x-p.x,0,a.target.z-p.z);if(desired.lengthSq())desired.normalize();
  // Local steering combines target travel, a short look-ahead, and obstacle separation.
  for(let o of this.statics){if(o.type==='tree'&&o.ref.hp<=0)continue;let ox=p.x-o.x,oz=p.z-o.z,d=Math.hypot(ox,oz),ahead=(o.x-p.x)*desired.x+(o.z-p.z)*desired.z;if(d<o.r+2.7&&ahead>-.8){let force=(o.r+2.7-d)/(o.r+2.7);desired.x+=ox/(d||.1)*force*3;desired.z+=oz/(d||.1)*force*3;}}
  for(let st of this.structures){let d=dist(p,st.p),r=st.kind==='shelter'?3.5:1.8;if(d<r+1){desired.x+=(p.x-st.p.x)/(d||1)*2;desired.z+=(p.z-st.p.z)/(d||1)*2;}}
  if(height(p.x+desired.x*2,p.z+desired.z*2)<WATER-.1&&a.state!=='drink'){desired.x+=p.x<15?-1.8:1.8;desired.z+=p.z<5?-1:1;}
  desired.normalize();let velocity=a.body.linvel(),targetYaw=Math.atan2(-desired.x,-desired.z);
  if(speed>0){let angle=Math.atan2(Math.sin(targetYaw-a.yaw),Math.cos(targetYaw-a.yaw));a.yaw+=clamp(angle,-DT*2.9,DT*2.9);speed*=Math.max(.18,Math.cos(angle));}
  a.look=a.state==='watch'?Math.atan2(-(this.position.x-p.x),-(this.position.z-p.z))-a.yaw:0;
  let impulse=V(clamp((-Math.sin(a.yaw)*speed-velocity.x)*s.mass*DT*7,-s.mass*.45,s.mass*.45),0,clamp((-Math.cos(a.yaw)*speed-velocity.z)*s.mass*DT*7,-s.mass*.45,s.mass*.45));a.body.applyImpulse(impulse,true);
  a.gait+=Math.hypot(velocity.x,velocity.z)*DT*(a.species==='chimp'?5:4.3);
  if(a.state==='attack'&&a.cooldown<=0&&a.attackTime<=0){a.attackTime=.75;a.attackHit=false;a.cooldown=2.4;let direction=vec(this.position).sub(vec(p));direction.y=0;direction.normalize();a.body.applyImpulse(direction.multiplyScalar(s.mass*1.6),true);this.event('animal',p);}
  if(a.attackTime>0){a.attackTime-=DT;let t=.75-a.attackTime,forward=V(-Math.sin(a.yaw),0,-Math.cos(a.yaw)),contact=vec(p).addScaledVector(forward,.75);if(t>.18&&t<.42&&!a.attackHit&&dist(contact,this.position)<.9&&Math.abs(p.y-this.position.y)<1&&this.lineVisible(p,this.position,a.body)){a.attackHit=true;this.metrics.attacks++;this.stats.health-=a.species==='jaguar'?12:9;this.player.applyImpulse(forward.multiplyScalar(160).add(V(0,30,0)),true);this.event('hurt',this.position);}}
  if(p.y<height(p.x,p.z)-3||Math.abs(p.x)>65||Math.abs(p.z)>65){a.body.setTranslation({x:a.home.x,y:height(a.home.x,a.home.z)+a.clearance,z:a.home.z},true);a.body.setLinvel(V(),true);}
 }
 stepPlayer(){
  const p=this.position,v=this.player.linvel(),i=this.input;let water=height(p.x,p.z)<WATER+.03,ground=this.world.castRay(new RAPIER.Ray({x:p.x,y:p.y-.65,z:p.z},V(0,-1,0)),.3,true,undefined,undefined,undefined,this.player,c=>!['anatomy','animal','object'].includes(this.meta.get(c.handle)?.type));this.grounded=!!ground;
  let moving=Math.hypot(i.x,i.z)>.1,sprint=i.sprint&&this.stats.stamina>4&&moving,speed=i.crouch?1.9:sprint?6.5:3.8;if(water)speed*=.54;
  let dir=V(i.x,0,i.z);if(dir.length()>1)dir.normalize();let accel=this.grounded?12:water?6:2.4;
  this.player.applyImpulse(V(clamp((dir.x*speed-v.x)*65*DT*accel,-60,60),0,clamp((dir.z*speed-v.z)*65*DT*accel,-60,60)),true);
  if(i.jump&&(this.grounded||water)&&this.stats.stamina>=7){this.player.setLinvel({x:v.x,y:water?4.5:6.6,z:v.z},true);this.stats.stamina-=7;this.event('step',p);}i.jump=false;
  if(water){let sub=clamp(WATER-p.y+.7,0,1.5);this.player.applyImpulse(V(0,sub*65*19*DT-v.y*65*DT*1.8,0),true);}
  this.stats.stamina=clamp(this.stats.stamina+DT*(sprint?-13:water&&moving?-1.5:12),0,100);
  this.stats.hunger=clamp(this.stats.hunger-DT*(sprint?.042:.022),0,100);this.stats.thirst=clamp(this.stats.thirst-DT*(sprint?.068:.033),0,100);
  const nearFire=this.structures.some(s=>s.fuel>0&&dist(p,s.p)<5),cold=(this.phase==='Night'?.8:0)+(this.rain?1.1:0)+(water?.65:0);
  this.stats.exposure=clamp(this.stats.exposure+DT*((this.sheltered||nearFire)?-4:cold>.1?cold*.23:-.4),0,100);
  if(this.stats.hunger===0||this.stats.thirst===0||this.stats.exposure>90)this.stats.health-=DT*.6;else if(this.stats.hunger>50&&this.stats.thirst>50)this.stats.health=clamp(this.stats.health+DT*.13,0,100);
  if(p.y<height(p.x,p.z)-5){this.player.setTranslation({x:0,y:height(0,16)+1,z:16},true);this.player.setLinvel(V(),true);}
  if(this.stats.health<=0){this.stats.health=0;this.dead=true;}
 }
 respawn(){this.dead=false;for(let i=0;i<this.inv.slots.length;i++)if(this.inv.slots[i])this.drop(i,true);this.stats={health:100,hunger:80,thirst:80,stamina:100,exposure:0};this.player.setTranslation({x:0,y:height(0,16)+1,z:16},true);this.player.setLinvel(V(),true);this.notify('You wake in the clearing. Your dropped pack is recoverable.');}
 step(){
  if(this.dead)return;this.elapsed+=DT;this.time+=DT;this.metrics.steps++;this.chopCooldown=Math.max(0,(this.chopCooldown||0)-DT);this.events=this.events.filter(e=>this.elapsed-e.t<2);
  this.stepPlayer();for(let a of this.animals)this.stepAnimal(a);
  for(let o of this.objects){o.age+=DT;if(o.attachment)this.updateAttachment(o);else if(o.projectile)this.sweepProjectile(o);if(!o.attachment){if(!o.projectile&&o.age>.25)o.collider.setCollisionGroups(0x00040007);let p=o.body.translation(),v=o.body.linvel();if(p.y<WATER+.25&&height(p.x,p.z)<WATER){let buoyancy=ITEMS[o.item].material==='wood'?1.38:.28,sub=clamp((WATER+.15-p.y)*3,0,1),mass=o.body.mass();o.body.applyImpulse({x:-v.x*mass*DT*.8,y:(18*buoyancy*sub-v.y*2*sub)*mass*DT,z:-v.z*mass*DT*.8},true);}if(p.y<-15){o.body.setTranslation({x:0,y:2,z:15},true);o.body.setLinvel(V(),true);}}}
  for(let s of this.structures)if(s.kind==='campfire'&&s.fuel>0){s.fuel=Math.max(0,s.fuel-DT);if(s.cooking>0){s.cooking-=DT;if(s.cooking<=0){s.cooking=0;s.cooked++;this.notify('Forest roast is ready at your campfire.');}}}
  this.world.step();
  for(let a of this.animals){poseRig(a.rig,a,this.elapsed);for(let s of a.sensors){let p=s.volume.offset.clone().applyMatrix4(s.volume.bone.matrixWorld);s.body.setNextKinematicTranslation(p);s.body.setNextKinematicRotation(Q().setFromRotationMatrix(s.volume.bone.matrixWorld));}}
  for(let l of LANDMARKS)if(dist(l,this.position)<9&&!this.discovered.includes(l.id)){this.discovered.push(l.id);this.notify(`Discovered: ${l.name}`);if(l.id==='arch'||l.id==='grove'){this.spawnObject(l.id==='arch'?'fiber':'mushroom',6,V(l.x,height(l.x,l.z)+.35,l.z));}}
 }
 advance(seconds){this.accumulator+=Math.min(seconds,.25);let n=0;while(this.accumulator+1e-9>=DT&&n<15){this.step();this.accumulator-=DT;n++;}return n;}
 snapshot(){
  const tr=b=>({p:{...b.translation()},q:{...b.rotation()},v:{...b.linvel()},w:{...b.angvel()}});
  return {version:SAVE_VERSION,time:this.time,elapsed:this.elapsed,nextID:this.nextID,stats:{...this.stats},inv:this.inv.slots,selected:this.selected,player:tr(this.player),progress:{...this.progress},discovered:[...this.discovered],trees:this.layout.trees.map(t=>[t.id,t.hp]),objects:this.objects.map(o=>({id:o.id,item:o.item,n:o.n,...tr(o.body),projectile:o.projectile,age:o.age,hitLayers:o.hitLayers,attachment:o.attachment?{animal:o.attachment.animal,boneIndex:o.attachment.boneIndex,target:o.attachment.target,structure:o.attachment.structure,bodyHandle:o.attachment.body?.handle,local:o.attachment.local.toArray(),rotation:o.attachment.rotation.toArray()}:null})),structures:this.structures.map(s=>({id:s.id,kind:s.kind,p:s.p,yaw:s.yaw,fuel:s.fuel,cooking:s.cooking,cooked:s.cooked,storage:s.storage.slots})),animals:this.animals.map(a=>({id:a.id,...tr(a.body),health:a.health,thirst:a.thirst,fatigue:a.fatigue,yaw:a.yaw,gait:a.gait,state:a.state,stateAge:a.stateAge,target:a.target,alert:a.alert})),targets:this.targets.map(t=>({id:t.id,...tr(t.body),hits:t.hits}))};
 }
 restore(data){
  if(data.version!==SAVE_VERSION)throw new Error('This save uses an unsupported world version.');
  const set=(b,d)=>{b.setTranslation(d.p,true);b.setRotation(d.q,true);b.setLinvel(d.v||V(),true);b.setAngvel(d.w||V(),true);};
  this.time=data.time;this.elapsed=data.elapsed;this.stats={...data.stats};this.inv=new Inventory(20,data.inv);this.selected=data.selected;this.progress={...data.progress};this.discovered=[...data.discovered];set(this.player,data.player);
  for(let [id,hp]of data.trees){let t=this.layout.trees.find(x=>x.id===id);if(t){t.hp=hp;if(hp<=0){this.removeBody(t.body);t.body=null;this.statics=this.statics.filter(s=>s.ref!==t);}}}
  for(let s of data.structures){let st=this.makeStructure(s.kind,s.p,s.yaw,s.id);st.fuel=s.fuel;st.cooking=s.cooking;st.cooked=s.cooked;st.storage=new Inventory(12,s.storage);}
  for(let d of data.animals){let a=this.animals.find(a=>a.id===d.id);if(a){set(a.body,d);for(let k of ['health','thirst','fatigue','yaw','gait','state','stateAge','target','alert'])a[k]=d[k];poseRig(a.rig,a,this.elapsed);}}
  for(let d of data.targets||[]){let t=this.targets.find(t=>t.id===d.id);if(t){set(t.body,d);t.hits=d.hits;}}
  for(let d of data.objects){let o=this.spawnObject(d.item,d.n,vec(d.p),{id:d.id,rotation:d.q,velocity:d.v,angular:d.w,projectile:d.projectile});if(!o)continue;o.age=d.age;o.hitLayers=d.hitLayers||[];if(d.attachment){let a=d.attachment,ref={};if(a.animal){let animal=this.animals.find(x=>x.id===a.animal);ref={animal:a.animal,boneIndex:a.boneIndex,bone:animal?.rig.bones[a.boneIndex]};}else{let target=this.targets.find(t=>t.id===a.target),structure=this.structures.find(s=>s.id===a.structure);let body=target?.body||structure?.body||this.world.getRigidBody(a.bodyHandle);ref={body:body||this.ground,target:a.target,structure:a.structure};}if(ref.bone||ref.body){o.attachment={...ref,local:V(...a.local),rotation:Q().fromArray(a.rotation)};o.projectile=false;o.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);o.collider.setCollisionGroups(0);this.updateAttachment(o);}}}
  this.nextID=data.nextID;
 }
 dispose(){this.world.free();}
}
