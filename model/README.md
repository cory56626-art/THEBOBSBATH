# Pretrained browser baseline

This experiment uses **Peter Baer's Neural Chess v3.1 clean-distilled** model:
116,266 parameters and 464,936 bytes of little-endian float32 weights. It is a
real pretrained square-token transformer with policy and value heads, distilled
from the author's 37.4-million-parameter teacher trained on CC0 Lichess games.
It is a compact research baseline, not evidence of Stockfish-level strength.

- Original project: https://github.com/pbaer/neural-chess
- Pinned source: `524ba14d4af3b739cbe19bd8cd0b14892e6305ca`
- Original capsule: `viz/public/weights/v3.1-nano/`
- Weight SHA-256: `5b584935b8a23a662096d2ecc34f2af8c580058252ef0567194b080187945468`
- Source license: MIT. Weights: CC0-1.0. Original terms: `LICENSE.upstream.txt`.
- Full provenance and limitations: `provenance.json`.

The upstream inference source is preserved in `src/` and bundled into
`runtime.js`. No ONNX, remote inference, runtime CDN, or GPU is required.
Rebuild the runtime with:

```sh
npx esbuild@0.25.12 model/src/index.ts --bundle --format=esm --outfile=model/runtime.js
```

## Interface

```js
import { loadNeuralModel } from './model/index.js';
const model = await loadNeuralModel();
const result = model.infer(chess); // chess.js instance or FEN string
// result.candidates: [{uci, san, index, probability, logit}], sorted descending
// result.value: [-1, +1], from the SIDE TO MOVE's perspective
// result.entropy: entropy / log(number of legal moves), in [0,1]
// result.confidence: largest policy probability, NOT calibrated correctness
```

Passing a Chess instance retains repetition history. A FEN alone does not
contain that history; an optional `{repetitionCount}` overrides the inferred
count when the caller tracks it externally. Board encoding mirrors ranks for
black to move, retains files, and includes castling, en passant, counters, and
repetition planes. Every legal move is included, including castling, en passant,
queen promotions, and all underpromotions. The legal move list remains the
rules authority. Policy normalization uses legal logits directly.

All three experimental modes must use these same weights and inference
implementation. Search changes how policy/value estimates are used, not which
network supplies them. Raw neural value is not a centipawn evaluation, and a
large policy probability is not a proven probability of correctness.
