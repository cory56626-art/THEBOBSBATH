# Gato 2 search candidate and strength measurement

**Result: retain Gato 1.** Candidate 1 scored 26 wins, 4 draws and 18 losses, but failed the predeclared paired selection threshold. No candidate rating is assigned.

## Frozen candidate and first-bot baseline

Gato 1 is preserved by the annotated `gato-1` tag. Its playing engine is the
selected v3 source at `b1d5002`, loaded with its full recursive source graph.
Its completed 32-game ladder measured about **1650 on Stockfish 19's nominal
scale**, with conservative **95% sampling interval 1289–2047**, at Search
150 ms and 32,768 tactical positions. That measurement belongs to Gato 1.

The new candidate is frozen at **`182956a`**, engine version
`gato-2-candidate-1`. The match records exact entry, transitive source,
dependency, shared-model, harness and environment fingerprints. The positional
evaluation and pretrained neural weights remain byte-identical to Gato 1.
Loading either historical engine against live dependencies is not permitted.

## Search changes and their limits

The candidate builds on the earlier experimental PVS/aspiration search:

- Principal Variation Search and widening aspiration windows seek deeper
  completed iterations within the same move budget.
- Conservative late-move reductions apply to late quiet non-pawn moves at
  non-principal nodes, excluding checks, captures, promotions, killer moves
  and mate windows. Alpha-improving reduced moves receive a full-depth search.
- Repetition context resets after irreversible pawn moves or captures and is
  restored on undo. A separate quiescence transposition cache checks repetition
  context and the fifty-move counter before reusing a score.
- A static exchange estimate (SEE) orders expensive captures by their local
  exchange prospects. The estimate uses a separate board copy and screens
  recapturing pieces for king safety; it is a local material heuristic, not a
  proof about threats or compensation elsewhere on the board.
- Quiescence may omit an ordinary capture estimated to lose at least one pawn
  locally. Pruning excludes checked positions, checking captures, promotions,
  king captures, mate-score windows and exchanges for which SEE returns no
  usable estimate. En passant, promotions and last-rank exchange targets do
  not supply SEE pruning decisions. This remains a selective strength heuristic
  and may miss non-checking sacrifices; the match must assess its effect.
- Either winning or losing mate-score candidates receive a fresh search with
  reductions and capture pruning disabled, after clearing selectively derived
  transposition bounds. Verification uses the original node and time limits;
  an interrupted verification cannot publish its partial result.

All legal check evasions and promotions remain available. Cancellation, caller
board/history restoration, rules-terminal outcomes and last-completed-iteration
fallback remain required.

### Work accounting

Reports preserve `nodes`/`qNodes` as tactical positions, plus search diagnostics
including **`seeCalls`**, **`seeProbes`** and **`qPruned`**. SEE probes are
auxiliary exchange work; they are not counted as additional tactical positions
under the 32,768-position cap. Their deadline and cancellation checks share the
same 150 ms budget, and their elapsed cost is deducted from the game clock.
Consequently, equal tactical-node limits do not imply equal total operations.
Work totals and completed depth are descriptive measurements, not evidence of
a strength gain by themselves.

## Predeclared 48-game comparison

The [predeclaration](GATO2-PREDECLARATION.md) fixes **48 games** from 24 ordinary
six-half-move `gato2_48` opening lines, in listed order with immediate color
reversal. Their sequences and resulting rules positions are distinct from the
12 earlier comparison lines. This is prospective opening evidence, not a claim
that the positions are absent from the neural model's training data.

Both engines receive 150 ms per decision, 32,768 tactical positions including
quiescence, a maximum of 400 played plies after the opening, and equal 31-second
clocks. Actual wall time is charged. Games run sequentially without concurrent
engine tests or builds. There is no evaluation-based result adjudication.
Truncations remain `*`, unfinished and unscored, and all games and PGNs are kept.

Selection requires all 48 games finished, no clock or illegal-move forfeits,
more than 24 candidate points, and a one-sided exact opening-pair sign-test
**p <= 0.05**. Each color pair is favorable above one candidate point,
unfavorable below one, or tied at one. Remove ties and test favorable pairs
against `Binomial(favorable + unfavorable, 0.5)`. Do not add games, change the
candidate or relax the threshold after seeing outcomes. If the rule fails,
Gato 1 remains selected.

**Complete game result: all 48 games finished with no forfeits or truncations.**

| Engine | Wins | Draws | Losses | Unfinished | Points |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frozen Gato 2 candidate | 26 | 4 | 18 | 0 | 28 |
| Frozen Gato 1 baseline | 18 | 4 | 26 | 0 | 20 |

**Opening pairs: 9 favorable, 6 unfavorable, 9 tied.**

**Exact one-sided paired p = 0.303619384765625. Gato 1 remains selected.**

Full-history replay validated **5,427 moves**, 44 checkmates, one insufficient-material draw and three repetition draws. [Raw match](gato2-match.json) · [PGN](gato2-match.pgn) · [Selection audit](gato2-selection.json).

The small fixed-opening experiment cannot establish broad superiority or a
portable Elo gain. Dependence between opening pairs, timing variability and
opening selection limit the conclusions even if the threshold is met.

## A successor needs its own rating

**Candidate ladder not run:** the candidate was not selected, so its own rating is withheld.

Gato 1's 1650 estimate must not be reused or relabeled as Gato 2's rating. If
selected, the frozen candidate needs its own complete 32-game ladder under the
[Elo methodology](ELO-METHODOLOGY.md). Any unfinished game or incomplete
schedule withholds the main point estimate and interval. A displayed successor
rating must identify the measured engine and settings.

Stockfish's nominal limiter is calibrated at 120s+1s against CCRL 40/4. The
150 ms experiment does not transfer that calibration; systematic scale error
is unknown and is excluded from sampling intervals. A resulting estimate is
provisional on Stockfish's nominal scale, never an official human, FIDE,
Lichess or Chess.com rating.

## Verification and publication

Gato 1 remains published. Candidate 1 passed 123 unit tests, the production build and 14 browser tests before freezing; these checks do not establish strength. Any future selected candidate requires
include unit tests, production build, real-model browser play including offline
tactical search and cancellation, full-history replay of every recorded game,
source/model fingerprint matching, and GitHub Actions on the published source.
Candidate development checks alone do not replace final selected-engine checks.
