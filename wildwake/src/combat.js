import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {DT,SIZE,WATER,ITEMS,SPECIES,height,clamp} from './data.js';
import {V,volumeHit,poseRig} from './rig.js';
const vec=p=>V(p.x,p.y,p.z),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const solid=m=>m&&!['player','animal','anatomy'].includes(m.type);
export const combatMethods={
 weapon(){let id=this.inv.slots[this.selected]?.id;return ['spear','pike','axe'].includes(id)?id:null;},
 damageAnimal(a,amount,point,impulse=V()){
  if(a.health<=0)return false;
  a.health=Math.max(0,a.health-amount);a.provoked=18;a.alert=12;a.recoil=.17;a.brainTimer=0;
  a.body.applyImpulse(impulse,true);a.lastHit=this.elapsed;this.lastCombat={id:a.id,damage:amount,t:this.elapsed};
  this.progress.wildlife=true;this.metrics.impacts++;this.event('impact',point,1);
  if(!a.health){this.defeatAnimal(a);this.notify(`${SPECIES[a.species].name} defeated.`);}
  else {this.setState(a,a.species==='deer'?'retreat':'pursue');this.notify(`${SPECIES[a.species].name} · −${amount} · ${a.health}/${SPECIES[a.species].maxHealth} health`);}
  return true;
 },
 defeatAnimal(a){
  a.health=0;this.setState(a,'dead');a.attackTime=0;a.provoked=0;a.alert=0;
  if(!a.defeated){a.defeated=true;a.clearance=.36;a.body.collider(0).setShape(new RAPIER.Ball(.35));a.body.collider(0).setFriction(.9);a.body.setLinearDamping(2);}
  poseRig(a.rig,a,this.elapsed);
 },
 melee(origin,direction){
  let weapon=this.weapon();if(!weapon)return this.notify('Equip a spear or hatchet.');
  if(this.meleeAttack||this.meleeCooldown>0)return false;
  if(this.stats.stamina<6)return this.notify('Catch your breath before attacking.');
  this.stats.stamina-=6;this.meleeCooldown=.48;
  this.meleeAttack={age:0,weapon,origin:origin.clone(),direction:direction.clone().normalize(),hit:false};
  this.event('swing',this.position,1.2);return true;
 },
 stepMelee(){
  this.meleeCooldown=Math.max(0,(this.meleeCooldown||0)-DT);let a=this.meleeAttack;if(!a)return;
  a.age+=DT;if(a.age>=.4){this.meleeAttack=null;return;}if(a.hit||a.age<.09||a.age>.26)return;
  let origin=this.aim?.origin?.clone()||a.origin,dir=this.aim?.direction?.clone()||a.direction;
  const reach=a.weapon==='axe'?2.25:3.25,padding=a.weapon==='axe'?.2:.23;
  let start=origin.clone().addScaledVector(dir,.12),end=start.clone().addScaledVector(dir,reach),best=null;
  for(let animal of this.animals){if(animal.health<=0||dist(animal.body.translation(),this.position)>reach+2)continue;
   for(let volume of animal.rig.volumes){if(volume.layer!=='outer')continue;let hit=volumeHit(volume,start,end,padding);if(hit&&(!best||hit.f<best.f))best={...hit,animal};}
  }
  if(best&&this.lineVisible(origin,best.point,this.player)){a.hit=true;this.damageAnimal(best.animal,a.weapon==='pike'?42:a.weapon==='axe'?23:32,best.point,dir.multiplyScalar(a.weapon==='pike'?38:27));}
  else if(a.age>.23){let hit=this.world.castRayAndGetNormal(new RAPIER.Ray(start,dir),reach,true,undefined,undefined,undefined,this.player,c=>solid(this.meta.get(c.handle)));if(hit){a.hit=true;let meta=this.meta.get(hit.collider.handle);if(meta?.type==='target'){meta.ref.hits++;this.event('impact',end,.6);this.notify('Practice thrust · contact.');}}}
 },
 throwSolution(origin,direction,charge,assist=true){
  let d=direction.clone().normalize(),speed=18+clamp(charge,0,1)*30;
  // Assistance chooses a near-reticle release direction once. Flight never homes.
  if(assist){let best=null,score=.985;for(let a of this.animals){if(a.health<=0)continue;let center=a.rig.root.getWorldPosition(V()),delta=center.clone().sub(origin),length=delta.length(),dot=delta.normalize().dot(d);
    if(length>3&&length<38&&dot>score&&this.lineVisible(origin,center,this.player)){score=dot;best={a,center,length};}}
   if(best){let t=Math.max(0,(best.length-.65)/speed),target=best.center.addScaledVector(vec(best.a.body.linvel()),t*.85);target.y+=9*t*t;d=target.sub(origin).normalize();}
  }
  return {origin:origin.clone().addScaledVector(d,.65),direction:d,velocity:d.clone().multiplyScalar(speed).addScaledVector(vec(this.player.linvel()),.3),speed};
 },
 throwSpear(origin,direction,charge,assist=true){
  let id=this.weapon();if(id!=='pike'&&id!=='spear'){id=this.inv.count('spear')?'spear':null;}if(!id)return this.notify('Craft and equip a spear first.');
  if(this.stats.stamina<9)return this.notify('Not enough stamina to throw.');
  let solution=this.throwSolution(origin,direction,charge,assist),d=solution.direction;
  let block=this.world.castRay(new RAPIER.Ray(origin,d),.72,true,undefined,undefined,undefined,this.player,c=>solid(this.meta.get(c.handle))&&this.meta.get(c.handle)?.type!=='object');
  if(block)return this.notify('Your release is blocked. Step back from the surface.');
  let obj=this.spawnObject(id,1,solution.origin,{projectile:true,velocity:solution.velocity,rotation:new T.Quaternion().setFromUnitVectors(V(0,1,0),d),angular:d.clone().multiplyScalar(.6)});
  if(!obj)return this.notify('Recover or store some loose objects first.');
  this.inv.remove(id);this.stats.stamina-=9;obj.releaseOrigin=origin.clone();obj.throwCharge=clamp(charge,0,1);obj.hitAnimals=[];
  this.event('throw',solution.origin,3);return obj;
 },
 sweepProjectile(o){
  let p=vec(o.body.translation()),v=vec(o.body.linvel());if(v.length()<2||o.age>12){o.projectile=false;return;}
  let axis=V(0,1,0).applyQuaternion(new T.Quaternion().copy(o.body.rotation())),start=o.releaseOrigin||p.clone().addScaledVector(axis,.87);o.releaseOrigin=null;
  let end=p.clone().addScaledVector(axis,.87).addScaledVector(v,DT).add(V(0,-9*DT*DT,0)),delta=end.clone().sub(start),length=delta.length();if(length<1e-7)return;
  let dir=delta.normalize(),closest=null;
  for(let offset of [V(),V(.045,0,0),V(-.045,0,0),V(0,.045,0),V(0,-.045,0)]){
   this.metrics.sweeps++;let hit=this.world.castRayAndGetNormal(new RAPIER.Ray(start.clone().add(offset),dir),length,true,undefined,undefined,o.collider,this.player,c=>solid(this.meta.get(c.handle)));
   if(hit&&(!closest||hit.timeOfImpact/length<closest.f))closest={f:hit.timeOfImpact/length,point:start.clone().addScaledVector(dir,hit.timeOfImpact),normal:vec(hit.normal),meta:this.meta.get(hit.collider.handle)||{material:'stone'},collider:hit.collider};
  }
  let anatomical=[];for(let a of this.animals){if(dist(a.body.translation(),p)>length+4)continue;for(let volume of a.rig.volumes){let hit=volumeHit(volume,start,end,volume.layer==='outer'?.06:0);if(hit&&!o.hitLayers.includes(a.id+':'+a.rig.volumes.indexOf(volume)))anatomical.push({...hit,animal:a});}}
  anatomical.sort((a,b)=>a.f-b.f);let energy=.5*ITEMS[o.item].mass*v.lengthSq()*.12,last=null;
  o.hitAnimals||=[];
  for(let hit of anatomical){if(closest&&hit.f>closest.f)break;let a=hit.animal,vol=hit.volume,key=a.id+':'+a.rig.volumes.indexOf(vol);o.hitLayers.push(key);this.metrics.anatomy++;last=hit;
   let incidence=Math.abs(dir.dot(hit.normal)),cost=vol.resistance/Math.max(.25,incidence);
   if(!o.hitAnimals.includes(a.id)){o.hitAnimals.push(a.id);let damage=Math.round((o.item==='pike'?48:34)+clamp(v.length()/48,0,1)*(o.item==='pike'?30:24));this.damageAnimal(a,damage,hit.point,v.clone().multiplyScalar(.45));}
   if(energy<=cost||vol.layer==='frame'){this.lodge(o,hit,{bone:vol.bone,animal:a.id,boneIndex:vol.bone.userData.index});return;}
   energy-=cost;v.multiplyScalar(Math.sqrt(Math.max(.1,energy/(energy+cost))));o.body.setLinvel(v,true);
  }
  // The shaft remains caught by the last crossed deforming volume, in that bone's frame.
  if(last){this.lodge(o,last,{bone:last.volume.bone,animal:last.animal.id,boneIndex:last.volume.bone.userData.index});return;}
  if(closest){let h=closest,incidence=Math.abs(dir.dot(h.normal));this.metrics.impacts++;this.event('impact',h.point,.8);
   if(h.meta.type==='target'){h.meta.ref.hits++;this.progress.throw=true;h.meta.ref.body.applyImpulseAtPoint(v.clone().multiplyScalar(.45),h.point,true);}
   if(['soft','wood','soil'].includes(h.meta.material)&&incidence>.22){this.lodge(o,h,{body:h.collider.parent(),target:h.meta.type==='target'?h.meta.ref.id:null,structure:h.meta.type==='structure'?h.meta.ref.id:null,staticId:['tree','rock'].includes(h.meta.type)?h.meta.ref?.id:null});this.notify(`${h.meta.type==='target'?'Range hit':'Surface contact'} · spear recoverable.`);}
   else {o.body.setTranslation(h.point.clone().addScaledVector(h.normal,.15).addScaledVector(axis,-.87),true);o.body.setLinvel(v.reflect(h.normal).multiplyScalar(h.meta.material==='stone'?.35:.18),true);o.body.setAngvel(V(3,2,-2),true);o.projectile=false;this.notify('Hard surface · spear deflected.');}
  }else o.body.setAngvel(axis.clone().cross(v.clone().normalize()).multiplyScalar(12).addScaledVector(dir,.35),true);
 },
 animalBrain(a){
  if(a.health<=0){this.defeatAnimal(a);return;}
  let p=a.body.translation(),s=SPECIES[a.species],player=this.position,d=dist(p,player),dx=player.x-p.x,dz=player.z-p.z,homeDist=dist(p,a.home);
  let visible=d<s.alert&&this.lineVisible({x:p.x,y:p.y+.2,z:p.z},player,a.body),noise=this.events.some(e=>this.elapsed-e.t<1.2&&dist(e.p,p)<e.power*4),fire=this.structures.some(st=>st.fuel>0&&dist(st.p,p)<4);
  if(visible||noise){a.alert=4;if(d<18)this.progress.wildlife=true;}
  if(a.species==='deer'&&a.alert>0&&d<22||a.species!=='deer'&&(a.health<18&&d>4&&d<20||fire&&a.provoked<=0)){
   this.setState(a,'retreat');a.target={x:clamp(p.x-dx/(d||1)*14,-190,190),z:clamp(p.z-dz/(d||1)*14,-190,190)};return;
  }
  let territory=a.species==='jaguar'?(this.phase==='Night'?27:19):12;
  if(a.species!=='deer'&&(a.provoked>0||visible&&dist(player,a.home)<territory)&&d<34&&homeDist<s.territory+18){
   a.target={x:player.x,z:player.z};
   if(player.y-p.y>2.8&&d<5){if(a.state!=='watch')a.watchUntil=this.elapsed+7;this.setState(a,'watch');if(this.elapsed>a.watchUntil){a.provoked=0;a.alert=0;a.target={...a.home};this.setState(a,'roam');a.ignoreUntil=this.elapsed+10;}return;}
   if((a.ignoreUntil||0)<this.elapsed){this.setState(a,d<2.15?'attack':'pursue');return;}
  }
  if(['attack','pursue','watch','retreat'].includes(a.state)){this.setState(a,'roam');a.target={...a.home};}
  if(a.thirst>65){this.setState(a,'drink');a.target={x:8,z:4};if(dist(p,a.target)<2)a.thirst=Math.max(0,a.thirst-12);return;}
  if((a.fatigue>70||this.phase==='Night'&&a.species!=='jaguar')&&a.alert<=0){this.setState(a,'rest');return;}
  if(a.state==='rest'){if(a.fatigue<10&&this.phase!=='Night')this.setState(a,'roam');return;}
  if(a.state==='graze'&&a.stateAge<6)return;
  if(dist(p,a.target)<2||a.stateAge>12||a.state==='graze'){
   if(a.species==='deer'&&a.state!=='graze'&&this.random()<.4)this.setState(a,'graze');
   else {this.setState(a,'roam');a.stateAge=0;a.target={x:clamp(a.home.x+(this.random()-.5)*28,-188,188),z:clamp(a.home.z+(this.random()-.5)*28,-188,188)};}
  }
 },
 stepAnimal(a){
  let p=a.body.translation(),s=SPECIES[a.species];if(a.health<=0){if(!a.defeated)this.defeatAnimal(a);return;}
  if(dist(p,this.position)>85){if(!a.distant){a.body.setLinvel(V(),true);a.body.sleep();a.distant=true;}return;}if(a.distant){a.body.wakeUp();a.distant=false;}
  a.stateAge+=DT;a.brainTimer-=DT;a.alert=Math.max(0,a.alert-DT);a.provoked=Math.max(0,(a.provoked||0)-DT);a.cooldown=Math.max(0,a.cooldown-DT);a.recoil*=.91;a.thirst+=DT*.045;
  if(a.brainTimer<=0){this.animalBrain(a);a.brainTimer=dist(p,this.position)>40?.6:.16;}
  let moving=['roam','retreat','pursue','drink'].includes(a.state),running=['retreat','pursue'].includes(a.state),speed=moving?(running?s.run:s.speed):0;
  if(a.state==='drink'&&dist(p,a.target)<2)speed=0;
  a.fatigue=clamp(a.fatigue+DT*(running?.45:a.state==='rest'?-3:-.3),0,100);
  let desired=V(a.target.x-p.x,0,a.target.z-p.z).normalize();
  if(speed>0){for(let o of this.statics){if(o.ref?.hp<=0)continue;let ox=p.x-o.x,oz=p.z-o.z,d=Math.hypot(ox,oz),ahead=(o.x-p.x)*desired.x+(o.z-p.z)*desired.z;
    if(d<o.r+2.4&&ahead>-.8){let force=(o.r+2.4-d)/(o.r+2.4);desired.x+=ox/(d||.1)*force*3;desired.z+=oz/(d||.1)*force*3;}}
   for(let st of this.structures){let d=dist(p,st.p),r=st.kind==='shelter'?3.3:st.kind==='palisade'?2.4:1.5;if(d<r+1){desired.x+=(p.x-st.p.x)/(d||1)*2;desired.z+=(p.z-st.p.z)/(d||1)*2;}}
   if(height(p.x+desired.x*2,p.z+desired.z*2)<WATER-.1&&a.state!=='drink'){desired.x+=p.x<15?-1.8:1.8;desired.z+=p.z<5?-1:1;}
  }
  desired.normalize();let velocity=a.body.linvel(),targetYaw=Math.atan2(-desired.x,-desired.z),angle=Math.atan2(Math.sin(targetYaw-a.yaw),Math.cos(targetYaw-a.yaw));
  if(speed>0||['attack','watch'].includes(a.state)){a.yaw+=clamp(angle,-DT*4.5,DT*4.5);speed*=Math.max(.25,Math.cos(angle));}a.look=0;
  a.body.applyImpulse(V(clamp((-Math.sin(a.yaw)*speed-velocity.x)*s.mass*DT*8,-s.mass*.5,s.mass*.5),0,clamp((-Math.cos(a.yaw)*speed-velocity.z)*s.mass*DT*8,-s.mass*.5,s.mass*.5)),true);
  a.gait+=Math.hypot(velocity.x,velocity.z)*DT*(a.species==='chimp'?5:4.3);
  if(a.state==='attack'&&a.cooldown<=0&&a.attackTime<=0&&Math.abs(angle)<.65){a.attackTime=.65;a.attackHit=false;a.cooldown=1.6;let direction=vec(this.position).sub(vec(p));direction.y=0;a.body.applyImpulse(direction.normalize().multiplyScalar(s.mass*1.45),true);this.event('animal',p);}
  if(a.attackTime>0){a.attackTime-=DT;let t=.65-a.attackTime,forward=V(-Math.sin(a.yaw),0,-Math.cos(a.yaw)),contact=vec(p).addScaledVector(forward,.85),delta=vec(this.position).sub(vec(p));
   if(t>.12&&t<.39&&!a.attackHit&&dist(contact,this.position)<1.2&&Math.abs(p.y-this.position.y)<1.1&&delta.normalize().dot(forward)>.3&&this.lineVisible(p,this.position,a.body)){a.attackHit=true;this.metrics.attacks++;this.stats.health=Math.max(0,this.stats.health-(a.species==='jaguar'?14:11));this.player.applyImpulse(forward.multiplyScalar(135).add(V(0,20,0)),true);this.event('hurt',this.position);}
  }
  if(p.y<height(p.x,p.z)-3||Math.max(Math.abs(p.x),Math.abs(p.z))>SIZE-5){a.body.setTranslation({x:a.home.x,y:height(a.home.x,a.home.z)+a.clearance,z:a.home.z},true);a.body.setLinvel(V(),true);}
 }
};
