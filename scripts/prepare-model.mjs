/** Re-fetch the pinned, openly licensed baseline and rebuild its JS runtime. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'https://raw.githubusercontent.com/pbaer/neural-chess/524ba14d4af3b739cbe19bd8cd0b14892e6305ca/';
const engineFiles = ['attention.ts', 'boardState.ts', 'capsule.ts', 'erf.ts', 'featurize.ts', 'index.ts', 'model.ts', 'moves.ts', 'ops.ts', 'relIndex.ts', 'tensor.ts', 'trace.ts'];
const expectedHash = '5b584935b8a23a662096d2ecc34f2af8c580058252ef0567194b080187945468';
await mkdir(new URL('../model/src/', import.meta.url), { recursive: true });

async function copy(sourcePath, outputPath) {
  const response = await fetch(source + sourcePath);
  if (!response.ok) throw new Error(`Cannot fetch ${sourcePath}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (outputPath === 'model/weights.bin' && createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
    throw new Error('Upstream weights do not match the pinned fingerprint');
  }
  await writeFile(new URL('../' + outputPath, import.meta.url), bytes);
}

for (const file of engineFiles) await copy('viz/src/core/engine/' + file, 'model/src/' + file);
await copy('LICENSE', 'model/LICENSE.upstream.txt');
await copy('viz/public/weights/v3.1-nano/capsule.json', 'model/capsule.json');
await copy('viz/public/weights/v3.1-nano/weights.bin', 'model/weights.bin');
execFileSync('npm', ['exec', '--yes', '--package=esbuild@0.25.12', '--', 'esbuild', 'model/src/index.ts', '--bundle', '--format=esm', '--outfile=model/runtime.js'], {
  cwd: root, stdio: 'inherit',
});
console.log('Pinned source and hash-verified weights restored.');
