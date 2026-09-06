// One creature, one trial, one lifetime. Build the body into a world, let the
// brain drive the muscles, and keep the running tally the fitness function
// eventually reads.

import { World, Particle, Muscle } from './physics.js';
import { clamp, mulberry32 } from './util.js';

const TICK_EVERY = 3; // sensorimotor delay: think at 20 Hz, move at 60 Hz

export class Sim {
  constructor(genome, trial, seed = 1) {
    this.genome = genome;
    this.trial = trial;
    this.rng = mulberry32(seed);
    this.brain = genome.brain.clone();
    this.brain.reset();

    this.world = new World({
      gravity: trial.gravity,
      damping: trial.damping ?? 0.999,
      terrain: trial.terrain,
      water: trial.water ?? null,
      blocks: trial.blocks ?? [],
      iterations: 6,
    });

    this.build();

    this.inputs = new Float32Array(this.brain.nIn);
    this.motors = this.world.links.filter((l) => l.kind === 'muscle');
    this._com = { x: 0, y: 0 };
    this.world.com(this._com);
    this.start = { x: this._com.x, y: this._com.y };
    this.com = { x: this._com.x, y: this._com.y };
    this.peak = 0;
    this.heightSum = 0;
    // Height only counts while something is actually touching down. Otherwise
    // "hold yourself up" is won by bouncing: a creature airborne most of the
    // trial posts a higher average than one calmly standing.
    this.standSum = 0;
    this.effort = 0;
    this.steps = 0;
    // Standing height: the body's own scale, so posture scores mean the same
    // thing for a mouse and for a gorilla.
    this.standH = Math.max(12, this.trial.terrain(this.start.x) - this.start.y);
    // Scores read the position a creature HOLDS at the end of its life, not the
    // instant it happened to stop. Otherwise a dive across the line beats a
    // gait that actually carried the body there.
    this.holdFrom = Math.floor(trial.duration * 0.85);
    this.holdX = 0; this.holdY = 0; this.holdN = 0;
    this.hold = { x: this.start.x, y: this.start.y };
    this.done = false;
    this.dead = false;
    this.fitness = 0;
    this.trail = [];
  }

  build() {
    const body = this.genome.body;
    const gy = this.trial.spawnY ?? this.trial.terrain(0);
    // Centre the body on x = 0 and drop it so its lowest point rests on ground.
    let cx = 0, low = -Infinity;
    for (const n of body.nodes) cx += n.x;
    cx /= body.nodes.length;
    cx -= this.trial.spawnX ?? 0;
    for (const n of body.nodes) low = Math.max(low, n.y + n.r);
    const dy = gy - low - 2;
    for (const n of body.nodes) {
      // A dab of seeded noise. A perfectly symmetric body sits in an unstable
      // equilibrium that exact float arithmetic will never leave on its own.
      const jx = (this.rng() - 0.5) * 0.3;
      const jy = (this.rng() - 0.5) * 0.3;
      this.world.add(new Particle(n.x - cx + jx, n.y + dy + jy, { r: n.r, friction: n.friction, mass: n.mass }));
    }
    for (const l of body.links) {
      const a = this.world.parts[l.a], b = this.world.parts[l.b];
      this.world.link(new Muscle(a, b, Math.hypot(a.x - b.x, a.y - b.y) || 1, { kind: l.kind, amp: l.amp }));
    }
  }

  sense() {
    const w = this.world, inp = this.inputs;
    const phase = this.steps * 0.06;
    inp[0] = 1;
    inp[1] = Math.sin(phase);
    inp[2] = Math.cos(phase);
    inp[3] = Math.sin(phase * 0.5);
    inp[4] = clamp((this.com.x - this.prevX) / 4, -1, 1);
    inp[5] = clamp((this.com.y - this.prevY) / 4, -1, 1);
    const parts = w.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const b = 6 + i * 4;
      if (b + 3 >= inp.length) break;
      inp[b] = clamp((w.terrain(p.x) - p.y) / 100, -1, 2.5);
      inp[b + 1] = clamp((p.x - p.px) / 5, -1, 1);
      inp[b + 2] = clamp((p.y - p.py) / 5, -1, 1);
      inp[b + 3] = p.grip;
    }
  }

  /** Advance n physics steps. Returns true once the lifetime is over. */
  step(n = 1) {
    if (this.done) return true;
    const trial = this.trial, w = this.world;
    for (let s = 0; s < n && !this.done; s++) {
      this.prevX = this.com.x; this.prevY = this.com.y;
      if (this.steps % TICK_EVERY === 0) {
        this.sense();
        const out = this.brain.forward(this.inputs);
        const motors = this.motors;
        for (let i = 0; i < motors.length; i++) {
          const m = motors[i];
          const o = i < out.length ? out[i] : 0;
          this.effort += Math.abs(o - m.out);
          m.out = o;
          m.target = m.rest * (1 + m.amp * o);
        }
      }
      if (trial.wind) w.wind = trial.wind(this.steps, this.rng);
      w.step();
      this.steps++;

      w.com(this._com);
      this.com.x = this._com.x; this.com.y = this._com.y;
      const localGround = w.terrain(this.com.x);
      this.peak = Math.max(this.peak, this.start.y - this.com.y);
      const h = clamp(localGround - this.com.y, 0, 600);
      this.heightSum += h;
      let supported = false;
      for (let i = 0; i < w.parts.length; i++) {
        if (w.parts[i].grip > 0.35) { supported = true; break; }
      }
      if (supported) this.standSum += h;
      if (this.steps >= this.holdFrom) {
        this.holdX += this.com.x; this.holdY += this.com.y; this.holdN++;
        this.hold.x = this.holdX / this.holdN;
        this.hold.y = this.holdY / this.holdN;
      } else {
        this.hold.x = this.com.x; this.hold.y = this.com.y;
      }
      if (this.steps % 8 === 0) {
        this.trail.push(this.com.x, this.com.y);
        if (this.trail.length > 160) this.trail.splice(0, 2);
      }

      if (w.unstable()) { this.dead = true; this.finish(); return true; }
      if (this.steps >= trial.duration) this.finish();
    }
    return this.done;
  }

  finish() {
    this.done = true;
    // A body that tears itself apart scores just below standing still — bad,
    // but not the huge outlier that used to drag every generation average down.
    const raw = this.dead ? -1 : this.trial.score(this);
    this.fitness = Number.isFinite(raw) ? raw : -1;
  }

  /** Mean supported height, as a fraction of the starting posture. */
  get posture() {
    return this.standSum / Math.max(1, this.steps) / this.standH;
  }

  /**
   * Average altitude gained over the whole life, in world units. Unlike a peak,
   * this cannot be won with one lucky hop — you have to get up early and stay
   * up — which makes it a much better-shaped gradient for a climb.
   */
  get lift() {
    return this.standSum / Math.max(1, this.steps) - this.standH;
  }

  get progress() { return Math.min(1, this.steps / this.trial.duration); }
}
