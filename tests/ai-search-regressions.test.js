import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseMove, ENGINE_VERSION } from '../src/engine.js';
import { FEATURE_NAMES } from '../src/controller.js';

const uci = move => move.from + move.to + (move.promotion || '');
const CORNER_MATE = 'k7/8/1QK5/8/8/8/8/8 w - - 0 1';
const FOOLS_MATE_THREAT = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';

// Deliberately incorrect networks test whether exact chess outcomes can
// overrule a strong prior or an optimistic, but unproved, neural value.
function policyModel({ rootFen, weights, preferredByColor, optimistic = false }) {
  return {
    infer(chess) {
      const legal = chess.moves({ verbose: true });
      const root = chess.fen() === rootFen;
      const preferred = preferredByColor?.[chess.turn()];
      const specified = root && weights ? new Map(Object.entries(weights)) : null;
      const otherCount = legal.filter(move => !specified?.has(uci(move))).length;
      const assigned = specified ? [...specified.values()].reduce((a, b) => a + b, 0) : 0;
      const candidates = legal.map(move => ({
        uci: uci(move),
        probability: specified
          ? specified.get(uci(move)) ?? (1 - assigned) / otherCount
          : preferred && legal.some(m => uci(m) === preferred)
            ? uci(move) === preferred ? .99 : .01 / (legal.length - 1)
            : 1 / legal.length,
      }));
      return { candidates, value: optimistic ? chess.turn() === 'w' ? .999 : -.999 : 0, modelId: 'adversarial-policy-regression' };
    },
  };
}

function afterMove(fen, result) {
  const board = new Chess(fen);
  board.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), ...(result.move[4] ? { promotion: result.move[4] } : {}) });
  return board;
}

function lowRiskGate(overrides = {}) {
  return {
    trained: true, modelId: 'adversarial-policy-regression',
    referenceEngineVersion: ENGINE_VERSION,
    weights: FEATURE_NAMES.map(() => 0), means: FEATURE_NAMES.map(() => 0), scales: FEATURE_NAMES.map(() => 1), bias: -20,
    metrics: { testCount: 40, testPositiveRate: .5, brier: .1, baselineBrier: .25 },
    ...overrides,
  };
}

test('pure direct policy remains a genuine prediction-only baseline', async () => {
  const model = policyModel({ rootFen: CORNER_MATE, weights: { c6c7: .99 } });
  const result = await chooseMove(new Chess(CORNER_MATE), model, { mode: 'direct' });
  assert.equal(result.move, 'c6c7');
  assert.equal(result.searched, false);
  assert.equal(result.nodes, 0);
  assert.ok(afterMove(CORNER_MATE, result).isStalemate());
});

test('search finds a legal mate in one even when the policy strongly prefers stalemate', async () => {
  const model = policyModel({ rootFen: CORNER_MATE, weights: { c6c7: .99 } });
  const original = new Chess(CORNER_MATE);
  const result = await chooseMove(original, model, { mode: 'search', budgetMs: 10000, maxNodes: 64 });
  assert.equal(result.move, 'b6b7');
  assert.ok(afterMove(CORNER_MATE, result).isCheckmate());
  assert.equal(original.fen(), CORNER_MATE);
});

test('a proved immediate win outranks an optimistic neural estimate with more visits', async () => {
  const model = policyModel({ rootFen: CORNER_MATE, weights: { b6d4: .65, b6b7: .25 }, optimistic: true });
  const result = await chooseMove(new Chess(CORNER_MATE), model, { mode: 'search', budgetMs: 10000, maxNodes: 16 });
  assert.equal(result.move, 'b6b7');
  assert.ok(afterMove(CORNER_MATE, result).isCheckmate());
});

test('selective mode does not skip a known mate because the learned gate predicts low risk', async () => {
  const model = policyModel({ rootFen: CORNER_MATE, weights: { c6c7: .99 } });
  const gate = {
    trained: true, modelId: 'adversarial-policy-regression',
    weights: FEATURE_NAMES.map(() => 0), means: FEATURE_NAMES.map(() => 0), scales: FEATURE_NAMES.map(() => 1), bias: -20,
  };
  const result = await chooseMove(new Chess(CORNER_MATE), model, { mode: 'selective', gate, threshold: .5, budgetMs: 10000, maxNodes: 64 });
  assert.equal(result.move, 'b6b7');
  assert.ok(afterMove(CORNER_MATE, result).isCheckmate());
});

test('search rejects allowing an immediate forced mate even if both policy priors overlook it', async () => {
  const model = policyModel({ preferredByColor: { w: 'g2g4', b: 'a7a6' } });
  const result = await chooseMove(new Chess(FOOLS_MATE_THREAT), model, { mode: 'search', budgetMs: 10000, maxNodes: 64 });
  assert.notEqual(result.move, 'g2g4');
  const board = afterMove(FOOLS_MATE_THREAT, result);
  assert.equal(board.moves({ verbose: true }).some(move => move.san.endsWith('#')), false);
});

test('Black also takes an immediate forced mate over a preferred quiet move', async () => {
  const game = new Chess(FOOLS_MATE_THREAT);
  game.move('g4');
  const fen = game.fen();
  const model = policyModel({ rootFen: fen, weights: { a7a6: .99 } });
  const result = await chooseMove(game, model, { mode: 'search', budgetMs: 10000, maxNodes: 64 });
  assert.equal(result.move, 'd8h4');
  assert.ok(afterMove(fen, result).isCheckmate());
});

