import { readFile } from 'node:fs/promises';
import { validateGames } from './lib/validate-games.mjs';

if (process.argv.length < 3) throw new Error('Usage: node scripts/validate-games.mjs report.json [report.json ...]');
for (const path of process.argv.slice(2)) console.log(JSON.stringify({ path, ...validateGames(JSON.parse(await readFile(path, 'utf8'))) }));
