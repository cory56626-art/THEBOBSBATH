import * as THREE from '../house/vendor/three.module.js';
import { Simulation } from './simulation.js?v=3';
import { CombatEffects } from './effects.js?v=3';
import { createPart, createVeronica, createSunday, setPartDamage, configureModelQuality } from './models.js?v=3';
import { createEnvironment, createProp, createCivilian, updateCivilian, createProjectile, createWater } from './environment.js?v=3';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let renderer,scene,camera,sim,environment,pod,combatEffects,started=false,paused=false,enemy='hulk',arena='city',hero='buster',cameraMode='director',speed=1;
let last=performance.now(),hudTimer=0,resultShown=false,dragged=false,autoCamera=true,audioEnabled=false,audioContext;
let simGeneration=0,frameCount=0,lastEvent='',shake=0,slowFrames=0,qualityReduced=false;
const view=$('#viewport'), meshes=new Map();
let rubbleBatch=null,water=null;
let physicsDebt=0,renderDirty=true,renderTimer=0,qualityLevel=0,frameAverage=1/60,audioChoice=null,audioMaster,noiseBuffer;
const timing={wall:0,simulated:0,backlog:0,fps:60};
const orbit={yaw:.8,pitch:.31,distance:21,target:new THREE.Vector3(0,2,0)};
const wantedTarget=new THREE.Vector3(), temp=new THREE.Vector3();
const bodyCopy=(mesh,body)=>{mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);};
const clock=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
const options=()=>({enemy,arena,hero,waterDepth:Number($('#water-depth')?.value??0),regrowth:$('#regrowth').checked,severing:$('#severing').checked,blood:$('#blood').checked,military:$('#military').checked,networkTransfer:$('#networkTransfer').checked});
const titanHints={pistons:'Both piston arms operate together; palm cannons and Red Thrusters stay locked until the combo ends.',mixed:'Left-arm piston strikes with the opposite palm firing. Separate mechanisms, one per arm.',redPunch:'One Red Thruster accelerates a single heavy punch; never combined with pistons.',repulsor:'Palm cannon discharge. Both-arm piston strikes lock the palms.',missiles:'Three guided missiles per volley, 15 in each arm. Lost forearms cannot launch their remaining stock.',rope:'Breakable Zeno rope wraps the body. Stable restraint can secure a live capture.',anchor:'Ground-only air-suction stabilization. Deep water compromises it.',shield:'Raise wrist shields against incoming frontal strikes.',stealth:'Optical concealment reduces distant visual tracking. Close senses and Ultron sensors can still detect you.',repair:'Request a physical Red Thruster replacement from Sunday; supplies are finite.',kick:'Drive a physical kick at close range.',tackle:'Use the heavy frame’s mass for a grounded close-range tackle.',slam:'Grab and drive the target toward the ground with a physical body slam.'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const heroProfiles={
  buster:{name:'HULKBUSTER',mark:'44',eyebrow:'MARK XLIV / LIVE PHYSICS SANDBOX',title:'BUILT FOR<br>THE <em>IMPOSSIBLE.</em>',copy:'An unstoppable suit. An unpredictable fight.<br>Choose the threat. Let physics take over.',detail:'MK XLIV · VERONICA LINK ACTIVE',commands:[['repulsor','Repulsor blast'],['jackhammer','Hydraulic combo'],['boost','Rocket charge'],['repair','Repair'],['flight','Flight burst'],['gas','Go to Sleep']]},
  titan:{name:'TITAN BREAKER',mark:'TB',eyebrow:'ELIAS VANE / AUTONOMOUS CONTAINMENT',title:'BUILT TO<br><em>CONTAIN.</em>',copy:'Zeno armor. Independent intelligence.<br>Subdue the threat. Bring them back alive.',detail:'3.35 M · ZENO ARMOR · SUNDAY SUPPORT',commands:[['pistons','Dual pistons'],['redPunch','Red Thruster'],['repulsor','Palm repulsor'],['missiles','Homing missiles'],['rope','Zeno restraint'],['flight','Fly / land']],systems:[['mixed','Piston + repulsor'],['shield','Wrist shields'],['anchor','Foot anchors'],['stealth','Optical stealth'],['repair','Sunday repair'],['kick','Heavy kick'],['tackle','Heavy tackle'],['slam','Body slam']]}
};
function updateHeroUI(){
  const profile=heroProfiles[hero];
  const put=(id,value,html=false)=>{const node=$(id);if(node){if(html)node.innerHTML=value;else node.textContent=value;}};
  put('#hero-title',profile.title,true);put('#hero-eyebrow',profile.eyebrow);put('#hero-copy',profile.copy,true);put('#hero-mark',profile.mark);put('#hero-model-title',profile.name);put('#hero-model-detail',profile.detail);put('#hero-camera-label',hero==='titan'?'Titan Breaker':'Hulkbuster');put('#support-name',hero==='titan'?'SUNDAY UPLINK':'VERONICA UPLINK');
  const brand=$('.brand>span');if(brand)brand.innerHTML=(hero==='titan'?'VANE':'STARK')+'<span class="brand-sub">'+(hero==='titan'?'CONTAINMENT LABORATORY':'COMBAT LABORATORY')+'</span>';
  document.title=profile.name+' · Combat Laboratory';document.body.classList.toggle('titan-selected',hero==='titan');
  $$('[data-hero]').forEach(button=>{const active=button.dataset.hero===hero;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',active);});
  const bar=$('#ability-bar')||$('.ability-bar');
  bar.innerHTML='<span>MANUAL COMMAND /</span>'+profile.commands.map(([ability,label],i)=>`<button data-ability="${ability}">${label} <kbd>${i+1}</kbd></button>`).join('')+(profile.systems?'<details class="extra-systems"><summary>More systems +</summary><div class="extra-system-buttons">'+profile.systems.map(([ability,label])=>`<button data-ability="${ability}">${label}</button>`).join('')+'</div></details>':'');
}
function prepareTitanMaterials(group){
  group.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.titanOwned)return;mesh.userData.titanOwned=true;const copy=material=>{const clone=material.clone();clone.onBeforeCompile=material.onBeforeCompile;clone.customProgramCacheKey=material.customProgramCacheKey;clone.userData={...material.userData,transient:true};return clone;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);});
}
function applyTitanAppearance(mesh,f,name){
  prepareTitanMaterials(mesh);
  const stealth=f.stealthUntil>sim.elapsed,alpha=stealth?.19:1;
  mesh.traverse(child=>{if(child.isMesh)for(const m of Array.isArray(child.material)?child.material:[child.material]){if(m.opacity!==alpha){m.opacity=alpha;m.transparent=stealth;m.depthWrite=!stealth;m.needsUpdate=true;}}});
  const side=name.endsWith('L')?'L':name.endsWith('R')?'R':null;
  const bay=side&&(f.missileBayUntil?.[side]??0)>sim.elapsed;
  for(const flap of mesh.userData.missileFlaps||[])flap.rotation.x=bay?(flap.userData.openAngle??-1.45):(flap.userData.closedAngle??0);
  const red=side&&(f.redThrusterUntil?.[side]??0)>sim.elapsed;
  for(const jet of mesh.userData.redThrusters||[])jet.visible=!!red||(!side&&f.flight>sim.elapsed);
}

