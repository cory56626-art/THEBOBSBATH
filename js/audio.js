// Tiny WebAudio synth. No sample files — every sound is generated, so the repo
// stays asset-free and nothing has to load before a battle starts.
//
// Hits are pitched from a pentatonic scale rather than played at a fixed pitch:
// random notes in a scale always sound intentional, which is what makes these
// videos read as "satisfying" instead of noisy.

import { clamp, pick } from './utils.js';

// A minor pentatonic, three octaves.
const SCALE = [
  220.0, 261.6, 293.7, 349.2, 392.0,
  440.0, 523.3, 587.3, 698.5, 784.0,
  880.0, 1046.5, 1174.7, 1396.9, 1568.0,
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.streamDest = null;
    this.enabled = true;
    this.noteIndex = 0;
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;

    // Gentle limiter so a 12-ball pile-up doesn't clip into static.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // Parallel tap for MediaRecorder, so exported videos have sound.
    this.streamDest = this.ctx.createMediaStreamDestination();
    comp.connect(this.streamDest);
  }

  get stream() {
    return this.streamDest ? this.streamDest.stream : null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  _ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  /** Core voice: an oscillator with an exponential decay envelope. */
  _tone({ freq, type = 'sine', dur = 0.18, gain = 0.3, sweep = 0, delay = 0 }) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst — the "impact" half of a hit. */
  _noise({ dur = 0.12, gain = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0 }) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  /** Wall / ball bounce — soft, keeps the background rhythm going. */
  bounce(intensity = 1) {
    const f = pick(SCALE.slice(0, 8));
    this._tone({ freq: f, type: 'sine', dur: 0.1, gain: 0.09 * clamp(intensity, 0.3, 1.4) });
  }

  /** A weapon connecting. Walks up the scale so combos sound like a melody. */
  hit(intensity = 1) {
    const i = this.noteIndex % SCALE.length;
    this.noteIndex += 2 + (Math.random() < 0.3 ? 1 : 0);
    const f = SCALE[i];
    const amp = clamp(intensity, 0.4, 1.6);
    this._tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.16 * amp });
    this._tone({ freq: f * 2, type: 'sine', dur: 0.1, gain: 0.07 * amp });
    this._noise({ dur: 0.07, gain: 0.1 * amp, freq: 2600, q: 0.8 });
  }

  shoot() {
    this._tone({ freq: 700, type: 'square', dur: 0.09, gain: 0.06, sweep: 0.4 });
  }

  heal() {
    this._tone({ freq: 523.3, type: 'sine', dur: 0.16, gain: 0.14 });
    this._tone({ freq: 784.0, type: 'sine', dur: 0.22, gain: 0.12, delay: 0.07 });
  }

  death() {
    this._tone({ freq: 180, type: 'sawtooth', dur: 0.5, gain: 0.22, sweep: 0.25 });
    this._noise({ dur: 0.4, gain: 0.28, freq: 700, q: 0.4, type: 'lowpass' });
  }

  superReady() {
    [523.3, 659.3, 784.0].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.13, delay: i * 0.06 })
    );
  }

  superFire() {
    this._tone({ freq: 110, type: 'sawtooth', dur: 0.55, gain: 0.26, sweep: 3.2 });
    this._noise({ dur: 0.35, gain: 0.22, freq: 3200, q: 0.6 });
  }

  win() {
    [523.3, 659.3, 784.0, 1046.5].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.18, delay: i * 0.11 })
    );
  }
}

export const Sound = new AudioEngine();
