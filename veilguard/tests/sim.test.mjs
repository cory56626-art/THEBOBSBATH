import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, ENEMIES, levelFromXp, xpForLevel } from '../data.mjs';
import { Battle, distanceToPath, nearestTile, positionOnPath, makeWave, towerStats } from '../sim.mjs';

test('the route and build grid have valid endpoints and exclusions', () => {
  assert.deepEqual(positionOnPath(0), { x: -14, z: 2 });
  assert.deepEqual(positionOnPath(999), { x: 14, z: 0 });
  assert.deepEqual(nearestTile(-11.8, -7.9), { x: -12, z: -8 });
  assert.equal(nearestTile(999, 0), null);
  assert.ok(distanceToPath(-8, 2) < 1.48);
  assert.ok(distanceToPath(-12, -8) > 1.48);
});

test('cash, upgrades, placement, and refund all agree', () => {
  const battle = new Battle();
  assert.equal(battle.canPlace('spark', -8, 2), 'Too close to the route');
  assert.equal(battle.canPlace('mortar', -12, -8), 'Not in loadout');
  const placed = battle.place('spark', -12, -8).tower;
  assert.equal(battle.cash, 540);
  assert.equal(battle.canPlace('spark', -12, -8), 'Tile occupied');
  assert.equal(battle.upgrade(placed.id).tower.level, 1);
  assert.equal(towerStats(placed).damage, 18);
  assert.equal(battle.cash, 440);
  assert.equal(battle.sell(placed.id).refund, 168);
  assert.equal(battle.cash, 608);
  assert.equal(battle.towers.length, 0);
});

test('each mode has the advertised final boss wave', () => {
  for (const [id, mode] of Object.entries(MODES)) {
    assert.equal(makeWave(1, id).some(s => s.type === 'sovereign'), false);
    assert.equal(makeWave(mode.waves, id).at(-1).type, 'sovereign');
  }
});

test('air and hidden traits require suitable towers and detection', () => {
  const battle = new Battle();
  battle.cash = 1000;
  const spark = battle.place('spark', -12, -8).tower;
  const prism = battle.place('prism', -10, -8).tower;
  const frost = battle.place('frost', -6, -8).tower;
  battle.wave = 7;
  const hidden = battle.spawn('shroud', 8);
  const air = battle.spawn('glider', 8);
  // Directly position targets to isolate trait logic from path geometry.
  hidden.x = air.x = -9;
  hidden.z = air.z = -7;
  assert.equal(battle.targetFor(spark, towerStats(spark))?.id, air.id);
  assert.equal(battle.targetFor(frost, towerStats(frost)), undefined);
  assert.equal(battle.targetFor(prism, towerStats(prism))?.id, air.id);
  prism.level = 2;
  assert.equal(towerStats(prism).detect, true);
  battle.enemies.splice(battle.enemies.indexOf(air), 1);
  assert.equal(battle.targetFor(prism, towerStats(prism))?.id, hidden.id);
});

test('armor reduces physical damage, while energy ignores it', () => {
  const battle = new Battle();
  const spark = battle.place('spark', -12, -8).tower;
  const prism = battle.place('prism', -10, -8).tower;
  const target = battle.spawn('plated');
  const original = target.hp;
  battle.hit(target, 20, spark, towerStats(spark));
  assert.equal(target.hp, original - 11);
  battle.hit(target, 20, prism, towerStats(prism));
  assert.equal(target.hp, original - 31);
});

test('wave completion pays income and the final wave ends the campaign', () => {
  const battle = new Battle();
  const relay = battle.place('relay', -12, -8).tower;
  assert.ok(relay);
  assert.equal(battle.startWave(), true);
  assert.equal(battle.startWave(), false);
  battle.spawns.length = 0;
  battle.step(.05);
  assert.equal(battle.phase, 'build');
  assert.equal(battle.wave, 1);
  assert.equal(battle.cash, 680 - 390 + 80 + 15 + 105);
  battle.wave = MODES.ember.waves - 1;
  battle.startWave();
  battle.spawns.length = 0;
  battle.step(.05);
  assert.equal(battle.phase, 'victory');
  assert.ok(battle.events.some(e => e.type === 'end' && e.outcome === 'victory'));
});

test('leaks can end a battle, and exp thresholds rise', () => {
  const battle = new Battle();
  battle.startWave();
  battle.spawns.length = 0;
  const enemy = battle.spawn('titan', 1000);
  battle.health = enemy.leak;
  battle.step(.05);
  assert.equal(battle.phase, 'defeat');
  assert.equal(battle.health, 0);
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(xpForLevel(3)), 3);
  assert.ok(ENEMIES.sovereign.boss);
});
