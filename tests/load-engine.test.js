import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadEngine } from '../scripts/lib/load-engine.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chess-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (filename, text) => {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), text);
  };
  await write('package.json', '{"name":"snapshot-fixture","type":"module"}');
  await write('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
  for (const [filename, text] of Object.entries(files)) await write(filename, text);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['-c', 'user.name=Snapshot test', '-c', 'user.email=snapshot@example.invalid', 'add', '.']);
  git(['-c', 'user.name=Snapshot test', '-c', 'user.email=snapshot@example.invalid', 'commit', '-qm', 'Frozen dependency graph']);
  return { root, write, commit: git(['rev-parse', 'HEAD']) };
}

test('Git snapshots execute all historical local imports after live dependencies change or disappear', async t => {
  const f = await fixture(t, {
    'src/engine.js': "import { answer } from './middle.js'; export const getAnswer = () => answer;\n",
    'src/middle.js': "export { answer } from './nested/leaf.js';\n",
    'src/nested/leaf.js': 'export const answer = 73;\n',
  });
  const frozenLeaf = hash(await readFile(path.join(f.root, 'src/nested/leaf.js')));
  await f.write('src/nested/leaf.js', 'export const answer = -1000;\n');
  const old = await loadEngine({ repositoryRoot: f.root, sourceRevision: `${f.commit}:src/engine.js` });
  const live = await loadEngine({ repositoryRoot: f.root });
  assert.equal(old.getAnswer(), 73);
  assert.equal(live.getAnswer(), -1000);
  assert.equal(old.sourceRevision, f.commit);
  assert.equal(old.sourceDependencies['src/nested/leaf.js'], frozenLeaf);
  assert.notEqual(old.sourceTreeSHA256, live.sourceTreeSHA256);
  assert.equal(old.sourceSHA256, live.sourceSHA256); // Entry-only hashes would conceal contamination.
  await rm(path.join(f.root, 'src/middle.js'));
  const oldAgain = await loadEngine({ repositoryRoot: f.root, sourceRevision: f.commit });
  assert.equal(oldAgain.getAnswer(), 73);
  assert.deepEqual(oldAgain.sourceFiles, old.sourceFiles);
  assert.equal(oldAgain.sourceTreeSHA256, old.sourceTreeSHA256);
});

test('literal dynamic and side-effect imports freeze recursively; import-like comments are ignored', async t => {
  const f = await fixture(t, {
    'src/engine.js': `// import { bogus } from './missing-comment.js';
/* export * from './missing-block.js'; */
const example = "import { bogus } from './missing-string.js'";
import './effect.js';
export const getAnswer = async () => (await import('./leaf.js')).answer;
`,
    'src/effect.js': 'export const harmless = true;\n',
    'src/leaf.js': 'export const answer = 91;\n',
  });
  await f.write('src/leaf.js', 'export const answer = 12;\n');
  const old = await loadEngine({ repositoryRoot: f.root, sourceRevision: f.commit });
  assert.equal(await old.getAnswer(), 91);
  assert.deepEqual(Object.keys(old.sourceDependencies), ['src/effect.js', 'src/leaf.js']);
});

test('npm package version and actual entry fingerprints are checked against snapshot lock', async t => {
  const oldLock = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': { version: '1.0.0', integrity: 'fixture-integrity' } } });
  const f = await fixture(t, {
    'src/engine.js': "import { answer } from 'example'; export const getAnswer = () => answer;\n",
    'package-lock.json': oldLock,
    'node_modules/example/package.json': '{"name":"example","version":"1.0.0","type":"module","main":"index.js"}',
    'node_modules/example/index.js': 'export const answer = 46;\n',
  });
  await f.write('package-lock.json', oldLock + '\n');
  const old = await loadEngine({ repositoryRoot: f.root, sourceRevision: f.commit });
  assert.equal(old.getAnswer(), 46);
  assert.equal(old.packageLockSHA256, hash(oldLock));
  assert.notEqual(old.packageLockSHA256, old.runtimePackageLockSHA256);
  assert.equal(old.packageDependencies.example.version, '1.0.0');
  assert.equal(old.packageDependencies.example.lockIntegrity, 'fixture-integrity');
  assert.equal(old.packageDependencies.example.entrySHA256, hash('export const answer = 46;\n'));
  await f.write('node_modules/example/package.json', '{"name":"example","version":"2.0.0","type":"module","main":"index.js"}');
  await assert.rejects(loadEngine({ repositoryRoot: f.root, sourceRevision: f.commit }), /locked 1.0.0, installed 2.0.0/);
});

test('unsupported graph edges fail instead of importing uncontrolled live code', async t => {
  const f = await fixture(t, {
    'src/engine.js': "import './cycle.js'; export const version = 1;\n",
    'src/cycle.js': "import './engine.js';\n",
  });
  await assert.rejects(loadEngine({ repositoryRoot: f.root }), /Cyclic snapshot dependency/);
  await f.write('src/engine.js', "const filename = './leaf.js'; export const getAnswer = () => import(filename);\n");
  await assert.rejects(loadEngine({ repositoryRoot: f.root }), /must have literal specifiers/);
  await f.write('src/engine.js', "import '../../outside.js';\n");
  await assert.rejects(loadEngine({ repositoryRoot: f.root }), /escapes repository/);
  await f.write('src/engine.js', "import 'https://example.invalid/engine.js';\n");
  await assert.rejects(loadEngine({ repositoryRoot: f.root }), /Unsupported snapshot dependency/);
});

test('real v3 source graph and chess.js dependency are pinned to their exact bytes', async () => {
  const old = await loadEngine({ sourceRevision: 'b1d5002:src/engine.js' });
  assert.equal(old.ENGINE_VERSION, 'intuition-hybrid-3');
  assert.match(old.sourceRevision, /^b1d5002[0-9a-f]{33}$/);
  assert.deepEqual(Object.keys(old.sourceDependencies), ['src/controller.js', 'src/position-evaluation.js', 'src/tactical-search.js']);
  assert.equal(old.packageDependencies['chess.js'].version, '1.4.0');
  assert.match(old.packageDependencies['chess.js'].entrySHA256, /^[0-9a-f]{64}$/);
  assert.equal(old.sourceTreeSHA256, hash(JSON.stringify(old.sourceFiles)));
});