function setup(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;
    applyGraphics();view.appendChild(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,600);
    const hemi=new THREE.HemisphereLight(0xc3dded,0x66654c,2.25);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffdfae,3.4);sun.position.set(-19,35,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-42;sun.shadow.camera.right=42;sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.camera.near=1;sun.shadow.camera.far=100;sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;sun.shadow.radius=3;scene.add(sun);
    const rim=new THREE.DirectionalLight(0xb4d7ed,2.1);rim.position.set(14,15,-20);scene.add(rim);
    const envScene=new THREE.Scene();envScene.background=new THREE.Color(0xa6bec7);
    const lightPanel=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));lightPanel.position.set(15,15,15);lightPanel.lookAt(0,0,0);envScene.add(lightPanel);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x555a4c,side:THREE.DoubleSide}));ground.rotation.x=-Math.PI/2;ground.position.y=-10;envScene.add(ground);
    const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.04);scene.environment=env.texture;pmrem.dispose();
    combatEffects=new CombatEffects(scene,{onImpact:impactFeedback});
    applyGraphics();reset(false);bind();$('#launch').disabled=false;$('#launch-label').textContent='BEGIN ENGAGEMENT';last=performance.now();requestAnimationFrame(frame);
    window.__arena={get sim(){return sim},get scene(){return scene},get renderer(){return renderer},get started(){return started},get effects(){return combatEffects},timing,start:()=>launch(),reset:()=>reset(started),step:dt=>{sim.step(dt);sync();combatEffects.update(sim,dt);renderDirty=true;updateHUD()},setHero:type=>{hero=type;reset(started)},setEnemy:type=>{enemy=type;reset(started)},setArena:type=>{arena=type;$('#arena').value=type;reset(started)}};
  }catch(err){console.error(err);$('#boot-error').hidden=false;$('#boot-error').textContent=`Unable to initialize 3D: ${err.message}. This game needs WebGL.`;$('#launch-label').textContent='3D INITIALIZATION FAILED';}
}
function removeMesh(mesh,dispose=false){scene.remove(mesh);if(dispose)mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData?.transient)m.dispose();}});}
function reset(run=false){
  sim?.dispose();combatEffects?.clear();if(rubbleBatch)for(const layer of rubbleBatch.layers)layer.count=0;for(const m of meshes.values())removeMesh(m,true);meshes.clear();physicsDebt=0;renderDirty=true;last=performance.now();
  if(environment){environment.dispose();environment=null;}water?.dispose();water=null;if(pod)scene.remove(pod);
  sim=new Simulation(options());simGeneration++;environment=createEnvironment(scene,arena);if(sim.options.waterDepth>0)water=createWater(scene,sim.options.waterDepth);pod=hero==='titan'?createSunday():createVeronica();scene.add(pod);updateHeroUI();
  started=run;paused=false;resultShown=false;timing.wall=0;timing.simulated=0;$('#result').hidden=true;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Pause simulation');lastEvent='';
  orbit.target.set(0,2,0);orbit.yaw=.78;orbit.pitch=.29;orbit.distance=innerWidth<760?24:22;autoCamera=true;cameraMode='director';setCameraSelection();
  // Preview is the actual initial physical arrangement, before any AI decisions.
  if(!run){orbit.target.set(-5.6,2.5,0);orbit.yaw=.64;orbit.pitch=.16;orbit.distance=innerWidth<760?18:13.6;}
  $('#match-title').innerHTML=`${heroProfiles[hero].name} <span>VS</span> ${sim.fighters[1].name}`;
  if($('#hero-select'))$('#hero-select').hidden=run;
  $('#fighter-hud').innerHTML=sim.fighters.map(f=>`<article class="fighter-card ${f===sim.fighters[0]?'':'enemy'}" id="hud-${f.id}"><div class="fighter-card-head"><b>${f.name}</b><span class="hp" title="Match health: defeat occurs only when this bar reaches zero.">100%</span></div><p class="state">STANDBY</p><div class="health-track"><i></i></div><div class="limbs"></div>${f.type==='titan'?'<div class="systems-status"></div>':''}</article>`).join('');
  sync();updateHUD();updateCamera(1);document.body.classList.toggle('live',run);$('#intro').hidden=run;$('#setup-deck').hidden=run;$('#hero-caption').hidden=run;$('.hero-mark').hidden=run;$('#session').hidden=!run;
}
function launch(){if(started)return;started=true;document.body.classList.add('live');$('#intro').hidden=true;if($('#hero-select'))$('#hero-select').hidden=true;$('#setup-deck').hidden=true;$('#hero-caption').hidden=true;$('.hero-mark').hidden=true;$('#session').hidden=false;orbit.distance=innerWidth<760?24:22;orbit.pitch=.27;autoCamera=true;$('#system-label').textContent='ENGAGEMENT ACTIVE';physicsDebt=0;renderDirty=true;if(audioChoice!==false)enableAudio();last=performance.now();}
function sync(){
  const valid=new Set();
  for(const f of sim.fighters)for(const [name,p] of Object.entries(f.parts)){
    const key=`part-${f.id}-${name}`;valid.add(key);let mesh=meshes.get(key);
    if(!mesh){mesh=createPart(f.type,name,p.size);if(f.type==='titan')prepareTitanMaterials(mesh);scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);mesh.visible=p.body.position.y>-30;
    setPartDamage(mesh,1-p.health/p.maxHealth,!['buster','ultron','titan'].includes(f.type),sim.options.blood);if(f.type==='titan')applyTitanAppearance(mesh,f,name);
  }
  for(const p of sim.props){
    const key=`prop-${p.id}`;if(p.destroyed||p.hidden||!sim.world.bodies.includes(p.body)||p.kind==='rubble')continue;valid.add(key);let mesh=meshes.get(key);
    if(mesh&&mesh.userData.damageVersion!==(p.damageVersion??0)){removeMesh(mesh,true);meshes.delete(key);mesh=null;}
    if(!mesh){mesh=createProp(p);mesh.userData.damageVersion=p.damageVersion??0;scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);mesh.visible=p.body.position.y>-20;
  }
  for(const c of sim.civilians){
    const key=`civ-${c.id}`;if(c.escaped)continue;valid.add(key);let mesh=meshes.get(key);if(!mesh){mesh=createCivilian(c);scene.add(mesh);meshes.set(key,mesh);}mesh.position.copy(c.position||c.body.position);updateCivilian(mesh,c,sim.elapsed);
  }
  for(const p of sim.projectiles){const key=`shot-${p.id}`;valid.add(key);let mesh=meshes.get(key);if(!mesh){mesh=createProjectile(p);scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);}
  for(const [key,mesh] of meshes)if(!valid.has(key)){removeMesh(mesh);meshes.delete(key);}
  syncRubble();
  bodyCopy(pod,sim.veronica.body);pod.userData.modules?.forEach((m,i)=>{m.visible=i<sim.veronica.parts;});if(hero==='titan')for(const jet of pod.userData.redThrusters||[])jet.visible=sim.veronica.health>0;
  if(sim.veronica.health<=0){pod.rotation.z+=.005;}
}

