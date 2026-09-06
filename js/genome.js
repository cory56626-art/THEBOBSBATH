// A genome is a body (the blueprint you draw) plus a brain (the wiring that
// learns to use it). Bodies can be frozen — evolve the mind only — or allowed
// to drift, in which case limbs appear, thicken and fall off across generations.

import { Brain } from './brain.js';
import { clamp, gauss, tag } from './util.js';

export const MAX_NODES = 20;
export const MIN_NODES = 2;

export const sensorCount = (body) => 6 + body.nodes.length * 4;
export const motorCount = (body) => body.links.reduce((n, l) => n + (l.kind === 'muscle' ? 1 : 0), 0);

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Deep copy plus rest lengths refreshed from the current node positions. */
export function normalizeBody(body) {
  const nodes = body.nodes.map((n) => ({
    x: n.x, y: n.y,
    r: clamp(n.r ?? 9, 5, 22),
    friction: clamp(n.friction ?? 0.6, 0.02, 1),
    mass: clamp(n.mass ?? 1, 0.35, 4),
  }));
  const seen = new Set();
  const links = [];
  for (const l of body.links) {
    const a = Math.min(l.a, l.b), b = Math.max(l.a, l.b);
    if (a === b || !nodes[a] || !nodes[b]) continue;
    const key = a + ':' + b;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      a, b,
      kind: l.kind === 'bone' ? 'bone' : 'muscle',
      amp: clamp(l.amp ?? 0.34, 0.05, 0.6),
      rest: dist(nodes[a], nodes[b]),
    });
  }
  return { nodes, links };
}

export class Genome {
  constructor(body, brain, meta = {}) {
    this.body = body;
    this.brain = brain;
    this.gen = meta.gen ?? 0;
    this.idx = meta.idx ?? 0;
    this.lineage = meta.lineage ?? 0; // generation this bloodline last improved
  }

  static seed(blueprint, rng, hidden = 10) {
    const body = normalizeBody(blueprint);
    const brain = new Brain(sensorCount(body), hidden, Math.max(1, motorCount(body))).randomize(rng);
    return new Genome(body, brain);
  }

  get name() { return `${tag(this.idx)}-${this.gen}`; }

  clone() {
    return new Genome(
      { nodes: this.body.nodes.map((n) => ({ ...n })), links: this.body.links.map((l) => ({ ...l })) },
      this.brain.clone(),
      { gen: this.gen, idx: this.idx, lineage: this.lineage },
    );
  }

  refit() {
    this.brain = this.brain.resized(sensorCount(this.body), Math.max(1, motorCount(this.body)));
    return this;
  }

  mutate(cfg, rng) {
    this.brain.mutate(cfg.rate, cfg.power, rng);
    if (cfg.morph > 0) this.mutateBody(cfg, rng);
    return this;
  }

  mutateBody(cfg, rng) {
    const m = cfg.morph;         // 0..1 drift strength
    const body = this.body;
    for (const n of body.nodes) {
      if (rng() < 0.5 * m) {
        n.x += gauss(rng) * 4 * m;
        n.y += gauss(rng) * 4 * m;
      }
      if (rng() < 0.25 * m) n.friction = clamp(n.friction + gauss(rng) * 0.12, 0.02, 1);
      if (rng() < 0.2 * m) n.r = clamp(n.r + gauss(rng) * 1.2, 5, 22);
      if (rng() < 0.15 * m) n.mass = clamp(n.mass + gauss(rng) * 0.2, 0.35, 4);
    }
    for (const l of body.links) {
      if (rng() < 0.25 * m) l.amp = clamp(l.amp + gauss(rng) * 0.08, 0.05, 0.6);
      if (rng() < 0.03 * m) l.kind = l.kind === 'bone' ? 'muscle' : 'bone';
    }
    // Structural edits are rarer — they are the ones that reshape a species.
    if (rng() < 0.12 * m && body.nodes.length < MAX_NODES) this.growNode(rng);
    if (rng() < 0.07 * m && body.nodes.length > MIN_NODES + 1) this.shedNode(rng);
    if (rng() < 0.12 * m) this.growLink(rng);

    this.body = normalizeBody(body);
    this.refit();
  }

