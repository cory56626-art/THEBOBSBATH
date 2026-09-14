import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {DT,WATER,ITEMS,RECIPES,height,clamp} from './data.js';
import {V} from './rig.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),vec=p=>V(p.x,p.y,p.z);
export const survivalMethods={
 setupExpansion(saved){
  this.waterCharges=saved?.waterCharges||0;this.torchOn=saved?.torchOn??true;this.spawnPoint=saved?.spawnPoint||{x:0,z:16};this.climbing=null;this.grabbed=null;this.streamTimer=0;
  this.activatedResources=new Set(saved?.activatedResources||(saved?this.layout.resources.filter(r=>!r.id.startsWith('outer')).map(r=>r.id):[]));this.dormantObjects=saved?.dormantObjects||[];for(let o of saved?.objects||[])this.activatedResources.add(o.id);
  for(let t of this.layout.trees){if(!t.body)continue;let a=t.seed*6,s=t.scale;
   for(let side of [0,Math.PI]){let angle=a+side;this.addCollider(RAPIER.ColliderDesc.cuboid(.95*s,.13*s,.19*s).setTranslation(Math.cos(angle)*.9*s,s,Math.sin(angle)*.9*s).setRotation(new T.Quaternion().setFromAxisAngle(V(0,1,0),-angle)),t.body,{type:'tree',material:'wood',ref:t});}
  }
 },
 streamResources(){
  const p=this.position;
  for(let o of [...this.objects]){if(!o.attachment&&!o.projectile&&o!==this.grabbed&&o.age>2&&dist(o.body.translation(),p)>75){this.dormantObjects.push({id:o.id,item:o.item,n:o.n,p:{...o.body.translation()},q:{...o.body.rotation()},v:{...o.body.linvel()},w:{...o.body.angvel()}});this.removeObject(o);}}
  this.dormantObjects=this.dormantObjects.filter(d=>{if(dist(d.p,p)>55)return true;return !this.spawnObject(d.item,d.n,vec(d.p),{id:d.id,rotation:d.q,velocity:d.v,angular:d.w});});
  for(let r of this.layout.resources){if(this.activatedResources.has(r.id)||dist(r,p)>52)continue;let o=this.spawnObject(r.item,r.n,V(r.x,height(r.x,r.z)+.33,r.z),{id:r.id});if(o)this.activatedResources.add(r.id);}
 },
 nearWorkbench(){return this.structures.some(s=>s.kind==='workbench'&&dist(s.p,this.position)<6);},
 craft(id){let recipe=RECIPES.find(r=>r.id===id);if(recipe?.station&&!this.nearWorkbench())return this.notify('Place a workbench and stand within six steps to craft this.');let result=this.inv.craft(id);if(result.ok){if(id==='axe'||id==='spear')this.progress[id]=true;let slot=this.inv.slots.findIndex(s=>s?.id===id);if(slot>=0)this.selected=slot;this.event('craft',this.position);}this.notify(result.message);return result.ok;},
 nearWater(){return height(this.position.x,this.position.z)<WATER+.8&&dist(this.position,{x:15,z:5})<15&&this.position.y<WATER+2;},
 consume(index=this.selected){
  let slot=this.inv.slots[index],id=slot?.id;if(!id)return this.notify('Select food or usable equipment first.');
  if(id==='bandage'){if(this.stats.health>=100)return this.notify('Your health is already full.');this.stats.health=clamp(this.stats.health+30,0,100);this.inv.remove(id);this.notify('Field wrap · +30 health.');return true;}
  if(id==='waterskin'){if(this.nearWater()){this.waterCharges=3;this.notify('Water pouch filled · 3 drinks.');return true;}if(!this.waterCharges)return this.notify('Fill the pouch beside Glasswater pool or at a rain catcher.');if(this.stats.thirst>=100)return this.notify('You are not thirsty.');this.waterCharges--;this.stats.thirst=clamp(this.stats.thirst+45,0,100);this.notify(`Water pouch · ${this.waterCharges} drinks left.`);return true;}
  if(id==='torch'){this.torchOn=!this.torchOn;this.notify(this.torchOn?'Torch lit.':'Torch extinguished.');return true;}
  if(!ITEMS[id].food)return this.notify('Select food, a field wrap, water pouch, or torch.');
  this.stats.hunger=clamp(this.stats.hunger+ITEMS[id].food,0,100);this.stats.health=clamp(this.stats.health+3,0,100);this.inv.remove(id);this.event('eat',this.position);this.notify('A little better.');return true;
 },
 mine(rock){
  if(!rock||dist(rock,this.position)>4)return this.notify('Move closer to a rock.');if(this.inv.slots[this.selected]?.id!=='pickaxe')return this.notify('Equip a stone pick to mine this rock.');
  if(this.chopCooldown>0)return false;if(this.stats.stamina<10)return this.notify('Catch your breath before mining.');if(!this.inv.canAdd('stone',5))return this.notify('Make room for five stone.');
  this.chopCooldown=.65;this.stats.stamina-=10;this.inv.add('stone',5);this.event('chop',this.position,2);this.notify('+5 stone · mined.');return true;
 },
 climbTree(tree=null){
  if(this.climbing){this.dismount();return true;}if(!tree)tree=this.layout.trees.filter(t=>t.hp>0).sort((a,b)=>dist(a,this.position)-dist(b,this.position))[0];
  if(!tree||tree.hp<=0||dist(tree,this.position)>2.8)return this.notify('Stand close to a tree, then press T / CLIMB.');if(this.stats.stamina<12)return this.notify('Rest before climbing.');
  if(!this.lineVisible(this.position,{x:tree.x,y:this.position.y,z:tree.z},this.player)){
   let d=V(tree.x-this.position.x,0,tree.z-this.position.z),ray=this.world.castRay(new RAPIER.Ray(this.position,d.clone().normalize()),Math.max(0,d.length()-.5*tree.scale),true,undefined,undefined,undefined,this.player,c=>{let m=this.meta.get(c.handle);return m?.type!=='anatomy'&&m?.ref!==tree;});if(ray)return this.notify('The trunk is blocked from this side.');
  }
  this.grabbed=null;this.climbing={tree,angle:tree.seed*6,height:Math.max(.86,this.position.y-height(tree.x,tree.z)),perched:false};
  this.player.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);this.player.setLinvel(V(),true);this.notify('Climbing · W/S or joystick up/down · Space to jump off.');return true;
 },
 dismount(jump=false){let c=this.climbing;if(!c)return false;this.climbing=null;this.player.setBodyType(RAPIER.RigidBodyType.Dynamic,true);let outward=V(Math.cos(c.angle),0,Math.sin(c.angle));this.player.setLinvel(outward.multiplyScalar(jump?4:1.7).add(V(0,jump?4:0,0)),true);this.notify(jump?'Jumped from the tree.':'Released the trunk.');return true;},
 stepClimbing(){
  let c=this.climbing;if(!c)return;if(!c.tree.body||c.tree.hp<=0||this.stats.stamina<=0||this.input.jump){let jump=this.input.jump;this.input.jump=false;this.dismount(jump);return;}
  let s=c.tree.scale,top=4*s+.13*s+.85,move=clamp(this.input.climb||0,-1,1);c.height=clamp(c.height+move*DT*2.5,.85,top);c.perched=c.height>=top-.02;
  let r=c.perched?1.05*s:.27*s+.42,y=height(c.tree.x,c.tree.z)+c.height;
  this.player.setNextKinematicTranslation({x:c.tree.x+Math.cos(c.angle)*r,y,z:c.tree.z+Math.sin(c.angle)*r});
  this.stats.stamina=clamp(this.stats.stamina+DT*(c.perched?10:Math.abs(move)>.05?-6:-1),0,100);this.stats.hunger=Math.max(0,this.stats.hunger-DT*.025);this.stats.thirst=Math.max(0,this.stats.thirst-DT*.04);
  if(c.height<=.86&&move<0)this.dismount();
 },
 grabObject(o=null){
  if(this.grabbed){this.grabbed=null;this.notify('Object released.');return true;}if(this.climbing)return this.notify('Release the tree before moving an object.');
  if(!o||o.removed||o.projectile||vec(o.body.translation()).distanceTo(vec(this.position))>4)return this.notify('Look at a loose object within reach.');if(o.attachment)this.release(o);
  this.grabbed=o;o.body.wakeUp();this.notify(`Holding ${ITEMS[o.item].name.toLowerCase()} · G / GRAB to release.`);return true;
 },
 stepSurvival(){
  this.streamTimer-=DT;if(this.streamTimer<=0){this.streamResources();this.streamTimer=1;}
  for(let s of this.structures)if(s.kind==='collector'&&this.rain)s.water=clamp((s.water||0)+DT*.5,0,100);
  if(this.grabbed){let o=this.grabbed;if(o.removed||!this.aim){this.grabbed=null;return;}let p=vec(o.body.translation()),destination=this.aim.origin.clone().addScaledVector(this.aim.direction,2.1);if(p.distanceTo(this.aim.origin)>5){this.grabbed=null;return;}
   let force=destination.sub(p).multiplyScalar(20).sub(vec(o.body.linvel()).multiplyScalar(6)),mass=o.body.mass();force.y+=18;force.clampLength(0,75);o.body.applyImpulse(force.multiplyScalar(mass*DT),true);o.body.setAngvel(vec(o.body.angvel()).multiplyScalar(.94),true);
  }
 },
 collectWater(s){if(s.kind!=='collector'||dist(s.p,this.position)>4)return false;if((s.water||0)<20)return this.notify('The catcher needs more rainfall.');s.water-=20;if(this.inv.count('waterskin')){this.waterCharges=3;this.notify('Water pouch refilled.');}else {this.stats.thirst=100;this.notify('Rainwater · thirst restored.');}return true;},
 rest(s){if(!['shelter','bedroll'].includes(s.kind)||dist(s.p,this.position)>3)return this.notify('Move close to your shelter or bedroll.');if(this.animals.some(a=>a.health>0&&['attack','pursue'].includes(a.state)&&dist(a.body.translation(),this.position)<15))return this.notify('An animal is too close to rest.');if(this.stats.hunger<20||this.stats.thirst<20)return this.notify('Eat and drink before resting.');if(s.kind==='bedroll')this.spawnPoint={x:s.p.x,z:s.p.z};this.stats.hunger-=12;this.stats.thirst-=14;this.stats.health=clamp(this.stats.health+28,0,100);this.stats.stamina=100;this.stats.exposure=0;this.time=(Math.floor(this.time/720)+1)*720+105;this.notify(s.kind==='bedroll'?'Morning · return point set to this bedroll.':'A new morning. Your camp held through the night.');return true;},
 setCamp(s){if(s.kind!=='bedroll'||dist(s.p,this.position)>4)return false;this.spawnPoint={x:s.p.x,z:s.p.z};this.notify('Return point set to this bedroll.');return true;},
 placement(kind,p,yaw=0){
  if(!ITEMS[kind]?.build)return {ok:false,message:'Select a building kit.'};if(dist(this.position,p)>6)return {ok:false,message:'Place within reach.'};
  let radii={shelter:2.4,plank:1.1,bridge:2.1,palisade:1.7,foundation:2.1,bedroll:1,workbench:1.1},r=radii[kind]||.8,y=height(p.x,p.z),loose=['plank','bridge'].includes(kind);
  let support=this.structures.find(s=>s.kind==='foundation'&&Math.abs(p.x-s.p.x)<1.4&&Math.abs(p.z-s.p.z)<1.4);if(support&&!['foundation','shelter'].includes(kind))y=support.p.y+.7;
  if(!loose&&y<WATER+.15)return {ok:false,message:'The ground is too wet. Bridge timber can span water.'};
  if(Math.max(Math.abs(p.x),Math.abs(p.z))>198)return {ok:false,message:'Build inside the outer ridge.'};
  if(!support&&!loose&&[-1,1].some(a=>[-1,1].some(b=>Math.abs(height(p.x+a*r,p.z+b*r)-y)>.8)))return {ok:false,message:'Find a gentler slope.'};
  if(this.statics.some(o=>dist(o,p)<o.r+r*.65)||this.structures.some(o=>o!==support&&dist(o.p,p)<(o.kind==='shelter'?2.6:o.kind==='foundation'?2.1:1)+r*.65)||dist(this.position,p)<r+.45)return {ok:false,message:'Placement blocked. Leave space around the structure.'};
  if(this.animals.some(a=>a.health>0&&dist(a.body.translation(),p)<r+.65))return {ok:false,message:'An animal is in the way.'};return {ok:true,p:V(p.x,y,p.z),yaw};
 }
};
