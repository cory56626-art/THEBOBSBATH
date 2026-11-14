import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { gatoSearch, gatoPerft, gatoEvaluate, gatoSee, gatoVerifyIncremental, gatoTrace } from '../src/gato-search.js';
import { gatoEvaluate as gato2Evaluate } from '../src/bots/gato2/gato-search.js';
import { gato2Weights, PARAM_COUNT, PARAMS } from '../src/gato-eval-params.js';
import { GATO3_WEIGHTS } from '../src/gato3-weights.js';
import { evaluatePosition } from '../src/position-evaluation.js';

const moved = (board, move) => board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
const snapshot = board => ({ fen: board.fen(), hash: board.hash(), history: board.history(), counts: [...board._positionCount], headers: board.getHeaders() });
const settings = { budgetMs: 10000, maxNodes: 200000 };

test('Gato 2 move generation matches standard perft totals, including castling, en passant and promotions', () => {
  for (const [fen, depth, expected] of [
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ]) assert.equal(gatoPerft(fen, depth), expected, fen);
});

test('incremental hash, piece-square, phase, material and counts never drift through make/unmake', () => {
  for (const fen of [
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
  ]) assert.ok(gatoVerifyIncremental(fen, 3) > 0);
});

function randomGamePositions(games, seed) {
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const positions = [];
  for (let game = 0; game < games; game++) {
    const board = new Chess();
    for (let ply = 0; ply < 140 && !board.isGameOver(); ply++) {
      const moves = board.moves({ verbose: true });
      const captures = moves.filter(move => move.captured);
      board.move(captures.length && random() < .5 ? captures[Math.floor(random() * captures.length)] : moves[Math.floor(random() * moves.length)]);
      positions.push(board.fen());
    }
  }
  return positions;
}

test('with Gato 2 starting weights, the weighted evaluation equals Gato 1 and the Gato 2 snapshot exactly', () => {
  const initial = gato2Weights();
  const positions = randomGamePositions(30, 7);
  assert.ok(positions.length > 2000);
  for (const fen of positions) {
    const expected = evaluatePosition(new Chess(fen));
    assert.equal(gato2Evaluate(fen), expected, fen);
    assert.equal(gatoEvaluate(fen, { weights: initial }), expected, fen);
  }
});

test('traced feature counts times the shipped weights reproduce every evaluation', () => {
  assert.equal(GATO3_WEIGHTS.mg.length, PARAM_COUNT);
  assert.equal(GATO3_WEIGHTS.eg.length, PARAM_COUNT);
  for (const fen of randomGamePositions(12, 11)) {
    const t = gatoTrace(fen);
    let mg = 0, eg = t.mopUp;
    for (let i = 0; i < PARAM_COUNT; i++) if (t.features[i]) { mg += GATO3_WEIGHTS.mg[i] * t.features[i]; eg += GATO3_WEIGHTS.eg[i] * t.features[i]; }
    const tapered = (mg * t.phase + eg * (24 - t.phase)) / 24;
    const white = Math.sign(tapered) * Math.floor(Math.abs(tapered) + .5);
    assert.equal(white === 0 ? 0 : t.side === 0 ? white : -white, gatoEvaluate(fen), fen);
    // Every feature is color-symmetric: the tempo term is the only side-to-move term.
    assert.equal(Math.abs(t.features[PARAMS.tempo]), 1);
  }
});

test('the evaluation is color-symmetric under a vertical flip with colors swapped', () => {
  const flip = fen => {
    const [placement, turn, castling, ep, half, full] = fen.split(' ');
    const swap = c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
    const rows = placement.split('/').reverse().map(row => [...row].map(c => /[a-z]/i.test(c) ? swap(c) : c).join(''));
    const rights = castling === '-' ? '-' : [...castling].map(swap).sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b)).join('');
    const passant = ep === '-' ? '-' : ep[0] + (9 - Number(ep[1]));
    return [rows.join('/'), turn === 'w' ? 'b' : 'w', rights, passant, half, full].join(' ');
  };
  for (const fen of randomGamePositions(10, 23)) assert.equal(gatoEvaluate(flip(fen)), gatoEvaluate(fen), fen);
});

test('static exchange evaluation distinguishes safe and defended captures', () => {
  assert.equal(gatoSee('4k3/8/8/4p3/8/8/8/4R1K1 w - - 0 1', 'e1e5'), 100);
  assert.equal(gatoSee('4k3/8/3p4/4p3/8/8/1B6/4K3 w - - 0 1', 'b2e5'), -230);
  assert.equal(gatoSee('4k3/8/3p4/4p3/8/8/1B6/4KQ2 w - - 0 1', 'b2e5'), -230);
  assert.equal(gatoSee('4k3/4r3/8/4p3/8/8/4R3/4R1K1 w - - 0 1', 'e2e5'), 100);
});

for (const fen of ['k7/8/1QK5/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/6k1/5q2/7K b - - 0 1']) {
  test(`Gato 2 proves an immediate mate with the correct sign: ${fen}`, async () => {
    const board = new Chess(fen), before = snapshot(board);
    const result = await gatoSearch(board, settings);
    assert.equal(result.proven, true);
    assert.equal(result.mateInPlies, 1);
    assert.equal(result.scoreCp, 29999);
    assert.deepEqual(snapshot(board), before);
    moved(board, result.move);
    assert.equal(board.isCheckmate(), true);
  });
}

