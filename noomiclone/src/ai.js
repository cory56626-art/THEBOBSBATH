// The AI presses exactly the same three controls as a player: arch, tuck,
// and the shared let-go button. A forecast only simulates those inputs.
export class GymnastAI {
  constructor() {
    this.tick = 0;
    this.lastProbe = -100;
    this.lastProgress = 0;
    this.bestBar = -Infinity;
    this.flight = null;
  }

  next(sim) {
    const p = sim.snapshot();
    const held = sim.grips[0]?.bar;
    if (held && held.x > this.bestBar + .1) {
      this.bestBar = held.x;
      this.lastProgress = this.tick;
      this.flight = null;
    }
    if (this.flight) {
      const f = this.flight;
      const elapsed = this.tick - f.started;
      const pose = f.style === 'fold' && elapsed < 18 ? 'tuck' : f.style === 'tuck' ? 'tuck' : 'arch';
      if (elapsed > f.closeAt + 20 || held) this.flight = null;
      else { this.tick++; return { pose, release: elapsed < f.closeAt }; }
    }
    const dx = p.x - (held?.x ?? this.bestBar);
    const stalled = this.tick - this.lastProgress;
    // The same arch/tuck muscles pump the swing. Changing phase can escape a
    // low-amplitude orbit without moving or accelerating a body directly.
    const pose = stalled < 250 ? (dx > 0 ? 'tuck' : 'arch')
      : stalled < 650 ? (p.vx > 0 ? 'arch' : 'tuck')
      : (this.tick % 140 < 70 ? 'tuck' : 'arch');
    if (held && p.vx > .35 && dx > .16 && this.tick - this.lastProbe >= 12) {
      this.lastProbe = this.tick;
      const forecast = sim.barBodies.some(b => b.x > held.x + .1)
        ? this.forecast(sim, held.x)
        : sim.map.chimp ? this.forecastEscape(sim) : null;
      if (forecast) {
        this.flight = { ...forecast, started: this.tick };
        this.tick++;
        return { pose: forecast.style === 'fold' || forecast.style === 'tuck' ? 'tuck' : 'arch', release: true };
      }
    }
    this.tick++;
    return { pose, release: false };
  }

  forecast(sim, fromX) {
    for (const style of ['arch', 'fold', 'tuck']) {
      const trial = sim.clone();
      let closeAt = -1, result = null;
      for (let t = 0; t < 105; t++) {
        const pose = style === 'fold' && t < 18 ? 'tuck' : style === 'tuck' ? 'tuck' : 'arch';
        if (closeAt < 0 && t >= 4) {
          for (const bar of trial.barBodies) {
            if (bar.x <= fromX + .1) continue;
            const maxDistance = Math.max(...trial.arms.map(arm => {
              const hand = trial.handPoint(arm);
              return Math.hypot(hand.x - bar.x, hand.y - bar.y,
                Math.max(0, Math.abs(hand.z) - 1.44));
            }));
            if (maxDistance < .28) { closeAt = t; break; }
          }
        }
        trial.step({ pose, release: closeAt < 0 });
        if (trial.grips[0]?.bar.x > fromX + .1) {
          result = { style, closeAt, barX: trial.grips[0].bar.x };
          break;
        }
        if (trial.snapshot().y < .8) break;
      }
      trial.dispose();
      if (result) return result;
    }
    return null;
  }

  forecastEscape(sim) {
    for (const style of ['arch', 'tuck']) {
      const trial = sim.clone();
      let result = null;
      for (let t = 0; t < 130; t++) {
        trial.step({ pose: style, release: true });
        if (trial.escaped && !trial.caught) { result = { style, closeAt: 130 }; break; }
        if (trial.caught || trial.snapshot().y < .5) break;
      }
      trial.dispose();
      if (result) return result;
    }
    return null;
  }
}
