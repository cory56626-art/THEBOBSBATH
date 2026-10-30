import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const originalEngineURL = new URL('src/engine.js', root);
const hash = value => createHash('sha256').update(value).digest('hex');
const importPattern = /(from\s+|import\s*)['"]([^'"]+)['"]/g;

/** Load an engine source snapshot against the pinned repository dependencies. */
export async function loadEngine({ sourcePath = 'src/engine.js', sourceRevision } = {}) {
  const source = sourceRevision
    ? execFileSync('git', ['show', sourceRevision], { cwd: root, encoding: 'utf8' })
    : await readFile(new URL(sourcePath, root), 'utf8');
  const dependencies = {};
  const visited = new Set();
  async function fingerprint(text, baseURL) {
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;
      const url = new URL(specifier, baseURL);
      if (visited.has(url.href)) continue;
      visited.add(url.href);
      const bytes = await readFile(url);
      dependencies[url.href.startsWith(root.href) ? url.href.slice(root.href.length) : url.href] = hash(bytes);
      if (/\.(m?js|ts)$/.test(url.pathname)) await fingerprint(bytes.toString('utf8'), url);
    }
  }
  await fingerprint(source, originalEngineURL);
  const moduleSource = source.replace(importPattern, (_, prefix, specifier) => `${prefix}${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, originalEngineURL).href : import.meta.resolve(specifier))}`);
  const engine = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  return {
    ...engine,
    sourceSHA256: hash(source),
    sourceRef: sourceRevision || sourcePath,
    sourceDependencies: dependencies,
  };
}
