// The creature editor: place nodes, string muscles between them, and poke the
// result to see how it flops before any brain is attached.

import { clamp } from './util.js';
import { drawBody } from './render.js';
import { normalizeBody } from './genome.js';
import { Sim } from './simulation.js';
import { Genome } from './genome.js';
import { TRIALS } from './trials.js';
import { mulberry32 } from './util.js';

const HIT_PAD = 5;

export class Designer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = opts.onChange || (() => {});
    this.body = { nodes: [], links: [] };
    this.tool = 'node';
    this.symmetry = false;
    this.boneMode = false;
    this.selNode = -1;
    this.selLink = -1;
    this.linkFrom = -1;
    this.hover = { node: -1, link: -1 };
    this.pointer = { x: 0, y: 0, down: false, dragging: -1, panning: false, moved: false };
    this.cam = { x: 0, y: -60, zoom: 1 };
    this.preview = null;
    this.defaults = { r: 10, friction: 0.6, mass: 1 };
    this.dpr = 1;
    this.bind();
  }

  /* ── coordinate transforms ─────────────────────────── */
  get cx() { return this.w / 2; }
  get cy() { return this.h * 0.68; }
  toX(wx) { return this.cx + (wx - this.cam.x) * this.cam.zoom; }
  toY(wy) { return this.cy + (wy - this.cam.y) * this.cam.zoom; }
  toW(sx, sy) {
    return { x: (sx - this.cx) / this.cam.zoom + this.cam.x, y: (sy - this.cy) / this.cam.zoom + this.cam.y };
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

  /* ── data ──────────────────────────────────────────── */
  setBody(body, { fit = true } = {}) {
    this.body = {
      nodes: body.nodes.map((n) => ({ x: n.x, y: n.y, r: n.r ?? 10, friction: n.friction ?? 0.6, mass: n.mass ?? 1 })),
      links: body.links.map((l) => ({ a: l.a, b: l.b, kind: l.kind ?? 'muscle', amp: l.amp ?? 0.34 })),
    };
    this.selNode = -1; this.selLink = -1; this.linkFrom = -1; this.preview = null;
    if (fit) this.fit();
    this.changed();
  }

  getBody() { return normalizeBody(this.body); }

  fit() {
    if (!this.body.nodes.length) { this.cam = { x: 0, y: -60, zoom: 1 }; return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.body.nodes) {
      x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r);
      y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r);
    }
    y1 = Math.max(y1, 0); // always keep the ground line in frame
    const z = Math.min((this.w * 0.72) / Math.max(60, x1 - x0), (this.h * 0.62) / Math.max(60, y1 - y0), 1.9);
    this.cam.zoom = clamp(z, 0.25, 1.9);
    this.cam.x = (x0 + x1) / 2;
    this.cam.y = (y0 + y1) / 2;
  }

  changed() { this.onChange(this.stats()); }

  stats() {
    const muscles = this.body.links.filter((l) => l.kind === 'muscle').length;
    return {
      nodes: this.body.nodes.length,
      links: this.body.links.length,
      muscles,
      bones: this.body.links.length - muscles,
      valid: this.body.nodes.length >= 2 && muscles >= 1,
    };
  }

  /* ── hit testing ───────────────────────────────────── */
  nodeAt(w) {
    for (let i = this.body.nodes.length - 1; i >= 0; i--) {
      const n = this.body.nodes[i];
      if (Math.hypot(n.x - w.x, n.y - w.y) <= n.r + HIT_PAD / this.cam.zoom) return i;
    }
    return -1;
  }

  linkAt(w) {
    for (let i = this.body.links.length - 1; i >= 0; i--) {
      const l = this.body.links[i];
      const a = this.body.nodes[l.a], b = this.body.nodes[l.b];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((w.x - a.x) * dx + (w.y - a.y) * dy) / len2, 0, 1);
      const d = Math.hypot(w.x - (a.x + dx * t), w.y - (a.y + dy * t));
      if (d <= 7 / this.cam.zoom) return i;
    }
    return -1;
  }

  /* ── editing ───────────────────────────────────────── */
  addNode(w) {
    const proto = this.selNode >= 0 ? this.body.nodes[this.selNode] : this.defaults;
    const make = (x) => ({
      x, y: Math.min(w.y, -2),
      r: proto.r ?? 10,
      friction: proto.friction ?? 0.6,
      mass: proto.mass ?? 1,
    });
    this.body.nodes.push(make(w.x));
    let added = this.body.nodes.length - 1;
    if (this.symmetry && Math.abs(w.x) > 3) {
      this.body.nodes.push(make(-w.x));
      // Mirrored pairs start joined, otherwise the halves float apart.
      this.body.links.push({ a: added, b: added + 1, kind: 'muscle', amp: 0.34 });
    }
    this.select(added, -1);
    this.changed();
  }

  addLink(a, b) {
    if (a === b || a < 0 || b < 0) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (this.body.links.some((l) => Math.min(l.a, l.b) === lo && Math.max(l.a, l.b) === hi)) return;
    this.body.links.push({ a: lo, b: hi, kind: this.boneMode ? 'bone' : 'muscle', amp: 0.34 });
    this.select(-1, this.body.links.length - 1);
    this.changed();
  }

  removeNode(i) {
    this.body.nodes.splice(i, 1);
    this.body.links = this.body.links
      .filter((l) => l.a !== i && l.b !== i)
      .map((l) => ({ ...l, a: l.a > i ? l.a - 1 : l.a, b: l.b > i ? l.b - 1 : l.b }));
    this.select(-1, -1);
    this.changed();
  }

  removeLink(i) { this.body.links.splice(i, 1); this.select(-1, -1); this.changed(); }

  clear() { this.body = { nodes: [], links: [] }; this.select(-1, -1); this.preview = null; this.changed(); }

  select(node, link) {
    this.selNode = node; this.selLink = link;
    this.onChange(this.stats());
  }

  patchNode(patch) {
    // With nothing selected the sliders set the recipe for the next node.
    Object.assign(this.defaults, patch);
    if (this.selNode < 0) return;
    Object.assign(this.body.nodes[this.selNode], patch);
    this.changed();
  }

  patchLink(patch) {
    if (this.selLink < 0) return;
    Object.assign(this.body.links[this.selLink], patch);
    this.changed();
  }

  /* ── twitch preview ────────────────────────────────── */
  twitch() {
    const stats = this.stats();
    if (!stats.valid) return false;
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const genome = Genome.seed(this.getBody(), rng, 8);
    this.preview = { sim: new Sim(genome, TRIALS.plains, 1), steps: 0 };
    return true;
  }

  stopTwitch() { this.preview = null; }

  /* ── input ─────────────────────────────────────────── */
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const w = this.toW(...this.local(e));
      this.pointer.down = true; this.pointer.moved = false;
      this.pointer.sx = e.clientX; this.pointer.sy = e.clientY;
      this.stopTwitch();

      const ni = this.nodeAt(w), li = ni < 0 ? this.linkAt(w) : -1;
      if (this.tool === 'erase') {
        if (ni >= 0) this.removeNode(ni);
        else if (li >= 0) this.removeLink(li);
        return;
      }
      if (this.tool === 'link') {
        if (ni >= 0) {
          if (this.linkFrom < 0) { this.linkFrom = ni; this.select(ni, -1); }
          else { this.addLink(this.linkFrom, ni); this.linkFrom = -1; }
        } else { this.linkFrom = -1; }
        return;
      }
      if (ni >= 0) {
        this.select(ni, -1);
        if (this.tool === 'move' || this.tool === 'node') this.pointer.dragging = ni;
        return;
      }
      if (li >= 0) { this.select(-1, li); return; }
      if (this.tool === 'node') { this.addNode(w); return; }
      this.pointer.panning = true;
      this.select(-1, -1);
    });

    c.addEventListener('pointermove', (e) => {
      const [lx, ly] = this.local(e);
      const w = this.toW(lx, ly);
      this.pointer.x = lx; this.pointer.y = ly;
      if (Math.abs(e.clientX - this.pointer.sx) + Math.abs(e.clientY - this.pointer.sy) > 3) this.pointer.moved = true;
      if (this.pointer.dragging >= 0) {
        const n = this.body.nodes[this.pointer.dragging];
        n.x = w.x; n.y = Math.min(w.y, -1);
        this.changed();
        return;
      }
      if (this.pointer.panning && this.pointer.down) {
        this.cam.x -= e.movementX / this.cam.zoom;
        this.cam.y -= e.movementY / this.cam.zoom;
        return;
      }
      this.hover.node = this.nodeAt(w);
      this.hover.link = this.hover.node < 0 ? this.linkAt(w) : -1;
    });

    const end = () => { this.pointer.down = false; this.pointer.dragging = -1; this.pointer.panning = false; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hover.node = -1; this.hover.link = -1; });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toW(...this.local(e));
      this.cam.zoom = clamp(this.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.893), 0.2, 3);
      const after = this.toW(...this.local(e));
      this.cam.x += before.x - after.x;
      this.cam.y += before.y - after.y;
    }, { passive: false });
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /* ── render ────────────────────────────────────────── */
  tick(steps = 1) {
    if (this.preview) {
      this.preview.sim.step(steps);
      this.preview.steps += steps;
      if (this.preview.steps > 600 || this.preview.sim.done) this.preview = null;
    }
    this.draw();
  }

  draw() {
    const ctx = this.ctx, W = this.w, H = this.h, z = this.cam.zoom;
    ctx.clearRect(0, 0, W, H);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a141c');
    sky.addColorStop(1, '#0e1c24');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Grid, 20 world units per cell.
    const grid = 20 * z;
    if (grid > 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const ox = this.toX(0) % grid, oy = this.toY(0) % grid;
      for (let x = ox; x < W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let x = ox - grid; x > 0; x -= grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = oy; y < H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let y = oy - grid; y > 0; y -= grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    // Ground line and centre axis.
    const gy = this.toY(0);
    ctx.fillStyle = 'rgba(43, 58, 47, 0.55)';
    ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = 'rgba(126,240,192,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(this.toX(0), 0); ctx.lineTo(this.toX(0), H); ctx.stroke();
    ctx.setLineDash([]);
    if (this.symmetry) {
      ctx.strokeStyle = 'rgba(126,240,192,0.28)';
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(this.toX(0), 0); ctx.lineTo(this.toX(0), H); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.preview) {
      this.drawSim();
    } else {
      this.drawEditable();
    }

    if (!this.body.nodes.length && !this.preview) {
      ctx.fillStyle = 'rgba(226,240,250,0.28)';
      ctx.font = '15px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.fillText('Click anywhere to place your first node', W / 2, H * 0.42);
      ctx.textAlign = 'left';
    }
  }

  drawSim() {
    const ctx = this.ctx;
    const sim = this.preview.sim;
    const z = this.cam.zoom;
    const toX = (wx) => this.toX(wx), toY = (wy) => this.toY(wy);
    for (const l of sim.world.links) {
      ctx.lineCap = 'round';
      const t = clamp((l.out + 1) / 2, 0, 1);
      ctx.strokeStyle = l.kind === 'bone' ? '#cfd9e4' : `hsl(${186 + t * 158}, 78%, ${45 + Math.abs(l.out) * 22}%)`;
      ctx.lineWidth = Math.max(1.4, (l.kind === 'bone' ? 6 : 3.6 + Math.abs(l.out) * 2.4) * z);
      ctx.beginPath();
      ctx.moveTo(toX(l.a.x), toY(l.a.y));
      ctx.lineTo(toX(l.b.x), toY(l.b.y));
      ctx.stroke();
    }
    for (const p of sim.world.parts) {
      const x = toX(p.x), y = toY(p.y), r = Math.max(2, p.r * z);
      const hue = 195 + (18 - 195) * clamp(p.friction, 0, 1);
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
      g.addColorStop(0, `hsl(${hue}, 62%, 76%)`);
      g.addColorStop(1, `hsl(${hue}, 55%, 38%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,208,92,0.85)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText('TWITCH TEST — untrained nervous system', 14, this.h - 16);
  }

  drawEditable() {
    const ctx = this.ctx, z = this.cam.zoom;
    const nodes = this.body.nodes;

    for (let i = 0; i < this.body.links.length; i++) {
      const l = this.body.links[i];
      const a = nodes[l.a], b = nodes[l.b];
      if (!a || !b) continue;
      const on = i === this.selLink, hov = i === this.hover.link;
      ctx.lineCap = 'round';
      ctx.strokeStyle = l.kind === 'bone' ? '#cfd9e4' : 'hsl(186, 78%, 54%)';
      ctx.lineWidth = Math.max(1.6, (l.kind === 'bone' ? 6 : 3.6 + l.amp * 4) * z);
      ctx.globalAlpha = hov && !on ? 0.75 : 1;
      ctx.beginPath();
      ctx.moveTo(this.toX(a.x), this.toY(a.y));
      ctx.lineTo(this.toX(b.x), this.toY(b.y));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (on) {
        ctx.strokeStyle = 'rgba(255,208,92,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // The rubber-band line while a link is being drawn.
    if (this.tool === 'link' && this.linkFrom >= 0 && nodes[this.linkFrom]) {
      const a = nodes[this.linkFrom];
      ctx.strokeStyle = 'rgba(126,240,192,0.6)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.toX(a.x), this.toY(a.y));
      ctx.lineTo(this.pointer.x, this.pointer.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const x = this.toX(n.x), y = this.toY(n.y), r = Math.max(3, n.r * z);
      const hue = 195 + (18 - 195) * clamp(n.friction, 0, 1);
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
      g.addColorStop(0, `hsl(${hue}, 62%, 78%)`);
      g.addColorStop(1, `hsl(${hue}, 55%, 38%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.strokeStyle = 'rgba(8,14,20,0.7)';
      ctx.stroke();
      if (i === this.selNode || i === this.hover.node || i === this.linkFrom) {
        ctx.strokeStyle = i === this.selNode ? 'rgba(255,208,92,0.95)' : 'rgba(126,240,192,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      // Mass readout on bigger nodes, so heavy parts are obvious at a glance.
      if (r > 11 && n.mass >= 1.6) {
        ctx.fillStyle = 'rgba(10,16,22,0.75)';
        ctx.font = `${Math.round(r * 0.7)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.mass.toFixed(1), x, y);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
  }
}

export { drawBody };
