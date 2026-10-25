import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './simulation.js';

const make=(options={})=>new Simulation({hero:'titan',enemy:'venom',arena:'grass',military:false,seed:19,...options});
const run=(sim,seconds)=>{for(let i=0;i<Math.ceil(seconds*120);i++)sim.step(1/120);};
const stopAI=sim=>{for(const f of sim.fighters)f.decision=1e6;};
const finite=sim=>sim.world.bodies.every(b=>[b.position.x,b.position.y,b.position.z,b.velocity.x,b.velocity.y,b.velocity.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w].every(Number.isFinite));
const placeNear=(sim,gap=3)=>{
  const hero=sim.fighters[0],enemy=sim.fighters[1];
  const delta=hero.parts.torso.body.position.vsub(enemy.parts.torso.body.position);delta.x+=gap;delta.y=0;
  for(const part of Object.values(enemy.parts)){part.body.position.vadd(delta,part.body.position);part.body.velocity.setZero();part.body.angularVelocity.setZero();}
  hero.yaw=Math.PI/2;return [hero,enemy];
};
const targetDirection=f=>{const delta=f.target.parts.torso.body.position.vsub(f.parts.torso.body.position);delta.y=0;delta.normalize();return delta;};
const ready=(sim,f,name)=>{f.energy=100;f.action=null;f.staggerUntil=0;f.gasUntil=0;f.cooldowns[name]=0;f.airborne=false;};

test('Titan is a separate selectable 3.35m hero with high-altitude Sunday support',()=>{
  const sim=make(),t=sim.fighters[0];
  assert.equal(t.id,'titan');assert.equal(t.type,'titan');assert.equal(t.isHero,true);
  assert.ok(Math.abs(t.scale*4.45-3.35)<.01);
  assert.equal(t.parts.torso.body.collisionFilterGroup,2);assert.equal(sim.fighters[1].parts.torso.body.collisionFilterGroup,4);
  assert.equal(sim.support,sim.veronica);assert.equal(sim.support.name,'SUNDAY');
  assert.ok(sim.support.body.position.y>=30);assert.equal(sim.support.maxParts,8);
  assert.deepEqual(t.missiles,{L:15,R:15});assert.equal(sim.ability('titan','gas'),false,'the custom hero does not inherit an unspecified sedative weapon');
  sim.dispose();
  const original=new Simulation({hero:'buster',enemy:'venom',arena:'grass'});assert.equal(original.fighters[0].type,'buster');assert.equal(original.support.name,'VERONICA');original.dispose();
});

test('dual pistons exclude palm cannon and Red Thruster attacks, but mixed arms are supported',()=>{
  const sim=make();stopAI(sim);const [t]=placeNear(sim);
  assert.equal(sim.ability('titan','pistons'),true);
  t.parts.forearmL.body.force.setZero();t.parts.forearmR.body.force.setZero();sim._updateAction(t,.1,targetDirection(t),3);
  assert.ok(t.parts.forearmL.body.force.length()>1000&&t.parts.forearmR.body.force.length()>1000,'both piston mechanisms accelerate their arms in the same attack phase');
  assert.equal(t.redThrusterUntil.L,0);assert.equal(t.redThrusterUntil.R,0);
  const energy=t.energy;
  assert.equal(sim.ability('titan','repulsor'),false,'two piston arms leave no free palm cannon');
  assert.equal(sim.ability('titan','redPunch'),false,'Red Thrusters cannot stack with piston mechanics');
  assert.equal(t.energy,energy,'rejected combinations spend no energy');
  run(sim,1.3);placeNear(sim,3);ready(sim,t,'mixed');
  assert.equal(sim.ability('titan','mixed'),true);
  assert.notEqual(t.armModes.L,t.armModes.R,'mixed attack allocates a separate mechanism to each arm');
  run(sim,.5);
  assert.ok(sim.effects.some(e=>e.type==='beam')||sim.projectiles.some(p=>p.owner==='titan'&&p.kind==='repulsor')||sim.events.some(e=>/mixed|opposite|palm|repulsor/i.test(e.text)),'the opposite palm fires during the mixed-arm action');
  assert.ok(finite(sim));sim.dispose();
});

test('Red Thruster punch is a separate single-arm action',()=>{
  const sim=make();stopAI(sim);const [t]=placeNear(sim);
  assert.equal(sim.ability('titan','redPunch'),true);assert.equal(t.action.kind,'redPunch');
  assert.equal(sim.ability('titan','pistons'),false);
  run(sim,.2);assert.ok(Object.values(t.redThrusterUntil).some(time=>time>0));assert.ok(finite(sim));sim.dispose();
});