test('a reported mate is a forced line against every legal defense', async () => {
  const board = new Chess('k7/8/2K5/8/8/8/8/3Q4 w - - 0 1');
  const result = await gatoSearch(board, settings);
  assert.equal(result.proven, true);
  assert.equal(result.mateInPlies, 3);
  assert.equal(result.scoreCp, 29997);
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

test('finds a queen sacrifice mate that needs three plies of forcing play', async () => {
  // 1.Qd8+ Bxd8 2.Re8# — the policy prefers a quiet pawn move.
  const fen = 'r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 1 1';
  const result = await gatoSearch(new Chess(fen), { ...settings, priors: [{ uci: 'h2h3', probability: .99 }] });
  assert.equal(result.move, 'd5d8');
  assert.equal(result.proven, true);
  assert.equal(result.mateInPlies, 3);
});

test('quiescence refuses a poisoned pawn despite a strong neural prior', async () => {
  const board = new Chess('4r1k1/8/8/4p3/8/8/4Q3/6K1 w - - 0 1');
  const result = await gatoSearch(board, { ...settings, priors: [{ uci: 'e2e5', probability: .999 }] });
  assert.notEqual(result.move, 'e2e5');
  assert.ok(result.qNodes > 0);
});

test('a hard node cap is exact and node-limited searches are deterministic', async () => {
  const board = new Chess(), before = snapshot(board);
  const a = await gatoSearch(board, { ...settings, maxNodes: 300 });
  const b = await gatoSearch(board, { ...settings, maxNodes: 300 });
  assert.equal(a.nodes, 300);
  assert.equal(a.stopReason, 'node-limit');
  assert.equal(a.move, b.move);
  assert.equal(a.nodes, b.nodes);
  assert.deepEqual(snapshot(board), before);
  const tiny = await gatoSearch(board, { ...settings, maxNodes: 1 });
  assert.equal(tiny.nodes, 1);
  assert.ok(board.moves({ verbose: true }).some(move => move.lan === tiny.move));
});

test('cancellation and observer errors leave the caller history intact', async () => {
  const board = new Chess(); for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) board.move(move);
  const before = snapshot(board), controller = new AbortController();
  await assert.rejects(gatoSearch(board, { ...settings, signal: controller.signal, onProgress: () => controller.abort() }), error => error.name === 'AbortError');
  assert.deepEqual(snapshot(board), before);
  await assert.rejects(gatoSearch(board, { ...settings, onProgress: () => { throw Error('observer failed'); } }), /observer failed/);
  assert.deepEqual(snapshot(board), before);
});

test('game-history repetition is a draw in search, and a winning side avoids it', async () => {
  // White is a queen up; the shuffle back to a repeated position must not be chosen.
  const board = new Chess('6k1/5pp1/7p/8/8/8/5PPP/3Q2K1 w - - 0 1');
  for (const move of ['Qd2', 'Kh7', 'Qd1', 'Kg8', 'Qd2', 'Kh7']) board.move(move);
  const before = snapshot(board);
  const result = await gatoSearch(board, { ...settings, maxDepth: 4 });
  assert.notEqual(result.move, 'd2d1');
  assert.ok(result.scoreCp > 500);
  assert.deepEqual(snapshot(board), before);
});

test('fifty-move, stalemate and checkmate boundaries are exact', async () => {
  const draw = await gatoSearch(new Chess('6k1/8/8/8/8/8/8/5RK1 w - - 99 1'), { ...settings, maxDepth: 2 });
  assert.equal(Math.abs(draw.scoreCp), 0);
  const mate = await gatoSearch(new Chess('k7/1Q6/2K5/8/8/8/8/8 b - - 100 1'), settings);
  assert.equal(mate.move, null);
  assert.equal(mate.scoreCp, -30000);
  const stalemate = await gatoSearch(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), settings);
  assert.equal(stalemate.move, null);
  assert.equal(stalemate.scoreCp, 0);
  // With only a king, avoid stalemating the opponent when a win is available.
  const result = await gatoSearch(new Chess('7k/8/5K2/6Q1/8/8/8/8 w - - 0 1'), settings);
  const after = new Chess('7k/8/5K2/6Q1/8/8/8/8 w - - 0 1'); moved(after, result.move);
  assert.equal(after.isStalemate(), false);
});

test('underpromotion and en-passant moves are emitted in UCI and are legal', async () => {
  const knight = await gatoSearch(new Chess('8/5P1k/6p1/6K1/8/8/8/8 w - - 0 1'), { ...settings, maxDepth: 6 });
  assert.ok(new Chess('8/5P1k/6p1/6K1/8/8/8/8 w - - 0 1').moves({ verbose: true }).some(move => move.lan === knight.move));
  const ep = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const result = await gatoSearch(ep, { ...settings, maxDepth: 3 });
  assert.ok(ep.moves({ verbose: true }).some(move => move.lan === result.move));
});
