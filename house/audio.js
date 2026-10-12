/** Optional, asset-free room audio. The context is created only by a sound-button gesture. */
export class HouseAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this._paused = false;
    this._pending = null;
    this._seen = new Set();
    this._sim = null;
    this._seed = null;
    this._time = 0;
    this._disposed = false;
  }

  async toggle() {
    if (this._disposed) return false;
    this.enabled = !this.enabled;
    if (!this.enabled) {
      await this._syncContext();
      return false;
    }
    try {
      if (!this.context) this._create();
      // Invoke resume in the button's gesture before awaiting anything.
      await this._syncContext();
    } catch {
      this.enabled = false;
      await this._syncContext();
    }
    return this.enabled;
  }

  _create() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio unavailable');
    const ctx = this.context = new AudioContext();
    this._master = ctx.createGain();
    this._master.gain.value = 0.6;
    this._master.connect(ctx.destination);
    this._noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = this._noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    this._drones = [45, 45.7].map((frequency, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.value = i ? 0.009 : 0.014;
      oscillator.connect(gain).connect(this._master);
      oscillator.start();
      return { oscillator, gain };
    });
    const air = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    air.buffer = this._noise;
    air.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    gain.gain.value = 0.025;
    air.connect(filter).connect(gain).connect(this._master);
    air.start();
    this._air = air;
  }

  _syncContext() {
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') return Promise.resolve();
    if (this._pending) return this._pending;
    const running = this.enabled && !this._paused;
    if (ctx.state === (running ? 'running' : 'suspended')) return Promise.resolve();
    try {
      const action = running ? ctx.resume() : ctx.suspend();
      this._pending = Promise.resolve(action).catch(() => {
        this.enabled = false;
      }).finally(() => {
        this._pending = null;
        // A toggle or pause may have changed the desired state during the operation.
        if (ctx.state === 'running' && (!this.enabled || this._paused)) this._syncContext();
      });
      return this._pending;
    } catch {
      this.enabled = false;
      return Promise.resolve();
    }
  }

  update(sim, paused = false) {
    if (!sim || this._disposed) return;
    const time = Number.isFinite(sim.time) ? sim.time : 0;
    if (sim !== this._sim || sim.seed !== this._seed || time < this._time) {
      this._seen.clear();
      this._sim = sim;
      this._seed = sim.seed;
    }
    this._time = time;
    this._paused = paused || sim.status !== 'running';
    this._syncContext();
    const audible = this.enabled && !this._paused && this.context?.state === 'running';
    if (audible) {
      const chase = sim.monster?.state === 'chase' || sim.monster?.state === 'pursue';
      this._drones.forEach(({ oscillator, gain }, i) => {
        oscillator.frequency.setTargetAtTime((chase ? 54 : 45) + i * 0.7, this.context.currentTime, 1.2);
        gain.gain.setTargetAtTime((i ? 0.009 : 0.014) * (chase ? 1.3 : 1), this.context.currentTime, 1.2);
      });
    }
    for (const noise of sim.noises || []) {
      if (this._seen.has(noise.id)) continue;
      this._seen.add(noise.id);
      if (this._seen.size > 256) this._seen.delete(this._seen.values().next().value);
      // Always consume IDs, including while muted, so enabling sound never replays a backlog.
      if (audible && noise.age >= 0 && noise.age < 0.4) this._play(noise);
    }
  }

  _output(noise) {
    if (!this.context.createStereoPanner) return this._master;
    const pan = this.context.createStereoPanner();
    pan.pan.value = Math.max(-0.55, Math.min(0.55, (Number(noise.x) || 0) / 42));
    pan.connect(this._master);
    return pan;
  }

  _tone(output, frequency, duration, volume, delay = 0, endFrequency = frequency, type = 'sine') {
    const ctx = this.context, start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.015, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  _rustle(output, duration, volume, frequency, delay = 0) {
    const ctx = this.context, start = ctx.currentTime + delay;
    const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = this._noise;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(start, Math.random());
    source.stop(start + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  _play(noise) {
    const type = String(noise.type || '').toLowerCase(), output = this._output(noise);
    if (type.includes('footstep')) {
      const running = type.includes('running');
      this._tone(output, running ? 95 : 78, 0.17, running ? 0.06 : 0.026, 0, 38);
      this._rustle(output, 0.11, running ? 0.07 : 0.033, 420);
    } else if (type.includes('bottle') || type.includes('dropped')) {
      [980, 1420, 750, 1140].forEach((frequency, i) => this._tone(output, frequency, 0.17, 0.028 / (1 + i * 0.3), i * 0.09));
      this._rustle(output, 0.23, 0.1, 2100);
    } else if (type.includes('picked') || type.includes('handling') || type.includes('lock')) {
      this._tone(output, 1300, 0.13, 0.019);
      this._tone(output, 1760, 0.1, 0.01, 0.06);
      this._rustle(output, 0.24, 0.045, 1800);
    } else if (type.includes('closet') || type.includes('hiding')) {
      this._tone(output, 210, 0.48, 0.014, 0, 118, 'triangle');
      this._rustle(output, 0.45, 0.055, 680);
    } else {
      this._rustle(output, 0.26, 0.035, 530);
    }
    // Disconnect the short-lived pan after all of its scheduled voices have ended.
    if (output !== this._master) setTimeout(() => output.disconnect(), 1200);
  }

  dispose() {
    this.enabled = false;
    this._disposed = true;
    this._seen.clear();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
  }
}