function syncRubble(){
  if(!rubbleBatch){
    const template=createProp({id:17,kind:'rubble',size:[1.7,1.2,1.3],color:0x999388});template.updateMatrixWorld(true);
    const layers=[];template.traverse(child=>{if(!child.isMesh)return;const geo=child.geometry.clone();geo.applyMatrix4(child.matrixWorld);const mesh=new THREE.InstancedMesh(geo,child.material,128);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);layers.push(mesh);});
    rubbleBatch={layers,matrix:new THREE.Matrix4(),scale:new THREE.Vector3(),color:new THREE.Color()};
  }
  let index=0;
  for(const p of sim.props){if(p.kind!=='rubble'||p.destroyed||index>=128)continue;
    rubbleBatch.scale.set(p.size[0]/1.7,p.size[1]/1.2,p.size[2]/1.3);rubbleBatch.matrix.compose(p.body.position,p.body.quaternion,rubbleBatch.scale);
    rubbleBatch.color.setHex(p.color??0xffffff);for(const layer of rubbleBatch.layers){layer.setMatrixAt(index,rubbleBatch.matrix);layer.setColorAt(index,rubbleBatch.color);}index++;
  }
  for(const layer of rubbleBatch.layers){layer.count=index;layer.instanceMatrix.needsUpdate=true;if(layer.instanceColor)layer.instanceColor.needsUpdate=true;}
}
function intersectsBuilding(start,end,p){
  const body=p.body;
  for(let i=0;i<body.shapes.length;i++){
    const half=body.shapes[i].halfExtents;if(!half)continue;const offset=body.shapeOffsets[i];let lo=.015,hi=.985;
    for(const axis of ['x','y','z']){const d=end[axis]-start[axis],center=body.position[axis]+offset[axis],mn=center-half[axis],mx=center+half[axis];
      if(Math.abs(d)<.00001){if(start[axis]<mn||start[axis]>mx){hi=-1;break;}}
      else{let a=(mn-start[axis])/d,b=(mx-start[axis])/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)break;}
    }
    if(lo<=hi)return true;
  }return false;
}
function clearSightCamera(b,e,dt){
  const buildings=sim.props.filter(p=>p.kind==='building'&&!p.destroyed),candidate=new THREE.Vector3();
  const positionFor=(yaw,distance)=>candidate.set(Math.sin(yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(yaw)*Math.cos(orbit.pitch)).multiplyScalar(distance).add(orbit.target);
  const score=(point)=>buildings.reduce((n,p)=>n+(intersectsBuilding(b,point,p)?1:0)+(intersectsBuilding(e,point,p)?1:0),0);
  if(autoCamera&&cameraMode==='director'){
    let bestYaw=orbit.yaw,best=score(positionFor(orbit.yaw,orbit.distance));
    if(best){for(const offset of [.5,-.5,1,-1,1.6,-1.6,2.4,-2.4,Math.PI]){const value=score(positionFor(orbit.yaw+offset,orbit.distance))+.025*Math.abs(offset);if(value<best){best=value;bestYaw=orbit.yaw+offset;}}orbit.yaw+=(bestYaw-orbit.yaw)*Math.min(1,dt*5);}
  }
  const point=positionFor(orbit.yaw,orbit.distance);
  for(const p of buildings){const mesh=meshes.get(`prop-${p.id}`);if(!mesh)continue;const obscures=started&&autoCamera&&(intersectsBuilding(b,point,p)||intersectsBuilding(e,point,p));
    if(obscures&&!mesh.userData.cameraFadeMaterials){mesh.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});mesh.userData.cameraFadeMaterials=true;}
    if(mesh.userData.cameraFadeMaterials)mesh.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){const opacity=obscures?.15:1;if(m.opacity!==opacity){m.opacity=opacity;m.transparent=obscures;m.depthWrite=!obscures;m.needsUpdate=true;}}});
  }
}
function impactFeedback(event){
  const strength=Math.max(.1,Math.min(3,event.intensity??1));
  if(['explosion','shockwave','landing','impact','buildingImpact'].includes(event.type))shake=Math.min(1.2,Math.max(shake,strength*(event.type==='impact'?.12:.3)));
  if(audioEnabled)playCombatSound(event);
}
function updateCamera(dt){
  const b=sim.fighters[0].parts.torso.body.position,e=sim.fighters[1].parts.torso.body.position;
  if(started){
    if(cameraMode==='buster')wantedTarget.set(b.x,b.y-.3,b.z);
    else if(cameraMode==='enemy')wantedTarget.set(e.x,e.y-.3,e.z);
    else wantedTarget.set((b.x+e.x)*.5,Math.max(1.7,(b.y+e.y)*.5-.8),(b.z+e.z)*.5);
    if(paused)orbit.target.copy(wantedTarget);else orbit.target.lerp(wantedTarget,1-Math.exp(-dt*(cameraMode==='director'?5:7)));
    if(autoCamera){const dist=Math.hypot(b.x-e.x,b.y-e.y,b.z-e.z);const wantedDist=cameraMode==='overview'?48:cameraMode==='director'?Math.max(innerWidth<760?23:19,dist*1.05+13):15;orbit.distance=paused?wantedDist:THREE.MathUtils.lerp(orbit.distance,wantedDist,1-Math.exp(-dt*4));if(cameraMode==='overview')orbit.pitch=THREE.MathUtils.lerp(orbit.pitch,.95,dt);}
  }
  if(started&&arena==='city')clearSightCamera(b,e,dt);
  temp.set(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance).add(orbit.target);
  camera.position.copy(temp);if(shake>0&&started&&!paused){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=Math.exp(-dt*7);}
  camera.lookAt(orbit.target);const fov=48+Math.min(4,shake*5);if(Math.abs(camera.fov-fov)>.02){camera.fov=fov;camera.updateProjectionMatrix();}if(!started&&innerWidth>=760){camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.17,0,innerWidth,innerHeight);}else camera.clearViewOffset();
}
function updateHUD(){
  $('#clock').textContent=clock(sim.elapsed);
  for(const f of sim.fighters){const card=$(`#hud-${f.id}`);if(!card)continue;const hp=Math.max(0,Math.round(f.health/f.maxHealth*100));card.querySelector('.hp').textContent=`${hp}%`;card.querySelector('.health-track i').style.width=`${hp}%`;card.querySelector('.state').textContent=f.state+(f.flight>sim.elapsed?(f.type==='titan'?` · reactor ${Math.round(f.energy)}%`:` · ${(f.flight-sim.elapsed).toFixed(1)}s fuel`):f.flightMaxDuration&&f.flightReadyAt>sim.elapsed?` · flight recharge ${Math.ceil(f.flightReadyAt-sim.elapsed)}s`:'');
    const labels={head:'HEAD',torso:'CORE',upperArmL:'L ARM',upperArmR:'R ARM',thighL:'L LEG',thighR:'R LEG'};
    card.querySelector('.limbs').innerHTML=Object.entries(labels).map(([key,label])=>{const p=f.parts[key],child=f.parts[{upperArmL:'forearmL',upperArmR:'forearmR',thighL:'shinL',thighR:'shinR'}[key]],broken=p.detached||child?.detached,damaged=p.health<p.maxHealth*.5||(child&&child.health<child.maxHealth*.5);return `<span class="${broken?'broken':damaged?'damaged':''}">${label}${broken?' ×':''}</span>`}).join('');
  }
  const titan=sim.fighters[0];if(titan.type==='titan'){const status=$(`#hud-${titan.id} .systems-status`);if(status)status.innerHTML=`<span>MISSILES ${titan.missiles?.L??0} L / ${titan.missiles?.R??0} R</span><span>REACTOR ${Math.round(titan.energy)}%</span>${titan.restraint?`<span>ROPE ${Math.round(titan.restraint.health)}% · HELD ${(titan.restraint.held??0).toFixed(1)}s</span>`:''}${titan.waterExposure>.5?'<b>WATER EXPOSURE · SYSTEMS DEGRADED</b>':''}`;}
  const v=sim.veronica;$('#parts-count').textContent=`${String(v.parts).padStart(2,'0')} / ${String(v.maxParts).padStart(2,'0')}`;$('#supply-slots').innerHTML=Array.from({length:v.maxParts},(_,i)=>`<span class="${i>=v.parts?'used':''}"></span>`).join('');$('#pod-health').style.width=`${Math.max(0,v.health/v.maxHealth*100)}%`;
  $('#veronica-state').textContent=v.health<=0?'UPLINK LOST':v.parts<=0?'SUPPLY EXHAUSTED':'OPERATIONAL';$('#veronica-led').style.background=v.health<=0?'#ed7255':'#b0dbae';$('#pod-detail').textContent=v.health<=0?'Pod destroyed. Repairs unavailable.':v.parts<=0?'All replacement modules consumed.':`Pod integrity ${Math.round(v.health/v.maxHealth*100)}% · finite repair stock.`;
  const latest=sim.events[0]?.text;if(latest!==lastEvent){lastEvent=latest;$('#feed').innerHTML=sim.events.slice(0,5).map(e=>`<li><time>${clock(e.time)}</time>${escape(e.text)}</li>`).join('');}
  $('#match-state').textContent=paused?'SIMULATION PAUSED':sim.finished?'Engagement resolved. Explore the aftermath.':`${sim.props.filter(p=>p.body.mass>0).length} dynamic objects · ${sim.civilians.filter(c=>c.health>0&&!c.escaped&&!c.military).length} civilians in arena`;
  $('#footer-status').textContent=paused?'SIMULATION PAUSED':`${sim.world.bodies.length} PHYSICAL BODIES / ${sim.world.constraints.length} JOINTS`;
  $('#system-label').textContent=!started?'SYSTEM ONLINE':sim.finished?'ENGAGEMENT COMPLETE':paused?'SIMULATION PAUSED':'ENGAGEMENT ACTIVE';
  for(const b of $$('[data-ability]')){const ability=b.dataset.ability;const cd=sim.fighters[0].cooldowns[ability]??0;b.disabled=(cd>0&&!(ability==='flight'&&hero==='titan'&&sim.fighters[0].flight>sim.elapsed))||!sim.fighters[0].alive||sim.finished||(ability==='flight'&&sim.fighters[0].flightAwaitingLanding);b.title=cd>0?`Available in ${Math.ceil(cd)}s`:hero==='titan'&&titanHints[ability]?titanHints[ability]:ability==='gas'?'Close-range sedative: chance to cause 2–3.2 seconds of limpness; robots are immune.':ability==='flight'?(hero==='titan'?'Sustained flight consumes reactor energy; activate again to land.':'2.8 seconds of powered flight. Must land and recharge before reuse.'):`Issue ${ability} command; AI remains autonomous`;}
  if(sim.finished&&!resultShown){resultShown=true;$('#result-title').textContent=sim.outcome==='capture'?'TARGET CAPTURED ALIVE':sim.winner&&sim.winner!=='DRAW'?`${String(sim.winner.name||sim.winner).toUpperCase()} PREVAILS`:'MUTUAL DESTRUCTION';$('#result').hidden=false;}
}
function frame(now){
  const rawDt=Math.max(0,(now-last)/1000);last=now;
  const dt=Math.min(rawDt,.15);
  try{
    if(started&&!paused&&!document.hidden){
      // Preserve wall time at low frame rates. Rendering must never silently turn
      // an ordinary 1x fight into slow motion. Keep unprocessed time as debt.
      timing.wall+=rawDt*speed;physicsDebt+=Math.min(rawDt,3)*speed;
      const budgetStart=performance.now();
      while(physicsDebt>=1/120&&performance.now()-budgetStart<(physicsDebt>.25?140:36)){
        const slice=Math.min(physicsDebt,.075);const before=sim.elapsed;
        sim.step(slice);combatEffects.update(sim,slice);
        const advanced=sim.elapsed-before;physicsDebt=Math.max(0,physicsDebt-slice);
        if(advanced<.00001)break;
      }
      timing.simulated=sim.elapsed;timing.backlog=physicsDebt;
      sync();renderDirty=true;
    }
    renderTimer+=rawDt;
    const shouldRender=renderDirty&&(renderTimer>=1/60||!started||paused);
    if(shouldRender){
      environment.update(sim.elapsed,sim);water?.update(sim.elapsed);combatEffects.update(sim,0);updateCamera(Math.min(rawDt,.5));
      const renderStart=performance.now();renderer.render(scene,camera);
      const cost=(performance.now()-renderStart)/1000;
      frameAverage=frameAverage*.9+Math.max(rawDt,cost)*.1;timing.fps=Math.round(1/Math.max(.001,frameAverage));
      if($('#graphics').value==='auto'&&frameAverage>.045&&frameCount>8&&qualityLevel<3){
        slowFrames++;
        if(slowFrames>6){qualityLevel++;slowFrames=0;const ratio=Math.max(.32,renderer.getPixelRatio()*.75);renderer.setPixelRatio(ratio);renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);}
      }
      renderDirty=false;renderTimer=0;frameCount++;
    }
    if((hudTimer+=dt)>.15){hudTimer=0;updateHUD();}
  }catch(error){console.error('Arena runtime error',error);paused=true;$('#match-state').textContent=`Simulation paused: ${error.message}`;}
  requestAnimationFrame(frame);
}
function setCameraSelection(){$$('[data-camera]').forEach(b=>{const selected=b.dataset.camera===cameraMode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});}
function setPaused(value){paused=value;physicsDebt=0;last=performance.now();renderDirty=true;$('#pause').textContent=paused?'▶︎':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');updateHUD();}
function issueAbility(name){if(started&&!paused&&!sim.finished){const ok=sim.ability(sim.fighters[0].id,name);if(!ok){const f=sim.fighters[0];$('#match-state').textContent=f.type==='titan'&&f.action&&['pistons','redPunch','repulsor','mixed'].includes(name)?'Arms busy. Finish the current mechanism before switching.':'Command unavailable: recharge, range, or equipment.';}updateHUD();}}
function bind(){
  $('#graphics').addEventListener('change',()=>{qualityReduced=false;slowFrames=0;qualityLevel=0;renderDirty=true;applyGraphics();scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});});
  $('#launch').addEventListener('click',launch);$('#pause').addEventListener('click',()=>setPaused(!paused));$('#speed').addEventListener('change',e=>speed=Number(e.target.value));$('#restart').addEventListener('click',()=>reset(true));$('#rematch').addEventListener('click',()=>reset(true));$('#back').addEventListener('click',()=>reset(false));
  $$('[data-enemy]').forEach(b=>b.addEventListener('click',()=>{enemy=b.dataset.enemy;$$('[data-enemy]').forEach(x=>{const active=x===b;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',active);});reset(false);}));
  $('#arena').addEventListener('change',e=>{arena=e.target.value;$('#arena-desc').textContent=arena==='city'?'CIVILIANS · MILITARY · DESTRUCTION':'FLAT TERRAIN · UNRESTRICTED COMBAT';reset(false);});
  $$('[data-camera]').forEach(b=>b.addEventListener('click',()=>{cameraMode=b.dataset.camera;autoCamera=true;renderDirty=true;setCameraSelection();}));
  ($('#ability-bar')||$('.ability-bar')).addEventListener('click',event=>{const button=event.target.closest('[data-ability]');if(button&&!button.disabled)issueAbility(button.dataset.ability);});
  $$('[data-hero]').forEach(button=>button.addEventListener('click',()=>{hero=button.dataset.hero;reset(false);}));
  for(const id of ['settings','guide'])$(`#${id}-open`).addEventListener('click',()=>{const dialog=$(`#${id}`);dialog.showModal();dialog.dataset.wasPaused=String(paused);if(started)setPaused(true);});
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>$(`#${b.dataset.close}`).close()));
  for(const id of ['settings','guide']){const d=$(`#${id}`);d.addEventListener('close',()=>{if(started&&d.dataset.wasPaused==='false')setPaused(false);if(!started)reset(false);});d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});}
  $('#sound').addEventListener('click',()=>{audioChoice=!audioEnabled;if(audioChoice)enableAudio();else{audioEnabled=false;audioMaster?.gain.setTargetAtTime(0,audioContext.currentTime,.04);updateSoundButton();}});
  $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}});
  window.addEventListener('resize',()=>{renderDirty=true;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button')||$('dialog[open]'))return;if(e.code==='Space'&&started){e.preventDefault();setPaused(!paused);}if(e.key==='r'&&started)reset(true);if(e.key==='c'){const modes=['director','buster','enemy','overview'];cameraMode=modes[(modes.indexOf(cameraMode)+1)%modes.length];autoCamera=true;renderDirty=true;setCameraSelection();}if(['1','2','3','4','5','6'].includes(e.key))issueAbility(heroProfiles[hero].commands[Number(e.key)-1]?.[0]);if(e.key==='Escape')$('#result').hidden=true;});
  const pointers=new Map();let previousPinch=0;
  renderer.domElement.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);dragged=false;});
  renderer.domElement.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(previousPinch)orbit.distance=THREE.MathUtils.clamp(orbit.distance*previousPinch/d,7,80);previousPinch=d;}else{orbit.yaw-=dx*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.004,.06,1.3);}autoCamera=false;renderDirty=true;dragged=true;});
  const release=e=>{pointers.delete(e.pointerId);previousPinch=0;};renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),6,100);autoCamera=false;renderDirty=true;},{passive:false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)setPaused(true);last=performance.now();});
}
function updateSoundButton(){
  $('#sound').setAttribute('aria-pressed',audioEnabled);$('#sound').setAttribute('aria-label',audioEnabled?'Mute sound':'Enable sound');$('#sound').style.color=audioEnabled?'#efb467':'';
}
function enableAudio(){
  try{
    audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();
    if(!audioMaster){audioMaster=audioContext.createGain();audioMaster.gain.value=.4;const limiter=audioContext.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;audioMaster.connect(limiter).connect(audioContext.destination);
      noiseBuffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    audioMaster.gain.setTargetAtTime(.4,audioContext.currentTime,.05);audioEnabled=true;updateSoundButton();
  }catch{audioEnabled=false;}
}
let nextSound=0;
function playCombatSound(event){
  if(!audioContext||!audioMaster)return;
  const t=audioContext.currentTime;if(t<nextSound)return;
  const heavy=['explosion','shockwave','landing','buildingImpact'].includes(event.type);
  nextSound=t+(heavy?.09:.045);
  const power=Math.min(2.5,event.intensity??1),duration=heavy?.9:.3;
  const noise=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();noise.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(heavy?1700:4200,t);filter.frequency.exponentialRampToValueAtTime(90,t+duration);gain.gain.setValueAtTime(Math.min(.65,power*(heavy?.32:.16)),t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);noise.connect(filter).connect(gain).connect(audioMaster);noise.start(t);noise.stop(t+duration);
  const osc=audioContext.createOscillator(),sub=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(heavy?82:150,t);osc.frequency.exponentialRampToValueAtTime(heavy?27:48,t+.22);sub.gain.setValueAtTime(Math.min(.5,power*.24),t);sub.gain.exponentialRampToValueAtTime(.001,t+duration*.8);osc.connect(sub).connect(audioMaster);osc.start(t);osc.stop(t+duration);
}
function applyGraphics(){
  const quality=$('#graphics')?.value||'auto';
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const software=ext&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  const low=quality==='low'||(quality==='auto'&&(software||innerWidth<600));
  configureModelQuality(low?'low':'high');
  if(combatEffects)for(const {light} of combatEffects.lights)light.visible=!low;
  renderer.setPixelRatio(quality==='auto'&&software?.45:low?.7:Math.min(devicePixelRatio,quality==='high'?2:1.15));
  renderer.shadowMap.enabled=quality==='high'&&!software;renderer.setSize(innerWidth,innerHeight);
}
setup();
