import * as THREE from 'three';
import { DT, MAPS, Simulation, initializePhysics } from './physics.js';
import { GymnastAI } from './ai.js';

const $ = id => document.getElementById(id);
const held = { arch: false, tuck: false, release: false };
const keys = new Set();
let sim, stage, current = MAPS[0], ai = false, controller = new GymnastAI();
let paused = false, last = 0, accumulator = 0, cameraMode = 0, toastTimer = 0;
const mapList = $('mapList');
let renderer;

class Stage {
  constructor(map, sim) {
    this.map = map;
    this.sim = sim;
    this.scene = new THREE.Scene();
    const night = map.theme === 'night', grove = map.theme === 'grove';
    this.scene.background = new THREE.Color(night ? 0x273961 : grove ? 0x92c9bf : map.theme === 'sunset' ? 0x89c3de : 0x78c5ed);
    this.scene.fog = new THREE.Fog(this.scene.background, 22, 55);
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 130);
    this.cameraX = -1.1;
    this.base = new THREE.Group(); this.scene.add(this.base);
    this.parts = [];
    this.pal = {
      floor: new THREE.MeshStandardMaterial({ color: night ? 0x534967 : grove ? 0x889a72 : map.theme === 'sunset' ? 0xb96759 : 0xcf625b, roughness: .95 }),
      edge: new THREE.MeshStandardMaterial({ color: night ? 0x343049 : grove ? 0x596b54 : 0x914c47, roughness: .92 }),
      stone: new THREE.MeshStandardMaterial({ color: night ? 0x9fa8bd : 0xe3e0d5, roughness: .78 }),
      cap: new THREE.MeshStandardMaterial({ color: night ? 0x7a85a0 : 0x58646a, roughness: .75, metalness: .1 }),
      skin: new THREE.MeshStandardMaterial({ color: night ? 0xb7bcc3 : 0xb9c3c3, roughness: .82 }),
      torso: new THREE.MeshStandardMaterial({ color: 0x7b8889, roughness: .85 }),
      joint: new THREE.MeshStandardMaterial({ color: 0x5c686d, roughness: .83 }),
      spring: new THREE.MeshStandardMaterial({ color: 0xe5ba6c, roughness: .55, metalness: .18 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x477b7b, roughness: .83 }),
      branch: new THREE.MeshStandardMaterial({ color: 0x796956, roughness: 1 }),
      roofRail: new THREE.MeshStandardMaterial({ color: 0x394c58, roughness: .65, metalness: .35 }),
      neonRail: new THREE.MeshStandardMaterial({ color: 0x6de0dd, emissive: 0x2ecacc, emissiveIntensity: 2.2 })
    };
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.ballGeometry = new THREE.SphereGeometry(1, 16, 12);
    this.addLights(night);
    this.addEnvironment(night, grove);
    this.addCourse();
    this.addRagdoll();
    if (map.chimp) this.addChimp();
    this.resize();
  }
  box(x, y, z, w, h, d, material, shadow = true) {
    const mesh = new THREE.Mesh(this.boxGeometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.base.add(mesh); return mesh;
  }
  sphere(x, y, z, rx, ry, rz, mat, parent = this.base) {
    const mesh = new THREE.Mesh(this.ballGeometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(rx, ry, rz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  addLights(night) {
    const sun = new THREE.DirectionalLight(night ? 0xaab8ff : 0xfff4df, night ? 2.2 : 2.6);
    sun.position.set(-6, 15, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -.00018; this.scene.add(sun); this.sun = sun;
    this.scene.add(new THREE.HemisphereLight(night ? 0x8797df : 0xc9ecff, night ? 0x493758 : 0xd6a38a, night ? 1.6 : 2.3));
    if (night) {
      for (let x = 0; x < 20; x += 5) {
        const lamp = new THREE.PointLight(0x77e8e7, 10, 7); lamp.position.set(x, 5.2, -1.4); this.scene.add(lamp);
      }
    }
  }
  addEnvironment(night, grove) {
    const cloud = new THREE.MeshBasicMaterial({ color: night ? 0x7587ad : 0xe8f7f5, transparent: true, opacity: night ? .33 : .66, depthWrite: false });
    for (let i = -2; i < 17; i++) {
      const x = i * 2.7 + (i % 3) * .8, y = 7.4 + (i % 4) * .8, z = -13 - (i % 3) * 2;
      this.sphere(x, y, z, 1.2, .24, .47, cloud);
      this.sphere(x + .8, y + .14, z, .85, .29, .47, cloud);
      this.sphere(x - .7, y + .08, z, .8, .20, .42, cloud);
    }
    if (grove) {
      const bark = this.pal.branch;
      const leaf = new THREE.MeshStandardMaterial({ color: 0x628476, roughness: 1 });
      for (let x = -2; x < 23; x += 3.4) for (const side of [-1, 1]) {
        const z = side * 4.3;
        this.box(x, 2.4, z, .42, 4.8, .45, bark);
        this.sphere(x, 5.2, z, 1.25, .8, 1.1, leaf);
        this.sphere(x + .7, 4.9, z + .25, .9, .65, .8, leaf);
      }
    }
    if (this.map.id === 'roof') {
      for (let x = -5; x < 21; x += 2.3) {
        const h = 2.5 + ((Math.round(x * 7) % 5 + 5) % 5) * .85;
        this.box(x, h / 2 - 1.4, -8.5, 1.9, h, 1.8, this.pal.edge, false);
        this.box(x, h - 1.35, -8.5, 2.05, .12, 1.95, this.pal.cap, false);
      }
    }
    if (this.map.id === 'gym') {
      for (let x = -2; x < 14; x += 3.5) {
        this.box(x, 2.6, -5.6, .5, 5.2, .45, this.pal.stone, false);
        this.box(x + 1.75, 5.25, -5.6, 3.5, .28, .45, this.pal.cap, false);
      }
    }
  }
  addCourse() {
    const { floor, edge, stone, cap, spring, rubber } = this.pal;
    for (const [a, b, h] of this.map.floor) {
      this.box((a + b) / 2, h - .32, 0, b - a, .64, 6.6, floor);
      this.box((a + b) / 2, h - .66, 0, b - a, .11, 6.8, edge);
      this.box((a + b) / 2, h - .09, 3.26, b - a, .10, .10, edge);
    }
    for (const [x, w, h] of this.map.blocks) {
      this.box(x, h / 2, 0, w, h, 2.3, stone);
      this.box(x, h + .06, 0, w + .1, .12, 2.4, cap);
    }
    for (const [x, w] of this.map.springs) {
      this.box(x, .06, 0, w + .14, .13, 2.6, cap);
      this.box(x, .22, 0, w, .09, 2.4, rubber);
      for (let k = -2; k <= 2; k++) this.box(x + k * w / 7, .275, 0, .025, .018, 2.42, spring, false);
    }
    const barMaterial = this.map.theme === 'night' ? this.pal.neonRail
      : this.map.theme === 'grove' ? this.pal.branch
      : this.map.id === 'roof' ? this.pal.roofRail : cap;
    this.map.bars.forEach((bar, i) => {
      if (i % 3 === 0 || i === this.map.bars.length - 1)
        for (const z of [-1.48, 1.48]) {
          this.box(bar.x, bar.y / 2, z, .24, bar.y, .24, stone);
          this.box(bar.x, bar.y + .05, z, .38, .20, .36, cap);
        }
      this.box(bar.x, bar.y, 0, .19, .19, 3.10, barMaterial);
      this.box(bar.x, bar.y + .09, 0, .28, .08, 3.2,
        this.map.theme === 'grove' ? this.pal.branch : stone);
    });
    if (this.map.theme === 'night') for (let x = 0; x < 20; x += 3)
      this.box(x, .23, -3.2, 1.8, .06, .08, this.pal.neonRail, false);
    if (this.map.chimp) {
      const marker = new THREE.MeshStandardMaterial({ color: 0xceb08a, roughness: .9 });
      const x = this.map.bars.at(-1).x + 1.45;
      this.box(x, 1.15, -2.8, .24, 2.3, .28, marker);
      this.box(x, 2.26, -2.8, 1.15, .18, .22, marker);
    }
  }
  addRagdoll() {
    const geos = {
      torso: new THREE.CapsuleGeometry(.22, .62, 5, 12),
      pelvis: new THREE.CapsuleGeometry(.20, .32, 4, 10),
      upperArm: new THREE.CapsuleGeometry(.105, .5, 4, 10),
      forearm: new THREE.CapsuleGeometry(.095, .48, 4, 10),
      thigh: new THREE.CapsuleGeometry(.14, .48, 4, 10),
      shin: new THREE.CapsuleGeometry(.115, .46, 4, 10),
      head: new THREE.SphereGeometry(.23, 20, 14)
    };
    for (const part of this.sim.bodies) {
      const material = part.name === 'torso' ? this.pal.torso : part.name === 'head' ? this.pal.skin : this.pal.skin;
      const mesh = new THREE.Mesh(geos[part.name], material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.base.add(mesh); this.parts.push({ mesh, body: part.body });
    }
    this.joints = [];
    for (const arm of this.sim.arms) {
      const hand = this.sphere(0, 0, 0, .13, .13, .13, this.pal.joint);
      this.joints.push({ mesh: hand, get: () => this.sim.handPoint(arm) });
    }
    const visor = this.sphere(0, .02, .19, .11, .085, .048, this.pal.joint);
    this.face = visor;
    this.head = this.parts.find(p => p.body === this.sim.bodies.find(b => b.name === 'head').body).mesh;
    this.head.add(visor);
  }
  addChimp() {
    const brown = new THREE.MeshStandardMaterial({ color: 0x3d302a, roughness: 1 });
    const face = new THREE.MeshStandardMaterial({ color: 0xa28065, roughness: 1 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xffdb88, emissive: 0x9a6342, emissiveIntensity: .35 });
    this.chimpMesh = new THREE.Group(); this.base.add(this.chimpMesh);
    this.sphere(0, 0, 0, .45, .42, .4, brown, this.chimpMesh);
    this.sphere(.21, .35, 0, .29, .28, .27, brown, this.chimpMesh);
    this.sphere(.43, .34, 0, .10, .15, .17, face, this.chimpMesh);
    for (const z of [-.15, .15]) {
      this.sphere(.46, .44, z, .036, .045, .034, eye, this.chimpMesh);
      this.sphere(-.13, -.25, z * 1.5, .28, .11, .13, brown, this.chimpMesh);
      this.sphere(.2, -.25, z * 1.7, .27, .13, .12, brown, this.chimpMesh);
    }
  }
  sync() {
    for (const { mesh, body } of this.parts) {
      const p = body.translation(), q = body.rotation();
      mesh.position.set(p.x, p.y, p.z); mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (const { mesh, get } of this.joints) { const p = get(); mesh.position.set(p.x, p.y, p.z); }
    if (this.chimpMesh) {
      const p = this.sim.chimp.translation(), q = this.sim.chimp.rotation();
      this.chimpMesh.position.set(p.x, p.y, p.z);
      this.chimpMesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const p = this.sim.torso.body.translation();
    this.cameraX += (Math.max(-1, Math.min(this.map.bars.at(-1).x - 2, p.x)) - this.cameraX) * .055;
    const views = [[2.2, 5.9, 13.0], [4.5, 6.4, 10.8], [1.0, 7.0, 10.5]];
    const [ox, oy, oz] = views[cameraMode];
    this.camera.position.set(this.cameraX + ox, oy, oz + p.z * .65);
    this.camera.lookAt(this.cameraX + 1.15, 2.8, p.z * .45);
    this.sun.position.x = this.cameraX - 6;
    this.sun.target.position.x = this.cameraX + 2;
    this.sun.target.updateMatrixWorld();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = innerWidth < 600 ? 62 : 52;
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    this.base.traverse(obj => { if (obj.isMesh && obj.geometry !== this.boxGeometry && obj.geometry !== this.ballGeometry) obj.geometry.dispose(); });
    this.boxGeometry.dispose(); this.ballGeometry.dispose();
    Object.values(this.pal).forEach(m => m.dispose());
  }
}

function setMap(map) {
  if (stage) stage.dispose();
  if (sim) sim.dispose();
  current = map; sim = new Simulation(map); stage = new Stage(map, sim);
  controller = new GymnastAI(); accumulator = 0; last = 0;
  held.arch = held.tuck = held.release = false;
  for (const key of ['arch', 'tuck', 'release']) $(key).classList.remove('active');
  $('mapName').textContent = map.name;
  $('chimpHud').hidden = !map.chimp;
  $('maps').hidden = true; $('end').hidden = true; paused = false;
  try { history.replaceState(null, '', '#' + map.id); } catch (_) { /* file preview */ }
  document.title = map.name + ' — Flip Lab';
}
function toast(text) {
  $('toast').textContent = text; $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1000);
}
function manualControl() {
  return { pose: (held.tuck || keys.has('Space') || keys.has('KeyS')) ? 'tuck'
    : (held.arch || keys.has('ArrowLeft') || keys.has('KeyA')) ? 'arch' : 'loose',
  release: held.release || keys.has('ArrowUp') || keys.has('KeyW') };
}
function update() {
  sim.step(ai ? controller.next(sim) : manualControl());
  if (sim.events.length) for (const event of sim.events.splice(0)) {
    if (event === 'regrab') toast('REGRAB');
    if (event === 'flip') toast(sim.flips + '× FLIP');
    if (event === 'caught' || event === 'escaped') {
      $('endTitle').textContent = event === 'caught' ? 'The chimp caught you.' : 'You escaped!';
      $('endText').textContent = event === 'caught' ? 'Reset and try another line.' : 'You reached the far side through physics alone.';
      $('end').hidden = false;
    }
  }
}
function frame(now) {
  if (!last) last = now;
  accumulator += Math.min((now - last) / 1000, .055); last = now;
  if (!paused) {
    let count = 0;
    while (accumulator >= DT && count++ < 5) { update(); accumulator -= DT; }
    stage.sync(); renderer.render(stage.scene, stage.camera);
    const p = sim.snapshot();
    $('count').textContent = p.regrabs + ' regrabs · ' + p.flips + ' flips';
    if (current.chimp) $('chimpRange').textContent = Math.max(0, Math.round((p.x - p.chimpX) * 10) / 10) + ' away';
  } else accumulator = 0;
  requestAnimationFrame(frame);
}
function bindHold(id, action) {
  const el = $(id);
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); held[action] = true; el.classList.add('active');
  });
  const up = () => { held[action] = false; el.classList.remove('active'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}
function initUI() {
  for (const m of MAPS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'map-choice map-' + m.id;
    button.style.setProperty('--a', m.theme === 'night' ? '#29385d' : '#51afe0');
    button.style.setProperty('--b', m.theme === 'grove' ? '#b7d1be' : '#bce4ee');
    button.style.setProperty('--floor', m.theme === 'grove' ? '#899a72' : '#d1685b');
    button.innerHTML = `<span class="map-mini"></span><span class="map-copy"><small>MAP ${String(MAPS.indexOf(m) + 1).padStart(2, '0')} · ${m.chimp ? 'ESCAPE' : 'FREE PLAY'}</small><strong>${m.name}</strong><em>${m.detail}</em></span>`;
    button.addEventListener('click', () => setMap(m)); mapList.append(button);
  }
  bindHold('arch', 'arch'); bindHold('tuck', 'tuck'); bindHold('release', 'release');
  $('ai').addEventListener('click', () => {
    ai = !ai; $('ai').setAttribute('aria-pressed', String(ai)); $('ai').querySelector('b').textContent = ai ? 'ON' : 'OFF';
    controller = new GymnastAI(); toast(ai ? 'AI MODE' : 'YOUR TURN');
  });
  $('reset').addEventListener('click', () => setMap(current));
  $('mapsButton').addEventListener('click', () => { paused = true; $('maps').hidden = false; });
  $('closeMaps').addEventListener('click', () => { paused = false; $('maps').hidden = true; last = 0; });
  $('camera').addEventListener('click', () => { cameraMode = (cameraMode + 1) % 3; });
  $('helpButton').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
  $('closeHelp').addEventListener('click', () => { $('help').hidden = true; });
  $('again').addEventListener('click', () => setMap(current));
  $('otherMap').addEventListener('click', () => { $('end').hidden = true; paused = true; $('maps').hidden = false; });
  document.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowUp', 'Space', 'KeyA', 'KeyS', 'KeyW', 'KeyR', 'KeyM', 'KeyI', 'KeyC'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyR') setMap(current);
    else if (e.code === 'KeyM') $('mapsButton').click();
    else if (e.code === 'KeyI') $('ai').click();
    else if (e.code === 'KeyC') $('camera').click();
    else keys.add(e.code);
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); held.arch = held.tuck = held.release = false; });
  window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); stage?.resize(); });
  document.addEventListener('visibilitychange', () => { last = 0; accumulator = 0; });
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('game').prepend(renderer.domElement);
  await initializePhysics();
  initUI();
  const hash = location.hash.slice(1);
  setMap(MAPS.find(m => m.id === hash) || MAPS[0]);
  $('loading').remove();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').textContent = /WebGL/i.test(String(error))
    ? 'This browser cannot start WebGL. Enable graphics acceleration to play the 3D game.'
    : 'Unable to start 3D physics. Reload to try again.';
}
