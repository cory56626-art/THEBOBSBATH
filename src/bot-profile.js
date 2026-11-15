/**
 * Every released Gato, newest first. Ratings are measured identities: each
 * applies only to that bot's own rated configuration. Engines live in the
 * worker (src/bots/engines.js); this module stays data-only for the page.
 */
const GATO_3 = Object.freeze({
  id: 'gato-3', name: 'Gato 3', engineVersion: 'intuition-hybrid-6', generation: 3,
  summary: 'Gato 2’s search with a Texel-tuned evaluation and in-game search memory.',
  ratingNote: '96 completed games against Stockfish 19’s nominal Elo settings 2200–2800: 32 points (27 wins, 10 draws, 59 losses). Gato 3 scored 85.5 of 120 games against Gato 2 in their color-reversed match.',
  report: 'docs/AI-STRENGTH-GATO3.md',
  rating: Object.freeze({
    estimate: 2334, lower: 2087, upper: 2528, games: 96,
    scale: 'Stockfish 19 nominal UCI_Elo', provisional: true,
    mode: 'search', budgetMs: 150, maxNodes: 1000000,
  }),
});
const GATO_2 = Object.freeze({
  id: 'gato-2', name: 'Gato 2', engineVersion: 'intuition-hybrid-5', generation: 2,
  summary: 'Fast PVS search on its own board. Beat Gato 1 24–0.',
  ratingNote: '32 completed games against Stockfish 19’s nominal Elo settings 1720–2320: 24 points. The conservative interval has no finite upper bound at this sample size. Gato 2 won all 24 games of its color-reversed match against Gato 1.',
  report: 'docs/AI-STRENGTH-GATO2.md',
  rating: Object.freeze({
    // 24/32 points against Stockfish 19 nominal settings 1720–2320. The
    // conservative interval has no finite upper bound (upper: null).
    estimate: 2278, lower: 1933, upper: null, games: 32,
    scale: 'Stockfish 19 nominal UCI_Elo', provisional: true,
    mode: 'search', budgetMs: 150, maxNodes: 1000000,
  }),
});
const GATO_1 = Object.freeze({
  id: 'gato-1', name: 'Gato 1', engineVersion: 'intuition-hybrid-3', generation: 1,
  summary: 'Neural move ordering with chess.js tactical search.',
  ratingNote: '32 completed games against Stockfish 19’s nominal Elo settings 1320–1920: 16 wins, 2 draws, 14 losses (17 points). Gato 1, our first bot, measured ≈1650.',
  report: 'docs/AI-STRENGTH-V4.md',
  rating: Object.freeze({
    estimate: 1650, lower: 1289, upper: 2047, games: 32,
    scale: 'Stockfish 19 nominal UCI_Elo', provisional: true,
    mode: 'search', budgetMs: 150, maxNodes: 32768,
  }),
});

export const BOTS = Object.freeze([GATO_3, GATO_2, GATO_1]);
/** The newest released bot: the site's default opponent. */
export const BOT_PROFILE = Object.freeze({
  ...GATO_3,
  previous: Object.freeze({ ...GATO_2, estimate: GATO_2.rating.estimate, lower: GATO_2.rating.lower, upper: GATO_2.rating.upper, headToHead: 'Gato 3 scored 85.5 of 120 color-reversed games against Gato 2' }),
});
export const botById = id => BOTS.find(bot => bot.id === id) || BOTS[0];
const ORDINALS = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH'];
export const generationLabel = bot => `OUR ${ORDINALS[bot.generation] || `#${bot.generation}`} BOT`;

/** Interval text that never invents a finite endpoint the data did not give. */
export function formatInterval({ lower, upper }) {
  if (lower === null && upper === null) return 'unbounded';
  if (upper === null) return `${lower} – unbounded`;
  if (lower === null) return `unbounded – ${upper}`;
  return `${lower}–${upper}`;
}
