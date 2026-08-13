/**
 * 3D renderer.
 *
 * Every wobbler is drawn straight from its physics joints, so whatever
 * ridiculous shape the solver has folded a unit into is exactly what appears on
 * screen — there is no skinned mesh and no animation state to disagree with.
 *
 * To keep a hundred ragdolls cheap, nothing owns a mesh. Instead there are four
 * InstancedMeshes (sphere, cylinder, box, cone) and each frame the whole battle
 * is re-emitted into them as primitives. That is the entire scene in about four
 * draw calls, and it suits the flat low-poly look the game wants anyway.
 */

import * as THREE from '../vendor/three.module.min.js';
import {
  HEAD, CHEST, HIP, HAND_L, HAND_R, KNEE_L, KNEE_R, FOOT_L, FOOT_R,
} from './wobbler.js';
import { FACTION_BY_ID } from './units.js';
import { HALF_W, HALF_D, terrainHeight } from './battle.js';
import { clamp } from './physics.js';

export const TEAM_COLOR = [0x4a8be8, 0xe25555];
export const TEAM_DARK = [0x2f5fa8, 0xa33636];
export const TEAM_NAME = ['Blue', 'Red'];

// Scratch objects, reused every emit to keep the frame allocation-free.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const GREY = new THREE.Color(0x74777f);

/**
 * Colour scratch ring. `setColorAt` copies the value straight into the
 * instance buffer, so colours never need to outlive the push that consumes
 * them — but several can be live at once (skin, tunic, trim), hence a ring
 * rather than a single scratch. Keeps the render loop allocation-free.
 */
const _ring = Array.from({ length: 12 }, () => new THREE.Color());
let _ri = 0;
function C(hex) {
  _ri = (_ri + 1) % _ring.length;
  return _ring[_ri].setHex(hex);
}
const _col = new THREE.Color();

class Prim {
  constructor(geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Prime instanceColor so the shader compiles with per-instance colour.
    this.mesh.setColorAt(0, _col.setHex(0xffffff));
    this.max = max;
    this.n = 0;
  }

  reset() {
    this.n = 0;
  }

