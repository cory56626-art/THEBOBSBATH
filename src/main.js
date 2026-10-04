import * as THREE from 'three';
import { createWorld } from './world.js';
import { createCar, createPerson } from './models.js';
import { createSimulation } from './simulation.js';
import { createVehicle, updateVehicle, movePerson, findExit } from './physics.js';
import { CityAudio } from './audio.js';
import './style.css';

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const keys = new Set();
const touch = matchMedia('(pointer:coarse)').matches;
const settings = { quality: touch ? 'low' : 'high', sound: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('meridian-settings') || '{}')); } catch { /* Storage is optional. */ }
if (!['high', 'low'].includes(settings.quality)) settings.quality = 'high';
const saveSettings = () => { try { localStorage.setItem('meridian-settings', JSON.stringify(settings)); } catch { /* Storage is optional. */ } };
$('quality').value = settings.quality;
$('audio-toggle').checked = settings.sound;

let renderer, scene, camera, world, simulation, car, carMesh, playerMesh;
let active = false, paused = false, firstPerson = false, aiming = false, dragging = false;
let lookYaw = 0, lookPitch = .32, lastFrame = performance.now(), time = 0, hudTimer = 0;
let health = 100, ammo = 30, reserve = 90, reloadUntil = 0, shotUntil = 0, damageFlash = 0;
let cameraShake = 0, toastUntil = 0, crimeCooldown = 0, mission = 0, latestThreat = 0;
let lastThrottle = 0, helpFrom = 'intro', lastPointer = null, footsteps = 0;
const player = { x: 0, z: 112, angle: 0, inCar: true, speed: 0, health: 100 };
const personMeshes = new Map(), trafficMeshes = new Map(), effects = [], parkedCars = [];
const audio = new CityAudio();
audio.enabled = settings.sound;
const map = $('minimap').getContext('2d');
const targetPosition = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const centerRay = new THREE.Raycaster(), zero = new THREE.Vector2(0, 0);
let rendererLost = false;

function notify(text, duration = 4) {
  $('toast').textContent = text; $('toast').hidden = false; toastUntil = time + duration;
}

function lightCity() {
  scene.background = new THREE.Color(0xa8b4b8);
  scene.fog = new THREE.FogExp2(0xa8b4b8, .00235);
  scene.add(new THREE.HemisphereLight(0xc7deee, 0x8a765e, 2.0));
  const sun = new THREE.DirectionalLight(0xffe0b1, 3.0);
  sun.position.set(-120, 170, -95); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 210, bottom: -210, near: 1, far: 500 });
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .08;
  scene.add(sun);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x547689) }, bottom: { value: new THREE.Color(0xc2b49f) } },
    vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vPosition; void main(){float t=pow(max(normalize(vPosition).y,0.0),0.65);gl_FragColor=vec4(mix(bottom,top,t),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(21, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffefd2, fog: false }));
  sunDisc.position.copy(sun.position).multiplyScalar(5); scene.add(sunDisc);
}

function setQuality() {
  const high = settings.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : .9));
  renderer.shadowMap.enabled = high;
  renderer.setSize(innerWidth, innerHeight);
}

function updatePersonVisual(mesh, actor, dt) {
  const previous = mesh.userData.previous ?? { x: actor.x, z: actor.z };
  const speed = Math.hypot(actor.x - previous.x, actor.z - previous.z) / Math.max(.001, dt);
  mesh.userData.previous = { x: actor.x, z: actor.z };
  mesh.position.set(actor.x, .05, actor.z);
  mesh.rotation.y = actor.angle;
  if (actor.hp <= 0) {
    mesh.userData.downAt ??= time;
    mesh.rotation.z = Math.PI / 2; mesh.position.y = .27;
    mesh.visible = time - mesh.userData.downAt < 8 && distance(actor, player) < 80;
    return;
  }
  mesh.userData.downAt = undefined; mesh.rotation.z = 0;
  mesh.visible = distance(actor, player) < (settings.quality === 'high' ? 105 : 75);
  if (!mesh.visible) return;
  const phase = time * Math.min(11, 3.8 + speed * 2) + actor.id.length;
  const swing = speed > .15 ? Math.min(.62, speed * .18) : 0;
  mesh.userData.legs?.forEach((leg, index) => { leg.rotation.x = Math.sin(phase + index * Math.PI) * swing; });
  mesh.userData.arms?.forEach((arm, index) => { arm.rotation.x = actor.state === 'engage' ? 1.35 : -Math.sin(phase + index * Math.PI) * swing * .7; });
  if (mesh.userData.weapon) mesh.userData.weapon.rotation.x = actor.state === 'engage' ? -1.35 : .43;
}

