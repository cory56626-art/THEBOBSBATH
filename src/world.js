// Procedural city: one batched draw per surface type keeps the whole district light.
export function createWorld(THREE, scene, { quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'Meridian district';
  scene.add(group);
  const roads = [-144, -72, 0, 72, 144];
  const colliders = [];
  const mapBuildings = [];
  const batches = new Map();
  const ownedTextures = [];
  const looseObjects = [];
  let seed = 81731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const trunk = new THREE.CylinderGeometry(0.68, 1, 1, 8);
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const cone = new THREE.ConeGeometry(1, 1, 8);

  function surface(color, roughness = 0.8, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  }
  function texture(kind) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixels = ctx.createImageData(256, 256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const noise = random() * (kind === 'asphalt' ? 26 : 18);
      const base = kind === 'asphalt' ? 42 : 153;
      pixels.data[i] = base + noise;
      pixels.data[i + 1] = base + noise + (kind === 'asphalt' ? 1 : -3);
      pixels.data[i + 2] = base + noise + (kind === 'asphalt' ? 4 : -9);
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    if (kind !== 'asphalt') {
      ctx.strokeStyle = 'rgba(70,66,57,.34)';
      ctx.lineWidth = 1.3;
      for (let n = 0; n <= 256; n += 64) {
        ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, n); ctx.lineTo(256, n); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(kind === 'asphalt' ? 90 : 3.5, kind === 'asphalt' ? 90 : 3.5);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    ownedTextures.push(tex);
    return tex;
  }
  const asphaltTexture = texture('asphalt');
  const pavingTexture = texture('paving');
  const materials = {
    ground: surface(0x746b53),
    asphalt: surface(0xb7b9ba, 0.98, { map: asphaltTexture }),
    sidewalk: surface(0xe4d8c1, 0.92, { map: pavingTexture }),
    curb: surface(0xa5a69b),
    wall: surface(0xffffff, 0.85),
    trim: surface(0xbbb5a8, 0.78),
    darkTrim: surface(0x384748, 0.64, { metalness: 0.35 }),
    roof: surface(0x747777, 0.98),
    window: surface(0x374851, 0.22, { metalness: 0.46, emissive: 0x1a2934, emissiveIntensity: 0.19 }),
    warmWindow: surface(0xd9b479, 0.35, { emissive: 0xffc170, emissiveIntensity: 0.4 }),
    coolWindow: surface(0x77979e, 0.24, { emissive: 0x597d92, emissiveIntensity: 0.21, metalness: 0.35 }),
    white: surface(0xe9e8cf, 0.98),
    yellow: surface(0xdcb864, 0.98),
    iron: surface(0x354144, 0.62, { metalness: 0.55 }),
    lamp: surface(0xffdcac, 0.45, { emissive: 0xffcc8c, emissiveIntensity: 1.4 }),
    trafficGreen: surface(0x53bc92, 0.5, { emissive: 0x18d680, emissiveIntensity: 1.2 }),
    trafficRed: surface(0xaa2b24, 0.5, { emissive: 0xeb2620, emissiveIntensity: 0.9 }),
    bark: surface(0x807059, 0.96),
    foliage: surface(0x334e33, 0.93, { side: THREE.DoubleSide }),
    grass: surface(0x56634a, 0.98),
    brick: surface(0x90634e, 0.95),
    sand: surface(0xb6a689, 0.95),
    water: surface(0x426d74, 0.27, { metalness: 0.42, transparent: true, opacity: 0.94 }),
    bench: surface(0x755a41, 0.82),
    banner: surface(0x435b64),
  };
  const scratch = new THREE.Object3D();
  const colorScratch = new THREE.Color();
  function addBatch(key, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color, rx = 0, rz = 0) {
    if (!batches.has(key)) batches.set(key, { geometry, material, items: [] });
    scratch.position.set(x, y, z);
    scratch.rotation.set(rx, ry, rz);
    scratch.scale.set(sx, sy, sz);
    scratch.updateMatrix();
    batches.get(key).items.push({ matrix: scratch.matrix.clone(), color });
  }
  function block(key, material, x, y, z, sx, sy, sz, color, ry = 0) {
    addBatch(key, box, material, x, y, z, sx, sy, sz, ry, color);
  }
  function flat(key, material, x, y, z, sx, sz, color, ry = 0) {
    addBatch(key, plane, material, x, y, z, sx, sz, 1, ry, color, -Math.PI / 2);
  }
  function collider(x, z, hx, hz, height) {
    colliders.push({ x, z, hx, hz, height });
  }

  flat('ground', materials.ground, 120, -0.09, 0, 660, 800);
  flat('asphalt', materials.asphalt, 0, 0, 0, 432, 432);

  // Pavement blocks leave an eighteen-metre, continuous street grid.
  const blockCenters = [-180, -108, -36, 36, 108, 180];
  for (const x of blockCenters) for (const z of blockCenters) {
    block('sidewalk', materials.sidewalk, x, 0.095, z, 54, 0.19, 54);
    for (const side of [-1, 1]) {
      block('curbs', materials.curb, x + side * 26.85, 0.18, z, 0.22, 0.2, 54);
      block('curbs', materials.curb, x, 0.18, z + side * 26.85, 54, 0.2, 0.22);
    }
  }
  // Markings stop at junctions, so the grid reads like actual roads from above.
  for (const r of roads) {
    for (const center of blockCenters) {
      for (const offset of [-0.23, 0.23]) {
        flat('yellowLines', materials.yellow, r + offset, 0.018, center, 0.11, 49);
        flat('yellowLines', materials.yellow, center, 0.018, r + offset, 49, 0.11);
      }
      for (let d = -20; d <= 20; d += 9) for (const lane of [-4.65, 4.65]) {
        flat('whiteLines', materials.white, r + lane, 0.021, center + d, 0.13, 3.1);
        flat('whiteLines', materials.white, center + d, 0.021, r + lane, 3.1, 0.13);
      }
    }
    for (const crossing of roads) {
      for (let stripe = -7.2; stripe <= 7.21; stripe += 1.8) for (const side of [-1, 1]) {
        flat('crosswalks', materials.white, r + stripe, 0.022, crossing + side * 11.3, 0.9, 3.2);
        flat('crosswalks', materials.white, r + side * 11.3, 0.022, crossing + stripe, 3.2, 0.9);
      }
      flat('stopLines', materials.white, r + 4.5, 0.023, crossing + 14, 8, 0.3);
      flat('stopLines', materials.white, r - 4.5, 0.023, crossing - 14, 8, 0.3);
    }
  }

  const wallColors = [0xb4afa3, 0xaaa399, 0x969e9b, 0xccc0aa, 0x8b9797, 0x9d897b, 0xb9b5a9];
  let buildingNumber = 0;
  function building(x, z, width, depth, height, style = 'tower') {
    const wallColor = wallColors[Math.floor(random() * wallColors.length)];
    block('buildingWalls', materials.wall, x, height / 2 + 0.22, z, width, height, depth, wallColor);
    collider(x, z, width / 2 + 0.12, depth / 2 + 0.12, height);
    mapBuildings.push({ x, z, hx: width / 2, hz: depth / 2 });
    block('roofSlabs', materials.roof, x, height + 0.28, z, width + 0.6, 0.25, depth + 0.6);
    block('buildingBases', materials.darkTrim, x, 1.18, z, width + 0.14, 1.95, depth + 0.14);
    const storey = style === 'brick' ? 3.25 : 3.6;
    const floors = Math.floor((height - 3) / storey);
    const gap = style === 'glass' ? 2.25 : 3.15;
    const colsX = Math.max(2, Math.floor((width - 1.4) / gap));
    const colsZ = Math.max(2, Math.floor((depth - 1.4) / gap));
    for (let f = 0; f < floors; f++) {
      const y = 3.8 + f * storey;
      const windowHeight = style === 'glass' ? 2.65 : 1.95;
      if (style !== 'glass' && f % 3 === 2) {
        block('floorTrim', materials.trim, x, y - 1.45, z, width + 0.1, 0.11, depth + 0.1);
      }
      for (const front of [-1, 1]) {
        for (let i = 0; i < colsX; i++) {
          const chance = random();
          const key = chance < 0.12 ? 'windowsWarm' : chance < 0.33 ? 'windowsCool' : 'windowsDark';
          const material = chance < 0.12 ? materials.warmWindow : chance < 0.33 ? materials.coolWindow : materials.window;
          const wx = x - width / 2 + (i + 0.5) * width / colsX;
          addBatch(key, plane, material, wx, y, z + front * (depth / 2 + 0.031), width / colsX - (style === 'glass' ? 0.22 : 0.85), windowHeight, 1, front < 0 ? Math.PI : 0);
        }
        for (let i = 0; i < colsZ; i++) {
          const chance = random();
          const key = chance < 0.1 ? 'windowsWarm' : chance < 0.29 ? 'windowsCool' : 'windowsDark';
          const material = chance < 0.1 ? materials.warmWindow : chance < 0.29 ? materials.coolWindow : materials.window;
          const wz = z - depth / 2 + (i + 0.5) * depth / colsZ;
          addBatch(key, plane, material, x + front * (width / 2 + 0.031), y, wz, depth / colsZ - (style === 'glass' ? 0.22 : 0.85), windowHeight, 1, front * Math.PI / 2);
        }
      }
    }
    // Entrances, roof plant, parapets and corner piers distinguish silhouettes.
    const doorZ = z + depth / 2 + 0.04;
    addBatch('windowsDark', plane, materials.window, x, 1.45, doorZ, 2.1, 2.5, 1, 0);
    block('entranceCanopies', materials.darkTrim, x, 3.05, doorZ + 0.9, 4.2, 0.17, 1.9);
    for (const side of [-1, 1]) {
      block('parapets', materials.trim, x + side * width / 2, height + 0.67, z, 0.3, 0.9, depth);
      block('parapets', materials.trim, x, height + 0.67, z + side * depth / 2, width, 0.9, 0.3);
      if (style === 'glass') block('verticalPiers', materials.darkTrim, x + side * (width / 2 - 0.8), height / 2, z + depth / 2 + 0.1, 0.22, height, 0.17);
    }
    block('roofEquipment', materials.roof, x - width * 0.18, height + 1.1, z, width * 0.26, 1.6, depth * 0.2);
    block('roofEquipment', materials.roof, x + width * 0.24, height + 0.9, z - depth * 0.23, 2.5, 1.1, 3.8);
    addBatch('roofFans', cylinder, materials.iron, x + width * 0.24, height + 1.5, z - depth * 0.23, 0.75, 0.13, 0.75);
    if (++buildingNumber % 9 === 0) {
      addBatch('aerials', cylinder, materials.iron, x, height + 3, z, 0.055, 5, 0.055);
      block('aerialsCross', materials.iron, x, height + 4.5, z, 2.2, 0.04, 0.04);
    }
  }
  for (const x of blockCenters) for (const z of blockCenters) {
    // The entire northeast inner block is the civic plaza.
    if (x === 36 && z === 36) continue;
    if (x === -36 && z === -36) {
      building(-36, -39, 32, 30, 83, 'glass');
      continue;
    }
    const central = Math.abs(x) < 120 && Math.abs(z) < 120;
    const urban = Math.abs(x) < 160 && Math.abs(z) < 160;
    const tall = central && random() > 0.3;
    const height = tall ? 29 + random() * 29 : 9 + random() * (urban ? 17 : 12);
    if ((x + z) % 144 === 0) {
      building(x - 10, z - 2, 17 + random() * 2, 29 + random() * 5, height, tall ? 'glass' : 'brick');
      building(x + 11, z - 8, 17, 18, height * 0.67, 'brick');
      building(x + 11, z + 13, 17, 15, 8 + random() * 8, 'brick');
    } else {
      building(x, z - 8, 32 + random() * 3, 20, height, tall ? 'glass' : 'tower');
      building(x - 10, z + 15, 15, 14, 9 + random() * 11, 'brick');
      building(x + 10, z + 15, 15, 14, 9 + random() * 11, 'brick');
    }
  }

  // Palm foliage is a single curved leaf geometry, instanced across the district.
  const leafGeometry = new THREE.BufferGeometry();
  const leafVertices = [];
  const leafIndices = [];
  for (let segment = 0; segment <= 5; segment++) {
    const t = segment / 5;
    const width = Math.sin(t * Math.PI) * 0.2 + 0.01;
    const y = Math.sin(t * Math.PI) * 0.16 - t * 0.25;
    leafVertices.push(-width, y, t, width, y, t);
    if (segment < 5) {
      const n = segment * 2;
      leafIndices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leafVertices, 3));
  leafGeometry.setIndex(leafIndices);
  leafGeometry.computeVertexNormals();
  function palm(x, z, height = 6.2) {
    addBatch('palmTrunks', trunk, materials.bark, x, height / 2 + 0.16, z, 0.22, height, 0.22);
    addBatch('palmCrowns', sphere, materials.foliage, x, height + 0.1, z, 0.4, 0.5, 0.4);
    for (let leaf = 0; leaf < 9; leaf++) {
      addBatch('palmLeaves', leafGeometry, materials.foliage, x, height + 0.22, z, 1.4, 3.3, 4.5, leaf / 9 * Math.PI * 2 + random() * 0.14);
    }
  }
  for (const road of roads) for (const center of [-108, -36, 36, 108]) {
    for (const side of [-1, 1]) {
      palm(road + side * 12.7, center, 5.2 + random() * 1.8);
      palm(center, road + side * 12.7, 5.2 + random() * 1.8);
      flat('treeGrates', materials.iron, road + side * 12.7, 0.203, center, 1.5, 1.5);
      flat('treeGrates', materials.iron, center, 0.203, road + side * 12.7, 1.5, 1.5);
    }
  }
  function streetLamp(x, z, rotation = 0) {
    addBatch('streetPoles', cylinder, materials.iron, x, 3.55, z, 0.085, 7, 0.085);
    const ax = Math.sin(rotation), az = Math.cos(rotation);
    block('lampArms', materials.iron, x + ax * 0.65, 7.08, z + az * 0.65, 0.09, 0.09, 1.5, undefined, rotation);
    block('lampHousings', materials.iron, x + ax * 1.35, 7.08, z + az * 1.35, 0.54, 0.18, 0.94, undefined, rotation);
    block('lampGlow', materials.lamp, x + ax * 1.35, 6.98, z + az * 1.35, 0.39, 0.02, 0.73, undefined, rotation);
    addBatch('poleBases', cylinder, materials.iron, x, 0.3, z, 0.17, 0.45, 0.17);
  }
  for (const x of roads) for (const z of roads) {
    streetLamp(x + 13, z + 13, Math.PI);
    streetLamp(x - 13, z - 13, 0);
    for (const side of [-1, 1]) {
      const tx = x + side * 10.6, tz = z + side * 10.6;
      addBatch('signalPoles', cylinder, materials.iron, tx, 2.25, tz, 0.055, 4.4, 0.055);
      block('signalBoxes', materials.iron, tx, 4.07, tz, 0.35, 0.98, 0.33);
      addBatch('redSignals', sphere, materials.trafficRed, tx, 4.35, tz - side * 0.18, 0.11, 0.11, 0.045);
      addBatch('greenSignals', sphere, materials.trafficGreen, tx, 3.8, tz - side * 0.18, 0.11, 0.11, 0.045);
    }
  }

  // Civic square: paths and central rendezvous remain clear for navigation.
  flat('plazaPaving', materials.brick, 36, 0.199, 36, 43, 43);
  flat('plazaPaths', materials.sidewalk, 36, 0.206, 36, 8, 44);
  flat('plazaPaths', materials.sidewalk, 36, 0.207, 36, 44, 8);
  for (const px of [23, 49]) for (const pz of [23, 49]) {
    if (px === 49 && pz === 49) continue;
    flat('lawns', materials.grass, px, 0.212, pz, 13, 13);
    palm(px, pz, 7.5);
  }
  // Low basin sits off the principal plaza paths.
  addBatch('fountainBase', cylinder, materials.trim, 48, 0.38, 48, 4.1, 0.4, 4.1);
  addBatch('fountainWater', cylinder, materials.water, 48, 0.596, 48, 3.65, 0.045, 3.65);
  addBatch('fountainCentre', cylinder, materials.trim, 48, 1.13, 48, 0.8, 1.05, 0.8);
  const fountain = new THREE.Group();
  const jetGeometry = new THREE.CylinderGeometry(0.035, 0.075, 1.3, 6);
  const jetMaterial = new THREE.MeshStandardMaterial({ color: 0xb5d7d2, emissive: 0x89b3b4, emissiveIntensity: 0.18, transparent: true, opacity: 0.7, roughness: 0.2 });
  for (let n = 0; n < 8; n++) {
    const jet = new THREE.Mesh(jetGeometry, jetMaterial);
    const angle = n / 8 * Math.PI * 2;
    jet.position.set(Math.sin(angle) * 1.25, 1.55, Math.cos(angle) * 1.25);
    jet.rotation.z = Math.sin(angle) * -0.35;
    jet.rotation.x = Math.cos(angle) * 0.35;
    fountain.add(jet);
  }
  fountain.position.set(48, 0, 48);
  group.add(fountain);
  looseObjects.push(fountain);
  function bench(x, z, rotation = 0) {
    block('benchSeats', materials.bench, x, 0.7, z, 2.3, 0.12, 0.62, undefined, rotation);
    const offsetX = Math.sin(rotation) * 0.28, offsetZ = Math.cos(rotation) * 0.28;
    block('benchBacks', materials.bench, x + offsetX, 1.03, z + offsetZ, 2.3, 0.57, 0.08, undefined, rotation);
    for (const side of [-1, 1]) {
      block('benchLegs', materials.iron, x + Math.cos(rotation) * side * 0.86, 0.43, z - Math.sin(rotation) * side * 0.86, 0.08, 0.5, 0.55, undefined, rotation);
    }
  }
  for (const z of [24, 48]) {
    bench(30, z, Math.PI / 2);
    bench(42, z, -Math.PI / 2);
  }
  // Curated street furniture gives pedestrian scale without extra mesh objects.
  for (const x of [-108, -36, 36, 108]) {
    bench(x, -12.5, 0);
    addBatch('bins', cylinder, materials.iron, x + 3.3, 0.66, -12.5, 0.33, 0.98, 0.33);
    block('busShelterPosts', materials.iron, x - 9, 1.52, 13, 0.08, 2.64, 0.08);
    block('busShelterPosts', materials.iron, x - 5, 1.52, 13, 0.08, 2.64, 0.08);
    block('busShelterRoofs', materials.darkTrim, x - 7, 2.85, 13, 4.8, 0.13, 1.7);
    addBatch('busShelterGlass', plane, materials.window, x - 7, 1.55, 13.68, 4.15, 2.4, 1, 0);
    bench(x - 7, 13.25, Math.PI);
  }
  // Small non-colliding parked delivery objects are kept entirely off active lanes.
  for (let n = 0; n < 9; n++) {
    const px = n % 2 ? -57 : 57;
    const pz = -121 + n * 28;
    block('utilityBoxes', materials.darkTrim, px, 0.68, pz, 0.7, 1.2, 0.65);
    block('utilityLabels', materials.trim, px, 0.85, pz + 0.33, 0.33, 0.2, 0.02);
  }

  // West-facing waterfront beyond the playable district, with a continuous quay.
  block('quay', materials.trim, -213, 0.11, 0, 12, 0.35, 450);
  flat('beach', materials.sand, -222, -0.045, 0, 13, 490);
  const waterGeometry = new THREE.PlaneGeometry(532, 1050, quality === 'high' ? 20 : 8, 12);
  const water = new THREE.Mesh(waterGeometry, materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(-492, -0.23, 0);
  water.receiveShadow = true;
  group.add(water);
  looseObjects.push(water);
  for (let z = -204; z <= 204; z += 12) {
    addBatch('quayPosts', cylinder, materials.iron, -216.9, 0.71, z, 0.055, 1.1, 0.055);
    block('quayRail', materials.iron, -216.9, 1.13, z + 6, 0.045, 0.045, 12);
    if (z % 24 === -12 || z % 24 === 12) palm(-209.8, z, 7.3);
  }
  for (let n = 0; n < 24; n++) {
    const z = -260 + n * 24 + random() * 10;
    const h = 20 + random() * 58;
    block('distantSkyline', materials.wall, -455 - random() * 50, h / 2 - 0.1, z, 10 + random() * 17, h, 14 + random() * 15, 0x667c80);
  }

  // District identity is painted onto a few physical signs, never the interface.
  function sign(label, x, y, z, width, rotation = 0) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#283d44'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ece8d7'; ctx.font = '600 45px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 66);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.push(tex);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation;
    group.add(mesh); looseObjects.push(mesh);
  }
  block('plazaSign', materials.iron, 17, 1.28, 17, 0.1, 2.2, 0.1);
  sign('MERIDIAN SQUARE', 17, 2.1, 17, 5);
  sign('HARBOUR AVENUE', -12.3, 3.1, 12.5, 2.8);
  sign('MERIDIAN', -36, 15.2, 144.1, 7);

  for (const [name, batch] of batches) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.items.length);
    mesh.name = name;
    batch.items.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      if (item.color !== undefined) mesh.setColorAt(index, colorScratch.setHex(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = ['buildingWalls', 'parapets', 'roofEquipment', 'palmTrunks', 'palmLeaves', 'benchSeats', 'streetPoles'].includes(name);
    mesh.receiveShadow = !['windowsDark', 'windowsWarm', 'windowsCool', 'lampGlow', 'redSignals', 'greenSignals'].includes(name);
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const geometries = new Set([box, plane, cylinder, trunk, sphere, cone, leafGeometry, waterGeometry, jetGeometry]);
  for (const object of looseObjects) object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
  });
  let elapsed = 0;
  return {
    group, colliders, roads, bounds: 210, spawn: { x: 0, z: 112 }, plaza: { x: 36, z: 36 }, mapBuildings,
    update(dt, time) {
      elapsed = Number.isFinite(time) ? time : elapsed + dt;
      water.position.y = -0.23 + Math.sin(elapsed * 0.7) * 0.025;
      materials.water.roughness = 0.25 + Math.sin(elapsed * 0.17) * 0.04;
      fountain.children.forEach((jet, index) => {
        jet.scale.y = 0.92 + Math.sin(elapsed * 2.8 + index * 0.4) * 0.09;
      });
    },
    dispose() {
      scene.remove(group);
      geometries.forEach(geometry => geometry.dispose());
      Object.values(materials).forEach(material => material.dispose());
      jetMaterial.dispose();
      looseObjects.forEach(object => object.traverse(child => {
        if (child.isMesh && child.material && !Object.values(materials).includes(child.material) && child.material !== jetMaterial) child.material.dispose();
      }));
      ownedTextures.forEach(tex => tex.dispose());
    },
  };
}
