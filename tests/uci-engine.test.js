import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { UciEngine } from '../scripts/lib/uci-engine.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fake-uci-engine.mjs', import.meta.url));
const fake = mode => new UciEngine(process.execPath, { args: [fixture, ...(mode ? [mode] : [])], timeoutMs: 500 });

test('UCI handshake verifies advertised skill support and retains complete move history', async () => {
  const engine = fake();
  try {
    await engine.init();
    assert.equal(engine.name, 'Fake protocol fixture');
    await engine.configure({ 'Skill Level': 0 });
    await engine.newGame();
    const result = await engine.chooseMove(['e2e4'], 1000);
    assert.equal(result.move, 'e7e5');
    assert.deepEqual(result.info, { depth: 3, nodes: 99, timeMs: 1, score: { type: 'cp', value: 12 }, pv: ['e7e5'] });
    assert.ok(engine.commands.includes('setoption name Skill Level value 0'));
    assert.ok(engine.commands.includes('position startpos moves e2e4'));
    assert.ok(engine.commands.includes('go nodes 1000'));
    await assert.rejects(engine.configure({ 'Invented setting': 1 }), /does not advertise/);
  } finally { await engine.close(); }
});

test('UCI process exits reject the pending handshake', async () => {
  const engine = fake('exit');
  try { await assert.rejects(engine.init(), /exited \(7\)/); }
  finally { await engine.close(); }
});

test('UCI stalled responses time out and stop the process', async () => {
  const engine = fake('hang');
  try { await assert.rejects(engine.init(), /Timed out/); }
  finally { await engine.close(); }
  assert.ok(engine.child.exitCode !== null || engine.child.signalCode !== null);
});

test('UCI missing executables reject without an unhandled process error', async () => {
  const engine = new UciEngine('/does/not/exist/stockfish', { timeoutMs: 500 });
  try { await assert.rejects(engine.init(), /ENOENT/); }
  finally { await engine.close(); }
});

test('full-strength and Elo runs send explicit settings and pure movetime requests', async () => {
  const engine = fake();
  try {
    await engine.init();
    const common = { Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, 'Skill Level': 20 };
    await engine.configure({ ...common, UCI_LimitStrength: false });
    await engine.newGame();
    const fullStart = engine.commands.length;
    assert.equal((await engine.chooseMove(['e2e4'], { movetime: 150 })).move, 'e7e5');
    assert.deepEqual(engine.commands.slice(fullStart), ['position startpos moves e2e4', 'go movetime 150']);
    assert.ok(engine.commands.includes('setoption name UCI_LimitStrength value false'));
    await engine.configure({ ...common, UCI_LimitStrength: true, UCI_Elo: 1520 });
    await engine.newGame();
    const eloStart = engine.commands.length;
    await engine.chooseMove([], { movetime: 150 });
    assert.deepEqual(engine.commands.slice(eloStart), ['position startpos', 'go movetime 150']);
    assert.ok(engine.commands.includes('setoption name UCI_LimitStrength value true'));
    assert.ok(engine.commands.includes('setoption name UCI_Elo value 1520'));
    assert.ok(engine.commands.includes('setoption name Skill Level value 20'));
    assert.equal(engine.commands.filter(command => command === 'setoption name Clear Hash').length, 2);
  } finally { await engine.close(); }
});

test('invalid or ambiguous UCI limits cannot silently add a node cap or start a search', async () => {
  const engine = fake();
  try {
    await engine.init();
    const before = [...engine.commands];
    for (const limits of [undefined, null, 0, -1, 1.5, NaN, {}, [], { nodes: 0 }, { movetime: 0 }, { movetime: 150, nodes: 1000 }, { depth: 3 }, { nodes: '1000' }, { movetime: 150, ignored: true }]) {
      await assert.rejects(engine.chooseMove([], limits), /exactly one positive integer/);
      assert.deepEqual(engine.commands, before);
    }
    await engine.chooseMove([], { nodes: 1000 });
    assert.equal(engine.commands.at(-1), 'go nodes 1000');
  } finally { await engine.close(); }
});
