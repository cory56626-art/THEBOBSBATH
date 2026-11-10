import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { tacticalSearch, internalMoveUci } from '../src/tactical-search.js';

const moved = (board, move) => board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
const snapshot = board => ({ fen: board.fen(), hash: board.hash(), history: board.history(), counts: [...board._positionCount], headers: board.getHeaders() });
const settings = { budgetMs: 10000, maxNodes: 50000 };

function perft(board, depth) {
  if (!depth) return 1;
  let total = 0;
  for (const move of board._moves()) {
    board._makeMove(move);
    try { total += perft(board, depth - 1); } finally { board._undoMove(); }
  }
  return total;
}

test('pinned bare-move contract matches standard perft totals and restores board hashes', () => {
  const start = new Chess(), before = snapshot(start);
  assert.equal(perft(start, 3), 8902);
  assert.deepEqual(snapshot(start), before);
  const kiwipete = new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const original = snapshot(kiwipete);
  assert.equal(perft(kiwipete, 2), 2039);
  assert.deepEqual(snapshot(kiwipete), original);
});

test('bare special moves match public movement, en passant, castling and underpromotion state', () => {
  for (const fen of [
    'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
    '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
    '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1',
    '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/8/p7/4K3 b - - 0 1',
  ]) {
    const board = new Chess(fen), before = snapshot(board);
    for (const move of board._moves()) {
      const expected = new Chess(fen); moved(expected, internalMoveUci(move));
      board._makeMove(move);
      try {
        assert.equal(board.fen(), expected.fen());
        assert.equal(board.hash(), expected.hash());
      } finally { board._undoMove(); }
      assert.deepEqual(snapshot(board), before);
    }
  }
});

for (const fen of ['k7/8/1QK5/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/6k1/5q2/7K b - - 0 1']) {
  test(`alpha-beta proves an immediate mate with the correct side-to-move sign: ${fen}`, async () => {
    const board = new Chess(fen), before = snapshot(board);
    const result = await tacticalSearch(board, { ...settings, maxDepth: 3 });
    assert.equal(result.proven, true);
    assert.equal(result.mateInPlies, 1);
    assert.equal(result.scoreCp, 29999);
    assert.deepEqual(snapshot(board), before);
    moved(board, result.move);
    assert.equal(board.isCheckmate(), true);
  });
}

test('mate-distance scores describe a forced line against every legal defense', async () => {
  const board = new Chess('k7/8/2K5/8/8/8/8/3Q4 w - - 0 1');
  const result = await tacticalSearch(board, { ...settings, maxDepth: 3 });
  assert.equal(result.proven, true);
  assert.equal(result.mateInPlies, 3);
  assert.equal(result.scoreCp, 29997);
  // Independently check the AND/OR chess outcome instead of accepting the PV
  // or a fail-low alpha-beta bound as evidence of a forced win.
  function forcesMate(position, remaining) {
    if (position.isCheckmate()) return position.turn() === 'b';
    if (position.isGameOver() || !remaining) return false;
    const outcomes = position.moves().map(move => {
      position.move(move);
      try { return forcesMate(position, remaining - 1); } finally { position.undo(); }
    });
    return position.turn() === 'w' ? outcomes.some(Boolean) : outcomes.every(Boolean);
  }
  moved(board, result.move);
  assert.equal(forcesMate(board, result.mateInPlies - 1), true);
});

test('capture quiescence refuses a poisoned pawn even when the neural ordering strongly prefers it', async () => {
  const board = new Chess('4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1');
  const result = await tacticalSearch(board, { ...settings, maxDepth: 1, priors: [{ uci: 'e2e5', probability: .999 }] });
  assert.notEqual(result.move, 'e2e5');
  assert.ok(result.qNodes > 0);
  assert.ok(result.scoreCp > 0);
  assert.ok(result.rootStats.find(row => row.uci === 'e2e5').valueCp < 0);
});

test('a hard node cap keeps the last complete iteration instead of publishing a partial result', async () => {
  const expected = await tacticalSearch(new Chess(), { ...settings, maxDepth: 1 });
  const board = new Chess(), before = snapshot(board);
  const result = await tacticalSearch(board, { ...settings, maxNodes: 64 });
  assert.equal(result.nodes, 64);
  assert.equal(result.stopReason, 'node-limit');
  assert.equal(result.depth, 1);
  assert.equal(result.completedIterations, 1);
  assert.equal(result.move, expected.move);
  assert.equal(result.scoreCp, expected.scoreCp);
  assert.deepEqual(snapshot(board), before);
  const tiny = await tacticalSearch(board, { ...settings, maxNodes: 1 });
  assert.equal(tiny.nodes, 1);
  assert.ok(board.moves({ verbose: true }).some(move => move.lan === tiny.move));
  assert.equal(tiny.depth, 0);
});

test('cancellation yields only restored root positions and preserves the complete caller history', async () => {
  const board = new Chess(); for (const move of ['e4','e5','Nf3','Nc6']) board.move(move);
  const before = snapshot(board), controller = new AbortController();
  let callbacks = 0;
  await assert.rejects(tacticalSearch(board, { ...settings, signal: controller.signal, onProgress: () => {
    callbacks++;
    assert.deepEqual(snapshot(board), before);
    controller.abort();
  } }), error => error.name === 'AbortError');
  assert.equal(callbacks, 1);
  assert.deepEqual(snapshot(board), before);
});

test('unexpected progress errors also restore caller state', async () => {
  const board = new Chess(), before = snapshot(board);
  await assert.rejects(tacticalSearch(board, { ...settings, onProgress: () => { throw Error('observer failed'); } }), /observer failed/);
  assert.deepEqual(snapshot(board), before);
});

test('historical repetition changes line evaluation and leaves original repetition counts intact', async () => {
  const board = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
  for (const move of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1']) board.move(move);
  const before = snapshot(board);
  const config = { ...settings, maxDepth: 1, priors: [{ uci: 'f6g8', probability: 1 }] };
  const historical = await tacticalSearch(board, config), fenOnly = await tacticalSearch(new Chess(board.fen()), config);
  assert.equal(Math.abs(historical.rootStats.find(row => row.uci === 'f6g8').valueCp), 0);
  assert.ok(fenOnly.rootStats.find(row => row.uci === 'f6g8').valueCp > 500);
  assert.deepEqual(snapshot(board), before);
  board.move('Ng8');
  const terminal = await tacticalSearch(board, config);
  assert.equal(terminal.move, null);
  assert.equal(terminal.scoreCp, 0);
});

test('fifty-move draws score zero while checkmate takes precedence at the move-count boundary', async () => {
  const draw = await tacticalSearch(new Chess('6k1/8/8/8/8/8/8/5RK1 w - - 99 1'), { ...settings, maxDepth: 1 });
  assert.equal(Math.abs(draw.scoreCp), 0);
  const mate = await tacticalSearch(new Chess('k7/1Q6/2K5/8/8/8/8/8 b - - 100 1'), settings);
  assert.equal(mate.move, null);
  assert.equal(mate.scoreCp, -30000);
  const stalemate = await tacticalSearch(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), settings);
  assert.equal(stalemate.move, null);
  assert.equal(stalemate.scoreCp, 0);
});
