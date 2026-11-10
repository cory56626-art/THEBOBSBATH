// Keep regressions for the measured, unselected v4 candidate reproducible.
// The active engine remains the selected v3 source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { loadEngine } from '../scripts/lib/load-engine.mjs';

const { tacticalSearch } = await loadEngine({ sourceRevision: 'a7bf070:src/tactical-search.js' });
const snapshot = board => ({ fen: board.fen(), hash: board.hash(), history: board.history(), counts: [...board._positionCount], headers: board.getHeaders() });
const settings = { budgetMs: 10000, maxNodes: 50000 };

for (const fen of [
  new Chess().fen(),
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  '4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1',
  '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
  '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
]) {
  test(`PVS, aspiration and q-cache preserve full-window fixed-depth results: ${fen}`, async () => {
    const config = { budgetMs: 10000, maxNodes: 200000, maxDepth: 3, reductions: false };
    const reference = await tacticalSearch(new Chess(fen), { ...config, pvs: false, aspiration: false, qCache: false });
    const board = new Chess(fen), before = snapshot(board);
    const improved = await tacticalSearch(board, config);
    assert.equal(reference.depth, 3);
    assert.equal(improved.depth, 3);
    assert.equal(improved.scoreCp, reference.scoreCp);
    assert.equal(improved.move, reference.move);
    assert.deepEqual(snapshot(board), before);
  });
}

test('late-move reductions and capture transpositions run while retaining board state', async () => {
  const board = new Chess(), before = snapshot(board);
  const result = await tacticalSearch(board, { ...settings, maxDepth: 5, maxNodes: 100000 });
  assert.equal(result.depth, 5);
  assert.ok(result.diagnostics.reductions > 0);
  assert.ok(result.diagnostics.qTtHits > 0);
  assert.ok(result.diagnostics.researches > 0);
  assert.ok(result.diagnostics.aspirationRetries > 0);
  assert.deepEqual(snapshot(board), before);
});

test('an interrupted aspiration retry retains the last completed root iteration', async () => {
  const config = { ...settings, reductions: false };
  const depthTwo = await tacticalSearch(new Chess(), { ...config, maxDepth: 2 });
  const depthThree = await tacticalSearch(new Chess(), { ...config, maxDepth: 3 });
  assert.ok(depthThree.diagnostics.aspirationRetries > 0);
  const board = new Chess(), before = snapshot(board);
  const interrupted = await tacticalSearch(board, { ...config, maxDepth: 3, maxNodes: depthThree.nodes - 1 });
  assert.equal(interrupted.depth, 2);
  assert.equal(interrupted.scoreCp, depthTwo.scoreCp);
  assert.equal(interrupted.move, depthTwo.move);
  assert.deepEqual(interrupted.rootStats, depthTwo.rootStats);
  assert.equal(interrupted.nodes, depthThree.nodes - 1);
  assert.deepEqual(snapshot(board), before);
});

test('mate claims are verified without reductions, inside the original node cap', async () => {
  const result = await tacticalSearch(new Chess('k7/8/2K5/8/8/8/8/3Q4 w - - 0 1'), { ...settings, maxDepth: 3 });
  assert.equal(result.proven, true);
  assert.equal(result.mateInPlies, 3);
  assert.equal(result.diagnostics.mateVerifications, 1);
  const board = new Chess('k7/8/2K5/8/8/8/8/3Q4 w - - 0 1'), before = snapshot(board);
  const limited = await tacticalSearch(board, { ...settings, maxDepth: 3, maxNodes: result.nodes - 1 });
  assert.equal(limited.proven, false);
  assert.ok(limited.depth < 3);
  assert.equal(limited.nodes, result.nodes - 1);
  assert.deepEqual(snapshot(board), before);
});

test('historical positions before an irreversible pawn move cannot affect search draws', async () => {
  const board = new Chess();
  for (const move of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8','e4']) board.move(move);
  const before = snapshot(board), config = { ...settings, maxDepth: 3, reductions: false };
  const historical = await tacticalSearch(board, config);
  const fresh = await tacticalSearch(new Chess(board.fen()), config);
  assert.equal(historical.depth, 3);
  assert.equal(historical.scoreCp, fresh.scoreCp);
  assert.equal(historical.move, fresh.move);
  assert.deepEqual(snapshot(board), before);
});
