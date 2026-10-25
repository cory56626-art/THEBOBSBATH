import * as C from './vendor/cannon-es.js';

// Simulation units are metres, kilograms, seconds. Masses, durability and motor
// strengths are game settings, not measurements from the films. Locomotion uses
// active balance/pose motors; impacts, joints, debris and knockback use dynamics.
const V = (x=0,y=0,z=0) => new C.Vec3(x,y,z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const xyz=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>a.distanceTo(b);
const CONFIG={
  buster:{name:'HULKBUSTER',mass:2300,scale:1,armor:1.05,energy:100,color:0x7cffff},
  hulk:{name:'HULK',mass:1050,scale:.91,armor:1.12,energy:100,color:0x92dc63},
  venom:{name:'VENOM',mass:650,scale:.84,armor:.87,energy:100,color:0xc5d5f0},
  ultron:{name:'ULTRON',mass:600,scale:.86,armor:1.1,energy:100,color:0xff514d},
};
const SHAPES={torso:[1.65,1.65,1.0],head:[.78,.66,.74],upperArmL:[.78,1.02,.78],forearmL:[.86,1.04,.86],upperArmR:[.78,1.02,.78],forearmR:[.86,1.04,.86],thighL:[.66,1.05,.74],shinL:[.70,.95,.82],thighR:[.66,1.05,.74],shinR:[.70,.95,.82]};
const OFFSETS={torso:[0,2.95,0],head:[0,4.12,0],upperArmL:[-1.2,3.06,0],forearmL:[-1.2,2.03,0],upperArmR:[1.2,3.06,0],forearmR:[1.2,2.03,0],thighL:[-.49,1.58,0],shinL:[-.49,.57,.08],thighR:[.49,1.58,0],shinR:[.49,.57,.08]};
const PARENT={head:'torso',upperArmL:'torso',forearmL:'upperArmL',upperArmR:'torso',forearmR:'upperArmR',thighL:'torso',shinL:'thighL',thighR:'torso',shinR:'thighR'};
const JOINTS={head:[0,3.78,0],upperArmL:[-1.2,3.57,0],forearmL:[-1.2,2.55,0],upperArmR:[1.2,3.57,0],forearmR:[1.2,2.55,0],thighL:[-.49,2.1,0],shinL:[-.49,1.05,.04],thighR:[.49,2.1,0],shinR:[.49,1.05,.04]};
const WEIGHTS={torso:.43,head:.045,upperArmL:.085,forearmL:.095,upperArmR:.085,forearmR:.095,thighL:.045,shinL:.035,thighR:.045,shinR:.035};
const HP={torso:320,head:145,upperArmL:150,forearmL:160,upperArmR:150,forearmR:160,thighL:150,shinL:145,thighR:150,shinR:145};

export class Simulation {
  constructor(options={}){
    this.options={enemy:'hulk',arena:'city',regrowth:true,severing:true,blood:true,military:true,...options};
    this.seed=(options.seed??Math.floor(Math.random()*2147483647))>>>0;
    this.world=new C.World({gravity:V(0,-9.82,0)});
    this.world.solver.iterations=14;
    this.world.broadphase=new C.SAPBroadphase(this.world);
    this.world.allowSleep=true;
    this.world.defaultContactMaterial.friction=.68;
    this.world.defaultContactMaterial.restitution=.08;
    this.elapsed=0;this.finished=false;this.winner=null;this.accumulator=0;
    this.fighters=[];this.props=[];this.civilians=[];this.projectiles=[];this.effects=[];this.events=[];
    this._id=0;this._hitTimes=new Map();this._nextMilitary=8;this._nextCivilian=0;
    const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);ground.collisionFilterGroup=1;this.world.addBody(ground);
    for(const [x,z,sx,sz] of [[-57,0,1,116],[57,0,1,116],[0,-57,116,1],[0,57,116,1]])this._box(V(x,10,z),[sx,20,sz],0,'boundary');
    this._makeFighter('buster',-6,0);
    this._makeFighter(this.options.enemy,6,0);
    this.fighters[0].target=this.fighters[1];this.fighters[1].target=this.fighters[0];
    const vb=new C.Body({mass:0,type:C.Body.KINEMATIC,shape:new C.Box(V(1.8,.55,1.2)),position:V(-7,11,-5)});
    vb.collisionFilterGroup=1;this.world.addBody(vb);vb.userData={veronica:true};
    this.veronica={body:vb,health:650,maxHealth:650,parts:6,maxParts:6,cooldown:4,destroyed:false,repairTarget:null};
    this._makeArena();
    this.log('Independent combat systems online. No predetermined outcome.');
  }
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  log(text){this.events.unshift({text,time:this.elapsed});if(this.events.length>24)this.events.pop();}
  effect(type,position,to=null,color=null,ttl=.5){const e={id:++this._id,type,position:xyz(position),to:to?xyz(to):undefined,color:color??0xffc56e,ttl,maxTtl:ttl};this.effects.push(e);return e;}
  _box(position,size,mass,kind,extra={}){
    const body=new C.Body({mass,shape:new C.Box(V(size[0]/2,size[1]/2,size[2]/2)),position,linearDamping:.08,angularDamping:.3});
    body.collisionFilterGroup=1;body.collisionFilterMask=-1;this.world.addBody(body);
    const prop={id:++this._id,kind,body,size,health:extra.health??(kind==='building'?600:120),maxHealth:extra.health??120,...extra};
    body.userData={prop};
    if(kind!=='boundary')this.props.push(prop);
    return prop;
  }
  _makeFighter(type,x,z){
    const cfg=CONFIG[type],s=cfg.scale,group=type==='buster'?2:4;
    const f={id:type,type,name:cfg.name,health:0,maxHealth:0,energy:100,maxEnergy:100,state:'Closing distance',parts:{},cooldowns:{},alive:true,yaw:x<0?Math.PI/2:-Math.PI/2,scale:s,totalMass:cfg.mass,action:null,decision:1+this.random(),walkPhase:this.random()*6.28,rage:0,flight:0,grapple:null,grappleTime:0,transfers:0};
    for(const [name,d] of Object.entries(SHAPES)){
      const size=d.map(v=>v*s),o=OFFSETS[name],p=V(x+o[0]*s,o[1]*s,z+o[2]*s);
      const body=new C.Body({mass:cfg.mass*WEIGHTS[name],position:p,shape:new C.Box(V(...size.map(v=>v/2))),linearDamping:.14,angularDamping:.55,allowSleep:false});
      body.quaternion.setFromEuler(0,f.yaw,0);
      // Initial offsets are in local coordinates; rotate around the torso yaw.
      const local=V(o[0]*s,0,o[2]*s);const q=new C.Quaternion();q.setFromEuler(0,f.yaw,0);const rotated=q.vmult(local);
      body.position.x=x+rotated.x;body.position.z=z+rotated.z;
      body.collisionFilterGroup=group;body.collisionFilterMask=1|(group===2?4:2)|8;
      this.world.addBody(body);
      const hp=HP[name]*cfg.armor;
      const part={id:name,name,body,size,health:hp,maxHealth:hp,detached:false,detachedAt:0,constraint:null,parent:PARENT[name]??null,wounds:0};
      body.userData={fighter:f,part};
      part._collideHandler=ev=>this._onCollision(f,part,ev);
      body.addEventListener('collide',part._collideHandler);
      f.parts[name]=part;f.health+=hp;f.maxHealth+=hp;
    }
    for(const name of Object.keys(PARENT))this._connect(f,name);
    this.fighters.push(f);
    return f;
  }
  _connect(f,name){
    const p=f.parts[name],parent=f.parts[PARENT[name]],j=JOINTS[name],a=OFFSETS[PARENT[name]],b=OFFSETS[name],s=f.scale;
    const c=new C.PointToPointConstraint(parent.body,V((j[0]-a[0])*s,(j[1]-a[1])*s,(j[2]-a[2])*s),p.body,V((j[0]-b[0])*s,(j[1]-b[1])*s,(j[2]-b[2])*s),f.totalMass*180);
    c.collideConnected=false;p.constraint=c;this.world.addConstraint(c);
  }
  _makeArena(){
    if(this.options.arena==='city'){
      for(const [x,z,w,h,d] of [[-21,-22,11,22,13],[21,-22,11,29,13],[-21,22,11,18,13],[21,22,11,26,13],[-40,-22,10,34,13],[40,-22,10,23,13],[-40,22,10,27,13],[40,22,10,37,13],[-21,-43,11,29,10],[21,-43,11,36,10],[-21,43,11,25,10],[21,43,11,18,10]]){
        this._box(V(x,h/2,z),[w,h,d],0,'building',{health:900});
      }
      for(let i=0;i<12;i++){
        const side=i%2?1:-1,z=-35+Math.floor(i/2)*13;
        this._box(V(side*9,.7,z),[1.9,1.4,4.1],1150,'car',{health:90,color:[0x60757c,0xb39f85,0x813b38,0x283944][i%4]});
      }
      for(let i=0;i<8;i++)this._box(V((i%2?1:-1)*(12+this.random()*2),.55,-30+this.random()*60),[1.1,1.1,1.1],45,'crate');
      for(let i=0;i<28;i++){
        const x=(i%2?1:-1)*(13+this.random()*1.5),z=-45+this.random()*90;
        this.civilians.push({id:++this._id,position:{x,y:0,z},state:'Walking',health:35,maxHealth:35,speed:2.7+this.random()*1.7,heading:this.random()*6.28,escaped:false,military:false});
      }
      if(this.options.military){
        for(const z of [-35,35])this._box(V(z<0?0:3,1.1,z),[3.6,2.2,6.4],12000,'tank',{health:260,cooldown:5+this.random()*3});
        for(let i=0;i<8;i++)this.civilians.push({id:++this._id,position:{x:-4+(i%4)*2.8,y:0,z:i<4?-29:29},state:'Deploying',health:60,maxHealth:60,speed:3.5,heading:0,escaped:false,military:true,cooldown:4+this.random()*4});
      }
    }else{
      for(let i=0;i<12;i++){
        const a=i/12*Math.PI*2,r=22+this.random()*22,size=[1.8+this.random()*1.7,.9+this.random()*1.2,1.8+this.random()*1.5];
        this._box(V(Math.sin(a)*r,size[1]/2,Math.cos(a)*r),size,500,'boulder',{health:200});
      }
    }
  }
  _onCollision(f,p,ev){
    if(!f.alive||p.detached)return;
    const data=ev.body.userData??{},other=data.fighter;
    let velocity=Math.abs(ev.contact.getImpactVelocityAlongNormal());
    if(velocity<2.6)return;
    if(other&&other!==f&&other.alive&&!data.part.detached){
      const key=f.id+':'+other.id;
      if((this._hitTimes.get(key)??-10)+.25>this.elapsed)return;
      this._hitTimes.set(key,this.elapsed);
      const active=other.action?.kind==='punch'&&other.action.t<.68;
      const punch=data.part.name.startsWith('forearm')&&active;
      const dmg=clamp((velocity-2)* (punch?3.6:1.45),1, punch?42:23)*(other.type==='hulk'?1.18:1);
      this.hitPart(f.id,p.name,dmg,other.id);
      this.effect('impact',p.body.position,null,punch?0xffdba0:0xaaaab0,.22);
      if(punch&&this.elapsed-(other.lastPunchLog??-3)>1.8){this.log(`${other.name} lands a physical strike.`);other.lastPunchLog=this.elapsed;}
    }else if(data.prop&&ev.body.mass>80){
      const key=f.id+':prop'+data.prop.id;
      if((this._hitTimes.get(key)??-10)+.7>this.elapsed)return;this._hitTimes.set(key,this.elapsed);
      this.hitPart(f.id,p.name,clamp(velocity*.75,1,18),'debris');
    }
  }
  hitPart(id,name,damage,source='impact'){
    const f=this.fighters.find(f=>f.id===id),p=f?.parts[name];
    if(!f?.alive||!p||p.detached||damage<=0)return false;
    const n=Math.min(p.health,damage);p.health=Math.max(0,p.health-damage);p.wounds+=n;f.lastDamage=this.elapsed;
    f.health=Object.values(f.parts).reduce((sum,p)=>sum+p.health,0);
    f.rage=clamp(f.rage+damage*.002,0,1);
    if((f.type==='hulk'||f.type==='venom')&&this.options.blood&&damage>4)this.effect('blood',p.body.position,null,f.type==='venom'?0x15151d:0x981d26,.9);
    if((f.type==='buster'||f.type==='ultron')&&damage>7&&this.random()<.32)this._debris(p.body.position,f.type==='buster'?0x873c28:0x75828b);
    if(p.health<=0){
      if(name==='torso'||name==='head'){this._defeat(f,source);}
      else if(this.options.severing)this._detach(f,name);
    }
    if(f.health<f.maxHealth*.18)this._defeat(f,source);
    return true;
  }
  _detach(f,name){
    const p=f.parts[name];if(p.detached)return;
    if(p.constraint){this.world.removeConstraint(p.constraint);p.constraint=null;}
    const mark=n=>{const a=f.parts[n];a.detached=true;a.detachedAt=this.elapsed;a.health=0;a.body.collisionFilterGroup=1;a.body.collisionFilterMask=-1;for(const [child,parent]of Object.entries(PARENT))if(parent===n)mark(child);};mark(name);
    f.health=Object.values(f.parts).reduce((s,p)=>s+p.health,0);
    this.log(`${f.name}: ${name.includes('Arm')||name.includes('arm')?'arm':name.includes('thigh')||name.includes('shin')?'leg':'component'} separated by structural damage.`);
    if(f.type==='buster'||f.type==='ultron')this.effect('impact',p.body.position,null,0xffbd68,1);
    else if(this.options.blood)this.effect('blood',p.body.position,null,f.type==='hulk'?0x8b1522:0x17171b,1);
  }
  _defeat(f,source){
    if(!f.alive)return;
    if(f.type==='ultron'&&this.options.networkTransfer&&f.transfers<1){
      const sentry=this.props.find(p=>p.kind==='sentry'&&!p.destroyed);
      if(sentry){
        f.transfers++;const spawn=sentry.body.position.clone();spawn.y=Math.max(2.95*f.scale,spawn.y);
        for(const p of Object.values(f.parts)){if(p.constraint){this.world.removeConstraint(p.constraint);p.constraint=null;}p.detached=true;}
        for(const name of Object.keys(f.parts))this._restore(f,name,name==='torso'?spawn:null);
        sentry.destroyed=true;this.world.removeBody(sentry.body);f.health=Object.values(f.parts).reduce((s,p)=>s+p.health,0);
        this.effect('repair',sentry.body.position,f.parts.torso.body.position,0xff514d,2);
        this.log('ULTRON abandons its destroyed body and transfers into a surviving network node.');return;
      }
    }
    f.alive=false;f.state='Incapacitated';f.health=0;f.action=null;
    for(const p of Object.values(f.parts)){p.body.linearDamping=.1;p.body.angularDamping=.18;}
    this.log(`${f.name} is incapacitated. ${source==='debris'?'Debris was decisive.':'Structural integrity lost.'}`);
    this.finished=true;const survivor=this.fighters.find(a=>a!==f&&a.alive);this.winner=survivor?.name??'DRAW';
  }
  _debris(position,color){
    if(this.props.filter(p=>p.kind==='rubble'&&!p.destroyed).length>75)return;
    const size=[.16+this.random()*.3,.12+this.random()*.15,.2+this.random()*.35];
    const p=this._box(V(position.x,position.y+.2,position.z),size,8,'rubble',{health:20,color,createdAt:this.elapsed});
    p.body.velocity.set((this.random()-.5)*5,2+this.random()*3,(this.random()-.5)*5);p.body.angularVelocity.set(this.random()*6,this.random()*6,this.random()*6);
  }
  _orient(body,yaw,pitch=0,roll=0,strength=1){
    const q=new C.Quaternion();q.setFromEuler(pitch,yaw,roll,'YXZ');
    const inv=body.quaternion.inverse(),error=q.mult(inv);if(error.w<0){error.x*=-1;error.y*=-1;error.z*=-1;}
    const gain=body.mass*35*strength,damp=body.mass*8*strength;
    body.torque.x+=error.x*gain-body.angularVelocity.x*damp;
    body.torque.y+=error.y*gain-body.angularVelocity.y*damp;
    body.torque.z+=error.z*gain-body.angularVelocity.z*damp;
  }
  _driveFighter(f,dt){
    if(!f.alive)return;
    const t=f.parts.torso.body,target=f.target.parts.torso.body,s=f.scale;
    const delta=target.position.vsub(t.position);delta.y=0;const dist=delta.length();if(dist>.01)delta.scale(1/dist,delta);
    const desiredYaw=Math.atan2(delta.x,delta.z);let yawDiff=Math.atan2(Math.sin(desiredYaw-f.yaw),Math.cos(desiredYaw-f.yaw));f.yaw+=clamp(yawDiff,-dt*2.6,dt*2.6);
    const hasLegs=!f.parts.thighL.detached&&!f.parts.thighR.detached;const legCount=['shinL','shinR'].filter(n=>!f.parts[n].detached).length;
    let speed=hasLegs?3.0:1.1;if(f.type==='venom')speed*=1.3;if(f.type==='hulk')speed*=1.08;
    let moving=dist>3.1*s;if(f.action?.kind==='punch')speed*=.35;
    const retreat=f.type==='ultron'&&dist<4.2;
    let vx=delta.x*(moving?speed:0),vz=delta.z*(moving?speed:0);
    if(retreat){vx=-delta.x*1.8;vz=-delta.z*1.8;}
    // Limited hip balance and traction are locomotion motors, not position writes.
    t.force.x+=(vx-t.velocity.x)*f.totalMass*2.2;
    t.force.z+=(vz-t.velocity.z)*f.totalMass*2.2;
    const groundHeight=legCount===0?.85*s:2.95*s-(2-legCount)*.22*s;
    const flight=f.flight>this.elapsed?3.6:0;
    const support=clamp(f.totalMass*9.82+(groundHeight+flight-t.position.y)*f.totalMass*58-t.velocity.y*f.totalMass*11,-f.totalMass*18,f.totalMass*35);
    if(t.position.y<groundHeight+flight+1.4||flight)t.force.y+=support;
    this._orient(t,f.yaw,0,0,2.8);
    f.walkPhase+=dt*(moving?6:1.2);const gait=moving?Math.sin(f.walkPhase)*.38:0;
    for(const [name,p]of Object.entries(f.parts)){
      if(p.detached||name==='torso')continue;
      let pitch=0,roll=0;
      if(name.startsWith('thigh'))pitch=(name.endsWith('L')?gait:-gait);
      if(name.startsWith('shin'))pitch=(name.endsWith('L')?-gait:gait)*.45;
      if(name.startsWith('upperArm')){pitch=name.endsWith('L')?-gait*.6:gait*.6;roll=name.endsWith('L')?-.12:.12;}
      if(name.startsWith('forearm'))pitch=-.20;
      if(legCount===0&&name.startsWith('upperArm'))pitch=-1.2+(name.endsWith('L')?gait:-gait)*.4;
      if(legCount===0&&name.startsWith('forearm'))pitch=-.8;
      if(f.action?.kind==='punch'&&(name===f.action.arm||name===f.action.upper)){
        const u=f.action.t;pitch=u<.14?.55:u<.48?-1.5:-.35;roll=name.endsWith('L')?-.13:.13;
      }
      if(f.action?.kind==='smash'&&(name.startsWith('upperArm')||name.startsWith('forearm')))pitch=f.action.t<.45?2.4:-1;
      this._orient(p.body,f.yaw,pitch,roll,name==='head'?1.4:1.5);
    }
    if(f.action){
      f.action.t+=dt;
      if(f.action.kind==='punch'&&f.action.t>.17&&f.action.t<.36){const fist=f.parts[f.action.arm];if(!fist.detached){const forward=V(Math.sin(f.yaw),.18,Math.cos(f.yaw));const rageStrength=f.type==='hulk'?1+.35*clamp(f.rage,0,1):1;fist.body.force.vadd(forward.scale(f.totalMass*(f.type==='hulk'?38:31)*rageStrength),fist.body.force);}}
      if(f.action.kind==='smash'&&f.action.t>=.58&&!f.action.did){f.action.did=true;this._radial(f,t.position,6.5,2600*(1+.35*clamp(f.rage,0,1)),20,'shockwave');}
      if(f.action.t>f.action.duration){f.action=null;}
    }
    if(f.grapple){
      f.grappleTime-=dt;const victim=f.grapple.parts.torso.body;
      if(this.elapsed>=(f.nextGrappleEffect??0)){
        const hand=['forearmR','forearmL'].find(n=>!f.parts[n].detached);
        this.effect('tendril',f.parts[hand??'torso'].body.position,victim.position,f.type==='venom'?0x292a32:0xffa559,.15);
        f.nextGrappleEffect=this.elapsed+.1;
      }
      if(f.grappleTime<=0||distance(t.position,victim.position)>16){f.grapple=null;f.state='Released grapple';}
      else{const pull=t.position.vsub(victim.position);pull.y+=1.4;pull.normalize();victim.applyForce(pull.scale(victim.mass*17));t.applyForce(pull.scale(-victim.mass*3));
        if(f.grappleTime<.18&&!f.grappleThrown){victim.applyImpulse(V(delta.x*f.totalMass*2, f.totalMass*2.1,delta.z*f.totalMass*2));f.grappleThrown=true;this.hitPart(f.grapple.id,'torso',12,f.id);this.log(`${f.name} throws its grappled opponent.`);}}
    }
    f.energy=Math.min(100,f.energy+dt*(f.type==='hulk'?6:4));
    for(const k of Object.keys(f.cooldowns))f.cooldowns[k]=Math.max(0,f.cooldowns[k]-dt);
    if((f.type==='hulk'||f.type==='venom')&&!this.finished){
      for(const p of Object.values(f.parts))if(!p.detached&&p.health>0&&p.health<p.maxHealth&&this.elapsed-(f.lastDamage??-10)>3){p.health=Math.min(p.maxHealth,p.health+dt*(f.type==='hulk'?1.4:2.6));}
      if(f.type==='venom'||this.options.regrowth){const delay=f.type==='hulk'?21:13;const missing=Object.values(f.parts).find(p=>p.detached&&this.elapsed-p.detachedAt>delay&&(!p.parent||!f.parts[p.parent].detached));if(missing){this._restore(f,missing.name);this.log(`${f.name}: ${f.type==='hulk'?'gamma regeneration regrows':'symbiote re-forms'} a missing limb.`);}}
      f.health=Object.values(f.parts).reduce((sum,p)=>sum+p.health,0);
    }
    if(this.finished)return;
    f.decision-=dt;
    if(f.decision<=0){
      f.decision=.75+this.random()*.65;
      if(!f.action){
        const roll=this.random();
        if(dist<4.3&&roll<.53)this._punch(f);
        else if(f.type==='buster'){if(dist>5&&roll<.68)this.ability(f.id,'repulsor');else if(dist<4&&roll<.8)this.ability(f.id,'jackhammer');else if(dist<7)this.ability(f.id,'grab');else this.ability(f.id,'boost');}
        else if(f.type==='hulk'){if(dist<7&&roll<.7)this.ability(f.id,'smash');else if(dist>6)this.ability(f.id,'leap');else this.ability(f.id,'thunderclap');}
        else if(f.type==='venom'){if(dist<4)this.ability(f.id,'bite');else if(dist<12)this.ability(f.id,'tendril');else this.ability(f.id,'leap');}
        else if(f.type==='ultron'){if(roll<.5)this.ability(f.id,'blast');else if(roll<.7)this.ability(f.id,'gravity');else if(roll<.85)this.ability(f.id,'flight');else this.ability(f.id,'sentries');}
      }
    }
    if(!f.action&&!f.grapple)f.state=f.flight>this.elapsed?'Flight stabilizers active':moving?'Advancing · active gait':'Guarding · searching for an opening';
    // Return an escaped body with forces rather than snapping it into the arena.
    if(Math.abs(t.position.x)>49)t.force.x-=Math.sign(t.position.x)*f.totalMass*30;
    if(Math.abs(t.position.z)>49)t.force.z-=Math.sign(t.position.z)*f.totalMass*30;
  }
  _punch(f,jackhammer=false){
    const candidates=['forearmL','forearmR'].filter(n=>!f.parts[n].detached);if(!candidates.length)return false;
    const arm=candidates[Math.floor(this.random()*candidates.length)];f.action={kind:'punch',arm,upper:arm.endsWith('L')?'upperArmL':'upperArmR',t:0,duration:jackhammer?.6:.9};f.state=jackhammer?'Hydraulic jackhammer':'Physical strike';return true;
  }
  ability(id,name){
    const f=this.fighters.find(f=>f.id===id);if(!f?.alive||this.finished)return false;
    const aliases={repulsors:'repulsor',groundSmash:'smash',grapple:'tendril',punch:'punch',thunderclap:'thunderclap',repair:'repair'};name=aliases[name]??name;
    const cost={repulsor:17,jackhammer:14,grab:16,boost:14,smash:23,thunderclap:27,leap:18,tendril:20,bite:18,blast:17,gravity:25,flight:18,sentries:35,repair:0,punch:0}[name];
    if(cost===undefined||(f.cooldowns[name]??0)>0||f.energy<cost)return false;
    const legal={buster:['repulsor','jackhammer','grab','boost','repair','punch'],hulk:['smash','thunderclap','leap','grab','punch'],venom:['tendril','bite','leap','grab','punch'],ultron:['blast','gravity','flight','sentries','punch']}[f.type];if(!legal.includes(name))return false;
    const from=f.parts.torso.body.position,to=f.target.parts.torso.body.position,dir=to.vsub(from);const dist=dir.length();dir.normalize();
    f.energy-=cost;f.cooldowns[name]={repulsor:4,jackhammer:4,grab:8,boost:7,smash:8,thunderclap:10,leap:9,tendril:7,bite:5,blast:3.5,gravity:9,flight:11,sentries:24,repair:2,punch:1}[name];
    if(name==='punch')return this._punch(f);
    if(name==='jackhammer'){this._punch(f,true);f.decision=.5;this.log('HULKBUSTER engages the hydraulic jackhammer.');}
    if(name==='repulsor'||name==='blast'){
      const arm=['forearmR','forearmL'].find(n=>!f.parts[n].detached);if(!arm)return false;
      const p=f.parts[arm].body.position;this._shoot(f.id,p,to,name==='repulsor'?'repulsor':'ultron',f.type==='buster'?26:20);f.state=name==='repulsor'?'Palm repulsor discharge':'Concussive energy blast';this.log(`${f.name} fires ${name==='repulsor'?'a repulsor':'a concussive blast'}.`);
    }
    if(name==='smash'){f.action={kind:'smash',t:0,duration:1.05};f.state='Winding up a ground smash';this.log('HULK raises both fists for a ground smash.');}
    if(name==='thunderclap'){this._radial(f,from,11,1800,13,'shockwave');f.state='Thunderclap';this.log('HULK unleashes a pressure-wave thunderclap.');}
    if(name==='leap'||name==='boost'){
      const body=f.parts.torso.body;const impulse=V(dir.x*f.totalMass*(name==='boost'?5.5:4),f.totalMass*(name==='boost'?3.4:5.2),dir.z*f.totalMass*(name==='boost'?5.5:4));body.applyImpulse(impulse);f.state=name==='boost'?'Repulsor-assisted charge':'Gamma leap';this.effect('impact',from,null,CONFIG[f.type].color,.4);this.log(`${f.name} ${name==='boost'?'boosts forward':'leaps toward its opponent'}.`);
    }
    if(name==='tendril'||name==='grab'){
      if(dist<(name==='tendril'?14:5.5)){f.grapple=f.target;f.grappleTime=1.35;f.grappleThrown=false;f.state=name==='tendril'?'Symbiote tendril grapple':'Arm restraint · grapple';this.log(`${f.name} engages ${name==='tendril'?'a tendril':'an arm'} grapple.`);}
    }
    if(name==='bite'){
      if(dist<4.5){this._punch(f);f.state='Bite · symbiote strike';const head=f.parts.head.body;head.applyImpulse(dir.scale(f.totalMass*1.4));this.effect('tendril',head.position,to,0x25232b,.5);}
    }
    if(name==='gravity'){
      const victim=f.target.parts.torso.body;victim.applyImpulse(V(-dir.x*victim.mass*7,victim.mass*5,-dir.z*victim.mass*7));this.effect('tendril',from,to,0xff5b45,.8);f.state='Anti-gravity manipulation';this.log('ULTRON pulls its opponent with anti-gravity fields.');
    }
    if(name==='flight'){f.flight=this.elapsed+5;f.state='Powered flight';this.log('ULTRON engages powered flight.');}
    if(name==='sentries'){
      const count=this.props.filter(p=>p.kind==='sentry'&&!p.destroyed).length;
      for(let i=0;i<Math.max(0,Math.min(2,4-count));i++){const p=this._box(V(from.x+(i?3:-3),6,from.z-2),[.65,1.3,.55],120,'sentry',{health:70,cooldown:1+i,owner:f.id});p.body.collisionFilterGroup=1;}
      f.state='Sentry network deployed';this.log('ULTRON deploys two linked sentries.');
    }
    if(name==='repair'){this.veronica.cooldown=0;this._repair();}
    return true;
  }
  _radial(f,origin,radius,impulse,damage,type){
    this.effect(type,origin,null,CONFIG[f.type].color,.9);
    for(const other of this.fighters){if(other===f||!other.alive)continue;const body=other.parts.torso.body,d=distance(body.position,origin);if(d>radius)continue;const dir=body.position.vsub(origin);dir.y=.9;dir.normalize();body.applyImpulse(dir.scale(impulse*(1-d/radius+.25)));const modifier=other.type==='venom'?2.2:1;this.hitPart(other.id,'torso',damage*modifier*(1-d/radius+.3),f.id);if(other.type==='venom'){other.energy=Math.max(0,other.energy-25);this.log('VENOM recoils from the intense sonic pressure.');}}
    for(const p of [...this.props]){if(p.destroyed||p.body.mass===0)continue;const d=distance(p.body.position,origin);if(d>radius)continue;const dir=p.body.position.vsub(origin);dir.y=1;dir.normalize();p.body.applyImpulse(dir.scale(impulse*(1-d/radius)));p.health-=damage;if(p.health<=0)this._destroyProp(p);}
  }
  _shoot(owner,from,to,kind,damage){
    const dir=to.vsub(from);dir.normalize();const pos=from.vadd(dir.scale(1.25));
    const body=new C.Body({mass:kind==='shell'?8:kind==='bullet'?.012:1,shape:new C.Sphere(kind==='shell'?.18:kind==='bullet'?.065:.23),position:pos,linearDamping:0,collisionFilterGroup:8,collisionFilterMask:owner==='buster'?5:owner==='ultron'?3:7});
    body.velocity.copy(dir.scale(kind==='shell'?28:kind==='bullet'?65:38));body.velocity.y+=kind==='shell'?2:0;body.userData={projectile:true};this.world.addBody(body);
    const shot={id:++this._id,body,kind,owner,damage,ttl:3,hit:false};this.projectiles.push(shot);
    body.addEventListener('collide',e=>{
      if(shot.hit)return;const data=e.body.userData??{};if(data.fighter?.id===owner)return;
      shot.hit=true;shot.ttl=0;
      const color=kind==='ultron'?0xff5145:kind==='shell'?0xffb44c:0x9bfcff;
      this.effect(kind==='shell'?'explosion':'impact',body.position,null,color,.5);
      if(data.fighter){this.hitPart(data.fighter.id,data.part.name,damage,owner);const knock=body.velocity.clone();knock.normalize();e.body.applyImpulse(knock.scale(e.body.mass*(kind==='shell'?3.5:kind==='bullet'?.015:2.4)));}
      if(data.prop){data.prop.health-=damage*2.2;if(data.prop.health<=0)this._destroyProp(data.prop);}
      if(data.veronica)this.damageVeronica(damage*1.8);
      if(kind==='shell'){for(const f of this.fighters){if(distance(f.parts.torso.body.position,body.position)<4)this.hitPart(f.id,'torso',damage*.3,'military');}}
    });
    this.effect('beam',from,pos,kind==='ultron'?0xff4d4d:0x9bfcff,.12);
  }
  _destroyProp(p){
    if(p.destroyed)return;
    p.destroyed=true;
    this.effect('explosion',p.body.position,null,p.kind==='car'||p.kind==='tank'?0xffb45d:0xb4bbbc,1.1);
    if(p.kind==='building'){
      // Buildings retain their structural collision shell; impact creates physical
      // facade chunks instead of deleting an entire tower on a hit.
      p.destroyed=false;p.health=500;p.damaged=true;
      for(let i=0;i<7;i++){const pos=p.body.position.clone();pos.y=2+this.random()*6;pos.x+=this.random()*p.size[0]-p.size[0]/2;pos.z+=this.random()*p.size[2]-p.size[2]/2;this._debris(pos,0x999388);}
    }else if(p.kind==='car'||p.kind==='tank'){p.wrecked=true;p.destroyed=false;p.health=999999;p.body.angularDamping=.4;for(let i=0;i<5;i++)this._debris(p.body.position,0x41464b);this.log(`${p.kind==='tank'?'A military vehicle':'A vehicle'} is disabled by the fighting.`);
      for(const f of this.fighters){const d=distance(f.parts.torso.body.position,p.body.position);if(d<5.5)this.hitPart(f.id,'torso',(f.type==='venom'?36:14)*(1-d/7),'fire');}
    }
    else{this.world.removeBody(p.body);if(p.kind!=='rubble')for(let i=0;i<3;i++)this._debris(p.body.position,p.kind==='sentry'?0x6d787e:0x9d8e72);}
  }
  damageVeronica(damage){
    const v=this.veronica;if(v.health<=0)return;
    v.health=Math.max(0,v.health-damage);
    this.effect('impact',v.body.position,null,0xffaa55,.6);
    if(v.health===0){v.destroyed=true;v.repairTarget=null;v.body.type=C.Body.DYNAMIC;v.body.mass=1800;v.body.updateMassProperties();this.log('VERONICA DESTROYED. Replacement parts are no longer available.');this.effect('explosion',v.body.position,null,0xffa456,2);}
  }
  _restore(f,name,spawn=null){
    const p=f.parts[name],base=f.parts.torso.body,s=f.scale,o=OFFSETS[name],bo=OFFSETS.torso;
    if(p.constraint){this.world.removeConstraint(p.constraint);p.constraint=null;}
    const offset=V(o[0]*s,(o[1]-bo[1])*s,o[2]*s),q=new C.Quaternion();q.setFromEuler(0,f.yaw,0);const world=q.vmult(offset);
    // A replacement grows/assembles at its actual attachment rather than dragging
    // old debris across the map. The original detached body becomes debris.
    const old=p.body;
    const size=p.size,body=new C.Body({mass:old.mass,shape:new C.Box(V(size[0]/2,size[1]/2,size[2]/2)),position:(spawn??base.position).vadd(world),linearDamping:.14,angularDamping:.55,allowSleep:false});
    body.quaternion.copy(q);body.velocity.copy(base.velocity);body.collisionFilterGroup=f.type==='buster'?2:4;body.collisionFilterMask=1|(f.type==='buster'?4:2)|8;
    old.removeEventListener('collide',p._collideHandler);
    p._collideHandler=ev=>this._onCollision(f,p,ev);
    body.userData={fighter:f,part:p};body.addEventListener('collide',p._collideHandler);this.world.addBody(body);
    old.userData={};old.collisionFilterGroup=1;old.collisionFilterMask=-1;old.allowSleep=true;old.sleepSpeedLimit=.25;old.sleepTimeLimit=2;
    this.props.push({id:++this._id,kind:f.type==='buster'?'armorDebris':f.type==='ultron'?'metalDebris':'organicDebris',body:old,size:p.size,health:20,color:f.type==='buster'?0x6d352b:f.type==='hulk'?0x3c6435:0x21242a,createdAt:this.elapsed});
    p.body=body;p.health=p.maxHealth*.85;p.detached=false;p.wounds=p.maxHealth*.15;
    if(name!=='torso')this._connect(f,name);
    f.health=Object.values(f.parts).reduce((sum,p)=>sum+p.health,0);
    this.effect('repair',base.position,body.position,f.type==='hulk'?0x83c15f:0x9beeff,2);
  }
  _repair(){
    const v=this.veronica,f=this.fighters[0];
    if(v.health<=0||v.parts<=0||v.cooldown>0||!f.alive||this.finished)return;
    let target=Object.values(f.parts).find(p=>p.detached&&(!p.parent||!f.parts[p.parent].detached));
    if(!target)target=Object.values(f.parts).filter(p=>!p.detached&&p.health<p.maxHealth*.42).sort((a,b)=>a.health/a.maxHealth-b.health/b.maxHealth)[0];
    if(!target)return;
    v.parts--;v.cooldown=11;
    this.effect('repair',v.body.position,target.body.position,0x92e8ff,2.2);
    if(target.detached)this._restore(f,target.name);else{target.health=Math.min(target.maxHealth,target.health+target.maxHealth*.8);target.wounds=target.maxHealth-target.health;f.health=Object.values(f.parts).reduce((s,p)=>s+p.health,0);}
    this.log(`VERONICA replaces ${target.name}. ${v.parts} repair module${v.parts===1?'':'s'} remaining.`);
  }
  _updateWorld(dt){
    const v=this.veronica;
    if(v.health>0){v.cooldown=Math.max(0,v.cooldown-dt);v.body.position.y=11+Math.sin(this.elapsed*.5)*.25;this._repair();}
    for(const p of this.props){
      if(p.destroyed)continue;
      if(p.kind==='sentry'){
        p.cooldown-=dt;const target=this.fighters[0],b=p.body,pos=target.parts.torso.body.position;
        b.force.y+=b.mass*(9.82+(5-b.position.y)*5-b.velocity.y*3);const dx=pos.x-b.position.x,dz=pos.z-b.position.z;
        b.force.x+=(dx*.15-b.velocity.x)*b.mass*2;b.force.z+=(dz*.15-b.velocity.z)*b.mass*2;
        if(p.cooldown<0&&target.alive&&!this.finished){p.cooldown=3+this.random()*2;this._shoot('ultron',b.position,pos,'ultron',7);}
      }
      if(p.kind==='tank'&&!p.wrecked&&this.options.military&&!this.finished){
        p.cooldown-=dt;if(p.cooldown<=0){p.cooldown=7+this.random()*4;const targets=this.fighters.filter(f=>f.alive);const f=targets[Math.floor(this.random()*targets.length)];if(f){const pos=p.body.position.clone();pos.y+=1.3;this._shoot('military',pos,f.parts.torso.body.position,'shell',9);this.effect('explosion',pos,null,0xffd49b,.25);}}
      }
      if(p.createdAt&&((this.elapsed-p.createdAt>55&&p.body.sleepState===C.Body.SLEEPING)||this.elapsed-p.createdAt>90)){this.world.removeBody(p.body);p.destroyed=true;}
    }
    for(const person of this.civilians){
      if(person.escaped||person.health<=0)continue;
      const position=V(person.position.x,.9,person.position.z);let nearest=null,min=Infinity;
      for(const f of this.fighters){const d=distance(position,f.parts.torso.body.position);if(d<min){nearest=f;min=d;}}
      if(min<3.5){const speed=nearest.parts.torso.body.velocity.length();if(speed>2.2){person.health=Math.max(0,person.health-speed*dt*5);if(person.health<=0){person.state='Incapacitated';if(this.options.blood)this.effect('blood',position,null,0x851b28,1);continue;}}}
      let dx=0,dz=0;
      if(person.military){
        person.cooldown-=dt;person.state='Military response';
        if(min<13){dx=position.x-nearest.parts.torso.body.position.x;dz=position.z-nearest.parts.torso.body.position.z;}
        if(person.cooldown<0&&!this.finished&&min<45){person.cooldown=2+this.random()*2;const target=nearest.parts.torso.body.position;position.y=1.35;this.effect('tracer',position,target,0xffe1a0,.15);this._shoot('military',position,target,'bullet',.6);}
      }else{
        if(min<25||this.elapsed>1.5){person.state='Fleeing';
          // Sidewalks lead to the north/south exits. Running diagonally away from
          // a threat would send people through the surrounding tower blocks.
          if(!person.escapeDirection)person.escapeDirection=Math.sign(position.z-(min<25?nearest.parts.torso.body.position.z:0))||1;
          dx=(Math.sign(position.x||1)*13.2-position.x)*.6;dz=person.escapeDirection;
        }
        else{person.state='Walking';dz=Math.cos(person.heading)*.3;}
      }
      const len=Math.hypot(dx,dz);if(len>.01){
        const mx=dx/len*person.speed*dt,mz=dz/len*person.speed*dt;
        const blocked=(x,z)=>this.props.some(p=>p.kind==='building'&&Math.abs(x-p.body.position.x)<p.size[0]/2+.35&&Math.abs(z-p.body.position.z)<p.size[2]/2+.35);
        if(!blocked(person.position.x+mx,person.position.z+mz)){person.position.x+=mx;person.position.z+=mz;}
        else if(!blocked(person.position.x,person.position.z+mz)){person.position.z+=mz;}
        else if(!blocked(person.position.x+mx,person.position.z)){person.position.x+=mx;}
        else person.escapeDirection=-(person.escapeDirection??1);
        person.heading=Math.atan2(dx,dz);
      }
      if(Math.abs(person.position.x)>53||Math.abs(person.position.z)>53){person.escaped=true;person.state='Evacuated';}
    }
    // Enemy AI can attack the support platform when it has a firing solution.
    if(!this.finished&&this.elapsed>(this._nextVeronicaAttack??12)){
      this._nextVeronicaAttack=this.elapsed+10+this.random()*8;
      const enemy=this.fighters[1];if(enemy.alive&&v.health>0){
        if(enemy.type==='ultron'){this._shoot(enemy.id,enemy.parts.head.body.position,v.body.position,'ultron',70);this.log('ULTRON targets the Veronica support platform.');}
        else if(enemy.type==='hulk'&&this.random()<.55){const hand=['forearmR','forearmL'].find(n=>!enemy.parts[n].detached);if(hand){const from=enemy.parts[hand].body.position;this._shoot(enemy.id,from,v.body.position,'shell',45);this.log('HULK hurls debris at Veronica.');}}
        else if(enemy.type==='venom'&&distance(enemy.parts.torso.body.position,v.body.position)<17){this.effect('tendril',enemy.parts.forearmR.body.position,v.body.position,0x292a32,.7);this.damageVeronica(55);this.log('VENOM lashes Veronica with a tendril.');}
      }
    }
  }
  step(dt){
    dt=clamp(dt,0,.1);this.accumulator+=dt;
    const fixed=1/120;let substeps=0;
    while(this.accumulator>=fixed&&substeps++<12){
      this.elapsed+=fixed;
      for(const f of this.fighters)this._driveFighter(f,fixed);
      this._updateWorld(fixed);
      for(const shot of this.projectiles){shot.ttl-=fixed;if(shot.kind!=='shell')shot.body.force.y+=shot.body.mass*9.82;}
      this.world.step(fixed);
      for(const shot of this.projectiles)if(shot.ttl<=0)this.world.removeBody(shot.body);
      this.projectiles=this.projectiles.filter(s=>s.ttl>0);
      if(this.props.length>160)this.props=this.props.filter(p=>!p.destroyed);
      for(const e of this.effects)e.ttl-=fixed;this.effects=this.effects.filter(e=>e.ttl>0);
      this.accumulator-=fixed;
    }
  }
  dispose(){for(const body of [...this.world.bodies])this.world.removeBody(body);this.effects=[];this.projectiles=[];}
}

export const CHARACTER_CONFIGS=CONFIG;
