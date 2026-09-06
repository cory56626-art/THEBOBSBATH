// Small shared helpers. No dependencies.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** Deterministic PRNG so a seed always replays the same trial. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller-ish normal sample from a uniform rng. */
export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) n.append(kid);
  return n;
}

export const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/** 1234 -> "1.2k" for tidy counters. */
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return n.toFixed(0);
}

const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
/** Individual tag inside a generation: 0 -> "α", 24 -> "αα". */
export function tag(i) {
  const g = GREEK[i % GREEK.length];
  const rep = Math.floor(i / GREEK.length) + 1;
  return g.repeat(rep);
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** Ring buffer that keeps the last n entries without unbounded growth. */
export class Ring {
  constructor(n) { this.cap = n; this.items = []; }
  push(v) { this.items.push(v); if (this.items.length > this.cap) this.items.shift(); return v; }
  get length() { return this.items.length; }
  get last() { return this.items[this.items.length - 1]; }
  at(i) { return this.items[i]; }
  clear() { this.items.length = 0; }
}
