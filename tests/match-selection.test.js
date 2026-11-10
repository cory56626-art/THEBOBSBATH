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
