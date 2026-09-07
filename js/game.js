import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODES = {
  casual: {
    name: 'Casual', waves: 12, cash: 700, lives: 30,
    healthScale: 0.82, speedScale: 0.92, rewardScale: 1.18, completionBonus: 105,
  },
  intermediate: {
    name: 'Intermediate', waves: 16, cash: 600, lives: 20,
    healthScale: 1, speedScale: 1, rewardScale: 1, completionBonus: 90,
  },
  hard: {
    name: 'Hard', waves: 20, cash: 500, lives: 12,
    healthScale: 1.28, speedScale: 1.1, rewardScale: 0.9, completionBonus: 78,
  },
};

const TOWER_TYPES = {
  ranger: {
    name: 'Ranger', icon: 'R', cost: 250, color: 0xb8f43d,
    damage: 14, range: 9.5, rate: 0.5, projectileSpeed: 30,
    upgradeCosts: [190, 330], description: 'Fast · Long range',
  },
  cannon: {
    name: 'Cannon', icon: 'C', cost: 450, color: 0xffa63d,
    damage: 48, range: 7.8, rate: 1.42, projectileSpeed: 18, splash: 2.6,
    upgradeCosts: [320, 520], description: 'Heavy · Splash damage',
  },
  frost: {
    name: 'Cryo', icon: 'F', cost: 350, color: 0x4eeaf2,
    damage: 8, range: 8.2, rate: 0.78, projectileSpeed: 25, slow: 0.55, slowTime: 2.4,
    upgradeCosts: [260, 430], description: 'Slows the horde',
  },
};

const ENEMY_TYPES = {
  walker: { name: 'Walker', health: 72, speed: 1.85, reward: 20, damage: 1, scale: 1, color: 0x76914a },
  runner: { name: 'Runner', health: 52, speed: 2.95, reward: 24, damage: 1, scale: 0.88, color: 0x91a94f },
  brute: { name: 'Brute', health: 245, speed: 1.12, reward: 48, damage: 2, scale: 1.28, color: 0x647c45 },
  armored: { name: 'Armored', health: 490, speed: 0.86, reward: 82, damage: 3, scale: 1.38, color: 0x536846 },
  titan: { name: 'Titan', health: 1650, speed: 0.68, reward: 320, damage: 6, scale: 1.72, color: 0x4e6936 },
};

const PATH_NODES = [
  new THREE.Vector3(-26, 0, -7),
  new THREE.Vector3(-18, 0, -7),
  new THREE.Vector3(-13, 0, -2),
  new THREE.Vector3(-6, 0, -2),
  new THREE.Vector3(-2, 0, 6),
  new THREE.Vector3(7, 0, 6),
  new THREE.Vector3(11, 0, 0),
  new THREE.Vector3(18, 0, 0),
  new THREE.Vector3(22, 0, -6),
  new THREE.Vector3(27, 0, -6),
];

const PAD_POSITIONS = [
  [-20, -11.4], [-17, -1.5], [-12.2, -8.7], [-9.2, 2.5],
  [-5.2, -7.2], [0.2, 1.3], [1.2, 10.4], [6.7, 1.2],
  [9.4, 10.2], [13.2, 4.7], [14.3, -4.5], [18.4, 5.1],
  [20.5, -10.5], [24.6, 0.4],
];

const pathSegments = [];
let pathLength = 0;
for (let i = 0; i < PATH_NODES.length - 1; i += 1) {
  const start = PATH_NODES[i];
  const end = PATH_NODES[i + 1];
  const length = start.distanceTo(end);
  pathSegments.push({ start, end, length, from: pathLength, to: pathLength + length });
  pathLength += length;
}

const $ = (selector) => document.querySelector(selector);
const dom = {
  canvas: $('#gameCanvas'), loading: $('#loadingScreen'), menu: $('#menuScreen'), hud: $('#hud'),
  end: $('#endScreen'), cash: $('#cashValue'), lives: $('#livesValue'), wave: $('#waveValue'),
  waveTotal: $('#waveTotal'), mode: $('#modeLabel'), objective: $('#objectiveText'),
  waveCard: $('#waveCard'), waveStateLabel: $('#waveStateLabel'), waveStateText: $('#waveStateText'),
  startWave: $('#startWaveBtn'), speed: $('#speedBtn'), pause: $('#pauseBtn'),
  towerPanel: $('#towerPanel'), towerIcon: $('#towerIcon'), towerLevel: $('#towerLevel'),
  towerName: $('#towerName'), towerDamage: $('#towerDamage'), towerRange: $('#towerRange'),
  towerRate: $('#towerRate'), upgrade: $('#upgradeBtn'), upgradeCost: $('#upgradeCost'),
  sell: $('#sellBtn'), sellValue: $('#sellValue'), toast: $('#toast'), damageFlash: $('#damageFlash'),
  endKicker: $('#endKicker'), endTitle: $('#endTitle'), endSummary: $('#endSummary'),
  endWaves: $('#endWaves'), endKills: $('#endKills'), endCash: $('#endCash'),
};

let renderer;
let scene;
let camera;
let controls;
let worldRoot;
let dynamicRoot;
let effectsRoot;
let dustField;
let spawnBeacon;
let baseBeacon;
let rangeIndicator;
let pads = [];
let hoveredPad = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempC = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();

const game = {
  active: false,
  finished: false,
  modeKey: 'casual',
  config: MODES.casual,
  cash: 0,
  lives: 0,
  wave: 0,
  waveActive: false,
  spawnQueue: [],
  spawnTimer: 0,
  spawnInterval: 0.7,
  enemies: [],
  towers: [],
  projectiles: [],
  effects: [],
  selectedBuildType: 'ranger',
  selectedTower: null,
  kills: 0,
  paused: false,
  speed: 1,
  time: 0,
  endCountdown: 0,
};

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.16, ...options });
}

function mesh(geometry, mat, cast = true, receive = true) {
  const item = new THREE.Mesh(geometry, mat);
  item.castShadow = cast;
  item.receiveShadow = receive;
  return item;
}

function addBox(parent, size, position, mat, rotationY = 0) {
  const item = mesh(new THREE.BoxGeometry(...size), mat);
  item.position.set(...position);
  item.rotation.y = rotationY;
  parent.add(item);
  return item;
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b0d);
  scene.fog = new THREE.FogExp2(0x070b0d, 0.021);

  camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 180);
  camera.position.set(31, 30, 34);

  try {
    renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    dom.loading.innerHTML = '<p>WebGL could not start on this device.<br>Please try a newer browser.</p>';
    throw error;
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = window.innerWidth > 620;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  controls = new OrbitControls(camera, dom.canvas);
  controls.target.set(0, 0.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 22;
  controls.maxDistance = 53;
  controls.minPolarAngle = 0.56;
  controls.maxPolarAngle = 1.23;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;

  buildLights();
  buildWorld();
  bindEvents();
  updateUI();
  animate();

  requestAnimationFrame(() => {
    dom.loading.classList.add('hidden');
    dom.menu.classList.remove('hidden');
  });
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8ebac0, 0x172215, 1.55));

  const moon = new THREE.DirectionalLight(0xc7ecff, 2.35);
  moon.position.set(-18, 30, 15);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1536, 1536);
  moon.shadow.camera.left = -34;
  moon.shadow.camera.right = 34;
  moon.shadow.camera.top = 27;
  moon.shadow.camera.bottom = -27;
  moon.shadow.camera.near = 4;
  moon.shadow.camera.far = 80;
  moon.shadow.bias = -0.0004;
  scene.add(moon);

  const rim = new THREE.DirectionalLight(0x7bb24a, 0.62);
  rim.position.set(24, 14, -25);
  scene.add(rim);
}

