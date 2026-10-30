# Neural model assessment for the AI strength iteration

The current 116k pretrained provider remains unchanged. A larger model has not
been demonstrated to improve this engine, and the first controlled iteration
addresses tactical search and unsafe selective-search decisions instead.

## Available weights

The existing model is Peter Baer's `v3.1-clean-distilled`: 116,266 parameters,
464,936 bytes, MIT inference source and CC0 weights. Its value is a prediction
of game outcome **from the side to move**, in `[-1,1]`; a sign flip is required
when backing up across a ply. It is not a centipawn evaluation or proof that a
position is won. The upstream teacher was trained on human games; the compact
student learns that teacher's policy and value predictions.

[Upstream model and training details](https://github.com/pbaer/neural-chess)
document 695k, 18.3M, and 37.4M alternatives, but their checkpoints are not in the
public Git tree, there are no GitHub release assets, and the author's Hugging
Face model listing was empty when checked. The upstream `.gitignore` excludes
`model/`, `*.pt`, and `*.pth`. Only the 116k browser capsule is published there.
There is consequently no verified larger drop-in capsule to adopt immediately.

## Private candidate scout

Candidates were measured separately in `/workspace/ai-model-scout`; neither
candidate weights nor ONNX dependencies are added to this repository.

The scout decoded the original LINEAR16 protobuf weights and generated ONNX
using the [LC0 converter architecture](https://github.com/LeelaChessZero/lc0/blob/master/src/neural/onnx/converter.cc):
convolutions, folded batch normalization, squeeze/excitation, residual blocks,
and the 1,858-move policy map. **The custom conversion has not been compared
against independent native LC0 output.** Its results are provisional adapter
observations, not a validated ranking of the original networks.

| Provider | Parameters | Stored model | Native CPU median | Native CPU p95 |
| --- | ---: | ---: | ---: | ---: |
| Current transformer | 116,266 | 0.465 MB | 19.45 ms | 21.20 ms |
| Good Gyal 5 prototype | 593,545 | 2.40 MB ONNX | 1.31 ms | 2.95 ms |
| Bad Gyal 3 prototype | 893,105 | 3.60 MB ONNX | 1.63 ms | 3.24 ms |
| Maia 1900 conversion | Not independently counted | 3.48 MB ONNX | 1.59 ms | 3.21 ms |

These measurements used Node 24.19.0 and ONNX Runtime Node 1.24.1 CPU with one
intra-op and inter-op thread, five warm-up evaluations, and 30 timed evaluations
cycling eight fixed positions. The current transformer uses its existing pure
JavaScript implementation. Native ONNX speed does **not** establish browser WASM
or WebGPU speed, or playing strength under an equal game-clock budget.

A separate headless Chromium 145 check did successfully run all three ONNX
candidates in **ONNX Runtime Web 1.24.1, single-thread WASM**. With one fixed
starting-position tensor, five warm-ups and 30 raw inference calls, Good Gyal
measured 2.5 ms median / 7.0 ms p95, Bad Gyal 3.6 / 35.1 ms, and Maia 6.8 /
36.8 ms. This confirms browser execution readiness, not mobile performance or
strength; these timings exclude board encoding, legal-move mapping, and search.
The substantial p95 variance also matters for strict move clocks.

The eight positions comprised the starting board, a black-to-move opening,
two hanging-queen captures, two mates in one, and two obvious queen promotions.
All four adapters selected the queen captures. The current model selected both
mates and both queen promotions. Good Gyal selected neither mate and moved its
king instead of promoting; Bad Gyal missed both mates and selected knight
promotions; Maia promoted to queens but missed the mates. These deliberately
small raw-policy checks are insufficient for a strength claim. Incomplete FEN
history, model training distributions, policy/feature mapping, and unverified
conversion parity are additional confounders.

## Provenance and adoption blockers

- [Bad Gyal 3 author release](https://github.com/dkappe/leela-chess-weights/releases/tag/bad-gyal-3)
  links [the original 1.60 MB protobuf](https://github.com/dkappe/leela-chess-weights/files/3366818/badgyal-3.pb.gz).
- [Good Gyal 5 author release](https://github.com/dkappe/leela-chess-weights/releases/tag/good-gyal-5)
  links [the original 1.06 MB protobuf](https://github.com/dkappe/leela-chess-weights/files/3422292/goodgyal-5.pb.gz).
- The Bad/Good Gyal repository has no discovered explicit license for these
  weights. Public download availability does not establish redistribution
  permission. **Do not vendor these weights until their license is established.**
- [The Maia conversion card](https://huggingface.co/cstr/maia-chess-onnx-opset15)
  identifies GPL-3.0-or-later terms from
  [CSSLab's original Maia project](https://github.com/CSSLab/maia-chess).
  Its correctly exported file is `maia-1900.onnx`. The similarly named
  `maia-1900-opset15.onnx` is explicitly documented as broken and must not be used.
- [Maia's purpose](https://www.maiachess.com/) is predicting human decisions at
  selected skill levels. That objective does not establish stronger best-defense
  play or a suitably calibrated value function for this engine's search.

Before replacing the current provider, require independently checked encoding
and native-output parity, clear weight redistribution terms, measured browser
latency, and controlled color-reversed games at the same total clock budget.
Keep position checks separate from match strength and retain the 116k baseline
for the comparison. More parameters or faster inference alone do not establish
better chess.
