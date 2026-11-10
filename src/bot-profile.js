/** Measured identity; search caps are a test scope, not assigned difficulty ratings. */
export const BOT_PROFILE = Object.freeze({
  id: 'gato-1', name: 'Gato 1', engineVersion: 'intuition-hybrid-3',
  rating: Object.freeze({
    estimate: 1650, lower: 1289, upper: 2047, games: 32,
    scale: 'Stockfish 19 nominal UCI_Elo', provisional: true,
    mode: 'search', budgetMs: 150, maxNodes: 32768,
  }),
});
