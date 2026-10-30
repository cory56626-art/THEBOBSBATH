/**
 * Reproduce the shipped small disagreement controller with real neural search.
 * Labels mean "reference search chose a different move", NOT "a better move".
 * Wall-time-limited labels depend on hardware and scheduling; seed controls
 * position generation and the grouped training/holdout split, not timing.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';
import { calibrateController, CALIBRATION_POSITIONS } from '../src/benchmark.js';
import { trainController } from '../src/controller.js';

const root = new URL('../', import.meta.url);
if (process.argv.includes('--reuse-labels')) {
  // Refit exactly the existing labels. This deliberately performs no neural
  // inference and keeps the original generation timing and hardware metadata.
  const oldGate = JSON.parse(await readFile(new URL('src/default-controller.json', root), 'utf8'));
  const oldReport = JSON.parse(await readFile(new URL('docs/default-calibration.json', root), 'utf8'));
  const refitStarted = performance.now();
  const gate = trainController(oldGate.samples, { seed: 42, iterations: 600 });
  gate.referenceSettings = oldGate.referenceSettings;
  gate.createdAt = new Date().toISOString();
  const report = {
    ...oldReport,
    split: { trainGroups: gate.training.trainGroups, testGroups: gate.training.testGroups, trainCount: gate.metrics.trainCount, testCount: gate.metrics.testCount, splitPolicy: gate.training.splitPolicy, splitOffset: gate.training.splitOffset, holdoutHasBothClasses: gate.training.holdoutHasBothClasses, warnings: gate.training.warnings },
    heldoutMetrics: { ...gate.metrics, majorityClassAccuracy: Math.max(gate.metrics.testPositiveRate, 1 - gate.metrics.testPositiveRate), brierBeatsConstantTrainRate: gate.metrics.brier < gate.metrics.baselineBrier },
    originalHoldout: oldReport.originalHoldout ?? { split: oldReport.split, metrics: oldReport.heldoutMetrics },
    refit: {
      completedAt: gate.createdAt,
      durationMs: performance.now() - refitStarted,
      command: 'node scripts/train-default-controller.mjs --reuse-labels',
      newNeuralInference: false,
      seed: 42,
      iterations: 600,
      selectionCriterion: 'First deterministic cyclic group split containing both label classes in train and holdout; selected before fitting and without evaluating candidate split metrics.',
      samplesSHA256: createHash('sha256').update(JSON.stringify(oldGate.samples)).digest('hex'),
      controllerSourceSHA256: createHash('sha256').update(await readFile(new URL('src/controller.js', root))).digest('hex'),
    },
  };
  gate.provenance = { ...report, heldoutMetrics: undefined, description: 'Initial controller refitted from unchanged real neural-search labels with a deterministic class-valid grouped split.' };
  await writeFile(new URL('src/default-controller.json', root), JSON.stringify(gate, null, 2) + '\n');
  await writeFile(new URL('docs/default-calibration.json', root), JSON.stringify(report, null, 2) + '\n');
  for (const warning of gate.training.warnings) console.warn(warning);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const manifest = JSON.parse(await readFile(new URL('model/capsule.json', root), 'utf8'));
const weights = await readFile(new URL('model/weights.bin', root));
if (createHash('sha256').update(weights).digest('hex') !== MODEL_METADATA.weightsSHA256) throw new Error('Model weight fingerprint mismatch');
const model = createModelFromBytes(manifest, weights);
model.infer(new Chess()); // Exclude initial JIT/weight warm-up from search timings.

const requestedSettings = { budgetMs: 500, maxNodes: 128, seed: 42 };
const sourceSHA256 = {};
for (const path of ['src/engine.js', 'src/benchmark.js', 'src/controller.js']) {
  sourceSHA256[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
}
const startedAt = new Date().toISOString();
const start = performance.now();
let settings = requestedSettings;
let gate;
let fallbackReason = null;
const onProgress = ({ completed, total }) => {
  if (completed % 8 === 0 || completed === total) console.log(`Labelled ${completed}/${total} calibration positions`);
};
try {
  gate = await calibrateController(model, { ...settings, onProgress });
} catch (error) {
  if (!/both changed and unchanged/i.test(error.message)) throw error;
  fallbackReason = error.message;
  settings = { ...requestedSettings, budgetMs: 1000 };
  console.warn('500 ms labels lacked both classes; retrying at 1000 ms.');
  gate = await calibrateController(model, { ...settings, onProgress });
}

const positives = gate.samples.filter(sample => sample.label === 1).length;
const baselineAccuracy = Math.max(gate.metrics.testPositiveRate, 1 - gate.metrics.testPositiveRate);
const report = {
  description: 'Small initial calibration for the selective-computation experiment; not a validated chess-strength improvement.',
  labelDefinition: gate.labelDefinition,
  startedAt,
  completedAt: new Date().toISOString(),
  durationMs: performance.now() - start,
  model: MODEL_METADATA,
  requestedSettings,
  actualSettings: settings,
  fallbackReason,
  positionGenerationSeed: 20261030,
  positionCount: CALIBRATION_POSITIONS.length,
  sampleCount: gate.samples.length,
  changedMoves: positives,
  unchangedMoves: gate.samples.length - positives,
  split: { trainGroups: gate.training.trainGroups, testGroups: gate.training.testGroups, trainCount: gate.metrics.trainCount, testCount: gate.metrics.testCount, splitPolicy: gate.training.splitPolicy, splitOffset: gate.training.splitOffset, holdoutHasBothClasses: gate.training.holdoutHasBothClasses, warnings: gate.training.warnings },
  heldoutMetrics: { ...gate.metrics, majorityClassAccuracy: baselineAccuracy, brierBeatsConstantTrainRate: gate.metrics.brier < gate.metrics.baselineBrier },
  runtime: { node: process.version, platform: os.platform(), release: os.release(), architecture: os.arch(), cpuModel: os.cpus()[0]?.model ?? 'unknown', logicalCPUs: os.cpus().length },
  sourceSHA256,
  limitations: [
    'Only 40 calibration positions, grouped by 10 generated games; the heldout set is small.',
    'Labels measure disagreement with bounded same-model search, not objective errors or proven move improvements.',
    'Reference labels depend on CPU speed and process scheduling because the reference has a wall-time cap.',
    'The controller is tied to the stated model and reference settings; different budgets require recalibration.',
    'No match-strength gain or Stockfish superiority is established by this calibration.',
  ],
};
gate.provenance = {
  ...report,
  heldoutMetrics: undefined,
  description: 'Shipped initial controller trained by scripts/train-default-controller.mjs',
};
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('src/default-controller.json', root), JSON.stringify(gate, null, 2) + '\n');
await writeFile(new URL('docs/default-calibration.json', root), JSON.stringify(report, null, 2) + '\n');
for (const warning of gate.training.warnings) console.warn(warning);
console.log(JSON.stringify(report, null, 2));