function updateCarVisual(mesh, actor, dt, police = false) {
  mesh.position.set(actor.x, .02, actor.z); mesh.rotation.y = actor.angle;
  mesh.userData.wheels?.forEach((wheel, index) => {
    wheel.rotation.x -= (actor.speed || 0) * dt / .35;
    if (index < 2) wheel.rotation.y = (actor.steer || 0) * -.4;
  });
  if (police) {
    mesh.userData.blueLights?.forEach(light => { light.material.emissiveIntensity = Math.sin(time * 17) > 0 ? 3 : .3; });
    mesh.userData.redLights?.forEach(light => { light.material.emissiveIntensity = Math.sin(time * 17) <= 0 ? 3 : .3; });
  }
}

function startGame() {
  if (!renderer || rendererLost) return;
  active = true; paused = false; keys.clear();
  document.activeElement?.blur();
  $('intro').hidden = true; $('hud').hidden = false; $('menu').hidden = true; $('help').hidden = true; $('game-over').hidden = true;
  $('touch-controls').hidden = !touch;
  audio.start(); notify('Follow Harbour Avenue to Civic Square. Press E to leave your car.', 6);
  updateHud();
}

function pauseGame(open = true) {
  if (!active || health <= 0) return;
  paused = open; keys.clear(); dragging = false; aiming = false;
  $('menu').hidden = !open;
  if (open) $('resume-button').focus();
  else document.activeElement?.blur();
  audio.update(0, false, 0, true);
}

function openHelp(from) {
  helpFrom = from; $('help').hidden = false; $('menu').hidden = true;
  if (active) { paused = true; keys.clear(); audio.update(0, false, 0, true); }
  $('close-help').focus();
}

function closeHelp() {
  $('help').hidden = true;
  if (helpFrom === 'menu' && active) { $('menu').hidden = false; $('resume-button').focus(); }
  else if (active) { paused = false; document.activeElement?.blur(); }
}

function resetGame() {
  simulation.reset(); Object.assign(car, createVehicle(world.spawn));
  Object.assign(player, { x: car.x, z: car.z, angle: 0, inCar: true, speed: 0, health: 100 });
  health = 100; ammo = 30; reserve = 90; reloadUntil = 0; shotUntil = 0; mission = 0; crimeCooldown = 0; latestThreat = 0;
  cameraShake = 0; damageFlash = 0; lookYaw = 0; lookPitch = .32; firstPerson = false;
  effects.forEach(effect => { scene.remove(effect.object); effect.object.geometry.dispose(); effect.object.material.dispose(); }); effects.length = 0;
  personMeshes.forEach(mesh => { mesh.userData.downAt = undefined; mesh.userData.previous = null; });
  startGame();
}

function interact() {
  if (!active || paused || health <= 0) return;
  if (player.inCar) {
    if (Math.abs(car.speed) > 2.8) { notify('Slow down before leaving the vehicle.'); return; }
    const exit = findExit(car, world.colliders, world.bounds);
    if (!exit) { notify('The doors are blocked. Move the car into an open space.'); return; }
    Object.assign(player, { ...exit, inCar: false, angle: car.angle, speed: 0 });
    lookYaw = car.angle; car.speed = 0; car.vx = 0; car.vz = 0;
    notify('Drag to look. Right mouse to aim. Left click or F to fire.', 5);
  } else if (distance(player, car) < 4.7) {
    player.inCar = true; player.x = car.x; player.z = car.z; lookYaw = car.angle; aiming = false;
    if (reserve < 90) { reserve = 90; notify('Vehicle entered. Reserve ammunition replenished.'); }
    else notify('Vehicle entered. W to accelerate, SPACE to brake.');
  } else notify('Get closer to your vehicle to enter it.');
  updateHud();
}