function buildWorld() {
  worldRoot = new THREE.Group();
  dynamicRoot = new THREE.Group();
  effectsRoot = new THREE.Group();
  scene.add(worldRoot, dynamicRoot, effectsRoot);

  const groundMat = material(0x17201e, { roughness: 1, metalness: 0 });
  const ground = mesh(new THREE.PlaneGeometry(62, 43), groundMat, false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.userData.ground = true;
  worldRoot.add(ground);

  const grid = new THREE.GridHelper(62, 31, 0x31403b, 0x25302d);
  grid.position.y = -0.035;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  worldRoot.add(grid);

  buildRoad();
  buildPads();
  buildSpawnGate();
  buildBase();
  buildCityEdge();
  buildAtmosphere();
}

function buildRoad() {
  const roadMat = material(0x292f30, { roughness: 0.97, metalness: 0 });
  const edgeMat = material(0x596260, { roughness: 0.9, metalness: 0 });
  const dashMat = material(0xb7ad6e, { emissive: 0x413d1c, emissiveIntensity: 0.22 });
  const width = 3.7;

  for (const segment of pathSegments) {
    const mid = segment.start.clone().lerp(segment.end, 0.5);
    const dx = segment.end.x - segment.start.x;
    const dz = segment.end.z - segment.start.z;
    const angle = Math.atan2(dx, dz);

    const road = mesh(new THREE.BoxGeometry(width, 0.13, segment.length + 0.35), roadMat, false, true);
    road.position.set(mid.x, 0, mid.z);
    road.rotation.y = angle;
    worldRoot.add(road);

    for (const side of [-1, 1]) {
      const offsetX = Math.cos(angle) * side * (width / 2 + 0.06);
      const offsetZ = -Math.sin(angle) * side * (width / 2 + 0.06);
      const edge = mesh(new THREE.BoxGeometry(0.12, 0.12, segment.length + 0.3), edgeMat, false, true);
      edge.position.set(mid.x + offsetX, 0.045, mid.z + offsetZ);
      edge.rotation.y = angle;
      worldRoot.add(edge);
    }

    const dashCount = Math.floor(segment.length / 2.5);
    for (let j = 0; j < dashCount; j += 1) {
      const along = (j + 0.5) / dashCount;
      const p = segment.start.clone().lerp(segment.end, along);
      const dash = mesh(new THREE.BoxGeometry(0.12, 0.045, 0.86), dashMat, false, false);
      dash.position.set(p.x, 0.09, p.z);
      dash.rotation.y = angle;
      worldRoot.add(dash);
    }
  }

  for (const point of PATH_NODES.slice(1, -1)) {
    const joint = mesh(new THREE.CylinderGeometry(width / 2, width / 2, 0.13, 20), roadMat, false, true);
    joint.position.set(point.x, 0.005, point.z);
    worldRoot.add(joint);
  }
}

function buildPads() {
  const ringGeometry = new THREE.TorusGeometry(1.46, 0.055, 7, 44);
  ringGeometry.rotateX(Math.PI / 2);
  const plateGeometry = new THREE.CylinderGeometry(1.28, 1.42, 0.2, 28);

  pads = PAD_POSITIONS.map(([x, z], index) => {
    const group = new THREE.Group();
    group.position.set(x, 0.05, z);
    const plateMat = material(0x26312e, { emissive: 0x111a17, emissiveIntensity: 0.2 });
    const plate = mesh(plateGeometry, plateMat, false, true);
    const ringMat = material(0x65716e, { emissive: 0x1a2522, emissiveIntensity: 0.25 });
    const ring = mesh(ringGeometry, ringMat, false, false);
    ring.position.y = 0.13;

    const core = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.225, 16), material(0x35423d), false, true);
    core.position.y = 0.03;
    group.add(plate, ring, core);
    worldRoot.add(group);

    const pad = { index, group, plate, plateMat, ring, ringMat, occupant: null, phase: Math.random() * Math.PI * 2 };
    plate.userData.pad = pad;
    ring.userData.pad = pad;
    core.userData.pad = pad;
    return pad;
  });
}

function buildSpawnGate() {
  const group = new THREE.Group();
  group.position.copy(PATH_NODES[0]);
  const dark = material(0x252d2e, { metalness: 0.52, roughness: 0.56 });
  const acid = material(0x9bd331, { emissive: 0x79b91d, emissiveIntensity: 1.7 });
  addBox(group, [0.7, 5.2, 0.8], [-0.2, 2.5, -2.6], dark);
  addBox(group, [0.7, 5.2, 0.8], [-0.2, 2.5, 2.6], dark);
  addBox(group, [0.75, 0.6, 5.9], [-0.2, 5, 0], dark);
  addBox(group, [0.12, 3.9, 0.32], [-0.64, 2.5, -2.1], acid);
  addBox(group, [0.12, 3.9, 0.32], [-0.64, 2.5, 2.1], acid);
  worldRoot.add(group);

  spawnBeacon = new THREE.PointLight(0xa8e53a, 4.2, 10, 2);
  spawnBeacon.position.set(PATH_NODES[0].x + 1, 3.2, PATH_NODES[0].z);
  worldRoot.add(spawnBeacon);
}

function buildBase() {
  const end = PATH_NODES[PATH_NODES.length - 1];
  const group = new THREE.Group();
  group.position.copy(end);
  const concrete = material(0x384244, { metalness: 0.2, roughness: 0.78 });
  const dark = material(0x171d1f, { metalness: 0.65, roughness: 0.4 });
  const red = material(0xff4d55, { emissive: 0xbb1520, emissiveIntensity: 1.4 });
  addBox(group, [5.8, 0.7, 7.5], [2.1, 0.25, 0], concrete);
  addBox(group, [4.3, 3.3, 6.1], [2.7, 1.95, 0], dark);
  addBox(group, [0.45, 3.9, 0.45], [0.45, 2.35, -2.35], red);
  addBox(group, [0.45, 3.9, 0.45], [0.45, 2.35, 2.35], red);
  const roof = mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.55, 6), concrete);
  roof.position.set(2.7, 3.85, 0);
  roof.rotation.y = Math.PI / 6;
  group.add(roof);
  worldRoot.add(group);

  baseBeacon = new THREE.PointLight(0xff3446, 4, 12, 2);
  baseBeacon.position.set(end.x + 0.2, 3.5, end.z);
  worldRoot.add(baseBeacon);
}

