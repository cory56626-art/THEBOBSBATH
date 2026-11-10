import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = new URL('../../', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const sorted = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

// Read literal module specifiers without treating comments or quoted example
// code as imports. The engine graph uses JavaScript modules, not a bundler.
function imports(source) {
  const tokens = [];
  const lex = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(lex)) {
    if (match[0].startsWith('//') || match[0].startsWith('/*')) continue;
    tokens.push({ value: match[0], start: match.index, end: match.index + match[0].length });
  }
  const result = [];
  const string = token => token && /^["']/.test(token.value);
  for (let i = 0; i < tokens.length; i++) {
    const keyword = tokens[i].value;
    if (!['import', 'export'].includes(keyword) || tokens[i - 1]?.value === '.') continue;
    let target;
    if (keyword === 'import' && tokens[i + 1]?.value === '.') continue;
    if (keyword === 'import' && tokens[i + 1]?.value === '(') {
      if (!string(tokens[i + 2])) throw new Error('Snapshot imports must have literal specifiers');
      target = tokens[i + 2];
    } else if (keyword === 'import' && string(tokens[i + 1])) target = tokens[i + 1];
    else {
      // An export declaration without `from` has no module dependency.
      for (let j = i + 1; j < tokens.length; j++) {
        if ([';', '=', 'import', 'export'].includes(tokens[j].value)) break;
        if (tokens[j].value === 'from' && string(tokens[j + 1])) { target = tokens[j + 1]; break; }
      }
    }
    if (target) {
      if (target.value.includes('\\')) throw new Error('Escaped snapshot import specifiers are unsupported');
      result.push({ ...target, specifier: target.value.slice(1, -1) });
    }
  }
  return result;
}

/**
 * Load a frozen, recursive engine graph. Revision may be `ref:src/engine.js`
 * (the original interface) or just `ref`. A sourcePath is an alternate copy
 * of the entry engine; its relative imports retain the src/engine.js base.
 * Imported npm packages must match the selected snapshot's lockfile version.
 */
export async function loadEngine({ sourcePath = 'src/engine.js', sourceRevision, repositoryRoot = defaultRoot } = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot).replace(/\/$/, '') : path.resolve(repositoryRoot);
  const rootURL = pathToFileURL(root + path.sep);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  let revision = null, entryPath = 'src/engine.js';
  if (sourceRevision) {
    const separator = sourceRevision.indexOf(':');
    const ref = separator < 0 ? sourceRevision : sourceRevision.slice(0, separator);
    entryPath = separator < 0 ? 'src/engine.js' : sourceRevision.slice(separator + 1);
    revision = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  }
  const checkedPath = filename => {
    const resolved = path.resolve(root, filename);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`Snapshot dependency escapes repository: ${filename}`);
    return path.relative(root, resolved).split(path.sep).join('/');
  };
  entryPath = checkedPath(entryPath);
  const read = async filename => revision
    ? execFileSync('git', ['show', `${revision}:${checkedPath(filename)}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    : readFile(path.join(root, checkedPath(filename)));
  const source = revision ? await read(entryPath) : await readFile(path.resolve(root, sourcePath));
  const lockBytes = await read('package-lock.json');
  const lock = JSON.parse(lockBytes);
  const runtimeLockBytes = await readFile(path.join(root, 'package-lock.json'));
  const require = createRequire(new URL('package.json', rootURL));
  const sourceDependencies = {}, sourceFiles = { [entryPath]: hash(source) }, packageDependencies = {};
  const modules = new Map(), visiting = new Set();

  async function packageURL(specifier) {
    if (builtins.has(specifier.replace(/^node:/, ''))) return specifier;
    if (/^[a-zA-Z][\w+.-]*:/.test(specifier) || specifier.startsWith('/') || specifier.startsWith('#')) {
      throw new Error(`Unsupported snapshot dependency: ${specifier}`);
    }
    const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    const expected = lock.packages?.[`node_modules/${packageName}`];
    if (!expected?.version) throw new Error(`Snapshot package is absent from package-lock.json: ${packageName}`);
    // Default-root import resolution preserves Node's ESM export condition.
    // The alternate root is used by isolated harness regression repositories.
    const resolvedURL = root === fileURLToPath(defaultRoot).replace(/\/$/, '')
      ? import.meta.resolve(specifier)
      : pathToFileURL(require.resolve(specifier)).href;
    const entry = fileURLToPath(resolvedURL);
    let directory = path.dirname(entry), manifest, packageRoot;
    while (directory !== path.dirname(directory)) {
      try {
        const bytes = await readFile(path.join(directory, 'package.json'));
        const parsed = JSON.parse(bytes);
        if (parsed.name === packageName) { manifest = { bytes, parsed }; packageRoot = directory; break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = path.dirname(directory);
    }
    if (!manifest) throw new Error(`Cannot fingerprint installed package: ${packageName}`);
    if (manifest.parsed.version !== expected.version) {
      throw new Error(`Snapshot package version mismatch for ${packageName}: locked ${expected.version}, installed ${manifest.parsed.version}`);
    }
    packageDependencies[specifier] = {
      package: packageName, version: manifest.parsed.version, lockedVersion: expected.version,
      lockIntegrity: expected.integrity || null,
      packageJSONSHA256: hash(manifest.bytes),
      entry: path.relative(packageRoot, entry).split(path.sep).join('/'),
      entrySHA256: hash(await readFile(entry)),
    };
    return resolvedURL;
  }

  async function freeze(filename, bytes) {
    if (visiting.has(filename)) throw new Error(`Cyclic snapshot dependency: ${filename}`);
    if (modules.has(filename)) return modules.get(filename);
    visiting.add(filename);
    const text = bytes.toString('utf8');
    const replacements = [];
    for (const dependency of imports(text)) {
      let url;
      if (dependency.specifier.startsWith('.')) {
        const depPath = checkedPath(path.posix.join(path.posix.dirname(filename), dependency.specifier));
        if (!/\.m?js$/.test(depPath)) throw new Error(`Snapshot dependency must be a JavaScript module: ${depPath}`);
        const depBytes = await read(depPath);
        sourceDependencies[depPath] = sourceFiles[depPath] = hash(depBytes);
        url = await freeze(depPath, depBytes);
      } else url = await packageURL(dependency.specifier);
      replacements.push({ ...dependency, url });
    }
    let rewritten = text;
    for (const replacement of replacements.reverse()) {
      rewritten = rewritten.slice(0, replacement.start) + JSON.stringify(replacement.url) + rewritten.slice(replacement.end);
    }
    const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`;
    visiting.delete(filename);
    modules.set(filename, url);
    return url;
  }
  const moduleURL = await freeze(entryPath, source);
  const engine = await import(moduleURL);
  const sourceTree = sorted(sourceFiles);
  return {
    ...engine,
    sourceSHA256: hash(source), sourceRef: sourceRevision || sourcePath,
    sourceRevision: revision,
    sourceDependencies: sorted(sourceDependencies), sourceFiles: sourceTree,
    sourceTreeSHA256: hash(JSON.stringify(sourceTree)),
    packageLockSHA256: hash(lockBytes), runtimePackageLockSHA256: hash(runtimeLockBytes),
    packageDependencies: sorted(packageDependencies),
  };
}
