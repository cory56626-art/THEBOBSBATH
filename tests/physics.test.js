import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle, updateVehicle, movePerson, findExit, hasLineOfSight } from '../src/physics.js';

const stepCar = (car, input, seconds, boxes = [], obstacles = []) => {
  let hit = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    const result = updateVehicle(car, input, 1 / 60, boxes, 210, obstacles);
    hit = hit || result.collision;
  }
  return hit;
};

test('forward and reverse limits, acceleration and brakes', () => {
  const car = createVehicle({ x: 0, z: 0 });
  stepCar(car, { throttle: 1 }, 1);
  assert.ok(car.z < -3 && car.speed > 7 && car.speed < 8.1);
  stepCar(car, { throttle: 1 }, 7);
  assert.ok(car.speed <= 35 && car.speed > 32);
  const initial = car.speed;
  stepCar(car, { brake: true }, 1);
  assert.ok(car.speed < initial - 16);
  stepCar(car, { brake: true }, 3);
  assert.equal(car.speed, 0);
  stepCar(car, { throttle: -1 }, 3);
  assert.ok(car.speed >= -12 && car.speed < -11);
});

test('right steering turns right moving forward, opposite in reverse; no stationary yaw', () => {
  const car = createVehicle({ x: 0, z: 0 });
  stepCar(car, { steer: 1 }, 1);
  assert.equal(car.angle, 0);
  stepCar(car, { throttle: 1, steer: 1 }, 1);
  assert.ok(car.angle < 0 && car.x > 0);
  const reverse = createVehicle({ x: 0, z: 0 });
  stepCar(reverse, { throttle: -1, steer: 1 }, 1);
  assert.ok(reverse.angle > 0 && reverse.x > 0);
});

test('high-speed collision cannot tunnel through a thin building on a long frame', () => {
  const wall = { x: 0, z: 0, hx: 15, hz: 0.05, height: 12 };
  const car = createVehicle({ x: 0, z: 4 });
  car.speed = 35;
  const result = updateVehicle(car, {}, 10, [wall]);
  assert.ok(result.collision && result.impact > 30);
  assert.ok(car.z >= 1.85, `stopped before wall: ${car.z}`);
  assert.ok(car.health < 100 && car.damage > 0);
  assert.ok(Math.abs(car.speed) < 5);
});

test('car collides with actor cars and ignores itself', () => {
  const car = createVehicle({ x: 0, z: 8 });
  car.id = 'player'; car.speed = 35;
  const other = { id: 'other', x: 0, z: 2, radius: 1.8 };
  const result = updateVehicle(car, {}, 0.25, [], 210, [car, other]);
  assert.ok(result.collision && result.impact > 20);
  assert.ok(Math.hypot(car.x - other.x, car.z - other.z) >= 3.6);
});

test('diagonal walking slides along a wall without entering it', () => {
  const person = { x: -1, z: -2 };
  const wall = { minX: 0, maxX: 1, minZ: -10, maxZ: 10 };
  for (let i = 0; i < 30; i++) movePerson(person, 5, 5, 1 / 60, [wall]);
  assert.ok(person.x <= -0.4 && person.x > -0.5);
  assert.ok(person.z > 0.4, `continued moving along wall: ${person.z}`);
});

test('walking sweep blocks tunnelling and world boundaries', () => {
  const person = { x: -1, z: 0 };
  movePerson(person, 1000, 0, 1, [{ x: 0, z: 0, hx: 0.01, hz: 8 }]);
  assert.ok(person.x < -0.41);
  const edge = { x: 209, z: 209 };
  movePerson(edge, 1000, 1000, 0.25);
  assert.ok(edge.x <= 209.6 && edge.z <= 209.6);
});

test('safe vehicle exits choose the open side, or remain blocked', () => {
  const car = createVehicle({ x: 0, z: 0 });
  const rightWall = { x: 3.5, z: 0, hx: 1, hz: 10 };
  const exit = findExit(car, [rightWall]);
  assert.ok(exit && exit.x < -3 && Math.abs(exit.z) < 0.01);
  assert.equal(findExit(car, [{ x: 0, z: 0, hx: 20, hz: 20 }]), null);
  const boundaryExit = findExit(createVehicle({ x: 208, z: 0 }));
  assert.ok(boundaryExit && boundaryExit.x < 208);
});

test('line of sight is blocked across buildings, including inside endpoints', () => {
  const boxes = [{ x: 0, z: 0, hx: 2, hz: 2 }];
  assert.equal(hasLineOfSight(-5, 0, 5, 0, boxes), false);
  assert.equal(hasLineOfSight(0, 0, 5, 0, boxes), false);
  assert.equal(hasLineOfSight(-5, 3, 5, 3, boxes), true);
  assert.equal(hasLineOfSight(-5, 0, -3, 0, boxes), true);
});

test('invalid or zero frame durations leave a vehicle unchanged and finite', () => {
  const car = createVehicle();
  const before = { ...car };
  updateVehicle(car, { throttle: 1 }, NaN);
  assert.deepEqual(car, before);
  updateVehicle(car, { throttle: NaN, steer: Infinity }, 0.1);
  assert.ok(Object.values(car).every(Number.isFinite));
});
