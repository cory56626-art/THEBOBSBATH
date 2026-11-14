import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_PROFILE, formatInterval } from '../src/bot-profile.js';
import { ENGINE_VERSION } from '../src/engine.js';

test('Gato 2 profile matches the active engine and its measured ladder', () => {
  assert.equal(BOT_PROFILE.name, 'Gato 2');
  assert.equal(BOT_PROFILE.engineVersion, ENGINE_VERSION);
  assert.deepEqual({ ...BOT_PROFILE.rating }, { estimate: 2278, lower: 1933, upper: null, games: 32, scale: 'Stockfish 19 nominal UCI_Elo', provisional: true, mode: 'search', budgetMs: 150, maxNodes: 1000000 });
  assert.equal(BOT_PROFILE.previous.name, 'Gato 1');
  assert.equal(BOT_PROFILE.previous.estimate, 1650);
});

test('interval text never invents a missing finite endpoint', () => {
  assert.equal(formatInterval({ lower: 1289, upper: 2047 }), '1289–2047');
  assert.equal(formatInterval({ lower: 1933, upper: null }), '1933 – unbounded');
  assert.equal(formatInterval({ lower: null, upper: 1200 }), 'unbounded – 1200');
  assert.equal(formatInterval({ lower: null, upper: null }), 'unbounded');
});
