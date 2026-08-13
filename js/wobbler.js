/**
 * The wobbler: a 3D active ragdoll.
 *
 * The body is a floppy Verlet skeleton that, left alone, collapses in a heap.
 * What makes it stand up is a set of "muscles" — spring forces pulling each
 * joint toward a target pose every step. Landfall's own trick with TABS was to
 * stabilise the ragdoll from the inside rather than hanging it from strings,
 * and to let it fall once its centre of mass leaves the base of its feet. That
 * is what `balance` does here: hits and steep torso tilt drain it, muscle
 * authority scales with it, and it regenerates so a downed wobbler staggers
 * back upright.
 *
 * All the comedy is emergent. Nothing here is keyframed.
 */

import { Point, Stick, FIXED_DT, clamp } from './physics.js';

// Joint indices into wobbler.pts
export const HEAD = 0;
export const CHEST = 1;
export const HIP = 2;
export const HAND_L = 3;
export const HAND_R = 4;
export const KNEE_L = 5;
export const KNEE_R = 6;
export const FOOT_L = 7;
export const FOOT_R = 8;
export const JOINTS = 9;

/** Base wobbler height in world units at size 1. */
export const BASE_H = 2.0;
/** Base walking speed in units per second. */
export const BASE_SPEED = 3.4;

// Pose offsets from the hip, as fractions of body height, in body-local space:
// +X forward (facing), +Y up, +Z to the unit's right.
const POSE = [
  [0.0, 0.5, 0.0],     // HEAD
  [0.0, 0.28, 0.0],    // CHEST
  [0.0, 0.0, 0.0],     // HIP
  [0.06, 0.13, -0.17], // HAND_L
  [0.08, 0.12, 0.17],  // HAND_R
  [0.02, -0.2, -0.07], // KNEE_L
  [0.02, -0.2, 0.07],  // KNEE_R
  [0.0, -0.42, -0.07], // FOOT_L
  [0.0, -0.42, 0.07],  // FOOT_R
];

const MASS = [0.9, 1.7, 1.7, 0.35, 0.4, 0.5, 0.5, 0.6, 0.6];
const RADIUS = [0.24, 0.26, 0.24, 0.09, 0.09, 0.09, 0.09, 0.1, 0.1];

// Muscle tuning. Stiffer means steadier and much less funny.
const K_STAND = 720, D_STAND = 26;
const K_TORSO = 900, D_TORSO = 24;
const K_LEG = 620, D_LEG = 18;
const K_ARM = 520, D_ARM = 14;
/** How hard the hip chases its desired walking velocity (1/s). */
const K_DRIVE = 11;

let _uid = 0;

export class Wobbler {
  constructor(world, def, team, x, z) {
    this.id = _uid++;
    this.world = world;
    this.def = def;
    this.team = team; // 0 = blue, 1 = red
    this.size = def.size ?? 1;
    this.h = BASE_H * this.size;

    this.maxHp = def.hp;
    this.hp = def.hp;
    this.dead = false;

    // Weight resists knockback, exactly as it does in TABS.
    this.weight = def.weight ?? 1;

    this.balance = 1;
    this.moveDir = 0;      // -1, 0 or +1 along the facing direction
    this.buff = 1;         // damage multiplier from inspire auras
    this.status = null;
    this.aim = null;       // {x,y,z} world point being attacked
    this.target = null;
    this.yaw = team === 0 ? 0 : Math.PI;
    this.phase = Math.random() * Math.PI * 2;
    this.attack = { state: 'idle', t: 0, hits: null };
    this.cooldown = Math.random() * 0.5;
    this.hurt = 0;
    this.flying = !!def.flying;
    this.ability = def.ability ? { ...def.ability, t: 0, used: 0 } : null;

    this.pts = [];
    this.sticks = [];
    this.build(x, z);
  }

  build(x, z) {
    const h = this.h;
    const w = this.world;
    const gy = w.groundAt(x, z);
    const hipY = gy + h * 0.42;
    // Mass scales with volume so big units genuinely throw their weight around;
    // TABS scales practical hitpoints by size squared for the same reason.
    const mScale = this.weight * this.size * this.size;

    const fwd = this.forward();
    for (let i = 0; i < JOINTS; i++) {
      const [lx, ly, lz] = POSE[i];
      const p = new Point(
        x + fwd.x * lx * h - fwd.z * lz * h,
        hipY + ly * h,
        z + fwd.z * lx * h + fwd.x * lz * h,
        MASS[i] * mScale,
        RADIUS[i] * this.size
      );
      p.body = this;
      w.addPoint(p);
      this.pts[i] = p;
    }

    // Only the torso column joins the broadphase — limbs may interpenetrate,
    // which nobody notices but which cuts the collision cost dramatically.
    this.pts[HEAD].collide = true;
    this.pts[CHEST].collide = true;
    this.pts[HIP].collide = true;

    const bone = (a, b, k) => {
      const s = new Stick(this.pts[a], this.pts[b], k);
      w.addStick(s);
      this.sticks.push(s);
    };

    bone(HEAD, CHEST, 1);
    bone(CHEST, HIP, 1);
    bone(CHEST, HAND_L, 0.45);
    bone(CHEST, HAND_R, 0.45);
    bone(HIP, KNEE_L, 0.9);
    bone(HIP, KNEE_R, 0.9);
    bone(KNEE_L, FOOT_L, 0.9);
    bone(KNEE_R, FOOT_R, 0.9);
    // Spine brace: stops the torso folding in half without making it rigid.
    bone(HEAD, HIP, 0.3);
    // Keeps the legs from scissoring through each other.
    bone(KNEE_L, KNEE_R, 0.12);
  }

