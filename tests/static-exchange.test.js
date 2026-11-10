import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { staticExchange } from '../src/static-exchange.js';
import { tacticalSearch, internalMoveUci } from '../src/tactical-search.js';
const values = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 20000 };
const snapshot = board => ({ fen: board.fen(), hash: board.hash(), history: board.history(), counts: [...board._positionCount], headers: board.getHeaders() });
// Independent legal-move oracle permits declining an exchange and considers
// all recapture choices, rather than accepting an MVV/LVA estimate as truth.
function targetExchange(board, target) {
  let best = 0;
  for (const move of board.moves({ verbose: true }).filter(move => move.to === target && move.captured)) {
    const gain = values[move.captured] + (move.promotion ? values[move.promotion] - values.p : 0);
    board.move(move);
    try { best = Math.max(best, gain - targetExchange(board, target)); } finally { board.undo(); }
  }
  return best;
}
for (const [name, fen, uci, expected] of [
  ['pinned recapturer', '5k2/8/5n2/3p4/2B5/8/8/5RK1 w - - 0 1', 'c4d5', 100],
  ['unsafe king recapture', '8/8/4k3/4p3/8/8/4Q3/4R1K1 w - - 0 1', 'e2e5', 100],
  ['legal king recapture', '8/8/4k3/4p3/8/8/4Q3/6K1 w - - 0 1', 'e2e5', -850],
  ['poisoned capture', '4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1', 'e2e5', -850],
  ['x-ray recapture chain', '3r2k1/8/4p3/3p4/2B5/8/8/3R2K1 w - - 0 1', 'c4d5', -235],
]) test(`static exchange handles ${name} and leaves exact caller state intact`, () => {
  const board = new Chess(fen), before = snapshot(board);
  const internal = board._moves().find(move => internalMoveUci(move) === uci);
  assert.ok(internal);
  const pieceRefs = board._board.slice();
  assert.equal(staticExchange(board, internal), expected);
  for (let index = 0; index < pieceRefs.length; index++) assert.equal(board._board[index], pieceRefs[index]);
  const oracle = new Chess(fen);
  const move = oracle.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  assert.equal(values[move.captured] - targetExchange(oracle, move.to), expected);
  assert.deepEqual(snapshot(board), before);
});

test('uncertain en passant, promotions and last-rank exchanges cannot trigger pruning', () => {
  for (const [fen, uci] of [
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6'],
    ['r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'b7a8n'],
    ['r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1', 'a1a8'],
  ]) {
    const board = new Chess(fen), before = snapshot(board);
    assert.equal(staticExchange(board, board._moves().find(move => internalMoveUci(move) === uci)), null);
    assert.deepEqual(snapshot(board), before);
  }
});

test('stopping during local exchange analysis cannot leak board or history mutations', () => {
  const board = new Chess('3r2k1/8/4p3/3p4/2B5/8/8/3R2K1 w - - 0 1'), before = snapshot(board);
  const move = board._moves().find(move => internalMoveUci(move) === 'c4d5');
  let probes = 0;
  assert.throws(() => staticExchange(board, move, () => { if (++probes === 3) throw Error('stop exchange'); }), /stop exchange/);
  assert.equal(probes, 3);
  assert.deepEqual(snapshot(board), before);
});

test('selective capture search prunes local losses while retaining the poisoned-pawn defense and hard caps', async () => {
  const board = new Chess('4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1'), before = snapshot(board);
  const result = await tacticalSearch(board, { budgetMs: 10000, maxNodes: 50000, maxDepth: 3, priors: [{ uci: 'e2e5', probability: 1 }] });
  assert.notEqual(result.move, 'e2e5');
  assert.ok(result.diagnostics.seeCalls > 0);
  assert.ok(result.diagnostics.qPruned > 0);
  assert.deepEqual(snapshot(board), before);
  const limited = await tacticalSearch(board, { budgetMs: 10000, maxNodes: 64, maxDepth: 32 });
  assert.equal(limited.nodes, 64);
  assert.equal(limited.stopReason, 'node-limit');
  assert.deepEqual(snapshot(board), before);
});

test('capture pruning still requires nonselective mate verification when reductions are disabled', async () => {
  const board = new Chess('k7/8/2K5/8/8/8/8/3Q4 w - - 0 1'), before = snapshot(board);
  const result = await tacticalSearch(board, { budgetMs: 10000, maxNodes: 50000, maxDepth: 3, reductions: false });
  assert.equal(result.proven, true);
  assert.equal(result.mateInPlies, 3);
  assert.equal(result.diagnostics.mateVerifications, 1);
  assert.deepEqual(snapshot(board), before);
  const limited = await tacticalSearch(board, { budgetMs: 10000, maxNodes: result.nodes - 1, maxDepth: 3, reductions: false });
  assert.equal(limited.proven, false);
  assert.equal(limited.nodes, result.nodes - 1);
  assert.deepEqual(snapshot(board), before);
});

test('time and cancellation checks apply during exchange ordering as well as recursive search', async t => {
  const board = new Chess('3r2k1/8/4p3/3p4/2B5/8/8/3R2K1 w - - 0 1'), before = snapshot(board);
  let time = 0;
  t.mock.method(performance, 'now', () => time += .05);
  const result = await tacticalSearch(board, { budgetMs: 1, maxNodes: 100000, maxDepth: 32 });
  assert.equal(result.stopReason, 'time-limit');
  assert.ok(result.elapsedMs < 1.2);
  assert.ok(board._moves().some(move => internalMoveUci(move) === result.move));
  assert.deepEqual(snapshot(board), before);
});
