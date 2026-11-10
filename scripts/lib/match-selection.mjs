/** Fixed-opening paired sign test, declared in docs/V4-PREDECLARATION.md. */
export function selectEngine(report) {
  const games = report.games;
  const planned = report.settings.plannedGames;
  const pairs = new Map();
  for (const game of games) {
    const key = `${game.round}:${game.pair}`;
    const pair = pairs.get(key) || [];
    pair.push(game); pairs.set(key, pair);
  }
  let favorable = 0, unfavorable = 0, tied = 0, candidatePoints = 0;
  const complete = planned === 24 && games.length === planned && [...pairs.values()].every(pair => pair.length === 2 && pair[0].whiteEngine !== pair[1].whiteEngine) && pairs.size === 12;
  const unfinished = games.filter(game => game.result === '*').length;
  const forfeits = games.filter(game => /forfeit/.test(game.status)).length;
  for (const pair of pairs.values()) {
    if (pair.length !== 2 || pair.some(game => game.result === '*')) continue;
    let points = 0;
    for (const game of pair) {
      if (game.result === '1/2-1/2') points += .5;
      else if (game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === 'improved') points++;
    }
    candidatePoints += points;
    if (points > 1) favorable++; else if (points < 1) unfavorable++; else tied++;
  }
  const n = favorable + unfavorable;
  let mass = 2 ** -n, p = 0;
  for (let k = 0; k <= n; k++) {
    if (k >= favorable) p += mass;
    mass *= (n - k) / (k + 1);
  }
  const oneSidedP = Math.min(1, p);
  const accepted = complete && !unfinished && !forfeits && candidatePoints > 12 && oneSidedP <= .05;
  return { selected: accepted ? 'improved' : 'baseline', accepted, complete, planned, games: games.length, unfinished, forfeits, candidatePoints, favorable, unfavorable, tied, oneSidedP, threshold: .05, method: 'Exact one-sided paired sign test; ties removed. All 24 games and zero forfeits required.', caveat: 'Fixed-opening development comparison, not an Elo estimate or proof of broad strength.' };
}
