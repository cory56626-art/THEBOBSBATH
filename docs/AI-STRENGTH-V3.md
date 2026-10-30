# Version 3: hybrid engine strength test

Version 2 avoided immediate mate blunders but remained weak in full games. Its tiny human-game-trained value model and repeated neural calls allowed only five or six tree visits in the inspected 150 ms decisions. Version 3 uses the same neural weights once for root move ordering, then searches with a much faster independent positional evaluator.

## Why the engine changed

[Development loss diagnosis](v2-loss-diagnosis.md) identifies the first large move-quality drops in the three completed Skill 5 losses. Independent Stockfish searches at both 100,000 and 500,000 nodes agreed on the reference move. Confirmed losses were 211, 241, and 219 centipawns. These positions exposed missed central breaks and kingside tactics beyond the immediate-mate guard. They are development examples, not held-out evidence for version 3.

The new engine includes:

- Iterative-deepening negamax with alpha-beta pruning, ordered captures, neural root priors, killer/history heuristics, and a bounded transposition table.
- Capture and promotion quiescence, with every legal check evasion searched when in check. It does not stop with a static evaluation in the middle of a forced capture sequence or while checked.
- Original tapered evaluation of material, piece placement, mobility, pawn structure, passed pawns, rook files, bishop pairs, king shelter, and simple endgame conversion.
- Exact repetition-history and fifty-move handling. Transposition score reuse checks the repetition context and halfmove counter; mate scores account for search ply.
- Per-position time and work checks, last-completed-iteration fallback, cancellation between restored root positions, and the existing final immediate-mate safety guard.

The code uses reversible low-level moves from the pinned chess.js 1.4.0 rules library to avoid constructing SAN and legal-move objects at every position. Tests guard this internal contract using standard perft counts, castling, en passant, promotions, hashes, and full history restoration. A future chess.js update requires these checks to pass before adoption.

There is no Stockfish code or Stockfish inference inside the playing engine. No new network was trained. Direct remains the original raw neural policy. Search and Selective use the hybrid engine; the old controller cannot skip verification without validation for the new engine and limits.

## Fixed comparison protocol

The version 3 source and evaluation were frozen before the matches. Both versions use the identical 116,266-parameter network and weight fingerprint. Complete reports fingerprint the engine and its local JavaScript dependencies, including the tactical search and positional evaluation.

1. **Against version 2:** twelve fixed openings, colors reversed, 24 games. Both sides receive a 150 ms soft decision limit, 13-second game clocks, and a 160-played-ply limit. Version 2 permits 64 neural tree visits; version 3 permits 32,768 tactical positions including quiescence. These are different work units. Equal total wall time is the controlled resource; the same node count would not represent equal computation.
2. **Against external opponents:** version 2 and version 3 each play eight games against native Stockfish 19 at Skill Level 5, one thread, a 16 MB hash cleared per game, and a 1,000-node request per move. Four fixed openings have colors reversed. INTUITION uses the same limits as above for its version. Both sides have equal 13-second clocks.
3. **Scoring:** only actual chess-rule terminations and explicit competition forfeits score. Games reaching the move cap remain unfinished and unscored. There is no evaluation-based adjudication. Full-history validation checks legal moves, before/after FENs, PGNs, clocks, results, and terminations.

Stockfish's low-skill choice can be randomized internally. The two external-opponent runs are reproducible protocols rather than identically sampled moves. Its final handicapped move can differ from its reported principal variation; those search scores are not used to adjudicate results. Skill 5 with this small node limit is deliberately weaker than full-strength Stockfish and has no established human Elo here.

## Results

Against version 2, version 3 finished with **19 wins, 1 draw, and 4 losses** (19.5–4.5 points). All 24 games completed: 23 checkmates and one insufficient-material draw. There were no time forfeits, illegal-move forfeits, or move-cap truncations. Full-history validation replayed all 2,114 recorded moves and checked the PGNs, outcomes, and clocks.

| Engine | Mean actual decision time | Mean search work | Mean neural calls |
| --- | ---: | --- | ---: |
| Version 2 | 128.22 ms | 4.82 neural tree visits | 4.81 |
| Version 3 | 139.26 ms | 8,146.64 tactical positions | 1.00 |

Version 3's mean work includes 7,324.25 quiescence positions; its mean completed depth was 3.50 plies. The different work units and search procedures prevent interpreting the node ratio or the old MCTS depth as equivalent alpha-beta depth. The match score demonstrates improvement against this baseline at the tested settings; it does not measure an Elo or establish superiority to other engines.

