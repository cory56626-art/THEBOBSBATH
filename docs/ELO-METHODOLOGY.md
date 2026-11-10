# Provisional Stockfish-scale ladder

This protocol measures the selected INTUITION engine against Stockfish 19's
nominal `UCI_Elo` settings. It does **not** produce a FIDE, Lichess, Chess.com,
or official human Elo rating. Stockfish's limiter is calibrated at **120s+1s
against CCRL 40/4**; that calibration does not transfer to this **150 ms per
move** experiment. The unknown systematic scale error can exceed the sampling
interval below. Stockfish is only an offline opponent, never the deployed AI.

## Freeze the engine before the ladder

Complete the search iteration, tests, and predeclared v4-versus-immutable-v3
match first. Select one engine, freeze its source and dependencies, and run
the complete ladder on that engine. Do not use a ladder on an intermediate
version as the final version's rating. Preserve all games, including losses
and unfinished games, plus source/dependency/model/binary fingerprints.

The earlier full-strength 0–0–8 result is a useful reference, not the ladder
or a surprise: beating full Stockfish is a much larger task than improving v3.

## Predeclared default schedule

Run `scripts/rate-ai.mjs` with a native Stockfish 19 executable:

```sh
node scripts/rate-ai.mjs --stockfish=/absolute/path/to/stockfish
```

The defaults are 32 games, in this order:

- Nominal settings 1320, 1520, 1720, 1920, eight games at each.
- Four fixed openings from `getOpenings('pilot8')`: Italian, Queen's Gambit,
  Sicilian, English. Each starts after six predefined half-moves and reverses
  engine colors immediately within the pair. (`arena4` has only two openings.)
- One round, no discretionary additional games or selective reruns.
- Both engines receive a 150 ms move budget. INTUITION receives 32,768
  tactical positions. Stockfish receives pure `go movetime 150`, with no
  node cap, `Threads=1`, `Hash=16`, `MultiPV=1`, `Ponder=false`,
  `Skill Level=20`, `UCI_LimitStrength=true`, and the requested `UCI_Elo`.
- Stockfish hash is cleared and `ucinewgame` issued before every game.
- Maximum 400 played half-moves after the opening. Equal game clocks start
  at 31,000 ms per side: 200 × 150 ms plus 1,000 ms reserve. Actual decision
  wall time, including model/protocol overhead, is deducted. The remaining
  clock caps a move's requested time. Limits are soft around synchronous work.

Only rules-terminal outcomes and explicit clock/illegal-move forfeits score.
Clock exhaustion follows the documented competition-clock policy regardless
of remaining mating material. Reports retain termination counts so clock
wins can be distinguished from checkmates. A move-cap game is `*`, unfinished
and unscored. **Any unfinished game or incomplete schedule withholds the
main point estimate and interval.** A winning-looking position is never
scored by evaluation, and a losing-looking truncation is never called a draw.

The runner writes its full schedule, source fingerprints and withheld rating
before the first game, and checkpoints JSON/PGN after each game. Defaults
write `docs/ai-provisional-elo.json` and `.pgn`. Overrides are recorded; any
modified schedule is a separate experiment and must be described as such.

## Point estimate and uncertainty

For a candidate rating R and opponent setting E, expected score is

`p(R,E) = 1 / (1 + 10^((E-R)/400))`.

Wins count 1, draws 0.5, losses 0. The estimate solves
`sum p(R,E_i) = total points`. This is also the score-equation solution for
a fractional Bernoulli likelihood. It assumes the aggregate score curve is
logistic against the nominal settings; the experiment cannot validate that
assumption. All wins or all losses give no finite estimate and are reported
as bound-only, never clipped to an arbitrary rating.

The main 95% sampling interval is deliberately conservative. Treat each
complete color-reversed pair's average score as one observation in [0,1].
There are m=16 pairs. Hoeffding's inequality gives an observed average-score
radius `sqrt(log(2/0.05)/(2*m))`, about 0.3395. Clip the resulting score bounds
to [0,1], then invert the **mean expected score across the actual opponent
settings**, rather than adding a rating difference to their arithmetic mean.
A score endpoint of 0/1 produces a negative/positive unbounded rating endpoint,
represented by null plus explicit unbounded flags in JSON. A 16/32 score, for
example, estimates 1620 because this ladder is symmetric; other scores need
numerical inversion.

The interval assumes independent color pairs and the aggregate logistic score
model. Dependence within each pair is unrestricted. It does not assume that
32 individual games are independent. Stockfish's internal randomization,
only four fixed opening families, changing system load and limiter calibration
all limit external validity. The interval does not quantify opening selection
bias, model error, systematic calibration error or transfer to another time
control, machine, engine or rating pool. Even a finite estimate should be
reported as provisional with its full interval and these caveats.

## Audit and provenance

JSON includes the engine entry SHA-256, recursively frozen source/dependency
hashes, resolved Git revision where applicable, source-tree hash, lockfile and
installed package fingerprints, actual model weights/capsule hashes, model
inference source hashes, runner/statistics/protocol/opening hashes, Stockfish
binary hash, advertised and configured UCI options, machine/Node details, and
each move's FENs, timings, search information and complete PGN. A Git commit
alone is insufficient when source edits are uncommitted. Stockfish may
randomize limiter play, so fingerprints establish provenance rather than
promise identical reruns.

Replay the resulting report with `node scripts/validate-games.mjs
docs/ai-provisional-elo.json`, and publish the per-setting W/D/L and unfinished counts alongside
the rating. Never hide a withheld estimate by substituting one calculated
from the completed subset.

## First completed selected-engine measurement

The selected v3 ladder completed all 32 games: 16 wins, 2 draws, 14 losses.
The provisional nominal-scale estimate is **1650**, with conservative **95%
sampling interval 1289–2047**. This interval excludes calibration and transfer
error; it is not an official human or online rating. [Results, per-setting
scores and limitations](AI-STRENGTH-V4.md) · [raw report](ai-v3-provisional-elo.json)
· [PGN](ai-v3-provisional-elo.pgn).
