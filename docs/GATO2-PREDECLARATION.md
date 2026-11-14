# Gato 2 selection and rating protocol (declared before official games)

This file is committed before any official Gato 2 game is played. The games
listed under "Development record" were used to build the engine and choose
the ladder's placement. They are not part of the official result.

## Frozen candidate

The Gato 2 candidate is the complete Git source graph at commit `c50e6ed`
(`src/engine.js`, `src/gato-search.js`, `src/controller.js`). Both official
runs load that revision with `--candidate-revision` / `--engine-revision`, so
later interface or documentation edits cannot change the engine under test.
The neural weights are byte-identical to Gato 1. `src/gato-search.js` uses an
evaluation function proven equal to Gato 1's on random positions; the change is
the search core: an original 0x88 board with make/unmake, PVS, aspiration
windows, null-move pruning, late-move reductions, futility and SEE pruning,
check extensions and history/killer/counter-move ordering.

Gato 2's rated configuration is **Search · 150 ms per move · 1,000,000
tactical positions**. The position cap is high enough that the 150 ms time
limit binds in practice (development games averaged about 33,000 positions per
move). Gato 1 remains rated at its own 150 ms / 32,768 configuration, which
was also time-bound.

## Step 1: selection match against immutable Gato 1

Rules are unchanged from the [v4 predeclaration](V4-PREDECLARATION.md):

- Baseline: Gato 1, the complete Git source graph at `b1d5002`, at 150 ms and
  32,768 positions. Candidate: `c50e6ed` at 150 ms and 1,000,000 positions.
- Exactly 24 games: the twelve `strength24` openings, colors reversed within
  each pair, fixed order, one round, 400 played plies maximum, equal 31-second
  clocks. Run sequentially with no competing benchmark, test or build.
- Selection requires all 24 games finished, no forfeits, candidate score
  above 50%, and a one-sided exact paired sign test p ≤ 0.05 over opening
  pairs (ties removed). If the threshold fails, Gato 1 remains the selected
  engine and is **not** renamed. No extra games or retuning after results.

```sh
node scripts/match-ai.mjs --baseline-revision=b1d5002:src/engine.js \
  --candidate-revision=c50e6ed:src/engine.js --opening-set=strength24 \
  --budget=150 --max-nodes=32768 --candidate-max-nodes=1000000 --max-plies=400 \
  --output=docs/ai-gato2-vs-gato1.json --pgn=docs/ai-gato2-vs-gato1.pgn
node scripts/select-engine.mjs docs/ai-gato2-vs-gato1.json docs/ai-gato2-selection.json
```

## Step 2: Stockfish nominal-Elo ladder (only if selected)

Same runner, scoring, clocks, Stockfish options, adjudication rules and
statistics as the [Elo methodology](ELO-METHODOLOGY.md), with these declared
differences:

- **Opponent settings 1720, 1920, 2120 and 2320** (eight games each, 32
  games, center 2020). Gato 1's ladder (1320–1920) would saturate for an
  engine that development probes placed near 2000; the ladder must surround
  the engine's level for the logistic fit to be informative.
- AI cap **1,000,000** tactical positions (the rated configuration above).
- Opponent: Stockfish 19 built from the official `sf_19` tag (commit
  `edb0d9db6731067ec50ce619ff372b463bc4dd5d`) with `make profile-build
  ARCH=x86-64-avx2` and its default network `nn-1a298aa575a0.nnue`. GitHub
  release downloads were unavailable in this environment, so the executable
  hash differs from Gato 1's release binary. The runner records the hash and
  still requires the engine to identify as Stockfish 19.

```sh
node scripts/rate-ai.mjs --stockfish=/path/to/stockfish19 \
  --engine-revision=c50e6ed:src/engine.js --elos=1720,1920,2120,2320 \
  --max-nodes=1000000 \
  --output=docs/ai-gato2-provisional-elo.json --pgn=docs/ai-gato2-provisional-elo.pgn
node scripts/validate-games.mjs docs/ai-gato2-provisional-elo.json
```

Any unfinished game or incomplete schedule withholds the point estimate.
The result is published with its full interval and the methodology's caveats.
It is a nominal Stockfish-scale estimate at 150 ms per move, not a FIDE,
Lichess or Chess.com rating.

## Naming rule

If Gato 2 is selected and the ladder completes, the site's bot becomes
**Gato 2** and displays the measured estimate for its rated configuration.
Gato 1's rating stays attached to Gato 1 in the history and documents.

## Development record (not official evidence)

All development games used the same harnesses at 150 ms per move. They are
retained in [`docs/gato2-development/`](gato2-development/) as disclosed
tuning data, never mixed into the official results.

| Run | Purpose | Result |
| --- | --- | --- |
| `dev-vs-gato1` (8 games, `pilot8`) | First check of the new core against Gato 1 | Core 7 wins, 1 draw, 0 losses |
| `probe-stockfish` (16 games at nominal 2000 and 2400) | Choose ladder placement | 4–0–4 at 2000; 0–1–7 at 2400; fit ≈1985 |
| `ab-king-safety` (24 games, `strength24`) | King-zone attack term, quadratic, cap 450 | Rejected: 7.5 / 24 vs the core |
| `ab-king-safety-mild` (24 games, `strength24`) | Same term, adjacent squares only, cap 200, queen required | Rejected: 11.5 / 24 vs the core |

Both rejected variants were working-tree edits of `src/gato-search.js`;
their reports record the source hashes. The frozen candidate `c50e6ed`
contains neither.
