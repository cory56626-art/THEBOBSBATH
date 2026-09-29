// Brachiation controller: read hand/bar geometry and swing velocity, then
// choose finite-torque joint targets and grip states. It never moves a body.
export class GymnastAI {
  constructor() { this.tick = 0; this.lastRelease = -200; this.bestBar = -Infinity; this.gait = 0; this.stalled = 0; }
  next(sim) {
    const p = sim.snapshot();
    let grips = sim.grips;
    const lead = Math.max(...grips.map(g => g.bar.x), sim.map.bars[0].x);
    if (lead > this.bestBar + .1) { this.bestBar = lead; this.stalled = 0; }
    else if (++this.stalled > 280) { this.gait = (this.gait + 1) % 4; this.stalled = 0; }
    const next = sim.barBodies.find(b => b.x > lead + .1);
    const trailing = grips.find(g => g.bar.x < lead - .1);
    if (trailing) {
      sim.releaseArm(trailing.arm, Infinity);
      this.lastRelease = this.tick;
    } else if (next && grips.length === 2 && this.tick - this.lastRelease > 24 &&
      p.x > lead + .13 && p.vx > .12) {
      // One support hand stays on the rail while the other reaches forward.
      sim.releaseArm(grips[0].arm, Infinity);
      this.lastRelease = this.tick;
    }
    grips = sim.grips;
    const anchorX = grips[0]?.bar.x ?? lead;
    const dx = p.x - anchorX;
    const pose = this.gait === 0 ? (dx > 0 ? 'tuck' : 'arch')
      : this.gait === 1 ? (dx > 0 ? 'arch' : 'tuck')
      : this.gait === 2 ? (p.vx > .05 && dx < .15 ? 'tuck' : 'arch')
      : (this.tick % 120 < 60 ? 'tuck' : 'arch');
    const q = sim.torso.body.rotation();
    const torsoAngle = Math.atan2(2 * (q.w * q.z + q.x * q.y),
      1 - 2 * (q.y * q.y + q.z * q.z));
    const torso = sim.torso.body.translation();
    const shoulders = sim.arms.map(arm => {
      if (grips.some(g => g.arm === arm)) {
        if (this.gait === 0) return { shoulder: p.vx > 0 ? .75 : -1.05, elbow: 0, force: 60 };
        if (this.gait === 1) return { shoulder: p.vx > 0 ? -1.05 : .75, elbow: 0, force: 60 };
        if (this.gait === 2) return { shoulder: 0, elbow: 0, force: 60 };
        return { shoulder: 0, elbow: 0, force: 0 };
      }
      const target = next ?? sim.barBodies.find(b => b.x >= anchorX);
      if (!target) return null;
      const sx = torso.x - .31 * Math.sin(torsoAngle);
      const sy = torso.y + .31 * Math.cos(torsoAngle);
      let angle = Math.atan2(-(target.x - sx), target.y - sy) - torsoAngle;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      return { shoulder: Math.max(-1.25, Math.min(1.25, angle)), elbow: -.1 };
    });
    this.tick++;
    return { pose, release: false, arms: shoulders };
  }
}
