// Canvas drawing. Everything renders into a rectangle ("cell") of a shared
// canvas so one arena grid can show dozens of runs without dozens of contexts.

import { clamp, lerp } from './util.js';

export class Camera {
  constructor() { this.x = 0; this.y = -60; this.zoom = 1; this.ready = false; }
  follow(tx, ty, zoom, snap = false) {
    if (!this.ready || snap) { this.x = tx; this.y = ty; this.zoom = zoom; this.ready = true; return; }
    this.x = lerp(this.x, tx, 0.12);
    this.y = lerp(this.y, ty, 0.08);
    this.zoom = lerp(this.zoom, zoom, 0.08);
  }
}

const GRIP_HUE = 18;   // sticky feet run warm
const SLICK_HUE = 195; // slippery nodes run cold

function nodeHue(friction) { return lerp(SLICK_HUE, GRIP_HUE, clamp(friction, 0, 1)); }

/** Muscle colour: cool when stretching, hot when contracting. */
function muscleStroke(out) {
  const t = clamp((out + 1) / 2, 0, 1);
  const hue = lerp(186, 344, t);
  const light = 45 + Math.abs(out) * 22;
  return `hsl(${hue}, 78%, ${light}%)`;
}

export function drawSky(ctx, rect, trial) {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, trial.sky[0]);
  g.addColorStop(1, trial.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** Distance posts: the single most important cue that progress is happening. */
function drawMarkers(ctx, rect, cam, trial, toX, toY) {
  const halfW = rect.w / 2 / cam.zoom;
  const from = Math.floor((cam.x - halfW) / 100) * 100;
  const to = cam.x + halfW + 100;
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  for (let wx = from; wx <= to; wx += 100) {
    const sx = toX(wx);
    if (sx < rect.x - 20 || sx > rect.x + rect.w + 20) continue;
    const water = !!trial.water;
    const gy = water ? toY(trial.water.level) : toY(trial.terrain(wx));
    const major = Math.abs(wx) % 500 < 1;
    const len = (major ? 34 : 18) * cam.zoom * (water ? -1 : 1);
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, gy);
    ctx.lineTo(sx, gy - len);
    ctx.stroke();
    if (major && rect.h > 150) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${(wx / 100) | 0}m`, sx, gy - len - (water ? -12 : 6) * cam.zoom);
    }
  }
  ctx.restore();
}

function drawTerrain(ctx, rect, cam, trial, toX, toY) {
  const step = 5;
  const g = ctx.createLinearGradient(0, toY(trial.terrain(cam.x)) - 10, 0, rect.y + rect.h);
  g.addColorStop(0, trial.ground[0]);
  g.addColorStop(1, trial.ground[1]);
  ctx.beginPath();
  let started = false;
  for (let sx = rect.x - step; sx <= rect.x + rect.w + step; sx += step) {
    const wx = cam.x + (sx - (rect.x + rect.w / 2)) / cam.zoom;
    const sy = toY(trial.terrain(wx));
    if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
  }
  ctx.lineTo(rect.x + rect.w + step, rect.y + rect.h);
  ctx.lineTo(rect.x - step, rect.y + rect.h);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawWater(ctx, rect, trial, toY) {
  const top = Math.max(rect.y, toY(trial.water.level));
  ctx.fillStyle = 'rgba(40,150,190,0.20)';
  ctx.fillRect(rect.x, top, rect.w, rect.y + rect.h - top);
  ctx.strokeStyle = 'rgba(150,230,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rect.x, top);
  ctx.lineTo(rect.x + rect.w, top);
  ctx.stroke();
}

/** Solids: tree branches, trunks and boulders. */
function drawBlocks(ctx, rect, blocks, toX, toY, zoom) {
  for (const b of blocks) {
    const x = toX(b.x0), y = toY(b.y0);
    const w = (b.x1 - b.x0) * zoom, h = (b.y1 - b.y0) * zoom;
    if (x + w < rect.x - 8 || x > rect.x + rect.w + 8) continue;
    if (y + h < rect.y - 8 || y > rect.y + rect.h + 8) continue;

    if (b.style === 'branch' || b.style === 'trunk') {
      // Branch blocks run deep so the stair is solid underneath. Only the top
      // lip is drawn as wood; the mass below is foliage, or the tree reads as
      // a plank fence.
      const lip = Math.max(2, 16 * zoom);
      ctx.fillStyle = b.style === 'trunk' ? '#3a2817' : '#1e3320';
      ctx.fillRect(x, y, w, h);
      if (b.style === 'branch') {
        // Leaf tufts sized from the branch width, not its depth.
        const lr = w * 0.34;
        ctx.fillStyle = 'rgba(84, 140, 78, 0.55)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.3, y - lr * 0.35, lr, lr * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(108, 168, 92, 0.45)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.74, y - lr * 0.55, lr * 0.72, lr * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(0, y, 0, y + lip);
      g.addColorStop(0, '#8a6338');
      g.addColorStop(1, '#4a331c');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, lip);
      ctx.strokeStyle = 'rgba(206,168,110,0.6)';
      ctx.lineWidth = Math.max(1, 1.4 * zoom);
      ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();
      // Bark grain down the trunk.
      if (b.style === 'trunk' && w > 8) {
        ctx.strokeStyle = 'rgba(20,12,6,0.45)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 5; i++) {
          const gx = x + (w * i) / 6;
          ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke();
        }
      }
    } else {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#6b6f78');
      g.addColorStop(1, '#33363d');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(180,190,200,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }
}

/** The line to beat: where the best creature so far got to. */
function drawRecord(ctx, rect, trial, record, toX, toY, cam) {
  if (record == null || !Number.isFinite(record)) return;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 208, 92, 0.75)';
  ctx.lineWidth = 1.5;
  if (trial.id === 'vault') {
    const sy = toY(record.y);
    ctx.beginPath(); ctx.moveTo(rect.x, sy); ctx.lineTo(rect.x + rect.w, sy); ctx.stroke();
  } else {
    const sx = toX(record.x);
    if (sx > rect.x - 4 && sx < rect.x + rect.w + 4) {
      ctx.beginPath(); ctx.moveTo(sx, rect.y); ctx.lineTo(sx, rect.y + rect.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 208, 92, 0.9)';
      ctx.beginPath();
      ctx.moveTo(sx, rect.y + 8); ctx.lineTo(sx + 16, rect.y + 14); ctx.lineTo(sx, rect.y + 20);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawCreature(ctx, world, toX, toY, zoom, opts = {}) {
  const alpha = opts.alpha ?? 1;
  const ghost = opts.ghost === true;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (!ghost) {
    // Contact shadows sell the fact that feet are actually on the floor.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const p of world.parts) {
      const gy = world.terrain(p.x);
      const gap = clamp(1 - (gy - p.y) / 140, 0.12, 1);
      const rx = p.r * zoom * gap * 1.4;
      if (rx < 0.4) continue;
      ctx.beginPath();
      ctx.ellipse(toX(p.x), toY(gy) - 1, rx, Math.max(1, rx * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const l of world.links) {
    const ax = toX(l.a.x), ay = toY(l.a.y), bx = toX(l.b.x), by = toY(l.b.y);
    ctx.lineCap = 'round';
    if (l.kind === 'bone') {
      ctx.strokeStyle = ghost ? 'rgba(200,220,235,0.5)' : '#cfd9e4';
      ctx.lineWidth = Math.max(1.5, 6 * zoom);
    } else {
      ctx.strokeStyle = ghost ? 'rgba(140,190,220,0.5)' : muscleStroke(l.out);
      ctx.lineWidth = Math.max(1.2, (3.4 + Math.abs(l.out) * 2.6) * zoom);
    }
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  for (const p of world.parts) {
    const x = toX(p.x), y = toY(p.y), r = Math.max(1.6, p.r * zoom);
    const hue = nodeHue(p.friction);
    if (ghost) {
      ctx.strokeStyle = 'rgba(210,230,245,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, `hsl(${hue}, 62%, 76%)`);
    g.addColorStop(1, `hsl(${hue}, 55%, 38%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.grip > 0.4 ? 'rgba(255,236,180,0.95)' : 'rgba(10,16,22,0.65)';
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.stroke();
    if (p.friction > 0.7 && r > 5) {
      // Tread marks: a visual shorthand for "this node grips".
      ctx.strokeStyle = 'rgba(20,14,10,0.45)';
      ctx.lineWidth = Math.max(0.8, r * 0.12);
      for (let i = 0; i < 3; i++) {
        const a = -0.6 + i * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.62, a - 0.18, a + 0.18);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Path of the centre of mass, fading out with age so it reads as motion
 *  rather than as scribble. */
function drawTrail(ctx, trail, toX, toY) {
  const n = trail.length / 2;
  if (n < 4) return;
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    ctx.strokeStyle = `rgba(126, 240, 192, ${(t * 0.34).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(toX(trail[(i - 1) * 2]), toY(trail[(i - 1) * 2 + 1]));
    ctx.lineTo(toX(trail[i * 2]), toY(trail[i * 2 + 1]));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw one running simulation into a cell.
 * rect: {x,y,w,h} in device-independent canvas pixels.
 */
export function drawArena(ctx, rect, sim, cam, opts = {}) {
  const trial = sim.trial;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const focusY = trial.id === 'vault'
    ? Math.min(sim.com.y, sim.start.y - sim.peak * 0.6)
    : sim.com.y;
  const zoom = clamp(Math.min(rect.h / 300, rect.w / 420), 0.16, 1.5);
  cam.follow(sim.com.x + 30, focusY - 20, zoom, opts.snap);

  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h * 0.62;
  const toX = (wx) => cx + (wx - cam.x) * cam.zoom;
  const toY = (wy) => cy + (wy - cam.y) * cam.zoom;

  drawSky(ctx, rect, trial);
  drawMarkers(ctx, rect, cam, trial, toX, toY);
  drawTerrain(ctx, rect, cam, trial, toX, toY);
  if (sim.world.blocks.length) drawBlocks(ctx, rect, sim.world.blocks, toX, toY, cam.zoom);
  if (trial.water) drawWater(ctx, rect, trial, toY);
  if (opts.record) drawRecord(ctx, rect, trial, opts.record, toX, toY, cam);
  if (opts.ghost) drawCreature(ctx, opts.ghost.world, toX, toY, cam.zoom, { ghost: true });
  if (opts.trail) drawTrail(ctx, sim.trail, toX, toY);
  drawCreature(ctx, sim.world, toX, toY, cam.zoom);

  drawCellHud(ctx, rect, sim, opts);

  ctx.strokeStyle = opts.selected ? 'rgba(126,240,192,0.9)' : 'rgba(255,255,255,0.10)';
  ctx.lineWidth = opts.selected ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

function drawCellHud(ctx, rect, sim, opts) {
  const pad = 6;
  const compact = rect.h < 130;
  ctx.save();
  ctx.font = `${compact ? 9 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = 'top';

  const label = opts.label ?? sim.genome.name;
  const score = sim.done ? sim.fitness : sim.trial.score(sim);
  const scoreText = `${score >= 0 ? '' : '−'}${Math.abs(score).toFixed(compact ? 1 : 2)}${sim.trial.unit === 'm' ? 'm' : ''}`;

  ctx.fillStyle = 'rgba(6,10,14,0.55)';
  ctx.fillRect(rect.x, rect.y, rect.w, compact ? 15 : 19);
  ctx.fillStyle = opts.elite ? '#ffd05c' : 'rgba(226,240,250,0.92)';
  ctx.fillText(label, rect.x + pad, rect.y + (compact ? 3 : 4));
  ctx.textAlign = 'right';
  ctx.fillStyle = score > 0 ? '#7ef0c0' : 'rgba(226,240,250,0.6)';
  ctx.fillText(scoreText, rect.x + rect.w - pad, rect.y + (compact ? 3 : 4));
  ctx.textAlign = 'left';

  // Lifetime bar along the bottom edge.
  const h = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(rect.x, rect.y + rect.h - h, rect.w, h);
  ctx.fillStyle = sim.done ? 'rgba(126,240,192,0.85)' : 'rgba(126,200,240,0.85)';
  ctx.fillRect(rect.x, rect.y + rect.h - h, rect.w * sim.progress, h);
  ctx.restore();
}

/** A slot with nobody left to run: still part of the grid, just resting. */
export function drawIdleCell(ctx, rect, trial) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawSky(ctx, rect, trial);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(5, 9, 13, 0.55)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  if (rect.h > 60) {
    ctx.fillStyle = 'rgba(226,240,250,0.28)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('generation spent', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

/** Static body preview used by the designer, library cards and the codex. */
export function drawBody(ctx, rect, body, opts = {}) {
  if (!body.nodes.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of body.nodes) {
    x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r);
    y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r);
  }
  const pad = opts.pad ?? 10;
  const z = Math.min((rect.w - pad * 2) / Math.max(1, x1 - x0), (rect.h - pad * 2) / Math.max(1, y1 - y0), opts.maxZoom ?? 1);
  const ox = rect.x + rect.w / 2 - ((x0 + x1) / 2) * z;
  const oy = rect.y + rect.h / 2 - ((y0 + y1) / 2) * z;
  const toX = (wx) => ox + wx * z, toY = (wy) => oy + wy * z;

  for (const l of body.links) {
    const a = body.nodes[l.a], b = body.nodes[l.b];
    if (!a || !b) continue;
    ctx.lineCap = 'round';
    ctx.strokeStyle = l.kind === 'bone' ? '#cfd9e4' : 'hsl(186, 78%, 52%)';
    ctx.lineWidth = Math.max(1.4, (l.kind === 'bone' ? 5 : 3.4) * z);
    ctx.beginPath(); ctx.moveTo(toX(a.x), toY(a.y)); ctx.lineTo(toX(b.x), toY(b.y)); ctx.stroke();
  }
  for (const n of body.nodes) {
    const x = toX(n.x), y = toY(n.y), r = Math.max(2, n.r * z);
    const hue = nodeHue(n.friction);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, `hsl(${hue}, 62%, 76%)`);
    g.addColorStop(1, `hsl(${hue}, 55%, 38%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,16,22,0.6)';
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.stroke();
  }
  return { toX, toY, z };
}

/** Best/average fitness over generations. */
export function drawChart(ctx, rect, history, opts = {}) {
  ctx.save();
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (history.length < 2) {
    ctx.fillStyle = 'rgba(226,240,250,0.35)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('waiting for generation 2…', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
    return;
  }
  let lo = Infinity, hi = -Infinity;
  for (const h of history) { lo = Math.min(lo, h.avg, h.best); hi = Math.max(hi, h.best); }
  if (hi - lo < 1e-6) hi = lo + 1;
  const padY = (hi - lo) * 0.1;
  lo -= padY; hi += padY;
  const n = history.length;
  const px = (i) => rect.x + (i / (n - 1)) * rect.w;
  const py = (v) => rect.y + rect.h - ((v - lo) / (hi - lo)) * rect.h;

  if (lo < 0 && hi > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(rect.x, py(0)); ctx.lineTo(rect.x + rect.w, py(0)); ctx.stroke();
    ctx.setLineDash([]);
  }

  const line = (key, color, fill) => {
    ctx.beginPath();
    history.forEach((h, i) => (i ? ctx.lineTo(px(i), py(h[key])) : ctx.moveTo(px(i), py(h[key]))));
    if (fill) {
      ctx.lineTo(px(n - 1), rect.y + rect.h);
      ctx.lineTo(px(0), rect.y + rect.h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  };
  line('best', null, 'rgba(126,240,192,0.12)');
  line('avg', 'rgba(126,200,240,0.85)');
  line('best', '#7ef0c0');

  ctx.fillStyle = 'rgba(226,240,250,0.5)';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(hi.toFixed(1), rect.x + 4, rect.y + 11);
  ctx.fillText(lo.toFixed(1), rect.x + 4, rect.y + rect.h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`gen ${history[n - 1].gen}`, rect.x + rect.w - 4, rect.y + rect.h - 4);
  ctx.restore();
}
