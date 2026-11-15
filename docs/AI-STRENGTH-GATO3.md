# Gato 3 — selection match and provisional rating

**Result: Gato 3 beat Gato 2 85.5–34.5 over 120 games. It then scored
32/96 against Stockfish 19's nominal Elo settings 2200–2800.
Provisional estimate ≈2334, conservative 95% sampling interval
2087–2528.** This is a nominal Stockfish-scale estimate at 150 ms per move,
not a FIDE, Lichess or Chess.com rating.

Both runs followed the [predeclared protocol](GATO3-PREDECLARATION.md),
committed before the first official game.

## What changed from Gato 2

Gato 3 keeps Gato 2's neural root ordering, board representation and search
algorithm. Two things changed:

- **A tuned evaluation.** Gato 1 and Gato 2 used hand-picked numbers. Gato 3
  turns every evaluation term into a middlegame/endgame weight pair
  ([`src/gato-eval-params.js`](../src/gato-eval-params.js)) and fits all 976
  weights by Texel tuning ([`src/gato3-weights.js`](../src/gato3-weights.js)).
  - **Data:** 2,700 fast Gato 2 self-play games from randomized openings gave
    210,550 unique positions, each labeled only by the final result. Each
    position is resolved to a quiet leaf through quiescence before its
    features are read.
  - **Fit:** a logistic scale K, then full-batch Adam with a held-out 10%,
    early stopping and a mild pull toward the starting values. Held-out
    squared error fell from 0.1167 to 0.1115.
  - **Learned values that make chess sense:** doubled pawns −16/−13, blocked
    passed pawns −13/−11, pawn threats on pieces +26, rooks on open files +43
    in the middlegame, +9 for the side to move.
  - **New terms:** king-danger buckets, threats by pawns, minors and rooks,
    phalanx pawns, blocked passers and tempo. They started at zero, so only
    the data turned them on.
  - **No Stockfish involvement.** Stockfish played no part in the data or the
    labels; it remains only the rating opponent.
- **Search memory within a game.** Gato 2 started every move from an empty
  transposition table. Gato 3 keeps its table and evaluation cache when the
  previous search's root is one or two plies back in the same game, so each
  move begins with the last move's work. A repeated root or a new game starts
  fresh, which keeps fixed-node searches deterministic.

Tests guard the change:
- **Exact starting point:** with Gato 2's starting weights, the new
  evaluation equals Gato 1/Gato 2 exactly on thousands of random-game
  positions.
- **Consistent features:** traced features times the shipped weights
  reproduce every score.
- **Symmetry:** the evaluation is color-symmetric.
- **Correct reuse:** search memory is reused only when the same game
  continues.

## Step 1: selection match against Gato 2

120 games: 60 named openings (`gato3x120`), each with colors reversed, 150 ms
per move, 1,000,000 positions for both engines, a 400-ply cap and equal
31-second clocks. The games ran as three concurrent shards on a 4-core
machine.

| Engine | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gato 3 (`94eab0e`) | 73 | 25 | 22 | 0 | 85.5 |
| Gato 2 (`c50e6ed`) | 22 | 25 | 73 | 0 | 34.5 |

- **Completion:** all 120 games finished, with no forfeits or truncations.
  Replay validated 15,738 moves: 95 checkmates, 18 threefold repetitions,
  4 fifty-move draws and 3 insufficient-material draws.
- **By color:** Gato 3 scored 43.5/60 as White and 42/60 as Black.
- **Pairs:** Gato 3 won 38 opening pairs and lost 7; 15 were tied.
- **Test:** the exact one-sided sign-flip test on pair scores gives
  p = 9.95 × 10⁻⁷, far below the declared 0.05. **Gato 3 is selected.**

| Per-move statistics | Gato 2 | Gato 3 |
| --- | ---: | ---: |
| Mean decision time | 139.9 ms | 140.6 ms |
| Mean tactical positions | 39,462 | 37,673 |
| Mean completed depth | 9.61 | 10.17 |
| Longest decision | 280.2 ms | 201.7 ms |

Gato 3 reached about half a ply deeper while examining slightly fewer
positions, which is search memory at work. The longest decisions show that
the per-move limit is soft under concurrent shards; both engines stayed far
inside their game clocks.

[Merged match report](ai-gato3-vs-gato2.json) · [PGN](ai-gato3-vs-gato2.pgn) ·
[Selection](ai-gato3-selection.json) · [Shards](gato3-shards/)

