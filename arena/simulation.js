import * as C from './vendor/cannon-es.js';

// Simulation units are metres, kilograms, seconds. Masses, durability and motor
// strengths are game settings, not measurements from the films. Locomotion uses
// active balance/pose motors; impacts, joints, debris and knockback use dynamics.
const V = (x=0,y=0,z=0) => new C.Vec3(x,y,z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const xyz=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const CONFIG={
  titan:{name:'TITAN BREAKER',mass:2600,scale:3.35/4.45,armor:1.48,energy:100,color:0x75ecff},
  buster:{name:'HULKBUSTER',mass:2300,scale:1,armor:1.05,energy:100,color:0x7cffff},
  hulk:{name:'HULK',mass:1250,scale:.96,armor:1.4,energy:100,color:0x92dc63},
  venom:{name:'VENOM',mass:650,scale:.84,armor:.8,energy:100,color:0xc5d5f0},
  ultron:{name:'ULTRON',mass:600,scale:.86,armor:1.0,energy:100,color:0xff514d},
  carnage:{name:'CARNAGE',mass:720,scale:.88,armor:1.02,energy:100,color:0xd53331},
  thing:{name:'THE THING',mass:1600,scale:.92,armor:1.28,energy:100,color:0xee9d47},
  wolverine:{name:'WOLVERINE',mass:420,scale:.69,armor:.88,energy:100,color:0xf2c12f},
};
const ORGANIC=new Set(['hulk','venom','carnage','thing','wolverine']);
const SYMBIOTES=new Set(['venom','carnage']);
const SHAPES={torso:[1.65,1.65,1.0],head:[.78,.66,.74],upperArmL:[.78,1.02,.78],forearmL:[.86,1.04,.86],upperArmR:[.78,1.02,.78],forearmR:[.86,1.04,.86],thighL:[.66,1.05,.74],shinL:[.70,.95,.82],thighR:[.66,1.05,.74],shinR:[.70,.95,.82]};
const OFFSETS={torso:[0,2.95,0],head:[0,4.12,0],upperArmL:[-1.2,3.06,0],forearmL:[-1.2,2.03,0],upperArmR:[1.2,3.06,0],forearmR:[1.2,2.03,0],thighL:[-.49,1.58,0],shinL:[-.49,.57,.08],thighR:[.49,1.58,0],shinR:[.49,.57,.08]};
const PARENT={head:'torso',upperArmL:'torso',forearmL:'upperArmL',upperArmR:'torso',forearmR:'upperArmR',thighL:'torso',shinL:'thighL',thighR:'torso',shinR:'thighR'};
const JOINTS={head:[0,3.78,0],upperArmL:[-1.2,3.57,0],forearmL:[-1.2,2.55,0],upperArmR:[1.2,3.57,0],forearmR:[1.2,2.55,0],thighL:[-.49,2.1,0],shinL:[-.49,1.05,.04],thighR:[.49,2.1,0],shinR:[.49,1.05,.04]};
const WEIGHTS={torso:.43,head:.045,upperArmL:.085,forearmL:.095,upperArmR:.085,forearmR:.095,thighL:.045,shinL:.035,thighR:.045,shinR:.035};
const HP={torso:460,head:245,upperArmL:220,forearmL:245,upperArmR:220,forearmR:245,thighL:250,shinL:235,thighR:250,shinR:235};

export class Simulation {
  constructor(options={}){
    this.options={hero:'buster',waterDepth:0,enemy:'hulk',arena:'city',regrowth:true,severing:true,blood:true,military:true,...options};
    this.options.hero=this.options.hero==='titan'?'titan':'buster';this.options.waterDepth=clamp(Number(this.options.waterDepth)||0,0,4);
    this.seed=(options.seed??Math.floor(Math.random()*2147483647))>>>0;
    this.world=new C.World({gravity:V(0,-9.82,0)});
    this.world.solver.iterations=12;
    this.world.broadphase=new C.SAPBroadphase(this.world);
    this.world.allowSleep=true;
    this.world.defaultContactMaterial.friction=.68;
    this.world.defaultContactMaterial.restitution=.08;
    this.elapsed=0;this._worldClock=0;this.finished=false;this.winner=null;this.accumulator=0;
    this.fighters=[];this.props=[];this.civilians=[];this.projectiles=[];this.effects=[];this.events=[];
    this._id=0;this._hitTimes=new Map();this._pendingStructures=[];this.stats={launches:0,buildingImpacts:0,vehicleExplosions:0,maxLaunchSpeed:0,firstLaunch:null,gasAttempts:0,gasSuccesses:0,militaryDamage:0,missilesFired:0,restraintsBroken:0,captures:0};this._nextMilitary=8;this._nextCivilian=0;
    const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);ground.collisionFilterGroup=1;ground.userData={ground:true};this.world.addBody(ground);
    for(const [x,z,sx,sz] of [[-57,0,1,116],[57,0,1,116],[0,-57,116,1],[0,57,116,1]])this._box(V(x,10,z),[sx,20,sz],0,'boundary');
    this._makeFighter(this.options.hero,-6,0);
    this._makeFighter(this.options.enemy,6,0);
    this.fighters[0].target=this.fighters[1];this.fighters[1].target=this.fighters[0];
    const vb=new C.Body({mass:0,type:C.Body.KINEMATIC,shape:new C.Box(V(1.8,.55,1.2)),position:V(-7,this.options.hero==='titan'?32:11,-5)});
    vb.collisionFilterGroup=1;this.world.addBody(vb);vb.userData={veronica:true};
    const titanSupport=this.options.hero==='titan';
    this.veronica={name:titanSupport?'SUNDAY':'VERONICA',altitude:titanSupport?32:11,body:vb,health:titanSupport?900:650,maxHealth:titanSupport?900:650,parts:titanSupport?8:6,maxParts:titanSupport?8:6,cooldown:4,destroyed:false,repairTarget:null,delivery:null};this.support=this.veronica;
    this._makeArena();
    this.log('Independent combat systems online. No predetermined outcome.');
  }
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  log(text){this.events.unshift({text,time:this.elapsed});if(this.events.length>24)this.events.pop();}
  effect(type,position,to=null,color=null,ttl=.5,detail={}){const e={id:++this._id,type,position:xyz(position),to:to?xyz(to):undefined,color:color??0xffc56e,ttl,maxTtl:ttl,...detail};this.effects.push(e);return e;}
  _box(position,size,mass,kind,extra={}){
    const body=new C.Body({mass,shape:new C.Box(V(size[0]/2,size[1]/2,size[2]/2)),position,linearDamping:.08,angularDamping:.3});
    body.collisionFilterGroup=1;body.collisionFilterMask=-1;this.world.addBody(body);
    const prop={id:++this._id,kind,body,size,health:extra.health??(kind==='building'?600:120),maxHealth:extra.health??120,...extra};
    body.userData={prop};
    body.addEventListener('collide',event=>this._onPropCollision(prop,event));
    if(kind!=='boundary')this.props.push(prop);
    return prop;
  }
  _makeFighter(type,x,z){
    const cfg=CONFIG[type],s=cfg.scale,group=x<0?2:4;
    const f={id:type,type,isHero:x<0,name:cfg.name,health:0,maxHealth:0,energy:100,maxEnergy:100,state:'Closing distance',parts:{},cooldowns:{},alive:true,yaw:x<0?Math.PI/2:-Math.PI/2,scale:s,totalMass:cfg.mass,action:null,decision:.25+this.random()*.25,staggerUntil:0,airborne:false,launchAt:-100,lastLaunchVelocity:V(),walkPhase:this.random()*6.28,rage:0,flight:0,grapple:null,grappleTime:0,transfers:0,gasUntil:0,gasImmuneUntil:0,flightMaxDuration:type==='buster'?2.8:type==='ultron'?3.5:0,flightReadyAt:0,flightAwaitingLanding:false,flightRemaining:0,missiles:type==='titan'?{L:15,R:15}:null,missileBayUntil:{L:0,R:0},redThrusterUntil:{L:0,R:0},armModes:{L:'idle',R:'idle'},armBusyUntil:{L:0,R:0},anchorUntil:0,shieldUntil:0,stealthUntil:0,revealedUntil:0,waterExposure:0,waterCompromised:false,restraint:null,boundBy:null,targetMemory:null};
    for(const [name,d] of Object.entries(SHAPES)){
      const size=d.map(v=>v*s),o=OFFSETS[name],p=V(x+o[0]*s,o[1]*s,z+o[2]*s);
      const body=new C.Body({mass:cfg.mass*WEIGHTS[name],position:p,shape:new C.Box(V(...size.map(v=>v/2))),linearDamping:.14,angularDamping:.55,allowSleep:false});
      body.quaternion.setFromEuler(0,f.yaw,0);
      // Initial offsets are in local coordinates; rotate around the torso yaw.
      const local=V(o[0]*s,0,o[2]*s);const q=new C.Quaternion();q.setFromEuler(0,f.yaw,0);const rotated=q.vmult(local);
      body.position.x=x+rotated.x;body.position.z=z+rotated.z;
      body.collisionFilterGroup=group;body.collisionFilterMask=1|(group===2?4:2)|8;
      this.world.addBody(body);
      const hp=HP[name]*cfg.armor*(type==='buster'&&(name.includes('Arm')||name.includes('forearm'))?1.45:1);
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
        for(const z of [-35,35])this._box(V(z<0?0:3,1.1,z),[3.6,2.2,6.4],12000,'tank',{health:700,cooldown:1.5+this.random()*1.5});
        for(let i=0;i<8;i++)this.civilians.push({id:++this._id,position:{x:-4+(i%4)*2.8,y:0,z:i<4?-29:29},state:'Deploying',health:130,maxHealth:130,speed:4.5,heading:0,escaped:false,military:true,cooldown:4+this.random()*4});
      }
    }else{
      for(let i=0;i<12;i++){
        const a=i/12*Math.PI*2,r=22+this.random()*22,size=[1.8+this.random()*1.7,.9+this.random()*1.2,1.8+this.random()*1.5];
        this._box(V(Math.sin(a)*r,size[1]/2,Math.cos(a)*r),size,500,'boulder',{health:200});
      }
    }
  }
  _contactPosition(ev,body){
    const contact=ev.contact;
    return contact.bi===body?contact.bi.position.vadd(contact.ri):contact.bj.position.vadd(contact.rj);
  }
  _launch(f,deltaVelocity,{duration=.8,source=null,controlled=false,landingPower=0}={}){
    if(!f?.alive)return;
    if(f.type==='titan'&&!controlled&&this._titanGrounded(f)&&f.anchorUntil>this.elapsed&&!f.waterCompromised)deltaVelocity=deltaVelocity.scale(.27);
    if(!controlled&&source!==f.id){const resistance=f.type==='hulk'?1-.32*f.rage:f.type==='thing'?.65:1;deltaVelocity=deltaVelocity.scale(resistance);}
    const length=deltaVelocity.length();if(length>32)deltaVelocity=deltaVelocity.scale(32/length);
    // Every connected body receives the same change in velocity. A hip motor
    // must never absorb a superhuman strike immediately after the impact.
    for(const part of Object.values(f.parts))if(!part.detached){part.body.wakeUp();part.body.applyImpulse(deltaVelocity.scale(part.body.mass));part.body.angularDamping=controlled?.52:.16;}
    f.staggerUntil=Math.max(f.staggerUntil??0,this.elapsed+duration);f.airborne=true;f.launchAt=this.elapsed;f.lastLaunchVelocity.copy(deltaVelocity);f.impactSource=source;f.landingPower=landingPower;f.controlledAir=controlled;
    if(!controlled){f.action=null;f.grapple=null;if(f.type==='titan')this._releaseTitanArms(f);const spin=V(deltaVelocity.z*.07,(this.random()-.5)*.7,-deltaVelocity.x*.07);for(const part of Object.values(f.parts))if(!part.detached)part.body.angularVelocity.vadd(spin,part.body.angularVelocity);}
    if(length>7){this.stats.launches++;this.stats.maxLaunchSpeed=Math.max(this.stats.maxLaunchSpeed,length);this.stats.firstLaunch??=this.elapsed;}
    const to=f.parts.torso.body.position.vadd(deltaVelocity.scale(.3));this.effect('launch',f.parts.torso.body.position,to,CONFIG[f.type].color,.5,{radius:1.5,intensity:Math.min(2,length/14)});
  }
  _land(f,position,speed){
    if(!f.airborne||this.elapsed-f.launchAt<.25||this.elapsed-(f.lastLanding??-9)<.65)return;
    f.airborne=false;f.lastLanding=this.elapsed;f.staggerUntil=Math.max(f.staggerUntil,this.elapsed+.23);f.controlledAir=false;
    const radius=f.landingPower?11:Math.min(7,2+speed*.22);
    this.effect('landing',position,null,0xb8aa8e,1.0,{radius,intensity:Math.min(2,speed/9)});
    this.effect('dust',position,null,0xa99a85,1.8,{radius:radius*.7,intensity:1.2});
    if(f.landingPower){this._radial(f,position,11,12,24,'shockwave');f.landingPower=0;this.log(`${f.name} lands with a ground-shattering impact.`);}
    if(f.slammedBy&&f.slamImpactUntil>this.elapsed&&speed>8){this.hitPart(f.id,'torso',Math.min(55,speed*1.4),f.slammedBy);f.slammedBy=null;}
    else if(speed>12)this.effect('impact',position,null,0xffd3a0,.6,{radius:3,intensity:1.4});
  }
  _onCollision(f,p,ev){
    if(!f.alive||p.detached)return;
    const data=ev.body.userData??{},other=data.fighter;
    const velocity=Math.abs(ev.contact.getImpactVelocityAlongNormal());
    const position=this._contactPosition(ev,p.body);
    if(data.ground&&f.airborne&&velocity>2)this._land(f,position,Math.max(velocity,f.lastLaunchVelocity.length()));
    if(velocity<3)return;
    if(other&&other!==f&&other.alive&&!data.part.detached){
      const action=other.action,active=['punch','mixed','redPunch','kick'].includes(action?.kind)&&action.t<action.duration;
      const key=f.id+':'+other.id,hitInterval=active&&action.jackhammer?.13:.38;
      if((this._hitTimes.get(key)??-10)+hitInterval>this.elapsed)return;
      this._hitTimes.set(key,this.elapsed);
      const slash=action?.kind==='slash',punch=(data.part.name.startsWith('forearm')&&(active||slash))||(action?.kind==='kick'&&data.part.name===action.leg),charge=other.chargeUntil>this.elapsed;
      const dmg=clamp((velocity-2)*(punch?1.8:charge?2.0:.65),2,punch?33:charge?45:24)*(other.type==='hulk'?1.2:1);
      this.hitPart(f.id,p.name,dmg*(slash?other.type==='wolverine'?2.1:1.7:1),other.id);
      this.effect('impact',position,null,punch||charge?0xffdba0:0xaaaab0,.45,{radius:punch||charge?2.6:1.1,intensity:punch||charge?1.5:.8});
      if((punch||charge)&&this.elapsed-(other.lastLaunchHit??-2)>(action?.jackhammer?.15:.55)){
        const dir=f.parts.torso.body.position.vsub(other.parts.torso.body.position);dir.y=0;dir.normalize();
        const holdingCombo=action?.jackhammer&&action.t<.6,power=action?.kind==='redPunch'?24:action?.kind==='kick'?16:charge?18:action.jackhammer?(holdingCombo?2.2:18):other.type==='hulk'?14:11;
        this._launch(f,V(dir.x*power,holdingCombo?.5:charge?6.5:4.5,dir.z*power),{duration:holdingCombo?.17:charge?1.0:.6,source:other.id});other.lastLaunchHit=this.elapsed;
        this.log(`${other.name} ${charge?'drives a powered charge through':'launches'} ${f.name}.`);
      }
      if(punch&&this.elapsed-(other.lastPunchLog??-3)>1.2){this.log(`${other.name} lands a heavy physical strike.`);other.lastPunchLog=this.elapsed;}
    }else if(data.prop&&data.prop.kind==='building'&&velocity>5.5){
      // The static structure receives the fighter's kinetic impact too.
      this._queueStructureImpact(data.prop,position,velocity,f.totalMass,f.id);
      const key=f.id+':wall'+data.prop.id;if((this._hitTimes.get(key)??-10)+.75<this.elapsed){this._hitTimes.set(key,this.elapsed);this.hitPart(f.id,p.name,Math.min(60,velocity*1.4),'building impact');}
      if(f.airborne){f.airborne=false;f.staggerUntil=Math.max(f.staggerUntil,this.elapsed+.6);}
    }else if(data.prop&&ev.body.mass>80){
      const key=f.id+':prop'+data.prop.id;
      if((this._hitTimes.get(key)??-10)+.7>this.elapsed)return;this._hitTimes.set(key,this.elapsed);
      this.hitPart(f.id,p.name,clamp(velocity*.6,1,18),'debris');
    }
  }
  _onPropCollision(prop,event){
    if(prop.destroyed)return;
    const speed=Math.abs(event.contact.getImpactVelocityAlongNormal());if(speed<5)return;
    const data=event.body.userData??{};
    if(prop.kind==='building'&&(data.fighter||event.body.mass>90))this._queueStructureImpact(prop,this._contactPosition(event,prop.body),speed,data.fighter?.totalMass??event.body.mass,data.fighter?.id);
    if((prop.kind==='car'||prop.kind==='tank')&&!prop.wrecked&&(data.fighter||event.body.mass>600)&&speed>6){
      const key='vehicle'+prop.id;if((this._hitTimes.get(key)??-10)+.5>this.elapsed)return;this._hitTimes.set(key,this.elapsed);
      prop.health-=speed*(data.fighter?8:3);if(prop.health<=0)this._pendingStructures.push({vehicle:prop});
    }
  }
  _queueStructureImpact(prop,position,speed,mass,source){
    if(speed<6||mass<90||this.elapsed-(prop.lastStructuralHit??-10)<.55)return;
    prop.lastStructuralHit=this.elapsed;this._pendingStructures.push({prop,position:position.clone(),speed,mass,source});
  }
  _fractureBuilding(prop,position,speed=14,mass=1000,source=null){
    if(prop.destroyed||prop.kind!=='building'||speed<6)return;
    const local=position.vsub(prop.body.position),radius=clamp(1.7+speed*.095+Math.sqrt(mass)*.014,2.6,5.1);
    local.y=clamp(local.y,-prop.size[1]/2+.6,-prop.size[1]/2+10.5);
    prop.fractures??=[];
    // Nearby repeated contacts enlarge existing damage, rather than creating
    // hundreds of coincident holes and physics bodies.
    const existing=prop.fractures.find(h=>Math.hypot(h.x-local.x,h.y-local.y,h.z-local.z)<2);
    if(existing){if(radius<=existing.radius+.3)return;existing.radius=Math.min(5.5,radius);}
    else if(prop.fractures.length<6)prop.fractures.push({x:local.x,y:local.y,z:local.z,radius,depth:radius*1.4});else return;
    prop.damageVersion=(prop.damageVersion??0)+1;prop.damaged=true;prop.fractureHeight=Math.min(12,prop.size[1]);
    const body=prop.body,[w,h,d]=prop.size,lower=prop.fractureHeight,nx=Math.ceil(w/2.8),ny=Math.ceil(lower/2.8),nz=Math.ceil(d/2.8),cx=w/nx,cy=lower/ny,cz=d/nz;
    body.shapes.length=body.shapeOffsets.length=body.shapeOrientations.length=0;
    if(h>lower)body.addShape(new C.Box(V(w/2,(h-lower)/2,d/2)),V(0,lower/2,0));
    const allowance=Math.hypot(cx,cy,cz)*.15;
    for(let iy=0;iy<ny;iy++)for(let iz=0;iz<nz;iz++){
      let runStart=-1;
      for(let ix=0;ix<=nx;ix++){
        const center=V(-w/2+cx*(ix+.5),-h/2+cy*(iy+.5),-d/2+cz*(iz+.5));
        const filled=ix<nx&&!prop.fractures.some(f=>Math.hypot(center.x-f.x,center.y-f.y,center.z-f.z)<f.radius+allowance);
        if(filled&&runStart<0)runStart=ix;
        if(!filled&&runStart>=0){const count=ix-runStart;body.addShape(new C.Box(V(cx*count/2,cy/2,cz/2)),V(-w/2+cx*(runStart+count/2),center.y,center.z));runStart=-1;}
      }
    }
    body.updateBoundingRadius();body.aabbNeedsUpdate=true;
    const world=body.position.vadd(local);this.effect('impact',world,null,0xe6d7b5,.6,{radius:radius*1.25,intensity:1.8});this.effect('dust',world,null,0xb4ab97,2.8,{radius:radius*1.8,intensity:2});
    this.effect('shockwave',V(world.x,.1,world.z),null,0xe7d6b5,.8,{radius:radius*2,intensity:1});
    for(let i=0;i<8;i++){
      if(this.props.filter(p=>p.kind==='rubble'&&!p.destroyed).length>65)break;
      const size=[.6+this.random()*1.4,.5+this.random()*1.1,.5+this.random()*1.3],offset=V((this.random()-.5)*radius*1.6,(this.random()-.5)*radius,(this.random()-.5)*radius*1.6);
      const chunk=this._box(world.vadd(offset),size,120+this.random()*180,'rubble',{health:40,color:0x999388,createdAt:this.elapsed});
      const out=world.vsub(body.position);out.y=1;out.normalize();chunk.body.velocity.set(out.x*(4+this.random()*6),3+this.random()*6,out.z*(4+this.random()*6));chunk.body.angularVelocity.set(this.random()*4,this.random()*4,this.random()*4);
    }
    this.stats.buildingImpacts++;this.log(`${source?source.toUpperCase()+' crashes through':'Impact fractures'} a building facade. Concrete and glass break free.`);
  }
  hitPart(id,name,damage,source='impact'){
    const f=this.fighters.find(f=>f.id===id),p=f?.parts[name];
    if(!f?.alive||!p||p.detached||!Number.isFinite(damage)||damage<=0)return false;
    const attacker=this.fighters.find(a=>a.id===source);
    if(attacker?.type==='titan')damage*=attacker.waterCompromised?.66:1.1;
    if(f.type==='titan'){damage*=.83;if(f.shieldUntil>this.elapsed&&attacker){const toward=attacker.parts.torso.body.position.vsub(f.parts.torso.body.position);toward.normalize();if(toward.x*Math.sin(f.yaw)+toward.z*Math.cos(f.yaw)>.05)damage*=.6;}}
    if(attacker?.type==='hulk')damage*=1+.65*attacker.rage;
    if(attacker?.type==='thing')damage*=1.12;
    if(attacker?.type==='venom')damage*=.78;
    if(attacker?.type==='ultron')damage*=.85;
    if(attacker?.type==='buster'||attacker?.type==='titan')damage*=f.type==='venom'?2.1:f.type==='carnage'?1.25:f.type==='ultron'?1.6:1;
    if(f.type==='hulk')damage*=.88-.3*f.rage;
    if(f.type==='thing')damage*=.76;
    if(source==='military')this.stats.militaryDamage+=Math.min(damage,f.maxHealth*.065);
    // The visible health bar is the only defeat threshold. A depleted local
    // head/core can be damaged again, but cannot secretly KO a healthy fighter.
    damage=Math.min(damage,f.maxHealth*.065);
    const n=Math.min(p.health,damage);p.health=Math.max(0,p.health-damage);p.wounds+=n;f.lastDamage=this.elapsed;
    f.health=Math.max(0,f.health-damage);
    f.rage=clamp(f.rage+damage*(f.type==='hulk'?.004:.002),0,1);
    if(ORGANIC.has(f.type)&&this.options.blood&&damage>4)this.effect('blood',p.body.position,null,SYMBIOTES.has(f.type)?0x6b1521:0x981d26,.9);
    if((f.type==='buster'||f.type==='titan'||f.type==='ultron'||f.type==='thing')&&damage>7&&this.random()<.32)this._debris(p.body.position,CONFIG[f.type].color);
    if(p.health<=0&&name!=='torso'&&name!=='head'&&this.options.severing&&f.type!=='wolverine'&&f.type!=='thing'&&!(attacker?.type==='titan'&&ORGANIC.has(f.type)))this._detach(f,name);
    if(f.health<=.0001)this._defeat(f,source);
    return true;
  }
  _detach(f,name){
    const p=f.parts[name];if(p.detached)return;
    if(p.constraint){this.world.removeConstraint(p.constraint);p.constraint=null;}
    const mark=n=>{const a=f.parts[n];a.detached=true;a.detachedAt=this.elapsed;a.health=0;a.body.collisionFilterGroup=1;a.body.collisionFilterMask=-1;for(const [child,parent]of Object.entries(PARENT))if(parent===n)mark(child);};mark(name);
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
        sentry.destroyed=true;this.world.removeBody(sentry.body);f.health=f.maxHealth*.65;
        this.effect('repair',sentry.body.position,f.parts.torso.body.position,0xff514d,2);
        this.log('ULTRON abandons its destroyed body and transfers into a surviving network node.');return;
      }
    }
    for(const actor of this.fighters)if(actor.restraint&&(actor===f||actor.restraint.target===f))this._breakRestraint(actor,false);
    f.alive=false;f.state='Incapacitated';f.health=0;f.action=null;
    for(const p of Object.values(f.parts)){p.body.linearDamping=.1;p.body.angularDamping=.18;}
    this.log(`${f.name} is incapacitated. ${source==='debris'?'Debris was decisive.':'Structural integrity lost.'}`);
    this.finished=true;this.outcome='incapacitation';const survivor=this.fighters.find(a=>a!==f&&a.alive);this.winner=survivor?.name??'DRAW';
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
  _healAndRecharge(f,dt){
    const titanFlying=f.type==='titan'&&f.flight>this.elapsed;
    const recharge=titanFlying?-7:f.type==='titan'&&f.waterCompromised?-1:f.type==='titan'&&f.stealthUntil>this.elapsed?-2:f.type==='hulk'?17:14;f.energy=clamp(f.energy+dt*recharge,0,100);
    if(f.type==='titan'){
      for(const side of ['L','R'])if(f.armBusyUntil[side]<=this.elapsed)f.armModes[side]='idle';
      if(titanFlying&&f.energy<=0)this._endTitanFlight(f);
      this._titanWater(f,dt);if(f.restraint)this._updateRestraint(f,dt);
    }
    if(f.type==='hulk'){const quiet=this.elapsed-(f.lastDamage??0)>7&&f.parts.torso.body.position.distanceTo(f.target.parts.torso.body.position)>14&&!f.action&&!f.grapple;const calming=f.gasUntil>this.elapsed?.065:quiet?.025:0;f.rage=clamp(f.rage-dt*calming,0,1);}
    for(const k of Object.keys(f.cooldowns))f.cooldowns[k]=Math.max(0,f.cooldowns[k]-dt);
    f.flightRemaining=Math.max(0,f.flight-this.elapsed);
    if(f.flight>0&&f.flight<=this.elapsed){f.flight=0;f.flightAwaitingLanding=true;f.airborne=true;f.launchAt=this.elapsed;f.controlledAir=false;f.staggerUntil=Math.max(f.staggerUntil,this.elapsed+.15);this.log(`${f.name}: flight fuel spent; descending to recharge.`);}
    if(f.flightAwaitingLanding&&f.parts.torso.body.position.y<3.25*f.scale&&Math.abs(f.parts.torso.body.velocity.y)<2)f.flightAwaitingLanding=false;
    const healing=f.type==='hulk'?7+5*clamp(f.rage,0,1):f.type==='wolverine'?13:f.type==='venom'?1.8:f.type==='carnage'?4:0;
    if(healing&&!this.finished&&this.elapsed-(f.lastDamage??-10)>(f.type==='wolverine'?.65:1.5)){
      f.health=Math.min(f.maxHealth,f.health+dt*healing);
      for(const p of Object.values(f.parts))if(!p.detached&&p.health<p.maxHealth)p.health=Math.min(p.maxHealth,p.health+dt*healing*.45);
    }
    if(!this.finished&&(SYMBIOTES.has(f.type)||(f.type==='hulk'&&this.options.regrowth))){
      const delay=f.type==='hulk'?21:f.type==='carnage'?9:13;
      const missing=Object.values(f.parts).find(p=>p.detached&&this.elapsed-p.detachedAt>delay&&(!p.parent||!f.parts[p.parent].detached));
      if(missing){this._restore(f,missing.name);this.log(`${f.name} regenerates a missing limb.`);}
    }
  }
  _driveFighter(f,dt){
    if(!f.alive)return;
    this._healAndRecharge(f,dt);
    const t=f.parts.torso.body,actualTarget=f.target.parts.torso.body,target={position:this._perceivedTarget(f),velocity:actualTarget.velocity},s=f.scale;
    if(f.captured){f.state='Captured alive';return;}
    if(f.gasUntil>this.elapsed){f.state=`Go to Sleep · limp ${Math.ceil(f.gasUntil-this.elapsed)}s`;f.action=null;f.grapple=null;f.flight=0;f.controlledAir=false;for(const p of Object.values(f.parts))if(!p.detached)p.body.angularDamping=.12;return;}
    const delta=target.position.vsub(t.position);delta.y=0;const dist=delta.length();if(dist>.01)delta.scale(1/dist,delta);
    const legCount=['shinL','shinR'].filter(n=>!f.parts[n].detached).length,groundHeight=legCount===0?.85*s:2.95*s-(2-legCount)*.22*s;
    if(f.airborne&&this.elapsed-f.launchAt>.4&&t.position.y<groundHeight+.2&&Math.abs(t.velocity.y)<1)this._land(f,V(t.position.x,.1,t.position.z),f.lastLaunchVelocity.length());
    const poweredTitan=f.type==='titan'&&f.flight>this.elapsed&&f.staggerUntil<=this.elapsed;
    const tumbling=!poweredTitan&&(f.staggerUntil>this.elapsed||(f.airborne&&t.position.y>groundHeight+.7));
    if(tumbling){
      f.state=f.controlledAir?(f.type==='buster'?'Rocket-assisted charge':SYMBIOTES.has(f.type)?'Symbiote pounce':f.type==='thing'?'Rock-armored charge':f.type==='wolverine'?'Adamantium pounce':'Gamma leap'):'Airborne · impact recovery';
      if(f.controlledAir){this._orient(t,f.yaw,-.18,0,.6);for(const [name,p]of Object.entries(f.parts))if(!p.detached&&name!=='torso')this._orient(p.body,f.yaw,name.startsWith('thigh')?-.55:name.startsWith('upperArm')?-1.3:.2,0,.35);}
      // Bodies remain ballistic while stunned: no horizontal brakes, floating
      // hip support, or immediate upright torque after being thrown.
      if(Math.abs(t.position.x)>52)t.force.x-=Math.sign(t.position.x)*f.totalMass*8;
      if(Math.abs(t.position.z)>52)t.force.z-=Math.sign(t.position.z)*f.totalMass*8;
      return;
    }
    if(f.airborne)f.airborne=false;
    for(const p of Object.values(f.parts))if(!p.detached)p.body.angularDamping=.48;
    const desiredYaw=Math.atan2(delta.x,delta.z),yawDiff=Math.atan2(Math.sin(desiredYaw-f.yaw),Math.cos(desiredYaw-f.yaw));f.yaw+=clamp(yawDiff,-dt*5.5,dt*5.5);
    let speed=legCount===2?7.2:legCount===1?3.7:1.4;if(f.type==='venom'||f.type==='carnage')speed*=1.28;if(f.type==='hulk')speed*=1.14;if(f.type==='wolverine')speed*=1.35;if(f.type==='thing')speed*=.9;if(f.type==='titan'){speed*=f.waterCompromised?.38:.92;if(f.anchorUntil>this.elapsed&&this._titanGrounded(f))speed*=.3;}if(f.boundBy)speed*=.2;
    const desiredRange=f.type==='ultron'?9:2.4*s,moving=dist>desiredRange;
    if(f.action?.kind==='punch')speed*=.6;
    const retreat=f.type==='ultron'&&dist<5;
    let vx=delta.x*(moving?speed:0),vz=delta.z*(moving?speed:0);if(retreat){vx=-delta.x*4.3;vz=-delta.z*4.3;}
    // Faster, bounded acceleration. Motors are disabled entirely during throws.
    t.force.x+=clamp((vx-t.velocity.x)*3.6,-29,29)*f.totalMass;t.force.z+=clamp((vz-t.velocity.z)*3.6,-29,29)*f.totalMass;
    const flight=f.flight>this.elapsed?(f.type==='titan'?clamp(target.position.y-groundHeight+2,3.5,11):f.type==='buster'?3.8:5.0):0;
    const support=clamp(f.totalMass*9.82+(groundHeight+flight-t.position.y)*f.totalMass*58-t.velocity.y*f.totalMass*11,-f.totalMass*18,f.totalMass*35);
    if(t.position.y<groundHeight+flight+1.4||flight)t.force.y+=support;
    this._orient(t,f.yaw,f.action?.kind==='punch'?-.09:0,0,2.5);
    f.walkPhase+=dt*(moving?10:1.2);const gait=moving?Math.sin(f.walkPhase)*.52:0;
    for(const [name,p]of Object.entries(f.parts)){
      if(p.detached||name==='torso')continue;
      let pitch=0,roll=0;
      if(name.startsWith('thigh'))pitch=name.endsWith('L')?gait:-gait;
      if(name.startsWith('shin'))pitch=(name.endsWith('L')?-gait:gait)*.5;
      if(name.startsWith('upperArm')){pitch=name.endsWith('L')?-gait*.8:gait*.8;roll=name.endsWith('L')?-.16:.16;}
      if(name.startsWith('forearm'))pitch=-.3;
      if(legCount===0&&name.startsWith('upperArm'))pitch=-1.2+(name.endsWith('L')?gait:-gait)*.4;
      if(legCount===0&&name.startsWith('forearm'))pitch=-.8;
      if(['punch','mixed','redPunch'].includes(f.action?.kind)){
        const arm=f.action.kind==='mixed'?'forearmL':f.action.kind==='redPunch'?f.action.arm:f.action.jackhammer?(Math.floor(f.action.t/.19)%2?'forearmR':'forearmL'):f.action.arm,upper=arm.endsWith('L')?'upperArmL':'upperArmR';
        if((f.type==='titan'&&f.action.dual&&(name.startsWith('upperArm')||name.startsWith('forearm')))||name===arm||name===upper){const u=f.action.jackhammer?f.action.t%.19:f.action.t;pitch=u<.08?.6:u<.31?-1.5:-.3;roll=name.endsWith('L')?-.14:.14;}
      }
      if(f.action?.kind==='smash'&&(name.startsWith('upperArm')||name.startsWith('forearm')))pitch=f.action.t<.32?2.5:-1.3;
      if(f.action?.kind==='kick'&&(name===f.action.leg||name===f.action.thigh))pitch=f.action.t<.12?.4:f.action.t<.36?-1.3:0;
      if((f.action?.kind==='repulsor'||f.action?.kind==='mixed')&&(name==='upperArmR'||name==='forearmR'))pitch=-1.5;
      if(f.grapple&&(name.startsWith('upperArm')||name.startsWith('forearm')))pitch=-1.25;
      this._orient(p.body,f.yaw,pitch,roll,name==='head'?1.3:1.7);
    }
    this._updateAction(f,dt,delta,dist);
    if(f.grapple)this._updateGrapple(f,dt);
    if(this.finished)return;
    f.decision-=dt;
    if(f.decision<=0&&!f.action&&!f.grapple){
      f.decision=.25+this.random()*.35;const roll=this.random();let selected;
      if(f.type==='buster'&&target.position.y>t.position.y+2.4)selected=(f.cooldowns.repulsor??0)<=0?'repulsor':'boost';
      else if(f.type==='buster')selected=dist>12?(roll<.5?'boost':'repulsor'):dist>5?(roll<.45?'repulsor':'boost'):roll<.38?'grab':roll<.75?'jackhammer':'punch';
      if(f.type==='titan')selected=this._chooseTitanAbility(f,dist,roll);
      if(f.type==='hulk')selected=dist>8?'leap':dist>4?(roll<.55?'thunderclap':'leap'):roll<.35?'grab':roll<.65?'smash':roll<.82?'thunderclap':'punch';
      if(f.type==='venom')selected=dist>14?'leap':dist>4?'tendril':roll<.4?'bite':roll<.75?'grab':'punch';
      if(f.type==='ultron')selected=roll<.45?'blast':roll<.65?'gravity':roll<.8?'flight':'sentries';
      if(f.type==='carnage')selected=dist>16?'leap':dist>5?(roll<.55?'tendril':'impale'):roll<.55?'slash':'grab';
      if(f.type==='thing')selected=dist>7?'boost':roll<.4?'grab':roll<.7?'smash':'punch';
      if(f.type==='wolverine')selected=dist>5?'leap':roll<.8?'slash':'punch';
      if(f.type==='buster'&&dist<4.5&&roll>.87)selected='gas';
      else if(f.type==='buster'&&target.position.y>t.position.y+3&&roll>.6)selected='flight';
      if(!this.ability(f.id,selected)){if(dist<4)this._punch(f);else if(f.type==='ultron')this.ability(f.id,'blast');else if(f.type==='buster'||f.type==='titan')this.ability(f.id,'repulsor');}
    }
    if(!f.action&&!f.grapple)f.state=f.flight>this.elapsed?'Flight · weapons tracking':moving?'Closing fast':'Circling · ready to strike';
    if(Math.abs(t.position.x)>49)t.force.x-=Math.sign(t.position.x)*f.totalMass*30;
    if(Math.abs(t.position.z)>49)t.force.z-=Math.sign(t.position.z)*f.totalMass*30;
  }
  _updateAction(f,dt,delta,dist){
    const action=f.action;if(!action)return;action.t+=dt;
    if(f.type==='titan'&&['mixed','redPunch','missiles','kick','tackle'].includes(action.kind)){this._updateTitanAction(f,action,dt);if(action.t>action.duration){f.action=null;this._releaseTitanArms(f);}return;}
    if(action.kind==='slash'){
      const phase=action.t%.2,arm=Math.floor(action.t/.2)%2?'forearmL':'forearmR',hand=f.parts[arm];
      if(!hand.detached&&phase>.03&&phase<.14){const direction=f.target.parts.torso.body.position.vsub(hand.body.position);direction.normalize();hand.body.applyForce(direction.scale(f.totalMass*95));}
      if(this.elapsed>(action.nextFx??0)){action.nextFx=this.elapsed+.16;this.effect('slash',hand.body.position,f.target.parts.torso.body.position,CONFIG[f.type].color,.2,{width:.09,radius:1});}
    }
    if(action.kind==='punch'){
      const arm=action.jackhammer&&action.dual!==false?(Math.floor(action.t/.19)%2?'forearmR':'forearmL'):action.arm;
      const phase=action.jackhammer?action.t%.19:action.t;
      if(phase>.075&&phase<.29){for(const armName of f.type==='titan'&&action.dual?['forearmL','forearmR']:[arm]){const fist=f.parts[armName];if(!fist.detached){const forward=V(Math.sin(f.yaw),.16,Math.cos(f.yaw)),rageStrength=f.type==='hulk'?1+.85*clamp(f.rage,0,1):1;fist.body.force.vadd(forward.scale(f.totalMass*(f.type==='hulk'?52:45)*rageStrength*(f.type==='titan'&&f.waterCompromised?.6:1)),fist.body.force);}}}
      if(action.jackhammer&&this.elapsed>(action.nextPiston??0)){action.nextPiston=this.elapsed+.19;this.effect('impact',f.parts[arm].body.position,null,0xa8f4ff,.17,{radius:.65,intensity:.45});}
    }
    if(action.kind==='smash'&&action.t>=.37&&!action.did){action.did=true;this._radial(f,f.parts.torso.body.position,12,14*(1+.85*clamp(f.rage,0,1)),31,'shockwave');this.log('HULK fractures the street with a two-fisted ground smash.');}
    if(action.kind==='repulsor'&&action.t>.24&&!action.did){action.did=true;const hand=['forearmR','forearmL'].find(n=>!f.parts[n].detached);if(hand){const from=f.parts[hand].body.position,target=f.target.parts.torso.body,to=this._perceivedTarget(f).vadd(target.velocity.scale(this._canSeeTarget(f)?Math.min(.55,distance(from,target.position)/62):0));this._shoot(f.id,from,to,'repulsor',52);this.effect('beam',from,to,0x9ef4ff,.32,{radius:.2,intensity:1.7});this.log(`${f.name} releases a charged repulsor blast.`);}}
    if(action.kind==='salvo'&&action.shots<3&&action.t>action.shots*.17){const hand=f.parts.forearmR.detached?'head':'forearmR';const to=this._perceivedTarget(f);to.x+=(action.shots-1)*.2;this._shoot(f.id,f.parts[hand].body.position,to,'ultron',16);action.shots++;}
    if(action.kind==='gravity'&&!action.did){
      const victim=f.target,torso=victim.parts.torso.body;if(action.t<.5){victim.staggerUntil=this.elapsed+.2;const goal=V(torso.position.x,7.8,torso.position.z),acc=goal.vsub(torso.position).scale(18);acc.vsub(torso.velocity.scale(3),acc);this._accelerateRig(victim,acc);if(this.elapsed>(action.nextFx??0)){action.nextFx=this.elapsed+.1;this.effect('tendril',f.parts.forearmR.body.position,torso.position,0xf34032,.2,{intensity:1.5});}}
      else{action.did=true;const direction=this._throwDirection(f,victim);this._launch(victim,V(direction.x*24,5,direction.z*24),{duration:1.1,source:f.id});this.effect('shockwave',torso.position,null,0xff4b39,.6,{radius:5,intensity:1.7});this.log('ULTRON hurls its suspended opponent into the city.');}
    }
    if(action.kind==='bite'&&action.t>.12&&!action.did){action.did=true;const direction=f.target.parts.torso.body.position.vsub(f.parts.torso.body.position);direction.y=0;direction.normalize();const head=f.parts.head.body;head.applyImpulse(V(direction.x*head.mass*10,head.mass*1.5,direction.z*head.mass*10));if(dist<4.5)this.hitPart(f.target.id,'torso',28,f.id);this.effect('impact',f.target.parts.torso.body.position,null,0x919fa1,.35,{radius:1.6,intensity:1.1});}
    if(action.t>action.duration){f.action=null;if(f.type==='titan')this._releaseTitanArms(f);}
  }
  _accelerateRig(f,acceleration){
    const n=acceleration.length();if(n>55)acceleration=acceleration.scale(55/n);
    for(const p of Object.values(f.parts))if(!p.detached)p.body.applyForce(acceleration.scale(p.body.mass));
  }
  _throwDirection(f,victim){
    const pos=victim.parts.torso.body.position;
    const buildings=this.props.filter(p=>p.kind==='building'&&!p.destroyed).map(p=>({p,d:Math.hypot(p.body.position.x-pos.x,p.body.position.z-pos.z)})).filter(p=>p.d<44).sort((a,b)=>a.d-b.d);
    let dir;if(buildings.length){const b=buildings[Math.floor(this.random()*Math.min(3,buildings.length))].p;dir=V(b.body.position.x-pos.x,0,b.body.position.z-pos.z);}
    else{dir=pos.vsub(f.parts.torso.body.position);dir.y=0;}
    if(dir.length()<.01)dir=V(Math.sin(f.yaw),0,Math.cos(f.yaw));dir.normalize();return dir;
  }
  _updateGrapple(f,dt){
    const victim=f.grapple;f.grappleTime-=dt;const body=victim.parts.torso.body,source=f.parts.torso.body;
    if(!victim.alive||distance(body.position,source.position)>23){f.grapple=null;return;}
    victim.staggerUntil=this.elapsed+.15;
    const hold=source.position.vadd(V(Math.sin(f.yaw)*2.5,2.5,Math.cos(f.yaw)*2.5));
    const accel=hold.vsub(body.position).scale(f.type==='titan'&&f.waterCompromised?13:f.type==='venom'?22:25);accel.vsub(body.velocity.scale(5),accel);this._accelerateRig(victim,accel);
    if(this.elapsed>=(f.nextGrappleEffect??0)){const hand=['forearmR','forearmL'].find(n=>!f.parts[n].detached);this.effect('tendril',f.parts[hand??'torso'].body.position,body.position,f.type==='venom'?0x292a32:0xffa559,.18,{radius:f.type==='venom'?.13:.08,intensity:1.3});f.nextGrappleEffect=this.elapsed+.09;}
    if(f.grappleTime<=0){if(f.grappleMode==='slam'){const forward=V(Math.sin(f.yaw),0,Math.cos(f.yaw));this._launch(victim,V(forward.x*2,-18,forward.z*2),{duration:.8,source:f.id});victim.slammedBy=f.id;victim.slamImpactUntil=this.elapsed+1.2;this.log(`${f.name} drives its held opponent toward the ground.`);}else{const dir=this._throwDirection(f,victim);this._launch(victim,V(dir.x*(f.type==='hulk'?26:23),7,dir.z*(f.type==='hulk'?26:23)),{duration:1.15,source:f.id});this.hitPart(victim.id,'torso',18,f.id);this.log(`${f.name} throws ${victim.name} toward ${this.options.arena==='city'?'the surrounding buildings':'the open field'}.`);}f.grapple=null;f.grappleTime=0;f.grappleMode=null;}
  }
  _punch(f,jackhammer=false){
    const candidates=['forearmL','forearmR'].filter(n=>!f.parts[n].detached);if(!candidates.length)return false;
    const arm=candidates[Math.floor(this.random()*candidates.length)];f.action={kind:'punch',arm,upper:arm.endsWith('L')?'upperArmL':'upperArmR',t:0,duration:jackhammer?.85:.55,jackhammer};f.state=jackhammer?'Hydraulic piston barrage':'Heavy physical strike';return true;
  }
  ability(id,name){
    const f=this.fighters.find(f=>f.id===id);if(!f?.alive||this.finished||f.captured||f.staggerUntil>this.elapsed||f.gasUntil>this.elapsed)return false;
    if(f.type==='titan')return this._titanAbility(f,name);
    if(f.boundBy&&['leap','boost','flight'].includes(name))return false;
    if(!this._canSeeTarget(f)&&['gravity','tendril','grab','bite','slash'].includes(name))return false;
    const aliases={repulsors:'repulsor',groundSmash:'smash',grapple:'tendril',goToSleep:'gas'};name=aliases[name]??name;
    const cost={repulsor:17,jackhammer:14,grab:16,boost:19,smash:23,thunderclap:27,leap:18,tendril:20,bite:18,blast:17,gravity:25,flight:18,sentries:30,repair:0,punch:0,gas:26,slash:14,impale:22}[name];
    const legal={buster:['repulsor','jackhammer','grab','boost','repair','punch','flight','gas'],hulk:['smash','thunderclap','leap','grab','punch'],venom:['tendril','bite','leap','grab','punch'],ultron:['blast','gravity','flight','sentries','punch'],carnage:['tendril','impale','slash','leap','grab','punch'],thing:['smash','boost','grab','punch'],wolverine:['slash','leap','grab','punch']}[f.type];
    if(cost===undefined||!legal.includes(name)||(f.cooldowns[name]??0)>0||f.energy<cost)return false;
    const from=f.parts.torso.body.position,to=this._perceivedTarget(f),dir=to.vsub(from),dist=dir.length();dir.y=0;dir.normalize();
    if(name==='flight'&&(f.flight>this.elapsed||this.elapsed<f.flightReadyAt||f.flightAwaitingLanding||f.airborne))return false;
    if(name==='gas'&&(dist>4.6||dir.x*Math.sin(f.yaw)+dir.z*Math.cos(f.yaw)<.35))return false;
    if((name==='slash'&&dist>5.2)||(name==='impale'&&dist>19))return false;
    if((name==='grab'&&dist>6.8)||(name==='tendril'&&dist>20)||(name==='bite'&&dist>5)||(name==='punch'&&dist>5))return false;
    if(['repulsor','blast','jackhammer','grab','tendril'].includes(name)&&f.parts.forearmL.detached&&f.parts.forearmR.detached)return false;
    f.energy-=cost;f.cooldowns[name]={repulsor:3.2,jackhammer:3.8,grab:5,boost:4.5,smash:5,thunderclap:6,leap:4,tendril:4.3,bite:2.7,blast:2.7,gravity:7.5,flight:18,sentries:16,repair:2,punch:.5,gas:14,slash:2.4,impale:4.5}[name];
    if(name==='slash'){f.action={kind:'slash',t:0,duration:.75};f.state='Claw barrage';}
    if(name==='impale'){this._shoot(f.id,from,to,'carnage',34);this.effect('tendril',from,to,0x991b24,.5,{width:.2});f.state='Symbiote blade thrust';}
    if(name==='gas'){
      this.stats.gasAttempts++;this.effect('gas',f.parts.head.body.position,to,0xc6dfa5,1.7,{radius:3,intensity:1});
      const victim=f.target,chance={hulk:.4,venom:.55,carnage:.45,thing:.4,wolverine:.3,ultron:0}[victim.type]??.45;
      if(victim.gasImmuneUntil>this.elapsed)this.log(`${victim.name} resists a repeat gas exposure.`);
      else if(chance&&this.random()<chance){victim.gasUntil=this.elapsed+(victim.type==='wolverine'?2:3.2);victim.gasImmuneUntil=victim.gasUntil+9;victim.action=null;victim.grapple=null;victim.flight=0;victim.controlledAir=false;for(const p of Object.values(victim.parts))p.body.force.setZero();this.stats.gasSuccesses++;this.log(`GO TO SLEEP: ${victim.name} goes limp temporarily.`);}
      else this.log(chance?`GO TO SLEEP: ${victim.name} resists the gas.`:'ULTRON is immune to sedative gas.');
      f.state='Go to Sleep · sedative discharge';
    }
    if(name==='punch')return this._punch(f);
    if(name==='jackhammer'){this._punch(f,true);this.log('HULKBUSTER drives a rapid hydraulic piston barrage.');}
    if(name==='repulsor'){f.action={kind:'repulsor',t:0,duration:.5,did:false};const hand=f.parts.forearmR.detached?'forearmL':'forearmR';this.effect('charge',f.parts[hand].body.position,to,0x9ef4ff,.3,{radius:1,intensity:1.5});f.state='Charging palm repulsor';}
    if(name==='blast'){f.action={kind:'salvo',t:0,duration:.65,shots:0};f.state='Three-shot concussive salvo';this.log('ULTRON fires a tracking energy salvo.');}
    if(name==='smash'){f.action={kind:'smash',t:0,duration:.75};f.state='Two-fisted ground smash';this.effect('charge',from,null,0x8fca56,.4,{radius:2,intensity:1});}
    if(name==='thunderclap'){this._radial(f,from,19,19,26,'shockwave');f.state='Thunderclap shock front';this.log('HULK unleashes a thunderclap that hurls everything around him.');}
    if(name==='leap'||name==='boost'){
      const launchSpeed=name==='boost'?(f.type==='thing'?14:19):SYMBIOTES.has(f.type)||f.type==='wolverine'?18:16,up=name==='boost'?(f.type==='thing'?1.2:clamp(3.8+(to.y-from.y)*1.2,3.8,10)):SYMBIOTES.has(f.type)||f.type==='wolverine'?6:10;
      f.yaw=Math.atan2(dir.x,dir.z);this._launch(f,V(dir.x*launchSpeed,up,dir.z*launchSpeed),{duration:.35,source:f.id,controlled:true,landingPower:f.type==='hulk'?1:0});
      if(name==='boost')f.chargeUntil=this.elapsed+.85;
      this.effect(name==='boost'?'trail':'dust',from,from.vsub(dir.scale(5)),CONFIG[f.type].color,.8,{radius:3,intensity:1.5});this.log(`${f.name} ${name==='boost'?(f.type==='thing'?'drives forward with a rock-armored shoulder':'ignites its thrusters and shoulder-charges'):'launches into a superhuman leap'}.`);
    }
    if(name==='tendril'||name==='grab'){f.grapple=f.target;f.grappleTime=f.type==='venom'?.7:.8;f.grappleThrown=false;f.state=name==='tendril'?'Tendril snare · winding up throw':'Lift · preparing throw';this.log(`${f.name} catches ${f.target.name} for a throw.`);}
    if(name==='bite'){f.action={kind:'bite',t:0,duration:.45,did:false};f.state='Symbiote bite';}
    if(name==='gravity'){f.action={kind:'gravity',t:0,duration:.85,did:false};f.state='Gravity lift · target suspended';this.effect('charge',from,to,0xff514d,.45,{radius:1.6,intensity:1.5});}
    if(name==='flight'){f.flight=this.elapsed+f.flightMaxDuration;f.flightReadyAt=f.flight+14;f.flightRemaining=f.flightMaxDuration;f.cooldowns.flight=f.flightMaxDuration+14;f.state='Short powered flight';this.effect('boost',from,null,CONFIG[f.type].color,.7,{radius:2});this.log(`${f.name} ignites a ${f.flightMaxDuration.toFixed(1)} second flight burst.`);}
    if(name==='sentries'){
      const count=this.props.filter(p=>p.kind==='sentry'&&!p.destroyed).length;
      for(let i=0;i<Math.max(0,Math.min(2,4-count));i++)this._box(V(from.x+(i?3:-3),6,from.z-2),[.65,1.3,.55],120,'sentry',{health:100,cooldown:.5+i*.4,owner:f.id});
      f.state='Sentry swarm deployed';this.log('ULTRON deploys a linked sentry pair.');
    }
    if(name==='repair'){this.veronica.cooldown=0;this._repair();}
    return true;
  }
  _titanGrounded(f){
    const torso=f.parts.torso.body;
    if(this.options.waterDepth>1.25&&torso.position.y-.65*f.scale<this.options.waterDepth)return false;
    return !f.parts.shinL.detached&&!f.parts.shinR.detached&&torso.position.y<2.95*f.scale+.65&&Math.abs(torso.velocity.y)<3&&f.flight<=this.elapsed;
  }
  _releaseTitanArms(f){for(const side of ['L','R']){f.armModes[side]='idle';f.armBusyUntil[side]=this.elapsed;}}
  _endTitanFlight(f){
    f.flight=0;f.flightRemaining=0;f.flightReadyAt=this.elapsed+2;f.flightAwaitingLanding=true;f.airborne=true;f.launchAt=this.elapsed;f.controlledAir=false;f.staggerUntil=Math.max(f.staggerUntil,this.elapsed+.12);
  }
  _canSeeTarget(observer){
    const target=observer.target;if(!target)return false;
    const dist=distance(observer.parts.torso.body.position,target.parts.torso.body.position);
    return !(target.type==='titan'&&target.stealthUntil>this.elapsed)||observer.type==='ultron'||dist<5||target.revealedUntil>this.elapsed||observer.type==='titan';
  }
  _perceivedTarget(observer){
    if(this._canSeeTarget(observer)||!observer.targetMemory)observer.targetMemory=observer.target.parts.torso.body.position.clone();
    return observer.targetMemory.clone();
  }
  _titanWater(f,dt){
    const depth=this.options.waterDepth,submerged=depth>1.25&&f.parts.torso.body.position.y-.65*f.scale<depth;
    f.waterExposure=clamp(f.waterExposure+dt*(submerged?1:-.5),0,20);f.waterCompromised=f.waterExposure>.65;
    if(submerged){
      f.anchorUntil=0;f.energy=Math.max(0,f.energy-dt*(8+f.waterExposure*.5));
      if(this.elapsed>=(f.nextWaterDamage??0)){f.nextWaterDamage=this.elapsed+1;this.hitPart(f.id,'torso',7+f.waterExposure*.8,'water exposure');this.effect('impact',f.parts.torso.body.position,null,0x87bed1,.35,{radius:1,intensity:.2});}
      if(f.waterCompromised)f.state='Heavy water exposure · systems compromised';
    }
  }
  _chooseTitanAbility(f,dist,roll){
    const target=f.target,ratio=target.health/target.maxHealth;
    if(f.waterCompromised&&f.flight<=this.elapsed&&f.energy>25)return 'flight';
    if(f.restraint)return f.anchorUntil<=this.elapsed?'anchor':'shield';
    if(dist<13&&((ratio<.72&&roll<.75)||roll<.14))return 'rope';
    if(target.parts.torso.body.position.y>f.parts.torso.body.position.y+3&&f.flight<=this.elapsed&&roll<.35)return 'flight';
    if(f.flight>this.elapsed&&target.parts.torso.body.position.y<4&&f.parts.torso.body.position.y>7&&roll<.15)return 'flight';
    if(dist>12){
      const safe=!this.civilians.some(c=>c.health>0&&!c.escaped&&distance(c.position,target.parts.torso.body.position)<12);
      if(ratio>.5&&safe&&roll<.25&&(f.missiles.L+f.missiles.R)>0)return 'missiles';
      if(roll>.85&&f.stealthUntil<=this.elapsed)return 'stealth';return 'repulsor';
    }
    if(dist>5)return roll<.4?'repulsor':roll<.7?'rope':roll<.85?'mixed':'tackle';
    return roll<.2?'pistons':roll<.37?'redPunch':roll<.55?'mixed':roll<.65?'grab':roll<.75?'kick':roll<.85?'slam':roll<.93?'anchor':'shield';
  }
  _titanAbility(f,name){
    const aliases={jackhammer:'pistons',redThruster:'redPunch',zenoRope:'rope',stabilizers:'anchor',camouflage:'stealth'};name=aliases[name]??name;
    if(name==='flight'&&f.flight>this.elapsed){this._endTitanFlight(f);this.log('TITAN BREAKER begins a controlled landing.');return true;}
    const costs={pistons:16,mixed:22,redPunch:24,repulsor:17,missiles:20,rope:20,shield:8,flight:10,anchor:7,stealth:18,repair:0,grab:16,punch:0,kick:10,tackle:16,slam:20};
    if(costs[name]===undefined||f.energy<costs[name]||(f.cooldowns[name]??0)>0)return false;
    const from=f.parts.torso.body.position,to=this._perceivedTarget(f),dist=distance(from,to),hands=['L','R'].filter(side=>!f.parts['forearm'+side].detached);
    const armed=['pistons','mixed','redPunch','repulsor','missiles','rope','grab','punch','kick','tackle','slam'].includes(name);
    if(armed&&!hands.length)return false;
    // Mechanical systems have real mutually exclusive arm occupancy. Both-arm
    // pistons cannot be relabelled as a repulsor or Red Thruster attack mid-combo.
    if(armed&&f.action)return false;
    if(['pistons','redPunch','mixed','punch','kick'].includes(name)&&dist>5.5)return false;
    if(name==='mixed'&&hands.length!==2)return false;
    if((name==='grab'||name==='slam')&&dist>6.8)return false;
    if(name==='tackle'&&dist>14)return false;
    if(name==='kick'&&f.parts.shinL.detached&&f.parts.shinR.detached)return false;
    if(name==='rope'&&(dist>14||f.restraint||!f.target.alive))return false;
    if(name==='missiles'&&!(hands.some(side=>f.missiles[side]>0)))return false;
    if(name==='anchor'&&(!this._titanGrounded(f)||f.waterCompromised))return false;
    if(name==='flight'&&(f.flightAwaitingLanding||this.elapsed<f.flightReadyAt||f.waterExposure>12))return false;
    if(name==='shield'&&f.action)return false;
    f.energy-=costs[name];f.revealedUntil=armed?this.elapsed+.8:f.revealedUntil;
    const cooldown={pistons:3,mixed:4,redPunch:4.5,repulsor:3,missiles:5,rope:10,shield:6,flight:0,anchor:10,stealth:18,repair:2,grab:5,punch:.5,kick:2.7,tackle:6,slam:7.5}[name];f.cooldowns[name]=cooldown;
    const occupy=(side,mode,duration)=>{f.armModes[side]=mode;f.armBusyUntil[side]=this.elapsed+duration;};
    if(name==='pistons'){
      const dual=hands.length===2;f.action={kind:'punch',arm:'forearm'+hands[0],upper:'upperArm'+hands[0],t:0,duration:1.05,jackhammer:true,dual};
      for(const side of hands)occupy(side,'piston',1.05);f.state='Dual high-speed piston strikes';
    }
    if(name==='mixed'){
      f.action={kind:'mixed',t:0,duration:1.0,shots:0};occupy('L','piston',1);occupy('R','repulsor',1);f.state='Left piston · opposite-hand repulsor';
    }
    if(name==='redPunch'){
      const side=hands.includes('R')?'R':hands[0];f.action={kind:'redPunch',arm:'forearm'+side,upper:'upperArm'+side,t:0,duration:.65,did:false,side};occupy(side,'redThruster',.65);f.state='Red Thruster single strike';
    }
    if(name==='repulsor'){
      const side=hands.includes('R')?'R':hands[0];occupy(side,'repulsor',.5);f.action={kind:'repulsor',t:0,duration:.5,did:false,side};f.state='Palm cannon charging';this.effect('charge',f.parts['forearm'+side].body.position,to,0x8ff1ff,.3,{radius:1.2,intensity:1.3});
    }
    if(name==='missiles'){
      const count=f.target.health/f.target.maxHealth<.3?1:Math.min(3,hands.reduce((n,side)=>n+f.missiles[side],0));
      f.action={kind:'missiles',t:0,duration:.62,shots:0,count};f.state='Selective homing missile volley';
    }
    if(name==='rope'){this._startRestraint(f);f.state='Zeno whole-body containment';}
    if(name==='shield'){f.shieldUntil=this.elapsed+3;f.state='Wrist shields raised';}
    if(name==='anchor'){f.anchorUntil=this.elapsed+8;f.state='Air-suction foot stabilizers engaged';}
    if(name==='stealth'){f.stealthUntil=this.elapsed+6;f.state='Optical camouflage · repositioning';}
    if(name==='flight'){f.flight=this.elapsed+3600;f.flightRemaining=3600;f.airborne=false;f.controlledAir=false;f.state='Sustained powered flight';}
    if(name==='repair'){this.veronica.cooldown=0;this._repair();}
    if(name==='grab'){f.grapple=f.target;f.grappleTime=.85;f.state='Nonlethal heavy grapple';}
    if(name==='kick'){const side=!f.parts.shinR.detached?'R':!f.parts.shinL.detached?'L':null;if(!side)return false;f.action={kind:'kick',leg:'shin'+side,thigh:'thigh'+side,t:0,duration:.6};f.state='Heavy mechanical kick';}
    if(name==='tackle'){const direction=to.vsub(from);direction.y=0;direction.normalize();this._launch(f,V(direction.x*12,1.2,direction.z*12),{duration:.3,controlled:true,source:f.id});f.action={kind:'tackle',t:0,duration:.55};f.chargeUntil=this.elapsed+.65;f.state='Heavy grounded tackle';}
    if(name==='slam'){f.grapple=f.target;f.grappleTime=1.05;f.grappleMode='slam';f.state='Two-handed lift · preparing body slam';}
    if(name==='punch')this._punch(f);
    this.log(`TITAN BREAKER: ${f.state}.`);return true;
  }
  _updateTitanAction(f,action,dt){
    if(action.kind==='kick'&&action.t>.12&&action.t<.32){const leg=f.parts[action.leg];if(!leg.detached)leg.body.applyForce(V(Math.sin(f.yaw),.2,Math.cos(f.yaw)).scale(f.totalMass*(f.waterCompromised?21:37)));}
    if(action.kind==='redPunch'){
      if(action.t>.12&&action.t<.34){
        const fist=f.parts[action.arm];if(!fist.detached){const forward=V(Math.sin(f.yaw),.12,Math.cos(f.yaw));fist.body.applyForce(forward.scale(f.totalMass*(f.waterCompromised?38:83)));f.redThrusterUntil[action.side]=this.elapsed+.13;
          if(this.elapsed>(action.nextFx??0)){action.nextFx=this.elapsed+.075;this.effect('redPunch',fist.body.position,fist.body.position.vsub(forward.scale(2)),0xff3b28,.22,{radius:1.5,intensity:1.8});}}
      }
    }
    if(action.kind==='mixed'){
      const fist=f.parts.forearmL,phase=action.t%.2;
      if(!fist.detached&&phase>.055&&phase<.15)fist.body.applyForce(V(Math.sin(f.yaw),.12,Math.cos(f.yaw)).scale(f.totalMass*(f.waterCompromised?27:49)));
      if(action.shots<2&&action.t>.2+action.shots*.4&&!f.parts.forearmR.detached){this._shoot(f.id,f.parts.forearmR.body.position,this._perceivedTarget(f),'repulsor',30);action.shots++;}
    }
    if(action.kind==='missiles'&&action.shots<action.count&&action.t>action.shots*.18){if(this._fireTitanMissile(f))action.shots++;else action.shots=action.count;}
  }
  _fireTitanMissile(f){
    const available=['L','R'].filter(side=>!f.parts['forearm'+side].detached&&f.missiles[side]>0);if(!available.length)return false;
    const side=available.sort((a,b)=>f.missiles[b]-f.missiles[a])[0];f.missiles[side]--;f.missileBayUntil[side]=this.elapsed+.8;
    const from=f.parts['forearm'+side].body.position,to=this._perceivedTarget(f),damage=f.target.health/f.target.maxHealth<.3?12:29;
    this._shoot(f.id,from,to,'missile',damage);this.stats.missilesFired++;f.revealedUntil=this.elapsed+.8;this.log(`TITAN BREAKER launches one guided missile. ${f.missiles.L+f.missiles.R}/30 remain.`);return true;
  }
  _steerMissile(shot,dt){
    if(shot.hit||!shot.target?.alive)return;
    const body=shot.body,target=shot.target.parts.torso.body,goal=target.position.vadd(target.velocity.scale(.12)),desired=goal.vsub(body.position);if(desired.length()<.01)return;desired.normalize();
    const current=body.velocity.clone();const speed=Math.max(24,Math.min(44,current.length()+dt*30));current.normalize();const direction=current.scale(1-Math.min(1,dt*2.6)).vadd(desired.scale(Math.min(1,dt*2.6)));direction.normalize();body.velocity.copy(direction.scale(speed));
    body.quaternion.setFromVectors(V(0,0,1),direction);
    if(this.elapsed>(shot.nextTrail??0)){shot.nextTrail=this.elapsed+.06;this.effect('missileTrail',body.position,body.position.vsub(direction.scale(2)),0xff5d34,.28,{radius:.7,intensity:.8});}
  }
  _startRestraint(f){
    if(f.restraint||!f.target.alive)return false;const target=f.target;
    const pairs=[['forearmL','forearmR',.65],['forearmL','torso',1.1],['forearmR','torso',1.1],['shinL','shinR',.55]];const links=[];
    for(const [a,b,factor] of pairs){const pa=target.parts[a],pb=target.parts[b];if(pa.detached||pb.detached)continue;const c=new C.DistanceConstraint(pa.body,pb.body,factor*target.scale,130000);c.collideConnected=false;this.world.addConstraint(c);links.push(c);}
    if(links.length<2){for(const c of links)this.world.removeConstraint(c);return false;}
    target.boundBy=f.id;f.restraint={target,health:100,held:0,links,expires:this.elapsed+12,nextEffect:0};this.effect('rope',f.parts.forearmR.detached?f.parts.forearmL.body.position:f.parts.forearmR.body.position,target.parts.torso.body.position,0x83d8df,.4,{radius:.13,intensity:1});return true;
  }
  _breakRestraint(f,announce=true){
    const rope=f.restraint;if(!rope)return;for(const link of rope.links)this.world.removeConstraint(link);rope.target.boundBy=null;f.restraint=null;
    if(announce){this.stats.restraintsBroken++;this.log(`${rope.target.name} breaks free of the Zeno restraint.`);this.effect('impact',rope.target.parts.torso.body.position,null,0x8ce5ec,.45,{radius:1.8,intensity:1});}
  }
  _updateRestraint(f,dt){
    const rope=f.restraint;if(!rope)return;const target=rope.target,body=target.parts.torso.body;
    if(target.captured)return;
    if(!target.alive||this.finished||this.elapsed>rope.expires||distance(f.parts.torso.body.position,body.position)>24){this._breakRestraint(f,false);return;}
    const ratio=target.health/target.maxHealth,power=target.type==='hulk'?12+target.rage*27:target.type==='thing'?28:target.type==='wolverine'?35:target.type==='carnage'?31:target.type==='venom'?24:20;
    let stress=power*(.25+.75*ratio)+Math.max(0,body.velocity.length()-3)*.9;
    if(target.action?.kind==='slash')stress+=25;
    const solverLoad=rope.links.reduce((sum,c)=>sum+Math.abs(c.distanceEquation.multiplier||0),0);stress+=Math.min(5,solverLoad/35000);
    rope.health-=dt*stress;
    if(rope.health<=0){this._breakRestraint(f);return;}
    const stable=body.velocity.length()<2.5&&body.position.y<3.25*target.scale&&target.staggerUntil<=this.elapsed;
    rope.held=stable?rope.held+dt:Math.max(0,rope.held-dt*.8);
    if(this.elapsed>=rope.nextEffect){rope.nextEffect=this.elapsed+.12;const hand=f.parts.forearmR.detached?'forearmL':'forearmR';this.effect('rope',f.parts[hand].body.position,body.position,0x8ddee5,.2,{radius:.13,intensity:1});}
    if(rope.held>=4){
      target.captured=true;target.state='Captured alive';target.action=null;target.grapple=null;target.flight=0;target.alive=false;
      this.finished=true;this.winner=f.name;this.outcome='capture';this.stats.captures++;f.state='Live containment secured';this.log(`TITAN BREAKER captures ${target.name} alive. Containment is secure.`);
    }
  }
  _sendSundayPart(target){
    const v=this.veronica,prop=this._box(v.body.position.clone(),[.6,.4,.6],20,'repairModule',{health:45,deliveryTargetName:target.name});
    prop.body.type=C.Body.KINEMATIC;prop.body.mass=0;prop.body.updateMassProperties();prop.body.collisionFilterGroup=1;prop.body.collisionFilterMask=-1;
    v.delivery={prop,targetName:target.name};this.log(`SUNDAY dispatches a Red Thruster replacement module. ${v.parts} modules remain.`);
  }
  _updateDelivery(dt){
    const v=this.veronica,delivery=v.delivery;if(!delivery)return;const f=this.fighters[0],part=f.parts[delivery.targetName],prop=delivery.prop;
    if(prop.destroyed||!f.alive){v.delivery=null;return;}
    let goal=part.body.position.clone();
    if(part.detached){const o=OFFSETS[part.name],base=OFFSETS.torso,q=new C.Quaternion();q.setFromEuler(0,f.yaw,0);goal=f.parts.torso.body.position.vadd(q.vmult(V((o[0]-base[0])*f.scale,(o[1]-base[1])*f.scale,(o[2]-base[2])*f.scale)));}
    const delta=goal.vsub(prop.body.position),dist=delta.length();
    if(dist<2){
      this.world.removeBody(prop.body);prop.destroyed=true;v.delivery=null;
      if(part.detached)this._restore(f,part.name);else{part.health=Math.min(part.maxHealth,part.health+part.maxHealth*.8);part.wounds=part.maxHealth-part.health;f.health=Math.min(f.maxHealth,f.health+part.maxHealth*.45);}
      this.effect('repair',prop.body.position,goal,0xff6243,.5,{radius:.5,intensity:1});this.log(`SUNDAY replacement ${part.name} attached.`);return;
    }
    delta.normalize();prop.body.velocity.copy(delta.scale(Math.min(60,dist/Math.max(.01,dt))));prop.body.quaternion.setFromVectors(V(0,0,1),delta);
    this.effect('repair',prop.body.position,prop.body.position.vsub(delta.scale(2)),0xff5136,.16,{radius:.5,intensity:1});
  }
  _radial(f,origin,radius,speed,damage,type){
    this.effect(type,origin,null,CONFIG[f.type].color,1.2,{radius,intensity:1.8});this.effect('dust',V(origin.x,.1,origin.z),null,0xaa9e87,1.7,{radius:radius*.65,intensity:1.2});
    for(const other of this.fighters){if(other===f||!other.alive)continue;const body=other.parts.torso.body,d=distance(body.position,origin);if(d>radius)continue;const dir=body.position.vsub(origin);dir.y=0;dir.normalize();const power=speed*(.55+.45*(1-d/radius))*(other.type==='hulk'?1-.35*other.rage:other.type==='thing'?.55:1);this._launch(other,V(dir.x*power,5+power*.18,dir.z*power),{duration:.9,source:f.id});const modifier=SYMBIOTES.has(other.type)?1.8:1;this.hitPart(other.id,'torso',damage*modifier*(1-d/radius+.4),f.id);if(SYMBIOTES.has(other.type)){other.energy=Math.max(0,other.energy-25);this.log('VENOM recoils from intense sonic pressure.');}}
    for(const p of [...this.props]){if(p.destroyed||p.body.mass===0||p.body.mass>15000)continue;const d=distance(p.body.position,origin);if(d>radius)continue;const dir=p.body.position.vsub(origin);dir.y=.5;dir.normalize();p.body.applyImpulse(dir.scale(p.body.mass*speed*(1-d/radius)*.7));p.health-=damage*1.7;if(p.health<=0)this._destroyProp(p);}
  }
  _shoot(owner,from,to,kind,damage){
    const dir=to.vsub(from);if(dir.length()<.01)return;dir.normalize();const pos=from.vadd(dir.scale(1.2));
    const body=new C.Body({mass:kind==='shell'?12:kind==='bullet'?.012:2,shape:new C.Sphere(kind==='shell'?.24:kind==='bullet'?.055:.34),position:pos,linearDamping:0,collisionFilterGroup:8,collisionFilterMask:owner===this.fighters[0].id?5:owner==='military'?7:3});
    body.velocity.copy(dir.scale(kind==='shell'?42:kind==='bullet'?80:kind==='repulsor'?62:56));body.velocity.y+=kind==='shell'?2:0;body.userData={projectile:true};this.world.addBody(body);
    const shot={id:++this._id,body,previous:pos.clone(),kind,owner,damage,ttl:kind==='missile'?5:3,hit:false,target:kind==='missile'?this.fighters.find(f=>f.id!==owner):null};this.projectiles.push(shot);
    body.addEventListener('collide',event=>{if(shot.hit||event.body.userData?.fighter?.id===owner)return;this._impactShot(shot,event.body,body.position.clone());});
    this.effect(kind==='missile'?'missileTrail':'beam',from,pos,kind==='ultron'?0xff4d4d:kind==='carnage'?0xa9222b:kind==='bullet'?0xffe6a5:0x9bfcff,.15,{radius:kind==='bullet'?.025:.12,intensity:.8});
  }
  _impactShot(shot,body,position){
    if(shot.hit)return;shot.hit=true;shot.ttl=0;
    const {kind,owner,damage}=shot,data=body.userData??{},color=kind==='ultron'?0xff5145:kind==='carnage'?0x9b1723:kind==='shell'?0xffb44c:0x9bfcff;
    this.effect(kind==='bullet'?'impact':'explosion',position,null,color,kind==='bullet'?.2:.8,{radius:kind==='bullet'?.3:kind==='repulsor'?3.5:2.2,intensity:kind==='bullet'?.2:1.5});
    this.effect('beam',shot.previous,position,color,.2,{radius:kind==='repulsor'?.16:kind==='bullet'?.02:.08,intensity:1.4});
    if(data.fighter){
      const f=data.fighter;this.hitPart(f.id,data.part.name,damage,owner);
      if(kind!=='bullet'){const knock=shot.body.velocity.clone();knock.y=0;knock.normalize();const power=kind==='repulsor'?15:kind==='shell'?8:9;this._launch(f,V(knock.x*power,kind==='repulsor'?5:3.5,knock.z*power),{duration:.75,source:owner});}
    }
    if(data.prop){
      const p=data.prop;if(p.kind==='building')this._queueStructureImpact(p,position,kind==='repulsor'?22:kind==='shell'?18:kind==='ultron'?14:0,kind==='bullet'?0:1500,owner);
      else if(!p.wrecked){p.health-=damage*2.6;if(p.health<=0)this._pendingStructures.push({vehicle:p});}
    }
    if(data.veronica)this.damageVeronica(damage*1.2);
    if(kind==='shell'||kind==='missile')this._blastAt(position,kind==='missile'?3.7:5,6,damage*.35,owner);
  }
  _blastAt(position,radius,speed,damage,owner=null){
    for(const f of this.fighters){if(!f.alive||f.id===owner)continue;const pos=f.parts.torso.body.position,d=distance(pos,position);if(d>radius)continue;const dir=pos.vsub(position);dir.y=0;if(dir.length()>.01)dir.normalize();const factor=1-d/radius;this.hitPart(f.id,'torso',damage*(.4+factor),owner??'explosion');this._launch(f,V(dir.x*speed*(.5+factor),3+factor*3,dir.z*speed*(.5+factor)),{duration:.65,source:owner});}
    for(const p of [...this.props]){if(p.destroyed||p.body.mass===0||p.wrecked)continue;const d=distance(p.body.position,position);if(d>radius)continue;const dir=p.body.position.vsub(position);dir.y=1;dir.normalize();p.body.applyImpulse(dir.scale(p.body.mass*speed*(1-d/radius)));p.health-=damage*1.5;if(p.health<=0)this._pendingStructures.push({vehicle:p});}
  }
  _destroyProp(p){
    if(p.destroyed||p.wrecked)return;
    if(p.kind==='building'){this._fractureBuilding(p,V(p.body.position.x-p.size[0]/2,3,p.body.position.z),20,1500);return;}
    if(p.kind==='car'||p.kind==='tank'){
      p.wrecked=true;p.health=999999;p.fireUntil=this.elapsed+12;p.damageVersion=(p.damageVersion??0)+1;p.body.angularDamping=.35;
      this.effect('explosion',p.body.position,null,0xffa839,1.7,{radius:p.kind==='tank'?7:5.5,intensity:2});this.effect('dust',p.body.position,null,0x292a29,3,{radius:5,intensity:1.5});
      this._blastAt(p.body.position,8,11,p.kind==='tank'?24:18);for(let i=0;i<6;i++)this._debris(p.body.position,0x41464b);
      this.stats.vehicleExplosions++;this.log(`${p.kind==='tank'?'A military vehicle':'A vehicle'} erupts from the impact.`);return;
    }
    p.destroyed=true;this.world.removeBody(p.body);this.effect('impact',p.body.position,null,p.kind==='sentry'?0xff6b42:0xb4bbbc,.55,{radius:2,intensity:1});
    if(p.kind!=='rubble')for(let i=0;i<3;i++)this._debris(p.body.position,p.kind==='sentry'?0x6d787e:0x9d8e72);
  }
  damageVeronica(damage){
    const v=this.veronica;if(v.health<=0)return;
    v.health=Math.max(0,v.health-damage);
    this.effect('impact',v.body.position,null,0xffaa55,.6);
    if(v.health===0){v.destroyed=true;v.repairTarget=null;v.body.type=C.Body.DYNAMIC;v.body.mass=1800;v.body.updateMassProperties();this.log(`${v.name} DESTROYED. Replacement parts are no longer available. Autonomous combat remains online.`);this.effect('explosion',v.body.position,null,0xffa456,2);}
  }
  _restore(f,name,spawn=null){
    const p=f.parts[name],base=f.parts.torso.body,s=f.scale,o=OFFSETS[name],bo=OFFSETS.torso;
    if(p.constraint){this.world.removeConstraint(p.constraint);p.constraint=null;}
    const offset=V(o[0]*s,(o[1]-bo[1])*s,o[2]*s),q=new C.Quaternion();q.setFromEuler(0,f.yaw,0);const world=q.vmult(offset);
    // A replacement grows/assembles at its actual attachment rather than dragging
    // old debris across the map. The original detached body becomes debris.
    const old=p.body;
    const size=p.size,body=new C.Body({mass:old.mass,shape:new C.Box(V(size[0]/2,size[1]/2,size[2]/2)),position:(spawn??base.position).vadd(world),linearDamping:.14,angularDamping:.55,allowSleep:false});
    body.quaternion.copy(q);body.velocity.copy(base.velocity);body.collisionFilterGroup=f.isHero?2:4;body.collisionFilterMask=1|(f.isHero?4:2)|8;
    old.removeEventListener('collide',p._collideHandler);
    p._collideHandler=ev=>this._onCollision(f,p,ev);
    body.userData={fighter:f,part:p};body.addEventListener('collide',p._collideHandler);this.world.addBody(body);
    old.userData={};old.collisionFilterGroup=1;old.collisionFilterMask=-1;old.allowSleep=true;old.sleepSpeedLimit=.25;old.sleepTimeLimit=2;
    this.props.push({id:++this._id,kind:f.type==='buster'||f.type==='titan'?'armorDebris':f.type==='ultron'?'metalDebris':'organicDebris',body:old,size:p.size,health:20,color:f.type==='titan'?0x424b55:f.type==='buster'?0x6d352b:f.type==='hulk'?0x3c6435:0x21242a,createdAt:this.elapsed});
    p.body=body;p.health=p.maxHealth*.85;p.detached=false;p.wounds=p.maxHealth*.15;
    if(name!=='torso')this._connect(f,name);
    f.health=Math.min(f.maxHealth,f.health+p.maxHealth*.4);
    this.effect('repair',base.position,body.position,f.type==='hulk'?0x83c15f:0x9beeff,2);
  }
  _repair(){
    const v=this.veronica,f=this.fighters[0];
    if(v.health<=0||v.parts<=0||v.cooldown>0||!f.alive||this.finished||v.delivery)return;
    let target=Object.values(f.parts).find(p=>p.detached&&(!p.parent||!f.parts[p.parent].detached));
    if(!target)target=Object.values(f.parts).filter(p=>!p.detached&&p.health<p.maxHealth*.42).sort((a,b)=>a.health/a.maxHealth-b.health/b.maxHealth)[0];
    if(!target)return;
    v.parts--;v.cooldown=11;
    if(f.type==='titan'){this._sendSundayPart(target);return;}
    this.effect('repair',v.body.position,target.body.position,0x92e8ff,2.2);
    if(target.detached)this._restore(f,target.name);else{target.health=Math.min(target.maxHealth,target.health+target.maxHealth*.8);target.wounds=target.maxHealth-target.health;f.health=Math.min(f.maxHealth,f.health+target.maxHealth*.45);}
    this.log(`VERONICA replaces ${target.name}. ${v.parts} repair module${v.parts===1?'':'s'} remaining.`);
  }
  _updateWorld(dt){
    const v=this.veronica;
    if(v.health>0){v.cooldown=Math.max(0,v.cooldown-dt);v.body.position.y=v.altitude+Math.sin(this.elapsed*.5)*.25;this._repair();}this._updateDelivery(dt);
    for(const p of this.props){
      if(p.destroyed)continue;
      if(p.wrecked&&p.fireUntil>this.elapsed&&this.elapsed>(p.nextFireEffect??0)){p.nextFireEffect=this.elapsed+.8;this.effect('fire',p.body.position,null,0xff9c36,1.4,{radius:1.6,intensity:1});}
      if(p.kind==='sentry'){
        p.cooldown-=dt;const target=this.fighters[0],b=p.body,pos=target.parts.torso.body.position;
        const forceDuty=dt*120;b.force.y+=b.mass*(9.82+(5-b.position.y)*5-b.velocity.y*3)*forceDuty;const dx=pos.x-b.position.x,dz=pos.z-b.position.z;
        b.force.x+=(dx*.15-b.velocity.x)*b.mass*2*forceDuty;b.force.z+=(dz*.15-b.velocity.z)*b.mass*2*forceDuty;
        if(p.cooldown<0&&target.alive&&!this.finished){p.cooldown=1.8+this.random();this._shoot('ultron',b.position,pos,'ultron',7);}
      }
      if(p.kind==='tank'&&!p.wrecked&&this.options.military&&!this.finished){
        p.cooldown-=dt;if(p.cooldown<=0){p.cooldown=2.8+this.random()*1.4;const targets=this.fighters.filter(f=>f.alive);const f=targets[Math.floor(this.random()*targets.length)];if(f){const pos=p.body.position.clone();pos.y+=1.3;this._shoot('military',pos,f.parts.torso.body.position.vadd(f.parts.torso.body.velocity.scale(.25)),'shell',32);this.effect('explosion',pos,null,0xffd49b,.25);}}
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
        if(person.cooldown<0&&!this.finished&&min<45){person.cooldown=.55+this.random()*.4;const target=nearest.parts.torso.body.position;position.y=1.35;this.effect('tracer',position,target,0xffe1a0,.15);this._shoot('military',position,target,'bullet',3.5);}
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
      this._worldClock+=fixed;if(this._worldClock>=.05){this._updateWorld(this._worldClock);this._worldClock=0;}
      for(const shot of this.projectiles){shot.ttl-=fixed;shot.previous.copy(shot.body.position);if(shot.kind==='missile')this._steerMissile(shot,fixed);if(shot.kind!=='shell')shot.body.force.y+=shot.body.mass*9.82;}
      this.world.step(fixed);
      // Swept physical ray queries prevent a fast energy bolt slipping through a
      // thin limb/facade between solver steps. They share the live collision mask.
      for(const shot of this.projectiles){
        if(shot.hit||shot.ttl<=0)continue;
        const result=new C.RaycastResult();if(this.world.raycastClosest(shot.previous,shot.body.position,{collisionFilterMask:shot.body.collisionFilterMask,collisionFilterGroup:8,skipBackfaces:true},result)&&result.body.userData?.fighter?.id!==shot.owner)this._impactShot(shot,result.body,result.hitPointWorld.clone());
      }
      const pending=this._pendingStructures.splice(0);
      for(const hit of pending){if(hit.vehicle)this._destroyProp(hit.vehicle);else this._fractureBuilding(hit.prop,hit.position,hit.speed,hit.mass,hit.source);}
      for(const shot of this.projectiles)if(shot.ttl<=0)this.world.removeBody(shot.body);
      this.projectiles=this.projectiles.filter(s=>s.ttl>0);
      for(const body of this.world.bodies){const linear=body.velocity.length(),angular=body.angularVelocity.length();if(linear>65)body.velocity.scale(65/linear,body.velocity);if(angular>28)body.angularVelocity.scale(28/angular,body.angularVelocity);}
      if(this.props.length>160)this.props=this.props.filter(p=>!p.destroyed);
      for(const e of this.effects)e.ttl-=fixed;this.effects=this.effects.filter(e=>e.ttl>0);
      this.accumulator-=fixed;
    }
  }
  dispose(){for(const f of this.fighters)if(f.restraint)this._breakRestraint(f,false);for(const body of [...this.world.bodies])this.world.removeBody(body);this.effects=[];this.projectiles=[];}
}

export const CHARACTER_CONFIGS=CONFIG;
