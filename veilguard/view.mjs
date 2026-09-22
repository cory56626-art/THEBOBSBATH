import * as T from '../backrooms/vendor/three.js';
import { SoftwareRenderer } from './software-renderer.mjs?v=3';
import { PATH, TOWERS, ENEMIES, TILE_X, TILE_Z } from './data.mjs';
import { nearestTile, positionOnPath, towerStats } from './sim.mjs';

const metal = (color, emissive = 0x000000, intensity = 0) => new T.MeshStandardMaterial({
  color, roughness: .5, metalness: .48, emissive, emissiveIntensity: intensity,
});
const dark = metal(0x272c37), charcoal = metal(0x171c27), gold = metal(0xb89454, 0x392411, .28);
const glow = color => metal(color, color, .85);
const unit = (geometry, material, parent, x = 0, y = 0, z = 0) => {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};
const box = (parent, w, h, d, material, x = 0, y = 0, z = 0) => unit(new T.BoxGeometry(w, h, d), material, parent, x, y, z);
const cyl = (parent, rt, rb, h, material, x = 0, y = 0, z = 0, sides = 8) =>
  unit(new T.CylinderGeometry(rt, rb, h, sides), material, parent, x, y, z);

export class WorldView {
  constructor(canvas) {
    try {
      const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
      if (context) this.renderer = new T.WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'high-performance' });
    } catch { /* Fall back to the CPU canvas renderer below. */ }
    if (!this.renderer) {
      try {
        this.renderer = new SoftwareRenderer(canvas);
      } catch {
        const replacement = document.createElement('canvas');
        replacement.id = canvas.id;
        replacement.setAttribute('aria-label', canvas.getAttribute('aria-label') || '3D game battlefield');
        canvas.replaceWith(replacement);
        this.renderer = new SoftwareRenderer(replacement);
      }
    }
    this.softwareMode = this.renderer.isSoftwareRenderer === true;
    if (this.softwareMode) document.body.classList.add('software-rendering');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.72;
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x1b2a3b);
    this.scene.fog = new T.FogExp2(0x26384b, .011);
    this.camera = new T.OrthographicCamera(-20, 20, 12, -12, .1, 130);
    this.orbit = .77;
    this.zoom = 1;
    this.camera.position.set(24, 30, 23);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new T.HemisphereLight(0xc5dcff, 0x544657, 3.1));
    const sun = new T.DirectionalLight(0xffe4bd, 3.1);
    sun.position.set(-8, 18, 9);
    this.scene.add(sun);
    const fill = new T.DirectionalLight(0x95baff, 1.8);
    fill.position.set(12, 11, -12);
    this.scene.add(fill);
    const blue = new T.PointLight(0x87b0ff, 125, 36, 2);
    blue.position.set(8, 5, -6);
    this.scene.add(blue);
    this.towerMeshes = new Map();
    this.enemyMeshes = new Map();
    this.projectiles = [];
    this.flashes = [];
    this.time = 0;
    this.renderElapsed = 0;
    this.selected = null;
    this.ghostTile = null;
    this.makeBoard();
    this.makeBeacon();
    this.makeGhost();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  makeBoard() {
    // The canvas renderer must draw broad ground surfaces before small tiles.
    // Sorting the board's huge triangles by their centers hides the field.
    box(this.scene, 29.5, .88, 20.1, metal(0x353a45), 0, -.71, 0).userData.cpuLayer = 0;
    box(this.scene, 29.2, .12, 19.8, gold, 0, -.23, 0).userData.cpuLayer = 1;
    box(this.scene, 28.9, .2, 19.5, metal(0x303948), 0, -.11, 0).userData.cpuLayer = 2;
    for (const x of TILE_X) for (const z of TILE_Z) {
      const tone = ((x + z) / 2) % 2 ? 0x465363 : 0x3c4959;
      const square = box(this.scene, 1.94, .04, 1.94, metal(tone), x, .015, z);
      square.userData.tile = true;
      square.userData.cpuLayer = 3;
    }
    for (let i = 1; i < PATH.length; i++) {
      const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i];
      const length = Math.hypot(ax - bx, az - bz);
      const route = box(this.scene, 2.22, .085, length + .08, metal(0x776b5b), (ax + bx) / 2, .072, (az + bz) / 2);
      route.userData.cpuLayer = 4;
      route.rotation.y = -Math.atan2(bx - ax, bz - az);
      for (const side of [-1, 1]) {
        const edge = box(this.scene, .065, .08, length, glow(0xf1bd71), side * 1.05, .135, 0);
        edge.userData.cpuLayer = 5;
        route.add(edge);
      }
      const mark = box(this.scene, .07, .045, Math.max(.2, length - .8), glow(0xe4d2ae), 0, .082, 0);
      mark.userData.cpuLayer = 5;
      route.add(mark);
    }
    for (const [x, z] of PATH) cyl(this.scene, 1.12, 1.12, .09, metal(0x303645), x, .104, z, 12).userData.cpuLayer = 4;
    // Peripheral architecture creates depth without requiring downloaded assets.
    for (let i = 0; i < 27; i++) {
      const angle = i * 2.39996, radius = 19 + (i % 4) * 2;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const height = 1.1 + (i * 7 % 6) * .68;
      const shard = unit(new T.ConeGeometry(.55 + (i % 3) * .23, height, 5), metal(i % 5 ? 0x202637 : 0x3d344d), this.scene, x, height / 2 - .4, z);
      shard.rotation.y = angle;
      shard.rotation.z = Math.sin(i) * .13;
    }
    const entrance = cyl(this.scene, .95, 1.2, .38, metal(0x6d473b, 0x9f5424, .8), -14, .23, 2, 12);
    entrance.rotation.y = .3;
    cyl(this.scene, .53, .53, .06, glow(0xff986a), -14, .45, 2, 12);
  }

  makeBeacon() {
    const base = new T.Group();
    base.position.set(13.8, .1, 0);
    this.scene.add(base);
    cyl(base, 1.15, 1.45, .7, dark, 0, .29, 0, 8);
    cyl(base, .72, 1.03, 1.75, metal(0x53505d), 0, 1.45, 0, 6);
    cyl(base, .82, .82, .17, gold, 0, 2.35, 0, 8);
    const core = unit(new T.OctahedronGeometry(.71, 0), glow(0xffc975), base, 0, 3.13, 0);
    this.beaconCore = core;
    const ring = unit(new T.TorusGeometry(.98, .065, 5, 32), gold, base, 0, 3.1, 0);
    ring.rotation.x = .42;
    this.beaconRing = ring;
    this.beaconLight = new T.PointLight(0xffbc68, 46, 10, 2);
    this.beaconLight.position.set(13.8, 3.2, 0);
    this.scene.add(this.beaconLight);
  }

  makeGhost() {
    this.ghost = new T.Group();
    const marker = box(this.ghost, 1.83, .055, 1.83, new T.MeshBasicMaterial({ color: 0x71d9b4, transparent: true, opacity: .22, depthWrite: false }), 0, .21, 0);
    marker.material.side = T.DoubleSide;
    this.ghostEdge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.84, .08, 1.84)), new T.LineBasicMaterial({ color: 0x80f4c5 }));
    this.ghostEdge.position.y = .21;
    this.ghost.add(this.ghostEdge);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.range = unit(new T.RingGeometry(.99, 1, 80), new T.MeshBasicMaterial({ color: 0xf7d897, transparent: true, opacity: .52, side: T.DoubleSide, depthWrite: false }), this.scene);
    this.range.rotation.x = -Math.PI / 2;
    this.range.position.y = .16;
    this.range.visible = false;
  }

  setGhost(tile, valid, range) {
    this.ghostTile = tile;
    this.ghost.visible = !!tile;
    if (tile) {
      this.ghost.position.set(tile.x, 0, tile.z);
      this.ghost.children[0].material.color.setHex(valid ? 0x61d8ae : 0xff7082);
      this.ghostEdge.material.color.setHex(valid ? 0x88f8c8 : 0xff8c98);
    }
    if (tile && range) this.setRange(tile.x, tile.z, range, true);
  }

  setRange(x, z, radius, show) {
    this.range.visible = show;
    if (show) {
      this.range.position.x = x;
      this.range.position.z = z;
      this.range.scale.set(radius, radius, radius);
    }
  }

  makeTower(tower) {
    this.removeTower(tower.id);
    const info = TOWERS[tower.type], color = new T.Color(info.color);
    const bright = glow(color), armor = metal(0x596577), accent = metal(color, color, .24);
    const root = new T.Group();
    root.position.set(tower.x, .15, tower.z);
    root.userData.towerId = tower.id;
    this.scene.add(root);
    cyl(root, .7, .79, .2, dark, 0, .1, 0, 8);
    cyl(root, .59, .62, .075, accent, 0, .23, 0, 8);
    // An invisible, generous hit target makes selecting a defender reliable on touch.
    unit(new T.CylinderGeometry(.72, .72, 2.2, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), root, 0, 1.05, 0);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      cyl(root, .13, .13, .29, dark, side * .17, .39, .02, 8);
      const leg = new T.Group();
      leg.position.set(side * .17, .56, 0);
      root.add(leg);
      legs.push(leg);
      cyl(leg, .115, .15, .38, armor, 0, -.15, 0, 7);
      unit(new T.SphereGeometry(.14, 7, 5), accent, leg, 0, -.31, .025);
    }
    cyl(root, .31, .27, .53, armor, 0, .87, 0, 7);
    box(root, .39, .15, .1, accent, 0, .83, .25);
    for (const side of [-1, 1]) {
      unit(new T.SphereGeometry(.21, 7, 5), armor, root, side * .32, 1.03, 0);
      const arm = new T.Group();
      arm.position.set(side * .34, .93, .02);
      root.add(arm);
      arms.push(arm);
      const upper = cyl(arm, .105, .13, .4, armor, 0, -.2, .01, 7);
      upper.rotation.z = side * -.18;
      unit(new T.SphereGeometry(.115, 7, 5), accent, arm, 0, -.39, .07);
    }
    const head = new T.Group();
    head.position.y = 1.13;
    root.add(head);
    unit(new T.SphereGeometry(.205, 9, 7), metal(0xd5b79b), head, 0, .23, 0);
    unit(new T.SphereGeometry(.235, 8, 5), armor, head, 0, .31, -.015);
    box(head, .31, .095, .12, bright, 0, .25, .195);
    box(head, .28, .13, .27, accent, 0, .47, -.025);
    box(root, .49, .12, .35, dark, 0, .89, -.28);
    if (tower.type === 'relay') {
      cyl(root, .04, .06, .48, gold, 0, 1.2, -.37, 6);
      unit(new T.SphereGeometry(.12, 7, 5), bright, root, 0, 1.45, -.37);
      const antennaRing = unit(new T.TorusGeometry(.22, .035, 5, 18), bright, root, 0, 1.39, -.37);
      antennaRing.rotation.x = Math.PI / 2;
    }
    if (tower.type === 'spark') {
      const barrel = cyl(head, .105, .135, .82, accent, .42, .02, .17, 8);
      barrel.rotation.z = Math.PI / 2;
      box(head, .31, .24, .24, dark, .35, .06, .17);
      cyl(head, .14, .14, .11, bright, .84, .02, .17, 8).rotation.z = Math.PI / 2;
      box(head, .27, .08, .08, gold, .36, .2, .17);
    } else if (tower.type === 'prism') {
      const staff = cyl(head, .055, .075, 1.03, accent, .49, .08, .18, 7);
      staff.rotation.z = Math.PI / 2;
      unit(new T.OctahedronGeometry(.25), bright, head, 1.01, .08, .18);
      unit(new T.OctahedronGeometry(.13), gold, head, .52, .08, .18);
    } else if (tower.type === 'frost') {
      const nozzle = cyl(head, .17, .24, .67, accent, .43, .04, .17, 7);
      nozzle.rotation.z = Math.PI / 2;
      unit(new T.IcosahedronGeometry(.22, 0), bright, head, .82, .04, .17);
      for (const side of [-1, 1]) {
        const shard = unit(new T.ConeGeometry(.095, .35, 4), bright, head, .37, .31, .17 + side * .16);
        shard.rotation.z = Math.PI / 2;
      }
    } else if (tower.type === 'relay') {
      const tablet = box(head, .33, .28, .08, dark, .31, .03, .19);
      tablet.rotation.z = -.12;
      box(head, .22, .16, .035, bright, .31, .03, .237);
    } else if (tower.type === 'mortar') {
      const cannon = cyl(head, .17, .23, .95, accent, .42, .22, .17, 8);
      cannon.rotation.z = Math.PI / 2.85;
      const rim = cyl(head, .23, .23, .11, bright, .83, .4, .17, 8);
      rim.rotation.z = Math.PI / 2.85;
      box(head, .38, .13, .24, dark, .27, -.09, .17);
    } else {
      for (const side of [-1, 1]) {
        const barrel = cyl(head, .1, .14, .74, accent, .44, .02, .17 + side * .19, 8);
        barrel.rotation.z = Math.PI / 2;
        cyl(head, .12, .12, .1, bright, .82, .02, .17 + side * .19, 8).rotation.z = Math.PI / 2;
      }
      box(root, .17, .52, .54, gold, -.36, .92, -.05);
    }
    for (let i = 0; i < tower.level; i++) {
      const gem = unit(new T.SphereGeometry(.075, 6, 4), bright, root, -.25 + i * .125, .58, .29);
      gem.rotation.y = Math.PI / 4;
    }
    this.towerMeshes.set(tower.id, { root, head, info, recoil: 0, phase: Math.random() * 6, legs, arms });
    return root;
  }

  removeTower(id) {
    const mesh = this.towerMeshes.get(id);
    if (mesh) this.scene.remove(mesh.root);
    this.towerMeshes.delete(id);
  }

  makeEnemy(enemy) {
    const info = ENEMIES[enemy.type], scale = info.boss ? 1.5 : info.air ? .95 : .92;
    const root = new T.Group();
    root.position.set(enemy.x, info.air ? 1.5 : .23, enemy.z);
    root.scale.setScalar(scale);
    const shell = info.armor ? metal(0x8493a3) : metal(info.color, info.color, .12), eye = glow(info.color);
    // Enemy units are now readable little armored people: head, torso, arms, and legs.
    for (const side of [-1, 1]) {
      const leg = new T.Group();
      leg.position.set(side * .15, .45, 0);
      root.add(leg);
      cyl(leg, .12, .15, .4, shell, 0, -.17, 0, 6);
      unit(new T.SphereGeometry(.15, 6, 4), dark, leg, 0, -.36, .035);
    }
    cyl(root, .3, .26, .53, shell, 0, .78, 0, 7);
    box(root, .59, .18, .34, shell, 0, .96, -.015);
    box(root, .34, .1, .07, eye, 0, 1.06, .18);
    const arms = [];
    for (const side of [-1, 1]) {
      unit(new T.SphereGeometry(.14, 6, 4), shell, root, side * .34, .98, 0);
      const arm = new T.Group();
      arm.position.set(side * .35, .94, 0);
      root.add(arm);
      const forearm = cyl(arm, .105, .13, .42, shell, 0, -.19, 0, 6);
      forearm.rotation.z = side * -.14;
      unit(new T.SphereGeometry(.12, 6, 4), dark, arm, 0, -.39, .035);
      arms.push(arm);
    }
    unit(new T.SphereGeometry(.195, 8, 6), metal(0xd0ad8e), root, 0, 1.27, 0);
    unit(new T.SphereGeometry(.225, 8, 5), shell, root, 0, 1.34, -.035);
    box(root, .3, .075, .1, eye, 0, 1.285, .19);
    const legs = root.children.filter(child => child.type === 'Group' && child.position.y === .45);
    if (info.boss) {
      const crown = unit(new T.TorusGeometry(.42, .065, 6, 10), gold, root, 0, 1.58, 0);
      crown.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const horn = unit(new T.ConeGeometry(.11, .4, 5), gold, root, side * .35, 1.48, -.02);
        horn.rotation.z = side * -.45;
      }
    } else if (info.air) {
      for (const side of [-1, 1]) {
        const wing = box(root, .77, .08, .37, shell, side * .62, .86, -.16);
        wing.rotation.z = side * .28;
      }
      unit(new T.OctahedronGeometry(.2), eye, root, 0, 1.5, 0);
    }
    if (info.hidden) {
      const halo = unit(new T.TorusGeometry(.65, .045, 5, 20), eye, root, 0, .72, 0);
      halo.rotation.x = Math.PI / 2;
    }
    const hpBack = box(root, 1.18, .085, .055, charcoal, 0, info.boss ? 2.02 : 1.68, 0);
    const hpBar = box(root, 1.12, .055, .065, eye, 0, hpBack.position.y, .04);
    this.scene.add(root);
    this.enemyMeshes.set(enemy.id, { root, hpBar, arms, legs, scale, phase: Math.random() * 6 });
  }

  removeEnemy(id) {
    const visual = this.enemyMeshes.get(id);
    if (visual) this.scene.remove(visual.root);
    this.enemyMeshes.delete(id);
  }

  event(evt) {
    if (evt.type === 'place' || evt.type === 'upgrade') this.makeTower(evt.tower);
    else if (evt.type === 'sell') this.removeTower(evt.tower.id);
    else if (evt.type === 'spawn') this.makeEnemy(evt.enemy);
    else if (evt.type === 'destroy' || evt.type === 'leak') {
      this.burst(evt.enemy.x, ENEMIES[evt.enemy.type].air ? 1.6 : .8, evt.enemy.z, ENEMIES[evt.enemy.type].color);
      this.removeEnemy(evt.enemy.id);
    } else if (evt.type === 'shot') {
      const tower = this.towerMeshes.get(evt.tower.id);
      if (tower) {
        tower.head.rotation.y = -Math.atan2(evt.enemy.z - evt.tower.z, evt.enemy.x - evt.tower.x);
        tower.recoil = .23;
      }
      const shot = unit(new T.SphereGeometry(evt.splash ? .23 : .12, 7, 5), glow(evt.color), this.scene, evt.tower.x, 1.43, evt.tower.z);
      this.projectiles.push({ mesh: shot, from: new T.Vector3(evt.tower.x, 1.43, evt.tower.z),
        to: new T.Vector3(evt.enemy.x, ENEMIES[evt.enemy.type].air ? 1.8 : .82, evt.enemy.z), time: 0, duration: evt.splash ? .38 : .18 });
    }
  }

  burst(x, y, z, color) {
    const mesh = unit(new T.IcosahedronGeometry(.35, 0), new T.MeshBasicMaterial({ color, transparent: true, opacity: .72 }), this.scene, x, y, z);
    this.flashes.push({ mesh, time: 0 });
  }

  sync(battle, dt) {
    this.time += dt;
    this.beaconCore.rotation.y += dt * .7;
    this.beaconCore.position.y = 3.13 + Math.sin(this.time * 2.1) * .09;
    this.beaconRing.rotation.z += dt * .35;
    this.beaconLight.intensity = 43 + Math.sin(this.time * 2.4) * 6;
    for (const enemy of battle?.enemies || []) {
      const visual = this.enemyMeshes.get(enemy.id);
      if (!visual) continue;
      const air = ENEMIES[enemy.type].air;
      visual.root.position.set(enemy.x, (air ? 1.52 : .23) + Math.sin(this.time * (air ? 4 : 9) + visual.phase) * (air ? .19 : .065), enemy.z);
      const next = positionOnPath(enemy.progress + .15);
      visual.root.rotation.y = Math.atan2(next.x - enemy.x, next.z - enemy.z);
      const stride = Math.sin(this.time * 8 + visual.phase) * .34;
      visual.arms.forEach((arm, i) => { arm.rotation.x = stride * (i ? -1 : 1); });
      visual.legs.forEach((leg, i) => { leg.rotation.x = stride * (i ? 1 : -1); });
      const fraction = Math.max(0, enemy.hp / enemy.maxHp);
      visual.hpBar.scale.x = fraction;
      visual.hpBar.position.x = -(1 - fraction) * .56;
    }
    for (const visual of this.towerMeshes.values()) {
      visual.recoil = Math.max(0, visual.recoil - dt * 1.4);
      visual.head.position.y = 1.13 - visual.recoil + Math.sin(this.time * 2.7 + visual.phase) * .025;
      if (visual.head.userData.halo) visual.head.userData.halo.rotation.z += dt;
      visual.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.time * 1.6 + visual.phase + i) * .035; });
      visual.arms.forEach((arm, i) => { arm.rotation.x = Math.sin(this.time * 1.6 + visual.phase + i) * .022; });
    }
    for (const shot of [...this.projectiles]) {
      shot.time += dt;
      const ratio = Math.min(1, shot.time / shot.duration);
      shot.mesh.position.lerpVectors(shot.from, shot.to, ratio);
      shot.mesh.position.y += Math.sin(Math.PI * ratio) * .35;
      if (ratio >= 1) {
        this.scene.remove(shot.mesh);
        this.projectiles.splice(this.projectiles.indexOf(shot), 1);
      }
    }
    for (const flash of [...this.flashes]) {
      flash.time += dt;
      flash.mesh.scale.setScalar(1 + flash.time * 2.5);
      flash.mesh.material.opacity = Math.max(0, .72 - flash.time * 2.2);
      if (flash.time >= .35) {
        this.scene.remove(flash.mesh);
        this.flashes.splice(this.flashes.indexOf(flash), 1);
      }
    }
    if (this.softwareMode) {
      this.renderElapsed += dt;
      if (this.renderElapsed < 1 / 30) return;
      this.renderElapsed = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const point = new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(point, this.camera);
    const hits = ray.intersectObjects([...this.towerMeshes.values()].map(t => t.root), true);
    if (hits.length) {
      let object = hits[0].object;
      while (object && !object.userData.towerId) object = object.parent;
      if (object) return { towerId: object.userData.towerId };
    }
    const intersection = new T.Vector3();
    if (ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), intersection)) {
      return { tile: nearestTile(intersection.x, intersection.z) };
    }
    return {};
  }

  orbitBy(delta) {
    this.orbit += delta;
    this.camera.position.set(Math.cos(this.orbit) * 36, 31, Math.sin(this.orbit) * 36);
    this.camera.lookAt(0, 0, 0);
  }

  resize() {
    const width = innerWidth, height = innerHeight;
    // Keep the whole board visible on narrow displays while allowing desktop zoom.
    const vertical = Math.max(24, 38 * height / width) / this.zoom;
    this.camera.left = -vertical * width / height / 2;
    this.camera.right = -this.camera.left;
    this.camera.top = vertical / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