## Step 2: Stockfish nominal-Elo ladder

96 games against Stockfish 19 at `UCI_Elo` 2200, 2400, 2600 and 2800. All
twelve `strength24` openings were played with colors reversed at each
setting, giving 48 pairs. Stockfish ran with Skill 20, the limiter on, one
thread, 16 MB hash cleared per game, pure `go movetime 150` and no node cap;
the executable is the same `sf_19` build used for Gato 2. Gato 3 ran at
150 ms / 1,000,000 positions. The run used two concurrent shards.

| Stockfish nominal setting | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2200 | 10 | 2 | 12 | 0 | 11 |
| 2400 | 11 | 3 | 10 | 0 | 12.5 |
| 2600 | 5 | 1 | 18 | 0 | 5.5 |
| 2800 | 1 | 4 | 19 | 0 | 3 |
| **Total** | **27** | **10** | **59** | **0** | **32 / 96** |

All 96 games completed, with no forfeits or truncations; the longest game
lasted 379 plies. Replay validated 11,875 moves: 86 checkmates, 5 threefold
repetitions, 4 fifty-move draws and 1 insufficient-material draw. Gato 3
scored 17/48 as White and 15/48 as Black. It averaged 139.6 ms per move
(maximum 308.6 ms, a soft-limit overrun under concurrent shards, far inside
its clock), 30,806 positions and completed depth 10.42.

**This is ladder attempt 3.** The protocol was amended twice, each time before
the next attempt's first game:

- **Attempt 1** completed its 96 games, but two dead-drawn
  opposite-colored-bishop endings hit the 400-ply cap before the fifty-move
  rule. Its estimate is withheld, as declared, and no rating is computed from
  its other 94 games. Amendment 1 raised the cap to 1,000 plies so the chess
  rules can end such games.
- **Attempt 2** was killed after 30 games by a cloud session restart, so it
  was aborted unrated.
- **Attempt 3** was declared final in advance, whatever its result. Nothing
  is pooled across attempts.

[Attempt 1](ai-gato3-ladder-attempt1.json) ·
[Attempt 2 (aborted)](gato3-shards/attempt2-aborted/) ·
[Amendments](GATO3-PREDECLARATION.md#amendment-1-committed-before-ladder-attempt-2)

**Rating:** the numerical fit is 2334.40 and the 95% interval is
[2086.53, 2528.47]. Publish whole numbers: **≈2334, interval 2087–2528**.
The point estimate is about 56 above Gato 2's ≈2278, but the two intervals
overlap widely. Gato 3's edge over Gato 2 is established by their direct
120-game match, not by the difference between two ladder estimates.

Read this carefully:

- **More games, narrower interval.** This ladder has three times Gato 2's
  games and 48 color-reversed pairs, so the conservative interval is
  narrower. It still covers sampling error only.
- **Development probes are not results.** The 16-game probe suggested
  about 2450–2500. The official 96-game ladder is lower. Small development
  samples are noisy, which is why they only placed the ladder.
- **Scope.** Stockfish's limiter is calibrated at 120s+1s against CCRL 40/4;
  this 150 ms test uses its nominal scale under different conditions.
  Calibration error, opening-set bias and hardware transfer are not in the
  interval.
- **Comparing Gatos.** Gato 2 and Gato 3 were rated on the same machine
  type with the same Stockfish executable, but on different ladders. The
  direct comparison is their 120-game match.

[Merged ladder report](ai-gato3-provisional-elo.json) ·
[All 96 PGNs](ai-gato3-provisional-elo.pgn) · [Audit](ai-gato3-audit.json)

## Audit

[`ai-gato3-audit.json`](ai-gato3-audit.json) fingerprints both merged
reports and all five shards, replays every move, recomputes the selection
and the rating, and confirms:

- the live engine equals the frozen candidate `94eab0e`;
- both official runs used that engine;
- the selection baseline is Gato 2 (`c50e6ed`).

A unit test also pins the live Gato 3 source files to `94eab0e`.

## Older Gatos and battles

Gato 1 and Gato 2 stay playable on the site as byte-identical snapshots of
their rated code (`src/bots/gato1`, `src/bots/gato2`), checked against Git
by tests. The Battle tab plays any two Gatos against each other. Battles
there are for exploration; this report's matches are the official
comparisons.