function buildCityEdge() {
  const buildingSpecs = [
    [-24, 11, 6.4, 5.5, 8.5], [-16, 14.2, 5.5, 4.6, 5.2], [-7.7, 15, 6.3, 4.2, 7.2],
    [4.8, 15.4, 7.2, 4, 4.4], [16.4, 14.2, 6.1, 5.1, 7.8], [25.2, 11.2, 5.6, 5.8, 10.5],
    [-25.2, -15.2, 5.4, 4.8, 6.2], [-14.8, -15.8, 6.6, 4.1, 4.7], [-3.2, -16.1, 6.4, 4.2, 7.5],
    [9.5, -16, 7.5, 4.4, 5.5], [29.2, -15, 5, 6, 8.8],
  ];
  const wallColors = [0x222b2d, 0x293234, 0x1d2729];
  const windowMat = material(0x8aa85a, { emissive: 0x5c7b34, emissiveIntensity: 0.6, roughness: 0.5 });

  buildingSpecs.forEach(([x, z, w, d, h], index) => {
    const group = new THREE.Group();
    const wall = material(wallColors[index % wallColors.length], { roughness: 0.88, metalness: 0.14 });
    addBox(group, [w, h, d], [0, h / 2 - 0.05, 0], wall);
    addBox(group, [w + 0.3, 0.32, d + 0.3], [0, h, 0], material(0x111719, { metalness: 0.55 }));

    const rows = Math.max(1, Math.floor(h / 2.2));
    const cols = Math.max(2, Math.floor(w / 1.7));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if ((row * 3 + col + index) % 4 === 0) continue;
        const windowMesh = mesh(new THREE.PlaneGeometry(0.52, 0.62), windowMat, false, false);
        windowMesh.position.set(-w / 2 + 0.9 + col * ((w - 1.8) / Math.max(cols - 1, 1)), 1.2 + row * 1.8, d / 2 + 0.006);
        group.add(windowMesh);
      }
    }
    group.position.set(x, 0, z);
    worldRoot.add(group);
  });

  const crateMat = material(0x554d38, { roughness: 0.88 });
  [[-22, 3], [-9, -12], [4, -10.5], [14, 9], [26, 5.2]].forEach(([x, z], index) => {
    const crate = addBox(worldRoot, [1.3, 1.3, 1.3], [x, 0.57, z], crateMat, index * 0.41);
    const bandMat = material(0x272d2c, { metalness: 0.55 });
    const band = addBox(worldRoot, [1.38, 0.18, 1.38], [x, 0.57, z], bandMat, index * 0.41);
    crate.userData.decoration = true;
    band.userData.decoration = true;
  });

  buildStreetLight(-11, 5.5, Math.PI);
  buildStreetLight(8, -1.5, 0);
  buildStreetLight(19, -5.2, Math.PI / 2);
}

function buildStreetLight(x, z, rotation) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const metal = material(0x303a3b, { metalness: 0.72, roughness: 0.42 });
  const glow = material(0xbce963, { emissive: 0x9bd13c, emissiveIntensity: 1.9 });
  const pole = mesh(new THREE.CylinderGeometry(0.09, 0.13, 4.4, 10), metal);
  pole.position.y = 2.2;
  group.add(pole);
  addBox(group, [0.16, 0.16, 1.2], [0, 4.33, -0.52], metal);
  addBox(group, [0.48, 0.18, 0.62], [0, 4.2, -1.07], glow);
  worldRoot.add(group);
}

function buildAtmosphere() {
  const count = 360;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 66;
    positions[i * 3 + 1] = Math.random() * 14 + 0.3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 47;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pointsMat = new THREE.PointsMaterial({ color: 0xa0b4a0, size: 0.055, transparent: true, opacity: 0.32, depthWrite: false });
  dustField = new THREE.Points(geometry, pointsMat);
  worldRoot.add(dustField);
}

function bindEvents() {
  document.querySelectorAll('.mode-card').forEach((button) => {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  });

  document.querySelectorAll('.tower-card').forEach((button) => {
    button.addEventListener('click', () => selectBuildType(button.dataset.tower));
  });

  dom.startWave.addEventListener('click', startNextWave);
  dom.speed.addEventListener('click', cycleSpeed);
  dom.pause.addEventListener('click', togglePause);
  $('#menuBtn').addEventListener('click', returnToMenu);
  $('#rotateLeftBtn').addEventListener('click', () => rotateCamera(-Math.PI / 6));
  $('#rotateRightBtn').addEventListener('click', () => rotateCamera(Math.PI / 6));
  $('#homeCameraBtn').addEventListener('click', resetCamera);
  $('#closeTowerPanel').addEventListener('click', clearTowerSelection);
  dom.upgrade.addEventListener('click', upgradeSelectedTower);
  dom.sell.addEventListener('click', sellSelectedTower);
  $('#replayBtn').addEventListener('click', () => startGame(game.modeKey));
  $('#modesBtn').addEventListener('click', returnToMenu);

  let pointerStart = null;
  dom.canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  dom.canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const elapsed = performance.now() - pointerStart.time;
    pointerStart = null;
    if (distance < 9 && elapsed < 550) handleBattlefieldTap(event);
  });
  dom.canvas.addEventListener('pointermove', handlePointerHover);
  dom.canvas.addEventListener('pointerleave', () => setHoveredPad(null));

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (event) => {
    if (!game.active || game.finished) return;
    if (event.key === '1') selectBuildType('ranger');
    if (event.key === '2') selectBuildType('cannon');
    if (event.key === '3') selectBuildType('frost');
    if (event.key === ' ') {
      event.preventDefault();
      togglePause();
    }
    if (event.key === 'Enter' && !game.waveActive) startNextWave();
    if (event.key === 'Escape') clearTowerSelection();
  });
}

function startGame(modeKey) {
  const config = MODES[modeKey];
  if (!config) return;

  clearDynamicObjects();
  Object.assign(game, {
    active: true,
    finished: false,
    modeKey,
    config,
    cash: config.cash,
    lives: config.lives,
    wave: 0,
    waveActive: false,
    spawnQueue: [],
    spawnTimer: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    effects: [],
    selectedBuildType: 'ranger',
    selectedTower: null,
    kills: 0,
    paused: false,
    speed: 1,
    time: 0,
    endCountdown: 0,
  });

  dom.menu.classList.add('hidden');
  dom.end.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  controls.autoRotate = false;
  resetCamera();
  selectBuildType('ranger', false);
  setWaveReady();
  updateUI();
  showToast('Select a tower, then tap a glowing build pad.');
}

function returnToMenu() {
  game.active = false;
  game.finished = false;
  game.paused = false;
  game.waveActive = false;
  clearDynamicObjects();
  dom.hud.classList.add('hidden');
  dom.end.classList.add('hidden');
  dom.menu.classList.remove('hidden');
  controls.autoRotate = true;
  resetCamera();
}

