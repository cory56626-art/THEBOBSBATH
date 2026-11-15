# Gato 3 selection and rating protocol (declared before official games)

This file is committed before any official Gato 3 game. Development games
used to build the engine and place the ladder are listed at the end. They are
not official evidence.

## Frozen candidate

Gato 3 is the complete Git source graph at commit `94eab0e`:
`src/engine.js`, `src/controller.js`, `src/gato-search.js`,
`src/gato-eval-params.js` and `src/gato3-weights.js`. Both official runs load
that revision, so later interface edits cannot change the engine under test.
The neural weights and the search algorithm are Gato 2's. Two things changed:

- **Tuned evaluation.** Every evaluation term is a (middlegame, endgame)
  weight. With Gato 2's starting values it equals Gato 1/Gato 2 exactly; the
  shipped weights were Texel-tuned on 210,550 quiet positions from 2,700 Gato 2
  self-play games, labeled only by game outcome. Stockfish was not used. New
  terms: king-danger buckets, threats, phalanx and blocked passed pawns, tempo.
- **Search memory within a game.** The transposition table and evaluation
  cache carry over when the previous root was one or two plies earlier in the
  same game. A repeated root or a new game starts fresh.

Rated configuration: **Search · 150 ms per move · 1,000,000 positions**, as
Gato 2. Engine version `intuition-hybrid-6`.

## Step 1: selection match against Gato 2

- Baseline: Gato 2, the complete Git source graph at `c50e6ed`.
  Candidate: `94eab0e`. Both run at 150 ms and 1,000,000 positions.
- **120 games:** the 60 named openings of `gato3x120` (the twelve
  `strength24` lines plus 48 more), each played with colors reversed, in one
  round. The 400-ply cap and equal 31-second clocks apply. No evaluation
  adjudication; truncations stay unscored.
- The run is split into **three concurrent shards** of 20 openings each on a
  4-core machine, one single-threaded game per shard at a time. Both engines
  share the same conditions, and shard reports are merged with identity
  checks.
- **Selection requires:**
  - all 120 games finished, with no forfeits;
  - a candidate score above 60 points;
  - p ≤ 0.05 in an exact one-sided sign-flip test on the 60 pair score
    differences (candidate points − 1).

  If any condition fails, Gato 2 stays the newest bot and nothing is renamed.
  No extra games, retuning or subsets after results.

The sign-flip test replaces Gato 2's plain sign test. It keeps half-point
margins, so it can detect a moderate edge between two strong engines that
the 24-game sign test cannot.

```sh
for shard in 0 20 40; do
  node scripts/match-ai.mjs --baseline-revision=c50e6ed:src/engine.js \
    --candidate-revision=94eab0e:src/engine.js --opening-set=gato3x120 \
    --opening-offset=$shard --opening-limit=20 --budget=150 --max-nodes=1000000 \
    --candidate-max-nodes=1000000 --max-plies=400 \
    --output=docs/gato3-shards/match-$shard.json --pgn=docs/gato3-shards/match-$shard.pgn &
done; wait
node scripts/merge-shards.mjs --planned=120 --output=docs/ai-gato3-vs-gato2.json \
  --pgn=docs/ai-gato3-vs-gato2.pgn docs/gato3-shards/match-{0,20,40}.json
node scripts/select-engine.mjs --rule=gato3 docs/ai-gato3-vs-gato2.json docs/ai-gato3-selection.json
```

## Step 2: Stockfish nominal-Elo ladder (only if selected)

The [Elo methodology](ELO-METHODOLOGY.md) applies unchanged: runner,
Stockfish options, clocks, scoring, logistic fit and conservative Hoeffding
interval over color-reversed pairs. Declared choices:

- **Settings 2200, 2400, 2600, 2800**, centered on development probes.
- **All twelve `strength24` openings with colors reversed at each setting:
  96 games, 48 pairs.** Gato 2's 32-game ladder left its interval unbounded
  above, and more pairs narrow the conservative interval.
- AI cap 1,000,000 positions; Stockfish 19 built from the `sf_19` tag, the
  same executable as Gato 2's ladder.
- Two concurrent shards (2200/2400 and 2600/2800) on the same 4-core
  machine, each one game at a time, then merged.

Any unfinished game or incomplete schedule withholds the estimate.

```sh
SF=/path/to/stockfish19
node scripts/rate-ai.mjs --stockfish=$SF --engine-revision=94eab0e:src/engine.js \
  --opening-set=strength24 --elos=2200,2400 --max-nodes=1000000 \
  --output=docs/gato3-shards/ladder-low.json --pgn=docs/gato3-shards/ladder-low.pgn &
node scripts/rate-ai.mjs --stockfish=$SF --engine-revision=94eab0e:src/engine.js \
  --opening-set=strength24 --elos=2600,2800 --max-nodes=1000000 \
  --output=docs/gato3-shards/ladder-high.json --pgn=docs/gato3-shards/ladder-high.pgn &
wait
node scripts/merge-shards.mjs --planned=96 --output=docs/ai-gato3-provisional-elo.json \
  --pgn=docs/ai-gato3-provisional-elo.pgn docs/gato3-shards/ladder-low.json docs/gato3-shards/ladder-high.json
node scripts/validate-games.mjs docs/ai-gato3-provisional-elo.json
```

