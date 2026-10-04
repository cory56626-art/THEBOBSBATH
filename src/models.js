import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Compact, metre-scale models. All actors face local -Z and stand on y = 0.
const libraries = new WeakMap();

function library(THREE) {
  if (libraries.has(THREE)) return libraries.get(THREE);
  const value = {
    geometries: new Map([
      ['box', new THREE.BoxGeometry(1, 1, 1)],
      ['sphere', new THREE.SphereGeometry(1, 10, 7)],
      ['cylinder', new THREE.CylinderGeometry(1, 1, 1, 12)],
    ]),
    materials: new Map(),
  };
  libraries.set(THREE, value);
  return value;
}

function material(THREE, color, options = {}) {
  const cache = library(THREE).materials;
  const key = JSON.stringify([color, options]);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options }));
  return cache.get(key);
}

function mesh(THREE, parent, geometry, mat, position, scale, rotation) {
  const object = new THREE.Mesh(typeof geometry === 'string' ? library(THREE).geometries.get(geometry) : geometry, mat);
  if (position) object.position.set(...position);
  if (scale) object.scale.set(...scale);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(THREE, parent, mat, size, position, rotation) {
  return mesh(THREE, parent, 'box', mat, position, size, rotation);
}

// Batch rigid parts in the coordinate space of each animation pivot. Vertex
// colours retain the individual paint, skin and fabric colours in one draw.
function batchRigidParts(THREE, group, vertexMaterial, retainedMaterials = new Set(), retainedObjects = new Set(), replacements = new Map()) {
  for (const child of [...group.children]) {
    if (child.isGroup) batchRigidParts(THREE, child, vertexMaterial, retainedMaterials, retainedObjects, replacements);
  }
  const batches = new Map();
  for (const child of group.children) {
    if (!child.isMesh || retainedObjects.has(child)) continue;
    const key = retainedMaterials.has(child.material) ? child.material : vertexMaterial;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(child);
  }
  for (const [batchMaterial, members] of batches) {
    if (members.length < 2) continue;
    for (const member of members) member.updateMatrix();
    const useColors = batchMaterial === vertexMaterial;
    const key = `batch:${useColors}:${members.map(member => `${member.geometry.uuid}:${useColors ? member.material.color.getHex() : ''}:${member.matrix.elements.map(value => value.toFixed(5)).join(',')}`).join('|')}`;
    const cache = library(THREE).geometries;
    if (!cache.has(key)) {
      const geometries = members.map(member => {
        const geometry = member.geometry.index ? member.geometry.toNonIndexed() : member.geometry.clone();
        geometry.deleteAttribute('uv');
        geometry.applyMatrix4(member.matrix);
        if (useColors) {
          const count = geometry.attributes.position.count;
          const colors = new Float32Array(count * 3);
          const color = member.material.color;
          for (let vertex = 0; vertex < count; vertex++) {
            colors[vertex * 3] = color.r;
            colors[vertex * 3 + 1] = color.g;
            colors[vertex * 3 + 2] = color.b;
          }
          geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }
        return geometry;
      });
      cache.set(key, mergeGeometries(geometries));
      for (const geometry of geometries) geometry.dispose();
    }
    const combined = new THREE.Mesh(cache.get(key), batchMaterial);
    combined.name = 'Batched rigid details';
    combined.castShadow = members.some(member => member.castShadow);
    combined.receiveShadow = members.some(member => member.receiveShadow);
    for (const member of members) {
      group.remove(member);
      replacements.set(member, combined);
    }
    group.add(combined);
  }
  return replacements;
}

// Two rectangular sections create the sloping roof and the shaped hood/trunk.
function hull(THREE, name, bottom, top) {
  const cache = library(THREE).geometries;
  if (cache.has(name)) return cache.get(name);
  const [yb, xb, zb0, zb1] = bottom;
  const [yt, xt, zt0, zt1] = top;
  const points = [
    [-xb, yb, zb0], [xb, yb, zb0], [xb, yb, zb1], [-xb, yb, zb1],
    [-xt, yt, zt0], [xt, yt, zt0], [xt, yt, zt1], [-xt, yt, zt1],
  ];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const positions = [];
  for (const [a, b, c, d] of faces) for (const index of [a, b, c, a, c, d]) positions.push(...points[index]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  cache.set(name, geometry);
  return geometry;
}

function pane(THREE, parent, name, points, mat) {
  const cache = library(THREE).geometries;
  if (!cache.has(name)) {
    const positions = [0, 1, 2, 0, 2, 3].flatMap(index => points[index]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    cache.set(name, geometry);
  }
  const object = mesh(THREE, parent, cache.get(name), mat);
  object.castShadow = false;
  return object;
}

export function createCar(THREE, { color = 0x687987, police = false } = {}) {
  const car = new THREE.Group();
  car.name = police ? 'Patrol sedan' : 'City sedan';
  const paint = material(THREE, police ? 0x20262e : color, { roughness: 0.32, metalness: 0.48 });
  const dark = material(THREE, 0x17202b, { roughness: 0.66 });
  const rubber = material(THREE, 0x151819, { roughness: 0.96 });
  const alloy = material(THREE, 0x9ca6ad, { roughness: 0.3, metalness: 0.85 });
  const glass = material(THREE, 0x23394a, { roughness: 0.16, metalness: 0.48, side: THREE.DoubleSide });
  const headlight = material(THREE, 0xf3ecd5, { emissive: 0xe8dcc0, emissiveIntensity: 0.85, roughness: 0.25 });
  const rearLight = material(THREE, 0xaa1720, { emissive: 0x8f0711, emissiveIntensity: 0.65, roughness: 0.24 });
  const trim = material(THREE, 0x333941, { roughness: 0.45, metalness: 0.45 });

  box(THREE, car, dark, [1.75, 0.2, 4.24], [0, 0.36, 0]);
  mesh(THREE, car, hull(THREE, 'sedan-body', [0.49, 0.95, -2.3, 2.3], [0.97, 0.88, -2.18, 2.18]), paint);
  mesh(THREE, car, hull(THREE, 'sedan-cabin', [0.96, 0.83, -1.08, 1.28], [1.51, 0.67, -0.58, 0.77]), paint);
  // Hood and trunk edges give the silhouette a recognisable, low sedan profile.
  box(THREE, car, paint, [1.7, 0.055, 1.08], [0, 0.991, -1.61], [0.027, 0, 0]);
  box(THREE, car, paint, [1.72, 0.045, 0.91], [0, 0.985, 1.74], [-0.014, 0, 0]);
  box(THREE, car, paint, [1.38, 0.045, 1.38], [0, 1.522, 0.095]);

  pane(THREE, car, 'windshield', [[-0.765, 1.025, -1.035], [0.765, 1.025, -1.035], [0.635, 1.475, -0.624], [-0.635, 1.475, -0.624]], glass);
  pane(THREE, car, 'rear-window', [[0.765, 1.028, 1.223], [-0.765, 1.028, 1.223], [-0.633, 1.47, 0.807], [0.633, 1.47, 0.807]], glass);
  for (const side of [-1, 1]) {
    const xLow = side * 0.819;
    const xHigh = side * 0.685;
    pane(THREE, car, `side-front-${side}`, [[xLow, 1.025, -0.994], [xLow, 1.025, 0.13], [xHigh, 1.461, 0.13], [xHigh, 1.461, -0.557]], glass);
    pane(THREE, car, `side-rear-${side}`, [[xLow, 1.025, 0.215], [xLow, 1.025, 1.157], [xHigh, 1.461, 0.737], [xHigh, 1.461, 0.215]], glass);
    box(THREE, car, trim, [0.025, 0.42, 0.058], [side * 0.758, 1.242, 0.172], [0, 0, side * 0.29]);
    box(THREE, car, paint, [0.17, 0.12, 0.23], [side * 0.98, 1.06, -0.89]);
    box(THREE, car, glass, [0.01, 0.08, 0.17], [side * 1.068, 1.06, -0.87]);
    box(THREE, car, alloy, [0.028, 0.045, 0.16], [side * 0.914, 0.94, -0.03]);
    box(THREE, car, alloy, [0.028, 0.045, 0.16], [side * 0.914, 0.94, 1.03]);
    box(THREE, car, trim, [0.034, 0.038, 3.22], [side * 0.938, 0.68, 0]);
    // A thin door seam, visible even when the paint is dark.
    box(THREE, car, trim, [0.009, 0.4, 0.014], [side * 0.92, 0.745, 0.17]);
  }

  box(THREE, car, trim, [1.79, 0.22, 0.09], [0, 0.575, -2.32]);
  box(THREE, car, trim, [1.81, 0.16, 0.09], [0, 0.555, 2.32]);
  box(THREE, car, dark, [0.79, 0.17, 0.018], [0, 0.792, -2.287]);
  for (let row = 0; row < 3; row++) box(THREE, car, alloy, [0.74, 0.014, 0.022], [0, 0.735 + row * 0.055, -2.307]);
  for (const side of [-1, 1]) {
    box(THREE, car, headlight, [0.4, 0.15, 0.055], [side * 0.649, 0.824, -2.267]);
    box(THREE, car, rearLight, [0.42, 0.16, 0.051], [side * 0.638, 0.811, 2.285]);
    box(THREE, car, alloy, [0.11, 0.085, 0.17], [side * 0.62, 0.41, 2.245]);
  }
  const license = material(THREE, 0xdce0d6, { roughness: 0.85 });
  box(THREE, car, license, [0.39, 0.11, 0.012], [0, 0.688, 2.361]);
  box(THREE, car, license, [0.39, 0.11, 0.012], [0, 0.583, -2.371]);

  car.userData.wheels = [];
  for (const z of [-1.43, 1.43]) for (const side of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(side * 0.914, 0.425, z);
    car.add(wheel);
    mesh(THREE, wheel, 'cylinder', rubber, [0, 0, 0], [0.385, 0.225, 0.385], [0, 0, Math.PI / 2]);
    mesh(THREE, wheel, 'cylinder', dark, [side * 0.122, 0, 0], [0.275, 0.025, 0.275], [0, 0, Math.PI / 2]);
    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = spoke * Math.PI * 2 / 5;
      box(THREE, wheel, alloy, [0.029, 0.36, 0.044], [side * 0.142, 0, 0], [angle, 0, 0]);
    }
    mesh(THREE, wheel, 'cylinder', alloy, [side * 0.157, 0, 0], [0.068, 0.029, 0.068], [0, 0, Math.PI / 2]);
    car.userData.wheels.push(wheel);
  }
  car.userData.tailLights = car.children.filter(child => child.material === rearLight);
  car.userData.headLights = car.children.filter(child => child.material === headlight);
  car.userData.blueLights = [];
  car.userData.redLights = [];

  if (police) {
    const white = material(THREE, 0xe8ebed, { roughness: 0.35, metalness: 0.35 });
    const gold = material(THREE, 0xbba36c, { roughness: 0.42, metalness: 0.65 });
    for (const side of [-1, 1]) {
      box(THREE, car, white, [0.027, 0.29, 2.02], [side * 0.927, 0.82, 0.2]);
      mesh(THREE, car, 'cylinder', gold, [side * 0.946, 0.83, -0.35], [0.115, 0.012, 0.115], [0, 0, Math.PI / 2]);
    }
    box(THREE, car, dark, [1.04, 0.055, 0.24], [0, 1.568, 0.02]);
    const blue = material(THREE, 0x1882ff, { emissive: 0x086eff, emissiveIntensity: 2.4, roughness: 0.25 });
    const red = material(THREE, 0xef2538, { emissive: 0xff1230, emissiveIntensity: 2.4, roughness: 0.25 });
    car.userData.blueLights.push(box(THREE, car, blue, [0.41, 0.085, 0.2], [-0.3, 1.636, 0.02]));
    car.userData.redLights.push(box(THREE, car, red, [0.41, 0.085, 0.2], [0.3, 1.636, 0.02]));
    for (const side of [-1, 1]) {
      const lights = side < 0 ? car.userData.blueLights : car.userData.redLights;
      lights.push(box(THREE, car, side < 0 ? blue : red, [0.1, 0.048, 0.021], [side * 0.255, 0.835, -2.32]));
    }
    box(THREE, car, dark, [0.022, 0.38, 0.022], [0.41, 1.675, 0.77], [0.2, 0, 0]);
  }
  car.userData.dimensions = { width: 2.18, length: 4.75, height: police ? 1.83 : 1.55 };
  const batchedMaterial = material(THREE, 0xffffff, { vertexColors: true, roughness: 0.68, metalness: 0.12 });
  const retained = new Set([paint, glass, headlight, rearLight, ...car.userData.blueLights.map(light => light.material), ...car.userData.redLights.map(light => light.material)]);
  const replacements = batchRigidParts(THREE, car, batchedMaterial, retained);
  for (const key of ['tailLights', 'headLights', 'blueLights', 'redLights']) {
    car.userData[key] = [...new Set(car.userData[key].map(light => replacements.get(light) ?? light))];
  }
  return car;
}

function randomValue(seed, salt) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createPerson(THREE, { kind = 'civilian', seed = 0 } = {}) {
  const person = new THREE.Group();
  person.name = `${kind} pedestrian`;
  const officer = kind === 'police' || kind === 'cop' || kind === 'officer';
  const hostile = kind === 'hostile' || kind === 'terrorist';
  const skinTones = [0xd4a17d, 0xb98260, 0x8a5b40, 0xe3b99b, 0x624333];
  const shirts = [0x687a81, 0x805f4d, 0x759180, 0x64728b, 0xa09a86, 0x9f716c, 0x637362];
  const pants = [0x354149, 0x464c51, 0x585249, 0x34455b, 0x5d6455];
  const skin = material(THREE, skinTones[Math.floor(randomValue(seed, 1) * skinTones.length)]);
  const clothing = material(THREE, officer ? 0x253748 : hostile ? 0x686553 : shirts[Math.floor(randomValue(seed, 2) * shirts.length)]);
  const trousers = material(THREE, officer ? 0x253242 : pants[Math.floor(randomValue(seed, 3) * pants.length)]);
  const shoe = material(THREE, 0x25272a, { roughness: 0.9 });
  const hair = material(THREE, [0x30271f, 0x181b1c, 0x514333, 0x6e5b41][Math.floor(randomValue(seed, 4) * 4)]);
  const eyes = material(THREE, 0x24272b);
  const belt = material(THREE, 0x282b2d);

  // Torso narrows at the waist instead of being a single rectangular block.
  mesh(THREE, person, hull(THREE, 'human-shirt', [0.88, 0.165, -0.105, 0.105], [1.4, 0.222, -0.13, 0.13]), clothing);
  box(THREE, person, trousers, [0.35, 0.2, 0.245], [0, 0.88, 0]);
  box(THREE, person, belt, [0.366, 0.05, 0.254], [0, 0.98, 0]);
  mesh(THREE, person, 'cylinder', skin, [0, 1.455, 0], [0.065, 0.105, 0.065]);
  const head = new THREE.Group();
  head.position.set(0, 1.625, -0.006);
  head.name = 'head';
  person.add(head);
  mesh(THREE, head, 'sphere', skin, [0, 0, 0], [0.137, 0.184, 0.124]);
  mesh(THREE, head, 'sphere', hair, [0, 0.098, 0.013], [0.14, 0.092, 0.123]);
  box(THREE, head, hair, [0.21, 0.12, 0.053], [0, 0.043, 0.1]);
  mesh(THREE, head, 'sphere', skin, [0, 0, -0.125], [0.026, 0.038, 0.032]);
  for (const side of [-1, 1]) {
    mesh(THREE, head, 'sphere', skin, [side * 0.137, 0.003, 0.006], [0.025, 0.047, 0.028]);
    box(THREE, head, eyes, [0.022, 0.011, 0.007], [side * 0.047, 0.046, -0.106]);
  }

  person.userData.arms = [];
  person.userData.legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.103, 0.87, 0);
    person.add(leg);
    mesh(THREE, leg, 'cylinder', trousers, [0, -0.198, 0], [0.095, 0.405, 0.094]);
    mesh(THREE, leg, 'sphere', trousers, [0, -0.398, 0], [0.091, 0.09, 0.086]);
    mesh(THREE, leg, 'cylinder', trousers, [0, -0.589, -0.005], [0.075, 0.37, 0.08]);
    box(THREE, leg, shoe, [0.16, 0.114, 0.27], [0, -0.812, -0.063]);
    person.userData.legs.push(leg);

    const arm = new THREE.Group();
    arm.position.set(side * 0.244, 1.36, 0);
    arm.rotation.z = side * 0.055;
    person.add(arm);
    mesh(THREE, arm, 'sphere', clothing, [0, -0.025, 0], [0.097, 0.102, 0.095]);
    mesh(THREE, arm, 'cylinder', clothing, [0, -0.144, 0], [0.073, 0.259, 0.075]);
    mesh(THREE, arm, 'sphere', skin, [0, -0.29, 0], [0.066, 0.067, 0.066]);
    mesh(THREE, arm, 'cylinder', officer || hostile ? clothing : skin, [0, -0.405, -0.013], [0.059, 0.22, 0.058], [0.11, 0, 0]);
    mesh(THREE, arm, 'sphere', skin, [0, -0.533, -0.032], [0.055, 0.072, 0.045]);
    person.userData.arms.push(arm);
  }

  if (officer) {
    const insignia = material(THREE, 0xc6b478, { roughness: 0.45, metalness: 0.55 });
    const uniform = material(THREE, 0x1b2c3b);
    box(THREE, person, uniform, [0.335, 0.31, 0.032], [0, 1.227, -0.127]);
    box(THREE, person, insignia, [0.036, 0.055, 0.013], [-0.089, 1.324, -0.149]);
    box(THREE, person, belt, [0.07, 0.095, 0.037], [0.116, 1.262, -0.151]);
    mesh(THREE, head, 'cylinder', uniform, [0, 0.153, 0.006], [0.145, 0.092, 0.135]);
    box(THREE, head, uniform, [0.24, 0.022, 0.132], [0, 0.12, -0.103]);
    box(THREE, head, insignia, [0.035, 0.028, 0.012], [0, 0.165, -0.129]);
    box(THREE, person, belt, [0.078, 0.14, 0.09], [-0.209, 0.98, 0.019]);
  }
  if (officer || hostile || kind === 'player') {
    const gun = new THREE.Group();
    gun.name = 'Sidearm';
    const metal = material(THREE, 0x33383b, { roughness: 0.4, metalness: 0.75 });
    box(THREE, gun, metal, [0.052, 0.072, 0.225], [0, 0.012, -0.073]);
    box(THREE, gun, belt, [0.048, 0.102, 0.061], [0, -0.063, 0.005], [-0.19, 0, 0]);
    box(THREE, gun, metal, [0.029, 0.025, 0.065], [0, 0, -0.194]);
    gun.position.set(0, -0.514, -0.072);
    gun.rotation.x = 0.43;
    person.userData.arms[1].add(gun);
    person.userData.weapon = gun;
  }
  person.userData.kind = kind;
  person.userData.head = head;
  person.userData.height = officer ? 1.83 : 1.815;
  const batchedMaterial = material(THREE, 0xffffff, { vertexColors: true, roughness: 0.86 });
  batchRigidParts(THREE, person, batchedMaterial, new Set(), new Set([head]));
  return person;
}