function reload() {
  if (player.inCar || paused || !active || reloadUntil > time || ammo >= 30) return;
  if (reserve <= 0) { notify('Return to your vehicle for reserve ammunition.'); return; }
  reloadUntil = time + 1.5; audio.tone(260, .1, .015); notify('Reloading…', 1.5);
}

function tracer(x, z, tx, tz, hostile = false) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, 1.35, z), new THREE.Vector3(tx, 1.3, tz),
  ]), new THREE.LineBasicMaterial({ color: hostile ? 0xff7855 : 0xffe4a0, transparent: true, opacity: .85 }));
  scene.add(line); effects.push({ object: line, expires: time + .09 });
}

function fire() {
  if (!active || paused || health <= 0 || shotUntil > time) return;
  if (player.inCar) { notify('Exit your vehicle to equip the sidearm.', 2); return; }
  if (reloadUntil > time) return;
  if (ammo <= 0) { reload(); return; }
  ammo--; shotUntil = time + .22; audio.shot(); cameraShake = .05;
  player.angle = lookYaw;
  centerRay.setFromCamera(zero, camera);
  let end = centerRay.ray.at(90, new THREE.Vector3());
  const availableMeshes = [...personMeshes.entries()].filter(([id, mesh]) => mesh.visible && simulation.people.find(actor => actor.id === id)?.hp > 0).map(([, mesh]) => mesh);
  const hits = centerRay.intersectObjects(availableMeshes, true);
  if (hits.length) end = hits[0].point;
  let dx = end.x - player.x, dz = end.z - player.z;
  const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
  const hit = simulation.shoot({ x: player.x, z: player.z, dx, dz, range: 90 });
  tracer(player.x, player.z, hit?.x ?? player.x + dx * 70, hit?.z ?? player.z + dz * 70);
  if (hit) {
    if (hit.kind === 'hostile') { audio.tone(640, .035, .01); if (hit.hp <= 0) notify('Hostile neutralized.', 2); }
    else notify(hit.kind === 'police' ? 'Officer hit. Police are responding.' : 'Civilian hit. Police are responding.', 3);
  }
}

function cameraCollision(target, destination) {
  const dx = destination.x - target.x, dz = destination.z - target.z;
  let closest = 1;
  for (const box of world.colliders) {
    let near = 0, far = 1;
    for (const [start, delta, min, max] of [[target.x, dx, box.x - box.hx - .4, box.x + box.hx + .4], [target.z, dz, box.z - box.hz - .4, box.z + box.hz + .4]]) {
      if (Math.abs(delta) < .0001) { if (start < min || start > max) { near = 2; break; } }
      else { let a = (min - start) / delta, b = (max - start) / delta; if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b); }
    }
    if (near <= far && near > 0 && near < closest && target.y + (destination.y - target.y) * near < box.height + .4) closest = Math.max(.08, near - .05);
  }
  return destination.lerpVectors(target, destination, closest);
}

function updateCamera(dt) {
  if (!active) {
    camera.position.set(14 + Math.sin(time * .05) * 1.5, 7, 136); camera.lookAt(-2, 2.6, 53); return;
  }
  if (player.inCar && !dragging) lookYaw += angleDelta(lookYaw, car.angle) * (1 - Math.exp(-dt * 4.5));
  const fx = -Math.sin(lookYaw), fz = -Math.cos(lookYaw), rx = Math.cos(lookYaw), rz = -Math.sin(lookYaw);
  const focusHeight = player.inCar ? 1.1 : 1.45;
  targetPosition.set(player.x, focusHeight, player.z);
  const speedZoom = player.inCar ? Math.abs(car.speed) * .055 : 0;
  if (firstPerson) {
    desiredCamera.set(player.x + fx * (player.inCar ? .6 : 0), player.inCar ? 1.28 : 1.65, player.z + fz * (player.inCar ? .6 : 0));
    lookTarget.set(desiredCamera.x + fx * 30, desiredCamera.y - (lookPitch - .3) * 22, desiredCamera.z + fz * 30);
  } else {
    const length = player.inCar ? 9.5 + speedZoom : aiming ? 3.2 : 5.4;
    const shoulder = !player.inCar ? .65 : 0;
    desiredCamera.set(player.x - fx * length + rx * shoulder, focusHeight + length * lookPitch + (player.inCar ? 1 : .2), player.z - fz * length + rz * shoulder);
    cameraCollision(targetPosition, desiredCamera);
    lookTarget.set(player.x + fx * (aiming ? 18 : player.inCar ? 5 : 3), player.inCar ? 1.0 : aiming ? 1.35 - (lookPitch - .32) * 20 : 1.35, player.z + fz * (aiming ? 18 : player.inCar ? 5 : 3));
  }
  camera.position.lerp(desiredCamera, firstPerson ? 1 : 1 - Math.exp(-dt * 8));
  camera.lookAt(lookTarget);
  if (cameraShake > .001) { camera.position.y += Math.sin(time * 79) * cameraShake; cameraShake *= Math.exp(-dt * 13); }
  carMesh.visible = !(firstPerson && player.inCar); playerMesh.visible = !player.inCar && !firstPerson;
}

