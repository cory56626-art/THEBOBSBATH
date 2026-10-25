import * as THREE from '../house/vendor/three.module.js';
import { Simulation } from './simulation.js';
import { createPart, createVeronica, setPartDamage } from './models.js';
import { createEnvironment, createProp, createCivilian, updateCivilian, createProjectile } from './environment.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let renderer,scene,camera,sim,environment,pod,started=false,paused=false,enemy='hulk',arena='city',cameraMode='director',speed=1;
let last=performance.now(),hudTimer=0,resultShown=false,dragged=false,autoCamera=true,audioEnabled=false,audioContext;
let simGeneration=0,frameCount=0,lastEvent='',shake=0,slowFrames=0,qualityReduced=false;
const view=$('#viewport'), meshes=new Map(), effectMeshes=new Map(), stains=[];
const orbit={yaw:.8,pitch:.31,distance:21,target:new THREE.Vector3(0,2,0)};
const wantedTarget=new THREE.Vector3(), temp=new THREE.Vector3();
const bodyCopy=(mesh,body)=>{mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);};
const clock=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
const options=()=>({enemy,arena,regrowth:$('#regrowth').checked,severing:$('#severing').checked,blood:$('#blood').checked,military:$('#military').checked,networkTransfer:$('#networkTransfer').checked});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setup(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;
    applyGraphics();view.appendChild(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.1,600);
    const hemi=new THREE.HemisphereLight(0xc3dded,0x66654c,2.25);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffdfae,3.4);sun.position.set(-19,35,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-42;sun.shadow.camera.right=42;sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.camera.near=1;sun.shadow.camera.far=100;sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;sun.shadow.radius=3;scene.add(sun);
    const rim=new THREE.DirectionalLight(0xb4d7ed,2.1);rim.position.set(14,15,-20);scene.add(rim);
    const envScene=new THREE.Scene();envScene.background=new THREE.Color(0xa6bec7);
    const lightPanel=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));lightPanel.position.set(15,15,15);lightPanel.lookAt(0,0,0);envScene.add(lightPanel);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x555a4c,side:THREE.DoubleSide}));ground.rotation.x=-Math.PI/2;ground.position.y=-10;envScene.add(ground);
    const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.04);scene.environment=env.texture;pmrem.dispose();
    reset(false);bind();$('#launch').disabled=false;$('#launch-label').textContent='BEGIN ENGAGEMENT';last=performance.now();requestAnimationFrame(frame);
    window.__arena={get sim(){return sim},get scene(){return scene},get renderer(){return renderer},get started(){return started},start:()=>launch(),reset:()=>reset(started),step:dt=>{sim.step(dt);sync();updateHUD()},setEnemy:type=>{enemy=type;reset(started)},setArena:type=>{arena=type;$('#arena').value=type;reset(started)}};
  }catch(err){console.error(err);$('#boot-error').hidden=false;$('#boot-error').textContent=`Unable to initialize 3D: ${err.message}. This game needs WebGL.`;$('#launch-label').textContent='3D INITIALIZATION FAILED';}
}
function removeMesh(mesh,dispose=false){scene.remove(mesh);if(dispose)mesh.traverse(o=>{if(o.geometry&&![sphereGeo,ringGeo,boxGeo].includes(o.geometry))o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData?.transient)m.dispose();}});}
function reset(run=false){
  sim?.dispose();for(const m of meshes.values())removeMesh(m,true);meshes.clear();for(const e of effectMeshes.values())removeMesh(e,true);effectMeshes.clear();for(const s of stains)removeMesh(s,true);stains.length=0;
  if(environment){environment.dispose();environment=null;}if(pod)scene.remove(pod);
  sim=new Simulation(options());simGeneration++;environment=createEnvironment(scene,arena);pod=createVeronica();scene.add(pod);
  started=run;paused=false;resultShown=false;$('#result').hidden=true;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Pause simulation');lastEvent='';
  orbit.target.set(0,2,0);orbit.yaw=.78;orbit.pitch=.29;orbit.distance=innerWidth<760?24:22;autoCamera=true;cameraMode='director';setCameraSelection();
  // Preview is the actual initial physical arrangement, before any AI decisions.
  if(!run){orbit.target.set(-5.6,2.5,0);orbit.yaw=.64;orbit.pitch=.16;orbit.distance=innerWidth<760?18:13.6;}
  $('#match-title').innerHTML=`HULKBUSTER <span>VS</span> ${enemy.toUpperCase()}`;
  $('#hero-caption div>span').textContent='MK XLIV · VERONICA LINK ACTIVE';
  $('#fighter-hud').innerHTML=sim.fighters.map(f=>`<article class="fighter-card ${f.type==='buster'?'':'enemy'}" id="hud-${f.id}"><div class="fighter-card-head"><b>${f.name}</b><span class="hp">100%</span></div><p class="state">STANDBY</p><div class="health-track"><i></i></div><div class="limbs"></div></article>`).join('');
  sync();updateHUD();updateCamera(1);document.body.classList.toggle('live',run);$('#intro').hidden=run;$('#setup-deck').hidden=run;$('#hero-caption').hidden=run;$('.hero-mark').hidden=run;$('#session').hidden=!run;
}
function launch(){if(started)return;started=true;document.body.classList.add('live');$('#intro').hidden=true;$('#setup-deck').hidden=true;$('#hero-caption').hidden=true;$('.hero-mark').hidden=true;$('#session').hidden=false;orbit.distance=innerWidth<760?24:22;orbit.pitch=.27;autoCamera=true;$('#system-label').textContent='ENGAGEMENT ACTIVE';last=performance.now();}
function sync(){
  const valid=new Set();
  for(const f of sim.fighters)for(const [name,p] of Object.entries(f.parts)){
    const key=`part-${f.id}-${name}`;valid.add(key);let mesh=meshes.get(key);
    if(!mesh){mesh=createPart(f.type,name,p.size);scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);mesh.visible=p.body.position.y>-30;
    setPartDamage(mesh,1-p.health/p.maxHealth,f.type==='hulk'||f.type==='venom',sim.options.blood);
  }
  for(const p of sim.props){
    const key=`prop-${p.id}`;if(p.destroyed||p.hidden||!sim.world.bodies.includes(p.body))continue;valid.add(key);let mesh=meshes.get(key);
    if(!mesh){mesh=createProp(p);scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);mesh.visible=p.body.position.y>-20;
  }
  for(const c of sim.civilians){
    const key=`civ-${c.id}`;if(c.escaped)continue;valid.add(key);let mesh=meshes.get(key);if(!mesh){mesh=createCivilian(c);scene.add(mesh);meshes.set(key,mesh);}mesh.position.copy(c.position||c.body.position);updateCivilian(mesh,c,sim.elapsed);
  }
  for(const p of sim.projectiles){const key=`shot-${p.id}`;valid.add(key);let mesh=meshes.get(key);if(!mesh){mesh=createProjectile(p);scene.add(mesh);meshes.set(key,mesh);}bodyCopy(mesh,p.body);}
  for(const [key,mesh] of meshes)if(!valid.has(key)){removeMesh(mesh);meshes.delete(key);}
  bodyCopy(pod,sim.veronica.body);pod.userData.modules?.forEach((m,i)=>{m.visible=i<sim.veronica.parts;});
  if(sim.veronica.health<=0){pod.rotation.z+=.005;pod.traverse(o=>{if(o.isMesh)o.material.emissiveIntensity=0;});}
  syncEffects();
}
const sphereGeo=new THREE.SphereGeometry(1,10,7),ringGeo=new THREE.RingGeometry(.91,1,48),boxGeo=new THREE.BoxGeometry(1,1,1);
function transientMaterial(color,opacity=1){const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});m.userData.transient=true;return m;}
function effectLine(from,to,color,width=.05){const dir=new THREE.Vector3().subVectors(to,from);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(width,width,Math.max(.01,dir.length()),6),transientMaterial(color));mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());return mesh;}
function makeEffect(e){
  const group=new THREE.Group(),p=new THREE.Vector3().copy(e.position),to=e.to?new THREE.Vector3().copy(e.to):null;group.userData.effect=e;
  const color=e.color??0xffbe6d;
  if(['beam','tracer','tendril','repair'].includes(e.type)&&to){
    if(e.type==='tendril'){
      const mid=p.clone().lerp(to,.5).add(new THREE.Vector3(0,1.2,0));const curve=new THREE.QuadraticBezierCurve3(p,mid,to);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.07,6,false),new THREE.MeshStandardMaterial({color:0x111b22,metalness:.5,roughness:.24}));tube.material.userData.transient=true;group.add(tube);
    }else {group.add(effectLine(p,to,color,e.type==='beam'?.09:e.type==='repair'?.035:.025));const glow=new THREE.Mesh(sphereGeo,transientMaterial(color,.7));glow.scale.setScalar(.25);glow.position.copy(to);group.add(glow);}
  }else if(['shockwave','sonic'].includes(e.type)){
    const ring=new THREE.Mesh(ringGeo,transientMaterial(color,.65));ring.rotation.x=-Math.PI/2;ring.position.copy(p);ring.position.y=.09;group.add(ring);group.userData.ring=ring;
  }else{
    group.position.copy(p);const blood=e.type==='blood';const count=blood?12:e.type==='explosion'?19:9;
    for(let i=0;i<count;i++){const mesh=new THREE.Mesh(blood?sphereGeo:boxGeo,transientMaterial(color,blood?.8:.85));const n=blood?.05:.04+Math.random()*.04;mesh.scale.set(n,n*(blood?1:2),n);mesh.userData.velocity=new THREE.Vector3((Math.random()-.5)*7,Math.random()*5,(Math.random()-.5)*7);group.add(mesh);}
    if(blood&&sim.options.blood){const pool=new THREE.Mesh(new THREE.CircleGeometry(.16+Math.random()*.17,12),new THREE.MeshStandardMaterial({color:e.color===0x15151d||e.color===0x17171b?0x16151b:0x492019,roughness:.5,transparent:true,opacity:.64,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(p.x,.025,p.z);pool.material.userData.transient=true;scene.add(pool);stains.push(pool);if(stains.length>65)removeMesh(stains.shift(),true);}
    if(e.type==='explosion'){const flash=new THREE.Mesh(sphereGeo,transientMaterial(0xffe6a7,.55));flash.scale.setScalar(.8);group.add(flash);shake=Math.max(shake,.12);}
    else if(e.type==='impact'){shake=Math.max(shake,.03);}
    if(audioEnabled&&e.type!=='blood')playImpact(e.type==='explosion'?60:110,e.type==='explosion'?.17:.035);
  }
  return group;
}
function syncEffects(){
  const valid=new Set();for(const e of sim.effects){valid.add(e.id);let mesh=effectMeshes.get(e.id);if(!mesh){mesh=makeEffect(e);scene.add(mesh);effectMeshes.set(e.id,mesh);}const age=(e.maxTtl-e.ttl),pct=Math.max(0,e.ttl/e.maxTtl);
    if(mesh.userData.ring){mesh.userData.ring.scale.setScalar(1+age*15);mesh.userData.ring.material.opacity=pct*.65;}
    for(const c of mesh.children){if(c.userData.velocity){c.position.copy(c.userData.velocity).multiplyScalar(age);c.position.y-=4*age*age;c.rotation.set(age*4,age*2,age*7);}if(c.material?.transparent)c.material.opacity=Math.min(c.material.opacity,pct*.9);}
  }
  for(const [id,m]of effectMeshes)if(!valid.has(id)){removeMesh(m,true);effectMeshes.delete(id);}
}
function updateCamera(dt){
  const b=sim.fighters[0].parts.torso.body.position,e=sim.fighters[1].parts.torso.body.position;
  if(started){
    if(cameraMode==='buster')wantedTarget.set(b.x,b.y-.3,b.z);
    else if(cameraMode==='enemy')wantedTarget.set(e.x,e.y-.3,e.z);
    else wantedTarget.set((b.x+e.x)*.5,Math.max(1.7,(b.y+e.y)*.5-.8),(b.z+e.z)*.5);
    orbit.target.lerp(wantedTarget,Math.min(1,dt*(cameraMode==='director'?1.5:4)));
    if(autoCamera){const dist=Math.hypot(b.x-e.x,b.z-e.z);const wantedDist=cameraMode==='overview'?48:cameraMode==='director'?Math.max(innerWidth<760?23:19,dist*1.4+11):15;orbit.distance=THREE.MathUtils.lerp(orbit.distance,wantedDist,Math.min(1,dt*.7));if(cameraMode==='overview')orbit.pitch=THREE.MathUtils.lerp(orbit.pitch,.95,dt);}
  }
  temp.set(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance).add(orbit.target);
  camera.position.copy(temp);if(shake>0&&started&&!paused){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.92;}
  camera.lookAt(orbit.target);if(!started&&innerWidth>=760){camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.17,0,innerWidth,innerHeight);}else camera.clearViewOffset();
}
function updateHUD(){
  $('#clock').textContent=clock(sim.elapsed);
  for(const f of sim.fighters){const card=$(`#hud-${f.id}`);if(!card)continue;const hp=Math.max(0,Math.round(f.health/f.maxHealth*100));card.querySelector('.hp').textContent=`${hp}%`;card.querySelector('.health-track i').style.width=`${hp}%`;card.querySelector('.state').textContent=f.state;
    const labels={head:'HEAD',torso:'CORE',upperArmL:'L ARM',upperArmR:'R ARM',thighL:'L LEG',thighR:'R LEG'};
    card.querySelector('.limbs').innerHTML=Object.entries(labels).map(([key,label])=>{const p=f.parts[key],child=f.parts[{upperArmL:'forearmL',upperArmR:'forearmR',thighL:'shinL',thighR:'shinR'}[key]],broken=p.detached||child?.detached,damaged=p.health<p.maxHealth*.5||(child&&child.health<child.maxHealth*.5);return `<span class="${broken?'broken':damaged?'damaged':''}">${label}${broken?' ×':''}</span>`}).join('');
  }
  const v=sim.veronica;$('#parts-count').textContent=`${String(v.parts).padStart(2,'0')} / ${String(v.maxParts).padStart(2,'0')}`;$('#supply-slots').innerHTML=Array.from({length:v.maxParts},(_,i)=>`<span class="${i>=v.parts?'used':''}"></span>`).join('');$('#pod-health').style.width=`${Math.max(0,v.health/v.maxHealth*100)}%`;
  $('#veronica-state').textContent=v.health<=0?'UPLINK LOST':v.parts<=0?'SUPPLY EXHAUSTED':'OPERATIONAL';$('#veronica-led').style.background=v.health<=0?'#ed7255':'#b0dbae';$('#pod-detail').textContent=v.health<=0?'Pod destroyed. Repairs unavailable.':v.parts<=0?'All replacement modules consumed.':`Pod integrity ${Math.round(v.health/v.maxHealth*100)}% · finite repair stock.`;
  const latest=sim.events[0]?.text;if(latest!==lastEvent){lastEvent=latest;$('#feed').innerHTML=sim.events.slice(0,5).map(e=>`<li><time>${clock(e.time)}</time>${escape(e.text)}</li>`).join('');}
  $('#match-state').textContent=paused?'SIMULATION PAUSED':sim.finished?'Engagement resolved. Explore the aftermath.':`${sim.props.filter(p=>p.body.mass>0).length} dynamic objects · ${sim.civilians.filter(c=>c.health>0&&!c.escaped&&!c.military).length} civilians in arena`;
  $('#footer-status').textContent=paused?'SIMULATION PAUSED':`${sim.world.bodies.length} PHYSICAL BODIES / ${sim.world.constraints.length} JOINTS`;
  $('#system-label').textContent=!started?'SYSTEM ONLINE':sim.finished?'ENGAGEMENT COMPLETE':paused?'SIMULATION PAUSED':'ENGAGEMENT ACTIVE';
  for(const b of $$('[data-ability]')){const ability=b.dataset.ability;const cd=sim.fighters[0].cooldowns[ability]??0;b.disabled=cd>0||!sim.fighters[0].alive||sim.finished;b.title=cd>0?`Available in ${Math.ceil(cd)}s`:`Issue ${ability} command; AI remains autonomous`;}
  if(sim.finished&&!resultShown){resultShown=true;$('#result-title').textContent=sim.winner?`${String(sim.winner.name||sim.winner).toUpperCase()} PREVAILS`:'MUTUAL DESTRUCTION';$('#result').hidden=false;}
}
function frame(now){
  const wallDt=(now-last)/1000;const dt=Math.min(wallDt,.1);last=now;if(!qualityReduced&&$('#graphics').value==='auto'&&wallDt>.065&&frameCount>8){slowFrames++;if(slowFrames>18){qualityReduced=true;renderer.setPixelRatio(.8);renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});}}
  try{
    if(started&&!paused&&!document.hidden){let remaining=dt*speed;while(remaining>.0001){const step=Math.min(remaining,1/30);sim.step(step);remaining-=step;}sync();}
    environment.update(sim.elapsed,sim);updateCamera(dt);renderer.render(scene,camera);
    if((hudTimer+=dt)>.2){hudTimer=0;updateHUD();}frameCount++;
  }catch(error){console.error('Arena runtime error',error);paused=true;$('#match-state').textContent=`Simulation paused: ${error.message}`;}
  requestAnimationFrame(frame);
}
function setCameraSelection(){$$('[data-camera]').forEach(b=>{const selected=b.dataset.camera===cameraMode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});}
function setPaused(value){paused=value;$('#pause').textContent=paused?'▶︎':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');updateHUD();}
function issueAbility(name){if(started&&!paused&&!sim.finished){const ok=sim.ability('buster',name);if(!ok){$('#match-state').textContent='Command unavailable: recharge, range, or equipment.';}updateHUD();}}
function bind(){
  $('#graphics').addEventListener('change',()=>{qualityReduced=false;slowFrames=0;applyGraphics();scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;}});});
  $('#launch').addEventListener('click',launch);$('#pause').addEventListener('click',()=>setPaused(!paused));$('#speed').addEventListener('change',e=>speed=Number(e.target.value));$('#restart').addEventListener('click',()=>reset(true));$('#rematch').addEventListener('click',()=>reset(true));$('#back').addEventListener('click',()=>reset(false));
  $$('[data-enemy]').forEach(b=>b.addEventListener('click',()=>{enemy=b.dataset.enemy;$$('[data-enemy]').forEach(x=>{const active=x===b;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',active);});reset(false);}));
  $('#arena').addEventListener('change',e=>{arena=e.target.value;$('#arena-desc').textContent=arena==='city'?'CIVILIANS · MILITARY · DESTRUCTION':'FLAT TERRAIN · UNRESTRICTED COMBAT';reset(false);});
  $$('[data-camera]').forEach(b=>b.addEventListener('click',()=>{cameraMode=b.dataset.camera;autoCamera=true;setCameraSelection();}));
  $$('[data-ability]').forEach(b=>b.addEventListener('click',()=>issueAbility(b.dataset.ability)));
  for(const id of ['settings','guide'])$(`#${id}-open`).addEventListener('click',()=>{const dialog=$(`#${id}`);dialog.showModal();dialog.dataset.wasPaused=String(paused);if(started)setPaused(true);});
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>$(`#${b.dataset.close}`).close()));
  for(const id of ['settings','guide']){const d=$(`#${id}`);d.addEventListener('close',()=>{if(started&&d.dataset.wasPaused==='false')setPaused(false);if(!started)reset(false);});d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});}
  $('#sound').addEventListener('click',()=>{audioEnabled=!audioEnabled;if(audioEnabled){audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();}$('#sound').setAttribute('aria-pressed',audioEnabled);$('#sound').setAttribute('aria-label',audioEnabled?'Mute sound':'Enable sound');$('#sound').style.color=audioEnabled?'#efb467':'';});
  $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button')||$('dialog[open]'))return;if(e.code==='Space'&&started){e.preventDefault();setPaused(!paused);}if(e.key==='r'&&started)reset(true);if(e.key==='c'){const modes=['director','buster','enemy','overview'];cameraMode=modes[(modes.indexOf(cameraMode)+1)%modes.length];autoCamera=true;setCameraSelection();}if(['1','2','3','4'].includes(e.key))issueAbility(['repulsor','jackhammer','boost','repair'][Number(e.key)-1]);if(e.key==='Escape')$('#result').hidden=true;});
  const pointers=new Map();let previousPinch=0;
  renderer.domElement.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);dragged=false;});
  renderer.domElement.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(previousPinch)orbit.distance=THREE.MathUtils.clamp(orbit.distance*previousPinch/d,7,80);previousPinch=d;}else{orbit.yaw-=dx*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.004,.06,1.3);}autoCamera=false;dragged=true;});
  const release=e=>{pointers.delete(e.pointerId);previousPinch=0;};renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),6,100);autoCamera=false;},{passive:false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)setPaused(true);last=performance.now();});
}
function playImpact(freq,volume){if(!audioContext)return;const t=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='triangle';osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(28,t+.16);gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+.18);osc.connect(gain).connect(audioContext.destination);osc.start(t);osc.stop(t+.2);}
function applyGraphics(){
  const quality=$('#graphics')?.value||'auto';
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const software=ext&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  const low=quality==='low'||(quality==='auto'&&(software||innerWidth<600));
  renderer.setPixelRatio(low?.8:Math.min(devicePixelRatio,quality==='high'?2:1.5));
  renderer.shadowMap.enabled=quality!=='low'&&!software;renderer.setSize(innerWidth,innerHeight);
}
setup();
