import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './simulation.js';

const run=(sim,seconds)=>{for(let i=0;i<seconds*60;i++)sim.step(1/60);};
const finite=sim=>sim.world.bodies.every(b=>[b.position.x,b.position.y,b.position.z,b.velocity.x,b.velocity.y,b.velocity.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w].every(Number.isFinite));

test('active rigs walk into contact with dynamic joints and finite motion',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',seed:17});
  assert.equal(sim.world.constraints.length,18);
  const original=sim.fighters[0].parts.torso.body.position.clone();
  run(sim,5);
  assert.ok(sim.fighters[0].parts.torso.body.position.distanceTo(original)>2,'rig moved through forces');
  assert.ok(finite(sim));
  assert.ok(sim.fighters.every(f=>f.parts.torso.body.position.y>.7),'balance maintains usable locomotion');
  assert.ok(sim.fighters.some(f=>f.health<f.maxHealth),'contact or projectiles inflicted real damage');
  sim.dispose();assert.equal(sim.world.bodies.length,0);
});

test('separation removes a physical constraint and Hulk regrowth restores one after a delay',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',seed:1,military:false});
  const hulk=sim.fighters[1],old=hulk.parts.forearmL.body;
  sim.hitPart('hulk','forearmL',999,'test impact');
  assert.equal(hulk.parts.forearmL.detached,true);assert.equal(sim.world.constraints.length,17);
  sim.elapsed=20.9;hulk.lastDamage=sim.elapsed;
  sim._driveFighter(hulk,.01);assert.equal(hulk.parts.forearmL.detached,true,'regrowth takes longer than wound healing');
  sim.elapsed=21.1;sim._driveFighter(hulk,.01);
  assert.equal(hulk.parts.forearmL.detached,false);assert.notEqual(hulk.parts.forearmL.body,old);
  assert.equal(sim.world.constraints.length,18);
  assert.ok(sim.world.bodies.includes(old),'severed limb persists as physical debris');
  sim.dispose();
});

test('regrowth and severe separation options are independent',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',regrowth:false,severing:true,seed:2});
  const h=sim.fighters[1];sim.hitPart('hulk','forearmR',999);sim.elapsed=40;sim._driveFighter(h,.01);
  assert.equal(h.parts.forearmR.detached,true);sim.dispose();
  const noSever=new Simulation({enemy:'hulk',arena:'grass',severing:false});
  noSever.hitPart('hulk','forearmR',999);assert.equal(noSever.fighters[1].parts.forearmR.detached,false);noSever.dispose();
  const venom=new Simulation({enemy:'venom',arena:'grass',regrowth:false});venom.hitPart('venom','forearmR',999);venom.elapsed=14;venom._driveFighter(venom.fighters[1],.01);assert.equal(venom.fighters[1].parts.forearmR.detached,false,'Hulk extension toggle does not disable natural symbiote reform');venom.dispose();
});

test('Veronica consumes finite modules and destruction stops repairs',()=>{
  const sim=new Simulation({enemy:'ultron',arena:'grass',seed:4});
  for(let i=0;i<6;i++){const part=sim.fighters[0].parts.forearmL;sim.hitPart('buster','forearmL',part.health-part.maxHealth*.15);sim.veronica.cooldown=0;sim._repair();}
  assert.equal(sim.veronica.parts,0);
  sim.hitPart('buster','forearmL',130);const hp=sim.fighters[0].parts.forearmL.health;sim.veronica.cooldown=0;sim._repair();assert.equal(sim.fighters[0].parts.forearmL.health,hp);
  sim.veronica.parts=2;sim.damageVeronica(1000);assert.equal(sim.veronica.destroyed,true);
  sim._repair();assert.equal(sim.veronica.parts,2);assert.equal(sim.fighters[0].parts.forearmL.health,hp);
  sim.dispose();
});

test('film-specific loadouts reject other characters powers and charge cooldowns',()=>{
  const sim=new Simulation({enemy:'venom',arena:'grass',seed:3});
  assert.equal(sim.ability('buster','thunderclap'),false);
  assert.equal(sim.ability('buster','repulsor'),true);
  assert.equal(sim.ability('buster','repulsor'),false);
  assert.equal(sim.fighters[0].energy,83);assert.equal(sim.fighters[0].action.kind,'repulsor');sim.fighters[1].decision=999;run(sim,.3);assert.ok(sim.projectiles.length>0,'charged repulsor releases a physical projectile after its windup');
  assert.equal(sim.ability('venom','flight'),false);assert.equal(sim.ability('venom','tendril'),true);
  sim.dispose();
});

test('Hulk rage increases physical punch force by a bounded amount',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',seed:3}),hulk=sim.fighters[1],fist=hulk.parts.forearmR.body;
  hulk.action={kind:'punch',arm:'forearmR',upper:'upperArmR',t:.2,duration:.9};hulk.rage=0;sim._driveFighter(hulk,.001);
  const calm=fist.force.length();fist.force.setZero();hulk.rage=1;sim._driveFighter(hulk,.001);
  assert.ok(Math.abs(fist.force.length()/calm-1.35)<.0001,'rage strengthens motors rather than assigning damage');
  fist.force.setZero();hulk.rage=100;sim._driveFighter(hulk,.001);assert.ok(Math.abs(fist.force.length()/calm-1.35)<.0001,'rage multiplier remains capped');sim.dispose();
});

test('losing both legs lowers the torso to a grounded crawl',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',regrowth:false,seed:7}),hulk=sim.fighters[1];
  sim.hitPart('hulk','thighL',999);sim.hitPart('hulk','thighR',999);
  sim.finished=true;run(sim,4);
  assert.equal(hulk.parts.shinL.detached,true);assert.equal(hulk.parts.shinR.detached,true);
  assert.ok(hulk.parts.torso.body.position.y<1.6,'locomotion support cannot keep a legless torso standing');assert.ok(finite(sim));sim.dispose();
});