function updateMission() {
  const state = simulation.getState(), d = distance(player, world.plaza);
  if (mission === 0 && d < 43) { mission = 1; notify('Armed cell confirmed at Civic Square. Keep civilians out of the line of fire.', 6); }
  if (state.hostilesRemaining === 0 && mission < 2) { mission = 2; notify('District secured. Return to your vehicle or continue exploring.', 7); audio.tone(480, .3, .025); }
  if (mission === 2 && player.inCar && distance(player, world.plaza) > 50) { mission = 3; notify('Response complete. The city is yours to explore.', 6); }
}

function drawMap() {
  if (!map) return;
  const W = 256, scale = W / 440, offset = W / 2;
  const px = x => offset + x * scale, pz = z => offset + z * scale;
  map.clearRect(0, 0, W, W); map.fillStyle = '#182d36'; map.fillRect(0, 0, W, W);
  map.fillStyle = '#22323a'; map.fillRect(px(-205), pz(-205), 410 * scale, 410 * scale);
  map.fillStyle = '#34434a';
  for (const road of world.roads) { map.fillRect(px(road - 9), pz(-202), 18 * scale, 404 * scale); map.fillRect(px(-202), pz(road - 9), 404 * scale, 18 * scale); }
  map.fillStyle = '#52605e';
  for (const b of world.mapBuildings) map.fillRect(px(b.x - b.hx), pz(b.z - b.hz), b.hx * 2 * scale, b.hz * 2 * scale);
  map.fillStyle = '#314d43'; map.fillRect(px(14), pz(14), 44 * scale, 44 * scale);
  if (mission < 2) { map.strokeStyle = '#e4b574'; map.lineWidth = 1.4; map.beginPath(); map.arc(px(world.plaza.x), pz(world.plaza.z), 10, 0, Math.PI * 2); map.stroke(); }
  for (const actor of simulation.people) {
    if (actor.hp <= 0) continue;
    map.fillStyle = actor.kind === 'hostile' ? '#e47562' : actor.kind === 'police' ? '#7dabd4' : '#a4b8aa';
    map.beginPath(); map.arc(px(actor.x), pz(actor.z), actor.kind === 'civilian' ? 1.1 : 2.0, 0, Math.PI * 2); map.fill();
  }
  if (!player.inCar) { map.fillStyle = '#e4b574'; map.fillRect(px(car.x) - 2.5, pz(car.z) - 2.5, 5, 5); }
  map.save(); map.translate(px(player.x), pz(player.z)); map.rotate(-player.angle); map.fillStyle = '#f2e4c4';
  map.beginPath(); map.moveTo(0, -6); map.lineTo(4, 4); map.lineTo(0, 2); map.lineTo(-4, 4); map.closePath(); map.fill(); map.restore();
}

