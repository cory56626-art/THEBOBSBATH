import assert from 'node:assert/strict';
import { DT, MAPS, Simulation, initializePhysics } from '../src/physics.js';
import { GymnastAI } from '../src/ai.js';

await initializePhysics();
assert.equal(MAPS.length, 7);
assert.equal(MAPS.filter(m => m.chimp).length, 1);
assert.equal(new Set(MAPS.map(m => JSON.stringify([m.bars, m.floor, m.springs, m.blocks]))).size, 7,
  'each map needs its own physical layout');

{
  const sim = new Simulation(MAPS[0]);
  let rightmost = -Infinity;
  for (let i = 0; i < 220; i++) {
    sim.step({ pose: 'loose', release: false });
    rightmost = Math.max(rightmost, sim.snapshot().x);
  }
  assert(rightmost > .5, 'gravity must produce an actual free swing from the displaced initial pose');
  assert.equal(sim.snapshot().grip, 2);
  for (let i = 0; i < 400; i++) sim.step({ pose: 'loose', release: i < 35 });
  const landing = sim.snapshot();
  assert.equal(landing.grip, 0);
  assert(landing.y < .8, 'released ragdoll must land rather than snap back onto a bar');
  for (let i = 0; i < 200; i++) sim.step({ pose: 'loose', release: false });
  assert(sim.snapshot().y < .8, 'a fallen gymnast must not automatically stand up');
  assert(Math.abs(sim.snapshot().x - landing.x) < .5, 'idle body must not self-propel along the ground');
  sim.dispose();
}

{
  const sim = new Simulation(MAPS[6]);
  let climbed = false;
  for (let i = 0; i < 1800 && !sim.caught; i++) {
    sim.step({ pose: 'loose', release: false });
    if (sim.chimp?.translation().y > 1.2) climbed = true;
  }
  assert(climbed, 'chimp must climb by its joint motor');
  assert(sim.caught, 'chimp must reach and catch an idle hanging player');
  sim.dispose();
}

const report = [];
for (const map of MAPS) {
  const sim = new Simulation(map), ai = new GymnastAI();
  let farthest = 0, maxBar = 0, maxGripSpeed = 0, maxHeadYaw = 0;
  for (let i = 0; i < 5400; i++) {
    sim.step(ai.next(sim));
    const p = sim.snapshot();
    farthest = Math.max(farthest, p.x);
    maxBar = Math.max(maxBar, ...sim.grips.map(g => g.bar.x));
    if (p.grip) maxGripSpeed = Math.max(maxGripSpeed, Math.hypot(p.vx, p.vy));
    const head = sim.bodies.find(b => b.name === 'head').body.rotation();
    maxHeadYaw = Math.max(maxHeadYaw, Math.abs(head.x), Math.abs(head.y));
    if (sim.caught || sim.escaped) break;
  }
  assert(maxBar >= map.bars[4].x, `${map.id}: AI must genuinely reach later rails`);
  assert(maxGripSpeed < 12, `${map.id}: a regrab must not launch the body`);
  assert(maxHeadYaw < .01, `${map.id}: the head must not turn behind the gymnast`);
  report.push({ map: map.id, farthest: +farthest.toFixed(2), maxBar: +maxBar.toFixed(2),
    regrabs: sim.regrabs, maxGripSpeed: +maxGripSpeed.toFixed(2), caught: sim.caught, escaped: sim.escaped });
  sim.dispose();
}
assert.equal(report[0].maxBar, MAPS[0].bars.at(-1).x, 'AI should traverse the classic map');
console.log(JSON.stringify({ stepSeconds: DT, report }, null, 2));
