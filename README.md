# INTUITION — Chess research lab

[Open the experiment on GitHub Pages](https://cory56626-art.github.io/THEBOBSBATH/)

A chess engine combining neural move ordering with fast tactical search. The experiment retains **direct neural play**, **always searching**, and **selective searching** as separate decision procedures. The previous game remains in Git history.

This is an experiment, **not a claim to have surpassed Stockfish**. The small pretrained model makes the project practical on ordinary devices. Its playing strength must be measured rather than inferred from model size, a puzzle result, or an unrelated published Elo rating.

## Try it

- **Play:** choose a decision mode, your side, and a search budget. Click a piece and a destination to make a legal move. Start a new game, undo, flip the board, or export the game as PGN.
- **Position lab:** load a FEN position and compare all three modes. Inspect each move, its inference/search time, and its search work. Direct scores come from the neural model; hybrid search uses its own positional evaluation. Neither is an independent assessment of correctness.
- **Benchmark:** run the supplied position suite or paired games. A game pair uses the same opening with colors reversed. Export raw results instead of relying only on the summary.
- **Controller:** inspect or calibrate the selective-search controller. Training examples and held-out evaluation have different roles; controller labels come from additional model-guided search, which is a reference procedure rather than a perfect chess oracle.

**New game** confirms the restart, clears the board history and decision metrics, and returns to Play while preserving your side, decision mode, and board orientation. As Black, the engine makes exactly one opening move for White. In Watch mode, a new game restarts autoplay; Pause watching stops it. You can make White's first move while the model is loading, and the engine replies once ready. Restarting during a calculation cancels the previous game and prevents a late result from moving pieces on the new board.

The model and engine run locally in your browser. No API key, account, paid inference service, or backend is required. Once all assets are loaded, model decisions do not require a remote model request. Refreshing the site still requires the static files to be available.

## What the three modes mean

| Mode | Decision procedure | What it tests |
| --- | --- | --- |
| Direct | Select the strongest legal move predicted by the policy, without expanding a future-position search tree. | What the pretrained model can do directly. |
| Search | Order moves with the neural policy, then use iterative deepening, alpha-beta, capture quiescence, and positional evaluation. | Whether the hybrid decision engine improves on the raw policy. |
| Selective | Use the direct policy unless the controller decides additional computation is worthwhile. | Whether an allocation rule can save computation while preserving decision quality. |

Every mode uses the same neural weights, legal-move rules, and initial position. Search also has a handcrafted evaluation function, so this compares complete decision procedures rather than isolating computation alone. Direct still performs neural inference and legal move generation; “no search” does not mean zero computation. A high policy probability is not a calibrated guarantee that a move is correct. Two methods can also agree on a mistake.

The included model is Peter Baer's **v3.1-clean-distilled** transformer: 116,266 parameters and 464,936 weight bytes. It was distilled from a larger model trained on human Lichess games. It is not a Stockfish-trained model. Exact source revision, fingerprint, and license information are in [model/provenance.json](model/provenance.json).

## AI version 3

The previous engine examined only about five or six neural tree positions in its 150 ms test games. Independent analysis found missed central breaks and short kingside tactics. Version 3 calls the same neural model once to order root moves, then spends the remaining budget on much faster tactical evaluation.

- Iterative deepening keeps the last fully completed search result. Alpha-beta pruning, move ordering, killer/history heuristics, and a bounded transposition table reduce repeated work.
- Capture quiescence continues exchanges beyond the nominal depth and searches all legal check evasions. Evaluation combines material, phase-dependent piece placement, mobility, pawn structure, passed pawns, and king safety.
- Draw detection preserves repetition history and the fifty-move counter. Exact mate selection and final mate-in-one safety checks remain in place.
- The position cap now counts tactical search positions, including quiescence, rather than neural tree visits. The default is 32,768 positions. Reports include `nodeUnit`, `searchKind`, `qNodes`, completed depth, and the single neural inference separately.

The new evaluation and search are original project code; Stockfish remains an external test opponent and judge. The neural weights have not been retrained. See [version 3 strength tests and replayable matches](docs/AI-STRENGTH-V3.md) for the fixed time limits, results, and remaining weaknesses.

## Earlier AI version 2

Version 2 made Search the default playing mode. The raw direct policy remains available as the unchanged experimental baseline.

- Proven checkmates override neural preferences and visit counts. Solved terminal branches are not repeatedly searched while alternatives remain unresolved.
- Tactical verification checks for immediate opponent mates, including replacement moves chosen after a bad policy suggestion is rejected. Neural tree visits and rule-based tactical probes are recorded separately.
- A private game board is reused and undone during search, preserving history and repetition without replaying the entire game for every simulation.
- Selective mode can skip search only with compatible evidence for this engine, at least 30 mixed-class held-out positions, and Brier error below its constant-predictor baseline. The shipped 40-position pilot does not meet this standard, so it falls back to verification.

The earlier Stockfish assessment, controlled games, and two limited-opponent pilots are preserved in [version 2 evaluation](docs/AI-EVALUATION.md). Small experiments do not establish an Elo rating or superiority over Stockfish.

## Read results carefully

1. **Budget both time and work.** Node limits make repeated comparisons easier to interpret. Version 3 checks time at each tactical position and reserves time for the final rules check. The wall-clock cap remains soft because the initial neural call and individual rule operations cannot be interrupted. Pauses and throttling can still cause overruns. Paired games deduct actual measured decision time from equal starting clocks. Record browser and settings with results. Version 2 neural visits and version 3 tactical positions are different work units.
2. **Keep the opponent and openings fixed.** Compare game pairs with colors reversed. Do not mix settings or device classes into one strength claim.
3. **Separate training and testing.** Evaluate a fitted controller on held-out opening groups. The split is selected for label availability before fitting, never by its accuracy. If one class cannot be represented in both splits, the report includes an explicit limited-holdout warning. Selecting thresholds on a test suite and then reporting the same suite as independent evidence overstates generalization.
4. **Treat search labels as provisional.** The controller learns whether deeper search changes the policy's first choice. A changed move does not automatically prove an improvement. Search can also miss the best move.
5. **Distinguish agreement from strength.** Policy agreement, puzzle accuracy, and reduced node count are useful diagnostics. Match results and severe mistakes are separate outcomes.
6. **Avoid unsupported Elo claims.** Small browser matches are noisy. Draws, move-cap adjudications, and unfinished games need to remain visible. There is no automatic conversion from this experiment's scores to Lichess or Stockfish Elo.

The supplied controller is an initial pilot fitted from only 40 reference-labelled positions, with opening groups held out for evaluation. Its small-sample metrics do not establish generalization or a playing-strength gain. Version 2 declines to use it to skip search. A replacement needs enough independent validation, a compatible reference engine and budget, and better Brier error than its constant baseline. The current calibration button still collects 40 examples for study; that is insufficient to authorize skipping. Personalities, opponent exploitation, a committee of independent models, and a claim of superiority to a full-strength engine are outside this first experiment.

The shipped pilot uses a 500 ms search cap and 128-node cap. Only 3 of its 40 reference decisions changed the direct move. Its held-out Brier score is about 0.123, compared with 0.077 for the constant training-prior baseline (lower is better). This controller currently underperforms that simple calibration baseline; the dashboard reports the limitation. Those results motivate collecting more independent, varied reference examples rather than claiming the controller is proven.

## Develop and test

Requires Node.js 24 or a compatible current Node.js release and npm.

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For local development:

```sh
npm run dev -- --host 127.0.0.1
```

The Vite base path is `/THEBOBSBATH/`, matching the repository's GitHub Pages URL. Browser tests start their own local server; set `CHESS_LAB_BASE_URL` to test a running deployment instead:

```sh
CHESS_LAB_BASE_URL=https://cory56626-art.github.io/THEBOBSBATH/ npm run test:e2e
```

Unit tests cover the decision engine and controller, including chess rule edge cases and computation limits. Chromium tests load the actual browser model and exercise the playable board, position comparison, exports, and benchmark controls. Reset regressions cover visible New game feedback, cleared history/metrics, Black's opening move, Watch-mode restart, cancellation during search, and a delayed model download followed by a human move. CI runs installation, unit tests, the production build, and browser tests before deploying the generated `dist/` artifact.

## GitHub Pages

`.github/workflows/pages.yml` publishes verified pushes to `main` using GitHub Actions. Repository Settings → Pages must use **GitHub Actions** as its source. The workflow does not change repository visibility or credentials. Pull requests run verification without publishing.

## Sources and attribution

The inference implementation, pretrained weights, source revision, licenses, and model fingerprint are recorded under `model/`; see also [THIRD_PARTY.txt](THIRD_PARTY.txt).

Research informing the comparison:

- [Amortized Planning with Large-Scale Transformers: A Case Study on Chess](https://arxiv.org/html/2402.04494v2) — strong search-free play and its remaining limitations.
- [Leela Chess Zero architecture](https://lczero.org/dev/overview/) — separate policy/value predictions and tree search.
- [Chessformer: A Unified Architecture for Chess Modeling](https://arxiv.org/abs/2605.19091) — chess-specific neural representations.
- [Engineering Efficient Self-Play Chess](https://arxiv.org/html/2609.37447v1) — why local efficiency improvements require full-system evaluation.

Results in those papers belong to their own models, data, hardware, and evaluation protocols. They are not results achieved by this project.