  forward() {
    return { x: Math.cos(this.yaw), z: Math.sin(this.yaw) };
  }

  /** Converts a body-local offset (forward, up, right) to a world position. */
  localToWorld(lx, ly, lz, originPt) {
    const h = this.h;
    const f = this.forward();
    const o = originPt || this.pts[HIP];
    return {
      x: o.x + f.x * lx * h - f.z * lz * h,
      y: o.y + ly * h,
      z: o.z + f.z * lx * h + f.x * lz * h,
    };
  }

  get hip() { return this.pts[HIP]; }
  get chest() { return this.pts[CHEST]; }
  get x() { return this.pts[HIP].x; }
  get y() { return this.pts[HIP].y; }
  get z() { return this.pts[HIP].z; }

  /** 1 when the torso is vertical, 0 when it is flat on the ground. */
  get uprightness() {
    const c = this.pts[CHEST], hp = this.pts[HIP];
    const dy = c.y - hp.y;
    const d = Math.hypot(c.x - hp.x, dy, c.z - hp.z);
    return d < 1e-6 ? 0 : clamp(dy / d, 0, 1);
  }

  get standing() {
    return !this.dead && this.balance > 0.45 && this.uprightness > 0.5;
  }

  groundY() {
    return this.world.groundAt(this.pts[HIP].x, this.pts[HIP].z);
  }

  // ---- muscles -------------------------------------------------------

  spring(p, tx, ty, tz, k, damp, dt, scale) {
    const f = p.mass * scale;
    p.force(
      ((tx - p.x) * k - (p.vx / dt) * damp) * f,
      ((ty - p.y) * k - (p.vy / dt) * damp) * f,
      ((tz - p.z) * k - (p.vz / dt) * damp) * f
    );
  }

  update(dt) {
    if (this.dead) {
      this.hurt = Math.max(0, this.hurt - dt);
      return;
    }

    const h = this.h;
    const hip = this.pts[HIP];
    const gy = this.groundY();

    // --- balance bookkeeping -----------------------------------------
    const up = this.uprightness;
    const airborne = hip.y > gy + h * 0.75;
    if (up < 0.55 || airborne) {
      this.balance -= dt * (airborne ? 0.9 : 5 * (0.55 - up));
    } else {
      this.balance += dt * 0.8;
    }
    this.balance = clamp(this.balance, 0, 1);

    const m = this.balance * this.balance; // muscle authority, eased
    this.hurt = Math.max(0, this.hurt - dt);

    // --- face the target ---------------------------------------------
    if (this.aim) {
      const want = Math.atan2(this.aim.z - hip.z, this.aim.x - hip.x);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += clamp(d, -6 * dt, 6 * dt);
    }

    // --- stand: hold the hip at standing height ----------------------
    const feetDown =
      this.pts[FOOT_L].grounded || this.pts[FOOT_R].grounded || hip.y < gy + h * 0.7;
    if (feetDown || this.flying) {
      const targetY = this.flying
        ? gy + h * (0.95 + Math.sin(this.phase * 0.6) * 0.07)
        : gy + h * 0.42;
      this.spring(hip, hip.x, targetY, hip.z, K_STAND, D_STAND, dt, m);
    }

    // --- torso: keep chest and head stacked over the hip -------------
    // A slight lean into the direction of travel reads as intent, and makes
    // units overbalance forward when shoved — which is the good bit.
    const lean = this.moveDir * 0.05;
    for (const [idx, k] of [[CHEST, K_TORSO], [HEAD, K_TORSO * 0.8]]) {
      const [lx, ly, lz] = POSE[idx];
      const t = this.localToWorld(lx + lean * (idx === HEAD ? 1.7 : 1), ly, lz);
      this.spring(this.pts[idx], t.x, t.y, t.z, k, D_TORSO, dt, m);
    }

    // --- legs: walk cycle --------------------------------------------
    if (!this.flying) {
      const moving = this.moveDir !== 0 && this.standing;
      if (moving) this.phase += dt * (9 / Math.sqrt(this.size));
      const stride = moving ? 0.2 : 0.04;
      const lift = moving ? 0.15 : 0;

      for (const [foot, knee, ph] of [[FOOT_L, KNEE_L, 0], [FOOT_R, KNEE_R, Math.PI]]) {
        const a = this.phase + ph;
        const swing = Math.sin(a) * stride * this.moveDir;
        const [, , lz] = POSE[foot];
        const ft = this.localToWorld(swing, POSE[foot][1], lz);
        // Feet track the terrain, and lift through the forward half of the step.
        const fy = this.world.groundAt(ft.x, ft.z) + Math.max(0, Math.cos(a)) * lift * h;
        this.spring(this.pts[foot], ft.x, fy, ft.z, K_LEG, D_LEG, dt, m);

        const kt = this.localToWorld(swing * 0.5 + 0.04, POSE[knee][1], POSE[knee][2]);
        this.spring(this.pts[knee], kt.x, kt.y, kt.z, K_LEG * 0.5, D_LEG, dt, m);
      }
    }

    // --- drive: chase a target walking velocity ----------------------
    // Velocity control rather than a constant push, so units actually reach a
    // sensible top speed instead of creeping or sliding away.
    if (this.moveDir && this.standing) {
      const f = this.forward();
      const sp = (this.def.speed ?? 1) * BASE_SPEED * this.moveDir;
      const wantX = f.x * sp, wantZ = f.z * sp;
      const curX = hip.vx / dt, curZ = hip.vz / dt;
      hip.force((wantX - curX) * K_DRIVE * hip.mass, 0, (wantZ - curZ) * K_DRIVE * hip.mass);
    }

    this.updateArms(dt, m);
  }

