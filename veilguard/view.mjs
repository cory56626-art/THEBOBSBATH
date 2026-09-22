import * as T from '../backrooms/vendor/three.js';
import { PATH, TOWERS, ENEMIES, TILE_X, TILE_Z } from './data.mjs';
import { nearestTile, towerStats } from './sim.mjs';

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
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x080c15);
    this.scene.fog = new T.FogExp2(0x080c15, .025);
    this.camera = new T.OrthographicCamera(-20, 20, 12, -12, .1, 130);
    this.orbit = .77;
    this.zoom = 1;
    this.camera.position.set(24, 30, 23);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new T.HemisphereLight(0x9cb4da, 0x15101c, 2.1));
    const sun = new T.DirectionalLight(0xffd49a, 2.5);
    sun.position.set(-8, 18, 9);
    this.scene.add(sun);
    const blue = new T.PointLight(0x87b0ff, 100, 28, 2);
    blue.position.set(8, 5, -6);
    this.scene.add(blue);
    this.towerMeshes = new Map();
    this.enemyMeshes = new Map();
    this.projectiles = [];
    this.flashes = [];
    this.time = 0;
    this.selected = null;
    this.ghostTile = null;
    this.makeBoard();
    this.makeBeacon();
    this.makeGhost();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  makeBoard() {
    box(this.scene, 29.5, .88, 20.1, metal(0x222531), 0, -.71, 0);
    box(this.scene, 29.2, .12, 19.8, gold, 0, -.23, 0);
    box(this.scene, 28.9, .2, 19.5, metal(0x161d2b), 0, -.11, 0);
    for (const x of TILE_X) for (const z of TILE_Z) {
      const tone = ((x + z) / 2) % 2 ? 0x202738 : 0x1d2433;
      const square = box(this.scene, 1.94, .04, 1.94, metal(tone), x, .015, z);
      square.userData.tile = true;
    }
    for (let i = 1; i < PATH.length; i++) {
      const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i];
      const length = Math.hypot(ax - bx, az - bz);
      const route = box(this.scene, 2.22, .085, length + .08, metal(0x303645), (ax + bx) / 2, .072, (az + bz) / 2);
      route.rotation.y = -Math.atan2(bx - ax, bz - az);
      for (const side of [-1, 1]) {
        const edge = box(this.scene, .065, .08, length, glow(0x9b7044), side * 1.05, .135, 0);
        route.add(edge);
      }
      const mark = box(this.scene, .07, .045, Math.max(.2, length - .8), glow(0x7a6554), 0, .082, 0);
      route.add(mark);
    }
    for (const [x, z] of PATH) cyl(this.scene, 1.12, 1.12, .09, metal(0x303645), x, .104, z, 12);
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
    const bright = glow(color), body = metal(0x44434d), accent = metal(color, color, .22);
    const root = new T.Group();
    root.position.set(tower.x, .15, tower.z);
    root.userData.towerId = tower.id;
    this.scene.add(root);
    cyl(root, .83, .94, .32, dark, 0, .15, 0, 8);
    cyl(root, .72, .75, .1, accent, 0, .35, 0, 8);
    box(root, .73, .62, .74, body, 0, .69, 0);
    const head = new T.Group();
    head.position.y = 1.02;
    root.add(head);
    if (tower.type === 'spark') {
      cyl(head, .39, .46, .34, dark, 0, .02, 0);
      const barrel = cyl(head, .12, .17, .88, accent, .52, .06, 0);
      barrel.rotation.z = Math.PI / 2;
      cyl(head, .22, .22, .14, bright, .94, .06, 0);
      for (const side of [-1, 1]) box(head, .48, .1, .13, gold, .27, .27, side * .3);
    } else if (tower.type === 'prism') {
      cyl(head, .38, .47, .28, dark, 0, 0, 0, 6);
      unit(new T.OctahedronGeometry(.42), bright, head, .32, .27, 0);
      for (const side of [-1, 1]) box(head, .72, .09, .12, accent, .31, .16, side * .35);
    } else if (tower.type === 'frost') {
      cyl(head, .37, .44, .28, dark);
      unit(new T.IcosahedronGeometry(.39, 0), bright, head, .34, .2, 0);
      for (const side of [-1, 1]) {
        const shard = unit(new T.ConeGeometry(.15, .52, 4), accent, head, .1, .4, side * .36);
        shard.rotation.z = .3;
      }
    } else if (tower.type === 'relay') {
      cyl(head, .24, .36, .7, accent, 0, .25, 0);
      const halo = unit(new T.TorusGeometry(.5, .062, 6, 22), bright, head, 0, .72, 0);
      halo.rotation.x = Math.PI / 2.8;
      head.userData.halo = halo;
      unit(new T.OctahedronGeometry(.25), bright, head, 0, 1.0, 0);
    } else if (tower.type === 'mortar') {
      cyl(head, .48, .5, .36, dark);
      const cannon = cyl(head, .24, .32, 1.16, accent, .44, .27, 0, 10);
      cannon.rotation.z = Math.PI / 2.6;
      const rim = cyl(head, .32, .32, .13, bright, .95, .51, 0, 10);
      rim.rotation.z = Math.PI / 2.6;
    } else {
      cyl(head, .51, .55, .36, dark, 0, 0, 0, 6);
      for (const side of [-1, 1]) {
        const barrel = cyl(head, .13, .22, .99, accent, .46, .16, side * .26);
        barrel.rotation.z = Math.PI / 2;
        unit(new T.OctahedronGeometry(.2), bright, head, .93, .16, side * .26);
      }
      box(head, .3, .31, .63, gold, -.2, .35, 0);
    }
    for (let i = 0; i < tower.level; i++) {
      const gem = box(root, .13, .13, .13, bright, -.52 + i * .25, .43, .53);
      gem.rotation.y = Math.PI / 4;
    }
    this.towerMeshes.set(tower.id, { root, head, info, recoil: 0, phase: Math.random() * 6 });
    return root;
  }

  removeTower(id) {
    const mesh = this.towerMeshes.get(id);
    if (mesh) this.scene.remove(mesh.root);
    this.towerMeshes.delete(id);
  }

  makeEnemy(enemy) {
    const info = ENEMIES[enemy.type], scale = info.boss ? 1.7 : info.air ? .9 : .75;
    const root = new T.Group();
    root.position.set(enemy.x, info.air ? 1.5 : .23, enemy.z);
    root.scale.setScalar(scale);
    const mat = metal(info.color, info.color, .28), eye = glow(info.color);
    cyl(root, .38, .48, .52, info.armor ? metal(0x74808d) : mat, 0, .32, 0, info.boss ? 8 : 6);
    unit(new T.OctahedronGeometry(.32), eye, root, 0, .7, 0);
    if (info.boss) {
      const crown = unit(new T.TorusGeometry(.57, .07, 6, 8), gold, root, 0, 1.1, 0);
      crown.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) box(root, .28, .45, .27, mat, side * .62, .3, 0);
    } else if (info.air) {
      for (const side of [-1, 1]) {
        const wing = box(root, .77, .08, .37, mat, side * .6, .42, 0);
        wing.rotation.z = side * .28;
      }
    } else {
      for (const side of [-1, 1]) box(root, .16, .39, .19, dark, side * .3, -.1, 0);
    }
    if (info.hidden) {
      const halo = unit(new T.TorusGeometry(.58, .045, 5, 18), eye, root, 0, .38, 0);
      halo.rotation.x = Math.PI / 2;
    }
    const hpBack = box(root, 1.18, .085, .055, charcoal, 0, info.boss ? 1.65 : 1.28, 0);
    const hpBar = box(root, 1.12, .055, .065, eye, 0, hpBack.position.y, .04);
    this.scene.add(root);
    this.enemyMeshes.set(enemy.id, { root, hpBar, scale, phase: Math.random() * 6 });
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
      const ahead = battle.enemies ? enemy.progress + .15 : 0;
      if (Number.isFinite(ahead)) visual.root.rotation.y = Math.sin(this.time * 3 + visual.phase) * .11;
      const fraction = Math.max(0, enemy.hp / enemy.maxHp);
      visual.hpBar.scale.x = fraction;
      visual.hpBar.position.x = -(1 - fraction) * .56;
    }
    for (const visual of this.towerMeshes.values()) {
      visual.recoil = Math.max(0, visual.recoil - dt * 1.4);
      visual.head.position.y = 1.02 - visual.recoil + Math.sin(this.time * 2.7 + visual.phase) * .025;
      if (visual.head.userData.halo) visual.head.userData.halo.rotation.z += dt;
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
