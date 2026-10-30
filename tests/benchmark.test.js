import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { BENCHMARK_SUITES, CALIBRATION_POSITIONS, runSuite, runPairedMatches, rowsToCSV } from '../src/benchmark.js';
import { canonicalPositionKey } from '../src/controller.js';

const model = {
  modelId: 'benchmark-test-model',
  infer(chess) {
    const candidates = chess.moves({ verbose: true }).map((move) => ({ uci: move.lan, probability: 1 })).sort((a, b) => a.uci.localeCompare(b.uci));
    for (const candidate of candidates) candidate.probability /= candidates.length;
    return { candidates, value: 0, confidence: candidates[0]?.probability ?? 0, entropy: 0.5, modelId: this.modelId };
  },
};

test('a suite compares every mode on the exact same positions and records terminal cases', async () => {
  const suite = [
    { id: 'start', name: 'Start position', fen: new Chess().fen() },
    { id: 'stalemate', name: 'Stalemate', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', expectedMoves: [] },
  ];
  const result = await runSuite(model, { suite, maxNodes: 2, budgetMs: 1000 });
  assert.equal(result.rows.length, 6);
  assert.equal(result.summary.length, 3);
  for (const position of suite) {
    const rows = result.rows.filter((row) => row.positionId === position.id);
    assert.deepEqual(new Set(rows.map((row) => row.mode)), new Set(['direct', 'search', 'selective']));
    assert.ok(rows.every((row) => row.fen === position.fen && row.modelId === model.modelId));
  }
  for (const row of result.rows.filter((row) => row.positionId === 'stalemate')) {
    assert.equal(row.move, null);
    assert.equal(row.expectedMatch, true);
    assert.equal(row.nodes, 0);
  }
});

test('suite cancellation stops before the next position/mode decision', async () => {
  const controller = new AbortController();
  let completed = 0;
  await assert.rejects(runSuite(model, {
    suite: 'smoke', maxNodes: 2, budgetMs: 1000, signal: controller.signal,
    onProgress() { completed++; controller.abort(); },
  }), { name: 'AbortError' });
  assert.equal(completed, 1);
});

test('paired matches reverse colors and leave capped games unfinished and unscored', async () => {
  const result = await runPairedMatches(model, { rounds: 2, maxPlies: 2, maxNodes: 2, budgetMs: 10_000 });
  assert.equal(result.games.length, 6);
  for (let index = 0; index < result.games.length; index += 2) {
    const a = result.games[index], b = result.games[index + 1];
    assert.equal(a.whiteMode, b.blackMode);
    assert.equal(a.blackMode, b.whiteMode);
    assert.equal(a.openingFen, b.openingFen);
    assert.deepEqual(a.opening, b.opening);
  }
  for (const game of result.games) {
    assert.equal(game.result, '*');
    assert.equal(game.status, 'truncated');
    assert.equal(game.winner, null);
    assert.equal(game.moves.length, 2);
    const replay = new Chess();
    assert.doesNotThrow(() => replay.loadPgn(game.pgn));
    assert.equal(replay.fen(), game.finalFen);
  }
  for (const standing of result.standings) {
    assert.equal(standing.completed, 0);
    assert.equal(standing.points, 0);
    assert.equal(standing.unfinished, 4);
  }
});

test('calibration positions are unique and separated from the published benchmark positions', () => {
  const benchmark = new Set(Object.values(BENCHMARK_SUITES).flat().map((position) => canonicalPositionKey(position.fen)));
  const keys = CALIBRATION_POSITIONS.map((position) => canonicalPositionKey(position.fen));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.length >= 24);
  assert.ok(keys.every((key) => !benchmark.has(key)));
  for (const position of CALIBRATION_POSITIONS) assert.doesNotThrow(() => new Chess(position.fen));
});

test('CSV export preserves quotes and prevents cells becoming spreadsheet formulas', () => {
  const csv = rowsToCSV([{ name: '=2+2', note: 'A "quoted", comma', move: 'e2e4' }, { name: '@SUM(A1)', note: 'line\nbreak', move: null }]);
  assert.ok(csv.includes('"\'=2+2"'));
  assert.ok(csv.includes('"\'@SUM(A1)"'));
  assert.ok(csv.includes('"A ""quoted"", comma"'));
  assert.ok(csv.includes('"line\nbreak"'));
  assert.equal(rowsToCSV([]), '');
});
