# V4 search experiment and provisional rating

**Selection: keep v3.** V4 scored 15.5–8.5 points, but failed the predeclared paired significance threshold. Its source and results remain available as a promising experiment. The rating ladder will measure v3.

## Candidate and baseline

The candidate is frozen at commit `a7bf070`. Its comparison baseline is deployed v3 at `b1d5002`, loaded with its complete recursive Git source graph. Loading an old engine entry file against current search dependencies would invalidate the comparison; the snapshot loader and report fingerprints guard against that mistake. `/workspace/bobs-bath` is the separate immutable v3 checkout.

The candidate keeps `src/position-evaluation.js` and the pretrained neural weights byte-identical to v3. The network still supplies root move ordering, while the independent tactical search chooses moves. This experiment tests search changes, without a newly trained network or evaluation retuning.

The candidate adds:

- Principal Variation Search: later moves use a narrow search window and receive a full-window re-search when needed.
- Aspiration windows around the last completed iteration, widened after a failed window.
- Conservative late-move reductions for late quiet non-pawn moves at non-principal nodes, excluding checks, promotions, captures, killer moves and mate windows. Moves that improve alpha are searched again at full depth.
- A fresh search without reductions or selectively derived transposition bounds before accepting either winning or losing mate scores.
- A separate quiescence transposition cache, capture ordering, and safe repetition-context resets after irreversible pawn moves or captures. Undo restores the earlier context.

The quiescence response to the observed node bottleneck is caching and ordering. The candidate does not prune captures heuristically; every legal check evasion, capture and promotion remains searchable. Hard node/time checks, cancellation, repetition and fifty-move handling, and restored caller history remain required. These mechanisms may improve efficiency; full-game results determine whether the candidate is selected.

## Fixed selection match

The [predeclaration](V4-PREDECLARATION.md) was recorded before games. The match consists of exactly 24 games from twelve fixed `strength24` openings, each played with colors reversed, one round in fixed order. Each side receives 150 ms per decision, 32,768 tactical positions including quiescence, a 400-played-ply maximum and an equal 31-second game clock. Benchmarks run sequentially without competing tests or builds. Actual decision wall time is deducted from clocks.

Only rules-terminal outcomes and explicit competition forfeits score. Move-cap truncations stay unfinished and unscored. PGNs and move histories preserve every game. Source/dependency, model, harness, binary where applicable, and environment fingerprints accompany the measurements.

Selection requires all 24 games finished, no time or illegal-move forfeits, a candidate score above 50%, and a one-sided exact paired sign-test p-value at most 0.05. For each opening pair, a candidate score above 1 is favorable, below 1 unfavorable, and exactly 1 tied; ties are removed before the binomial sign test. If this fixed threshold fails, v3 remains the final engine for the rating ladder. No extra games or favorable subsets can replace this declared decision rule.

**Comparison result: all 24 games completed; no forfeits or truncations.**

| Engine | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| V4 candidate | 13 | 5 | 6 | 0 | 15.5 |
| Immutable v3 | 6 | 5 | 13 | 0 | 8.5 |

**Opening-pair sign test:** 5 favorable pairs, 1 unfavorable, 6 tied; one-sided exact p = 0.109375. This exceeds 0.05, so v3 remains selected despite the higher raw v4 score. The threshold is not relaxed after seeing results. This small fixed-opening match is development evidence; it cannot establish broad superiority or an Elo gain by itself.

[Complete match](ai-v4-v3-match.json) · [PGN](ai-v4-v3-match.pgn) · [Selection and replay audit](ai-v4-selection.json). The audit replayed 3,539 moves: 19 checkmates, two stalemates, one insufficient-material draw, one repetition draw, and one fifty-move draw.

Mean decision time was 142.21 ms for v3 and 142.76 ms for v4. Mean tactical work was 7,215 versus 7,380 positions. Mean completed depth was 3.80 versus 4.09, and quiescence accounted for 88.0% versus 84.3% of aggregate positions. The engines encountered different game positions, so these are descriptive match statistics, not a controlled same-position efficiency comparison or independent evidence of strength.

Reproduce the frozen comparison with:

```sh
node scripts/match-ai.mjs --baseline-revision=b1d5002:src/engine.js \
  --candidate-revision=a7bf070:src/engine.js --opening-set=strength24 \
  --budget=150 --max-nodes=32768 --candidate-max-nodes=32768 --max-plies=400 \
  --output=/tmp/v4-v3-match.json --pgn=/tmp/v4-v3-match.pgn
```

## Final-engine rating ladder

**Rating run and result: PENDING.** The full 32-game ladder runs only after engine selection and source freezing. The [Elo methodology](ELO-METHODOLOGY.md) specifies Stockfish 19 nominal `UCI_Elo` settings 1320, 1520, 1720 and 1920, four fixed openings with colors reversed at each setting, 150 ms per move, one CPU thread, Skill 20 with the Elo limiter enabled, no Stockfish node cap, 32,768 AI tactical positions and a 400-played-ply maximum.

Any unfinished game or incomplete ladder withholds the main point estimate and interval. Completed games are never selectively substituted for the missing results. The report will publish per-setting wins, draws, losses and unfinished counts, plus the provisional nominal-scale estimate and conservative paired sampling uncertainty when permitted by the full results.

Stockfish's limiter is calibrated at 120s+1s against CCRL 40/4. This 150 ms test measures its nominal scale under different conditions; systematic calibration error is unknown and may exceed the sampling interval. It is not a FIDE, Lichess, Chess.com or official human Elo rating. Beating full-strength Stockfish is a much larger goal than improving v3.

## Verification

**Final selected-engine verification: PENDING.** Required checks are unit tests, production build, browser tests including real-model offline tactical search, and replay validation of all recorded games. Candidate checks alone do not replace verification of the engine ultimately published.

## Recovery and publication provenance

The replacement environment started without either previous checkout. GitHub retained v3 and its committed comparison and limited-Stockfish reports. The uncommitted original full-strength Stockfish report/PGN, Elo runner and unfinished search work were absent locally and had never been pushed. The earlier full-strength result of 0 wins, 0 draws and 8 losses is therefore retained as **user-reported historical evidence**, without reconstructed PGNs or fabricated fingerprints. Any fresh full-strength rerun is a separate measurement and must use a new report path.

At recovery, remote `main` was `d3657b9`, seven commits after v3, and hosted the Web Crawler/Omega Typer application. Chess development is isolated on `ai/rating-benchmark`. **Publication destination is pending the user's choice** about preserving that newer application or restoring chess on `main`; this experiment does not authorize silently overwriting those later changes.
