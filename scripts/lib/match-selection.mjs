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

/**
 * Gato 3 rule (declared in docs/GATO3-PREDECLARATION.md): exact one-sided
 * sign-flip test on color-reversed pair scores. Each pair contributes
 * d = candidate points - 1 in {-1, -0.5, 0, 0.5, 1}; under equal strength
 * each d is symmetric about zero, so S = sum(d) is compared with all 2^n
 * sign assignments of |d|. Unlike the sign test it keeps half-point margins.
 */
export function signFlipPValue(differences) {
  const halves = differences.map(d => Math.round(Math.abs(d) * 2)).filter(Boolean);
  const observed = Math.round(differences.reduce((sum, d) => sum + d, 0) * 2);
  const total = halves.reduce((a, b) => a + b, 0);
  let distribution = new Map([[0, 1]]);
  for (const h of halves) {
    const next = new Map();
    for (const [sum, weight] of distribution) {
      next.set(sum + h, (next.get(sum + h) || 0) + weight / 2);
      next.set(sum - h, (next.get(sum - h) || 0) + weight / 2);
    }
    distribution = next;
  }
  let p = 0;
  for (const [sum, weight] of distribution) if (sum >= observed) p += weight;
  void total;
  return Math.min(1, p);
}

export function selectEngineSignFlip(report, { plannedGames = 120, alpha = 0.05 } = {}) {
  const games = report.games;
  const pairs = new Map();
  for (const game of games) {
    const key = `${game.round}:${game.pair}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(game);
  }
  const complete = games.length === plannedGames && pairs.size === plannedGames / 2 && [...pairs.values()].every(pair => pair.length === 2 && pair[0].whiteEngine !== pair[1].whiteEngine);
  const unfinished = games.filter(game => game.result === '*').length;
  const forfeits = games.filter(game => /forfeit/.test(game.status)).length;
  const differences = [];
  let candidatePoints = 0, favorable = 0, unfavorable = 0, tied = 0;
  for (const pair of pairs.values()) {
    if (pair.length !== 2 || pair.some(game => game.result === '*')) continue;
    let points = 0;
    for (const game of pair) {
      if (game.result === '1/2-1/2') points += .5;
      else if (game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === 'improved') points++;
    }
    candidatePoints += points;
    differences.push(points - 1);
    if (points > 1) favorable++; else if (points < 1) unfavorable++; else tied++;
  }
  const oneSidedP = signFlipPValue(differences);
  const accepted = complete && !unfinished && !forfeits && candidatePoints > plannedGames / 2 && oneSidedP <= alpha;
  return { selected: accepted ? 'improved' : 'baseline', accepted, complete, planned: plannedGames, games: games.length, unfinished, forfeits, candidatePoints, scoreFraction: games.length ? candidatePoints / games.length : null, favorable, unfavorable, tied, oneSidedP, threshold: alpha, method: 'Exact one-sided sign-flip permutation test on color-reversed pair score differences; all planned games and zero forfeits required.', caveat: 'Fixed-opening engine-versus-engine comparison, not an Elo estimate against other opponents.' };
}
