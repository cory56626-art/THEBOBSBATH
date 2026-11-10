/** Nominal Stockfish-scale inference; no conversion to human/online ratings. */
export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));
const average = values => values.reduce((a, b) => a + b, 0) / values.length;

/** Invert the mean logistic expected score against the supplied opponents. */
export function ratingForScore(score, opponents) {
  if (!opponents.length || opponents.some(value => !Number.isFinite(value))) throw new Error('Finite opponent ratings are required');
  if (!(score >= 0 && score <= 1)) throw new Error('Score must lie in [0, 1]');
  if (score === 0) return -Infinity;
  if (score === 1) return Infinity;
  let low = Math.min(...opponents) - 20000, high = Math.max(...opponents) + 20000;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (average(opponents.map(opponent => expectedScore(mid, opponent))) < score) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function aiScore(game, engine = 'intuition') {
  if (game.result === '*') return null;
  if (game.result === '1/2-1/2') return 0.5;
  if (!['1-0', '0-1'].includes(game.result)) throw new Error(`Unknown game result ${game.result}`);
  const winnerColor = game.result === '1-0' ? 'w' : 'b';
  if (game.winner !== winnerColor) throw new Error('Result/winner mismatch');
  return game[winnerColor === 'w' ? 'whiteEngine' : 'blackEngine'] === engine ? 1 : 0;
}

const endpoint = value => Number.isFinite(value) ? value : null;
/**
 * Draws contribute half a point. The score-equation solution equals the MLE
 * for a fractional Bernoulli likelihood. Uncertainty uses Hoeffding on entire
 * color-reversed pair means, avoiding an independent-games assumption.
 */
export function estimateRating(games, { plannedGames, confidence = 0.95, budgetMs = 150 } = {}) {
  if (!Number.isInteger(plannedGames) || plannedGames < 2 || plannedGames % 2) throw new Error('An even plannedGames count is required');
  if (!(confidence > 0 && confidence < 1)) throw new Error('Confidence must lie in (0, 1)');
  const scored = games.filter(game => aiScore(game) !== null);
  const points = scored.reduce((sum, game) => sum + aiScore(game), 0);
  const base = {
    scale: `Stockfish 19 UCI_Elo nominal setting at ${budgetMs} ms per move`,
    plannedGames, games: games.length, scored: scored.length, unfinished: games.length - scored.length,
    points, scoreFraction: scored.length ? points / scored.length : null,
    pointEstimate: null, interval: null,
    method: 'Logistic expected-score fit; conservative Hoeffding interval over independent color-reversed pair means',
    assumptions: [
      'Each color-reversed opening pair is an independent sampling unit; dependence within a pair is unrestricted.',
      'Mean expected score follows the Elo logistic curve against the nominal UCI_Elo settings, averaged across the fixed opening design.',
      'The interval covers sampling uncertainty under those assumptions, not Stockfish calibration error, opening selection bias, or hardware/time-control transfer.',
    ],
  };
  if (games.length !== plannedGames || scored.length !== plannedGames) return { ...base, status: 'withheld', reason: 'The complete predeclared schedule must finish with no unfinished games before publishing a main point estimate.' };
  const pairs = new Map();
  for (const game of games) {
    if (!Number.isFinite(game.elo) || !Number.isInteger(game.pair) || !Number.isInteger(game.round)) throw new Error('Rating games require elo, pair, and round identifiers');
    const key = `${game.elo}/${game.round}/${game.pair}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(game);
  }
  for (const pair of pairs.values()) {
    if (pair.length !== 2 || pair[0].whiteEngine === pair[1].whiteEngine || pair[0].blackEngine === pair[1].blackEngine) throw new Error('Every rating pair must contain exactly two games with reversed colors');
  }
  const pairCount = pairs.size;
  const score = points / scored.length;
  const opponents = scored.map(game => game.elo);
  const rating = ratingForScore(score, opponents);
  const radius = Math.sqrt(Math.log(2 / (1 - confidence)) / (2 * pairCount));
  const lowerScore = Math.max(0, score - radius), upperScore = Math.min(1, score + radius);
  const lower = ratingForScore(lowerScore, opponents), upper = ratingForScore(upperScore, opponents);
  return {
    ...base, status: Number.isFinite(rating) ? 'provisional' : 'bound-only',
    reason: Number.isFinite(rating) ? null : 'An all-win or all-loss schedule has no finite logistic point estimate.',
    pointEstimate: endpoint(rating),
    pairCount,
    interval: { confidence, lower: endpoint(lower), upper: endpoint(upper), lowerUnbounded: lower === -Infinity, upperUnbounded: upper === Infinity, scoreRadius: radius, scoreLower: lowerScore, scoreUpper: upperScore },
  };
}
