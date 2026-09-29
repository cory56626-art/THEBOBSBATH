// The AI can only choose the same joint poses and hand joints available to a player.
// It never assigns a position or velocity to a body.
export class GymnastAI {
  constructor() { this.tick = 0; this.lastRelease = -200; this.configured = false; }
  next(sim) {
    const routines = {
      classic: [-.70, .18], roof: [-1.15, .18], tramp: [-.85, .30],
      gym: [-1.15, .18], neon: [-1.15, .30], grove: [-1.05, .30], chimp: [-.70, .30]
    };
    const [shoulder, threshold] = routines[sim.map.id];
    if (!this.configured) {
      sim.motors[1].arch = sim.motors[5].arch = shoulder;
      this.configured = true;
    }
    const grips = sim.grips, bars = [...new Set(grips.map(g => g.bar.x))];
    if (bars.length > 1) {
      const trailing = grips.find(g => g.bar.x === Math.min(...bars));
      sim.releaseArm(trailing.arm);
      this.lastRelease = this.tick;
    } else if (grips.length === 2 && this.tick - this.lastRelease > 65) {
      const p = sim.snapshot(), bar = grips[0].bar.x;
      if (p.x > bar + threshold && p.vx > .16 && bar < sim.map.bars.at(-1).x)
        { sim.releaseArm(grips[0].arm); this.lastRelease = this.tick; }
    }
    const pose = sim.grips.length === 1 ? 'arch' : this.tick % 90 < 45 ? 'tuck' : 'arch';
    this.tick++;
    return { pose, release: false };
  }
}
