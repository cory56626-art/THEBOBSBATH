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
