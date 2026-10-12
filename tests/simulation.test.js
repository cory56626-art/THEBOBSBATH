import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSE, ROOMS, WALLS, HIDING_SPOTS, ITEMS, EXIT, SURVIVOR_SPAWN, MONSTER_SPAWN,
  isWalkable, findPath, canWalkSegment, lineOfSight, distance,
} from '../house/layout.js';
import { Simulation } from '../house/simulation.js';

function place(actor, point) {
  Object.assign(actor, point, { _path: [], _pathTarget: null, target: null });
}

test('the large house has connected, collision-safe routes to every room and hiding spot', () => {
  assert.equal(HOUSE.width, 50);
  assert.equal(HOUSE.depth, 42);
  assert.ok(ROOMS.length >= 16);
  assert.ok(HIDING_SPOTS.length >= 18);
  assert.ok(WALLS.length > 30);
  for (const destination of [...ROOMS, ...HIDING_SPOTS, ...ITEMS, MONSTER_SPAWN, EXIT]) {
    assert.ok(isWalkable(destination.x, destination.z), `walkable destination: ${destination.id}`);
    const path = findPath(SURVIVOR_SPAWN, destination);
    assert.ok(path.length, `reachable destination: ${destination.id}`);
    let previous = SURVIVOR_SPAWN;
    for (const waypoint of path) {
      assert.ok(canWalkSegment(previous, waypoint), `safe route segment to ${destination.id}`);
      previous = waypoint;
    }
    assert.ok(distance(previous, destination) < 0.001);
  }
  assert.deepEqual(findPath(SURVIVOR_SPAWN, { x: 25, z: 0 }), []);
});

test('walls and field of view prevent omniscient visual detection', () => {
  const sim = new Simulation({ seed: 1 });
  sim.survivor.graceRemaining = 0;
  place(sim.monster, { x: 0, z: -10, heading: Math.PI / 2 });
  place(sim.survivor, { x: 0, z: -5 });
  assert.ok(sim.canMonsterSeeSurvivor());
  sim.monster.heading = -Math.PI / 2;
  assert.equal(sim.canMonsterSeeSurvivor(), false, 'cannot see behind its head');
  sim.monster.heading = 0;
  place(sim.survivor, { x: 8, z: -10 });
  assert.equal(lineOfSight(sim.monster, sim.survivor), false, 'partition blocks the ray');
  assert.equal(sim.canMonsterSeeSurvivor(), false);
  place(sim.survivor, { x: 0, z: -5, hidden: true });
  sim.monster.heading = Math.PI / 2;
  assert.equal(sim.canMonsterSeeSurvivor(), false, 'hidden NPC has no visual position');
});

test('sounds are spatial clues with approximate positions, not live survivor targets', () => {
  const sim = new Simulation({ seed: 12 });
  place(sim.monster, { x: 0, z: -8 });
  sim.emitNoise(-22, 18, 4, 'Distant noise');
  sim._hearNoises(false);
  assert.equal(sim.monster.state, 'patrol', 'a sound outside hearing range has no effect');
  const sound = sim.emitNoise(0, -3, 12, 'Dropped bottle');
  sim._hearNoises(false);
  assert.equal(sim.monster.state, 'investigate');
  assert.ok(distance(sim.monster.target, sound) < 2);
  assert.notDeepEqual(sim.monster.target, { x: sound.x, z: sound.z });
  const rememberedTarget = { ...sim.monster.target };
  place(sim.survivor, { x: 19, z: 16 });
  sim._hearNoises(false);
  assert.deepEqual(sim.monster.target, rememberedTarget, 'moving an unseen NPC does not retarget the clue');
});

test('the monster follows a finite last-seen memory and then searches and forgets', () => {
  const sim = new Simulation({ seed: 9 });
  sim.survivor.graceRemaining = 0;
  place(sim.monster, { x: 0, z: -10, heading: Math.PI / 2 });
  place(sim.survivor, { x: 0, z: -5 });
  sim._updateMonster(0.1);
  assert.equal(sim.monster.state, 'chase');
  assert.equal(sim.monster.memoryRemaining, 8);
  const observed = { ...sim.monster.lastSeen };
  place(sim.survivor, { x: 19, z: 16 });
  sim.time += 0.1;
  sim._updateMonster(0.1);
  assert.equal(sim.monster.state, 'pursue');
  assert.deepEqual(sim.monster.lastSeen, observed);
  assert.ok(distance(sim.monster.target, sim.survivor) > 20);
  sim.time = 8.2;
  sim._updateMonster(0.1);
  assert.equal(sim.monster.memoryRemaining, 0);
  assert.equal(sim.monster.state, 'search');
  sim.time = sim.monster._searchEnds + 0.1;
  sim._updateMonster(0.1);
  assert.equal(sim.monster.state, 'patrol');
  assert.equal(sim.monster.lastSeen, null);
});