for (const [name, metrics] of [
  ['missing validation', undefined],
  ['missing held-out count', { testPositiveRate: .5, brier: .1, baselineBrier: .25 }],
  ['nonfinite held-out count', { testCount: NaN, testPositiveRate: .5, brier: .1, baselineBrier: .25 }],
  ['fractional held-out count', { testCount: 30.5, testPositiveRate: .5, brier: .1, baselineBrier: .25 }],
  ['too few held-out positions', { testCount: 12, testPositiveRate: .5, brier: .1, baselineBrier: .25 }],
  ['only unchanged held-out moves', { testCount: 40, testPositiveRate: 0, brier: .1, baselineBrier: .25 }],
  ['only changed held-out moves', { testCount: 40, testPositiveRate: 1, brier: .1, baselineBrier: .25 }],
  ['worse error than the constant predictor', { testCount: 40, testPositiveRate: .5, brier: .3, baselineBrier: .25 }],
  ['equal error to the constant predictor', { testCount: 40, testPositiveRate: .5, brier: .25, baselineBrier: .25 }],
  ['an impossible negative Brier error', { testCount: 40, testPositiveRate: .5, brier: -.1, baselineBrier: .25 }],
  ['an impossible constant-predictor Brier error', { testCount: 40, testPositiveRate: .5, brier: .1, baselineBrier: 1.1 }],
]) {
  test(`selective controller cannot skip verification with ${name}`, async () => {
    const model = policyModel({ preferredByColor: { w: 'e2e4' } });
    const result = await chooseMove(new Chess(), model, { mode: 'selective', gate: lowRiskGate({ metrics }), budgetMs: 10000, maxNodes: 8 });
    assert.equal(result.searched, true);
    assert.equal(result.gate.triggered, true);
  });
}

for (const referenceEngineVersion of [undefined, 'intuition-mcts-1', 'intuition-mcts-2']) {
  test(`selective controller cannot reuse evidence from ${referenceEngineVersion || 'an unidentified reference engine'}`, async () => {
    const model = policyModel({ preferredByColor: { w: 'e2e4' } });
    const result = await chooseMove(new Chess(), model, { mode: 'selective', gate: lowRiskGate({ referenceEngineVersion }), budgetMs: 10000, maxNodes: 8 });
    assert.equal(result.searched, true);
    assert.equal(result.gate.triggered, true);
  });
}

test('a compatible controller with enough mixed-class held-out evidence and better Brier may accept a safe policy move', async () => {
  const model = policyModel({ preferredByColor: { w: 'e2e4' } });
  const result = await chooseMove(new Chess(), model, { mode: 'selective', gate: lowRiskGate(), budgetMs: 10000, maxNodes: 8 });
  assert.equal(result.move, 'e2e4');
  assert.equal(result.searched, false);
  assert.equal(result.gate.triggered, false);
  assert.equal(result.nodes, 0);
});

test('even a validated low-risk controller cannot approve an immediate opponent checkmate', async () => {
  const model = policyModel({ preferredByColor: { w: 'g2g4', b: 'a7a6' } });
  const result = await chooseMove(new Chess(FOOLS_MATE_THREAT), model, { mode: 'selective', gate: lowRiskGate(), threshold: .5, budgetMs: 10000, maxNodes: 64 });
  assert.notEqual(result.move, 'g2g4');
  assert.equal(result.gate.triggered, true);
  assert.equal(afterMove(FOOLS_MATE_THREAT, result).moves({ verbose: true }).some(move => move.san.endsWith('#')), false);
});

test('a tiny budget cannot replace one immediate mate blunder with another unchecked move', async () => {
  const fen = '6k1/8/3b4/8/8/7q/P3PPPP/3Q1RK1 w - - 0 1';
  const model = policyModel({ rootFen: fen, weights: { a2a3: .5, a2a4: .49 } });
  const result = await chooseMove(new Chess(fen), model, { mode: 'search', budgetMs: 10000, maxNodes: 2 });
  const after = afterMove(fen, result);
  assert.equal(after.moves({ verbose: true }).some(move => move.san.endsWith('#')), false,
    `The final chosen move ${result.san} still permits an immediate checkmate`);
  assert.ok(result.nodes <= 2, 'Exact rule probes must not consume additional search nodes');
  assert.ok(result.inferenceCalls <= 2, 'The safety fallback must not add neural evaluations');
  assert.ok(result.tacticalProbes >= 1, 'The final move receives exact checking');
});

test('terminal values use the side-to-move perspective: checkmate is a loss, stalemate is a draw', async () => {
  const model = policyModel({});
  const mate = await chooseMove(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'), model, { mode: 'search' });
  const draw = await chooseMove(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), model, { mode: 'search' });
  assert.equal(mate.move, null);
  assert.equal(mate.value, -1);
  assert.equal(draw.move, null);
  assert.equal(draw.value, 0);
});


test('an exhausted time budget still screens every replacement for immediate mate', async (t) => {
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);
  const fen = '6k1/8/3b4/8/8/7q/P3PPPP/3Q1RK1 w - - 0 1';
  const base = policyModel({ rootFen: fen, weights: { a2a3: .5, a2a4: .49 } });
  const model = { infer(board) { elapsed += 10; return base.infer(board); } };
  const result = await chooseMove(new Chess(fen), model, { mode: 'search', budgetMs: 1, maxNodes: 1 });
  assert.equal(result.nodes, 0);
  assert.equal(result.inferenceCalls, 1);
  assert.ok(result.tacticalProbes > 1);
  assert.equal(afterMove(fen, result).moves().some(move => move.endsWith('#')), false);
});