| Against Stockfish 19, Skill 5, 1,000-node request | Wins | Draws | Losses | Unfinished |
| --- | ---: | ---: | ---: | ---: |
| Version 2 | 2 | 0 | 6 | 0 |
| Version 3 | 3 | 0 | 1 | 4 |

Every completed external-opponent game ended in checkmate. Four version 3 games reached the 160-played-ply limit and contribute no points; they are not draws or assumed wins. Comparing only completed-game percentages would exclude half of version 3's games and misrepresent this pilot. The direct 24-game comparison supplies the clearer before/after evidence. Low-skill Stockfish randomization and these small samples also limit external-opponent conclusions.

A separate post-match diagnostic analyzed those four unfinished full histories with Stockfish 19 at Skill 20 and 100,000 nodes. Its latest unbounded iteration estimates from INTUITION's perspective were -38, -623, 0, and -359 centipawns. Two were therefore substantially losing by this estimate; the others were near balanced. The last interrupted-search bounds are retained separately, with their direction adjusted when converting to INTUITION's side. The unfinished games cannot all be described as conversion stalls or successful defense. These diagnostic scores do not change any result. [Raw unfinished-position diagnostic](ai-v3-unfinished-diagnostic.json) retains the positions, options, history validation, PVs, and fingerprints.

Raw reports and replayable games are retained separately from the earlier experiments:

- [Version 2 versus version 3 match](ai-v3-match.json) · [PGN](ai-v3-match.pgn)
- [Version 2 against limited Stockfish](ai-v2-stockfish5.json) · [PGN](ai-v2-stockfish5.pgn)
- [Version 3 against limited Stockfish](ai-v3-stockfish5.json) · [PGN](ai-v3-stockfish5.pgn)

## Reproduce

Install dependencies with `npm ci`. Obtain an official native Stockfish 19 executable separately; it is not bundled or deployed. Commands use new output paths to preserve the committed run.

```sh
git show cd89e02:src/engine.js > /tmp/intuition-v2-engine.js

node scripts/match-ai.mjs --baseline=/tmp/intuition-v2-engine.js \
  --opening-set=strength24 --budget=150 --max-nodes=64 \
  --candidate-max-nodes=32768 --max-plies=160 \
  --output=/tmp/v3-match.json --pgn=/tmp/v3-match.pgn

node scripts/arena-ai.mjs --stockfish=/path/to/stockfish \
  --engine-source=/tmp/intuition-v2-engine.js --opening-set=pilot8 \
  --skills=5 --stockfish-nodes=1000 --budget=150 --max-nodes=64 \
  --output=/tmp/v2-stockfish5.json --pgn=/tmp/v2-stockfish5.pgn

node scripts/arena-ai.mjs --stockfish=/path/to/stockfish \
  --opening-set=pilot8 --skills=5 --stockfish-nodes=1000 \
  --budget=150 --max-nodes=32768 \
  --output=/tmp/v3-stockfish5.json --pgn=/tmp/v3-stockfish5.pgn

node scripts/validate-games.mjs /tmp/v3-match.json
# Diagnose unfinished games separately; this never rescores them.
node scripts/diagnose-unfinished.mjs --stockfish=/path/to/stockfish \
  --input=/tmp/v3-stockfish5.json --output=/tmp/v3-unfinished-diagnostic.json
npm test
npm run build
npm run test:e2e
```

## Limits

Validation passed 87 unit tests, the production build, and 14 browser tests. The real-model browser test disconnects the browser after loading and verifies non-mating hybrid search, quiescence work, a completed depth of at least two, one neural call, a legal move, and rejection of a poisoned capture. Forced-mate tests independently enumerate every defense; perft and special-move tests guard the pinned rules-library internals.

These small matches measure this implementation at the stated settings. They do not establish an Elo, broad opening generalization, or superiority over full-strength Stockfish. Increasing the number of searched positions is an efficiency result; match scores are the evidence for playing strength. The classical evaluation remains simple and the neural model remains small. Browser and hardware timing differences can change completed depth and moves.

Search scores (`scoreCp`) are estimates from this engine's own evaluator, with explicit mate metadata. They are not Stockfish evaluations or calibrated win probabilities. The compatibility `value` field maps the score through `tanh(scoreCp / 600)`; `policyValue` retains the original network output. Reports distinguish tactical positions, quiescence positions, completed depth, inference calls, and separate exact-rule probes.
