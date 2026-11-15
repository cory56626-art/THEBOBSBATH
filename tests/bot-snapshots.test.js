import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { ENGINES, engineFor } from '../src/bots/engines.js';
import { BOTS, BOT_PROFILE, botById } from '../src/bot-profile.js';

const root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Each released bot is the exact source graph that played its rating games.
const SNAPSHOTS = {
  gato1: { revision: 'b1d5002', files: ['engine.js', 'controller.js', 'tactical-search.js', 'position-evaluation.js'], version: 'intuition-hybrid-3' },
  gato2: { revision: 'c50e6ed', files: ['engine.js', 'controller.js', 'gato-search.js'], version: 'intuition-hybrid-5' },
};

test('the active engine served as Gato 3 is byte-identical to its rated revision 94eab0e', async () => {
  for (const file of ['engine.js', 'controller.js', 'gato-search.js', 'gato-eval-params.js', 'gato3-weights.js']) {
    const local = await readFile(new URL(`src/${file}`, root));
    const rated = execFileSync('git', ['show', `94eab0e:src/${file}`], { cwd: root });
    assert.equal(sha(local), sha(rated), `src/${file} drifted from Gato 3's rated revision`);
  }
});

for (const [folder, snapshot] of Object.entries(SNAPSHOTS)) {
  test(`${folder} is byte-identical to its rated revision ${snapshot.revision}`, async () => {
    const present = (await readdir(new URL(`src/bots/${folder}/`, root))).sort();
    assert.deepEqual(present, [...snapshot.files].sort());
    for (const file of snapshot.files) {
      const local = await readFile(new URL(`src/bots/${folder}/${file}`, root));
      const rated = execFileSync('git', ['show', `${snapshot.revision}:src/${file}`], { cwd: root });
      assert.equal(sha(local), sha(rated), `${folder}/${file} drifted from ${snapshot.revision}`);
    }
  });
}

test('every released profile has a matching engine with the same version', () => {
  for (const bot of BOTS) {
    assert.equal(engineFor(bot.id).ENGINE_VERSION, bot.engineVersion, bot.id);
    assert.ok(bot.rating.maxNodes > 0 && bot.rating.budgetMs === 150);
  }
  assert.equal(Object.keys(ENGINES).length, BOTS.length);
  assert.equal(BOT_PROFILE.id, BOTS[0].id);
  assert.equal(botById('missing').id, BOTS[0].id);
  assert.throws(() => engineFor('gato-99'), /Unknown bot/);
});

test('each snapshot engine plays a legal searched move from a game with history', async () => {
  const model = { infer(chess) { const moves = chess.moves({ verbose: true }); return { candidates: moves.map(m => ({ uci: m.from + m.to + (m.promotion || ''), probability: 1 / moves.length })), value: 0, modelId: 'uniform-test' }; } };
  for (const bot of BOTS) {
    const game = new Chess(); for (const move of ['e4', 'e5', 'Nf3', 'Nc6']) game.move(move);
    const before = game.pgn();
    const result = await engineFor(bot.id).chooseMove(game, model, { mode: 'search', budgetMs: 10000, maxNodes: 2000 });
    assert.ok(game.moves({ verbose: true }).some(m => m.from + m.to + (m.promotion || '') === result.move), bot.id);
    assert.equal(result.engineVersion, bot.engineVersion);
    assert.equal(game.pgn(), before);
  }
});
