import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseMove, directMove } from '../src/engine.js';
import { FEATURE_NAMES } from '../src/controller.js';

const uci = (move) => move.from + move.to + (move.promotion || '');
function fakeModel(preferred) {
  let calls = 0;
  return {
    modelId: 'deterministic-test-policy',
    get calls() { return calls; },
    infer(chess) {
      calls++;
      const moves = chess.moves({ verbose: true }).map((move) => ({
        uci: uci(move), probability: uci(move) === preferred ? 10 : 1,
      })).sort((a, b) => b.probability - a.probability || a.uci.localeCompare(b.uci));
      const total = moves.reduce((sum, move) => sum + move.probability, 0);
      for (const move of moves) move.probability /= total;
      return { candidates: moves, value: 0, entropy: 0.7, confidence: moves[0]?.probability ?? 0, modelId: this.modelId };
    },
  };
}

test('direct play makes one inference and expands no future positions', async () => {
  const game = new Chess();
  const model = fakeModel('e2e4');
  const result = await chooseMove(game, model, { mode: 'direct' });
  assert.equal(result.move, 'e2e4');
  assert.equal(result.nodes, 0);
  assert.equal(result.searched, false);
  assert.equal(model.calls, 1);
  assert.equal(game.history().length, 0);
});

for (const [name, fen, preferred] of [
  ['castling', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'],
  ['en passant', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6'],
  ['white underpromotion', '7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7a8n'],
  ['black underpromotion', '7k/8/8/8/8/8/p7/7K b - - 0 1', 'a2a1n'],
]) {
  test(`direct engine preserves legal ${name}`, () => {
    const result = directMove(new Chess(fen), fakeModel(preferred));
    assert.equal(result.move, preferred);
    const copy = new Chess(fen);
    assert.doesNotThrow(() => copy.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] }));
  });
}

test('fixed-node search is deterministic and leaves the original game intact', async () => {
  const game = new Chess();
  game.move('e4'); game.move('e5'); game.move('Nf3');
  const originalFEN = game.fen();
  const originalPGN = game.pgn();
  const options = { mode: 'search', budgetMs: 10_000, maxNodes: 12 };
  const a = await chooseMove(game, fakeModel(), options);
  const b = await chooseMove(game, fakeModel(), options);
  assert.equal(a.move, b.move);
  assert.equal(a.nodes, b.nodes);
  assert.ok(a.nodes > 0 && a.nodes <= 12);
  assert.ok(a.inferenceCalls >= 1);
  assert.equal(a.searched, true);
  assert.ok(game.moves({ verbose: true }).some((move) => uci(move) === a.move));
  assert.equal(game.fen(), originalFEN);
  assert.equal(game.pgn(), originalPGN);
});

test('search handles a one-node budget without an illegal fallback', async () => {
  const game = new Chess();
  const result = await chooseMove(game, fakeModel(), { mode: 'search', budgetMs: 1000, maxNodes: 1 });
  assert.ok(result.nodes <= 1);
  assert.ok(game.moves({ verbose: true }).some((move) => uci(move) === result.move));
});

test('search reserves observed inference cost before starting an unaffordable evaluation', async (t) => {
  // A controlled clock models synchronous inference without fragile wall-time
  // assertions or a real busy wait. The old loop started one extra evaluation.
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);
  for (const inferenceCost of [40, 80]) {
    elapsed = 0;
    const starts = [];
    const base = fakeModel();
    const model = {
      infer(chess) {
        starts.push(elapsed);
        elapsed += inferenceCost;
        return base.infer(chess);
      },
    };
    const budgetMs = 100;
    const result = await chooseMove(new Chess(), model, { mode: 'search', budgetMs, maxNodes: 100 });
    assert.ok(starts.length >= 1, 'The initial policy inference is still required');
    assert.ok(starts.slice(1).every((start) => budgetMs - start >= inferenceCost),
      `An extra ${inferenceCost}ms evaluation started without enough time remaining`);
    assert.ok(starts.length <= Math.floor(budgetMs / inferenceCost));
    assert.equal(result.inferenceCalls, starts.length);
    assert.equal(result.stopReason, 'time-limit');
    assert.ok(new Chess().moves({ verbose: true }).some((move) => uci(move) === result.move));
  }
});

