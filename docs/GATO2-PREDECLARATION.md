# Gato 2 prospective search-selection match

This protocol is fixed before the new candidate plays any selection games.
Gato 1 is the selected v3 engine at `b1d5002`, with its complete recursive Git
source graph. Its measured provisional rating is about 1650 on Stockfish 19's
nominal scale at 150 ms, with conservative 95% sampling interval 1289–2047;
that estimate belongs to Gato 1 and does not transfer to a candidate.

The candidate will be frozen in Git before the first game. The report must
record its entry, transitive source, installed dependency and shared model
fingerprints. `src/position-evaluation.js` and the pretrained weights stay
byte-identical to Gato 1. Candidate search development and tactical regression
checks may precede freezing; selection outcomes may not be used for tuning.

## Fixed schedule and limits

Play exactly **48 games**: the 24 `gato2_48` opening lines from
`scripts/lib/chess-openings.mjs`, in listed order, each immediately followed by
its color reversal. All lines contain six legal half-moves; none has the same
six-move sequence or resulting rules position as the earlier 12 `strength24`
lines (including `pilot8`). These are ordinary opening families, not tactical
FENs selected from candidate results. The openings are prospective development
evidence, not a claim of independence from the neural model's training data.

Each engine receives the identical model, a **150 ms** soft move budget,
**32,768 tactical positions** including quiescence, **400 played plies** after
the opening, and an equal **31,000 ms game clock** per side. Actual decision
wall time is deducted. Benchmarks run sequentially without concurrent tests,
builds or other engine searches. The full source graph of the baseline must
be loaded from its revision; no old entry may use live candidate dependencies.

Score only rules-terminal outcomes and explicit competition forfeits.
Move-cap truncations remain `*`, unfinished and unscored. No position is
adjudicated by either engine's evaluation. Save every game, move history,
clock and PGN; do not discard a loss, poor opening pair or interrupted run.

## Selection rule

Select the candidate only if all 48 games finish, there are **zero time or
illegal-move forfeits**, it scores more than **24 points**, and the exact
one-sided **paired sign-test p-value is at most 0.05**.

Each opening/color pair contributes its candidate score out of two points.
A score greater than one is favorable, less than one unfavorable, and exactly
one tied. Remove tied pairs and compare the favorable count to
`Binomial(favorable + unfavorable, 0.5)`. The test treats pairs as sampling
units; it does not assume independent games within a color pair. This is
fixed-opening development evidence, not proof of broad superiority or an Elo
gain. Any additional dependence between opening pairs limits the conclusion.

If the rule fails, keep Gato 1. Do not add games, relax the threshold, substitute
favorable subsets, change the candidate, or rerun selected outcomes to obtain
acceptance. A future candidate needs a separately declared experiment.

A complete selection can be audited with:

```sh
node scripts/select-engine.mjs docs/gato2-match.json docs/gato2-selection.json 48
```

For reproduction, replace `FROZEN_CANDIDATE` with the recorded commit:

```sh
node scripts/match-ai.mjs --baseline-revision=b1d5002:src/engine.js \
  --candidate-revision=FROZEN_CANDIDATE:src/engine.js \
  --opening-set=gato2_48 --rounds=1 --budget=150 \
  --max-nodes=32768 --candidate-max-nodes=32768 --max-plies=400 \
  --output=docs/gato2-match.json --pgn=docs/gato2-match.pgn
```

## Rating and publication

If accepted, the candidate must pass the selected-engine unit, build and
browser checks, then receive its own complete 32-game ladder under
`docs/ELO-METHODOLOGY.md` before displaying a measured rating. Any unfinished
or incomplete ladder withholds its main estimate. Retain Gato 1's measurement
with Gato 1; do not relabel it as a successor's rating. A successor's estimate
remains provisional on Stockfish's nominal scale and never becomes an official
human, FIDE, Lichess or Chess.com rating.