test('city has collision-backed buildings, fleeing civilians and optional military',()=>{
  const sim=new Simulation({enemy:'ultron',arena:'city',military:true,seed:21});
  assert.equal(sim.props.filter(p=>p.kind==='building').length,12);
  assert.equal(sim.props.filter(p=>p.kind==='tank').length,2);
  assert.ok(sim.civilians.some(p=>p.military));
  const civilian=sim.civilians.find(p=>!p.military),z=civilian.position.z;
  run(sim,3);assert.equal(civilian.state,'Fleeing');assert.ok(Math.abs(civilian.position.z-z)>1);assert.ok(finite(sim));
  for(const c of sim.civilians)assert.equal(sim.props.some(p=>p.kind==='building'&&Math.abs(c.position.x-p.body.position.x)<p.size[0]/2&&Math.abs(c.position.z-p.body.position.z)<p.size[2]/2),false,'evacuation routes avoid building collision volumes');
  sim.dispose();
  const peaceful=new Simulation({arena:'city',military:false});assert.equal(peaceful.props.some(p=>p.kind==='tank'),false);assert.equal(peaceful.civilians.some(p=>p.military),false);peaceful.dispose();
});

test('disabling blood also suppresses severing blood effects',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',blood:false});
  sim.hitPart('hulk','forearmL',999);assert.equal(sim.effects.some(e=>e.type==='blood'),false);sim.dispose();
});

test('Ultron consciousness transfer consumes a node and leaves the destroyed body behind',()=>{
  const sim=new Simulation({enemy:'ultron',arena:'grass',networkTransfer:true});
  sim.ability('ultron','sentries');const node=sim.props.find(p=>p.kind==='sentry'),oldTorso=sim.fighters[1].parts.torso.body;
  sim.hitPart('ultron','torso',9999);
  assert.equal(sim.finished,false);assert.equal(sim.fighters[1].transfers,1);assert.notEqual(sim.fighters[1].parts.torso.body,oldTorso);assert.equal(node.destroyed,true);
  assert.ok(sim.props.some(p=>p.body===oldTorso));assert.equal(oldTorso.allowSleep,true);assert.equal(sim.world.constraints.length,18);sim.dispose();
});

test('all three opponents remain numerically stable through extended combat',()=>{
  for(const enemy of ['hulk','venom','ultron']){
    const sim=new Simulation({enemy,arena:'city',seed:11});run(sim,30);
    assert.ok(finite(sim),enemy);assert.ok(sim.world.bodies.length<240,'physics body budget remains bounded');assert.ok(sim.props.length<240,'debris bookkeeping remains bounded');
    assert.ok(sim.fighters.every(f=>Number.isFinite(f.health)),enemy);sim.dispose();
  }
});

test('launches move the connected rig ballistically without locomotion braking',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'grass',military:false,seed:7}),victim=sim.fighters[1];
  const start=victim.parts.torso.body.position.clone(),v=victim.parts.torso.body.velocity.clone();v.set(18,7,0);
  sim._launch(victim,v,{duration:1,source:'buster'});sim.finished=true;
  for(const part of Object.values(victim.parts))assert.ok(Math.abs(part.body.velocity.x-18)<1e-8,'the impulse is distributed by connected body mass');
  run(sim,.25);
  assert.ok(victim.parts.torso.body.position.x-start.x>3.8,'the active walking motor does not cancel knockback');
  assert.ok(victim.parts.torso.body.velocity.x>14,'horizontal momentum persists through a physical flight');
  assert.ok(victim.parts.torso.body.position.y>start.y+.9);assert.ok(finite(sim));sim.dispose();
});

test('a launched fighter physically fractures a facade while retaining the tower',()=>{
  const sim=new Simulation({enemy:'hulk',arena:'city',military:false,seed:17}),victim=sim.fighters[1];
  const velocity=victim.parts.torso.body.velocity.clone();velocity.set(15,7,22);
  sim._launch(victim,velocity,{duration:1.2,source:'buster'});sim.finished=true;run(sim,2);
  const damaged=sim.props.find(p=>p.kind==='building'&&p.damageVersion>0);
  assert.ok(damaged,'collision momentum damages a structure without a scripted demolition');
  assert.ok(damaged.fractures.length>0);assert.ok(damaged.body.shapes.length>1,'a compound collider retains the surrounding tower');
  assert.ok(sim.world.bodies.includes(damaged.body));assert.equal(damaged.destroyed,undefined);
  assert.ok(sim.props.some(p=>p.kind==='rubble'&&p.body.mass>100),'the fracture creates substantial physical debris');
  assert.ok(sim.props.some(p=>p.kind==='building'&&!p.damaged&&p.body.shapes.length===1),'other towers remain intact');sim.dispose();
});

test('each opponent produces fast sustained physical action in the opening seconds',()=>{
  for(const enemy of ['hulk','venom','ultron']){
    const sim=new Simulation({enemy,arena:'city',military:false,seed:17});run(sim,8);
    assert.ok(sim.stats.firstLaunch<2,`${enemy}: first meaningful launch happens early`);
    assert.ok(sim.stats.launches>=4,`${enemy}: abilities keep the fight active`);
    assert.ok(sim.stats.maxLaunchSpeed>15,`${enemy}: launches carry superhuman momentum`);
    assert.ok(sim.fighters.every(f=>f.alive),`${enemy}: fights do not immediately dismember or kill everyone`);
    assert.ok(finite(sim));sim.dispose();
  }
});