function clearDynamicObjects() {
  clearTowerSelection();
  while (dynamicRoot.children.length) disposeObject(dynamicRoot.children[0]);
  while (effectsRoot.children.length) disposeObject(effectsRoot.children[0]);
  pads.forEach((pad) => { pad.occupant = null; });
  game.enemies.length = 0;
  game.towers.length = 0;
  game.projectiles.length = 0;
  game.effects.length = 0;
  updatePadVisuals();
}

function disposeObject(object) {
  if (object.parent) object.parent.remove(object);
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => mat.dispose());
    }
  });
}

function startNextWave() {
  if (!game.active || game.finished || game.paused || game.waveActive || game.wave >= game.config.waves) return;
  game.wave += 1;
  game.waveActive = true;
  game.spawnQueue = buildWave(game.wave);
  game.spawnTimer = 0.25;
  game.spawnInterval = Math.max(0.34, 0.76 - game.wave * 0.018 - (game.modeKey === 'hard' ? 0.06 : 0));
  dom.startWave.disabled = true;
  dom.startWave.innerHTML = 'WAVE ACTIVE';
  dom.waveStateLabel.textContent = game.wave === game.config.waves ? 'FINAL WAVE' : 'INCOMING';
  dom.waveStateText.textContent = `${game.spawnQueue.length} hostiles`;
  dom.objective.textContent = game.wave === game.config.waves ? 'Stop the outbreak leader' : `Defend the base · Wave ${game.wave}`;
  updateUI();
}

function buildWave(wave) {
  const extra = game.modeKey === 'hard' ? 3 : game.modeKey === 'intermediate' ? 1 : 0;
  const count = Math.round(4.5 + wave * 1.65 + extra);
  const result = [];

  for (let i = 0; i < count; i += 1) {
    const roll = (i * 31 + wave * 17 + (i % 3) * 11) % 100;
    let type = 'walker';
    if (wave >= 9 && roll < Math.min(18, wave)) type = 'armored';
    else if (wave >= 4 && roll < 35) type = 'brute';
    else if (wave >= 2 && roll < 62) type = 'runner';
    result.push(type);
  }

  if (game.modeKey === 'hard' && wave >= 10 && wave % 5 === 0 && wave < game.config.waves) {
    result.splice(Math.floor(result.length / 2), 0, 'armored', 'brute');
  }
  if (wave === game.config.waves) result.push('titan');
  return result;
}

function setWaveReady() {
  dom.startWave.disabled = false;
  dom.startWave.innerHTML = `START WAVE <span>→</span>`;
  dom.waveStateLabel.textContent = game.wave === 0 ? 'READY' : 'NEXT';
  dom.waveStateText.textContent = `Wave ${game.wave + 1}`;
  dom.objective.textContent = game.wave === 0 ? 'Prepare your defenses' : 'Reinforce before the next wave';
}

function finishWave() {
  game.waveActive = false;
  if (game.wave >= game.config.waves) {
    game.endCountdown = 1.25;
    dom.objective.textContent = 'Sector secured';
    dom.waveStateLabel.textContent = 'CLEAR';
    dom.waveStateText.textContent = 'Outbreak stopped';
    return;
  }

  const bonus = Math.round((game.config.completionBonus + game.wave * 11) * game.config.rewardScale);
  game.cash += bonus;
  setWaveReady();
  showToast(`Wave ${game.wave} cleared · +$${bonus}`);
  updateUI();
}

function spawnEnemy(typeKey) {
  const base = ENEMY_TYPES[typeKey];
  if (!base) return;
  const waveGrowth = 1 + (game.wave - 1) * 0.13;
  const finalBoost = typeKey === 'titan' ? 1 + game.wave * 0.018 : 1;
  const stats = {
    ...base,
    health: Math.round(base.health * game.config.healthScale * waveGrowth * finalBoost),
    speed: base.speed * game.config.speedScale * (1 + Math.min(game.wave, 14) * 0.011),
    reward: Math.max(1, Math.round(base.reward * game.config.rewardScale)),
  };

  const model = createZombieModel(typeKey, stats);
  model.group.position.copy(PATH_NODES[0]);
  dynamicRoot.add(model.group);

  const enemy = {
    type: typeKey,
    stats,
    group: model.group,
    body: model.body,
    head: model.head,
    leftLeg: model.leftLeg,
    rightLeg: model.rightLeg,
    leftArm: model.leftArm,
    rightArm: model.rightArm,
    healthBar: model.healthBar,
    health: stats.health,
    distance: 0,
    alive: true,
    reachedBase: false,
    slowUntil: 0,
    slowFactor: 1,
    phase: Math.random() * Math.PI * 2,
  };
  model.group.userData.enemy = enemy;
  game.enemies.push(enemy);
}

function createZombieModel(typeKey, stats) {
  const group = new THREE.Group();
  const scale = stats.scale;
  group.scale.setScalar(scale);

  const skin = material(stats.color, { roughness: 0.92, metalness: 0 });
  const shirtColor = typeKey === 'titan' ? 0x3f3532 : typeKey === 'armored' ? 0x343e3e : 0x4d3b35;
  const shirt = material(shirtColor, { roughness: 0.9, metalness: typeKey === 'armored' ? 0.45 : 0.04 });
  const pants = material(typeKey === 'runner' ? 0x293442 : 0x222a31, { roughness: 0.92 });
  const eyeMat = material(0xd5ff5e, { emissive: 0xaada24, emissiveIntensity: 2.25 });

  const body = new THREE.Group();
  group.add(body);

  const torso = mesh(new THREE.BoxGeometry(typeKey === 'titan' ? 1.1 : 0.78, 1.15, 0.48), shirt);
  torso.position.y = 1.55;
  torso.rotation.z = typeKey === 'runner' ? -0.1 : 0.04;
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0.02, 2.45, -0.04);
  const skull = mesh(new THREE.BoxGeometry(0.58, 0.58, 0.57), skin);
  skull.rotation.z = -0.07;
  head.add(skull);
  const eyeGeometry = new THREE.BoxGeometry(0.11, 0.075, 0.035);
  for (const x of [-0.15, 0.15]) {
    const eye = mesh(eyeGeometry, eyeMat, false, false);
    eye.position.set(x, 0.08, -0.3);
    head.add(eye);
  }
  body.add(head);

  function limb(x, y, leg, side) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limbMesh = mesh(
      new THREE.BoxGeometry(leg ? 0.25 : 0.22, leg ? 1.1 : 1.02, leg ? 0.3 : 0.24),
      leg ? pants : skin,
    );
    limbMesh.position.y = leg ? -0.5 : -0.44;
    if (!leg) limbMesh.rotation.z = side * 0.08;
    pivot.add(limbMesh);
    body.add(pivot);
    return pivot;
  }

  const leftLeg = limb(-0.22, 1.05, true, -1);
  const rightLeg = limb(0.22, 1.05, true, 1);
  const leftArm = limb(-0.53, 1.98, false, -1);
  const rightArm = limb(0.53, 1.98, false, 1);
  leftArm.rotation.x = -0.7;
  rightArm.rotation.x = -0.7;

  if (typeKey === 'armored' || typeKey === 'titan') {
    const armor = material(typeKey === 'titan' ? 0x4b3c32 : 0x566263, { metalness: 0.72, roughness: 0.38 });
    const chest = mesh(new THREE.BoxGeometry(typeKey === 'titan' ? 1.22 : 0.91, 0.72, 0.58), armor);
    chest.position.set(0, 1.7, -0.04);
    body.add(chest);
    for (const x of [-0.53, 0.53]) {
      const shoulder = mesh(new THREE.BoxGeometry(0.35, 0.28, 0.5), armor);
      shoulder.position.set(x, 2.02, 0);
      body.add(shoulder);
    }
  }

  if (typeKey === 'titan') {
    const warningMat = material(0xff4d55, { emissive: 0xb51c27, emissiveIntensity: 1.4 });
    const warning = mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 24), warningMat);
    warning.position.set(0, 1.72, -0.32);
    group.add(warning);
  }

  const healthBar = createHealthBar(typeKey === 'titan' ? 1.75 : 1.35, typeKey === 'titan' ? 3.7 : 3.08);
  group.add(healthBar.group);
  return { group, body, head, leftLeg, rightLeg, leftArm, rightArm, healthBar };
}

