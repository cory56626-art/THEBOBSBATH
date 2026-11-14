# Gato 2 — selection match and provisional rating

**Result: Gato 2 beat Gato 1 24–0, then scored 24/32 against Stockfish 19's
nominal Elo settings 1720–2320. Provisional estimate ≈2278, conservative 95%
sampling interval 1933 – unbounded.** The interval has no finite upper
bound: with 16 color-reversed pairs, the deliberately broad Hoeffding radius
(±0.34 in score) lifts the upper score bound to 100%. This is a nominal
Stockfish-scale estimate at 150 ms per move, not a FIDE, Lichess or Chess.com
rating.

Both runs followed the [predeclared protocol](GATO2-PREDECLARATION.md),
committed before the first official game.

## What changed from Gato 1

Gato 1 searched with the pinned chess.js board through private hooks. In its
150 ms moves it reached about depth 3–4, and about 90% of its positions were
spent in capture quiescence. Gato 2 keeps the same neural model (one policy
inference orders root moves) and the same handcrafted evaluation. It replaces
the search core with original code in [`src/gato-search.js`](../src/gato-search.js):

- **Own board representation.** A 0x88 board with typed arrays, incremental
  64-bit Zobrist keys (two 32-bit halves), incremental piece-square, phase,
  material and piece counts, and allocation-free make/unmake. The move
  generator matches standard perft counts on six reference positions. A
  verifier recomputes every incremental field at every node of a perft walk.
- **The same evaluation, proven equal.** Gato 1's tapered evaluation is ported
  term for term and checked against `src/position-evaluation.js` on tens of
  thousands of positions from random games. A hashed evaluation cache avoids
  recomputing transpositions.
- **Modern selective search.** Principal-variation search, aspiration windows,
  a generation-stamped transposition table, null-move pruning, reverse futility
  pruning, razoring, futility and late-move pruning, logarithmic late-move
  reductions, check extensions and mate-distance pruning. Moves are ordered by
  hash move, MVV-LVA, static exchange evaluation, killers, counter-moves and
  history with gravity.
- **Exact game rules where they decide results.** Repetition uses the caller's
  reversible game history plus the search path. Fifty-move and
  insufficient-material draws are exact, and checkmate takes precedence at the
  fifty-move boundary. A reported mate is re-proved with plain full-width
  alpha-beta before it is marked `proven`.
- **Unchanged outer safety.** `chooseMove` still screens the final move for
  immediate mates, honors cancellation, restores the caller's board and
  history, and enforces exact node caps.

Gato 2's rated configuration is **Search · 150 ms · 1,000,000 positions**.
The cap is far above what 150 ms allows, so time binds. Gato 1 stays rated at
its own 150 ms / 32,768 configuration, which was also time-bound.

