# Chess AI evaluation

This records the archived version 2 experiment. [Version 3 strength testing](AI-STRENGTH-V3.md) describes the current hybrid engine. The raw reports below retain their original engine fingerprints and results.

The v2 changes address failures in the chess decision engine. Neural weights are unchanged. The raw direct policy is retained as a reference, and Search is the default playing mode.

## Failures reproduced before editing

1. A strongly preferred stalemate consumed hundreds of search visits while an available mate was never selected.
2. A discovered mate could lose to an unproved neural estimate because the other move had more visits.
3. A low-risk controller could approve a move allowing an immediate opponent checkmate.
4. Rejecting the first dangerous move could expose another unchecked replacement at very small node budgets.
5. The shipped controller skipped a 695-centipawn loss in an independently scored development position.

Regression tests use deliberately incorrect policies to verify that exact chess outcomes overrule predictions. They also preserve the direct-policy baseline, special moves, cancellation, repetition history, the private board, and node caps.

## Independent move assessment

The fixed test contains 20 positions: six authored tactical positions and fourteen new seeded legal middlegames. Nine are development positions and eleven are held out by game group. Generated positions exclude all controller training FENs. These stress positions are not a representative distribution of human games.

Both engines use the identical model, a 500 ms soft decision cap and 128 neural-tree-visit cap. Stockfish 19 independently evaluates the position and each chosen move at 100,000 nodes, with one thread and cleared hash. Stockfish supplies evaluation only; it is not called by the deployed playing AI.

Centipawn comparisons include only positions where both reference and chosen-move scores are finite centipawn values. Mates are counted separately. Consult the raw reports for counts, per-position changes, fingerprints, timing, and instability flags.

The final recorded run used engine source SHA-256 `1c4ff43e028f81966f8cbb8873347a54e683b300624961742cc910ec0e557fdc`. Both reports use the same position-set fingerprint. These are diagnostics on a small stress set, not a playing-strength rating.

| Mode | v1 mean loss, centipawns | v2 mean loss, centipawns | v1 / v2 severe mistakes | v1 / v2 missed immediate mates |
| --- | ---: | ---: | ---: | ---: |
| Direct | 74.58 | 74.58 | 1 / 1 | 1 / 1 |
| Search | 5.33 | 2.25 | 0 / 0 | 0 / 0 |
| Selective | 74.58 | 5.33 | 1 / 0 | 1 / 0 |

Means use 12 comparable positions per mode; severe means at least 200 centipawns lost. Four positions offer mate in one. The large Selective improvement comes from declining an inadequately validated gate and performing verification; it costs additional computation. In the seven comparable held-out positions, Search changed from 9.14 to 3.86 centipawns, and Selective remained at 9.14. Search and Selective can differ slightly under wall-time caps even when both search.

- [Published v1 assessment](ai-baseline.json)
- [Final v2 assessment](ai-improved.json)

## Controlled game comparison

The old and new search engines share the same pretrained weights and play four openings with colors reversed: eight games total. Each move has a 150 ms soft cap and 64-node cap. Each side receives the same game clock, including the same small reserve. Only actual chess-rule terminations or explicit forfeits score a game; move-cap truncations remain unscored. No evaluation adjudication is used.

- [Game records and per-move telemetry](ai-match-comparison.json)
- [Replayable PGNs](ai-match-comparison.pgn)

Eight games provide a small pilot comparison, not a reliable Elo estimate. The exact source hashes and settings in the files identify which engine was tested.

The final v2 engine scored **4 wins, 3 losses, and 1 unfinished game** against v1. All seven completed games ended in checkmate. The unfinished game reached the 160-played-ply limit and contributes no points. Mean measured decision times were 129.00 ms for v2 and 125.63 ms for v1. The sample does not establish an overall strength gain; earlier development versions also produced varying match outcomes.

## Games against chess bots

The external-opponent pilot plays native Stockfish 19 at Skill Level 0 and Skill Level 5, each with a 1,000-node request per move, one thread, and a 16 MB hash cleared before each game. Italian and Queen's Gambit openings are played with colors reversed at each level: eight games total. INTUITION uses the same final v2 engine and weights, with a 150 ms soft cap and 64 tree visits. Both sides receive 13-second game clocks; actual decision time is deducted.

These settings deliberately limit Stockfish. They do not correspond to an established human rating or an equal-compute comparison. Low-skill Stockfish choices can be randomized internally, so matching settings do not guarantee identical reruns. Exact settings, advertised UCI options, binary/script/source fingerprints, per-move telemetry, and unfinished games are retained. The UCI client has tests for option negotiation, history, process exits, timeouts, and missing executables.

| Opponent | INTUITION wins | Draws | Losses | Unfinished |
| --- | ---: | ---: | ---: | ---: |
| Stockfish 19, Skill 0, 1,000-node request | 3 | 0 | 1 | 0 |
| Stockfish 19, Skill 5, 1,000-node request | 0 | 0 | 3 | 1 |

All seven completed games ended in checkmate. The unfinished Skill 5 game reached the 160-played-ply limit and is unscored. Replay checks validated every recorded move and PGN. Across 332 INTUITION moves, an exact one-reply audit found no missed immediate checkmates and no chosen move allowing an immediate opponent mate when an alternative avoided it. Four moves allowed immediate mate in positions where every legal alternative also did. This narrow audit verifies the tactical guard, not overall tactical or strategic strength.

The Skill 5 results expose a clear remaining gap even against a deliberately limited opponent. These games establish an initial external benchmark; the earlier v1 engine did not play this ladder, so its score cannot establish a before/after strength gain. Stockfish's reported search score may describe a different move from its handicapped final selection and is not used for adjudication or blunder claims.

- [External-opponent results](ai-bot-arena.json)
- [Replayable external-opponent PGNs](ai-bot-arena.pgn)

## Reproduce

Install a native Stockfish 19 binary separately. The reports record its executable hash and the verified official release archive. No Stockfish executable or network is bundled with this project.

```sh
# Snapshot the published engine for a before/after comparison.
git show 8915eb4:src/engine.js > /tmp/intuition-baseline-engine.js

# Baseline on the fixed positions already committed in the report.
node scripts/evaluate-ai.mjs --stockfish=/path/to/stockfish \
  --engine-source=/tmp/intuition-baseline-engine.js \
  --positions-file=docs/ai-baseline.json --output=/tmp/ai-baseline-repeat.json

# Current engine, using the same positions and controller.
node scripts/evaluate-ai.mjs --stockfish=/path/to/stockfish \
  --positions-file=docs/ai-baseline.json --output=/tmp/ai-current-repeat.json

# Controlled old-search versus current-search game pairs.
node scripts/match-ai.mjs --baseline=/tmp/intuition-baseline-engine.js \
  --output=/tmp/ai-matches-repeat.json --pgn=/tmp/ai-matches-repeat.pgn

# Actual games against the two limited Stockfish opponents.
node scripts/arena-ai.mjs --stockfish=/path/to/stockfish \
  --skills=0,5 --stockfish-nodes=1000 --budget=150 --max-nodes=64 \
  --output=/tmp/ai-arena-repeat.json --pgn=/tmp/ai-arena-repeat.pgn
```

## Remaining limits

The compact network predicts policy and game outcomes learned from human games. It can still make strategic and tactical errors; a finite verification budget does not solve chess. The controller's disagreement target is not a direct measure of blunder severity. A future controller needs more independent data and move-quality-aware validation before compute savings can be trusted.

[Model candidate assessment](model-assessment.md) records why larger/faster candidates were not substituted without parity, strength, and redistribution evidence. No new trained-model strength is claimed for this change.
