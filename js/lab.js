// The evolution screen. Owns the population, decides which creatures are on
// screen right now, and advances them under a frame budget so the UI never
// locks up no matter how many arenas are running.

import { Population } from './evolution.js';
import { Sim } from './simulation.js';
import { trialOf } from './trials.js';
import { drawArena, drawChart, drawIdleCell, Camera } from './render.js';
import { clamp } from './util.js';

export const SPEEDS = [0.5, 1, 2, 4, 8];

export class Lab {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.on = opts.on || (() => {});
    this.pop = null;
    this.trial = trialOf('plains');
    this.blueprint = null;
    this.speciesName = 'Creature';
    this.slots = [];
    this.queue = [];
    this.arenaCount = 6;
    this.speed = 1;
    this.running = false;
    this.turbo = false;
    this.selected = 0;
    this.record = null;
    this.frameAcc = 0;
    this.dpr = 1;
    this.cells = [];
    canvas.addEventListener('pointerdown', (e) => this.pickCell(e));
  }

  /* ── lifecycle ─────────────────────────────────────── */
  start(blueprint, name, cfg = {}) {
    this.blueprint = blueprint;
    this.speciesName = name;
    this.trial = trialOf(cfg.trial ?? this.trial.id);
    this.pop = new Population(blueprint, { ...cfg, trial: this.trial.id, seed: (Math.random() * 1e9) | 0 });
    this.record = null;
    this.reload();
    this.running = true;
    this.emit();
  }

  adopt(pop, name) {
    this.pop = pop;
    this.blueprint = pop.blueprint;
    this.speciesName = name;
    this.trial = trialOf(pop.cfg.trial);
    this.record = null;
    this.reload();
    this.emit();
  }

  /** Rebuild the on-screen slots and the queue of who is waiting their turn. */
  reload() {
    if (!this.pop) return;
    this.queue = this.pop.members.map((m, i) => i).filter((i) => this.pop.members[i].fitness === null);
    this.slots = [];
    const n = Math.min(this.arenaCount, this.pop.cfg.size);
    for (let i = 0; i < n; i++) this.slots.push(this.nextSlot());
  }

  nextSlot() {
    if (!this.queue.length) return null;
    const idx = this.queue.shift();
    const member = this.pop.members[idx];
    return {
      idx,
      sim: new Sim(member.genome, this.trial, 1),
      cam: new Camera(),
      elite: !!member.elite,
      label: `${this.speciesName} ${member.genome.name}`,
    };
  }

  setArenaCount(n) {
    this.arenaCount = n;
    if (!this.pop) return;
    const want = Math.min(n, this.pop.cfg.size);
    while (this.slots.length > want) {
      const s = this.slots.pop();
      if (s) this.queue.unshift(s.idx); // an interrupted lifetime goes back in line
    }
    while (this.slots.length < want) {
      const s = this.nextSlot();
      if (!s) break;
      this.slots.push(s);
    }
    this.selected = clamp(this.selected, 0, Math.max(0, this.slots.length - 1));
    this.emit();
  }

  setPopSize(n) {
    if (!this.pop) return;
    this.pop.resize(n);
    const live = new Set(this.slots.filter(Boolean).map((s) => s.idx));
    this.queue = this.pop.members
      .map((m, i) => i)
      .filter((i) => this.pop.members[i].fitness === null && !live.has(i));
    this.setArenaCount(this.arenaCount);
  }

  setTrial(id) {
    this.trial = trialOf(id);
    if (!this.pop) return;
    // Brains carry over into the new world — that is the interesting part.
    this.pop.cfg.trial = id;
    this.pop.members.forEach((m) => { m.fitness = null; });
    this.pop.history = [];
    this.pop.champions = [];
    this.pop.best = null;
    this.pop.stagnant = 0;
    this.record = null;
    this.reload();
    this.emit();
  }

  setMutation(rate) { if (this.pop) this.pop.cfg.rate = rate; }
  setMorph(m) { if (this.pop) this.pop.cfg.morph = m; }

  /* ── stepping ──────────────────────────────────────── */
  finishSlot(i) {
    const slot = this.slots[i];
    if (!slot) return;
    this.pop.score(slot.idx, slot.sim.fitness);
    this.noteRecord(slot.sim);
    this.slots[i] = this.nextSlot();
    if (!this.slots[i] && !this.queue.length && this.pop.pending === 0) this.endGeneration();
  }

  noteRecord(sim) {
    const f = sim.fitness;
    if (!Number.isFinite(f)) return;
    if (!this.record || f > this.record.fitness) {
      this.record = {
        fitness: f,
        x: sim.com.x,
        y: sim.start.y - sim.peak,
      };
    }
  }

  endGeneration() {
    const row = this.pop.advance();
    if (this.turbo) this.requeue(); else this.reload();
    this.on({ type: 'generation', row });
    this.emit();
  }

  /** One animation frame's worth of simulation. */
  tick() {
    if (!this.pop || !this.running || this.turbo) return;
    const mult = SPEEDS[this.speed] ?? 1;
    let steps = mult;
    if (mult < 1) {
      this.frameAcc += mult;
      steps = Math.floor(this.frameAcc);
      this.frameAcc -= steps;
    }
    if (steps <= 0) return;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      if (slot.sim.step(steps)) this.finishSlot(i);
    }
  }

  /** Absorb the arenas back into the queue so nothing is left half-simulated. */
  enterTurbo() {
    this.turbo = true;
    this.running = true;
    this.requeue();
  }

  exitTurbo() {
    this.turbo = false;
    this.reload();
    this.emit();
  }

  /** Every member without a score goes back in line, in index order. */
  requeue() {
    if (!this.pop) return;
    this.slots = this.slots.map(() => null);
    this.queue = this.pop.members.map((m, i) => i).filter((i) => this.pop.members[i].fitness === null);
  }

  /**
   * Turbo: evaluate whole generations with no rendering, inside a time budget
   * so the browser stays responsive and the counter keeps ticking.
   */
  turboTick(budgetMs = 24) {
    if (!this.pop) return;
    const until = performance.now() + budgetMs;
    let gens = 0;
    while (performance.now() < until) {
      const idx = this.queue.shift();
      if (idx === undefined) {
        if (this.pop.pending === 0) {
          this.endGeneration();
          this.requeue();
          gens++;
          if (gens > 40) break;
        } else {
          // Stragglers left over from live view — take them, do not deadlock.
          this.requeue();
        }
        continue;
      }
      const member = this.pop.members[idx];
      const sim = new Sim(member.genome, this.trial, 1);
      sim.step(this.trial.duration);
      this.pop.score(idx, sim.fitness);
      this.noteRecord(sim);
    }
  }

  skipGeneration() {
    if (!this.pop) return;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      slot.sim.step(this.trial.duration);
      this.pop.score(slot.idx, slot.sim.fitness);
      this.noteRecord(slot.sim);
      this.slots[i] = null;
    }
    while (this.queue.length) {
      const idx = this.queue.shift();
      const sim = new Sim(this.pop.members[idx].genome, this.trial, 1);
      sim.step(this.trial.duration);
      this.pop.score(idx, sim.fitness);
      this.noteRecord(sim);
    }
    this.endGeneration();
  }

  /* ── layout + drawing ──────────────────────────────── */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Choose the grid that gives each arena the most usable 16:9 area. */
  layout(n) {
    const W = this.w, H = this.h;
    let best = { cols: 1, rows: n, score: -1 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = W / cols, ch = H / rows;
      const score = Math.min(cw / 16, ch / 9);
      if (score > best.score) best = { cols, rows, score };
    }
    return best;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const live = this.slots.filter(Boolean);
    this.cells = [];
    if (!live.length) return;
    const n = this.slots.length;
    const { cols, rows } = this.layout(n);
    const cw = this.w / cols, ch = this.h / rows;
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i];
      const rect = {
        x: Math.round((i % cols) * cw),
        y: Math.round(Math.floor(i / cols) * ch),
        w: Math.round(cw),
        h: Math.round(ch),
      };
      // The tail of a generation empties some cells. Leaving them black reads
      // as broken, so they hold their place with a quiet placeholder instead.
      if (!slot) { drawIdleCell(ctx, rect, this.trial); continue; }
      this.cells.push({ rect, i });
      drawArena(ctx, rect, slot.sim, slot.cam, {
        record: this.record,
        trail: n <= 6, // more than a handful of trails and the grid turns to soup
        selected: n > 1 && i === this.selected,
        elite: slot.elite,
        label: slot.label,
      });
    }
  }

  pickCell(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    for (const c of this.cells) {
      if (x >= c.rect.x && x <= c.rect.x + c.rect.w && y >= c.rect.y && y <= c.rect.y + c.rect.h) {
        this.selected = c.i;
        this.emit();
        return;
      }
    }
  }

  drawChartInto(ctx, rect) { drawChart(ctx, rect, this.pop ? this.pop.history : []); }

  /* ── reporting ─────────────────────────────────────── */
  emit() { this.on({ type: 'state', state: this.snapshot() }); }

  snapshot() {
    if (!this.pop) return null;
    const p = this.pop;
    const live = new Map();
    this.slots.forEach((s) => { if (s) live.set(s.idx, true); });
    const rows = p.members.map((m, i) => ({
      i,
      name: `${m.genome.name}`,
      fitness: m.fitness,
      elite: !!m.elite,
      live: live.has(i),
    }));
    rows.sort((a, b) => {
      if (a.fitness === null && b.fitness === null) return a.i - b.i;
      if (a.fitness === null) return 1;
      if (b.fitness === null) return -1;
      return b.fitness - a.fitness;
    });
    const done = p.members.filter((m) => m.fitness !== null);
    const last = p.history[p.history.length - 1];
    return {
      name: this.speciesName,
      trial: this.trial,
      generation: p.generation,
      running: this.running,
      turbo: this.turbo,
      best: p.best,
      genBest: done.length ? Math.max(...done.map((m) => m.fitness)) : (last ? last.best : null),
      genAvg: done.length ? done.reduce((s, m) => s + m.fitness, 0) / done.length : (last ? last.avg : null),
      genStale: done.length === 0 && !!last,
      lastRow: last,
      evaluated: p.evaluated,
      stagnant: p.stagnant,
      pending: p.pending,
      size: p.cfg.size,
      rows,
      unit: this.trial.unit,
    };
  }
}