## Naming rule

If Gato 3 is selected and the ladder completes, the site's default bot becomes
**Gato 3** with its measured estimate. Gato 1 and Gato 2 stay playable with
their own ratings.

## Development record (not official evidence)

| Run | Purpose | Result |
| --- | --- | --- |
| Self-play data | 2,700 Gato 2 games at 8,000 positions per move from randomized openings | 210,550 unique quiet positions after deduplication |
| `ab-tuned` (24 games, `strength24`) | Tuned evaluation only vs Gato 2 | 13.5 / 24 |
| `ab-tuned-memory` (24 games, `strength24`) | Tuned evaluation plus in-game search memory vs Gato 2 | 17.5 / 24 |
| `probe-stockfish` (16 games, `pilot8`) | Ladder placement | 6–0–2 at nominal 2300; 3–0–5 at 2600 |

A second self-play round was started with the tuned engine and stopped
unused. The candidate contains only the weights fitted on the first round.

## Amendment 1 (committed before ladder attempt 2)

**What happened.** Ladder attempt 1 completed its 96-game schedule, but two
games reached the 400-ply cap in drawn opposite-colored-bishop endings
before the fifty-move rule could end them:

- game 17 at nominal 2200, halfmove clock 54;
- game 31 at nominal 2800, halfmove clock 92.

As declared, **attempt 1's estimate is withheld**. Its per-setting tallies
are published ([report](ai-gato3-ladder-attempt1.json),
[PGN](ai-gato3-ladder-attempt1.pgn)), and no rating is computed from the 94
completed games. The cap caused this, not any score.

**Attempt 2** repeats the ladder exactly, with the same engine `94eab0e`,
Stockfish executable, settings, openings and two shards, except for
**`--max-plies=1000`**. The runner scales the equal game clocks with the cap:
500 × 150 ms + 1 s = 76 seconds per side. That leaves room for the
fifty-move and repetition rules to finish such endings; still no evaluation
adjudication is used.

**Attempt 2 is the rating, whatever its result.** If it also contains an
unfinished game, the estimate stays withheld and Gato 3 ships without a
rating. Attempt 1 and attempt 2 games are never pooled.

```sh
SF=/path/to/stockfish19
node scripts/rate-ai.mjs --stockfish=$SF --engine-revision=94eab0e:src/engine.js \
  --opening-set=strength24 --elos=2200,2400 --max-nodes=1000000 --max-plies=1000 \
  --output=docs/gato3-shards/ladder-low.json --pgn=docs/gato3-shards/ladder-low.pgn &
node scripts/rate-ai.mjs --stockfish=$SF --engine-revision=94eab0e:src/engine.js \
  --opening-set=strength24 --elos=2600,2800 --max-nodes=1000000 --max-plies=1000 \
  --output=docs/gato3-shards/ladder-high.json --pgn=docs/gato3-shards/ladder-high.pgn &
wait
node scripts/merge-shards.mjs --planned=96 --output=docs/ai-gato3-provisional-elo.json \
  --pgn=docs/ai-gato3-provisional-elo.pgn docs/gato3-shards/ladder-low.json docs/gato3-shards/ladder-high.json
```

## Amendment 2 (committed before ladder attempt 3)

**What happened.** Attempt 2 was interrupted after 30 of its 96 games
(18 in the 2200/2400 shard, 12 in the 2600/2800 shard). The cloud session's
worker process restarted and killed both runner processes. This was an
infrastructure failure, unrelated to any game. The schedule is incomplete, so
**attempt 2 has no estimate**. Its 30 games are published as aborted
([shards](gato3-shards/attempt2-aborted/)), unpooled and unrated.

| Attempt 2 (aborted) | Wins | Draws | Losses |
| --- | ---: | ---: | ---: |
| Nominal 2200 | 10 | 0 | 8 |
| Nominal 2600 | 2 | 1 | 9 |

**Attempt 3** is identical to attempt 2: engine `94eab0e`, the same
Stockfish executable, settings 2200–2800, all twelve `strength24` openings
with colors reversed, 96 games, a 1,000-ply cap and two shards. The runner
processes are detached from the session (`setsid nohup`) so a worker
restart cannot kill them. **Attempt 3 is the rating, whatever its result**:
if it is interrupted or contains an unfinished game, the estimate is withheld
and Gato 3 ships without a rating. No games from attempts 1, 2 and 3 are
pooled.