function createHealthBar(width, y) {
  const group = new THREE.Group();
  group.position.y = y;
  const background = mesh(new THREE.PlaneGeometry(width + 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0x111414, transparent: true, opacity: 0.88 }), false, false);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xb8f43d, transparent: true, opacity: 0.96 });
  const fill = mesh(new THREE.PlaneGeometry(width, 0.085), fillMat, false, false);
  fill.position.z = 0.006;
  group.add(background, fill);
  return { group, fill, fillMat, width };
}

function updateEnemies(dt) {
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const slowed = game.time < enemy.slowUntil;
    const speed = enemy.stats.speed * (slowed ? enemy.slowFactor : 1);
    enemy.distance += speed * dt;

    if (enemy.distance >= pathLength) {
      enemy.alive = false;
      enemy.reachedBase = true;
      game.lives = Math.max(0, game.lives - enemy.stats.damage);
      disposeObject(enemy.group);
      flashBaseDamage();
      updateUI();
      if (game.lives <= 0) endGame(false);
      continue;
    }

    const { position, direction } = samplePath(enemy.distance);
    enemy.group.position.set(position.x, 0, position.z);
    enemy.group.rotation.y = Math.atan2(-direction.x, -direction.z);

    const gait = game.time * speed * 4.5 + enemy.phase;
    const stride = Math.sin(gait) * (enemy.type === 'runner' ? 0.58 : 0.38);
    enemy.leftLeg.rotation.x = stride;
    enemy.rightLeg.rotation.x = -stride;
    enemy.leftArm.rotation.x = -0.62 - stride * 0.65;
    enemy.rightArm.rotation.x = -0.62 + stride * 0.65;
    enemy.body.position.y = Math.abs(Math.sin(gait * 2)) * 0.035;
    enemy.head.rotation.y = Math.sin(gait * 0.47) * 0.12;

    const healthRatio = THREE.MathUtils.clamp(enemy.health / enemy.stats.health, 0, 1);
    enemy.healthBar.fill.scale.x = healthRatio;
    enemy.healthBar.fill.position.x = -(1 - healthRatio) * enemy.healthBar.width / 2;
    enemy.healthBar.fillMat.color.setHex(healthRatio < 0.28 ? 0xff4d55 : healthRatio < 0.6 ? 0xffac3e : 0xb8f43d);
    enemy.group.getWorldQuaternion(tempQuat);
    enemy.healthBar.group.quaternion.copy(tempQuat.invert().multiply(camera.quaternion));
  }

  game.enemies = game.enemies.filter((enemy) => enemy.alive);
}

function samplePath(distance) {
  const clamped = THREE.MathUtils.clamp(distance, 0, pathLength);
  let segment = pathSegments[pathSegments.length - 1];
  for (const candidate of pathSegments) {
    if (clamped <= candidate.to) {
      segment = candidate;
      break;
    }
  }
  const alpha = (clamped - segment.from) / segment.length;
  return {
    position: segment.start.clone().lerp(segment.end, alpha),
    direction: segment.end.clone().sub(segment.start).normalize(),
  };
}

function selectBuildType(typeKey, announce = true) {
  if (!TOWER_TYPES[typeKey]) return;
  game.selectedBuildType = typeKey;
  clearTowerSelection();
  document.querySelectorAll('.tower-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.tower === typeKey);
  });
  updatePadVisuals();
  if (announce) showToast(`${TOWER_TYPES[typeKey].name} selected · Tap an empty pad`);
}

function buildTower(pad) {
  const definition = TOWER_TYPES[game.selectedBuildType];
  if (!definition || pad.occupant || !game.active || game.finished) return;
  if (game.cash < definition.cost) {
    showToast(`Need $${definition.cost - game.cash} more for ${definition.name}`, true);
    pulsePad(pad, 0xff4d55);
    return;
  }

  const tower = createTowerModel(game.selectedBuildType, pad);
  game.cash -= definition.cost;
  game.towers.push(tower);
  pad.occupant = tower;
  dynamicRoot.add(tower.group);
  pulsePad(pad, definition.color);
  selectPlacedTower(tower);
  updateUI();
}