function updateHud() {
  const state = simulation.getState();
  $('health-value').textContent = Math.ceil(health); $('health-fill').style.width = `${clamp(health, 0, 100)}%`;
  $('health-fill').style.background = health < 30 ? '#da7865' : '#d9b471';
  $('speed-value').textContent = player.inCar ? Math.round(Math.abs(car.speed) * 3.6) : Math.round(Math.abs(player.speed) * 3.6);
  $('speed-unit').textContent = 'KM/H';
  $('gear-value').textContent = player.inCar ? car.speed < -.3 ? 'R' : Math.abs(car.speed) < .3 ? 'N' : `D${Math.min(5, 1 + Math.floor(Math.abs(car.speed) / 8))}` : aiming ? 'AIM' : 'FOOT';
  $('mode-label').textContent = player.inCar ? 'SEDAN / RWD' : 'ON FOOT';
  $('vehicle-health').hidden = !player.inCar; $('vehicle-health').querySelector('span').textContent = `${Math.ceil(car.health)}%`;
  $('ammo-readout').hidden = player.inCar; $('ammo-value').textContent = reloadUntil > time ? 'RELOADING' : `${ammo} / ${reserve}`;
  $('wanted-stars').textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  $('wanted-label').textContent = state.wanted > 0 ? 'POLICE ALERT' : 'CITY STATUS';
  $('dispatch-status').textContent = state.wanted ? state.dispatch.toUpperCase() : state.threatNear ? 'ARMED THREAT NEARBY' : 'CLEAR';
  $('session-status').textContent = paused ? 'PAUSED' : 'DISTRICT 01';
  $('objective-title').textContent = mission === 0 ? 'Reach Civic Square' : mission === 1 ? 'Secure the square' : mission === 2 ? 'Leave the response zone' : 'Explore Meridian';
  $('objective-detail').textContent = mission === 0 ? 'Investigate the reported armed cell.' : mission === 1 ? `${state.hostilesRemaining} hostile${state.hostilesRemaining === 1 ? '' : 's'} remain. Protect civilians.` : mission === 2 ? 'Return to your car and drive clear.' : 'Walk the waterfront. Take the long way home.';
  $('objective-tag').textContent = mission >= 3 ? 'FREE ROAM' : 'CITY DISPATCH';
  $('objective-distance').textContent = mission < 2 ? `${Math.round(distance(player, world.plaza))} M` : mission === 2 ? 'RETURN TO VEHICLE' : 'DISTRICT SECURED';
  $('objective-stage').textContent = mission >= 3 ? 'COMPLETE' : `0${Math.min(3, mission + 1)} / 03`;
  $('population-status').textContent = `${state.civiliansSafe} CIVILIANS SAFE · ${state.hostilesRemaining} HOSTILES`;
  $('crosshair').hidden = player.inCar;
  const canEnter = !player.inCar && distance(player, car) < 4.7;
  $('interaction-prompt').hidden = !canEnter;
  $('touch-interact').textContent = player.inCar ? 'EXIT' : 'ENTER'; $('touch-fire').hidden = player.inCar;
  $('controls-strip').innerHTML = player.inCar
    ? '<span><kbd>W A S D</kbd> Drive</span><span><kbd>SPACE</kbd> Brake</span><span><kbd>E</kbd> Exit</span><span><kbd>C</kbd> Camera</span><span><kbd>H</kbd> Horn</span><span><kbd>ESC</kbd> Menu</span>'
    : '<span><kbd>W A S D</kbd> Walk</span><span><kbd>SHIFT</kbd> Sprint</span><span><kbd>E</kbd> Enter car</span><span><kbd>F</kbd> Fire</span><span><kbd>R</kbd> Reload</span><span><kbd>ESC</kbd> Menu</span>';
  drawMap();
}

function damage(amount) {
  if (amount <= 0 || health <= 0) return;
  health = Math.max(0, health - amount); player.health = health; damageFlash = Math.min(1, damageFlash + .6); cameraShake = .18; latestThreat = time;
  if (health <= 0) {
    paused = true; keys.clear(); aiming = false; audio.update(0, false, 0, true); $('game-over').hidden = false; $('menu').hidden = true; $('respawn-button').focus();
  }
}

