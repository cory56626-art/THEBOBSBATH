import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEngine } from '../scripts/lib/match-selection.mjs';
function report(favorable, unfavorable = 0, pairCount = 12) {
  const games = [];
  for (let pair = 1; pair <= pairCount; pair++) for (let reverse = 0; reverse < 2; reverse++) {
    const whiteEngine = reverse ? 'improved' : 'baseline';
    const blackEngine = reverse ? 'baseline' : 'improved';
    const winner = pair <= favorable ? (reverse ? 'w' : 'b') : pair <= favorable + unfavorable ? (reverse ? 'b' : 'w') : null;
    games.push({ round: 1, pair, whiteEngine, blackEngine, winner, result: winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2', status: winner ? 'checkmate' : 'insufficient-material' });
  }
  return { settings: { plannedGames: pairCount * 2 }, games };
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


test('48-game selection needs its predeclared schedule and paired evidence', () => {
  const strong = report(9, 1, 24);
  assert.equal(selectEngine(strong).accepted, false); // The default remains 24.
  const result = selectEngine(strong, { expectedGames: 48 });
  assert.equal(result.accepted, true);
  assert.equal(result.expectedGames, 48);
  assert.equal(result.favorable, 9);
  assert.equal(result.unfavorable, 1);
  assert.ok(Math.abs(result.oneSidedP - 11 / 1024) < 1e-12);
  assert.match(result.method, /All 48 games/);
  assert.equal(selectEngine(report(8, 4, 24), { expectedGames: 48 }).accepted, false);
  for (const mutate of [r => r.games.pop(), r => r.games[0].result = '*', r => r.games[0].blackEngine = r.games[1].blackEngine, r => r.games[0].status = 'time-forfeit']) {
    const invalid = structuredClone(strong); mutate(invalid);
    assert.equal(selectEngine(invalid, { expectedGames: 48 }).accepted, false);
  }
  for (const expectedGames of [0, 3, 47, NaN]) assert.throws(() => selectEngine(strong, { expectedGames }), /positive even/);
});
