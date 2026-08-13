// Particles, floating damage numbers, shockwave rings, screen shake and the
// kill feed. Purely cosmetic — but this layer is most of why the genre reads as
// satisfying, so it gets real attention.

import { TAU, rand, randInt, clamp, withAlpha } from './utils.js';

export class FX {
  constructor() {
    this.particles = [];
    this.numbers = [];
    this.rings = [];
    this.feed = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
  }

  clear() {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.rings.length = 0;
    this.feed.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  burst(x, y, color, count = 12, speed = 320, size = 5) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.25, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.75),
        maxLife: 0.75,
        r: rand(size * 0.5, size),
        color,
        drag: 2.4,
      });
    }
  }

  /** Directional spray, used when a weapon connects. */
  spray(x, y, angle, color, count = 8, speed = 380) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.7, 0.7);
      const s = rand(speed * 0.3, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.2, 0.5),
        maxLife: 0.5,
        r: rand(2.5, 6),
        color,
        drag: 3.2,
      });
    }
  }

  number(x, y, text, color, big = false) {
    this.numbers.push({
      x: x + rand(-14, 14),
      y,
      text,
      color,
      life: big ? 1.2 : 0.85,
      maxLife: big ? 1.2 : 0.85,
      vy: big ? -110 : -85,
      size: big ? 58 : 33,
    });
  }

  ring(x, y, color, radius = 90, width = 8) {
    this.rings.push({ x, y, color, r: 8, target: radius, life: 0.5, maxLife: 0.5, width });
  }

  kill(text, color) {
    this.feed.unshift({ text, color, life: 3.4 });
    if (this.feed.length > 5) this.feed.pop();
  }

  addShake(amount) {
    this.shake = Math.min(34, this.shake + amount);
  }

  addFlash(color, amount = 0.5) {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += 620 * dt; // a little gravity so debris settles instead of floating
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      if (n.life <= 0) { this.numbers.splice(i, 1); continue; }
      n.y += n.vy * dt;
      n.vy += 130 * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r += (r.target - r.r) * clamp(dt * 9, 0, 1);
    }

    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].life -= dt;
      if (this.feed[i].life <= 0) this.feed.splice(i, 1);
    }

    this.shake *= Math.pow(0.0016, dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash -= dt * 2.2;
    if (this.flash < 0) this.flash = 0;
  }

  /** Shake offset the renderer applies before drawing the arena. */
  shakeOffset() {
    if (!this.shake) return [0, 0];
    return [rand(-this.shake, this.shake), rand(-this.shake, this.shake)];
  }

  drawWorld(ctx) {
    // Shockwave rings sit under everything else.
    for (const r of this.rings) {
      const a = r.life / r.maxLife;
      ctx.strokeStyle = withAlpha(r.color, a * 0.8);
      ctx.lineWidth = r.width * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }

    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, TAU);
      ctx.fill();
    }
  }

  drawNumbers(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const a = clamp(n.life / n.maxLife, 0, 1);
      ctx.font = `900 ${n.size}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = `rgba(6,10,24,${a * 0.9})`;
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = withAlpha(n.color, a);
      ctx.fillText(n.text, n.x, n.y);
    }
  }
}
