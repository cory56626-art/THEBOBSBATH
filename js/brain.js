// A small recurrent neural network: the creature's nervous system.
//
// inputs -> hidden (tanh, fed by its own previous state) -> outputs (tanh).
// Recurrence matters: a gait is a memory of where you are in the stride, and a
// purely feed-forward net has to fake that from the clock inputs alone.

import { gauss, clamp } from './util.js';

export class Brain {
  constructor(nIn, nHid, nOut) {
    this.nIn = nIn; this.nHid = nHid; this.nOut = nOut;
    // w1 rows: [inputs..., hidden(t-1)..., bias] for each hidden unit
    this.w1 = new Float32Array((nIn + nHid + 1) * nHid);
    // w2 rows: [hidden..., bias] for each output unit
    this.w2 = new Float32Array((nHid + 1) * nOut);
    this.h = new Float32Array(nHid);
    this.hNext = new Float32Array(nHid);
    this.out = new Float32Array(nOut);
  }

  randomize(rng) {
    const s1 = 1 / Math.sqrt(this.nIn + this.nHid + 1);
    const s2 = 1 / Math.sqrt(this.nHid + 1);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = gauss(rng) * s1 * 1.6;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = gauss(rng) * s2 * 1.6;
    return this;
  }

  reset() { this.h.fill(0); this.hNext.fill(0); this.out.fill(0); }

  forward(inputs) {
    const { nIn, nHid, nOut, w1, w2, h, hNext, out } = this;
    const stride1 = nIn + nHid + 1;
    for (let j = 0; j < nHid; j++) {
      const base = j * stride1;
      let s = w1[base + nIn + nHid]; // bias
      for (let i = 0; i < nIn; i++) s += inputs[i] * w1[base + i];
      for (let k = 0; k < nHid; k++) s += h[k] * w1[base + nIn + k];
      hNext[j] = Math.tanh(s);
    }
    h.set(hNext);
    const stride2 = nHid + 1;
    for (let o = 0; o < nOut; o++) {
      const base = o * stride2;
      let s = w2[base + nHid];
      for (let k = 0; k < nHid; k++) s += h[k] * w2[base + k];
      out[o] = Math.tanh(s);
    }
    return out;
  }

  clone() {
    const b = new Brain(this.nIn, this.nHid, this.nOut);
    b.w1.set(this.w1); b.w2.set(this.w2);
    return b;
  }

  mutate(rate, power, rng) {
    const jab = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const r = rng();
        if (r < rate * 0.06) arr[i] = gauss(rng) * 0.8;        // full reset: big leaps
        else if (r < rate) arr[i] = clamp(arr[i] + gauss(rng) * power, -8, 8);
      }
    };
    jab(this.w1); jab(this.w2);
    return this;
  }

  /** Uniform crossover, with a chance of averaging a weight instead. */
  static cross(a, b, rng) {
    const c = new Brain(a.nIn, a.nHid, a.nOut);
    const mix = (dst, x, y) => {
      for (let i = 0; i < dst.length; i++) {
        const r = rng();
        dst[i] = r < 0.45 ? x[i] : r < 0.9 ? y[i] : (x[i] + y[i]) * 0.5;
      }
    };
    mix(c.w1, a.w1, b.w1);
    mix(c.w2, a.w2, b.w2);
    return c;
  }

  /**
   * Grow or shrink to fit a changed body, keeping every weight that still has
   * somewhere to live. A creature that sprouts a limb should not forget how to
   * walk with the ones it already had.
   */
  resized(nIn, nOut) {
    if (nIn === this.nIn && nOut === this.nOut) return this;
    const b = new Brain(nIn, this.nHid, nOut);
    const oldStride = this.nIn + this.nHid + 1;
    const newStride = nIn + this.nHid + 1;
    const keepIn = Math.min(nIn, this.nIn);
    for (let j = 0; j < this.nHid; j++) {
      for (let i = 0; i < keepIn; i++) b.w1[j * newStride + i] = this.w1[j * oldStride + i];
      for (let k = 0; k < this.nHid; k++) b.w1[j * newStride + nIn + k] = this.w1[j * oldStride + this.nIn + k];
      b.w1[j * newStride + nIn + this.nHid] = this.w1[j * oldStride + this.nIn + this.nHid];
    }
    const keepOut = Math.min(nOut, this.nOut);
    for (let o = 0; o < keepOut; o++) {
      for (let k = 0; k <= this.nHid; k++) b.w2[o * (this.nHid + 1) + k] = this.w2[o * (this.nHid + 1) + k];
    }
    return b;
  }

  toJSON() {
    return {
      i: this.nIn, h: this.nHid, o: this.nOut,
      // Round hard: full float precision triples the size of a saved champion.
      a: Array.from(this.w1, (v) => Math.round(v * 1000) / 1000),
      b: Array.from(this.w2, (v) => Math.round(v * 1000) / 1000),
    };
  }

  static fromJSON(j) {
    const b = new Brain(j.i, j.h, j.o);
    b.w1.set(j.a); b.w2.set(j.b);
    return b;
  }
}
