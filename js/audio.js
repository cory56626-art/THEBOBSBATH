/** Tiny synthesised sound kit — no assets, no loading, no licence headaches. */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('tug-muted') !== '1';
    this.noise = null;
    this.lastTap = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('tug-muted', on ? '0' : '1');
  }

  _env(node, t, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g); g.connect(this.master);
    return g;
  }

  _tone(freq, t, a, d, peak, type = 'sine', slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + a + d);
    this._env(o, t, a, d, peak);
    o.start(t); o.stop(t + a + d + 0.05);
  }

  _noise(t, dur, peak, hp = 400, lp = 5000) {
    if (!this.ctx || !this.enabled || !this.noise) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass';  f2.frequency.value = lp;
    s.connect(f1); f1.connect(f2);
    this._env(f2, t, 0.012, dur, peak);
    s.start(t); s.stop(t + dur + 0.1);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  tap(power = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.now;
    if (t - this.lastTap < 0.028) return;      // don't machine-gun the mixer
    this.lastTap = t;
    const p = 150 + Math.random() * 60;
    this._tone(p, t, 0.004, 0.07, 0.22 * power, 'triangle', p * 0.55);
    this._noise(t, 0.06, 0.10 * power, 1200, 6000);
  }

  creak() {
    if (!this.ctx || !this.enabled) return;
    const t = this.now;
    this._tone(90 + Math.random() * 40, t, 0.02, 0.3, 0.09, 'sawtooth', 60);
  }

  beep(hi = false) {
    const t = this.now;
    this._tone(hi ? 880 : 520, t, 0.01, hi ? 0.42 : 0.16, 0.3, 'square');
  }

  whistle() {
    const t = this.now;
    this._tone(1500, t, 0.02, 0.35, 0.22, 'sine', 2100);
    this._noise(t, 0.35, 0.08, 1800, 9000);
  }

  surge() {
    const t = this.now;
    this._tone(260, t, 0.03, 0.55, 0.3, 'sawtooth', 1500);
    this._noise(t, 0.5, 0.12, 600, 9000);
  }

  cheer(big = false) {
    const t = this.now;
    this._noise(t, big ? 1.5 : 0.6, big ? 0.24 : 0.12, 500, 4200);
  }

  win() {
    if (!this.ctx || !this.enabled) return;
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(f, t + i * 0.11, 0.02, 0.45, 0.26, 'triangle');
    });
    this.cheer(true);
  }

  lose() {
    if (!this.ctx || !this.enabled) return;
    const t = this.now;
    [392, 349.23, 311.13, 261.63].forEach((f, i) => {
      this._tone(f, t + i * 0.16, 0.03, 0.5, 0.24, 'sawtooth');
    });
    this._noise(t + 0.55, 0.5, 0.1, 200, 1400);
  }

  splat() {
    const t = this.now;
    this._noise(t, 0.28, 0.26, 120, 1100);
    this._tone(70, t, 0.01, 0.3, 0.2, 'sine', 40);
  }
}