function createTowerModel(typeKey, pad) {
  const def = TOWER_TYPES[typeKey];
  const group = new THREE.Group();
  group.position.copy(pad.group.position);
  group.position.y = 0.22;
  group.userData.tower = null;

  const baseMat = material(0x4c5955, { metalness: 0.62, roughness: 0.38 });
  const darkMat = material(0x1a2222, { metalness: 0.7, roughness: 0.31 });
  const accentMat = material(def.color, { emissive: def.color, emissiveIntensity: 1.18, metalness: 0.15, roughness: 0.42 });

  const base = mesh(new THREE.CylinderGeometry(0.86, 1.04, 0.42, 12), darkMat);
  base.position.y = 0.22;
  group.add(base);
  const upperBase = mesh(new THREE.CylinderGeometry(0.66, 0.78, 0.35, 10), baseMat);
  upperBase.position.y = 0.56;
  group.add(upperBase);

  const turret = new THREE.Group();
  let barrelTip = new THREE.Object3D();
  let recoilPart = null;

  if (typeKey === 'ranger') {
    turret.position.y = 1.25;
    const column = mesh(new THREE.CylinderGeometry(0.35, 0.47, 1.05, 10), baseMat);
    column.position.y = -0.28;
    turret.add(column);
    const head = mesh(new THREE.BoxGeometry(0.85, 0.56, 0.95), darkMat);
    turret.add(head);
    recoilPart = mesh(new THREE.BoxGeometry(0.2, 0.2, 1.5), accentMat);
    recoilPart.position.set(0, 0.08, -0.88);
    turret.add(recoilPart);
    barrelTip.position.set(0, 0.08, -1.67);
    turret.add(barrelTip);
    for (const x of [-0.31, 0.31]) {
      const sight = mesh(new THREE.BoxGeometry(0.11, 0.11, 0.4), accentMat);
      sight.position.set(x, 0.34, -0.1);
      turret.add(sight);
    }
  } else if (typeKey === 'cannon') {
    turret.position.y = 1.1;
    const column = mesh(new THREE.CylinderGeometry(0.51, 0.65, 0.72, 10), baseMat);
    column.position.y = -0.28;
    turret.add(column);
    const head = mesh(new THREE.BoxGeometry(1.16, 0.72, 1.06), darkMat);
    turret.add(head);
    recoilPart = mesh(new THREE.CylinderGeometry(0.23, 0.3, 1.72, 12), accentMat);
    recoilPart.rotation.x = Math.PI / 2;
    recoilPart.position.set(0, 0.1, -1.05);
    turret.add(recoilPart);
    barrelTip.position.set(0, 0.1, -1.92);
    turret.add(barrelTip);
  } else {
    turret.position.y = 1.15;
    const column = mesh(new THREE.CylinderGeometry(0.31, 0.54, 1.1, 8), baseMat);
    column.position.y = -0.3;
    turret.add(column);
    const cage = mesh(new THREE.TorusGeometry(0.52, 0.09, 8, 22), darkMat);
    cage.rotation.x = Math.PI / 2;
    turret.add(cage);
    const crystal = mesh(new THREE.OctahedronGeometry(0.48, 0), accentMat);
    crystal.rotation.y = Math.PI / 4;
    turret.add(crystal);
    recoilPart = crystal;
    barrelTip.position.set(0, 0, -0.48);
    turret.add(barrelTip);
  }
  group.add(turret);

  const tower = {
    type: typeKey,
    group,
    turret,
    barrelTip,
    recoilPart,
    recoil: 0,
    pad,
    level: 1,
    cooldown: Math.random() * 0.25,
    invested: def.cost,
    stats: getTowerStats(typeKey, 1),
  };
  group.userData.tower = tower;
  group.traverse((child) => { child.userData.tower = tower; });
  return tower;
}

function getTowerStats(typeKey, level) {
  const base = TOWER_TYPES[typeKey];
  const step = level - 1;
  return {
    damage: Math.round(base.damage * (1 + step * 0.72)),
    range: Number((base.range * (1 + step * 0.09)).toFixed(1)),
    rate: Number((base.rate * Math.pow(0.84, step)).toFixed(2)),
    projectileSpeed: base.projectileSpeed,
    splash: base.splash ? base.splash * (1 + step * 0.12) : 0,
    slow: base.slow ? Math.max(0.38, base.slow - step * 0.06) : 0,
    slowTime: base.slowTime ? base.slowTime + step * 0.45 : 0,
  };
}

function updateTowers(dt) {
  for (const tower of game.towers) {
    tower.cooldown -= dt;
    tower.recoil = Math.max(0, tower.recoil - dt * 6.5);

    if (tower.type === 'frost') {
      tower.recoilPart.rotation.y += dt * (game.waveActive ? 2.2 : 0.7);
      tower.recoilPart.scale.setScalar(1 + Math.sin(game.time * 4 + tower.pad.index) * 0.07);
    } else if (tower.recoilPart) {
      const kick = Math.sin(tower.recoil * Math.PI) * 0.2;
      const restingZ = tower.type === 'cannon' ? -1.05 : -0.88;
      tower.recoilPart.position.z += (restingZ - tower.recoilPart.position.z + kick) * Math.min(1, dt * 16);
    }

    const target = acquireTarget(tower);
    if (!target) continue;
    tempA.copy(target.group.position);
    tempA.y = tower.turret.getWorldPosition(tempB).y;
    tower.turret.lookAt(tempA);

    if (tower.cooldown <= 0) {
      fireTower(tower, target);
      tower.cooldown = tower.stats.rate;
      tower.recoil = 1;
    }
  }
}

function acquireTarget(tower) {
  let target = null;
  let furthest = -1;
  const towerPosition = tower.group.position;
  const rangeSq = tower.stats.range * tower.stats.range;
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.group.position.x - towerPosition.x;
    const dz = enemy.group.position.z - towerPosition.z;
    if (dx * dx + dz * dz <= rangeSq && enemy.distance > furthest) {
      target = enemy;
      furthest = enemy.distance;
    }
  }
  return target;
}

function fireTower(tower, target) {
  const def = TOWER_TYPES[tower.type];
  const projectileMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.95 });
  const radius = tower.type === 'cannon' ? 0.2 : tower.type === 'frost' ? 0.14 : 0.1;
  const projectileMesh = mesh(new THREE.SphereGeometry(radius, 9, 7), projectileMat, false, false);
  const start = tower.barrelTip.getWorldPosition(new THREE.Vector3());
  projectileMesh.position.copy(start);
  effectsRoot.add(projectileMesh);

  const distance = start.distanceTo(target.group.position);
  game.projectiles.push({
    mesh: projectileMesh,
    start,
    target,
    tower,
    elapsed: 0,
    duration: Math.max(0.08, distance / tower.stats.projectileSpeed),
    arc: tower.type === 'cannon' ? Math.min(2.5, distance * 0.12) : 0,
  });
}

function updateProjectiles(dt) {
  for (let i = game.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = game.projectiles[i];
    if (!projectile.target.alive) {
      disposeObject(projectile.mesh);
      game.projectiles.splice(i, 1);
      continue;
    }

    projectile.elapsed += dt;
    const alpha = THREE.MathUtils.clamp(projectile.elapsed / projectile.duration, 0, 1);
    tempA.copy(projectile.target.group.position);
    tempA.y = projectile.target.type === 'titan' ? 2.4 : 1.55;
    projectile.mesh.position.lerpVectors(projectile.start, tempA, alpha);
    projectile.mesh.position.y += Math.sin(alpha * Math.PI) * projectile.arc;
    projectile.mesh.scale.setScalar(1 + Math.sin(alpha * Math.PI) * 0.3);

    if (alpha >= 1) {
      resolveHit(projectile);
      disposeObject(projectile.mesh);
      game.projectiles.splice(i, 1);
    }
  }
}

function resolveHit(projectile) {
  const { tower, target } = projectile;
  if (!target.alive) return;
  if (tower.type === 'cannon') {
    const impact = target.group.position.clone();
    for (const enemy of game.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(impact) <= tower.stats.splash) {
        const distance = enemy.group.position.distanceTo(impact);
        const falloff = 1 - (distance / tower.stats.splash) * 0.35;
        damageEnemy(enemy, tower.stats.damage * falloff);
      }
    }
    createImpact(impact, TOWER_TYPES.cannon.color, tower.stats.splash * 0.52);
  } else if (tower.type === 'frost') {
    damageEnemy(target, tower.stats.damage);
    target.slowFactor = tower.stats.slow;
    target.slowUntil = Math.max(target.slowUntil, game.time + tower.stats.slowTime);
    createImpact(target.group.position, TOWER_TYPES.frost.color, 0.9);
  } else {
    damageEnemy(target, tower.stats.damage);
    createImpact(target.group.position, TOWER_TYPES.ranger.color, 0.45);
  }
}