Development also tested a king-zone attack term in two strengths. Both lost
their 24-game A/B matches against the plain core (7.5/24 and 11.5/24), so
Gato 2 contains neither. See the
[development record](GATO2-PREDECLARATION.md#development-record-not-official-evidence).

## Step 1: selection match against immutable Gato 1

24 games: twelve `strength24` openings with colors reversed, 150 ms per
move, 400-ply cap, equal 31-second clocks. Gato 1 is the complete source
graph at `b1d5002` (32,768 positions); Gato 2 is `c50e6ed` (1,000,000).

| Engine | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gato 2 (`c50e6ed`) | 24 | 0 | 0 | 0 | 24 |
| Gato 1 (`b1d5002`) | 0 | 0 | 24 | 0 | 0 |

All 24 games ended in checkmate; replay validated 2,006 moves. Gato 2 won
**12 of 12 opening pairs**, so the one-sided exact sign test gives
p = 0.000244, well below the declared 0.05. **Gato 2 is selected.**

| Per-move statistics | Gato 1 | Gato 2 |
| --- | ---: | ---: |
| Mean decision time | 144.5 ms | 138.2 ms |
| Mean tactical positions | 3,851 | 29,965 |
| Mean completed depth | 2.99 | 8.72 |
| Quiescence share of positions | 91.5% | 44.5% |

The engines reached different positions, so these are descriptive, not a
controlled efficiency comparison. This machine is slower than the one that
rated Gato 1 (Gato 1 averaged 7,215 positions per move there).

[Match report](ai-gato2-vs-gato1.json) · [PGN](ai-gato2-vs-gato1.pgn) ·
[Selection](ai-gato2-selection.json)

## Step 2: Stockfish nominal-Elo ladder

32 games against Stockfish 19, `UCI_Elo` settings 1720, 1920, 2120 and 2320.
At each setting, four `pilot8` openings were played with colors reversed.
Stockfish ran with Skill 20, `UCI_LimitStrength`, one thread, 16 MB hash
cleared per game, pure `go movetime 150` and no node cap. Gato 2 ran at
150 ms / 1,000,000 positions. The 400-ply cap and equal 31-second clocks
applied, with no evaluation adjudication.

| Stockfish nominal setting | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1720 | 7 | 0 | 1 | 0 | 7 |
| 1920 | 8 | 0 | 0 | 0 | 8 |
| 2120 | 5 | 0 | 3 | 0 | 5 |
| 2320 | 4 | 0 | 4 | 0 | 4 |
| **Total** | **24** | **0** | **8** | **0** | **24 / 32** |

All 32 games completed by checkmate, with no forfeits or truncations; replay
validated 2,942 moves. Gato 2 scored 10/16 as White and 14/16 as Black.
Gato 2 averaged 138.3 ms per move (maximum 174.4 ms), 30,124 positions, and
completed depth 8.66.

**Rating:** the numerical fit is 2277.68 with a lower 95% endpoint of
1932.65. Publish whole numbers: **≈2278, interval 1933 – unbounded**.
The upper endpoint is reported as unbounded (`null` with `upperUnbounded:
true` in JSON) rather than replaced with an invented number.

Read this carefully:

- **Sample noise is large.** An earlier development probe of the same engine
  scored 4/8 at nominal 2000 and 0.5/8 at 2400, which fits about 1985. That
  probe is disclosed tuning data, not part of the result. The official ladder
  is the predeclared measurement, and both fits fall inside its interval.
- **Different measurement setups.** Gato 1 and Gato 2 were rated on different
  machines, Node versions and Stockfish executables. The official Gato 2
  opponent was built from the `sf_19` tag, because release downloads were
  unavailable. The direct comparison between the two bots is the 24–0
  head-to-head match, not the difference between their ladder estimates.
- **Scope.** Stockfish's limiter is calibrated at 120s+1s against CCRL 40/4.
  This 150 ms test uses its nominal scale under different conditions.
  Systematic calibration error is unknown and is not in the interval. Only
  four opening families are tested.
- **Full strength is still far away.** Full-strength Stockfish at the same
  limits beat Gato 1 8–0. Gato 2 has not been tested against it.

[Raw ladder, protocol and fingerprints](ai-gato2-provisional-elo.json) ·
[All 32 PGNs](ai-gato2-provisional-elo.pgn) ·
[Audit](ai-gato2-audit.json)

## Audit

[`ai-gato2-audit.json`](ai-gato2-audit.json) fingerprints both reports,
replays every move, recomputes the selection and the rating, and confirms:

- the deployed source tree equals the frozen candidate `c50e6ed`
  (`98ca1cb8…`);
- both official runs used that tree;
- the selection baseline is the immutable Gato 1 tree (`d35d77b7…`).

## Reproduce

```sh
node scripts/match-ai.mjs --baseline-revision=b1d5002:src/engine.js \
  --candidate-revision=c50e6ed:src/engine.js --opening-set=strength24 \
  --budget=150 --max-nodes=32768 --candidate-max-nodes=1000000 --max-plies=400 \
  --output=/tmp/gato2-vs-gato1.json --pgn=/tmp/gato2-vs-gato1.pgn
node scripts/select-engine.mjs /tmp/gato2-vs-gato1.json

node scripts/rate-ai.mjs --stockfish=/path/to/stockfish19 \
  --engine-revision=c50e6ed:src/engine.js --elos=1720,1920,2120,2320 \
  --max-nodes=1000000 --output=/tmp/gato2-elo.json --pgn=/tmp/gato2-elo.pgn
node scripts/validate-games.mjs /tmp/gato2-elo.json
```

Stockfish may randomize limiter play, so reruns produce new samples rather
than identical games.
