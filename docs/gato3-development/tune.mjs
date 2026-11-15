// Texel tuning of Gato 3's evaluation weights on self-play outcomes.
// Usage: node .dev/tune.mjs out.json data1.txt data2.txt ...
import { readFileSync, writeFileSync } from 'node:fs';
import { createGatoSearcher } from '../../src/gato-search.js';
import { PARAM_COUNT, PARAMS, gato2Weights } from '../../src/gato-eval-params.js';

const [outPath, ...inputs] = process.argv.slice(2);
const epochs = Number(process.env.EPOCHS || 400), lr = Number(process.env.LR || 1.5), lambda = Number(process.env.LAMBDA || 2e-8);
const init = gato2Weights();
const searcher = createGatoSearcher(init);
let seed = 12345;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ---- build the dataset (sparse features of each quiet leaf) ----
const lines = inputs.flatMap(path => readFileSync(path, 'utf8').split('\n').filter(Boolean));
const seen = new Set();
const rows = [];
let t0 = Date.now();
for (const line of lines) {
  const [fen, result] = line.split(';');
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) continue; // duplicate positions from shared openings
  seen.add(key);
  const leaf = searcher.traceQuietLeaf(fen);
  const idx = [], val = [];
  for (let i = 0; i < PARAM_COUNT; i++) if (leaf.features[i]) { idx.push(i); val.push(leaf.features[i]); }
  rows.push({ idx: Int32Array.from(idx), val: Float64Array.from(val), phase: leaf.phase, mopUp: leaf.mopUp, result: Number(result) });
}
console.log(`positions ${rows.length} (from ${lines.length} lines) built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
const split = Math.floor(rows.length * 0.9);
const train = rows.slice(0, split), valid = rows.slice(split);

const wMg = Float64Array.from(init.mg), wEg = Float64Array.from(init.eg);
const score = (row, mg = wMg, eg = wEg) => {
  let m = 0, e = row.mopUp;
  for (let k = 0; k < row.idx.length; k++) { const i = row.idx[k], v = row.val[k]; m += mg[i] * v; e += eg[i] * v; }
  return (m * row.phase + e * (24 - row.phase)) / 24;
};
const sigmoid = (s, K) => 1 / (1 + Math.pow(10, -K * s / 400));
const error = (set, K, mg, eg) => set.reduce((sum, row) => sum + (row.result - sigmoid(score(row, mg, eg), K)) ** 2, 0) / set.length;

// ---- fit the logistic scale K for the initial weights ----
let lo = 0.2, hi = 3;
for (let i = 0; i < 40; i++) {
  const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
  if (error(train, a) < error(train, b)) hi = b; else lo = a;
}
const K = (lo + hi) / 2;
const baseTrain = error(train, K), baseValid = error(valid, K);
console.log(`K ${K.toFixed(4)} initial train ${baseTrain.toFixed(6)} valid ${baseValid.toFixed(6)}`);

// ---- Adam, full batch, L2 pull toward the handcrafted starting point ----
const n = PARAM_COUNT;
const mMg = new Float64Array(n), vMg = new Float64Array(n), mEg = new Float64Array(n), vEg = new Float64Array(n);
const gMg = new Float64Array(n), gEg = new Float64Array(n);
const beta1 = 0.9, beta2 = 0.999, eps = 1e-12;
let best = { valid: baseValid, mg: Float64Array.from(wMg), eg: Float64Array.from(wEg), epoch: 0 };
const ln10 = Math.log(10);
t0 = Date.now();
for (let epoch = 1; epoch <= epochs; epoch++) {
  gMg.fill(0); gEg.fill(0);
  for (const row of train) {
    const s = score(row), p = sigmoid(s, K);
    // d/ds (r - p)^2 = -2 (r - p) p (1 - p) K ln10 / 400
    const d = -2 * (row.result - p) * p * (1 - p) * K * ln10 / 400;
    const fm = d * row.phase / 24, fe = d * (24 - row.phase) / 24;
    for (let k = 0; k < row.idx.length; k++) { const i = row.idx[k], v = row.val[k]; gMg[i] += fm * v; gEg[i] += fe * v; }
  }
  for (let i = 0; i < n; i++) {
    const gm = gMg[i] / train.length + 2 * lambda * (wMg[i] - init.mg[i]);
    const ge = gEg[i] / train.length + 2 * lambda * (wEg[i] - init.eg[i]);
    mMg[i] = beta1 * mMg[i] + (1 - beta1) * gm; vMg[i] = beta2 * vMg[i] + (1 - beta2) * gm * gm;
    mEg[i] = beta1 * mEg[i] + (1 - beta1) * ge; vEg[i] = beta2 * vEg[i] + (1 - beta2) * ge * ge;
    const c1 = 1 - beta1 ** epoch, c2 = 1 - beta2 ** epoch;
    wMg[i] -= lr * (mMg[i] / c1) / (Math.sqrt(vMg[i] / c2) + eps);
    wEg[i] -= lr * (mEg[i] / c1) / (Math.sqrt(vEg[i] / c2) + eps);
  }
  if (epoch % 25 === 0 || epoch === epochs) {
    const rounded = [Float64Array.from(wMg, Math.round), Float64Array.from(wEg, Math.round)];
    const tr = error(train, K, ...rounded), va = error(valid, K, ...rounded);
    if (va < best.valid) best = { valid: va, mg: rounded[0], eg: rounded[1], epoch };
    console.log(`epoch ${epoch} train ${tr.toFixed(6)} valid ${va.toFixed(6)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
const names = Object.entries(PARAMS).sort((a, b) => a[1] - b[1]);
const nameOf = i => { let name = ''; for (const [key, start] of names) if (start <= i) name = `${key}[${i - start}]`; return name; };
const scalar = ['doubled', 'isolated', 'supported', 'phalanx', 'passedEnemyKing', 'passedOwnKing', 'passedBlocked', 'rookOpen', 'rookSemiOpen', 'shieldOne', 'shieldTwo', 'shieldMissing', 'shieldFile', 'bishopPair', 'threatByPawn', 'threatByMinor', 'threatByRook', 'tempo'];
const summary = Object.fromEntries(scalar.map(key => [key, [init.mg[PARAMS[key]], init.eg[PARAMS[key]], best.mg[PARAMS[key]], best.eg[PARAMS[key]]]]));
summary.kingDangerMg = Array.from(best.mg.slice(PARAMS.kingDanger, PARAMS.kingDanger + 12));
summary.passedMg = Array.from(best.mg.slice(PARAMS.passed, PARAMS.passed + 8));
summary.passedEg = Array.from(best.eg.slice(PARAMS.passed, PARAMS.passed + 8));
const material = type => [best.mg.slice(PARAMS.pst + (type - 1) * 64 + 8, PARAMS.pst + (type - 1) * 64 + 56), best.eg.slice(PARAMS.pst + (type - 1) * 64 + 8, PARAMS.pst + (type - 1) * 64 + 56)].map(a => Math.round(a.reduce((x, y) => x + y, 0) / a.length));
summary.meanPstMaterial = { P: material(1), N: material(2), B: material(3), R: material(4), Q: material(5) };
console.log(JSON.stringify(summary));
writeFileSync(outPath, JSON.stringify({ K, positions: rows.length, train: train.length, valid: valid.length, initial: { train: baseTrain, valid: baseValid }, best: { epoch: best.epoch, valid: best.valid, train: error(train, K, best.mg, best.eg) }, settings: { epochs, lr, lambda }, mg: Array.from(best.mg), eg: Array.from(best.eg), summary }, null, 1));
console.log(`best epoch ${best.epoch} valid ${best.valid.toFixed(6)} (initial ${baseValid.toFixed(6)}) -> ${outPath}`);
void nameOf;