test('a survivor cannot disappear into furniture while the monster is watching', () => {
  const sim = new Simulation({ seed: 4 });
  const spot = HIDING_SPOTS.find(s => s.id === 'bed-0');
  sim.survivor.graceRemaining = 0;
  place(sim.survivor, spot);
  const observer = { x: -9.095663622899057, z: -16.904131087028105 };
  place(sim.monster, { ...observer, heading: Math.atan2(spot.z - observer.z, spot.x - observer.x) });
  assert.ok(distance(sim.monster, sim.survivor) > 11.5, 'covers the survivor/monster sensing-range mismatch');
  assert.ok(sim.canMonsterSeeSurvivor());
  assert.equal(sim._enterHiding(spot), false);
  assert.equal(sim.survivor.hidden, false);
  sim.monster.heading += Math.PI;
  assert.equal(sim._enterHiding(spot), true);
  assert.equal(sim.survivor.hidden, true);
  assert.equal(sim.survivor.hidingSpotId, spot.id);
});

test('checking an occupied hiding spot costs a life, while collected tools persist', () => {
  const sim = new Simulation({ seed: 7 });
  const spot = HIDING_SPOTS.find(s => s.type === 'closet');
  sim.items[0].collected = true;
  sim.survivor.items = [sim.items[0].id];
  place(sim.survivor, { ...spot, hidden: true, hidingSpotId: spot.id, graceRemaining: 0 });
  place(sim.monster, spot);
  Object.assign(sim.monster, { state: 'search', _searchEnds: 30, _checking: spot, _checkStarted: 0.1 });
  sim.time = 2.2;
  sim._updateSearch(0.1);
  assert.equal(sim.survivor.lives, 2);
  assert.equal(sim.survivor.hidden, false);
  assert.equal(sim.survivor.graceRemaining, 4);
  assert.deepEqual(sim.survivor.items, ['key']);
  assert.equal(sim.items[0].collected, true);
  assert.ok(isWalkable(sim.survivor.x, sim.survivor.z));
  assert.ok(distance(sim.survivor, sim.monster) > 10);
  sim.survivor.graceRemaining = 0;
  sim._catchSurvivor();
  sim.survivor.graceRemaining = 0;
  sim._catchSurvivor();
  assert.equal(sim.survivor.lives, 0);
  assert.equal(sim.status, 'lost');
  const finishedAt = sim.time;
  sim.update(1);
  assert.equal(sim.time, finishedAt);
});

test('all three tools and a completed noisy door interaction are required to escape', () => {
  const sim = new Simulation({ seed: 13 });
  place(sim.survivor, EXIT);
  place(sim.monster, { x: -19, z: -16 });
  sim._updateSurvivor(0.1);
  assert.equal(sim.status, 'running');
  place(sim.survivor, EXIT);
  sim.survivor.items = sim.items.map(i => i.id);
  for (const item of sim.items) item.collected = true;
  for (let t = 0; t < 54; t++) {
    sim.time += 0.1;
    sim._updateSurvivor(0.1);
  }
  assert.equal(sim.status, 'running');
  assert.ok(sim.noises.some(n => n.type === 'Front door lock'));
  sim._updateSurvivor(0.1);
  sim._updateSurvivor(0.1);
  assert.equal(sim.status, 'escaped');
});

test('seeded runs are deterministic across frame rates and can be reset exactly', () => {
  const a = new Simulation({ seed: 'Bob’s Bath' });
  const b = new Simulation({ seed: 'Bob’s Bath' });
  const initial = a.snapshot();
  for (let n = 0; n < 500; n++) a.update(0.1);
  for (let n = 0; n < 2000; n++) b.update(0.025);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.reset();
  assert.deepEqual(a.snapshot(), initial);
  const different = new Simulation({ seed: 'different route' });
  assert.notDeepEqual(a.monster.target, different.monster.target);
});

test('autonomous motion stays in navigable space during a full run', () => {
  const sim = new Simulation({ seed: 1 });
  for (let t = 0; t < 4000 && sim.status === 'running'; t++) {
    sim.update(0.1);
    assert.ok(isWalkable(sim.survivor.x, sim.survivor.z), `survivor collision at ${sim.time}`);
    assert.ok(isWalkable(sim.monster.x, sim.monster.z), `monster collision at ${sim.time}`);
    assert.ok(sim.survivor.lives >= 0 && sim.survivor.lives <= 3);
    assert.ok(sim.monster.alertness >= 0 && sim.monster.alertness <= 1.2);
  }
  assert.notEqual(sim.status, 'running', 'a complete run resolves rather than getting stuck');
  assert.ok(sim.stats.chases > 0);
  assert.ok(sim.stats.sounds > 0);
});
