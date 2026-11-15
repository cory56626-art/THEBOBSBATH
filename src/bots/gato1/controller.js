/** A learned search-disagreement controller, not a certificate of move quality. */
export const FEATURE_NAMES = Object.freeze(['entropy', 'oneMinusConfidence', 'oneMinusMargin', 'inCheck', 'legalMoveCount', 'pieceCount', 'captureRatio', 'checkingRatio', 'valueUncertainty', 'absoluteMaterialImbalance', 'topMoveCapture', 'topMoveCheck']);
export const CONTROLLER_LABEL = 'Reference search chooses a different move than direct policy';
export const canonicalPositionKey = fen => String(fen).trim().split(/\s+/).slice(0, 4).join(' ');
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(n) || 0));
const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));

export function extractFeatures(chess, prediction = {}) {
  const moves = chess.moves({ verbose: true });
  const candidates = [...(prediction.candidates || prediction.policy || [])].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const probs = candidates.map(c => Math.max(0, Number(c.probability) || 0));
  const total = probs.reduce((a, b) => a + b, 0) || 1;
  const normalized = probs.map(p => p / total);
  const confidence = normalized[0] || 0;
  const entropy = normalized.length > 1 ? -normalized.reduce((s, p) => s + (p ? p * Math.log(p) : 0), 0) / Math.log(normalized.length) : 0;
  const top = moves.find(m => m.from + m.to + (m.promotion || '') === candidates[0]?.uci);
  let pieces = 0, material = 0;
  const worth = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (const rank of chess.board()) for (const piece of rank) if (piece) {
    pieces++;
    material += (piece.color === 'w' ? 1 : -1) * worth[piece.type];
  }
  return [clamp(prediction.entropy ?? entropy), 1 - clamp(prediction.confidence ?? confidence), 1 - clamp(confidence - (normalized[1] || 0)), Number(chess.isCheck()), clamp(moves.length / 80), clamp(pieces / 32), moves.length ? moves.filter(m => m.captured).length / moves.length : 0, moves.length ? moves.filter(m => /[+#]/.test(m.san)).length / moves.length : 0, 1 - clamp(Math.abs(prediction.value || 0)), clamp(Math.abs(material) / 39), Number(Boolean(top?.captured)), Number(Boolean(top && /[+#]/.test(top.san)))];
}

function randomSource(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function shuffled(array, random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

export function predictRisk(gate, features) {
  if (!gate?.trained || !Array.isArray(features) || features.length !== gate.weights?.length || features.some(v => !Number.isFinite(v))) return null;
  if (!Number.isFinite(gate.bias) || !gate.weights.every(Number.isFinite) || gate.means?.length !== features.length || gate.scales?.length !== features.length || !gate.means.every(Number.isFinite) || !gate.scales.every(v => Number.isFinite(v) && v > 0)) return null;
  return sigmoid(gate.bias + gate.weights.reduce((sum, w, i) => sum + w * (features[i] - gate.means[i]) / gate.scales[i], 0));
}

export function trainController(samples, { seed = 42, iterations = 600 } = {}) {
  const unique = new Map();
  for (const sample of samples || []) {
    if (!sample?.fen || !Array.isArray(sample.features) || sample.features.length !== FEATURE_NAMES.length || sample.features.some(v => !Number.isFinite(v)) || ![0, 1].includes(Number(sample.label))) continue;
    const key = canonicalPositionKey(sample.fen);
    if (!unique.has(key)) unique.set(key, { ...sample, label: Number(sample.label), key, group: String(sample.groupId ?? key) });
  }
  const clean = [...unique.values()];
  if (clean.length < 12) throw new Error('Controller training needs at least 12 distinct labelled positions.');
  const modelIds = [...new Set(clean.map(s => s.modelId).filter(Boolean))];
  if (modelIds.length > 1) throw new Error('Calibration samples must use the same neural model.');
  const groups = shuffled([...new Set(clean.map(s => s.group))], randomSource(seed));
  if (groups.length < 2) throw new Error('Controller training needs at least two independent position groups.');
  const testGroupCount = Math.max(1, Math.ceil(groups.length * .25));
  let split = null, firstTrainValidSplit = null;
  // Select by label availability BEFORE fitting: never choose a split by its
  // accuracy/Brier. Entire games stay together, and scaling uses training only.
  for (let offset = 0; offset < groups.length; offset++) {
    const testGroups = Array.from({ length: testGroupCount }, (_, i) => groups[(offset + i) % groups.length]);
    const held = new Set(testGroups);
    const trainGroups = groups.filter(g => !held.has(g));
    const train = clean.filter(s => !held.has(s.group)), test = clean.filter(s => held.has(s.group));
    if (train.length < 8 || test.length < 2 || new Set(train.map(s => s.label)).size !== 2) continue;
    const candidate = { train, test, trainGroups, testGroups, offset };
    firstTrainValidSplit ||= candidate;
    if (new Set(test.map(s => s.label)).size === 2) { split = candidate; break; }
  }
  split ||= firstTrainValidSplit;
  if (!split) throw new Error('Calibration needs both changed and unchanged reference moves in its training split. Collect more varied positions.');
  const { train, test, trainGroups, testGroups, offset: splitOffset } = split;
  const holdoutHasBothClasses = new Set(test.map(s => s.label)).size === 2;
  const warnings = holdoutHasBothClasses ? [] : ['Grouped holdout lacks changed or unchanged reference moves; calibration cannot be evaluated across both label classes. Collect more independent labelled games.'];
  const splitPolicy = 'First deterministic cyclic group split with both label classes in train and holdout; otherwise first train-valid split with an explicit insufficient-holdout warning. No metric-based split selection.';
  const means = FEATURE_NAMES.map((_, i) => train.reduce((s, x) => s + x.features[i], 0) / train.length);
  const scales = means.map((mean, i) => Math.max(.05, Math.sqrt(train.reduce((s, x) => s + (x.features[i] - mean) ** 2, 0) / train.length)));
  const examples = train.map(s => ({ x: s.features.map((v, i) => (v - means[i]) / scales[i]), y: s.label }));
  const weights = FEATURE_NAMES.map(() => 0);
  const positiveRate = train.reduce((s, x) => s + x.label, 0) / train.length;
  let bias = Math.log((positiveRate + .01) / (1 - positiveRate + .01));
  for (let epoch = 0; epoch < iterations; epoch++) {
    const gradient = weights.map(() => 0); let gb = 0;
    for (const sample of examples) {
      const error = sigmoid(bias + weights.reduce((s, w, i) => s + w * sample.x[i], 0)) - sample.y;
      gb += error;
      for (let i = 0; i < weights.length; i++) gradient[i] += error * sample.x[i];
    }
    const rate = .16 / (1 + epoch / 300);
    bias -= rate * gb / examples.length;
    for (let i = 0; i < weights.length; i++) weights[i] -= rate * (gradient[i] / examples.length + .025 * weights[i]);
  }
  const gate = { version: 1, trained: true, modelId: modelIds[0] || 'unknown', featureNames: [...FEATURE_NAMES], weights, bias, means, scales, threshold: .5, labelDefinition: CONTROLLER_LABEL, training: { seed, iterations, trainKeys: train.map(s => s.key), testKeys: test.map(s => s.key), trainGroups, testGroups, splitPolicy, splitOffset, holdoutHasBothClasses, warnings, labelDefinition: CONTROLLER_LABEL }, samples: clean.map(({ key, group, ...s }) => s) };
  let correct = 0, brier = 0, falseNegatives = 0, falsePositives = 0, truePositives = 0, trueNegatives = 0;
  for (const sample of test) {
    const probability = predictRisk(gate, sample.features), predicted = probability >= .5 ? 1 : 0;
    brier += (probability - sample.label) ** 2; correct += Number(predicted === sample.label);
    if (predicted && sample.label) truePositives++;
    else if (predicted) falsePositives++;
    else if (sample.label) falseNegatives++;
    else trueNegatives++;
  }
  gate.metrics = { accuracy: correct / test.length, brier: brier / test.length, falseNegatives, falsePositives, truePositives, trueNegatives, testCount: test.length, trainCount: train.length, positiveRate, testPositiveRate: test.reduce((s, x) => s + x.label, 0) / test.length, baselineBrier: test.reduce((s, x) => s + (positiveRate - x.label) ** 2, 0) / test.length };
  return gate;
}
