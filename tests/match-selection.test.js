import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEngine } from '../scripts/lib/match-selection.mjs';
function report(favorable, unfavorable = 0) {
  const games = [];
  for (let pair = 1; pair <= 12; pair++) for (let reverse = 0; reverse < 2; reverse++) {
    const whiteEngine = reverse ? 'improved' : 'baseline';
    const blackEngine = reverse ? 'baseline' : 'improved';
    const winner = pair <= favorable ? (reverse ? 'w' : 'b') : pair <= favorable + unfavorable ? (reverse ? 'b' : 'w') : null;
    games.push({ round: 1, pair, whiteEngine, blackEngine, winner, result: winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2', status: winner ? 'checkmate' : 'insufficient-material' });
  }
  return { settings: { plannedGames: 24 }, games };
}
test('selection requires a statistically credible paired gain, not merely more points', () => {
  assert.equal(selectEngine(report(4)).accepted, false);
  const accepted = selectEngine(report(5));
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.oneSidedP, 1 / 32);
  assert.equal(selectEngine(report(8, 4)).accepted, false);
});
test('unfinished, missing, unpaired and forfeited games cannot select the candidate', () => {
  for (const mutate of [r => r.games.pop(), r => r.games[0].result = '*', r => r.games[0].whiteEngine = 'improved', r => r.games[0].status = 'time-forfeit']) {
    const r = report(12); mutate(r);
    assert.equal(selectEngine(r).accepted, false);
  }
});

import { signFlipPValue, selectEngineSignFlip } from '../scripts/lib/match-selection.mjs';

test('the exact sign-flip test matches hand-computed probabilities', () => {
  assert.equal(signFlipPValue([]), 1);
  assert.equal(signFlipPValue([1]), 0.5);
  assert.equal(signFlipPValue([1, 1, 1]), 0.125);
  assert.equal(signFlipPValue([-1, -1]), 1);
  // |d| = 1 and 0.5: sums {1.5, 0.5, -0.5, -1.5}; observed 0.5 -> P(S >= 0.5) = 1/2.
  assert.equal(signFlipPValue([1, -0.5]), 0.5);
  assert.equal(signFlipPValue([0, 0, 1]), 0.5);
});

test('the Gato 3 selection rule requires the full schedule and significance', () => {
  const game = (pair, white, result) => ({ round: 1, pair, whiteEngine: white, blackEngine: white === 'improved' ? 'baseline' : 'improved', result, winner: result === '1-0' ? 'w' : result === '0-1' ? 'b' : null, status: result === '1/2-1/2' ? 'stalemate' : 'checkmate' });
  const games = [];
  for (let pair = 1; pair <= 60; pair++) {
    const win = pair <= 30;
    games.push(game(pair, 'improved', win ? '1-0' : '1/2-1/2'), game(pair, 'baseline', win ? '0-1' : '1/2-1/2'));
  }
  const accepted = selectEngineSignFlip({ games, settings: { plannedGames: 120 } });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.candidatePoints, 90);
  assert.ok(accepted.oneSidedP < 1e-8);
  const short = selectEngineSignFlip({ games: games.slice(0, 118), settings: { plannedGames: 120 } });
  assert.equal(short.accepted, false);
  const even = games.map((g, i) => i < 60 ? g : { ...g, result: g.whiteEngine === 'improved' ? '0-1' : '1-0', winner: g.whiteEngine === 'improved' ? 'b' : 'w' });
  assert.equal(selectEngineSignFlip({ games: even, settings: { plannedGames: 120 } }).accepted, false);
});
