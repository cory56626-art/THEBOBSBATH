/** Measured identity; search caps are a test scope, not assigned difficulty ratings. */
export const BOT_PROFILE = Object.freeze({
  id: 'gato-2', name: 'Gato 2', engineVersion: 'intuition-hybrid-5',
  rating: Object.freeze({
    // 24/32 points against Stockfish 19 nominal settings 1720–2320. The
    // conservative interval has no finite upper bound (upper: null).
    estimate: 2278, lower: 1933, upper: null, games: 32,
    scale: 'Stockfish 19 nominal UCI_Elo', provisional: true,
    mode: 'search', budgetMs: 150, maxNodes: 1000000,
  }),
  previous: Object.freeze({
    id: 'gato-1', name: 'Gato 1', engineVersion: 'intuition-hybrid-3',
    estimate: 1650, lower: 1289, upper: 2047, games: 32, budgetMs: 150, maxNodes: 32768,
    headToHead: 'Gato 2 won 24 of 24 color-reversed games against Gato 1',
  }),
});

/** Interval text that never invents a finite endpoint the data did not give. */
export function formatInterval({ lower, upper }) {
  if (lower === null && upper === null) return 'unbounded';
  if (upper === null) return `${lower} – unbounded`;
  if (lower === null) return `unbounded – ${upper}`;
  return `${lower}–${upper}`;
}