function tick(dt) {
  lastThrottle = 0;
  if (active && !paused) {
    const input = { throttle: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')), steer: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')), handbrake: keys.has('Space'), brake: keys.has('Space') };
    if (player.inCar) {
      lastThrottle = input.throttle;
      if (car.health <= 0) { input.throttle = 0; notifyDestroyedCar(); }
      const collisions = updateVehicle(car, input, dt, world.colliders, world.bounds, simulation.traffic.map(actor => ({ x: actor.x, z: actor.z, radius: 1.65, id: actor.id })));
      player.x = car.x; player.z = car.z; player.angle = car.angle; player.speed = car.speed;
      if (collisions.impact > 4) {
        audio.impact(collisions.impact); cameraShake = Math.min(.3, collisions.impact * .007);
        damage(Math.max(0, collisions.impact - 9) * .15);
        if (time > crimeCooldown && simulation.traffic.some(actor => distance(actor, car) < 5)) { simulation.reportCrime(.45); crimeCooldown = time + 2; notify('Traffic collision reported.', 2); }
      }
      if (Math.abs(car.speed) > 4) for (const actor of simulation.people) {
        if (actor.hp > 0 && distance(actor, car) < 1.7 && time > crimeCooldown) {
          actor.hp = Math.max(0, actor.hp - Math.abs(car.speed) * 4); if (actor.hp <= 0) actor.state = 'down';
          simulation.reportCrime(actor.kind === 'police' ? 4 : 2); crimeCooldown = time + 1; car.speed *= .7; audio.impact(8); notify('Pedestrian collision. Emergency services alerted.');
        }
      }
    } else {
      const f = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const s = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.8 : aiming ? 1.8 : 3.1;
      let dx = -Math.sin(lookYaw) * f + Math.cos(lookYaw) * s, dz = -Math.cos(lookYaw) * f - Math.sin(lookYaw) * s;
      const magnitude = Math.hypot(dx, dz); if (magnitude > 0) { dx = dx / magnitude * speed; dz = dz / magnitude * speed; }
      const before = { x: player.x, z: player.z }; movePerson(player, dx, dz, dt, world.colliders, world.bounds);
      player.speed = distance(before, player) / Math.max(.001, dt);
      if (magnitude > 0) player.angle += angleDelta(player.angle, Math.atan2(-dx, -dz)) * (1 - Math.exp(-dt * 12));
      if (aiming) player.angle = lookYaw;
      if (keys.has('KeyF') || keys.has('Fire')) fire();
      footsteps += player.speed * dt;
    }
    if (reloadUntil > 0 && reloadUntil <= time) { const added = Math.min(30 - ammo, reserve); ammo += added; reserve -= added; reloadUntil = 0; }
    for (const event of simulation.step(dt, player)) {
      if (event.type === 'damage') damage(event.amount * (player.inCar ? .3 : 1));
      else if (event.type === 'message') notify(event.text, 3);
      else if (event.type === 'gunfire') { tracer(event.x, event.z, event.targetX, event.targetZ, true); if (Math.hypot(event.x - player.x, event.z - player.z) < 45) audio.tone(80, .07, .012, 'sawtooth'); }
    }
    if (health > 0 && health < 100 && time - latestThreat > 14 && !simulation.getState().threatNear && simulation.getState().wanted === 0) health = Math.min(100, health + dt * 1.5);
    updateMission();
    updateCarVisual(carMesh, car, dt);
    playerMesh.position.set(player.x, .05, player.z); playerMesh.rotation.y = player.angle;
    playerMesh.userData.legs?.forEach((leg, index) => { leg.rotation.x = Math.sin(footsteps * 2 + index * Math.PI) * Math.min(.55, player.speed * .15); });
    const weaponRaised = aiming || shotUntil > time;
    playerMesh.userData.arms?.forEach((arm, index) => { arm.rotation.x = weaponRaised ? 1.35 : -Math.sin(footsteps * 2 + index * Math.PI) * Math.min(.35, player.speed * .1); });
    if (playerMesh.userData.weapon) playerMesh.userData.weapon.rotation.x = weaponRaised ? -1.35 : .43;
    for (const actor of simulation.people) updatePersonVisual(personMeshes.get(actor.id), actor, dt);
    for (const actor of simulation.traffic) { const mesh = trafficMeshes.get(actor.id); mesh.visible = distance(actor, player) < 145; if (mesh.visible) updateCarVisual(mesh, actor, dt, actor.police); }
    for (const parked of parkedCars) updateCarVisual(parked.mesh, parked, dt, simulation.getState().threatNear || simulation.getState().wanted > 0);
  }
  audio.update(car.speed, player.inCar, lastThrottle, paused || !active);
  if (!paused) world.update(dt, time);
  updateCamera(paused ? 0 : dt);
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].expires <= time) { const effect = effects.splice(i, 1)[0]; scene.remove(effect.object); effect.object.geometry.dispose(); effect.object.material.dispose(); }
  damageFlash *= Math.exp(-dt * 4); $('damage-flash').style.opacity = damageFlash * .6;
  if (time > toastUntil) $('toast').hidden = true;
  hudTimer += dt; if (hudTimer > .1 && active) { updateHud(); hudTimer = 0; }
}