  push(matrix, color) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, matrix);
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }

  flush() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x87c5e8);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c5e8);
    this.scene.fog = new THREE.Fog(0x9fd0ea, 130, 380);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 600);

    this.buildLights();
    this.buildGround();
    this.buildPrims();

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x5c7a48, 1.05));

    const sun = new THREE.DirectionalLight(0xfff3d8, 1.5);
    sun.position.set(40, 70, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -HALF_W - 6;
    c.right = HALF_W + 6;
    c.top = HALF_D + 20;
    c.bottom = -HALF_D - 20;
    c.near = 10;
    c.far = 200;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.sun = sun;
  }

  buildGround() {
    // One continuous landscape well past the playable area, displaced by the
    // same height function the physics uses. Ending the mesh at the battle
    // boundary would leave the field floating on a slab; running it out to the
    // fog instead means the world simply fades into the horizon.
    const W = 460;
    const D = 320;
    const geo = new THREE.PlaneGeometry(W, D, 230, 160);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Beyond the battlefield the ground swells into low hills, so the
      // horizon has some shape to it.
      pos.setY(i, terrainHeight(x, z) + this.outerHills(x, z));
    }
    geo.computeVertexNormals();

    this.ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0x74ad55, flatShading: true })
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.buildScenery();

    // Deployment overlays. These are displaced to hug the terrain — a flat
    // quad would float over the dips and read as a sheet hanging in the air.
    const decal = (x0, x1, color, opacity) => {
      const g = new THREE.PlaneGeometry(x1 - x0, HALF_D * 2, Math.max(2, Math.round(x1 - x0)), 26);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) + 0.05);
      }
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity, depthWrite: false,
        })
      );
      m.renderOrder = 1;
      this.scene.add(m);
      return m;
    };

    this.zoneBlue = decal(-HALF_W, -1.5, TEAM_COLOR[0], 0.1);
    this.zoneRed = decal(1.5, HALF_W, TEAM_COLOR[1], 0.1);
    this.deployLine = decal(-0.35, 0.35, 0xffffff, 0.55);

    // Placement ghost.
    this.ghost = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.0, 4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  /** Static trees and rocks outside the arena — depth cues and a sense of scale. */
  buildScenery() {
    const trunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 3.4, 6);
    const leafGeo = new THREE.ConeGeometry(2.5, 6.5, 7);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);

    const spots = [];
    for (let i = 0; i < 700 && spots.length < 320; i++) {
      const x = (Math.random() - 0.5) * 420;
      const z = (Math.random() - 0.5) * 290;
      // Keep the battlefield and its approaches clear.
      if (Math.abs(x) < HALF_W + 10 && Math.abs(z) < HALF_D + 10) continue;
      spots.push([x, z]);
    }

    const trees = spots.length;
    const trunk = new THREE.InstancedMesh(
      trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2c, flatShading: true }), trees
    );
    const leaves = new THREE.InstancedMesh(
      leafGeo, new THREE.MeshLambertMaterial({ flatShading: true }), trees
    );
    const rocks = new THREE.InstancedMesh(
      rockGeo, new THREE.MeshLambertMaterial({ color: 0x8b8f96, flatShading: true }), 90
    );
    for (const m of [trunk, leaves, rocks]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }

    let ti = 0;
    let ri = 0;
    for (const [x, z] of spots) {
      const gy = terrainHeight(x, z) + this.outerHills(x, z);
      if (ri < 90 && Math.random() < 0.16) {
        const s = 0.6 + Math.random() * 1.6;
        _m.compose(_p.set(x, gy + s * 0.4, z), _q.identity(), _s.set(s, s * 0.75, s));
        rocks.setMatrixAt(ri++, _m);
        continue;
      }
      const s = 0.7 + Math.random() * 0.9;
      _q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
      _m.compose(_p.set(x, gy + 1.7 * s, z), _q, _s.set(s, s, s));
      trunk.setMatrixAt(ti, _m);
      _m.compose(_p.set(x, gy + 5.6 * s, z), _q, _s.set(s, s * (0.85 + Math.random() * 0.4), s));
      leaves.setMatrixAt(ti, _m);
      leaves.setColorAt(ti, _col.setHSL(0.28 + Math.random() * 0.06, 0.45, 0.26 + Math.random() * 0.1));
      ti++;
    }
    trunk.count = ti;
    leaves.count = ti;
    rocks.count = ri;
    this.scene.add(trunk, leaves, rocks);
  }

  outerHills(x, z) {
    const out = Math.max(0, Math.max(Math.abs(x) - HALF_W, Math.abs(z) - HALF_D) / 95);
    const hills = Math.sin(x * 0.011) * Math.cos(z * 0.013) * 9 + Math.sin(z * 0.02) * 3.5;
    return hills * Math.min(1, out) ** 1.7;
  }

  buildPrims() {
    const solid = () => new THREE.MeshLambertMaterial({ flatShading: true });
    this.sph = new Prim(new THREE.IcosahedronGeometry(1, 1), solid(), 4200);
    this.cyl = new Prim(new THREE.CylinderGeometry(1, 1, 1, 8), solid(), 5200);
    this.box = new Prim(new THREE.BoxGeometry(1, 1, 1), solid(), 2400);
    this.cone = new Prim(new THREE.ConeGeometry(1, 1, 7), solid(), 900);

    const fxMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.8, depthWrite: false,
    });
    this.fxSph = new Prim(new THREE.IcosahedronGeometry(1, 1), fxMat, 700);
    this.fxSph.mesh.castShadow = false;
    this.fxSph.mesh.receiveShadow = false;
    this.fxCyl = new Prim(new THREE.CylinderGeometry(1, 1, 1, 6), fxMat, 500);
    this.fxCyl.mesh.castShadow = false;
    this.fxCyl.mesh.receiveShadow = false;

    this.prims = [this.sph, this.cyl, this.box, this.cone, this.fxSph, this.fxCyl];
    for (const p of this.prims) this.scene.add(p.mesh);
  }

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Ray from normalised device coords onto the terrain. Null if it misses.
   *
   * Intersects a flat plane and then walks the hit point onto the height field,
   * rather than raycasting the terrain mesh — the mesh is ~70k triangles and
   * this runs on every pointer move.
   */
  pickGround(ndcX, ndcY) {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    let y = 0;
    let hit = null;
    // Two passes: solve against y=0, then against the terrain height there.
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ray.direction.y) < 1e-6) return null;
      const t = (y - ray.origin.y) / ray.direction.y;
      if (t < 0) return null;
      hit = _p.copy(ray.direction).multiplyScalar(t).add(ray.origin);
      y = terrainHeight(hit.x, hit.z);
    }
    return hit ? hit.clone().setY(y) : null;
  }

  // ---- emitters -------------------------------------------------------

  blob(prim, x, y, z, r, color) {
    _p.set(x, y, z);
    _s.set(r, r, r);
    _q.identity();
    _m.compose(_p, _q, _s);
    prim.push(_m, color);
  }

  /** A cylinder spanning a→b, used for every limb, shaft and beam. */
  bone(prim, ax, ay, az, bx, by, bz, r, color) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    _d.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(UP, _d);
    _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    _s.set(r, len, r);
    _m.compose(_p, _q, _s);
    prim.push(_m, color);
  }

  /** An oriented box: `along` is its local +Y, `side` its local +X. */
  slab(prim, px, py, pz, along, side, sx, sy, sz, color) {
    _a.copy(side).normalize();
    _b.copy(along).normalize();
    _c.crossVectors(_a, _b).normalize();
    _a.crossVectors(_b, _c).normalize();
    _m.makeBasis(_a, _b, _c);
    _m.scale(_s.set(sx, sy, sz));
    _m.setPosition(px, py, pz);
    prim.push(_m, color);
  }

  cone3(prim, px, py, pz, dir, r, len, color) {
    _d.copy(dir).normalize();
    _q.setFromUnitVectors(UP, _d);
    _p.set(px, py, pz);
    _s.set(r, len, r);
    _m.compose(_p, _q, _s);
    prim.push(_m, color);
  }

  // ---- scene sync -----------------------------------------------------

  sync(sim, ui) {
    for (const p of this.prims) p.reset();

    const deploying = sim.state === 'deploy';
    this.zoneBlue.visible = deploying;
    this.zoneRed.visible = deploying && ui.mode === 'sandbox';
    this.deployLine.visible = deploying;

    for (const u of sim.units) this.drawUnit(u, ui);
    for (const b of sim.projectiles) this.drawProjectile(b);
    for (const f of sim.fx) this.drawFx(f);

    for (const p of this.prims) p.flush();
  }

  drawUnit(u, ui) {
    const p = u.pts;
    const s = u.size;
    const fac = FACTION_BY_ID[u.def.faction];

    // Corpses desaturate toward grey but keep enough team colour that you can
    // still read who lost the exchange.
    const cSkin = C(TEAM_COLOR[u.team]);
    const cDark = C(TEAM_DARK[u.team]);
    const cCloth = C(fac ? parseInt(fac.color.slice(1), 16) : 0xcccccc);
    if (u.dead) {
      cSkin.lerp(GREY, 0.6);
      cDark.lerp(GREY, 0.6);
      cCloth.lerp(GREY, 0.62);
    } else if (u.hurt > 0) {
      // Flash white on damage.
      const k = clamp(u.hurt * 3, 0, 0.85);
      _col.setHex(0xffffff);
      cSkin.lerp(_col, k);
      cDark.lerp(_col, k);
    }

    // Legs
    this.bone(this.cyl, p[HIP].x, p[HIP].y, p[HIP].z, p[KNEE_L].x, p[KNEE_L].y, p[KNEE_L].z, 0.11 * s, cDark);
    this.bone(this.cyl, p[KNEE_L].x, p[KNEE_L].y, p[KNEE_L].z, p[FOOT_L].x, p[FOOT_L].y, p[FOOT_L].z, 0.1 * s, cDark);
    this.bone(this.cyl, p[HIP].x, p[HIP].y, p[HIP].z, p[KNEE_R].x, p[KNEE_R].y, p[KNEE_R].z, 0.11 * s, cSkin);
    this.bone(this.cyl, p[KNEE_R].x, p[KNEE_R].y, p[KNEE_R].z, p[FOOT_R].x, p[FOOT_R].y, p[FOOT_R].z, 0.1 * s, cSkin);
    this.blob(this.sph, p[FOOT_L].x, p[FOOT_L].y, p[FOOT_L].z, 0.13 * s, cDark);
    this.blob(this.sph, p[FOOT_R].x, p[FOOT_R].y, p[FOOT_R].z, 0.13 * s, cSkin);

    // Torso: a fat skin-coloured core with a faction-coloured tunic over it.
    this.bone(this.cyl, p[HIP].x, p[HIP].y, p[HIP].z, p[CHEST].x, p[CHEST].y, p[CHEST].z, 0.27 * s, cSkin);
    _p.set(p[CHEST].x - p[HIP].x, p[CHEST].y - p[HIP].y, p[CHEST].z - p[HIP].z);
    this.bone(
      this.cyl,
      p[HIP].x + _p.x * 0.1, p[HIP].y + _p.y * 0.1, p[HIP].z + _p.z * 0.1,
      p[HIP].x + _p.x * 0.85, p[HIP].y + _p.y * 0.85, p[HIP].z + _p.z * 0.85,
      0.29 * s, cCloth
    );
    this.blob(this.sph, p[HIP].x, p[HIP].y, p[HIP].z, 0.24 * s, cCloth);

    // Arms
    this.bone(this.cyl, p[CHEST].x, p[CHEST].y, p[CHEST].z, p[HAND_L].x, p[HAND_L].y, p[HAND_L].z, 0.09 * s, cDark);
    this.bone(this.cyl, p[CHEST].x, p[CHEST].y, p[CHEST].z, p[HAND_R].x, p[HAND_R].y, p[HAND_R].z, 0.095 * s, cSkin);
    this.blob(this.sph, p[HAND_L].x, p[HAND_L].y, p[HAND_L].z, 0.1 * s, cDark);
    this.blob(this.sph, p[HAND_R].x, p[HAND_R].y, p[HAND_R].z, 0.1 * s, cSkin);

    if (u.def.beast) this.drawBeast(u, cSkin, cDark);
    if (u.def.wings) this.drawWings(u);

    this.drawHead(u, cSkin);
    if (u.def.shield) this.drawShield(u, cCloth);
    this.drawWeapon(u);
  }

  drawHead(u, cSkin) {
    const hd = u.pts[HEAD];
    const ch = u.pts[CHEST];
    const s = u.size;
    const r = 0.28 * s;

    this.blob(this.sph, hd.x, hd.y, hd.z, r, cSkin);

    // Build a head frame so the eyes tilt with the body as it topples.
    _a.set(hd.x - ch.x, hd.y - ch.y, hd.z - ch.z);
    if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
    _a.normalize(); // up
    _b.set(Math.cos(u.yaw), 0, Math.sin(u.yaw)); // desired forward
    _b.addScaledVector(_a, -_b.dot(_a));
    if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0);
    _b.normalize();
    _c.crossVectors(_b, _a).normalize(); // right

    // Googly eyes: the pupils hang off the head's velocity, so they slosh
    // whenever a unit is shoved. This one detail does a lot of work.
    const jx = clamp(hd.vx * 22, -0.4, 0.4);
    const jy = clamp(hd.vy * 22, -0.4, 0.4);
    const white = C(u.dead ? 0xc9ccd2 : 0xffffff);
    const pupil = C(u.dead ? 0x555555 : 0x14161c);

    for (const side of [-1, 1]) {
      const ex = hd.x + _b.x * r * 0.7 + _c.x * r * 0.44 * side + _a.x * r * 0.18;
      const ey = hd.y + _b.y * r * 0.7 + _c.y * r * 0.44 * side + _a.y * r * 0.18;
      const ez = hd.z + _b.z * r * 0.7 + _c.z * r * 0.44 * side + _a.z * r * 0.18;
      this.blob(this.sph, ex, ey, ez, r * 0.46, white);
      this.blob(
        this.sph,
        ex + _b.x * r * 0.3 + jx * r * 0.55,
        ey + _b.y * r * 0.3 + jy * r * 0.55,
        ez + _b.z * r * 0.3,
        r * 0.24,
        pupil
      );
    }

    if (u.def.hat) this.drawHat(u, r, _a, _b, _c);
  }

  drawHat(u, r, up, fwd, right) {
    const hd = u.pts[HEAD];
    const H = u.def.hat;
    const x = hd.x, y = hd.y, z = hd.z;
    const at = (uD, fD, rD) => [
      x + up.x * uD + fwd.x * fD + right.x * rD,
      y + up.y * uD + fwd.y * fD + right.y * rD,
      z + up.z * uD + fwd.z * fD + right.z * rD,
    ];

    if (H === 'straw' || H === 'cowboy') {
      const col = C(H === 'cowboy' ? 0x8b5a2b : 0xdcc16a);
      const [bx, by, bz] = at(r * 0.62, 0, 0);
      this.bone(this.cyl, bx, by, bz, bx + up.x * 0.06, by + up.y * 0.06, bz + up.z * 0.06, r * 1.55, col);
      const [cx, cy, cz] = at(r * 0.95, 0, 0);
      this.bone(this.cyl, cx, cy, cz, cx + up.x * r * 0.7, cy + up.y * r * 0.7, cz + up.z * r * 0.7, r * 0.72, col);
    } else if (H === 'helm' || H === 'kabuto' || H === 'minerhat') {
      const col = C(H === 'kabuto' ? 0x3a3f4d : H === 'minerhat' ? 0xc8b048 : 0xb9c0cc);
      const [bx, by, bz] = at(r * 0.3, 0, 0);
      this.blob(this.sph, bx, by, bz, r * 0.95, col);
      if (H === 'kabuto') {
        const [px, py, pz] = at(r * 1.15, r * 0.25, 0);
        this.cone3(this.cone, px, py, pz, fwd, r * 0.5, r * 1.1, C(0xe0b23c));
      }
      if (H === 'minerhat') {
        const [px, py, pz] = at(r * 0.45, r * 0.85, 0);
        this.blob(this.sph, px, py, pz, r * 0.26, C(0xfff6c4));
      }
    } else if (H === 'crown' || H === 'crownbone' || H === 'circlet' || H === 'laurel') {
      const col = C(H === 'crownbone' ? 0xe8e2d0 : H === 'laurel' ? 0x7fbf5f : 0xf2c744);
      const [bx, by, bz] = at(r * 0.82, 0, 0);
      this.bone(this.cyl, bx, by, bz, bx + up.x * r * 0.34, by + up.y * r * 0.34, bz + up.z * r * 0.34, r * 0.86, col);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const [sx, sy, sz] = at(r * 1.2, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        this.cone3(this.cone, sx, sy, sz, up, r * 0.16, r * 0.42, col);
      }
    } else if (H === 'horns') {
      const col = C(0xefe6cf);
      for (const d of [-1, 1]) {
        const [sx, sy, sz] = at(r * 0.55, 0, d * r * 0.85);
        this.cone3(
          this.cone, sx, sy, sz,
          _p.set(up.x * 0.75 + right.x * d * 0.66, up.y * 0.75 + right.y * d * 0.66, up.z * 0.75 + right.z * d * 0.66),
          r * 0.22, r * 1.1, col
        );
      }
    } else if (H === 'tricorn' || H === 'plume') {
      const col = C(H === 'tricorn' ? 0x2f3340 : 0x6b4f9e);
      const [bx, by, bz] = at(r * 0.68, 0, 0);
      this.bone(this.cyl, bx, by, bz, bx + up.x * 0.07, by + up.y * 0.07, bz + up.z * 0.07, r * 1.35, col);
      const [cx, cy, cz] = at(r * 1.0, 0, 0);
      this.bone(this.cyl, cx, cy, cz, cx + up.x * r * 0.55, cy + up.y * r * 0.55, cz + up.z * r * 0.55, r * 0.66, col);
      if (H === 'plume') {
        const [px, py, pz] = at(r * 1.5, r * 0.3, 0);
        this.cone3(this.cone, px, py, pz, up, r * 0.16, r * 0.8, C(0xef5d5d));
      }
    } else if (H === 'hood' || H === 'cape') {
      const [bx, by, bz] = at(r * 0.18, -r * 0.18, 0);
      this.blob(this.sph, bx, by, bz, r * 1.02, C(H === 'cape' ? 0x5a2233 : 0x2b2b38));
    } else if (H === 'candle') {
      const [bx, by, bz] = at(r * 1.0, 0, 0);
      this.bone(this.cyl, bx, by, bz, bx + up.x * r * 0.9, by + up.y * r * 0.9, bz + up.z * r * 0.9, r * 0.17, C(0xf2e6c8));
      const [fx, fy, fz] = at(r * 2.1, 0, 0);
      this.blob(this.sph, fx, fy, fz, r * 0.24, C(0xffb03a));
    } else if (H === 'bandana') {
      const [bx, by, bz] = at(r * 0.42, 0, 0);
      this.blob(this.sph, bx, by, bz, r * 0.92, C(0xc94f4f));
    } else if (H === 'bone') {
      const [bx, by, bz] = at(r * 0.9, 0, 0);
      this.bone(
        this.cyl,
        bx - right.x * r * 0.8, by - right.y * r * 0.8, bz - right.z * r * 0.8,
        bx + right.x * r * 0.8, by + right.y * r * 0.8, bz + right.z * r * 0.8,
        r * 0.14, C(0xefe6cf)
      );
    }
  }

  drawWings(u) {
    const c = u.pts[CHEST];
    const s = u.size;
    const flap = Math.sin(performance.now() * 0.014 + u.id) * 0.35;
    const col = C(u.dead ? 0x8a8a90 : 0xf2f5fa);
    _b.set(Math.cos(u.yaw), 0, Math.sin(u.yaw));
    _c.set(-_b.z, 0, _b.x);
    for (const d of [-1, 1]) {
      const tipX = c.x + _c.x * d * 1.5 * s - _b.x * 0.3 * s;
      const tipY = c.y + (0.55 + flap) * s;
      const tipZ = c.z + _c.z * d * 1.5 * s - _b.z * 0.3 * s;
      this.slab(
        this.box,
        (c.x + tipX) / 2, (c.y + tipY) / 2, (c.z + tipZ) / 2,
        _p.set(tipX - c.x, tipY - c.y, tipZ - c.z),
        _a.set(_b.x, 0, _b.z),
        0.7 * s, 1.6 * s, 0.06 * s,
        col
      );
    }
  }

  /**
   * A mammoth is a wobbler wearing a mammoth. The skeleton is the same
   * humanoid rig every unit uses; the bulk, trunk and tusks are hung off the
   * hip, chest and head so it reads as a beast without needing its own physics.
   */
  drawBeast(u, cSkin, cDark) {
    const p = u.pts;
    const s = u.size;
    const hd = p[HEAD];
    _b.set(Math.cos(u.yaw), 0, Math.sin(u.yaw)); // body forward
    _c.set(-_b.z, 0, _b.x); // body right

    // Barrel body, slung between hip and chest.
    this.bone(
      this.cyl,
      p[HIP].x - _b.x * 0.35 * s, p[HIP].y + 0.1 * s, p[HIP].z - _b.z * 0.35 * s,
      p[CHEST].x + _b.x * 0.15 * s, p[CHEST].y, p[CHEST].z + _b.z * 0.15 * s,
      0.52 * s, cSkin
    );

    // Trunk: two segments so it hangs and curls instead of jutting out.
    const t0x = hd.x + _b.x * 0.28 * s, t0z = hd.z + _b.z * 0.28 * s;
    const t1x = hd.x + _b.x * 0.52 * s, t1y = hd.y - 0.62 * s, t1z = hd.z + _b.z * 0.52 * s;
    this.bone(this.cyl, t0x, hd.y - 0.05 * s, t0z, t1x, t1y, t1z, 0.15 * s, cDark);
    this.bone(
      this.cyl, t1x, t1y, t1z,
      hd.x + _b.x * 0.34 * s, hd.y - 1.05 * s, hd.z + _b.z * 0.34 * s,
      0.11 * s, cDark
    );

    // Tusks sweep forward and up off the head, where tusks go.
    for (const side of [-1, 1]) {
      this.cone3(
        this.cone,
        hd.x + _b.x * 0.3 * s + _c.x * 0.3 * s * side,
        hd.y - 0.45 * s,
        hd.z + _b.z * 0.3 * s + _c.z * 0.3 * s * side,
        _p.set(_b.x * 0.8, 0.45, _b.z * 0.8),
        0.11 * s, 1.15 * s, C(0xefe6cf)
      );
    }

    // Ears: flattened blobs rather than slabs, which read as panels up close.
    for (const side of [-1, 1]) {
      _p.set(
        hd.x + _c.x * 0.34 * s * side,
        hd.y + 0.06 * s,
        hd.z + _c.z * 0.34 * s * side
      );
      _q.setFromUnitVectors(UP, _d.set(_c.x * side, 0.25, _c.z * side).normalize());
      _m.compose(_p, _q, _s.set(0.3 * s, 0.07 * s, 0.34 * s));
      this.sph.push(_m, cDark);
    }
  }

  drawShield(u, cCloth) {
    const h = u.pts[HAND_L];
    const c = u.pts[CHEST];
    const s = u.size;
    _p.set(h.x - c.x, h.y - c.y, h.z - c.z);
    if (_p.lengthSq() < 1e-6) _p.set(1, 0, 0);
    this.bone(
      this.cyl,
      h.x - _p.x * 0.05, h.y - _p.y * 0.05, h.z - _p.z * 0.05,
      h.x + _p.x * 0.12, h.y + _p.y * 0.12, h.z + _p.z * 0.12,
      0.42 * s,
      C(0xc2c8d4)
    );
    this.blob(this.sph, h.x + _p.x * 0.12, h.y + _p.y * 0.12, h.z + _p.z * 0.12, 0.14 * s, cCloth);
  }

  drawWeapon(u) {
    const kind = u.def.weapon;
    if (!kind || kind === 'none' || kind === 'claws') return;

    const hand = u.pts[HAND_R];
    const dir = u.armDir();
    const s = u.size;
    // Melee weapons are as long as their reach; ranged hardware is a prop.
    const L = (u.def.type === 'ranged' ? 0.55 : u.def.reach) * (u.def.type === 'ranged' ? s : 1);

    _d.set(dir.x, dir.y, dir.z);
    // A stable side vector for orienting blades and flat shapes.
    _a.set(-_d.z, 0, _d.x);
    if (_a.lengthSq() < 1e-5) _a.set(1, 0, 0);
    _a.normalize();

    const at = (t, off = 0) => [
      hand.x + _d.x * t + _a.x * off,
      hand.y + _d.y * t + _a.y * off,
      hand.z + _d.z * t + _a.z * off,
    ];
    const wood = C(0x8a6b3d);
    const steel = C(0xdfe4ec);

    const shaft = (from, to, r, col) => {
      const [ax, ay, az] = at(from);
      const [bx, by, bz] = at(to);
      this.bone(this.cyl, ax, ay, az, bx, by, bz, r, col);
    };

    switch (kind) {
      case 'sword': case 'cutlass': case 'rapier': case 'katana': {
        const w = kind === 'rapier' ? 0.045 : 0.075;
        const [cx, cy, cz] = at(L * 0.55);
        this.slab(this.box, cx, cy, cz, _d, _a, w * 2, L, 0.035, steel);
        shaft(-0.16, 0.02, 0.055, wood);
        break;
      }
      case 'club':
        shaft(-0.1, L * 0.6, 0.075, wood);
        this.blob(this.sph, ...at(L * 0.82), 0.2 * s, C(0x7a5730));
        break;
      case 'hammer': {
        shaft(-0.1, L * 0.72, 0.07, wood);
        const [hx, hy, hz] = at(L * 0.85);
        this.slab(this.box, hx, hy, hz, _a, _d, 0.34, 0.42, 0.34, C(0xaab2c0));
        break;
      }
      case 'axe': {
        shaft(-0.1, L * 0.85, 0.07, wood);
        const [hx, hy, hz] = at(L * 0.82, 0.18);
        this.slab(this.box, hx, hy, hz, _a, _d, 0.36, 0.3, 0.05, C(0xcfd6e2));
        break;
      }
      case 'spear': case 'pike': case 'lance': case 'harpoon':
        shaft(-0.2, L * 0.9, 0.05, C(0x9a7645));
        this.cone3(this.cone, ...at(L * 0.98), _d, 0.09, 0.3, steel);
        break;
      case 'halberd': {
        shaft(-0.2, L * 0.92, 0.05, C(0x9a7645));
        this.cone3(this.cone, ...at(L * 1.0), _d, 0.08, 0.26, steel);
        const [hx, hy, hz] = at(L * 0.8, 0.2);
        this.slab(this.box, hx, hy, hz, _a, _d, 0.36, 0.26, 0.045, C(0xcfd6e2));
        break;
      }
      case 'scythe': {
        shaft(-0.2, L * 0.88, 0.05, C(0x7d5e37));
        const [ax, ay, az] = at(L * 0.88);
        this.slab(this.box, ax + _a.x * 0.34, ay + _a.y * 0.34, az + _a.z * 0.34, _a, _d, 0.7, 0.1, 0.04, steel);
        break;
      }
      case 'pitchfork': case 'trident':
        shaft(-0.2, L * 0.88, 0.05, C(0x9a7645));
        for (const o of [-0.13, 0, 0.13]) {
          const [tx, ty, tz] = at(L * 0.95, o);
          this.cone3(this.cone, tx, ty, tz, _d, 0.035, 0.24, C(0xcfd6e2));
        }
        break;
      case 'pickaxe': {
        shaft(-0.1, L * 0.8, 0.065, wood);
        const [hx, hy, hz] = at(L * 0.82);
        this.slab(this.box, hx, hy, hz, _a, _d, 0.5, 0.09, 0.09, C(0xb8c0cd));
        break;
      }
      case 'dagger':
        this.slab(this.box, ...at(L * 0.55), _d, _a, 0.06, L * 0.9, 0.03, steel);
        break;
      case 'brush':
        shaft(-0.1, L * 0.8, 0.045, C(0xc8a05a));
        this.blob(this.sph, ...at(L * 0.92), 0.11, C(0xe05fa8));
        break;
      case 'lute':
        this.blob(this.sph, ...at(0.16), 0.24, C(0xb5843f));
        shaft(0.1, L * 0.9, 0.04, wood);
        break;
      case 'staff': case 'staffgold':
        shaft(-0.35, L * 1.0, 0.05, kind === 'staffgold' ? C(0xe8c04a) : wood);
        if (kind === 'staff') this.blob(this.sph, ...at(L * 1.05), 0.15, C(0x8be0ff));
        break;
      case 'torch':
        shaft(-0.1, L * 0.8, 0.05, wood);
        this.blob(this.sph, ...at(L * 0.95), 0.16, C(0xff9a3c));
        break;
      case 'bow': {
        // The bow sits across the hand rather than pointing down the arm.
        const [ax, ay, az] = at(0, 0);
        this.bone(
          this.cyl,
          ax - _a.x * 0.42 + 0, ay - 0.42, az - _a.z * 0.42,
          ax + _a.x * 0.42, ay + 0.42, az + _a.z * 0.42,
          0.035, wood
        );
        break;
      }
      case 'sling':
        shaft(0, 0.3, 0.02, C(0xa08050));
        this.blob(this.sph, ...at(0.34), 0.07, C(0x8d7a5e));
        break;
      case 'pistol': case 'revolver': case 'flintlock':
        shaft(-0.05, 0.4, 0.05, C(0x4a4f5c));
        this.blob(this.sph, ...at(0.02), 0.09, wood);
        break;
      case 'musket': case 'rifle':
        shaft(-0.3, 0.95, 0.045, C(0x464b57));
        shaft(-0.34, -0.05, 0.09, wood);
        break;
      case 'blunderbuss':
        shaft(-0.25, 0.4, 0.06, C(0x4a4f5c));
        this.cone3(this.cone, ...at(0.62), _p.copy(_d).negate(), 0.16, 0.4, C(0x4a4f5c));
        break;
      case 'cannon': case 'tankguns':
        shaft(-0.35, 1.15, 0.2 * s, C(0x3d434f));
        this.blob(this.sph, ...at(-0.3), 0.3 * s, C(0x2f3340));
        break;
      case 'ballista': case 'hwacha': case 'catapult': {
        shaft(-0.5, 1.1, 0.11 * s, wood);
        const [cx, cy, cz] = at(0.2);
        this.bone(
          this.cyl,
          cx - _a.x * 0.75 * s, cy, cz - _a.z * 0.75 * s,
          cx + _a.x * 0.75 * s, cy, cz + _a.z * 0.75 * s,
          0.075 * s, C(0x6f5530)
        );
        break;
      }
      case 'bomb': case 'dynamite':
        this.blob(this.sph, ...at(0.2), 0.15, C(kind === 'bomb' ? 0x2f3340 : 0xc0392b));
        break;
      case 'flask':
        this.blob(this.sph, ...at(0.2), 0.13, C(0x8ee06a));
        break;
      case 'lasso': {
        const [cx, cy, cz] = at(0.34);
        this.bone(
          this.cyl,
          cx - _a.x * 0.26, cy, cz - _a.z * 0.26,
          cx + _a.x * 0.26, cy, cz + _a.z * 0.26,
          0.04, C(0xc8a05a)
        );
        break;
      }
      case 'bolt':
        this.cone3(this.cone, ...at(0.42), _d, 0.1, 0.55, C(0x9fd8ff));
        break;
      case 'fire':
        this.blob(this.sph, ...at(0.3), 0.2, C(0xff7a2f));
        break;
      case 'tusks':
        break; // drawn on the head by drawBeast
      case 'ram': case 'barrow':
        shaft(-0.2, L * 0.9, 0.26 * s, wood);
        break;
      default:
        shaft(-0.1, L * 0.9, 0.06, steel);
    }
  }

  drawProjectile(b) {
    const v = Math.hypot(b.vx, b.vy, b.vz) || 1;
    _d.set(b.vx / v, b.vy / v, b.vz / v);
    const tail = (len, r, col) =>
      this.bone(
        this.cyl,
        b.x - _d.x * len, b.y - _d.y * len, b.z - _d.z * len,
        b.x + _d.x * len * 0.25, b.y + _d.y * len * 0.25, b.z + _d.z * len * 0.25,
        r, col
      );

    switch (b.kind) {
      case 'arrow': case 'bolt': case 'snake': case 'ice':
        tail(0.42, 0.035, C(b.kind === 'ice' ? 0x9fe4ff : b.kind === 'snake' ? 0x8ee06a : 0xc8a05a));
        this.cone3(this.cone, b.x, b.y, b.z, _d, 0.055, 0.18, C(0xe6ebf2));
        break;
      case 'spear': case 'harpoon':
        tail(0.6, 0.045, C(0x9a7645));
        this.cone3(this.cone, b.x, b.y, b.z, _d, 0.07, 0.24, C(0xdfe4ec));
        break;
      case 'bullet': case 'pellet':
        tail(0.3, 0.028, C(0xffe9a8));
        break;
      case 'sword':
        this.slab(this.box, b.x, b.y, b.z, _d, _a.set(-_d.z, 0, _d.x), 0.08, 0.6, 0.03, C(0xdfe4ec));
        break;
      case 'rocket':
        tail(0.45, 0.05, C(0xff8a3d));
        break;
      case 'fire': case 'firework':
        this.blob(this.fxSph, b.x, b.y, b.z, b.r + 0.12, C(b.kind === 'fire' ? 0xff7a2f : 0xff5bd0));
        break;
      case 'lasso': {
        _a.set(-_d.z, 0, _d.x).normalize();
        this.bone(
          this.cyl,
          b.x - _a.x * 0.22, b.y, b.z - _a.z * 0.22,
          b.x + _a.x * 0.22, b.y, b.z + _a.z * 0.22,
          0.035, C(0xc8a05a)
        );
        break;
      }
      default: {
        const col =
          b.kind === 'pumpkin' ? 0xff9a3c :
          b.kind === 'potion' ? 0x8ee06a :
          b.kind === 'dynamite' ? 0xc0392b :
          b.kind === 'bomb' || b.kind === 'cannonball' ? 0x2f3340 : 0x8d7a5e;
        this.blob(this.sph, b.x, b.y, b.z, b.r + 0.05, C(col));
      }
    }
  }

  drawFx(f) {
    const k = f.t / f.life;
    if (f.kind === 'hit') {
      this.blob(this.fxSph, f.x, f.y, f.z, (1 - k) * 0.3, C(f.color));
    } else if (f.kind === 'blast') {
      this.blob(this.fxSph, f.x, f.y, f.z, f.r * (0.3 + k * 0.85) * (1 - k * 0.55), C(f.color));
    } else if (f.kind === 'beam') {
      this.bone(this.fxCyl, f.x, f.y, f.z, f.x2, f.y2, f.z2, 0.06 * (1 - k), C(f.color));
    } else if (f.kind === 'bolt') {
      const col = C(0xcfeaff);
      let px = f.x, py = f.y + 24, pz = f.z;
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 6;
        const nx = f.x + (Math.random() - 0.5) * 1.6 * (1 - t);
        const ny = f.y + 24 * (1 - t);
        const nz = f.z + (Math.random() - 0.5) * 1.6 * (1 - t);
        this.bone(this.fxCyl, px, py, pz, nx, ny, nz, 0.09 * (1 - k), col);
        px = nx; py = ny; pz = nz;
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
