import { readFile, writeFile } from 'node:fs/promises';
import { selectEngine } from './lib/match-selection.mjs';
import { validateGames } from './lib/validate-games.mjs';
const [input, output] = process.argv.slice(2);
if (!input) throw Error('Usage: node scripts/select-engine.mjs match.json [selection.json]');
const report = JSON.parse(await readFile(input, 'utf8'));
const selection = { input, engines: report.engines, validation: validateGames(report), ...selectEngine(report) };
if (output) await writeFile(output, JSON.stringify(selection, null, 2) + '\n');
console.log(JSON.stringify(selection, null, 2));