function damageEnemy(enemy, amount) {
  if (!enemy.alive) return;
  enemy.health -= amount;
  if (enemy.health > 0) return;

  enemy.alive = false;
  game.cash += enemy.stats.reward;
  game.kills += 1;
  createDefeatEffect(enemy.group.position, enemy.stats.color, enemy.stats.scale);
  disposeObject(enemy.group);
  if (game.waveActive) dom.waveStateText.textContent = `${game.spawnQueue.length + game.enemies.filter((item) => item.alive).length} remaining`;
  updateUI();
}

function createImpact(position, color, size) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const ring = mesh(new THREE.RingGeometry(0.18, 0.3, 24), mat, false, false);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.15, position.z);
  effectsRoot.add(ring);
  game.effects.push({ object: ring, age: 0, life: 0.32, startScale: size * 0.45, endScale: size });
}

function createDefeatEffect(position, color, scale) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, wireframe: true });
  const shell = mesh(new THREE.IcosahedronGeometry(0.65 * scale, 1), mat, false, false);
  shell.position.set(position.x, 1.2 * scale, position.z);
  effectsRoot.add(shell);
  game.effects.push({ object: shell, age: 0, life: 0.45, startScale: 0.7, endScale: 1.9 });
}

function updateEffects(dt) {
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    const effect = game.effects[i];
    effect.age += dt;
    const alpha = THREE.MathUtils.clamp(effect.age / effect.life, 0, 1);
    const scale = THREE.MathUtils.lerp(effect.startScale, effect.endScale, alpha);
    effect.object.scale.setScalar(scale);
    effect.object.material.opacity = (1 - alpha) * 0.7;
    effect.object.rotation.y += dt * 4;
    if (alpha >= 1) {
      disposeObject(effect.object);
      game.effects.splice(i, 1);
    }
  }
}

function selectPlacedTower(tower) {
  game.selectedTower = tower;
  dom.towerPanel.classList.remove('hidden');
  createRangeIndicator(tower);
  updateTowerPanel();
  updatePadVisuals();
}

function clearTowerSelection() {
  game.selectedTower = null;
  dom.towerPanel.classList.add('hidden');
  if (rangeIndicator) {
    scene.remove(rangeIndicator);
    rangeIndicator.geometry.dispose();
    rangeIndicator.material.dispose();
    rangeIndicator = null;
  }
  updatePadVisuals();
}

function createRangeIndicator(tower) {
  if (rangeIndicator) {
    scene.remove(rangeIndicator);
    rangeIndicator.geometry.dispose();
    rangeIndicator.material.dispose();
  }
  const color = TOWER_TYPES[tower.type].color;
  const geometry = new THREE.RingGeometry(tower.stats.range - 0.045, tower.stats.range + 0.045, 96);
  const rangeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false });
  rangeIndicator = new THREE.Mesh(geometry, rangeMat);
  rangeIndicator.rotation.x = -Math.PI / 2;
  rangeIndicator.position.set(tower.group.position.x, 0.17, tower.group.position.z);
  scene.add(rangeIndicator);
}

function updateTowerPanel() {
  const tower = game.selectedTower;
  if (!tower) return;
  const def = TOWER_TYPES[tower.type];
  const nextCost = def.upgradeCosts[tower.level - 1];
  dom.towerIcon.textContent = def.icon;
  dom.towerIcon.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
  dom.towerLevel.textContent = `LEVEL ${tower.level}`;
  dom.towerName.textContent = def.name;
  dom.towerDamage.textContent = tower.stats.damage;
  dom.towerRange.textContent = tower.stats.range.toFixed(1);
  dom.towerRate.textContent = `${tower.stats.rate.toFixed(2)}s`;
  dom.sellValue.textContent = `+$${Math.floor(tower.invested * 0.6)}`;

  if (tower.level >= 3) {
    dom.upgrade.disabled = true;
    dom.upgrade.innerHTML = '<span>MAX LEVEL</span><strong>—</strong>';
  } else {
    dom.upgrade.disabled = game.cash < nextCost;
    dom.upgrade.innerHTML = `<span>UPGRADE</span><strong>$${nextCost}</strong>`;
  }
}

function upgradeSelectedTower() {
  const tower = game.selectedTower;
  if (!tower || tower.level >= 3) return;
  const def = TOWER_TYPES[tower.type];
  const cost = def.upgradeCosts[tower.level - 1];
  if (game.cash < cost) {
    showToast(`Need $${cost - game.cash} more to upgrade`, true);
    return;
  }
  game.cash -= cost;
  tower.invested += cost;
  tower.level += 1;
  tower.stats = getTowerStats(tower.type, tower.level);
  addUpgradeDetails(tower);
  createRangeIndicator(tower);
  updateTowerPanel();
  updateUI();
  showToast(`${def.name} upgraded to level ${tower.level}`);
}