  updateArms(dt, m) {
    const h = this.h;
    const chest = this.pts[CHEST];

    // Off hand: hanging at the side, or braced across the body behind a shield.
    const off = this.localToWorld(
      this.def.shield ? 0.3 : POSE[HAND_L][0],
      this.def.shield ? -0.02 : -0.15,
      this.def.shield ? -0.24 : POSE[HAND_L][2],
      chest
    );
    this.spring(this.pts[HAND_L], off.x, off.y, off.z, K_ARM, D_ARM, dt, m);

    // Weapon hand, driven by the attack state machine. Because it is a spring
    // and not an animation, a swing that starts while the unit is toppling
    // still swings — it just misses spectacularly.
    const a = this.attack;
    let t = this.localToWorld(POSE[HAND_R][0] + 0.05, -0.12, POSE[HAND_R][2], chest);

    if (a.state !== 'idle' && this.aim) {
      const dx = this.aim.x - chest.x, dy = this.aim.y - chest.y, dz = this.aim.z - chest.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      if (a.state === 'windup') {
        const k = clamp(a.t / Math.max(0.01, this.def.windup ?? 0.22), 0, 1);
        t = {
          x: chest.x - ux * h * 0.3 * k,
          y: chest.y + h * (0.05 + 0.3 * k),
          z: chest.z - uz * h * 0.3 * k,
        };
      } else if (a.state === 'strike') {
        const k = clamp(a.t / 0.12, 0, 1);
        const r = h * (0.3 + 0.36 * k);
        t = { x: chest.x + ux * r, y: chest.y + uy * r + h * 0.04, z: chest.z + uz * r };
      } else {
        t = { x: chest.x + ux * h * 0.24, y: chest.y + h * 0.06, z: chest.z + uz * h * 0.24 };
      }
    }
    // A strike keeps some authority even while falling, so hits still land.
    const armM = a.state === 'strike' ? Math.max(m, 0.55) : m;
    this.spring(this.pts[HAND_R], t.x, t.y, t.z, K_ARM * 1.6, D_ARM, dt, armM);
  }

  /** Unit vector along the weapon arm, for aiming and for drawing. */
  armDir() {
    const c = this.pts[CHEST], hnd = this.pts[HAND_R];
    const dx = hnd.x - c.x, dy = hnd.y - c.y, dz = hnd.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-5) {
      const f = this.forward();
      return { x: f.x, y: 0, z: f.z };
    }
    return { x: dx / d, y: dy / d, z: dz / d };
  }

  // ---- damage --------------------------------------------------------

  /**
   * @param {number} dmg
   * @param {number} ix knockback in units/s, pointing the way the victim flies
   * @param {number} iy  (positive is upward)
   * @param {number} iz
   * @param {Point}  at  which joint took the hit
   */
  damage(dmg, ix, iy, iz, at) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurt = 0.22;

    // Knockback divided by weight — a King at 12x shrugs off the arrow that
    // sends a Squire cartwheeling.
    const resist = Math.max(0.15, this.weight * this.size);
    const s = FIXED_DT / resist;
    const p = at || this.pts[CHEST];
    p.impulse(ix * s, iy * s, iz * s);
    // Share some with the torso so the whole body reacts, not just one joint.
    this.pts[CHEST].impulse(ix * s * 0.35, iy * s * 0.35, iz * s * 0.35);
    this.pts[HIP].impulse(ix * s * 0.25, iy * s * 0.25, iz * s * 0.25);

    // Big hits stagger. This is what turns a tidy line into a pile.
    const stagger = (Math.hypot(ix, iy, iz) / resist) * 0.035;
    this.balance = Math.max(0, this.balance - stagger - dmg / (this.maxHp * 1.6));

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.balance = 0;
    this.target = null;
    this.aim = null;
    // Muscles switch off and the joints loosen, so corpses fold instead of
    // holding a pose.
    for (const s of this.sticks) s.k *= 0.55;
  }

  destroy() {
    this.world.removePointsOf(this);
  }
}
