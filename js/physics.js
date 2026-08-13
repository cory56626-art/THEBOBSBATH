/**
 * Verlet physics core, in 3D.
 *
 * Every limb of every wobbler, every arrow and every piece of debris is a Point
 * moved by Verlet integration and held together by Sticks (distance
 * constraints). There is no rigid-body solver and no inertia tensors; position
 * based dynamics is what makes it cheap enough to run a hundred ragdolls at
 * once, and floppy enough to be funny.
 *
 * Coordinates are standard 3D: +Y is up, the battlefield lies in the XZ plane,
 * and the two armies face each other along X.
 */

export const GRAVITY = -26;

/**
 * Fixed simulation timestep. Verlet stores velocity as the gap between the last
 * two positions, so that gap only means anything if the step never changes.
 * Everything else in the codebase talks in units/second and converts.
 */
export const FIXED_DT = 1 / 120;

let _pid = 0;

export class Point {
  constructor(x, y, z, mass = 1, radius = 0.1) {
    this.id = _pid++;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    this.fx = 0; this.fy = 0; this.fz = 0;
    this.mass = mass;
    this.inv = mass > 0 ? 1 / mass : 0;
    this.radius = radius;
    this.grounded = false;
    this.collide = false; // only torso joints join the broadphase
    this.body = null;
    this.friction = 0.9;
  }

  force(fx, fy, fz) {
    this.fx += fx; this.fy += fy; this.fz += fz;
  }

  /** Instantaneous velocity change, in per-step units. */
  impulse(ix, iy, iz) {
    this.px -= ix * this.inv;
    this.py -= iy * this.inv;
    this.pz -= iz * this.inv;
  }

  get vx() { return this.x - this.px; }
  get vy() { return this.y - this.py; }
  get vz() { return this.z - this.pz; }

  setVel(vx, vy, vz) {
    this.px = this.x - vx;
    this.py = this.y - vy;
    this.pz = this.z - vz;
  }
}

export class Stick {
  constructor(a, b, stiffness = 1, len = null) {
    this.a = a;
    this.b = b;
    this.len = len == null ? dist(a, b) : len;
    this.k = stiffness;
  }

  solve() {
    const a = this.a, b = this.b;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-7) return;
    const w = a.inv + b.inv;
    if (w <= 0) return;
    const diff = ((d - this.len) / d) * this.k;
    const sa = a.inv / w, sb = b.inv / w;
    a.x += dx * diff * sa; a.y += dy * diff * sa; a.z += dz * diff * sa;
    b.x -= dx * diff * sb; b.y -= dy * diff * sb; b.z -= dz * diff * sb;
  }
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Uniform spatial hash over the XZ plane. Units stand on the ground, so a 2D
 * grid separates them just as well as a 3D one and costs less to rebuild.
 */
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }

  clear() { this.map.clear(); }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  insert(p) {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(p);
  }

  pairs(fn) {
    for (const arr of this.map.values()) {
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        const cx = Math.floor(a.x / this.cell);
        const cz = Math.floor(a.z / this.cell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const other = this.map.get(this.key(cx + ox, cz + oz));
            if (!other) continue;
            for (let j = 0; j < other.length; j++) {
              const b = other[j];
              if (b.id <= a.id) continue; // visit each pair once
              fn(a, b);
            }
          }
        }
      }
    }
  }
}

export class World {
  constructor(opts = {}) {
    this.points = [];
    this.sticks = [];
    this.halfW = opts.halfW ?? 80;
    this.halfD = opts.halfD ?? 45;
    this.iterations = opts.iterations ?? 6;
    this.grid = new Grid(1.2);
    this.height = opts.height ?? (() => 0);
  }

  addPoint(p) { this.points.push(p); return p; }
  addStick(s) { this.sticks.push(s); return s; }

  groundAt(x, z) { return this.height(x, z); }

  removePointsOf(body) {
    this.points = this.points.filter((p) => p.body !== body);
    this.sticks = this.sticks.filter((s) => s.a.body !== body && s.b.body !== body);
  }

  step(dt) {
    const dt2 = dt * dt;
    const pts = this.points;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.inv === 0) { p.fx = p.fy = p.fz = 0; continue; }
      let vx = (p.x - p.px) * 0.999;
      let vy = (p.y - p.py) * 0.999;
      let vz = (p.z - p.pz) * 0.999;
      if (p.grounded) { vx *= p.friction; vz *= p.friction; }

      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + p.fx * p.inv * dt2;
      p.y += vy + (p.fy * p.inv + GRAVITY) * dt2;
      p.z += vz + p.fz * p.inv * dt2;
      p.fx = p.fy = p.fz = 0;
    }

    for (let it = 0; it < this.iterations; it++) {
      const sticks = this.sticks;
      for (let i = 0; i < sticks.length; i++) sticks[i].solve();
      this.collideBodies();
      this.collideWorld();
    }
  }

  collideWorld() {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.inv === 0) continue;
      const gy = this.groundAt(p.x, p.z) + p.radius;
      if (p.y < gy) {
        p.y = gy;
        p.grounded = true;
        // Bleed off downward velocity so bodies settle instead of buzzing.
        if (p.py > p.y) p.py = p.y + (p.py - p.y) * 0.25;
      } else {
        p.grounded = false;
      }
      if (p.x < -this.halfW) { p.x = -this.halfW; p.px = p.x + (p.px - p.x) * 0.4; }
      else if (p.x > this.halfW) { p.x = this.halfW; p.px = p.x + (p.px - p.x) * 0.4; }
      if (p.z < -this.halfD) { p.z = -this.halfD; p.pz = p.z + (p.pz - p.z) * 0.4; }
      else if (p.z > this.halfD) { p.z = this.halfD; p.pz = p.z + (p.pz - p.z) * 0.4; }
    }
  }

  collideBodies() {
    const grid = this.grid;
    grid.clear();
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) if (pts[i].collide) grid.insert(pts[i]);

    grid.pairs((a, b) => {
      if (a.body && a.body === b.body) return;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= min * min || d2 < 1e-10) return;
      const d = Math.sqrt(d2);
      const w = a.inv + b.inv;
      if (w <= 0) return;
      // Soft push-out: units shove and jostle rather than resolving instantly.
      const push = ((min - d) / d) * 0.5;
      const sa = a.inv / w, sb = b.inv / w;
      a.x -= dx * push * sa; a.y -= dy * push * sa; a.z -= dz * push * sa;
      b.x += dx * push * sb; b.y += dy * push * sb; b.z += dz * push * sb;
    });
  }
}

// ---- shared helpers ---------------------------------------------------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const rand = (a, b) => a + Math.random() * (b - a);

/** Shortest distance from point p to segment ab, all as {x,y,z}. */
export function distToSeg(px, py, pz, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  if (l2 < 1e-10) return Math.hypot(px - ax, py - ay, pz - az);
  let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy), pz - (az + t * dz));
}