function addUpgradeDetails(tower) {
  const def = TOWER_TYPES[tower.type];
  const upgradeMat = material(def.color, { emissive: def.color, emissiveIntensity: 1.5, metalness: 0.2 });
  const ring = mesh(new THREE.TorusGeometry(0.78 + tower.level * 0.05, 0.045, 7, 28), upgradeMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.43 + tower.level * 0.1;
  tower.group.add(ring);
  tower.group.scale.setScalar(1 + (tower.level - 1) * 0.035);
}

function sellSelectedTower() {
  const tower = game.selectedTower;
  if (!tower) return;
  const refund = Math.floor(tower.invested * 0.6);
  game.cash += refund;
  tower.pad.occupant = null;
  const index = game.towers.indexOf(tower);
  if (index >= 0) game.towers.splice(index, 1);
  clearTowerSelection();
  disposeObject(tower.group);
  updateUI();
  showToast(`${TOWER_TYPES[tower.type].name} sold · +$${refund}`);
}

function handleBattlefieldTap(event) {
  if (!game.active || game.finished) return;
  setRayFromEvent(event);
  const objects = [];
  pads.forEach((pad) => objects.push(pad.plate, pad.ring));
  game.towers.forEach((tower) => objects.push(tower.group));
  const hits = raycaster.intersectObjects(objects, true);
  if (!hits.length) {
    clearTowerSelection();
    return;
  }

  let object = hits[0].object;
  let tower = object.userData.tower;
  let pad = object.userData.pad;
  while (object.parent && !tower && !pad) {
    object = object.parent;
    tower = object.userData.tower;
    pad = object.userData.pad;
  }

  if (tower) selectPlacedTower(tower);
  else if (pad?.occupant) selectPlacedTower(pad.occupant);
  else if (pad) buildTower(pad);
}

function handlePointerHover(event) {
  if (!game.active || event.pointerType === 'touch') return;
  setRayFromEvent(event);
  const hits = raycaster.intersectObjects(pads.map((pad) => pad.plate), false);
  const pad = hits.length ? hits[0].object.userData.pad : null;
  setHoveredPad(pad && !pad.occupant ? pad : null);
  dom.canvas.style.cursor = pad ? 'pointer' : 'grab';
}

function setRayFromEvent(event) {
  const rect = dom.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function setHoveredPad(pad) {
  if (hoveredPad === pad) return;
  hoveredPad = pad;
  updatePadVisuals();
}

function updatePadVisuals() {
  if (!pads.length) return;
  const def = TOWER_TYPES[game.selectedBuildType] || TOWER_TYPES.ranger;
  const affordable = game.cash >= def.cost;
  for (const pad of pads) {
    const isSelected = game.selectedTower?.pad === pad;
    const isHover = hoveredPad === pad;
    let color = 0x1a2522;
    let intensity = 0.2;
    let ringColor = 0x65716e;
    let opacityScale = 1;

    if (isSelected) {
      color = TOWER_TYPES[pad.occupant.type].color;
      intensity = 1;
      ringColor = color;
    } else if (!pad.occupant && game.active) {
      color = affordable ? def.color : 0x7c3236;
      intensity = isHover ? 1.15 : 0.48;
      ringColor = affordable ? def.color : 0x9a4a4f;
    } else if (pad.occupant) {
      color = TOWER_TYPES[pad.occupant.type].color;
      intensity = 0.24;
      ringColor = 0x56615e;
      opacityScale = 0.8;
    }

    pad.plateMat.emissive.setHex(color);
    pad.plateMat.emissiveIntensity = intensity;
    pad.ringMat.color.setHex(ringColor);
    pad.ringMat.emissive.setHex(color);
    pad.ringMat.emissiveIntensity = intensity * 0.7;
    pad.ring.scale.setScalar((isHover ? 1.09 : 1) * opacityScale);
  }
}

function pulsePad(pad, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const ring = mesh(new THREE.RingGeometry(1.3, 1.48, 32), mat, false, false);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pad.group.position.x, 0.2, pad.group.position.z);
  effectsRoot.add(ring);
  game.effects.push({ object: ring, age: 0, life: 0.55, startScale: 1, endScale: 1.8 });
}

function cycleSpeed() {
  const speeds = [1, 2, 3];
  const index = speeds.indexOf(game.speed);
  game.speed = speeds[(index + 1) % speeds.length];
  dom.speed.textContent = `${game.speed}×`;
}

function togglePause() {
  if (!game.active || game.finished) return;
  game.paused = !game.paused;
  dom.pause.textContent = game.paused ? '▶' : 'Ⅱ';
  dom.pause.setAttribute('aria-label', game.paused ? 'Resume game' : 'Pause game');
  dom.objective.textContent = game.paused ? 'Game paused' : game.waveActive ? `Defend the base · Wave ${game.wave}` : 'Prepare your defenses';
  showToast(game.paused ? 'Game paused' : 'Game resumed');
}

function endGame(won) {
  if (game.finished) return;
  game.finished = true;
  game.paused = true;
  game.waveActive = false;
  dom.hud.classList.add('hidden');
  dom.end.classList.remove('hidden');
  dom.endKicker.textContent = won ? 'SECTOR SECURED' : 'BASE OVERRUN';
  dom.endKicker.style.color = won ? 'var(--acid)' : 'var(--red)';
  dom.endTitle.textContent = won ? 'YOU SURVIVED' : 'DEFENSE BROKEN';
  dom.endSummary.textContent = won ? 'The final wave has been stopped.' : `The horde broke through on wave ${game.wave}.`;
  dom.endWaves.textContent = game.wave;
  dom.endKills.textContent = game.kills.toLocaleString();
  dom.endCash.textContent = `$${game.cash.toLocaleString()}`;
}

function flashBaseDamage() {
  dom.damageFlash.classList.remove('hit');
  void dom.damageFlash.offsetWidth;
  dom.damageFlash.classList.add('hit');
  showToast('A zombie reached the base!', true);
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.toggle('error', error);
  dom.toast.classList.add('show');
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2100);
}

function updateUI() {
  dom.cash.textContent = Math.floor(game.cash).toLocaleString();
  dom.lives.textContent = game.lives;
  dom.wave.textContent = game.wave;
  dom.waveTotal.textContent = game.config.waves;
  dom.mode.textContent = game.config.name.toUpperCase();
  dom.speed.textContent = `${game.speed}×`;
  dom.pause.textContent = game.paused ? '▶' : 'Ⅱ';
  document.querySelectorAll('.tower-card').forEach((card) => {
    card.classList.toggle('unaffordable', game.cash < TOWER_TYPES[card.dataset.tower].cost);
  });
  updatePadVisuals();
  updateTowerPanel();
}

function rotateCamera(angle) {
  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function resetCamera() {
  const mobile = window.innerWidth < 700;
  camera.position.set(mobile ? 33 : 31, mobile ? 34 : 30, mobile ? 37 : 34);
  controls.target.set(0, 0.45, 0);
  controls.update();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = window.innerWidth > 620;
}

function updateGame(dt) {
  game.time += dt;

  if (game.waveActive) {
    game.spawnTimer -= dt;
    if (game.spawnQueue.length && game.spawnTimer <= 0) {
      spawnEnemy(game.spawnQueue.shift());
      game.spawnTimer = game.spawnInterval;
      dom.waveStateText.textContent = `${game.spawnQueue.length + game.enemies.length} remaining`;
    }
  }

  updateEnemies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateEffects(dt);

  if (game.waveActive && game.spawnQueue.length === 0 && game.enemies.length === 0) finishWave();
  if (game.endCountdown > 0) {
    game.endCountdown -= dt;
    if (game.endCountdown <= 0) endGame(true);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  controls.update();

  if (dustField) {
    dustField.rotation.y += rawDt * 0.012;
    dustField.position.y = Math.sin(performance.now() * 0.00018) * 0.18;
  }
  if (spawnBeacon) spawnBeacon.intensity = 3.7 + Math.sin(performance.now() * 0.003) * 0.8;
  if (baseBeacon) baseBeacon.intensity = 3.5 + Math.sin(performance.now() * 0.004 + 1) * 0.7;
  pads.forEach((pad) => {
    if (!pad.occupant && game.active) pad.ring.rotation.y += rawDt * (0.12 + (pad.index % 3) * 0.025);
  });

  if (rangeIndicator) {
    rangeIndicator.material.opacity = 0.45 + Math.sin(performance.now() * 0.004) * 0.12;
  }

  if (game.active && !game.paused && !game.finished) {
    updateGame(rawDt * game.speed);
  }
  renderer.render(scene, camera);
}

init();
