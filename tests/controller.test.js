import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { FEATURE_NAMES, canonicalPositionKey, extractFeatures, predictRisk, trainController } from '../src/controller.js';

function trainingSamples() {
  const game = new Chess();
  const line = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7', 'c4', 'c6', 'Nc3', 'Qc7'];
  return line.map((move, index) => {
    game.move(move);
    const label = index % 2;
    return {
      fen: game.fen(),
      groupId: `opening-group-${Math.floor(index / 3)}`,
      modelId: 'fixture-model',
      label,
      features: FEATURE_NAMES.map((_, feature) => (label ? 0.8 : 0.2) + feature * 0.01 + index * 0.001),
    };
  });
}

test('controller extracts finite, fixed-width features for quiet and checked positions', () => {
  const prediction = { candidates: [{ uci: 'e2e4', probability: 0.6 }, { uci: 'd2d4', probability: 0.4 }], confidence: 0.6, entropy: 0.8, value: 0.1 };
  for (const game of [new Chess(), new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1')]) {
    const features = extractFeatures(game, prediction);
    assert.equal(features.length, FEATURE_NAMES.length);
    assert.ok(features.every(Number.isFinite));
  }
});

test('fitted controller keeps opening groups disjoint between training and held-out evaluation', () => {
  const gate = trainController(trainingSamples(), { seed: 42, iterations: 100 });
  assert.equal(gate.trained, true);
  const trainingGroups = new Set(gate.training.trainGroups);
  assert.ok(gate.training.testGroups.length > 0);
  assert.ok(gate.training.testGroups.every((group) => !trainingGroups.has(group)));
  const trainingKeys = new Set(gate.training.trainKeys);
  assert.ok(gate.training.testKeys.every((key) => !trainingKeys.has(key)));
  assert.equal(gate.metrics.trainCount + gate.metrics.testCount, 24);
  assert.ok(gate.metrics.brier >= 0 && gate.metrics.brier <= 1);
});

test('held-out feature outliers cannot change the fitted normalizer or weights', () => {
  const samples = trainingSamples();
  const options = { seed: 19, iterations: 100 };
  const first = trainController(samples, options);
  const heldOut = new Set(first.training.testGroups);
  const altered = samples.map((sample) => heldOut.has(sample.groupId)
    ? { ...sample, features: sample.features.map((value) => value + 1_000_000) }
    : sample);
  const second = trainController(altered, options);
  assert.deepEqual(second.training.trainKeys, first.training.trainKeys);
  assert.deepEqual(second.means, first.means);
  assert.deepEqual(second.scales, first.scales);
  assert.deepEqual(second.weights, first.weights);
  assert.equal(second.bias, first.bias);
});

test('same seed and samples reproduce the fitted controller', () => {
  const a = trainController(trainingSamples(), { seed: 7, iterations: 120 });
  const b = trainController(trainingSamples(), { seed: 7, iterations: 120 });
  assert.deepEqual(a.weights, b.weights);
  assert.deepEqual(a.training.trainKeys, b.training.trainKeys);
  const risk = predictRisk(a, trainingSamples()[0].features);
  assert.ok(Number.isFinite(risk) && risk >= 0 && risk <= 1);
});

test('duplicate positions differing only in move counters do not inflate sample count', () => {
  const samples = trainingSamples();
  const duplicate = { ...samples[0], fen: samples[0].fen.split(' ').slice(0, 4).join(' ') + ' 78 120' };
  assert.equal(canonicalPositionKey(duplicate.fen), canonicalPositionKey(samples[0].fen));
  const gate = trainController([...samples, duplicate], { seed: 42, iterations: 80 });
  assert.equal(gate.metrics.trainCount + gate.metrics.testCount, samples.length);
});

test('calibration refuses insufficient data and single-class training data', () => {
  assert.throws(() => trainController(trainingSamples().slice(0, 5)), /enough|least|sample|position/i);
  assert.throws(() => trainController(trainingSamples().map((sample) => ({ ...sample, label: 0 }))), /class|label|both|variation/i);
});

test('missing or malformed controllers do not report a fake learned risk', () => {
  assert.equal(predictRisk(null, new Array(FEATURE_NAMES.length).fill(0)), null);
  const gate = trainController(trainingSamples(), { seed: 42, iterations: 50 });
  assert.equal(predictRisk(gate, [NaN]), null);
});

test('grouped calibration puts both label classes in train and holdout when feasible', () => {
  const samples = trainingSamples().map((sample, index) => ({ ...sample, label: Math.floor(index / 3) < 2 ? 1 : 0 }));
  const gate = trainController(samples, { seed: 42, iterations: 80 });
  const train = new Set(gate.training.trainGroups);
  const heldOut = new Set(gate.training.testGroups);
  assert.equal(new Set(samples.filter((sample) => train.has(sample.groupId)).map((sample) => sample.label)).size, 2);
  assert.equal(new Set(samples.filter((sample) => heldOut.has(sample.groupId)).map((sample) => sample.label)).size, 2);
  assert.equal(gate.training.holdoutHasBothClasses, true);
  assert.deepEqual(gate.training.warnings, []);
  assert.ok(gate.training.testGroups.every((group) => !train.has(group)));
});

test('a rare class confined to one group produces an explicit limited-holdout warning', () => {
  const samples = trainingSamples().map((sample, index) => ({ ...sample, label: index < 3 ? 1 : 0 }));
  const gate = trainController(samples, { seed: 42, iterations: 80 });
  assert.equal(gate.training.holdoutHasBothClasses, false);
  assert.match(gate.training.warnings.join(' '), /holdout lacks changed or unchanged/i);
  const trainGroups = new Set(gate.training.trainGroups);
  assert.equal(new Set(samples.filter((sample) => trainGroups.has(sample.groupId)).map((sample) => sample.label)).size, 2);
  assert.ok(gate.training.testGroups.every((group) => !trainGroups.has(group)));
});

test('controller calibration rejects labels mixed across different model weights', () => {
  const samples = trainingSamples();
  samples[0] = { ...samples[0], modelId: 'different-neural-weights' };
  assert.throws(() => trainController(samples), /same neural model/i);
});