  growNode(rng) {
    const body = this.body;
    const host = body.nodes[Math.floor(rng() * body.nodes.length)];
    const ang = rng() * Math.PI * 2;
    const len = 22 + rng() * 44;
    const node = {
      x: host.x + Math.cos(ang) * len,
      y: host.y + Math.sin(ang) * len,
      r: clamp(host.r + gauss(rng) * 2, 5, 22),
      friction: clamp(host.friction + gauss(rng) * 0.15, 0.02, 1),
      mass: clamp(host.mass * (0.7 + rng() * 0.6), 0.35, 4),
    };
    body.nodes.push(node);
    const idx = body.nodes.length - 1;
    // Anchor to the two nearest existing nodes so it is never a floating limb.
    const near = body.nodes
      .map((n, i) => ({ i, d: dist(n, node) }))
      .filter((o) => o.i !== idx)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const o of near) {
      body.links.push({ a: o.i, b: idx, kind: rng() < 0.75 ? 'muscle' : 'bone', amp: 0.2 + rng() * 0.3, rest: o.d });
    }
  }

  shedNode(rng) {
    const body = this.body;
    const victim = Math.floor(rng() * body.nodes.length);
    const survivors = body.nodes.filter((_, i) => i !== victim);
    const remap = (i) => (i > victim ? i - 1 : i);
    const links = body.links
      .filter((l) => l.a !== victim && l.b !== victim)
      .map((l) => ({ ...l, a: remap(l.a), b: remap(l.b) }));
    // Refuse the edit if it would strand part of the body.
    if (!connected(survivors.length, links)) return;
    body.nodes = survivors;
    body.links = links;
  }

  growLink(rng) {
    const body = this.body;
    const n = body.nodes.length;
    if (n < 3) return;
    const a = Math.floor(rng() * n);
    let b = Math.floor(rng() * n);
    if (a === b) b = (b + 1) % n;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (body.links.some((l) => Math.min(l.a, l.b) === lo && Math.max(l.a, l.b) === hi)) return;
    if (dist(body.nodes[a], body.nodes[b]) > 130) return;
    body.links.push({ a: lo, b: hi, kind: rng() < 0.7 ? 'muscle' : 'bone', amp: 0.2 + rng() * 0.3, rest: 0 });
  }

  static cross(a, b, rng) {
    // Bodies only interbreed when they still have the same shape; otherwise the
    // fitter parent's body is inherited whole and only the mind is blended.
    const sameShape = a.body.nodes.length === b.body.nodes.length && a.body.links.length === b.body.links.length;
    const base = a.clone();
    if (sameShape) {
      for (let i = 0; i < base.body.nodes.length; i++) {
        if (rng() < 0.5) base.body.nodes[i] = { ...b.body.nodes[i] };
      }
      for (let i = 0; i < base.body.links.length; i++) {
        if (rng() < 0.5) base.body.links[i] = { ...b.body.links[i] };
      }
      base.body = normalizeBody(base.body);
      base.brain = Brain.cross(a.brain, b.brain, rng);
    } else {
      base.brain = Brain.cross(a.brain, b.brain.resized(a.brain.nIn, a.brain.nOut), rng);
    }
    base.refit();
    return base;
  }

  toJSON() {
    return { body: this.body, brain: this.brain.toJSON(), gen: this.gen, idx: this.idx, lineage: this.lineage };
  }

  static fromJSON(j) {
    return new Genome(normalizeBody(j.body), Brain.fromJSON(j.brain), j);
  }
}

/** Union-find style reachability check over the link graph. */
export function connected(count, links) {
  if (count <= 1) return true;
  const adj = Array.from({ length: count }, () => []);
  for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
  const seen = new Uint8Array(count);
  const stack = [0];
  seen[0] = 1;
  let n = 1;
  while (stack.length) {
    for (const v of adj[stack.pop()]) if (!seen[v]) { seen[v] = 1; n++; stack.push(v); }
  }
  return n === count;
}
