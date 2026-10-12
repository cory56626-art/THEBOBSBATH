import * as THREE from './vendor/three.module.js';
import { HOUSE, ROOMS, WALLS, FURNITURE, HIDING_SPOTS, ITEMS, EXIT, lineOfSight } from './layout.js';

// Everything in this scene is authored locally. The house and its occupants use
// the same world coordinates as the simulation, so a doorway is also a doorway
// to the NPCs, and a hiding place is where it appears to be.
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);

function random(seed) {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function woodTexture() {
  return canvasTexture(512, (ctx, size) => {
    const rnd = random(1983);
    ctx.fillStyle = '#655951';
    ctx.fillRect(0, 0, size, size);
    const plank = size / 8;
    for (let row = 0; row < 8; row++) {
      const light = 65 + rnd() * 17;
      ctx.fillStyle = `hsl(25, 13%, ${light * .6}%)`;
      ctx.fillRect(0, row * plank, size, plank - 2);
      ctx.fillStyle = '#272725';
      ctx.fillRect(0, row * plank, size, 2);
      const offset = row % 2 ? size / 3 : size * .7;
      ctx.fillRect(offset, row * plank, 2, plank);
      for (let grain = 0; grain < 25; grain++) {
        const y = row * plank + rnd() * plank;
        ctx.strokeStyle = `rgba(21, 20, 19, ${.035 + rnd() * .11})`;
        ctx.lineWidth = .3 + rnd() * .8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size / 3, y - rnd() * 4, size * .7, y + rnd() * 5, size, y);
        ctx.stroke();
      }
      for (const x of [offset + 6, offset + 18]) {
        ctx.fillStyle = '#40372e';
        ctx.fillRect(x, row * plank + 8, 2, 2);
        ctx.fillRect(x, (row + 1) * plank - 10, 2, 2);
      }
    }
  });
}

function plasterTexture() {
  return canvasTexture(256, (ctx, size) => {
    const rnd = random(14);
    ctx.fillStyle = '#b2ada1';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6500; i++) {
      ctx.fillStyle = rnd() > .5 ? 'rgba(23,26,23,.045)' : 'rgba(255,246,220,.07)';
      ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    for (let i = 0; i < 8; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.strokeStyle = 'rgba(30,32,29,.13)';
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 11);
      ctx.lineTo(x - 1, y + 22);
      ctx.lineTo(x + 4, y + 29);
      ctx.stroke();
    }
  });
}

function textileTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#c5c0b5';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 4) {
      ctx.fillStyle = i % 8 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.045)';
      ctx.fillRect(i, 0, 1, size);
      ctx.fillRect(0, i, size, 1);
    }
  });
}

function glowTexture() {
  return canvasTexture(128, (ctx, size) => {
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,255,255,.85)');
    glow.addColorStop(.2, 'rgba(255,255,255,.5)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  });
}

function labelTexture(text, color = '#cad4cb', dark = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (dark) {
    ctx.fillStyle = 'rgba(13,20,19,.75)';
    ctx.beginPath();
    ctx.roundRect(60, 13, 392, 70, 35);
    ctx.fill();
  }
  ctx.font = '500 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Merge the static shell and furniture by material, keeping the house cheap
 * enough to watch on a phone without sacrificing the authored details. */
function bakeStatic(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.transparent) return;
    const key = `${mesh.material.uuid}:${mesh.castShadow ? 1 : 0}`;
    if (!batches.has(key)) batches.set(key, { material: mesh.material, shadow: mesh.castShadow, meshes: [] });
    batches.get(key).meshes.push(mesh);
  });
  for (const batch of batches.values()) {
    if (batch.meshes.length < 2) continue;
    const geometries = batch.meshes.map(mesh => {
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      source.applyMatrix4(mesh.matrixWorld);
      return source;
    });
    const totalVertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
    const attributes = {};
    for (const name of ['position', 'normal', 'uv']) {
      const itemSize = name === 'uv' ? 2 : 3;
      const array = new Float32Array(totalVertices * itemSize);
      let offset = 0;
      for (const geometry of geometries) {
        const attribute = geometry.attributes[name];
        if (attribute) array.set(attribute.array, offset);
        offset += geometry.attributes.position.count * itemSize;
      }
      attributes[name] = new THREE.BufferAttribute(array, itemSize);
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = batch.shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const source of batch.meshes) source.parent.remove(source);
    for (const source of geometries) source.dispose();
  }
}

