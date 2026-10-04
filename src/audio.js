export class CityAudio {
  constructor() { this.enabled = true; this.context = null; this.engine = null; }
  start() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      this.context.resume().catch(() => {});
      if (!this.engine) {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
        oscillator.type = 'sawtooth'; oscillator.frequency.value = 30; filter.type = 'lowpass'; filter.frequency.value = 180; gain.gain.value = 0;
        oscillator.connect(filter); filter.connect(gain); gain.connect(this.context.destination); oscillator.start();
        this.engine = { oscillator, gain, filter };
      }
    } catch { this.enabled = false; }
  }
  update(speed, inCar, throttle, paused) {
    if (!this.engine || !this.context) return;
    const t = this.context.currentTime;
    this.engine.oscillator.frequency.setTargetAtTime(28 + Math.abs(speed) * 3 + Math.max(0, throttle) * 14, t, .12);
    this.engine.filter.frequency.setTargetAtTime(130 + Math.abs(speed) * 9, t, .15);
    this.engine.gain.gain.setTargetAtTime(this.enabled && !paused && inCar ? .018 + Math.abs(speed) * .00035 : 0, t, .1);
  }
  tone(frequency, duration, volume = .04, type = 'sine') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t); gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(); oscillator.stop(t + duration + .02);
  }
  shot() { this.tone(100, .09, .08, 'sawtooth'); this.tone(850, .035, .026, 'triangle'); }
  impact(intensity) { this.tone(55, .2, Math.min(.09, .01 + intensity * .002), 'triangle'); }
  horn() { this.tone(330, .35, .035, 'sawtooth'); this.tone(415, .35, .025, 'sawtooth'); }
}
