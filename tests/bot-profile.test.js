import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_PROFILE, BOTS, formatInterval, generationLabel } from '../src/bot-profile.js';
import { ENGINE_VERSION } from '../src/engine.js';

test('Gato 3 is the newest bot, matches the active engine and its measured ladder', () => {
  assert.equal(BOT_PROFILE.name, 'Gato 3');
  assert.equal(BOT_PROFILE.engineVersion, ENGINE_VERSION);
  assert.deepEqual({ ...BOT_PROFILE.rating }, { estimate: 2334, lower: 2087, upper: 2528, games: 96, scale: 'Stockfish 19 nominal UCI_Elo', provisional: true, mode: 'search', budgetMs: 150, maxNodes: 1000000 });
  assert.equal(BOT_PROFILE.previous.name, 'Gato 2');
  assert.equal(BOT_PROFILE.previous.estimate, 2278);
  assert.deepEqual(BOTS.map(bot => bot.name), ['Gato 3', 'Gato 2', 'Gato 1']);
  assert.deepEqual(BOTS.map(generationLabel), ['OUR THIRD BOT', 'OUR SECOND BOT', 'OUR FIRST BOT']);
  assert.deepEqual(BOTS.map(bot => bot.rating.estimate), [2334, 2278, 1650]);
});

test('interval text never invents a missing finite endpoint', () => {
  assert.equal(formatInterval({ lower: 1289, upper: 2047 }), '1289–2047');
  assert.equal(formatInterval({ lower: 1933, upper: null }), '1933 – unbounded');
  assert.equal(formatInterval({ lower: null, upper: 1200 }), 'unbounded – 1200');
  assert.equal(formatInterval({ lower: null, upper: null }), 'unbounded');
});