export class HouseRenderer {
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.cameraMode = 'overview';
    this.showPerception = false;
    this.elapsed = 0;
    this.pointers = new Map();
    this.dragDistance = 0;
    this.orbit = { angle: Math.PI * .22, elevation: .8, distance: 82 };
    this.orbitTarget = new THREE.Vector3(0, .4, 0);
    this.lookTarget = this.orbitTarget.clone();
    this.currentCamera = new THREE.Vector3(0, 0, 0);
    this.cameraNeedsSnap = true;
    this.geometryResources = new Set();
    this.materialResources = new Set();
    this.textureResources = new Set();
    this.itemMeshes = new Map();
    this.noiseMeshes = new Map();
    this.roomLabels = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.quality = 'auto';
    this.performanceFrames = 0;
    this.performanceElapsed = 0;
    this.lastRenderTimestamp = null;
    this.averageFPS = null;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      throw new Error('This device could not start the 3D view. Enable WebGL in your browser and reload.', { cause: error });
    }
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor(0x131c1b);
    this.renderer.domElement.setAttribute('aria-label', '3D view of the house, survivor and monster. Drag to orbit and scroll to zoom.');
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131c1b);
    this.scene.fog = new THREE.FogExp2(0x131c1b, .0055);
    this.camera = new THREE.PerspectiveCamera(43, 1, .1, 220);
    this.static = new THREE.Group();
    this.scene.add(this.static);
    this.createMaterials();
    this.createLighting();
    this.createHouse();
    this.createFurniture();
    bakeStatic(this.static);
    this.createCharacters();
    this.createItems();
    this.createPerception();
    this.bindControls();
    this.resize();
  }

  texture(texture) {
    this.textureResources.add(texture);
    return texture;
  }

  material(color, options = {}) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .83, metalness: .02, ...options });
    this.materialResources.add(material);
    return material;
  }

  basic(color, options = {}) {
    const material = new THREE.MeshBasicMaterial({ color, ...options });
    this.materialResources.add(material);
    return material;
  }

  createMaterials() {
    const wood = this.texture(woodTexture());
    wood.repeat.set(7, 8);
    const plaster = this.texture(plasterTexture());
    const fabric = this.texture(textileTexture());
    this.glow = this.texture(glowTexture());
    this.mat = {
      floor: this.material(0x9a8270, { map: wood, roughness: .98 }),
      foundation: this.material(0x292d2b),
      wall: this.material(0x99a192, { map: plaster, roughness: 1 }),
      trim: this.material(0x46534b),
      cap: this.material(0xd3c6ae),
      furniture: this.material(0x47392d),
      oak: this.material(0x6c5943),
      walnut: this.material(0x322b27),
      metal: this.material(0x252b29, { metalness: .55, roughness: .58 }),
      brass: this.material(0xaa8960, { metalness: .65, roughness: .47 }),
      linen: this.material(0xc7c5ae, { map: fabric }),
      blanket: this.material(0x526c65, { map: fabric }),
      blanketRust: this.material(0x6b534e, { map: fabric }),
      leather: this.material(0x596252),
      paper: this.material(0xabaa98),
      bookTeal: this.material(0x315b55),
      bookRust: this.material(0x7c5547),
      ceramic: this.material(0xd2cbb1, { roughness: .35 }),
      plant: this.material(0x486650),
      pot: this.material(0x685247),
      tile: this.material(0x6a807b),
      rug: this.material(0x586861, { map: fabric }),
      rugBorder: this.material(0xbaa781),
      dark: this.material(0x131619),
      window: this.basic(0x699b99, { transparent: true, opacity: .25, depthWrite: false }),
      light: this.basic(0xffd799),
      lampShade: this.material(0xc1af88, { emissive: 0x997341, emissiveIntensity: .25 }),
    };
  }

  mesh(geometry, material, parent, x = 0, y = 0, z = 0, shadow = false) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent, material, x, y, z, w, h, d, shadow = false) {
    const mesh = this.mesh(boxGeometry, material, parent, x, y, z, shadow);
    mesh.scale.set(w, h, d);
    return mesh;
  }

  cylinder(parent, material, x, y, z, radius, height, shadow = false) {
    const mesh = this.mesh(cylinderGeometry, material, parent, x, y, z, shadow);
    mesh.scale.set(radius, height, radius);
    return mesh;
  }

  sphere(parent, material, x, y, z, radius) {
    const mesh = this.mesh(sphereGeometry, material, parent, x, y, z);
    mesh.scale.setScalar(radius);
    return mesh;
  }

  createLighting() {
    const hemi = new THREE.HemisphereLight(0xc5e3e1, 0x4c4438, 2.15);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xd4ece3, 2.4);
    moon.position.set(-16, 36, -24);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -35;
    moon.shadow.camera.right = 35;
    moon.shadow.camera.top = 32;
    moon.shadow.camera.bottom = -32;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 90;
    moon.shadow.normalBias = .06;
    moon.shadow.bias = -.0004;
    this.scene.add(moon);
    const warm = new THREE.DirectionalLight(0xf5bd80, .5);
    warm.position.set(24, 12, 18);
    this.scene.add(warm);
    this.survivorLight = new THREE.PointLight(0x78e2c5, 2.6, 5, 2);
    this.monsterLight = new THREE.PointLight(0xe99887, 1.2, 4, 2);
    this.scene.add(this.survivorLight, this.monsterLight);
  }

  createHouse() {
    const width = HOUSE.width || 50;
    const depth = HOUSE.depth || 42;
    this.box(this.static, this.mat.foundation, 0, -.55, 0, width + .6, .8, depth + .6);
    this.box(this.static, this.mat.floor, 0, -.08, 0, width, .15, depth);
    const ground = this.mesh(new THREE.PlaneGeometry(400, 400), this.material(0x121c1a), this.static, 0, -.98, 0);
    ground.rotation.x = -Math.PI / 2;
    // Rooms have different subtle stains; the connected halls stay exposed oak.
    for (const [index, room] of ROOMS.entries()) {
      const isBath = /bath|wash|laundry/i.test(room.name);
      if (isBath) {
        this.box(this.static, this.mat.tile, room.x, .008, room.z, room.w - .35, .018, room.d - .35);
        const seam = this.mat.trim;
        for (let x = -.5 * room.w + 1; x < .5 * room.w - .3; x += 1) {
          this.box(this.static, seam, room.x + x, .019, room.z, .018, .006, room.d - .4);
        }
        for (let z = -.5 * room.d + 1; z < .5 * room.d - .3; z += 1) {
          this.box(this.static, seam, room.x, .02, room.z + z, room.w - .4, .006, .018);
        }
      } else if (!/hall|corridor/i.test(room.name)) {
        this.createRug(room, index);
      }
      const texture = this.texture(labelTexture(room.name, '#d1d1b9'));
      const labelMat = this.basic(0xffffff, { map: texture, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
      const label = this.mesh(new THREE.PlaneGeometry(Math.min(room.w - 1.3, 5), .93), labelMat, this.scene, room.x, .04, room.z + room.d * .34);
      label.rotation.x = -Math.PI / 2;
      this.roomLabels.push(label);
      this.createRoomDetails(room, index);
    }
    for (const wall of WALLS) {
      const w = wall.w ?? wall.width;
      const d = wall.d ?? wall.depth;
      const height = 1.52;
      this.box(this.static, this.mat.wall, wall.x, height / 2, wall.z, w, height, d, true);
      this.box(this.static, this.mat.cap, wall.x, height + .035, wall.z, w + .04, .07, d + .04);
      const alongX = w > d;
      this.box(this.static, this.mat.trim, wall.x, .14, wall.z, w + (alongX ? 0 : .09), .27, d + (alongX ? .09 : 0));
      // Occasional vertical joins give the cut walls an aged panelled silhouette.
      const length = alongX ? w : d;
      for (let offset = -length / 2 + 2.6; offset < length / 2 - .4; offset += 4.6) {
        this.box(this.static, this.mat.trim, wall.x + (alongX ? offset : 0), .72, wall.z + (alongX ? 0 : offset), alongX ? .08 : w + .055, 1.1, alongX ? d + .055 : .08);
      }
      // Outside windows remain readable in the dollhouse cutaway.
      const outside = Math.abs(wall.x) > width / 2 - .6 || Math.abs(wall.z) > depth / 2 - .6;
      if (outside && length > 4) {
        const window = new THREE.Group();
        window.position.set(wall.x, 1.45, wall.z);
        if (!alongX) window.rotation.y = Math.PI / 2;
        this.static.add(window);
        this.box(window, this.mat.window, 0, .12, 0, 1.45, 1.2, .04);
        for (const x of [-.78, 0, .78]) this.box(window, this.mat.trim, x, .12, 0, .06, 1.35, .1);
        for (const y of [-.55, .12, .79]) this.box(window, this.mat.trim, 0, y, 0, 1.65, .06, .1);
        this.box(window, this.mat.cap, 0, -.55, .1, 1.8, .08, .28);
      }
    }
    // A readable exit threshold and old timber door, rather than an arbitrary dot.
    this.exitGroup = new THREE.Group();
    const nearX = Math.abs(EXIT.x) > Math.abs(EXIT.z);
    const doorX = nearX ? Math.sign(EXIT.x) * width / 2 : EXIT.x;
    const doorZ = nearX ? EXIT.z : Math.sign(EXIT.z) * depth / 2;
    this.exitGroup.position.set(doorX, 0, doorZ);
    if (nearX) this.exitGroup.rotation.y = Math.PI / 2;
    this.scene.add(this.exitGroup);
    this.box(this.exitGroup, this.mat.walnut, 0, 1.13, -.02, 1.9, 2.26, .2, true);
    for (const x of [-1.08, 1.08]) this.box(this.exitGroup, this.mat.cap, x, 1.24, 0, .16, 2.48, .25);
    this.box(this.exitGroup, this.mat.cap, 0, 2.4, 0, 2.34, .17, .25);
    this.box(this.exitGroup, this.mat.oak, 0, .65, .105, 1.48, .7, .06);
    this.box(this.exitGroup, this.mat.oak, 0, 1.58, .105, 1.48, .65, .06);
    this.sphere(this.exitGroup, this.mat.brass, .65, 1.02, .17, .085);
    this.exitMaterial = this.basic(0xaf6e4b, { transparent: true, opacity: .4, depthWrite: false });
    this.exitPad = this.mesh(new THREE.PlaneGeometry(3.3, 2.4), this.exitMaterial, this.exitGroup, 0, .033, -.85);
    this.exitPad.rotation.x = -Math.PI / 2;
    const signTexture = this.texture(labelTexture('EXIT', '#dfd8c1', true));
    this.exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture, transparent: true, depthWrite: false }));
    this.materialResources.add(this.exitSign.material);
    this.exitSign.position.set(doorX, 3.2, doorZ);
    this.exitSign.scale.set(2.9, .55, 1);
    this.scene.add(this.exitSign);
    this.roof = this.box(this.scene, this.basic(0x172e29, { transparent: true, opacity: .24, depthWrite: false }), 0, 2.9, 0, width, .12, depth);
    this.roof.visible = false;
  }

  createRug(room, index) {
    const w = Math.min(room.w * .52, 4.9);
    const d = Math.min(room.d * .45, 3.7);
    if (w < 2 || d < 2) return;
    this.box(this.static, this.mat.rugBorder, room.x, .024, room.z, w, .02, d);
    this.box(this.static, index % 3 === 0 ? this.mat.blanketRust : this.mat.rug, room.x, .036, room.z, w - .2, .014, d - .2);
    this.box(this.static, this.mat.rugBorder, room.x, .046, room.z, w - .8, .01, .055);
    this.box(this.static, this.mat.rugBorder, room.x, .046, room.z, .055, .01, d - .7);
    for (const direction of [-1, 1]) {
      for (let x = -.5 * w + .15; x < .5 * w; x += .22) {
        this.box(this.static, this.mat.linen, room.x + x, .033, room.z + direction * (d / 2 + .065), .035, .025, .14);
      }
    }
  }

  createRoomDetails(room, index) {
    const x = room.x - room.w / 2 + .65;
    const z = room.z + room.d / 2 - .65;
    // A quiet warm lamp, planted in the back corner clear of the doorway network.
    const lamp = new THREE.Group();
    lamp.position.set(x, 0, z);
    this.static.add(lamp);
    this.cylinder(lamp, this.mat.metal, 0, .06, 0, .32, .12);
    this.cylinder(lamp, this.mat.brass, 0, .95, 0, .035, 1.8);
    const shadeGeometry = new THREE.CylinderGeometry(.34, .56, .47, 10, 1, true);
    this.geometryResources.add(shadeGeometry);
    this.mesh(shadeGeometry, this.mat.lampShade, lamp, 0, 1.8, 0);
    this.sphere(lamp, this.mat.light, 0, 1.66, 0, .12);
    const lightPool = this.mesh(new THREE.PlaneGeometry(4.5, 4.5), this.basic(0xffca7c, { map: this.glow, transparent: true, opacity: .17, depthWrite: false }), this.scene, x, .055, z);
    lightPool.rotation.x = -Math.PI / 2;
    // Framed, abstract photographs sit just below the cut wall line.
    if (room.w > 6) {
      const group = new THREE.Group();
      group.position.set(room.x, 1, room.z - room.d / 2 + .19);
      this.static.add(group);
      this.box(group, this.mat.walnut, 0, 0, 0, 1.05, .73, .08);
      this.box(group, this.mat.paper, 0, 0, .048, .9, .58, .015);
      this.box(group, index % 2 ? this.mat.bookTeal : this.mat.bookRust, -.08, -.04, .06, .2, .39, .01);
      this.box(group, this.mat.dark, .17, .13, .066, .13, .13, .008);
    }
    if (index % 3 === 1 && !/hall/i.test(room.name)) this.createPlant(room.x - room.w / 2 + .55, room.z - room.d / 2 + .55);
  }

  createPlant(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.static.add(group);
    this.cylinder(group, this.mat.pot, 0, .19, 0, .27, .38);
    this.cylinder(group, this.mat.dark, 0, .385, 0, .22, .025);
    this.cylinder(group, this.mat.plant, 0, .7, 0, .025, .68);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU;
      const leaf = this.sphere(group, this.mat.plant, Math.sin(angle) * .24, .57 + i * .065, Math.cos(angle) * .24, .2);
      leaf.scale.set(.16, .06, .38);
      leaf.rotation.set(.3, angle, .3);
    }
  }

  createFurniture() {
    FURNITURE.forEach((object, index) => {
      const group = new THREE.Group();
      group.position.set(object.x, 0, object.z);
      group.rotation.y = object.rotation || 0;
      this.static.add(group);
      const w = object.w || 1.7;
      const d = object.d || 1.4;
      if (object.type === 'bed') this.createBed(group, w, d, index);
      else if (object.type === 'closet') this.createCloset(group, w, d);
      else if (object.type === 'table') this.createTable(group, w, d, index);
      else if (object.type === 'shelf') this.createShelf(group, w, d, index);
      else if (object.type === 'sofa') this.createSofa(group, w, d);
      else if (object.type === 'sink') this.createSink(group, w, d);
      else this.box(group, this.mat.furniture, 0, .43, 0, w, .86, d, true);
    });
  }

  createBed(group, w, d, index) {
    this.box(group, this.mat.walnut, 0, .4, 0, w, .17, d, true);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) this.box(group, this.mat.walnut, x * (w / 2 - .13), .22, z * (d / 2 - .13), .14, .44, .14);
    }
    this.box(group, this.mat.linen, 0, .59, 0, w - .1, .27, d - .09, true);
    this.box(group, index % 3 === 0 ? this.mat.blanketRust : this.mat.blanket, 0, .75, d * .13, w - .08, .1, d * .66);
    this.box(group, this.mat.linen, 0, .79, -d * .32, w * .68, .17, d * .22);
    this.box(group, this.mat.oak, 0, .75, -d / 2, w + .06, 1.12, .13, true);
    this.box(group, this.mat.oak, 0, .46, d / 2, w + .06, .67, .13);
    for (const x of [-.28, 0, .28]) this.box(group, this.mat.brass, x * w, .87, -d / 2 - .075, .025, .63, .02);
    this.box(group, this.mat.linen, 0, .815, d * .08, w - .05, .015, .1);
  }

  createCloset(group, w, d) {
    this.box(group, this.mat.walnut, 0, 1.01, 0, w, 2.02, d, true);
    this.box(group, this.mat.oak, 0, 2.04, 0, w + .14, .13, d + .1);
    this.box(group, this.mat.oak, 0, .13, 0, w + .08, .21, d + .05);
    for (const direction of [-1, 1]) {
      this.box(group, this.mat.furniture, direction * w * .248, 1.08, d / 2 + .012, w * .465, 1.74, .065);
      this.box(group, this.mat.oak, direction * w * .248, 1.22, d / 2 + .05, w * .33, 1.1, .035);
      this.box(group, this.mat.oak, direction * w * .248, .48, d / 2 + .05, w * .33, .23, .035);
      this.cylinder(group, this.mat.brass, direction * .085, 1.1, d / 2 + .11, .04, .16);
    }
    this.box(group, this.mat.dark, 0, 1.05, d / 2 + .052, .018, 1.71, .008);
  }

  createTable(group, w, d, index) {
    this.box(group, this.mat.oak, 0, .85, 0, w, .13, d, true);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) this.box(group, this.mat.walnut, x * (w / 2 - .13), .42, z * (d / 2 - .13), .12, .83, .12);
    }
    this.box(group, this.mat.bookRust, w * -.18, .963, 0, .55, .09, .4);
    this.box(group, this.mat.paper, w * -.18, 1.02, 0, .52, .025, .37);
    this.box(group, this.mat.bookTeal, w * -.16, 1.056, .015, .48, .06, .34);
    this.cylinder(group, this.mat.ceramic, w * .22, 1.02, -.08, .1, .22);
    this.cylinder(group, this.mat.dark, w * .22, 1.137, -.08, .075, .009);
    if (index % 2) {
      this.box(group, this.mat.paper, .05, .927, d * .27, .4, .015, .29);
      this.box(group, this.mat.brass, .05, .944, d * .28, .27, .013, .013);
    }
  }

  createShelf(group, w, d, index) {
    this.box(group, this.mat.walnut, 0, .85, -d / 2 + .06, w, 1.7, .11, true);
    for (const x of [-1, 1]) this.box(group, this.mat.oak, x * (w / 2 - .045), .85, 0, .09, 1.8, d, true);
    for (const y of [.12, .67, 1.23, 1.76]) {
      this.box(group, this.mat.oak, 0, y, 0, w, .075, d);
      if (y > 1.5) continue;
      for (let i = 0; i < Math.min(7, Math.floor(w / .2)); i++) {
        const bookHeight = .29 + ((i + index) % 3) * .05;
        this.box(group, (i + index) % 2 ? this.mat.bookTeal : this.mat.bookRust, -w / 2 + .21 + i * .17, y + bookHeight / 2 + .055, .02, .12, bookHeight, Math.min(d - .09, .35));
      }
    }
  }

  createSofa(group, w, d) {
    this.box(group, this.mat.walnut, 0, .22, 0, w - .2, .3, d - .15);
    this.box(group, this.mat.leather, 0, .48, 0, w - .1, .35, d, true);
    this.box(group, this.mat.leather, 0, .84, -d / 2 + .15, w, .65, .3, true);
    for (const x of [-1, 1]) this.box(group, this.mat.leather, x * (w / 2 - .16), .67, 0, .32, .67, d, true);
    for (let i = 0; i < 3; i++) this.box(group, this.mat.blanket, (i - 1) * (w - .7) / 3, .69, .08, (w - .8) / 3, .16, d - .42);
    this.box(group, this.mat.linen, -w * .26, .98, -d * .16, .4, .38, .17);
  }

  createSink(group, w, d) {
    this.box(group, this.mat.furniture, 0, .48, 0, w, .96, d, true);
    this.box(group, this.mat.ceramic, 0, 1.01, 0, w + .04, .13, d + .04);
    this.box(group, this.mat.tile, 0, 1.08, .03, w * .65, .025, d * .58);
    this.cylinder(group, this.mat.metal, 0, 1.24, -d * .3, .028, .32);
    this.box(group, this.mat.metal, 0, 1.39, -d * .2, .055, .055, d * .2);
    this.box(group, this.mat.oak, 0, .46, d / 2 + .01, w - .14, .71, .045);
    this.box(group, this.mat.brass, 0, .77, d / 2 + .05, .24, .045, .035);
  }

  createCharacters() {
    this.survivor = this.makeSurvivor();
    this.monster = this.makeMonster();
    this.scene.add(this.survivor.group, this.monster.group);
    this.selectable = [this.survivor.group, this.monster.group];
    const survivorBadge = this.makeActorBadge('SURVIVOR', 0x81dbc3, 2.35);
    const monsterBadge = this.makeActorBadge('RESIDENT', 0xe8bbaa, 3.55);
    this.survivor.group.add(survivorBadge);
    this.monster.group.add(monsterBadge);
    this.survivor.badge = survivorBadge;
    this.monster.badge = monsterBadge;
  }

  makeActorBadge(text, color, height) {
    const texture = this.texture(labelTexture(text, `#${new THREE.Color(color).getHexString()}`, true));
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    this.materialResources.add(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.y = height;
    sprite.scale.set(3.1, .59, 1);
    sprite.renderOrder = 3;
    return sprite;
  }

  makeSurvivor() {
    const group = new THREE.Group();
    group.userData.actor = 'survivor';
    const orange = this.material(0xca9b66);
    const pants = this.material(0x293c46);
    const skin = this.material(0xd7baa0);
    const hair = this.material(0x332e28);
    const shoes = this.material(0x24312e);
    const backpack = this.material(0x476e68);
    const highlight = this.material(0x91dcc7, { emissive: 0x2c7567, emissiveIntensity: .28 });
    const body = new THREE.Group();
    body.position.y = 1;
    group.add(body);
    const torso = this.box(body, orange, 0, .1, 0, .47, .64, .29, true);
    this.box(group, pants, 0, .78, 0, .42, .16, .28);
    this.box(body, skin, 0, .6, 0, .31, .36, .29, true);
    this.box(body, hair, 0, .79, -.015, .34, .12, .31);
    this.box(body, hair, 0, .61, -.14, .34, .26, .075);
    this.box(body, shoes, -.065, .63, .153, .036, .038, .02);
    this.box(body, shoes, .065, .63, .153, .036, .038, .02);
    this.box(body, backpack, 0, .12, -.235, .35, .46, .21);
    this.box(body, highlight, 0, .08, -.352, .14, .15, .025);
    this.box(body, highlight, -.18, .2, .157, .045, .33, .03);
    this.box(body, highlight, .18, .2, .157, .045, .33, .03);
    const legs = [];
    const arms = [];
    for (const direction of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(direction * .12, .78, 0);
      group.add(leg);
      this.box(leg, pants, 0, -.3, 0, .18, .61, .21, true);
      this.box(leg, shoes, 0, -.66, .07, .21, .14, .37);
      legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(direction * .3, .36, 0);
      body.add(arm);
      this.box(arm, orange, 0, -.23, 0, .16, .46, .19, true);
      this.box(arm, skin, 0, -.49, 0, .12, .13, .14);
      arms.push(arm);
    }
    const haloMat = this.basic(0x83e0c4, { transparent: true, opacity: .18, depthWrite: false });
    const halo = this.mesh(new THREE.RingGeometry(.49, .59, 32), haloMat, group, 0, .052, 0);
    halo.rotation.x = -Math.PI / 2;
    const glow = this.mesh(new THREE.PlaneGeometry(2.8, 2.8), this.basic(0x73dfc3, { map: this.glow, transparent: true, opacity: .16, depthWrite: false }), group, 0, .034, 0);
    glow.rotation.x = -Math.PI / 2;
    return { group, body, torso, legs, arms, halo, materials: [orange, pants, skin, hair, shoes, backpack, highlight], phase: 0, lastX: null, lastZ: null };
  }

  makeMonster() {
    const group = new THREE.Group();
    group.userData.actor = 'monster';
    const black = this.material(0x10171a, { roughness: .95 });
    const chalk = this.material(0xd4d2bc, { roughness: 1 });
    const stain = this.material(0x6c766e);
    const eye = this.basic(0x0c1010);
    const throat = this.material(0x646f61);
    const torso = this.box(group, black, 0, 1.48, 0, .58, .88, .26, true);
    torso.rotation.z = -.05;
    this.box(group, chalk, -.19, 1.47, .148, .055, .81, .03);
    this.box(group, stain, .12, 1.42, .142, .035, .61, .04);
    this.box(group, throat, 0, 2.02, 0, .1, .31, .11);
    const head = new THREE.Group();
    head.position.set(0, 2.49, .015);
    head.rotation.z = .12;
    group.add(head);
    const face = this.box(head, chalk, 0, 0, 0, .43, .66, .19, true);
    face.rotation.z = -.06;
    // An original paper-mask shape, hollow asymmetric eyes, a fine crooked mouth.
    this.box(head, eye, -.104, .075, .104, .078, .13, .018);
    this.box(head, eye, .105, .095, .104, .052, .18, .018);
    this.box(head, eye, -.04, -.171, .108, .13, .022, .018).rotation.z = .11;
    this.box(head, stain, .19, -.11, .106, .025, .32, .02);
    this.box(head, black, 0, .343, -.015, .47, .1, .25);
    this.box(head, black, -.23, .14, -.06, .065, .34, .18);
    const legs = [];
    const arms = [];
    for (const direction of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(direction * .13, 1.06, 0);
      group.add(leg);
      this.box(leg, black, 0, -.48, 0, .13, .96, .17, true);
      this.box(leg, stain, direction * .012, -.52, .092, .021, .71, .018);
      this.box(leg, black, 0, -1, .13, .18, .12, .42);
      legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(direction * .36, 1.91, 0);
      arm.rotation.z = direction * .09;
      group.add(arm);
      this.box(arm, black, 0, -.49, 0, .105, 1.03, .135, true);
      this.box(arm, chalk, 0, -1.09, 0, .11, .26, .095);
      for (let finger = 0; finger < 3; finger++) {
        this.box(arm, chalk, (finger - 1) * .039, -1.28 - finger * .012, .006, .021, .23, .028);
      }
      arms.push(arm);
    }
    const halo = this.mesh(new THREE.RingGeometry(.57, .64, 32), this.basic(0xd9a38c, { transparent: true, opacity: .2, depthWrite: false }), group, 0, .058, 0);
    halo.rotation.x = -Math.PI / 2;
    const glow = this.mesh(new THREE.PlaneGeometry(3.4, 3.4), this.basic(0xcf9b8d, { map: this.glow, transparent: true, opacity: .15, depthWrite: false }), group, 0, .037, 0);
    glow.rotation.x = -Math.PI / 2;
    return { group, torso, head, legs, arms, halo, phase: 0, lastX: null, lastZ: null };
  }

  createItems() {
    for (const [index, item] of ITEMS.entries()) {
      const group = new THREE.Group();
      group.position.set(item.x, .9, item.z);
      const colors = [0xe0b46e, 0x8ccbc2, 0xd39987];
      const color = item.color || colors[index % colors.length];
      const material = this.material(color, { emissive: color, emissiveIntensity: .35, roughness: .36, metalness: .45 });
      if (index % 3 === 0 || /key/i.test(item.name || item.type || '')) {
        const ring = this.mesh(new THREE.TorusGeometry(.16, .045, 8, 16), material, group, -.15, .03, 0);
        ring.rotation.y = Math.PI / 2;
        this.box(group, material, .15, .025, 0, .4, .065, .075);
        this.box(group, material, .22, -.045, 0, .06, .12, .075);
        this.box(group, material, .32, -.045, 0, .06, .12, .075);
      } else if (index % 3 === 1) {
        this.box(group, material, 0, 0, 0, .25, .5, .2);
        this.box(group, this.mat.paper, 0, .04, .11, .12, .2, .025);
        this.box(group, this.mat.dark, 0, .28, 0, .23, .065, .18);
      } else {
        this.mesh(new THREE.OctahedronGeometry(.26), material, group);
        this.box(group, this.mat.brass, 0, -.3, 0, .28, .045, .28);
      }
      const marker = this.mesh(new THREE.RingGeometry(.36, .44, 24), this.basic(color, { transparent: true, opacity: .4, depthWrite: false }), this.scene, item.x, .06, item.z);
      marker.rotation.x = -Math.PI / 2;
      group.userData.itemId = item.id;
      this.scene.add(group);
      this.itemMeshes.set(item.id, { group, marker, phase: index * 1.7 });
    }
  }

  createPerception() {
    this.perceptionGroup = new THREE.Group();
    this.scene.add(this.perceptionGroup);
    const coneGeometry = new THREE.BufferGeometry();
    coneGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3 * 30), 3));
    this.geometryResources.add(coneGeometry);
    this.sightCone = this.mesh(coneGeometry, this.basic(0xe7bc89, { transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide }), this.perceptionGroup);
    const memoryMat = this.basic(0xddb799, { transparent: true, opacity: .5, depthWrite: false });
    this.memoryMarker = this.mesh(new THREE.RingGeometry(.4, .46, 24), memoryMat, this.perceptionGroup);
    this.memoryMarker.rotation.x = -Math.PI / 2;
    const memoryTexture = this.texture(labelTexture('LAST SEEN', '#e0b699', true));
    this.memoryLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: memoryTexture, transparent: true, depthWrite: false }));
    this.materialResources.add(this.memoryLabel.material);
    this.memoryLabel.scale.set(2.8, .55, 1);
    this.perceptionGroup.add(this.memoryLabel);
    this.perceptionGroup.visible = false;
  }

  bindControls() {
    const canvas = this.renderer.domElement;
    this.handlers = {
      pointerdown: event => {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.dragDistance = 0;
        try { canvas.setPointerCapture(event.pointerId); } catch { /* unsupported pointer capture */ }
        if (this.pointers.size === 2) this.pinchDistance = this.getPinchDistance();
      },
      pointermove: event => {
        if (!this.pointers.has(event.pointerId)) return;
        const previous = this.pointers.get(event.pointerId);
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        if (this.pointers.size === 2) {
          const distance = this.getPinchDistance();
          if (this.pinchDistance) this.orbit.distance = clamp(this.orbit.distance * this.pinchDistance / distance, 16, 112);
          this.pinchDistance = distance;
        } else {
          this.orbit.angle -= dx * .006;
          this.orbit.elevation = clamp(this.orbit.elevation + dy * .004, .38, 1.39);
        }
      },
      pointerup: event => {
        if (this.dragDistance < 8 && this.pointers.size === 1 && this.onSelect) {
          const rect = canvas.getBoundingClientRect();
          this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const intersects = this.raycaster.intersectObjects(this.selectable, true);
          if (intersects.length) {
            let object = intersects[0].object;
            while (object && !object.userData.actor) object = object.parent;
            if (object) this.onSelect(object.userData.actor);
          }
        }
        this.pointers.delete(event.pointerId);
        this.pinchDistance = null;
      },
      pointercancel: event => { this.pointers.delete(event.pointerId); this.pinchDistance = null; },
      wheel: event => {
        event.preventDefault();
        this.orbit.distance = clamp(this.orbit.distance * Math.exp(event.deltaY * .001), 16, 112);
      },
      contextmenu: event => event.preventDefault(),
    };
    for (const [type, handler] of Object.entries(this.handlers)) canvas.addEventListener(type, handler, { passive: false });
  }

  getPinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setCameraMode(mode) {
    const next = ['overview', 'survivor', 'monster', 'cinematic'].includes(mode) ? mode : 'overview';
    if (next !== this.cameraMode) {
      this.cameraNeedsSnap = true;
      this.resetFrameSampling();
    }
    this.cameraMode = next;
  }

  /** Auto is intentionally one-way during a session: slow scenes settle at a
   * stable resolution instead of repeatedly bouncing between sharp and blurry. */
  setQuality(mode) {
    this.quality = ['auto', 'low', 'high'].includes(mode) ? mode : 'auto';
    const deviceRatio = window.devicePixelRatio || 1;
    const cap = this.quality === 'high' ? 2 : this.quality === 'low' ? .7 : window.innerWidth < 760 ? 1.25 : 1;
    this.applyResolution(Math.min(deviceRatio, cap), this.quality !== 'low');
    this.averageFPS = null;
    this.resetFrameSampling();
  }

  applyResolution(ratio, shadows) {
    ratio = Math.round(ratio * 100) / 100;
    if (Math.abs(ratio - this.pixelRatio) > .005) {
      this.pixelRatio = ratio;
      // Three updates its drawing buffer here while retaining the CSS size.
      this.renderer.setPixelRatio(ratio);
    }
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  resetFrameSampling() {
    this.performanceFrames = 0;
    this.performanceElapsed = 0;
    this.lastRenderTimestamp = null;
  }

  samplePerformance(now) {
    if (document.hidden || this.quality !== 'auto') {
      this.resetFrameSampling();
      return;
    }
    const previous = this.lastRenderTimestamp;
    this.lastRenderTimestamp = now;
    if (previous === null) return;
    const interval = now - previous;
    // Ignore a tab being suspended, while still measuring genuinely slow GPUs.
    if (interval <= 0 || interval > 5000) {
      this.performanceFrames = 0;
      this.performanceElapsed = 0;
      return;
    }
    this.performanceFrames++;
    this.performanceElapsed += interval;
    if (this.performanceFrames < 12) return;
    this.averageFPS = this.performanceFrames * 1000 / this.performanceElapsed;
    if (this.averageFPS < 24) {
      const severe = this.averageFPS < 15;
      const floor = severe ? .5 : .6;
      const nextRatio = Math.min(this.pixelRatio, Math.max(floor, this.pixelRatio - .15));
      this.applyResolution(nextRatio, this.renderer.shadowMap.enabled && !severe);
    }
    this.performanceFrames = 0;
    this.performanceElapsed = 0;
  }

  setPerception(enabled) {
    this.showPerception = Boolean(enabled);
  }

  resetCamera() {
    this.orbit.angle = Math.PI * .22;
    this.orbit.elevation = .8;
    this.orbit.distance = 82;
    this.cameraNeedsSnap = true;
    this.orbitTarget.set(0, .4, 0);
  }

  animateActor(actor, state, dt, monster = false) {
    if (!state) return;
    const x = state.x || 0;
    const z = state.z || 0;
    const moved = actor.lastX === null ? 0 : Math.hypot(x - actor.lastX, z - actor.lastZ);
    const speed = dt > 0 ? Math.min(5, moved / dt) : 0;
    actor.phase += speed * dt * (monster ? 2.5 : 3.7);
    const hidingFurniture = !monster && state.hidden ? FURNITURE.find(object => object.id === state.hidingSpotId) : null;
    const underBed = hidingFurniture?.type === 'bed';
    actor.group.position.set(hidingFurniture?.x ?? x, underBed ? .04 : 0, hidingFurniture?.z ?? z);
    actor.group.scale.y = underBed ? .25 : 1;
    actor.badge.position.y = underBed ? 9.2 : monster ? 3.55 : 2.35;
    const heading = typeof state.heading === 'number' ? state.heading : Math.atan2(z - (actor.lastZ ?? z), x - (actor.lastX ?? x));
    const targetAngle = Math.PI / 2 - heading;
    let difference = ((targetAngle - actor.group.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI;
    actor.group.rotation.y += difference * Math.min(1, dt * 10);
    const stride = Math.sin(actor.phase) * Math.min(speed / 3, 1);
    actor.legs[0].rotation.x = stride * (monster ? .31 : .5);
    actor.legs[1].rotation.x = -stride * (monster ? .31 : .5);
    actor.arms[0].rotation.x = -stride * (monster ? .24 : .4);
    actor.arms[1].rotation.x = stride * (monster ? .24 : .4);
    actor.torso.position.y = (monster ? 1.48 : .1) + Math.abs(Math.sin(actor.phase)) * Math.min(speed / 3, 1) * .027;
    if (monster) {
      actor.head.rotation.z = .12 + Math.sin(this.elapsed * 1.1) * .035;
      actor.head.rotation.y = Math.sin(this.elapsed * .7) * .03;
    } else {
      const collecting = state.state === 'collect';
      actor.body.position.y = collecting ? .79 : 1;
      actor.body.rotation.x = collecting ? .64 : 0;
      if (collecting) {
        actor.arms[0].rotation.x = -.72;
        actor.arms[1].rotation.x = -.98 + Math.sin(this.elapsed * 4) * .08;
        actor.legs[0].rotation.x = -.2;
        actor.legs[1].rotation.x = .27;
      }
      const hidden = Boolean(state.hidden);
      for (const material of actor.materials) {
        material.transparent = hidden;
        material.opacity = hidden ? .26 : 1;
        material.depthWrite = !hidden;
      }
      actor.halo.material.opacity = hidden ? .08 : .23;
    }
    actor.lastX = x;
    actor.lastZ = z;
    const scale = this.cameraMode === 'overview' ? 1 : .85;
    actor.badge.scale.set(3.1 * scale, .59 * scale / actor.group.scale.y, 1);
  }

  updateCamera(sim, dt, mode) {
    const isOverview = mode === 'overview';
    let target = new THREE.Vector3(0, .4, 0);
    let distance = this.orbit.distance;
    let elevation = this.orbit.elevation;
    let angle = this.orbit.angle;
    if (!isOverview) {
      const person = mode === 'monster' ? sim.monster : sim.survivor;
      target.set(person?.x || 0, 1, person?.z || 0);
      distance = clamp(this.orbit.distance * .28, 8, 25);
      elevation = clamp(this.orbit.elevation, .55, 1.18);
      if (mode === 'cinematic') {
        const sx = sim.survivor?.x || 0;
        const sz = sim.survivor?.z || 0;
        const mx = sim.monster?.x || 0;
        const mz = sim.monster?.z || 0;
        const gap = Math.hypot(sx - mx, sz - mz);
        if (gap < 15) {
          target.set((sx + mx) / 2, .8, (sz + mz) / 2);
          distance = Math.max(14, gap * 1.5);
        }
        angle += Math.sin(this.elapsed * .035) * .3;
      }
    }
    // A narrow screen needs more distance to frame the complete house.
    if (isOverview && this.camera.aspect < 1.2) distance *= 1.2 / Math.max(.5, this.camera.aspect);
    const desired = new THREE.Vector3(
      target.x + Math.sin(angle) * Math.cos(elevation) * distance,
      target.y + Math.sin(elevation) * distance,
      target.z + Math.cos(angle) * Math.cos(elevation) * distance,
    );
    const smoothing = 1 - Math.exp(-Math.max(dt, .016) * (isOverview ? 7 : 5));
    if (this.cameraNeedsSnap) {
      this.currentCamera.copy(desired);
      this.lookTarget.copy(target);
      this.cameraNeedsSnap = false;
    } else {
      this.currentCamera.lerp(desired, smoothing);
      this.lookTarget.lerp(target, smoothing);
    }
    this.camera.position.copy(this.currentCamera);
    this.camera.lookAt(this.lookTarget);
    for (const label of this.roomLabels) label.material.opacity = isOverview ? .43 : .12;
  }

  updateNoises(noises = []) {
    const ids = new Set();
    for (const noise of noises) {
      const id = noise.id ?? `${noise.x}:${noise.z}`;
      const age = noise.age ?? 0;
      if (age > 4) continue;
      ids.add(id);
      let effect = this.noiseMeshes.get(id);
      if (!effect) {
        const material = this.basic(0xdab983, { transparent: true, opacity: .4, depthWrite: false });
        const mesh = this.mesh(new THREE.RingGeometry(.93, 1, 40), material, this.scene, noise.x, .075, noise.z);
        mesh.rotation.x = -Math.PI / 2;
        effect = { mesh, material };
        if (/bottle/i.test(noise.type || '')) {
          const bottle = new THREE.Group();
          this.cylinder(bottle, this.mat.bookTeal, 0, 0, 0, .08, .35);
          this.cylinder(bottle, this.mat.bookTeal, 0, .24, 0, .039, .14);
          this.cylinder(bottle, this.mat.brass, 0, .33, 0, .047, .04);
          this.box(bottle, this.mat.paper, 0, -.025, .082, .095, .14, .012);
          bottle.rotation.z = Math.PI / 2;
          this.scene.add(bottle);
          effect.bottle = bottle;
        }
        this.noiseMeshes.set(id, effect);
      }
      effect.mesh.position.set(noise.x, .07, noise.z);
      const radius = mix(.45, Math.min(noise.radius || 8, 7), Math.min(age / 3, 1));
      effect.mesh.scale.set(radius, radius, radius);
      effect.material.opacity = Math.max(0, .24 * (1 - age / 4));
      if (effect.bottle) {
        effect.bottle.position.set(noise.x, .1 + Math.abs(Math.sin(age * 17)) * Math.exp(-age * 6) * .35, noise.z);
        effect.bottle.rotation.y = .3 + Math.sin(age * 4) * Math.exp(-age * 3);
      }
    }
    for (const [id, effect] of this.noiseMeshes) {
      if (!ids.has(id)) {
        this.scene.remove(effect.mesh);
        if (effect.bottle) this.scene.remove(effect.bottle);
        effect.mesh.geometry.dispose();
        effect.material.dispose();
        this.materialResources.delete(effect.material);
        this.noiseMeshes.delete(id);
      }
    }
  }

  updatePerception(sim, enabled) {
    this.perceptionGroup.visible = enabled;
    if (!enabled || !sim.monster) return;
    const monster = sim.monster;
    const heading = monster.heading || 0;
    const fov = monster.fov || Math.PI * .78;
    const range = monster.sightRange || 13;
    const array = this.sightCone.geometry.attributes.position.array;
    const endpoints = [];
    for (let ray = 0; ray <= 30; ray++) {
      const angle = heading - fov / 2 + ray / 30 * fov;
      const point = distance => ({ x: monster.x + Math.cos(angle) * distance, z: monster.z + Math.sin(angle) * distance });
      let reach = range;
      if (!lineOfSight(monster, point(range))) {
        let low = 0, high = range;
        for (let iteration = 0; iteration < 9; iteration++) {
          const middle = (low + high) / 2;
          if (lineOfSight(monster, point(middle))) low = middle;
          else high = middle;
        }
        reach = low;
      }
      endpoints.push(point(reach));
    }
    for (let step = 0; step < 30; step++) {
      const a = endpoints[step];
      const b = endpoints[step + 1];
      const offset = step * 9;
      array.set([monster.x, .083, monster.z, a.x, .083, a.z, b.x, .083, b.z], offset);
    }
    this.sightCone.geometry.attributes.position.needsUpdate = true;
    this.sightCone.geometry.computeBoundingSphere();
    const seen = monster.lastSeen;
    this.memoryMarker.visible = this.memoryLabel.visible = Boolean(seen && monster.memoryRemaining > 0);
    if (seen) {
      this.memoryMarker.position.set(seen.x, .11, seen.z);
      this.memoryLabel.position.set(seen.x, .5, seen.z);
      this.memoryMarker.material.opacity = clamp(monster.memoryRemaining / 12, .12, .55);
      this.memoryLabel.material.opacity = this.memoryMarker.material.opacity + .25;
    }
  }

  render(sim, dt = .016, options = {}) {
    dt = clamp(dt, 0, .1);
    this.elapsed += dt;
    const mode = options.cameraMode || this.cameraMode;
    if (mode !== this.cameraMode) {
      this.cameraNeedsSnap = true;
      this.resetFrameSampling();
    }
    this.cameraMode = mode;
    // Use actual RAF spacing, independent of the simulation's clamped delta.
    this.samplePerformance(performance.now());
    this.animateActor(this.survivor, sim.survivor, dt);
    this.animateActor(this.monster, sim.monster, dt, true);
    this.survivorLight.position.set(sim.survivor?.x || 0, 1.5, sim.survivor?.z || 0);
    this.monsterLight.position.set(sim.monster?.x || 0, 2, sim.monster?.z || 0);
    const items = sim.items || ITEMS;
    const collected = new Set(sim.survivor?.items || []);
    for (const item of items) {
      const visual = this.itemMeshes.get(item.id);
      if (!visual) continue;
      const visible = !item.collected && !collected.has(item.id);
      visual.group.visible = visual.marker.visible = visible;
      visual.group.position.y = .97 + Math.sin(this.elapsed * 1.9 + visual.phase) * .1;
      visual.group.rotation.y = this.elapsed * .65 + visual.phase;
      visual.marker.material.opacity = .34 + Math.sin(this.elapsed * 2 + visual.phase) * .06;
    }
    const unlocked = collected.size >= ITEMS.length || sim.status === 'escaped';
    this.exitMaterial.color.setHex(unlocked ? 0x80d3a4 : 0xb27d51);
    this.exitMaterial.opacity = unlocked ? .32 + Math.sin(this.elapsed * 2) * .08 : .18;
    this.roof.visible = Boolean(options.showRoof);
    this.updateNoises(sim.noises || []);
    this.updatePerception(sim, options.showPerception ?? this.showPerception);
    this.updateCamera(sim, dt, mode);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const [type, handler] of Object.entries(this.handlers)) this.renderer.domElement.removeEventListener(type, handler);
    const geometries = new Set(this.geometryResources);
    this.scene.traverse(object => { if (object.isMesh) geometries.add(object.geometry); });
    for (const geometry of geometries) if (![boxGeometry, cylinderGeometry, sphereGeometry].includes(geometry)) geometry.dispose();
    for (const material of this.materialResources) material.dispose();
    for (const texture of this.textureResources) texture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