test('terminal checkmate, stalemate and historical repetition produce no move', async () => {
  const repeated = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) repeated.move(move);
  const positions = [new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'), new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), repeated];
  for (const game of positions) {
    const model = fakeModel();
    const result = await chooseMove(game, model, { mode: 'search' });
    assert.equal(result.move, null);
    assert.equal(model.calls, 0);
  }
});

test('one-time game-history setup does not inflate every later inference reserve', async (t) => {
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);
  const game = new Chess();
  const history = game.history.bind(game);
  t.mock.method(game, 'history', (...args) => { elapsed += 60; return history(...args); });
  const base = fakeModel();
  const model = { infer(chess) { elapsed += 20; return base.infer(chess); } };
  const result = await chooseMove(game, model, { mode: 'search', budgetMs: 150, maxNodes: 100 });
  assert.ok(result.inferenceCalls > 1, 'Remaining time can buy evaluations after the one-time setup');
  assert.ok(result.elapsedMs <= 150, 'The observed evaluation reserve still respects the controlled budget');
  assert.equal(result.inferenceCalls, base.calls);
  assert.equal(result.stopReason, 'time-limit');
});

test('an already aborted decision rejects without evaluating the model', async () => {
  const controller = new AbortController();
  controller.abort();
  const model = fakeModel();
  await assert.rejects(chooseMove(new Chess(), model, { mode: 'search', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(model.calls, 0);
});

test('search can be cancelled after it begins', async () => {
  const controller = new AbortController();
  const result = chooseMove(new Chess(), fakeModel(), {
    mode: 'search', budgetMs: 60_000, maxNodes: 100_000, signal: controller.signal,
    onProgress() { controller.abort(); },
  });
  await assert.rejects(result, { name: 'AbortError' });
});

test('selective mode can accept the direct move or request search using the fitted-gate contract', async () => {
  const gate = {
    trained: true, modelId: 'deterministic-test-policy',
    referenceEngineVersion: 'intuition-mcts-2',
    metrics: { testCount: 40, testPositiveRate: 0.5, brier: 0.05, baselineBrier: 0.25 },
    featureNames: FEATURE_NAMES, weights: FEATURE_NAMES.map(() => 0),
    means: FEATURE_NAMES.map(() => 0), scales: FEATURE_NAMES.map(() => 1), bias: -20,
  };
  const direct = await chooseMove(new Chess(), fakeModel('e2e4'), { mode: 'selective', gate, threshold: 0.5 });
  assert.equal(direct.mode, 'selective');
  assert.equal(direct.move, 'e2e4');
  assert.equal(direct.nodes, 0);
  assert.equal(direct.gate.triggered, false);
  const searched = await chooseMove(new Chess(), fakeModel('e2e4'), {
    mode: 'selective', gate: { ...gate, bias: 20 }, threshold: 0.5, maxNodes: 4, budgetMs: 1000,
  });
  assert.equal(searched.searched, true);
  assert.equal(searched.gate.triggered, true);
  assert.ok(searched.nodes <= 4);
});

test('an absent or incompatible controller triggers verification instead of inventing confidence', async () => {
  const wrongReferenceBudget = {
    trained: true, modelId: 'deterministic-test-policy',
    featureNames: FEATURE_NAMES, weights: FEATURE_NAMES.map(() => 0),
    means: FEATURE_NAMES.map(() => 0), scales: FEATURE_NAMES.map(() => 1), bias: -20,
    referenceSettings: { budgetMs: 250, maxNodes: 64 },
  };
  for (const gate of [null, { trained: true, modelId: 'other-weights' }, wrongReferenceBudget]) {
    const result = await chooseMove(new Chess(), fakeModel(), { mode: 'selective', gate, maxNodes: 2, budgetMs: 1000 });
    assert.equal(result.searched, true);
    assert.equal(result.gate.risk, null);
  }
});
