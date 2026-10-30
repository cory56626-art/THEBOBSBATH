import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { getOpenings } from '../scripts/lib/chess-openings.mjs';
import { loadEngine } from '../scripts/lib/load-engine.mjs';
import { validateGames } from '../scripts/lib/validate-games.mjs';

test('prospective strength openings are legal, distinct and return independent copies', () => {
  const openings = getOpenings('strength24');
  assert.equal(openings.length * 2, 24);
  const positions = openings.map(opening => {
    const chess = new Chess();
    for (const move of opening.moves) chess.move(move);
    assert.equal(chess.isGameOver(), false);
    assert.equal(chess.turn(), 'w');
    return chess.fen();
  });
  assert.equal(new Set(positions).size, 12);
  openings[0].moves.pop();
  assert.equal(getOpenings('strength24')[0].moves.length, 6);
  assert.equal(getOpenings('arena4').length, 2);
  assert.equal(getOpenings('pilot8').length, 4);
  assert.throws(() => getOpenings('invented'), /Unknown opening set/);
});

test('source snapshots retain exact fingerprints, package imports and original engine-relative dependencies', async () => {
  const engine = await loadEngine({ sourcePath: 'tests/fixtures/harness-engine.mjs' });
  assert.equal(engine.ENGINE_VERSION, 'test-harness-snapshot');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(engine.sourceSHA256, hash(await readFile(new URL('./fixtures/harness-engine.mjs', import.meta.url))));
  assert.equal(engine.sourceDependencies['src/controller.js'], hash(await readFile(new URL('../src/controller.js', import.meta.url))));
  assert.ok(engine.featureNames.length > 0);
  assert.equal(engine.legalMoves(new Chess().fen()).length, 20);
});

function unfinishedReport() {
  const chess = new Chess();
  const openingFen = chess.fen(), beforeFen = chess.fen();
  const move = chess.move('e4');
  chess.header('Result', '*');
  return { settings: { maxPlies: 1, clockPerSideMs: 100 }, games: [{
    id: 1, openingMoves: [], openingFen, whiteEngine: 'candidate', blackEngine: 'reference',
    result: '*', status: 'truncated', winner: null, plies: 1, finalFen: chess.fen(), clocks: { w: 90, b: 100 },
    moves: [{ ply: 1, engine: 'candidate', color: 'w', move: 'e2e4', san: move.san, beforeFen, afterFen: chess.fen(), elapsedMs: 10 }], pgn: chess.pgn(),
  }] };
}

test('record validation preserves unfinished games and detects corrupted histories, scores and clocks', () => {
  const report = unfinishedReport();
  assert.deepEqual(validateGames(report), { games: 1, scored: 0, unfinished: 1, moves: 1, terminations: { truncated: 1 } });
  const corruptFen = structuredClone(report);
  corruptFen.games[0].moves[0].beforeFen = corruptFen.games[0].finalFen;
  assert.throws(() => validateGames(corruptFen), /before-FEN mismatch/);
  const fakeScore = structuredClone(report);
  fakeScore.games[0].result = '1/2-1/2';
  assert.throws(() => validateGames(fakeScore), /PGN result mismatch|unfinished and unscored/);
  const fakeClock = structuredClone(report);
  fakeClock.games[0].clocks.w = 100;
  assert.throws(() => validateGames(fakeClock), /game clock mismatch/);
});