test('forearm launchers have exactly thirty finite guided missiles and repairs do not reload them',()=>{
  const sim=make();stopAI(sim);const t=sim.fighters[0],target=sim.fighters[1];target.maxHealth*=20;target.health=target.maxHealth;
  let attempts=0,previous=30;
  while(t.missiles.L+t.missiles.R>0&&attempts++<20){
    placeNear(sim,12);ready(sim,t,'missiles');sim.elapsed+=5;
    assert.equal(sim.ability('titan','missiles'),true);
    run(sim,1.2);
    const remaining=t.missiles.L+t.missiles.R;
    assert.ok(remaining<previous,'a launched volley consumes its physical stock');assert.ok(previous-remaining<=3,'a volley never dumps more than three missiles');
    assert.ok(t.missiles.L>=0&&t.missiles.R>=0);previous=remaining;
  }
  assert.equal(t.missiles.L+t.missiles.R,0);
  ready(sim,t,'missiles');assert.equal(sim.ability('titan','missiles'),false);
  sim._restore(t,'forearmL');assert.equal(t.missiles.L,0,'replacement armor is not an invented ammunition refill');
  assert.ok(finite(sim));sim.dispose();
});

test('homing missiles physically turn toward a moving target and detached arms cannot fire',()=>{
  const sim=make();stopAI(sim);const t=sim.fighters[0],target=sim.fighters[1];
  t.parts.forearmL.detached=true;assert.equal(sim._fireTitanMissile(t),true);
  assert.equal(t.missiles.L,15);assert.equal(t.missiles.R,14,'only the attached launcher spends ammunition');
  const shot=sim.projectiles.find(p=>p.kind==='missile'),origin=shot.body.position.clone(),initialZ=shot.body.velocity.z;
  for(const part of Object.values(target.parts))part.body.position.z+=12;
  run(sim,.15);
  assert.equal(shot.hit,false);assert.ok(shot.body.velocity.z>initialZ+1,'steering responds to the target after launch');
  assert.ok(shot.body.position.distanceTo(origin)>2&&shot.body.position.distanceTo(origin)<10,'the missile travels continuously rather than snapping onto its target');
  t.parts.forearmR.detached=true;assert.equal(sim._fireTitanMissile(t),false);assert.equal(t.missiles.L,15);assert.equal(t.missiles.R,14);sim.dispose();
});

test('Titan flight is sustained but consumes energy, rather than inheriting the short Hulkbuster burst',()=>{
  const sim=make();stopAI(sim);const t=sim.fighters[0];
  assert.equal(sim.ability('titan','flight'),true);const initial=t.energy;
  run(sim,4.5);assert.ok(t.flight>sim.elapsed,'Titan can remain powered beyond the other suits burst limits');assert.ok(t.energy<initial);
  assert.equal(sim.ability('titan','flight'),true,'the same command requests landing');assert.ok(t.flight<=sim.elapsed);
  assert.ok(finite(sim));sim.dispose();
});

test('air-suction stabilization reduces real grounded knockback but does not anchor in deep water',()=>{
  const plain=make(),anchored=make();stopAI(plain);stopAI(anchored);
  const a=anchored.fighters[0],b=plain.fighters[0];assert.equal(anchored.ability('titan','anchor'),true);
  const velocity=b.parts.torso.body.velocity.clone();velocity.set(20,5,0);
  plain._launch(b,velocity.clone(),{source:'venom'});anchored._launch(a,velocity.clone(),{source:'venom'});
  assert.ok(a.parts.torso.body.velocity.x<b.parts.torso.body.velocity.x*.65);
  plain.dispose();anchored.dispose();
  const wet=make({waterDepth:2.4});assert.equal(wet.ability('titan','anchor'),false);wet.dispose();
});

test('wrist guards reduce incoming damage without making Zeno armor invulnerable',()=>{
  const plain=make({enemy:'hulk'}),guarded=make({enemy:'hulk'}),a=plain.fighters[0],b=guarded.fighters[0];
  assert.equal(guarded.ability('titan','shield'),true);
  plain.hitPart('titan','forearmR',100,'hulk');guarded.hitPart('titan','forearmR',100,'hulk');
  assert.ok(b.maxHealth-b.health<a.maxHealth-a.health);assert.ok(b.health<b.maxHealth,'guarding still permits damage');
  plain.dispose();guarded.dispose();
});

test('Zeno rope physically restrains the body and can break free',()=>{
  const sim=make();stopAI(sim);const [t,target]=placeNear(sim,4),before=sim.world.constraints.length;
  const hp=target.health;assert.equal(sim.ability('titan','rope'),true);
  assert.ok(t.restraint?.links.length>=3,'rope constraints distribute restraint over multiple body regions');
  assert.equal(target.boundBy,'titan');assert.ok(sim.world.constraints.length>before);assert.equal(target.health,hp,'restraint is nonlethal');
  const linked=new Set(t.restraint.links.flatMap(c=>[c.bodyA,c.bodyB]));
  assert.ok(linked.has(target.parts.forearmL.body)||linked.has(target.parts.forearmR.body));
  assert.ok(linked.has(target.parts.shinL.body)||linked.has(target.parts.shinR.body)||linked.has(target.parts.thighL.body));
  t.restraint.health=0;sim._updateRestraint(t,.01);
  assert.equal(t.restraint,null);assert.ok(!target.boundBy);assert.equal(sim.world.constraints.length,before);sim.dispose();
});

