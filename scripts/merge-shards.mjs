/** Merge shard reports of one predeclared run (match or rating ladder) into one report. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { aiScore, estimateRating } from './lib/elo-rating.mjs';

const args = process.argv.slice(2);
const output = args.find(arg => arg.startsWith('--output='))?.slice(9);
const pgnOutput = args.find(arg => arg.startsWith('--pgn='))?.slice(6);
const planned = Number(args.find(arg => arg.startsWith('--planned='))?.slice(10));
const inputs = args.filter(arg => !arg.startsWith('--'));
if (!output || !pgnOutput || !inputs.length || !Number.isInteger(planned)) throw new Error('Usage: node scripts/merge-shards.mjs --output=merged.json --pgn=merged.pgn --planned=N shard1.json shard2.json ...');
const bytes = await Promise.all(inputs.map(path => readFile(path)));
const reports = bytes.map(item => JSON.parse(item));
const ladder = reports[0].protocol?.startsWith('nominal-stockfish');
// Every shard must test the same engines under the same settings.
const identity = report => JSON.stringify(ladder
  ? { engine: report.engine.sourceTreeSHA256, opponent: report.opponent.executableSHA256, budgetMs: report.settings.budgetMs, maxNodes: report.settings.maxNodes, maxPlies: report.settings.maxPlies, openingSet: report.settings.openingSet, rounds: report.settings.rounds }
  : { engines: Object.fromEntries(Object.entries(report.engines).map(([key, engine]) => [key, engine.sourceTreeSHA256])), budgetMs: report.settings.budgetMs, baselineMaxNodes: report.settings.baselineMaxNodes, candidateMaxNodes: report.settings.candidateMaxNodes, maxPlies: report.settings.maxPlies, openingSet: report.settings.openingSet, rounds: report.settings.rounds });
if (new Set(reports.map(identity)).size !== 1) throw new Error('Shards disagree on engines or settings');
if (reports.some(report => !report.finishedAt)) throw new Error('Every shard must have finished');
const games = reports.flatMap(report => report.games);
const merged = {
  ...reports[0], startedAt: reports.map(r => r.startedAt).sort()[0], finishedAt: reports.map(r => r.finishedAt).sort().at(-1),
  shards: inputs.map((path, i) => ({ path, sha256: createHash('sha256').update(bytes[i]).digest('hex'), games: reports[i].games.length, settings: reports[i].settings })),
  settings: { ...reports[0].settings, plannedGames: planned, shardCount: inputs.length },
  games: games.map((game, i) => ({ ...game, id: i + 1 })),
};
if (ladder) {
  const elos = [...new Set(games.map(game => game.elo))].sort((a, b) => a - b);
  merged.settings.elos = elos;
  merged.summary = elos.map(elo => {
    const rows = games.filter(game => game.elo === elo), scored = rows.filter(game => aiScore(game) !== null);
    const wins = scored.filter(game => aiScore(game) === 1).length, draws = scored.filter(game => aiScore(game) === 0.5).length;
    return { elo, games: rows.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: rows.length - scored.length, points: wins + draws / 2 };
  });
  merged.rating = estimateRating(games, { plannedGames: planned, budgetMs: merged.settings.budgetMs });
} else {
  merged.summary = ['baseline', 'improved'].map(engine => {
    const scored = games.filter(game => game.result !== '*');
    const wins = scored.filter(game => game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === engine).length;
    const draws = scored.filter(game => game.result === '1/2-1/2').length;
    const moves = games.flatMap(game => game.moves.filter(move => move.engine === engine));
    return { engine, games: games.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: games.length - scored.length, points: wins + draws / 2, playedMoves: moves.length, meanActualMs: moves.reduce((sum, move) => sum + move.elapsedMs, 0) / moves.length, meanNodeCount: moves.reduce((sum, move) => sum + move.nodes, 0) / moves.length };
  });
}
await writeFile(output, JSON.stringify(merged, null, 2) + '\n');
await writeFile(pgnOutput, merged.games.map(game => game.pgn).join('\n\n') + '\n');
console.log(JSON.stringify({ games: games.length, planned, summary: merged.summary, rating: merged.rating ?? null }));
