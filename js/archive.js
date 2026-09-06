// The time machine. Pick any two recorded champions and run them side by side
// in the same trial — generation 1's flailing against generation 300's gait.

import { Genome } from './genome.js';
import { Sim } from './simulation.js';
import { trialOf } from './trials.js';
import { drawArena, Camera } from './render.js';

export class Archive {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.champions = [];
    this.trial = trialOf('plains');
    this.speciesName = 'Creature';
    this.lanes = [null, null];
    this.playing = false;
    this.dpr = 1;
  }

  setSource(pop, name) {
    this.champions = pop?.champions ?? [];
    this.trial = trialOf(pop?.cfg?.trial ?? 'plains');
    this.speciesName = name || 'Creature';
  }

  get count() { return this.champions.length; }

  /** Load the champion at history index i into lane 0 or 1. */
  setLane(lane, i) {
    const rec = this.champions[i];
    if (!rec) { this.lanes[lane] = null; return null; }
    const genome = Genome.fromJSON(rec.genome);
    this.lanes[lane] = {
      rec,
      sim: new Sim(genome, this.trial, 1),
      cam: new Camera(),
      label: `${this.speciesName} · gen ${rec.gen}`,
    };
    return rec;
  }

  restart() {
    for (let i = 0; i < 2; i++) {
      const lane = this.lanes[i];
      if (!lane) continue;
      lane.sim = new Sim(Genome.fromJSON(lane.rec.genome), this.trial, 1);
      lane.cam = new Camera();
    }
  }

  play() { this.restart(); this.playing = true; }
  stop() { this.playing = false; }

  tick(steps = 1) {
    if (!this.playing) return;
    let allDone = true;
    for (const lane of this.lanes) {
      if (!lane) continue;
      if (!lane.sim.step(steps)) allDone = false;
    }
    if (allDone) this.playing = false;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const active = this.lanes.filter(Boolean);
    if (!active.length) return;
    const h = this.h / active.length;
    active.forEach((lane, i) => {
      drawArena(ctx, { x: 0, y: Math.round(i * h), w: this.w, h: Math.round(h) }, lane.sim, lane.cam, {
        label: lane.label,
        trail: true,
      });
    });
    if (!this.playing && active.every((l) => l.sim.done)) {
      const winner = active.reduce((a, b) => (a.sim.fitness >= b.sim.fitness ? a : b));
      ctx.save();
      ctx.font = '600 13px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,208,92,0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(`${winner.label} wins — ${winner.sim.fitness.toFixed(2)}${this.trial.unit === 'm' ? 'm' : ''}`, this.w / 2, this.h - 14);
      ctx.restore();
    }
  }

  /** Step plot of every generation that broke the record. */
  drawLineage(ctx, rect) {
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const marks = [];
    let best = -Infinity;
    for (const c of this.champions) {
      if (c.fitness > best) { best = c.fitness; marks.push(c); }
    }
    if (marks.length < 2) {
      ctx.fillStyle = 'rgba(226,240,250,0.35)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('no records broken yet', rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const gLo = marks[0].gen, gHi = this.champions[this.champions.length - 1].gen;
    const fLo = Math.min(0, marks[0].fitness), fHi = marks[marks.length - 1].fitness;
    const px = (g) => rect.x + 6 + ((g - gLo) / Math.max(1, gHi - gLo)) * (rect.w - 12);
    const py = (f) => rect.y + rect.h - 8 - ((f - fLo) / Math.max(1e-6, fHi - fLo)) * (rect.h - 20);

    ctx.strokeStyle = '#7ef0c0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    marks.forEach((m, i) => {
      const x = px(m.gen), y = py(m.fitness);
      if (i === 0) ctx.moveTo(x, y);
      else { ctx.lineTo(x, py(marks[i - 1].fitness)); ctx.lineTo(x, y); }
    });
    ctx.lineTo(px(gHi), py(marks[marks.length - 1].fitness));
    ctx.stroke();

    ctx.fillStyle = '#7ef0c0';
    for (const m of marks) {
      ctx.beginPath();
      ctx.arc(px(m.gen), py(m.fitness), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(226,240,250,0.5)';
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillText(`${marks.length} leaps`, rect.x + 6, rect.y + 12);
    ctx.textAlign = 'right';
    ctx.fillText(fHi.toFixed(1), rect.x + rect.w - 6, rect.y + 12);
    ctx.textAlign = 'left';
  }
}