test('a stable sustained restraint produces capture alive instead of assigning lethal damage',()=>{
  const sim=make();stopAI(sim);const [t,target]=placeNear(sim,4);target.health=target.maxHealth*.2;
  assert.equal(sim.ability('titan','rope'),true);
  for(let i=0;i<50&&!sim.finished&&t.restraint;i++){
    for(const p of Object.values(target.parts))p.body.velocity.setZero();
    sim.elapsed+=.1;sim._updateRestraint(t,.1);
  }
  assert.equal(sim.finished,true);assert.equal(sim.outcome,'capture');assert.equal(sim.winner,t.name);
  assert.ok(target.health>0);assert.match(target.state,/captured/i);
  const links=[...t.restraint.links];sim._updateRestraint(t,.1);assert.ok(t.restraint,'capture retains the physical bindings');assert.ok(links.every(link=>sim.world.constraints.includes(link)));sim.dispose();
});

test('optical stealth affects long-range visual tracking without defeating close senses or Ultron sensors',()=>{
  const sim=make(),t=sim.fighters[0],observer=sim.fighters[1];stopAI(sim);
  const seen=sim._perceivedTarget(observer).clone();assert.equal(sim.ability('titan','stealth'),true);
  for(const p of Object.values(t.parts))p.body.position.z+=8;
  const hidden=sim._perceivedTarget(observer);assert.ok(hidden.distanceTo(t.parts.torso.body.position)>1);assert.ok(hidden.distanceTo(seen)<1,'ordinary visual tracking uses the previous sighting');
  const shift=t.parts.torso.body.position.vsub(observer.parts.torso.body.position);shift.x+=2;shift.y=0;
  for(const p of Object.values(observer.parts))p.body.position.vadd(shift,p.body.position);
  assert.ok(sim._perceivedTarget(observer).distanceTo(t.parts.torso.body.position)<.1);sim.dispose();
  const sensor=make({enemy:'ultron'});sensor.ability('titan','stealth');assert.ok(sensor._perceivedTarget(sensor.fighters[1]).distanceTo(sensor.fighters[0].parts.torso.body.position)<.1);sensor.dispose();
});

test('deep flooding degrades Titan power and systems instead of granting water immunity or instant defeat',()=>{
  const wet=make({waterDepth:2.4}),dry=make();stopAI(wet);stopAI(dry);
  run(wet,8);run(dry,8);const a=wet.fighters[0],b=dry.fighters[0];
  assert.ok(a.waterExposure>0);assert.ok(a.energy<b.energy);assert.ok(a.health<b.health);assert.equal(a.alive,true);
  assert.ok(finite(wet)&&finite(dry));wet.dispose();dry.dispose();
});

test('Sunday sends a physical replacement and losing Sunday does not disable onboard AI',()=>{
  const sim=make();stopAI(sim);const t=sim.fighters[0],part=t.parts.forearmL;
  part.health=part.maxHealth*.1;t.health=t.maxHealth*.7;sim.support.cooldown=0;
  const before=part.health,stock=sim.support.parts;sim._repair();
  assert.equal(sim.support.parts,stock-1);assert.equal(part.health,before,'repair waits for the delivery');
  assert.ok(sim.props.some(p=>p.kind==='repairModule'&&!p.destroyed));run(sim,1.8);assert.ok(t.parts.forearmL.health>before);
  sim.damageVeronica(1e6);assert.equal(sim.support.destroyed,true);assert.equal(t.alive,true);
  ready(sim,t,'repulsor');assert.equal(sim.ability('titan','repulsor'),true,'Sunday is not the onboard combat brain');
  sim.dispose();
});

test('Titan remains finite across all six physical matchups',()=>{
  for(const enemy of ['hulk','venom','ultron','carnage','thing','wolverine']){
    const sim=make({enemy,arena:'city',military:true,seed:33});run(sim,20);
    assert.ok(finite(sim),enemy);assert.ok(sim.world.bodies.length<260,enemy);assert.ok(Number.isFinite(sim.fighters[0].health));
    assert.ok(sim.fighters[0].missiles.L>=0&&sim.fighters[0].missiles.R>=0);sim.dispose();
  }
});

test('kick, tackle and body slam use limb or rig forces, with slam damage deferred to contact',()=>{
  for(const name of ['kick','tackle','slam']){
    const sim=new Simulation({hero:'titan',enemy:'hulk',arena:'grass',military:false,seed:15});const titan=sim.fighters[0],victim=sim.fighters[1];
    for(const f of sim.fighters)f.decision=999;
    for(const p of Object.values(victim.parts))p.body.position.x-=8;
    const hp=victim.health;assert.equal(sim.ability('titan',name),true,name);assert.equal(victim.health,hp,'activation itself cannot assign the outcome');
    if(name==='kick'){titan.action.t=.15;sim._updateAction(titan,.01);assert.ok(titan.parts[titan.action.leg].body.force.length()>0,'an actual shin receives the kick force');}
    if(name==='tackle')assert.ok(titan.parts.torso.body.velocity.length()>10,'the heavy rig receives physical momentum');
    if(name==='slam'){titan.grappleTime=.001;sim._updateGrapple(titan,.01);assert.ok(victim.parts.torso.body.velocity.y< -12,'held target is driven downward');assert.equal(victim.health,hp,'slamming health loss waits for contact');}
    sim.dispose();
  }
});
