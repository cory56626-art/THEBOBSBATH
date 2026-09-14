import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {DT,SIZE,WATER,SAVE_VERSION,height,terrainData,worldLayout,rng,clamp,Inventory,ITEMS,SPECIES,LANDMARKS} from './data.js';
import {V,makeRig,poseRig,volumeHit} from './rig.js';
import {combatMethods} from './combat.js';
import {survivalMethods} from './survival.js';
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
  this.setupExpansion(saved);
  const spawn=[['deer',-7,2],['deer',13,-13],['deer',22,21],['jaguar',-27,-12],['chimp',29,-8],['deer',-105,78],['deer',115,50],['jaguar',-87,-70],['chimp',96,56],['deer',-58,-124],['jaguar',116,-81],['chimp',-137,92]];
  for(let [species,x,z]of spawn)this.makeAnimal(species,x,z);
  if(saved)this.restore(saved);
  this.streamResources();
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
  let s=SPECIES[species],clearance=.72,a={id:'animal'+this.animals.length,species,clearance,home:{x,z},yaw:0,gait:0,look:0,state:'roam',stateAge:0,target:{x:x+4,z:z-3},health:s.maxHealth,provoked:0,fatigue:0,thirst:20+this.random()*30,alert:0,recoil:0,attackTime:0,cooldown:0,attackHit:false,brainTimer:0,navSide:1};
  a.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,height(x,z)+clearance+.1,z).lockRotations().setLinearDamping(.5).setCcdEnabled(true).setCanSleep(false));
  this.addCollider(RAPIER.ColliderDesc.capsule(.25,.46).setMass(s.mass).setFriction(.1).setCollisionGroups(0x00020007),a.body,{type:'animal',material:'soft',ref:a});
  a.rig=makeRig(species);a.sensors=[];
  for(let vol of a.rig.volumes){let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());let collider=this.addCollider(RAPIER.ColliderDesc.cuboid(vol.r.x,vol.r.y,vol.r.z).setSensor(true).setCollisionGroups(0x00080000),body,{type:'anatomy',ref:a,volume:vol});a.sensors.push({body,collider,volume:vol});}
  this.animals.push(a);return a;
 }
 spawnObject(item,n,p,opts={}){
  if(this.objects.length>=320)return null;let def=ITEMS[item];
  let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.2).setAngularDamping(.8).setCcdEnabled(true));
  let shape=(item==='spear'||item==='pike')?RAPIER.ColliderDesc.capsule(.82,.045):item==='branch'?RAPIER.ColliderDesc.cuboid(.055,.055,.43):item==='wood'||item==='plank'||item==='bridge'?RAPIER.ColliderDesc.cuboid(item==='bridge'?2:item==='plank'?1:.35,.12,item==='bridge'?.6:.15):RAPIER.ColliderDesc.ball(item==='stone'?.16:.12);
  shape.setMass(def.mass*n).setFriction(item==='stone'?.85:.65).setRestitution(item==='stone'?.18:.08).setCollisionGroups(opts.projectile?0x00040005:0x00040007);
  let o={id:opts.id||'drop'+this.nextID++,item,n,body,projectile:!!opts.projectile,age:0,attachment:null,hitLayers:[],lastTip:p.clone()};
  o.collider=this.addCollider(shape,body,{type:'object',material:def.material,ref:o});
  if(opts.rotation)body.setRotation(opts.rotation,true);else if(item==='spear'||item==='pike')body.setRotation(Q().setFromAxisAngle(V(1,0,0),Math.PI/2),true);
  if(opts.velocity)body.setLinvel(opts.velocity,true);if(opts.angular)body.setAngvel(opts.angular,true);
  this.objects.push(o);return o;
 }
 removeObject(o){this.removeBody(o.body);this.objects=this.objects.filter(x=>x!==o);o.removed=true;}
 gather(o){
  if(!this.objects.includes(o)||vec(o.body.translation()).distanceTo(vec(this.position))>4)return this.notify('Move closer to recover that.');
  if(!this.inv.add(o.item,o.n))return this.notify('Your pack is full. Drop or store a stack.');
  if(this.grabbed===o)this.grabbed=null;this.removeObject(o);this.progress.gather=true;this.notify(`+${o.n} ${ITEMS[o.item].name}`);this.event('gather',this.position);return true;
 }
 drop(index=this.selected,all=false){let slot=this.inv.slots[index];if(!slot)return this.notify('That slot is empty.');let p=this.position,n=all?slot.n:1,o=this.spawnObject(slot.id,n,V(p.x,p.y+.45,p.z-1),{velocity:V(0,1,-1)});if(!o)return this.notify('Too many loose objects nearby. Recover or store some first.');this.inv.remove(slot.id,n);return o;}
 drink(){if(height(this.position.x,this.position.z)>WATER+.8||dist(this.position,{x:15,z:5})>15)return this.notify('Get closer to the water’s edge.');this.stats.thirst=100;this.event('drink',this.position);this.notify('Freshwater. Thirst restored.');return true;}
 chop(tree){if(!tree||tree.hp<=0||dist(tree,this.position)>3.5)return this.notify('Move closer to a tree.');if(this.inv.slots[this.selected]?.id!=='axe')return this.notify('Equip a stone hatchet to harvest wood.');if(this.stats.stamina<10)return this.notify('Catch your breath before swinging.');if(this.chopCooldown>0)return false;this.chopCooldown=.6;this.stats.stamina-=10;tree.hp--;this.event('chop',tree,2);this.notify(tree.hp?`Chopping wood · ${4-tree.hp}/4`:'Timber! Recover the fallen wood.');if(tree.hp===0){if(this.climbing?.tree===tree)this.dismount();this.removeBody(tree.body);tree.body=null;this.statics=this.statics.filter(s=>s.ref!==tree);for(let i=0;i<3;i++)this.spawnObject(i===2?'branch':'wood',i===2?3:4,V(tree.x+(i-1)*.6,height(tree.x,tree.z)+1.3,tree.z),{velocity:V((i-1)*1.4,1,1)});}return true;}
 place(kind,p,yaw=0){let check=this.placement(kind,p,yaw);if(!check.ok)return this.notify(check.message);if(this.inv.count(kind)<1)return this.notify('Craft that kit first.');
  if(kind==='plank'||kind==='bridge'){let o=this.spawnObject(kind,1,check.p.clone().add(V(0,1,0)),{rotation:Q().setFromAxisAngle(V(0,1,0),yaw)});if(!o)return this.notify('Recover some loose objects first.');}else this.makeStructure(kind,check.p,yaw);
  this.inv.remove(kind);if(kind==='shelter')this.progress.shelter=true;this.event('build',p);this.notify(kind==='plank'?'Timber released.':`${ITEMS[kind].name.replace(' kit','')} placed.`);return true;
 }
 makeStructure(kind,p,yaw=0,id=null){
  let s={water:0,id:id||'structure'+this.nextID++,kind,p:vec(p),yaw,fuel:0,cooking:0,cooked:0,storage:new Inventory(12),bodies:[]};
  let body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x,p.y,p.z).setRotation(Q().setFromAxisAngle(V(0,1,0),yaw)));s.body=body;s.bodies.push(body);
  const add=(desc)=>this.addCollider(desc,body,{type:'structure',material:kind==='campfire'?'stone':'wood',ref:s});
  if(kind==='shelter'){
   for(let x of[-2,2])for(let z of[-1.5,1.5])add(RAPIER.ColliderDesc.cuboid(.11,z<0?1.45:1,.11).setTranslation(x,z<0?1.45:1,z));
   add(RAPIER.ColliderDesc.cuboid(2,.85,.09).setTranslation(0,.85,-1.5));
   let rotation=Q().setFromAxisAngle(V(0,1,0),yaw).multiply(Q().setFromAxisAngle(V(1,0,0),-.29));
   let roof=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y+2.5,p.z).setRotation(rotation).setAdditionalSolverIterations(4));
   this.addCollider(RAPIER.ColliderDesc.cuboid(2.3,.12,1.9).setMass(25),roof,{type:'structure',material:'wood',ref:s});s.bodies.push(roof);
   this.world.createImpulseJoint(RAPIER.JointData.fixed({x:0,y:2.5,z:0},Q().setFromAxisAngle(V(1,0,0),-.29),V(),Q()),body,roof,true).setContactsEnabled(false);
  }else if(kind==='workbench'){add(RAPIER.ColliderDesc.cuboid(1,.12,.55).setTranslation(0,1.05,0));for(let x of[-.8,.8])for(let z of[-.4,.4])add(RAPIER.ColliderDesc.cuboid(.09,.5,.09).setTranslation(x,.5,z));}
  else if(kind==='palisade')add(RAPIER.ColliderDesc.cuboid(1.6,1.35,.15).setTranslation(0,1.35,0));
  else if(kind==='foundation')add(RAPIER.ColliderDesc.cuboid(2,.35,2).setTranslation(0,.35,0));
  else if(kind==='bedroll')add(RAPIER.ColliderDesc.cuboid(.6,.08,1).setTranslation(0,.08,0));
  else if(kind==='collector')add(RAPIER.ColliderDesc.cylinder(.45,.65).setTranslation(0,.45,0));
  else add(kind==='chest'?RAPIER.ColliderDesc.cuboid(.65,.4,.42).setTranslation(0,.4,0):RAPIER.ColliderDesc.cylinder(.18,.7).setTranslation(0,.18,0));
  this.structures.push(s);return s;
 }
 dismantle(s){if(!this.structures.includes(s)||dist(s.p,this.position)>4)return this.notify('Move closer to dismantle.');if(s.cooking||s.cooked||s.storage.slots.some(Boolean))return this.notify('Empty the storage or cooking contents first.');if(!this.inv.add(s.kind))return this.notify('Make room in your pack first.');for(let o of this.objects)if(o.attachment?.structure===s.id)this.release(o);for(let b of s.bodies)this.removeBody(b);this.structures=this.structures.filter(x=>x!==s);s.removed=true;this.notify('Kit recovered.');return true;}
 fuel(s){if(s.kind!=='campfire'||dist(s.p,this.position)>4)return false;let id=this.inv.count('wood')?'wood':this.inv.count('branch')?'branch':null;if(!id)return this.notify('Add wood or a branch to light the campfire.');if(s.fuel>210)return this.notify('The campfire has enough fuel.');this.inv.remove(id);s.fuel+=id==='wood'?100:40;this.notify('The fire is burning.');return true;}
 cook(s){if(s.kind!=='campfire'||dist(s.p,this.position)>4)return false;if(s.cooked){if(!this.inv.add('meal',s.cooked))return this.notify('Make room for the cooked food.');s.cooked=0;this.progress.cook=true;return this.notify('Forest roast collected.'),true;}if(!s.fuel)return this.notify('Add fuel before cooking.');if(s.cooking)return this.notify('Still cooking.');if(!this.inv.remove('mushroom'))return this.notify('Cooking needs an amber cap. Gather the golden mushrooms.');s.cooking=8;this.notify('Cooking… eight seconds by the fire.');return true;}
 transfer(s,index,withdraw=false){if(s.kind!=='chest'||dist(s.p,this.position)>4)return this.notify('Move closer to the crate.');let from=withdraw?s.storage:this.inv,to=withdraw?this.inv:s.storage,slot=from.slots[index];if(!slot)return false;if(!to.add(slot.id,slot.n))return this.notify('There is no room for that stack.');from.slots[index]=null;return true;}
 lodge(o,hit,reference){
  let q=new T.Quaternion().copy(o.body.rotation()),direction=V(0,1,0).applyQuaternion(q),center=hit.point.clone().addScaledVector(direction,-.74);
  let matrix=reference.bone?reference.bone.matrixWorld:new T.Matrix4().compose(vec(reference.body.translation()),new T.Quaternion().copy(reference.body.rotation()),V(1,1,1));
  let inv=matrix.clone().invert(),local=center.clone().applyMatrix4(inv),rq=Q().setFromRotationMatrix(matrix).invert().multiply(q);
  o.attachment={...reference,local,rotation:rq};o.projectile=false;o.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);o.body.setLinvel(V(),true);o.body.setAngvel(V(),true);o.collider.setCollisionGroups(0);o.body.setTranslation(center,true);o.body.setRotation(q,true);this.updateAttachment(o);
 }
 updateAttachment(o){let a=o.attachment;if(!a)return;let matrix;if(a.bone){a.bone.updateWorldMatrix(true,false);matrix=a.bone.matrixWorld;}else if(a.body?.isValid())matrix=new T.Matrix4().compose(vec(a.body.translation()),new T.Quaternion().copy(a.body.rotation()),V(1,1,1));else {this.release(o);return;}let p=a.local.clone().applyMatrix4(matrix),q=Q().setFromRotationMatrix(matrix).multiply(a.rotation);o.body.setNextKinematicTranslation(p);o.body.setNextKinematicRotation(q);}
 release(o){o.attachment=null;o.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);o.collider.setCollisionGroups(0x00040007);}
 lineVisible(a,b,exclude){let d=vec(b).sub(vec(a)),len=d.length();if(!len)return true;let hit=this.world.castRay(new RAPIER.Ray(a,d.normalize()),len,true,undefined,undefined,undefined,exclude,c=>['tree','rock','structure','arch'].includes(this.meta.get(c.handle)?.type));return !hit;}
 setState(a,state){if(a.state!==state){a.state=state;a.stateAge=0;if(state==='pursue')a.attackHit=false;}}
 stepPlayer(){
  if(this.climbing){this.stepClimbing();return;}
  const p=this.position,v=this.player.linvel(),i=this.input;let water=height(p.x,p.z)<WATER+.03,ground=this.world.castRay(new RAPIER.Ray({x:p.x,y:p.y-.65,z:p.z},V(0,-1,0)),.3,true,undefined,undefined,undefined,this.player,c=>!['anatomy','animal'].includes(this.meta.get(c.handle)?.type));this.grounded=!!ground;
  let moving=Math.hypot(i.x,i.z)>.1,sprint=i.sprint&&this.stats.stamina>4&&moving,speed=i.crouch?1.9:sprint?6.5:3.8;if(water)speed*=.54;if(this.grabbed)speed*=clamp(1-this.grabbed.body.mass()/70,.35,1);
  let dir=V(i.x,0,i.z);if(dir.length()>1)dir.normalize();let accel=this.grounded?12:water?6:moving?2.4:.1;
  this.player.applyImpulse(V(clamp((dir.x*speed-v.x)*65*DT*accel,-60,60),0,clamp((dir.z*speed-v.z)*65*DT*accel,-60,60)),true);
  if(i.jump&&(this.grounded||water)&&this.stats.stamina>=7){this.player.setLinvel({x:v.x,y:water?4.5:6.6,z:v.z},true);this.stats.stamina-=7;this.event('step',p);}i.jump=false;
  if(water){let sub=clamp(WATER-p.y+.7,0,1.5);this.player.applyImpulse(V(0,sub*65*19*DT-v.y*65*DT*1.8,0),true);}
  this.stats.stamina=clamp(this.stats.stamina+DT*(sprint?-13:water&&moving?-1.5:12),0,100);
  this.stats.hunger=clamp(this.stats.hunger-DT*(sprint?.042:.022),0,100);this.stats.thirst=clamp(this.stats.thirst-DT*(sprint?.068:.033),0,100);
  const nearFire=this.structures.some(s=>s.fuel>0&&dist(p,s.p)<5),cold=(this.phase==='Night'?.8:0)+(this.rain?1.1:0)+(water?.65:0);
  this.stats.exposure=clamp(this.stats.exposure+DT*((this.sheltered||nearFire)?-4:cold>.1?cold*.23:-.4),0,100);
  if(this.stats.hunger===0||this.stats.thirst===0||this.stats.exposure>90)this.stats.health-=DT*.6;else if(this.stats.hunger>50&&this.stats.thirst>50)this.stats.health=clamp(this.stats.health+DT*.13,0,100);
  if(p.y<height(p.x,p.z)-5||Math.max(Math.abs(p.x),Math.abs(p.z))>SIZE-2){this.player.setTranslation({x:0,y:height(0,16)+1,z:16},true);this.player.setLinvel(V(),true);}
  if(this.stats.health<=0){this.stats.health=0;this.dead=true;}
 }
 respawn(){if(this.climbing)this.dismount();this.grabbed=null;this.dead=false;for(let i=0;i<this.inv.slots.length;i++)if(this.inv.slots[i])this.drop(i,true);this.stats={health:100,hunger:80,thirst:80,stamina:100,exposure:0};this.player.setTranslation({x:this.spawnPoint.x,y:height(this.spawnPoint.x,this.spawnPoint.z)+1,z:this.spawnPoint.z},true);this.player.setLinvel(V(),true);this.notify('You wake in the clearing. Your dropped pack is recoverable.');}
 step(){
  if(this.dead)return;this.elapsed+=DT;this.time+=DT;this.metrics.steps++;this.chopCooldown=Math.max(0,(this.chopCooldown||0)-DT);this.events=this.events.filter(e=>this.elapsed-e.t<2);
  this.stepPlayer();this.stepMelee();this.stepSurvival();for(let a of this.animals)this.stepAnimal(a);
  for(let o of this.objects){o.age+=DT;if(o.attachment)this.updateAttachment(o);else if(o.projectile)this.sweepProjectile(o);if(!o.attachment){if(!o.projectile&&o.age>.25)o.collider.setCollisionGroups(0x00040007);let p=o.body.translation(),v=o.body.linvel();if(p.y<WATER+.25&&height(p.x,p.z)<WATER){let buoyancy=ITEMS[o.item].material==='wood'?1.38:.28,sub=clamp((WATER+.15-p.y)*3,0,1),mass=o.body.mass();o.body.applyImpulse({x:-v.x*mass*DT*.8,y:(18*buoyancy*sub-v.y*2*sub)*mass*DT,z:-v.z*mass*DT*.8},true);}if(p.y<-15){o.body.setTranslation({x:0,y:2,z:15},true);o.body.setLinvel(V(),true);}}}
  for(let s of this.structures)if(s.kind==='campfire'&&s.fuel>0){s.fuel=Math.max(0,s.fuel-DT);if(s.cooking>0){s.cooking-=DT;if(s.cooking<=0){s.cooking=0;s.cooked++;this.notify('Forest roast is ready at your campfire.');}}}
  this.world.step();
  for(let a of this.animals){if(a.distant)continue;poseRig(a.rig,a,this.elapsed);for(let s of a.sensors){let p=s.volume.offset.clone().applyMatrix4(s.volume.bone.matrixWorld);s.body.setNextKinematicTranslation(p);s.body.setNextKinematicRotation(Q().setFromRotationMatrix(s.volume.bone.matrixWorld));}}
  for(let l of LANDMARKS)if(dist(l,this.position)<9&&!this.discovered.includes(l.id)){this.discovered.push(l.id);this.notify(`Discovered: ${l.name}`);if(l.id==='arch'||l.id==='grove'){this.spawnObject(l.id==='arch'?'fiber':'mushroom',6,V(l.x,height(l.x,l.z)+.35,l.z));}}
 }
 advance(seconds){this.accumulator+=Math.min(seconds,.25);let n=0;while(this.accumulator+1e-9>=DT&&n<15){this.step();this.accumulator-=DT;n++;}return n;}
 snapshot(){
  const tr=b=>({p:{...b.translation()},q:{...b.rotation()},v:{...b.linvel()},w:{...b.angvel()}});
  return {version:SAVE_VERSION,worldRevision:2,activatedResources:[...this.activatedResources],dormantObjects:this.dormantObjects,waterCharges:this.waterCharges,torchOn:this.torchOn,spawnPoint:this.spawnPoint,climbing:this.climbing?{tree:this.climbing.tree.id,height:this.climbing.height,angle:this.climbing.angle}:null,time:this.time,elapsed:this.elapsed,nextID:this.nextID,stats:{...this.stats},inv:this.inv.slots,selected:this.selected,player:tr(this.player),progress:{...this.progress},discovered:[...this.discovered],trees:this.layout.trees.map(t=>[t.id,t.hp]),objects:this.objects.map(o=>({id:o.id,item:o.item,n:o.n,...tr(o.body),projectile:o.projectile,age:o.age,hitLayers:o.hitLayers,hitAnimals:o.hitAnimals||[],attachment:o.attachment?{animal:o.attachment.animal,boneIndex:o.attachment.boneIndex,target:o.attachment.target,structure:o.attachment.structure,bodyHandle:o.attachment.body?.handle,staticId:o.attachment.staticId,local:o.attachment.local.toArray(),rotation:o.attachment.rotation.toArray()}:null})),structures:this.structures.map(s=>({id:s.id,kind:s.kind,p:s.p,yaw:s.yaw,water:s.water,fuel:s.fuel,cooking:s.cooking,cooked:s.cooked,storage:s.storage.slots})),animals:this.animals.map(a=>({id:a.id,...tr(a.body),health:a.health,provoked:a.provoked,thirst:a.thirst,fatigue:a.fatigue,yaw:a.yaw,gait:a.gait,state:a.state,stateAge:a.stateAge,target:a.target,alert:a.alert})),targets:this.targets.map(t=>({id:t.id,...tr(t.body),hits:t.hits}))};
 }
 restore(data){
  if(data.version!==SAVE_VERSION)throw new Error('This save uses an unsupported world version.');
  const set=(b,d)=>{b.setTranslation(d.p,true);b.setRotation(d.q,true);b.setLinvel(d.v||V(),true);b.setAngvel(d.w||V(),true);};
  this.time=data.time;this.elapsed=data.elapsed;this.stats={...data.stats};this.inv=new Inventory(20,data.inv);this.selected=data.selected;this.progress={...data.progress};this.discovered=[...data.discovered];set(this.player,data.player);
  for(let [id,hp]of data.trees){let t=this.layout.trees.find(x=>x.id===id);if(t){t.hp=hp;if(hp<=0){this.removeBody(t.body);t.body=null;this.statics=this.statics.filter(s=>s.ref!==t);}}}
  for(let s of data.structures){let st=this.makeStructure(s.kind,s.p,s.yaw,s.id);st.water=s.water||0;st.fuel=s.fuel;st.cooking=s.cooking;st.cooked=s.cooked;st.storage=new Inventory(12,s.storage);}
  for(let d of data.animals){let a=this.animals.find(a=>a.id===d.id);if(a){set(a.body,d);for(let k of ['health','thirst','fatigue','yaw','gait','state','stateAge','target','alert'])a[k]=d[k];a.provoked=d.provoked||0;if(!data.worldRevision){a.health=clamp(a.health/100*SPECIES[a.species].maxHealth,0,SPECIES[a.species].maxHealth);if(a.state==='down')a.state='rest';}if(a.health<=0)this.defeatAnimal(a);poseRig(a.rig,a,this.elapsed);}}
  for(let d of data.targets||[]){let t=this.targets.find(t=>t.id===d.id);if(t){set(t.body,d);t.hits=d.hits;}}
  for(let d of data.objects){let o=this.spawnObject(d.item,d.n,vec(d.p),{id:d.id,rotation:d.q,velocity:d.v,angular:d.w,projectile:d.projectile});if(!o)continue;o.age=d.age;o.hitLayers=d.hitLayers||[];o.hitAnimals=d.hitAnimals||[];if(d.attachment){let a=d.attachment,ref={};if(a.animal){let animal=this.animals.find(x=>x.id===a.animal);ref={animal:a.animal,boneIndex:a.boneIndex,bone:animal?.rig.bones[a.boneIndex]};}else{let target=this.targets.find(t=>t.id===a.target),structure=this.structures.find(s=>s.id===a.structure);let body=target?.body||structure?.body||this.layout.trees.find(t=>t.id===a.staticId)?.body||this.layout.rocks.find(r=>r.id===a.staticId)?.body;ref={body:body||this.ground,target:a.target,structure:a.structure,staticId:a.staticId};if(!body){a.local=[d.p.x,d.p.y,d.p.z];a.rotation=[d.q.x,d.q.y,d.q.z,d.q.w];}}if(ref.bone||ref.body){o.attachment={...ref,local:V(...a.local),rotation:Q().fromArray(a.rotation)};o.projectile=false;o.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);o.collider.setCollisionGroups(0);this.updateAttachment(o);}}}
  this.nextID=data.nextID;
  if(data.climbing){let t=this.layout.trees.find(t=>t.id===data.climbing.tree&&t.hp>0);if(t){this.climbing={tree:t,height:data.climbing.height,angle:data.climbing.angle,perched:false};this.player.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);}}
 }
 dispose(){this.world.free();}
}

Object.assign(Simulation.prototype,combatMethods,survivalMethods);
