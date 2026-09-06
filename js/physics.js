// Verlet soft-body physics. Point masses + distance constraints over a
// height-field terrain, with optional water. y grows downward; ground is at
// terrain(x) and creatures live at negative y above it.

import { clamp } from './util.js';

export class Particle {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.r = opts.r ?? 9;
    this.friction = opts.friction ?? 0.6; // 0 = ice, 1 = gecko
    this.mass = opts.mass ?? 1;
    this.inv = 1 / this.mass;
    this.grip = 0;      // smoothed ground contact, 0..1
    this.submerged = 0; // 0..1
  }
}

export class Muscle {
  constructor(a, b, rest, opts = {}) {
    this.a = a; this.b = b;
    this.rest = rest;
    this.kind = opts.kind ?? 'muscle';        // 'muscle' | 'bone'
    this.amp = opts.amp ?? 0.34;              // contraction range
    this.stiff = opts.stiff ?? (this.kind === 'bone' ? 0.92 : 0.62);
    this.out = 0;        // controller signal, -1..1
    this.target = rest;  // current commanded length
    this.strain = 0;     // (current - rest) / rest, for rendering
  }
}

/** An axis-aligned solid: a branch, a boulder, a wall. */
export class Block {
  constructor(x0, y0, x1, y1, opts = {}) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.friction = opts.friction ?? 0.95;
    this.style = opts.style ?? 'rock';
  }
}

export class World {
  constructor(cfg = {}) {
    this.parts = [];
    this.links = [];
    this.gravity = cfg.gravity ?? 0.42;
    this.damping = cfg.damping ?? 0.999;
    this.iterations = cfg.iterations ?? 6;
    this.terrain = cfg.terrain ?? (() => 0);
    this.water = cfg.water ?? null; // { level, drag, buoyancy, normal }
    this.blocks = cfg.blocks ?? [];
    this.restitution = cfg.restitution ?? 0.02;
    this.wind = 0;
    this.steps = 0;
  }

  add(p) { this.parts.push(p); return p; }
  link(l) { this.links.push(l); return l; }

  step() {
    this.integrate();
    if (this.water) this.fluidDrag();
    // Alternate solve direction: Gauss-Seidel is order-biased, and a body that
    // always relaxes left-to-right slowly walks itself sideways for free.
    for (let i = 0; i < this.iterations; i++) this.solve(i & 1);
    this.collide();
    this.steps++;
  }

  integrate() {
    const g = this.gravity, d = this.damping, w = this.water;
    for (const p of this.parts) {
      let vx = (p.x - p.px) * d;
      let vy = (p.y - p.py) * d;
      let ay = g;
      let ax = this.wind;
      if (w) {
        const depth = p.y - w.level;
        if (depth > 0) {
          const f = clamp(depth / 30, 0, 1);
          p.submerged = f;
          ay = g - w.buoyancy * f;
          const drag = 1 - (1 - w.drag) * f;
          vx *= drag; vy *= drag;
        } else {
          p.submerged = 0;
        }
      }
      p.px = p.x; p.py = p.y;
      p.x += vx + ax * p.inv;
      p.y += vy + ay;
    }
  }

  /**
   * Segment drag: a limb slicing edge-on through water barely resists, while
   * the same limb swept broadside pushes hard. That asymmetry is the whole
   * reason swimming works — with plain isotropic drag any repeating stroke
   * just undoes itself and the creature goes nowhere.
   */
  fluidDrag() {
    const w = this.water;
    const k = w.normal ?? 0.0009;
    for (const l of this.links) {
      const a = l.a, b = l.b;
      const sub = (a.submerged + b.submerged) * 0.5;
      if (sub <= 0.001) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = -dy / len, ny = dx / len;
      const vx = ((a.x - a.px) + (b.x - b.px)) * 0.5;
      const vy = ((a.y - a.py) + (b.y - b.py)) * 0.5;
      const vn = vx * nx + vy * ny;
      let f = -vn * Math.abs(vn) * k * len * sub;
      f = clamp(f, -1.2, 1.2);
      const fx = nx * f, fy = ny * f;
      a.x += fx * a.inv * 0.5; a.y += fy * a.inv * 0.5;
      b.x += fx * b.inv * 0.5; b.y += fy * b.inv * 0.5;
    }
  }