let destroyedNotice = false;
function notifyDestroyedCar() { if (!destroyedNotice) { destroyedNotice = true; notify('Vehicle disabled. Leave the car or restart from the pause menu.', 6); } }

function loop(now) {
  requestAnimationFrame(loop);
  if (!renderer || rendererLost) return;
  const dt = clamp((now - lastFrame) / 1000, .001, .05); lastFrame = now;
  if (!paused) time += dt;
  tick(dt); renderer.render(scene, camera);
}

function wireControls() {
  $('start-button').addEventListener('click', startGame);
  $('menu-button').addEventListener('click', () => active ? pauseGame(!paused) : openHelp('intro'));
  $('intro-help').addEventListener('click', () => openHelp('intro'));
  $('resume-button').addEventListener('click', () => pauseGame(false));
  $('help-button').addEventListener('click', () => openHelp('menu'));
  $('close-help').addEventListener('click', closeHelp);
  $('reset-button').addEventListener('click', () => { destroyedNotice = false; resetGame(); });
  $('respawn-button').addEventListener('click', () => { destroyedNotice = false; resetGame(); });
  $('quality').addEventListener('change', event => { settings.quality = event.target.value; setQuality(); saveSettings(); });
  $('audio-toggle').addEventListener('change', event => { settings.sound = event.target.checked; audio.enabled = settings.sound; if (settings.sound) audio.start(); saveSettings(); });
  $('touch-interact').addEventListener('click', interact);
  $('touch-camera').addEventListener('click', () => { firstPerson = !firstPerson; });
  const canvas = renderer.domElement;
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (!active || paused) return;
    dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
    if (event.button === 2) aiming = !player.inCar;
    if (event.button === 0 && !player.inCar && event.pointerType !== 'touch') fire();
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging || paused || !lastPointer) return;
    lookYaw -= (event.clientX - lastPointer.x) * .005;
    lookPitch = clamp(lookPitch + (event.clientY - lastPointer.y) * .002, -.15, .8);
    lastPointer = { x: event.clientX, y: event.clientY };
  });
  const releasePointer = () => { dragging = false; aiming = false; lastPointer = null; };
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
  for (const button of document.querySelectorAll('[data-key]')) {
    const down = event => { event.preventDefault(); if (active && !paused) { keys.add(button.dataset.key); button.setPointerCapture(event.pointerId); } };
    const up = event => { event.preventDefault(); keys.delete(button.dataset.key); };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
  }
  const fireButton = $('touch-fire');
  fireButton.addEventListener('pointerdown', event => { event.preventDefault(); fireButton.setPointerCapture(event.pointerId); keys.add('Fire'); aiming = true; fire(); });
  const releaseFire = () => { keys.delete('Fire'); aiming = false; };
  fireButton.addEventListener('pointerup', releaseFire); fireButton.addEventListener('pointercancel', releaseFire); fireButton.addEventListener('lostpointercapture', releaseFire);
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      event.preventDefault(); if (!$('help').hidden) closeHelp(); else if (active && health > 0) pauseGame(!paused); return;
    }
    if (!active || paused || /^(INPUT|SELECT|BUTTON)$/.test(document.activeElement?.tagName)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyE') interact();
    if (event.code === 'KeyC') firstPerson = !firstPerson;
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyH') { audio.horn(); notify('Horn', .5); }
    if (event.code === 'KeyM') document.querySelector('.map-panel').classList.toggle('expanded');
    if (event.code === 'KeyF') fire();
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); releasePointer(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && active && !paused && health > 0) pauseGame(true); });
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); rendererLost = true; if (active) pauseGame(true); $('boot-error').hidden = false; $('boot-error').textContent = 'Graphics connection lost. Refresh this page to reload the city.'; $('intro').hidden = false; $('start-button').disabled = true; });
}

