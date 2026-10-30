# Development diagnosis of the v2 losses

This examines the three completed Skill 5 losses in the [recorded v2 bot arena](ai-bot-arena.json), games 5, 6 and 8. The truncated game is excluded. These positions were selected after seeing losses and are **development examples**, not a held-out test or evidence for a new engine's strength.

Stockfish 19 independently analyzed each INTUITION decision in chronological order, with a 100,000-node unrestricted root search and a separate 100,000-node search restricted to the recorded move. Hash was cleared before every query. The first drop of at least 200 centipawns in each game was then checked at 500,000 nodes per query. The full move history was supplied, not just a FEN.

A node cap can interrupt an aspiration search and leave the last reported score as a bound. This diagnostic uses the last unbounded score and its associated PV, retaining the final reported line separately in the raw data. “Unbounded” describes the search report, not mathematical proof of the position's value. Restricted and unrestricted searches can still disagree. This is a fixed-compute estimate.

| Arena game | First large measured drop | Reference move | Loss at 100k nodes | Loss at 500k nodes |
| --- | --- | --- | ---: | ---: |
| 5, Italian, INTUITION White | 7.Be3 | 7.d4 | 203 cp | 211 cp |
| 6, Italian, INTUITION Black | 5...Nge7 | 5...Nf6 | 268 cp | 241 cp |
| 8, Queen's Gambit, INTUITION Black | 9...hxg5 | 9...dxc4 | 232 cp | 219 cp |

All three reference-move identities remained the same in the 500,000-node check. These are the first large measured drops under the stated protocol; they do not establish which move alone caused the eventual game loss.

## What the positions show

**Game 5 misses an active central opportunity.** Before `7.Be3`, the higher-budget reference scores White at +222 cp with `d4`; the restricted `Be3` line scores +11 cp. Its line begins `Be3 Bxe3 fxe3 d6`, while `d4` can lead to central exchanges and checks against Black's uncastled king. This throws away an estimated advantage rather than immediately producing a losing position. A material-only hanging-piece check cannot diagnose the whole opportunity.

**Game 6 exposes a kingside attack during development.** The reference scores `5...Nf6` at -23 cp and `5...Nge7` at -264 cp from Black's perspective. After the recorded move, the line begins `Nge7 Ng5 d5 exd5 Na5 Qh5`. The knight on g5 and queen activity create concrete pressure near f7. Development and king safety need more than a check for an immediate opponent mate.

**Game 8's attractive capture has tactical costs.** `9...hxg5` captures White's knight, but after `hxg5 hxg5` the opened kingside and advanced pawn give White strong activity. The higher-budget restricted line continues `Ne4 f3 f5 gxf6`; it estimates Black at -202 cp. The reference instead prefers central counterplay with `dxc4`, scoring Black at +17 cp. Counting only the first capture would miss the resulting position.

## Implications for the next engine

At each of these decisions v2 completed only five or six neural tree visits within its 150 ms cap. Its mate-in-one guard works, but that amount of neural search examines very few alternatives. A useful next experiment is faster adversarial search through forcing continuations, with capture stabilization and an evaluation that accounts for material, development, and king safety. Neural policy can order promising moves; human-outcome value predictions should not be the only safeguard against short tactical sequences.

These observations motivate an experiment. They do not prove that any particular search algorithm, evaluation term, or new model will be stronger. A candidate must also play fresh color-reversed games at disclosed limits, with these inspected examples kept out of held-out validation.

- [Raw diagnostic scores, FENs, histories, PVs and fingerprints](v2-loss-diagnosis.json)
- [Reproduction script](../scripts/diagnose-v2-losses.mjs)

```sh
node scripts/diagnose-v2-losses.mjs --stockfish=/path/to/stockfish
```

Stockfish is an offline diagnostic oracle here and is not called by the playing engine.