  solve(reverse = false) {
    const links = this.links;
    const n = links.length;
    for (let i = 0; i < n; i++) {
      const l = links[reverse ? n - 1 - i : i];
      const a = l.a, b = l.b;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) { d = 1e-6; dx = 1e-6; }
      const diff = (d - l.target) / d;
      const wsum = a.inv + b.inv;
      const k = l.stiff * diff / wsum;
      const cx = dx * k, cy = dy * k;
      a.x += cx * a.inv; a.y += cy * a.inv;
      b.x -= cx * b.inv; b.y -= cy * b.inv;
      l.strain = (d - l.rest) / l.rest;
    }
  }

  collide() {
    const ground = this.terrain;
    for (const p of this.parts) {
      const gy = ground(p.x);
      const floor = gy - p.r;
      if (p.y > floor) {
        const vx = p.x - p.px;
        const vy = p.y - p.py;
        // Slope normal, so hills push sideways instead of only up.
        const slope = (ground(p.x + 4) - ground(p.x - 4)) / 8;
        const pen = p.y - floor;
        const nl = Math.sqrt(slope * slope + 1);
        p.x -= (pen * -slope) / nl * 0.5;
        p.y = floor;
        const mu = clamp(p.friction, 0, 1);
        p.px = p.x - vx * (1 - mu * 0.92);
        p.py = p.y + vy * this.restitution;
        p.grip = Math.min(1, p.grip + 0.5);
      } else {
        p.grip *= 0.8;
      }
      for (let i = 0; i < this.blocks.length; i++) this.collideBlock(p, this.blocks[i]);
    }
  }

  /**
   * Circle against an axis-aligned box. Push out along the shortest way to the
   * surface, bounce along the normal, and rub off speed along the tangent —
   * which is what lets a gripping foot hold a branch instead of sliding off it.
   */
  collideBlock(p, b) {
    if (p.x + p.r < b.x0 || p.x - p.r > b.x1 || p.y + p.r < b.y0 || p.y - p.r > b.y1) return;
    const cx = clamp(p.x, b.x0, b.x1);
    const cy = clamp(p.y, b.y0, b.y1);
    let dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    let nx, ny, pen;
    if (d2 > 1e-9) {
      if (d2 > p.r * p.r) return;
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; pen = p.r - d;
    } else {
      // Centre is buried inside the box: leave by the nearest face.
      const left = p.x - b.x0, right = b.x1 - p.x, up = p.y - b.y0, down = b.y1 - p.y;
      const m = Math.min(left, right, up, down);
      if (m === left) { nx = -1; ny = 0; pen = left + p.r; }
      else if (m === right) { nx = 1; ny = 0; pen = right + p.r; }
      else if (m === up) { nx = 0; ny = -1; pen = up + p.r; }
      else { nx = 0; ny = 1; pen = down + p.r; }
    }
    const vx = p.x - p.px, vy = p.y - p.py;
    p.x += nx * pen;
    p.y += ny * pen;
    const vn = vx * nx + vy * ny;
    const tx = -ny, ty = nx;
    const mu = clamp(p.friction * b.friction, 0, 1);
    const vt = (vx * tx + vy * ty) * (1 - mu * 0.92);
    const rn = vn < 0 ? -vn * this.restitution : vn;
    p.px = p.x - (nx * rn + tx * vt);
    p.py = p.y - (ny * rn + ty * vt);
    p.grip = Math.min(1, p.grip + 0.5);
  }

  /** Center of mass. Reuses one object to stay allocation-free in hot loops. */
  com(out = { x: 0, y: 0 }) {
    let x = 0, y = 0, m = 0;
    for (const p of this.parts) { x += p.x * p.mass; y += p.y * p.mass; m += p.mass; }
    out.x = x / m; out.y = y / m;
    return out;
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of this.parts) {
      x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r);
      x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r);
    }
    return { x0, y0, x1, y1 };
  }

  /** True once the body has exploded (NaN or absurd coordinates). */
  unstable() {
    for (const p of this.parts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) return true;
    }
    return false;
  }
}