async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; setQuality();
    $('viewport').appendChild(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .15, 1800); lightCity();
    world = createWorld(THREE, scene, { quality: settings.quality });
    // Start in the northbound lane, clear of oncoming traffic.
    world.spawn.x = 3.2;
    // Parked patrol cars use the same ground collision geometry as the city.
    for (const [x, z, angle] of [[7, 30, 0], [79, 98, Math.PI]]) {
      const mesh = createCar(THREE, { police: true }); scene.add(mesh);
      const parked = { mesh, x, z, angle, speed: 0 }; parkedCars.push(parked); updateCarVisual(mesh, parked, 0);
      world.colliders.push({ x, z, hx: 1.1, hz: 2.4, height: 1.85 });
    }
    simulation = createSimulation({ colliders: world.colliders, roads: world.roads, bounds: world.bounds });
    car = createVehicle(world.spawn); carMesh = createCar(THREE, { color: 0x4f6974 }); scene.add(carMesh); updateCarVisual(carMesh, car, 0);
    player.x = car.x; player.z = car.z;
    playerMesh = createPerson(THREE, { kind: 'player', seed: 5 }); playerMesh.visible = false; scene.add(playerMesh);
    for (const actor of simulation.people) { const mesh = createPerson(THREE, { kind: actor.kind, seed: actor.id.length + simulation.people.indexOf(actor) }); mesh.userData.npcId = actor.id; personMeshes.set(actor.id, mesh); scene.add(mesh); updatePersonVisual(mesh, actor, .016); }
    for (const actor of simulation.traffic) { const mesh = createCar(THREE, { color: actor.color, police: actor.police }); trafficMeshes.set(actor.id, mesh); scene.add(mesh); updateCarVisual(mesh, actor, 0); }
    wireControls(); updateCamera(.016); renderer.render(scene, camera);
    $('loading').hidden = true; $('start-button').disabled = false; $('start-label').textContent = 'Enter the city';
    $('start-button').addEventListener('click', () => { $('start-button').blur(); });
    $('resume-button').addEventListener('click', () => { $('resume-button').blur(); });
    $('close-help').addEventListener('click', () => { $('close-help').blur(); });
    $('respawn-button').addEventListener('click', () => { $('respawn-button').blur(); });
    window.__MERIDIAN__ = {
      snapshot: () => ({ active, paused, firstPerson, rendererLost, inCar: player.inCar, player: { x: player.x, z: player.z, health, speed: player.speed }, car: { x: car.x, z: car.z, health: car.health, speed: car.speed }, ammo, reserve, mission, ...simulation.getState(), people: simulation.people.map(a => ({ id: a.id, kind: a.kind, x: a.x, z: a.z, hp: a.hp, state: a.state })), traffic: simulation.traffic.map(a => ({ id: a.id, x: a.x, z: a.z, speed: a.speed })), render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }, quality: settings.quality }),
    };
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window.__MERIDIAN__, {
      teleport: (x, z, inCar = false) => { player.x = x; player.z = z; player.inCar = inCar; if (inCar) { car.x = x; car.z = z; car.speed = 0; } },
      face: angle => { lookYaw = angle; player.angle = angle; car.angle = angle; },
      crime: amount => simulation.reportCrime(amount),
      setHealth: value => { damage(health - value); updateHud(); },
      shoot: ray => simulation.shoot(ray),
      colliders: world.colliders,
    });
    requestAnimationFrame(loop);
  } catch (error) {
    console.error('City initialization failed:', error);
    $('loading').hidden = true; $('boot-error').hidden = false; $('boot-error').textContent = 'The city could not start. Try an updated Chrome, Firefox, or Edge browser with hardware acceleration enabled.'; $('start-label').textContent = 'Graphics unavailable';
  }
}
boot();
