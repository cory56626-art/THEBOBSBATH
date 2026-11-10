# V4 search selection protocol (declared before games)

Baseline is the complete Git source graph at `b1d5002`, never an old entry file with live dependencies. The candidate changes search only; `src/position-evaluation.js` and model weights stay byte-identical. Candidate source and dependencies will be frozen in Git before the match and fingerprinted in the report.

Run exactly 24 games: the twelve `strength24` openings, each with colors reversed; fixed order, one round. Both engines get 150 ms per move, 32,768 tactical positions including quiescence, 400 played plies maximum, and equal 31-second clocks (200 moves times 150 ms plus a 1-second reserve). Run sequentially with no competing benchmark, browser test, or build. No evaluation adjudication. Truncations stay unscored. Retain every game and PGN.

Selection requires all 24 games finished, no time/illegal-move forfeits, candidate score above 50%, and a one-sided exact paired sign test p <= 0.05. For each opening pair, candidate score > 1 is favorable, < 1 unfavorable, and = 1 tied; remove ties and test favorable pairs against Binomial(n, 0.5). This is a small, fixed-opening development test, not proof of broad strength or an Elo increase. If the threshold fails, keep v3 for the rating ladder. Do not add games, retune the candidate, or pick favorable subsets after seeing results.

The selected engine then plays the separately specified 32-game Stockfish nominal-Elo ladder. Any unfinished or incomplete ladder withholds its main point estimate.

## Environment recovery

This environment started without either previous checkout. GitHub preserved v3 and its committed reports, but not the uncommitted full-Stockfish report/PGN, Elo work, or in-progress search iteration. The earlier full-Stockfish result (0 wins, 0 draws, 8 losses) is user-reported; its missing game records cannot be reconstructed. A fresh full-Stockfish rerun, if made, is a new measurement saved separately.

Remote main at recovery was `d3657b9`, seven commits after v3, and serves a different application. Chess is developed on `ai/rating-benchmark`; publication must respect the user's choice about the newer app.
