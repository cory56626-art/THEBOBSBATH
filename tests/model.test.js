import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { boardFeatures, createModelFromBytes, legalMoveIndices, MODEL_METADATA } from '../model/index.js';

const manifest = JSON.parse(readFileSync(new URL('../model/capsule.json', import.meta.url)));
const weights = readFileSync(new URL('../model/weights.bin', import.meta.url));
const fixtures = JSON.parse(readFileSync(new URL('../model/parity-fixtures.json', import.meta.url))).cases;
const model = createModelFromBytes(manifest, weights);

test('vendored pretrained weights match the recorded source fingerprint', () => {
  assert.equal(weights.length, MODEL_METADATA.weightsBytes);
  assert.equal(createHash('sha256').update(weights).digest('hex'), MODEL_METADATA.weightsSHA256);
});

for (const fixture of fixtures) {
  test(`real model matches upstream PyTorch output: ${fixture.name}`, () => {
    const result = model.infer(fixture.fen, { repetitionCount: fixture.repetitionCount });
    assert.equal(result.candidates[0].uci, fixture.bestUci);
    assert.equal(result.candidates[0].index, fixture.bestIndex);
    assert.ok(Math.abs(result.value - fixture.value) < 1e-4, `value differs: ${result.value} vs ${fixture.value}`);
    for (const candidate of result.candidates) {
      assert.ok(Math.abs(candidate.logit - fixture.legalLogits[candidate.index]) < 1e-4,
        `logit for ${candidate.uci} differs from the upstream fixture`);
    }
    assert.ok(Math.abs(result.candidates.reduce((sum, move) => sum + move.probability, 0) - 1) < 1e-6);
    const legal = new Set(new Chess(fixture.fen).moves({ verbose: true }).map((move) => move.lan));
    assert.equal(result.candidates.length, legal.size);
    assert.ok(result.candidates.every((move) => legal.has(move.uci)));
    assert.ok(result.value >= -1 && result.value <= 1);
  });
}

test('legal policy indices distinguish every promotion and special move', () => {
  const cases = [
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6']],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e1c1']],
    ['7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']],
    ['7k/8/8/8/8/8/p7/7K b - - 0 1', ['a2a1q', 'a2a1r', 'a2a1b', 'a2a1n']],
  ];
  for (const [fen, expected] of cases) {
    const moves = legalMoveIndices(new Chess(fen));
    assert.equal(new Set(moves.map((move) => move.index)).size, moves.length);
    for (const uci of expected) assert.ok(moves.some((move) => move.uci === uci), `${uci} missing`);
  }
});

test('twofold history affects the real model repetition input', () => {
  const game = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  assert.equal(boardFeatures(game)[20 * 64], 0.5);
  assert.equal(boardFeatures(new Chess(game.fen()))[20 * 64], 0);
});

test('model returns explicit terminal values without a spurious move', () => {
  assert.deepEqual(model.infer('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1').candidates, []);
  assert.equal(model.infer('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1').value, -1);
  assert.equal(model.infer('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').value, 0);
});
