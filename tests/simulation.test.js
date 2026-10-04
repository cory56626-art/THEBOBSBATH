import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.js';

const snapshot = (sim) => JSON.stringify({ people: sim.people, traffic: sim.traffic, state: sim.getState() });
const isolate = (sim) => {
  for (const actor of sim.people) { actor.x = 190; actor.z = 190; actor.hp = 0; actor.state = 'down'; }
};

test('seeded initial population and reset are deterministic', () => {
  const a = createSimulation({ seed: 122 }), b = createSimulation({ seed: 122 });
  assert.equal(a.people.length, 55);
  assert.equal(a.traffic.length, 16);
  assert.equal(snapshot(a), snapshot(b));
  const initial = snapshot(a);
  a.step(0.1, { x: 36, z: 36 }); a.reportCrime(4); a.reset();
  assert.equal(snapshot(a), initial);
});

test('paused simulation and invalid time steps have no effects', () => {
  const sim = createSimulation(), initial = snapshot(sim);
  sim.setPaused(true);
  assert.deepEqual(sim.step(0.1, { x: 36, z: 36 }), []);
  assert.equal(sim.shoot({ x: 36, z: 36, dx: 1, dz: 0 }), null);
  assert.equal(snapshot(sim), initial);
  sim.setPaused(false);
  for (const dt of [0, -1, NaN, Infinity]) sim.step(dt, { x: 36, z: 36 });
  assert.equal(snapshot(sim), initial);
});

test('time-step bounds prevent a slow frame from teleporting NPCs', () => {
  const a = createSimulation(), b = createSimulation();
  a.step(30, { x: 0, z: 112 }); b.step(0.1, { x: 0, z: 112 });
  assert.equal(snapshot(a), snapshot(b));
});

test('a shot hits the nearest actor and reports civilian harm as a crime', () => {
  const sim = createSimulation(); isolate(sim);
  const near = sim.people.find((p) => p.kind === 'civilian'), far = sim.people.find((p) => p.kind === 'hostile');
  Object.assign(near, { x: 0, z: -10, hp: 48 });
  Object.assign(far, { x: 0, z: -20, hp: 66 });
  assert.equal(sim.shoot({ x: 0, z: 0, dx: 0, dz: -1 }), near);
  assert.equal(near.hp, 14); assert.equal(far.hp, 66);
  assert.ok(sim.getState().wanted > 0);
});

test('buildings block player gunfire and NPC attacks', () => {
  const sim = createSimulation({ colliders: [{ x: 0, z: -5, hx: 4, hz: 1 }] }); isolate(sim);
  const hostile = sim.people.find((p) => p.kind === 'hostile');
  Object.assign(hostile, { x: 0, z: -12, hp: 66, cooldown: 0 });
  assert.equal(sim.shoot({ x: 0, z: 0, dx: 0, dz: -1 }), null);
  const events = sim.step(0.1, { x: 0, z: 0 });
  assert.ok(!events.some((event) => event.type === 'damage'));
  assert.equal(hostile.hp, 66);
});

test('nearby civilians flee gunfire then calm after the danger passes', () => {
  const sim = createSimulation(); isolate(sim);
  const civilian = sim.people[0]; Object.assign(civilian, { x: 0, z: 2, hp: 48 });
  sim.shoot({ x: 0, z: 0, dx: 1, dz: 0 });
  sim.step(0.1, { x: 0, z: 0 });
  assert.equal(civilian.state, 'flee');
  assert.ok(civilian.z > 2);
  for (let i = 0; i < 130; i++) sim.step(0.1, { x: -180, z: -180 });
  assert.equal(civilian.state, 'walk');
});

test('wanted level escalates and clears only after being unseen long enough', () => {
  const sim = createSimulation(); isolate(sim);
  sim.reportCrime(1); assert.equal(sim.getState().wanted, 1);
  sim.reportCrime(6); assert.equal(sim.getState().wanted, 3);
  for (let i = 0; i < 190; i++) sim.step(0.1, { x: 0, z: 0 });
  assert.equal(sim.getState().heat, 7);
  for (let i = 0; i < 200; i++) sim.step(0.1, { x: 0, z: 0 });
  assert.equal(sim.getState().wanted, 0);
});

test('neutralizing a hostile changes district metrics without a wanted level', () => {
  const sim = createSimulation(); isolate(sim);
  const hostile = sim.people.find((p) => p.kind === 'hostile');
  Object.assign(hostile, { x: 0, z: -12, hp: 66 });
  sim.shoot({ x: 0, z: 0, dx: 0, dz: -1 });
  sim.shoot({ x: 0, z: 0, dx: 0, dz: -1 });
  assert.equal(hostile.hp, 0); assert.equal(hostile.state, 'down');
  assert.equal(sim.getState().hostilesRemaining, 0);
  assert.equal(sim.getState().wanted, 0);
  assert.equal(sim.getState().score, 120);
});

test('long movement stays outside world buildings and within bounds', () => {
  const colliders = [];
  for (const x of [-108, -36, 36, 108]) for (const z of [-108, -36, 36, 108]) {
    if (x !== 36 || z !== 36) colliders.push({ x, z, hx: 21, hz: 21 });
  }
  const sim = createSimulation({ colliders });
  for (let i = 0; i < 600; i++) sim.step(0.1, { x: 0, z: 112, inCar: false });
  for (const actor of [...sim.people, ...sim.traffic]) {
    assert.ok(Math.abs(actor.x) < 210 && Math.abs(actor.z) < 210);
    assert.ok(!colliders.some((box) => Math.abs(actor.x - box.x) < box.hx && Math.abs(actor.z - box.z) < box.hz), actor.id);
  }
});

test('traffic yields to a player obstructing its lane', () => {
  const sim = createSimulation(); const car = sim.traffic[0];
  const target = car.route[car.routeIndex], dx = target.x - car.x, dz = target.z - car.z, length = Math.hypot(dx, dz);
  const player = { x: car.x + dx / length * 5, z: car.z + dz / length * 5, inCar: true };
  for (let i = 0; i < 20; i++) sim.step(0.1, player);
  assert.equal(car.speed, 0);
  assert.ok(Math.hypot(car.x - player.x, car.z - player.z) >= 4.9);
});
