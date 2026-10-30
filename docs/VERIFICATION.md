# First experiment — verification and pilot

Verified on 2026-10-30. This is a compact pretrained-model experiment, not evidence of Stockfish-level strength.

## User flow

GitHub Pages serves the static application. A browser action sends a position and its move history to a Web Worker. The worker loads SHA-256-verified local model weights, produces legal policy predictions, optionally runs the same model inside MCTS, and returns the decision and telemetry. The board, comparisons, and downloadable reports render that response. There is no backend or remote inference API.

| Boundary | Evidence |
| --- | --- |
| Model integrity and inference | Weight fingerprint verified; eight upstream PyTorch reference positions match within numerical tolerance. |
| Chess rules and history | Castling, en passant, underpromotion, mate, stalemate, historical repetition and serialization checks pass. |
| Decision modes | Direct mode performs one inference and zero tree visits; budgeted search and learned-gate acceptance/fallback paths are tested. |
| Timing and cancellation | Deterministic-clock regression prevents starting an obviously unaffordable extra evaluation; cancellation reaches the worker. Neural calls remain synchronous, so the cap is soft. |
| Browser integration | Actual pretrained inference, human play, New game/reset and startup flows, undo/flip, FEN/PGN, underpromotion, repetition, all-mode comparison, JSON/CSV downloads, suite execution/cancellation, controller fitting, mobile sizing and keyboard navigation pass. |
| Build and publication | Vite production build uses the repository base path; GitHub Actions requires unit and production-browser checks before deployment. |

Local result: **40 unit tests, 12 production-browser tests, and the production build passed**. Screenshots and traces are test artifacts, not bundled application assets.

## New game regression verification

The original six browser checks never clicked New game. Two newly added reset flows were first run against the previous production build and both failed because the button gave no visible confirmation. The revised application and production build now pass six additional real-model browser checks:

- Restarting an untouched board confirms the action, opens Play, and allows a legal first move and engine reply.
- Restarting after play clears history, selection/highlights, the previous decision, and all four telemetry fields before fresh play.
- Playing Black preserves the selected side, mode, and board orientation, with exactly one White opening move in the new game's PGN.
- Restarting during a two-second search cancels the old job; after its original budget has elapsed, no old move has appeared on the new board.
- Restarting Watch mode resumes fresh autoplay and leaves Pause watching functional.
- With the actual weight download deliberately delayed, New game and a human first move work before the model is ready; releasing the download produces exactly one legal engine reply.

These checks run against the generated production assets, including the real worker and pretrained weights. The complete 12-case browser run passed in 51.1 seconds locally after the reset fix.

## Actual local pilot

Reproduce with `node scripts/run-pilot.mjs`. Raw records include hardware, model fingerprint, settings, decisions, and per-move work. Times below are one noisy Node.js pilot, not a portable device benchmark.

| Mode | Mean time on 10 positions | Explicit expected-outcome matches |
| --- | ---: | ---: |
| Direct | 17.5 ms | 5 / 6 |
| Always search | 351.3 ms | 6 / 6 |
| Selective | 111.0 ms | 5 / 6 |

The six labelled checks include terminal-position recognition. Four other positions have no claimed ground-truth move. Selective mode searched two of the ten positions. On this small suite it saved time relative to always-search but did not preserve all of its expected-outcome matches.

Six color-reversed pilot games were capped after 40 played plies. **All six were unfinished and unscored**, with no time forfeits after the reserve correction. They establish that the match harness runs; they do not rank the modes by playing strength.

- [Position records](pilot-position-results.json)
- [Paired-game records, PGNs and telemetry](pilot-match-results.json)
- [Controller training provenance](default-calibration.json)

## Controller limitations

The shipped controller uses 40 actual labelled positions from ten generated game groups, with 28 training positions and 12 held-out positions. There are only three reference-move changes in the complete sample, including one in the holdout. The group split is chosen for class availability before fitting; its metric is not optimized to select the split.

Held-out Brier error is approximately **0.123**, worse than the constant predictor's **0.077**. The UI reports this limitation. The target is reference-search disagreement, not a proven blunder or a guaranteed improvement. A stronger experiment needs more varied positions, more positive examples, independent move-quality assessment, and sufficiently long completed matches.

The initial pilot exposed consistent time-cap overruns from beginning another synchronous neural evaluation too late. The engine now reserves observed inference/iteration cost, and a deterministic regression test covers that behavior. Background pauses and variable inference cost can still cause an overrun; paired clocks always deduct actual measured time.
