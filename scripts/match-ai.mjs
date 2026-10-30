/** Color-reversed, shared-model old-vs-new AI matches; no evaluation adjudication. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { Chess } from 'chess.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';
import { loadEngine } from './lib/load-engine.mjs';
import { getOpenings } from './lib/chess-openings.mjs';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i < 0 ? undefined : i).replace(/^--/, ''), i < 0 ? true : arg.slice(i + 1)]; }));
const hash = value => createHash('sha256').update(value).digest('hex');
const integer = (name, fallback, minimum) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return value;
};
const budgetMs = integer('budget', 150, 1);
const maxNodes = integer('max-nodes', 64, 1);
const candidateMaxNodes = integer('candidate-max-nodes', maxNodes, 1);
const maxPlies = integer('max-plies', 160, 2);
const reserveMs = integer('reserve', 1000, 0);
const rounds = integer('rounds', 1, 1);
const output = new URL(args.output || 'docs/ai-v3-match.json', root);
const pgnOutput = new URL(args.pgn || 'docs/ai-v3-match.pgn', root);
const baseline = await loadEngine(args.baseline ? { sourcePath: args.baseline } : { sourceRevision: 'cd89e02:src/engine.js' });
const improved = await loadEngine({ sourcePath: args.candidate || 'src/engine.js' });
const model = createModelFromBytes(JSON.parse(await readFile(new URL('model/capsule.json', root), 'utf8')), await readFile(new URL('model/weights.bin', root)));
const engines = { baseline, improved };
const openingSet = args['opening-set'] || 'pilot8';
const openings = getOpenings(openingSet);
const plannedGames = openings.length * 2 * rounds;
const uciOf = move => move.from + move.to + (move.promotion || '');
function terminal(chess) {
  if (chess.isCheckmate()) return { status: 'checkmate', result: chess.turn() === 'w' ? '0-1' : '1-0', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (!chess.isGameOver()) return null;
  const status = chess.isStalemate() ? 'stalemate' : chess.isThreefoldRepetition() ? 'threefold-repetition' : chess.isInsufficientMaterial() ? 'insufficient-material' : 'fifty-move-draw';
  return { status, result: '1/2-1/2', winner: null };
}
let gitCommit = null;
try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const report = {
  startedAt: new Date().toISOString(), gitCommit,
  engines: Object.fromEntries(Object.entries(engines).map(([key, engine]) => [key, { version: engine.ENGINE_VERSION, sourceSHA256: engine.sourceSHA256, sourceRef: engine.sourceRef, sourceDependencies: engine.sourceDependencies }])),
  scriptSHA256: hash(await readFile(new URL('scripts/match-ai.mjs', root))),
  harnessDependencies: { loaderSHA256: hash(await readFile(new URL('scripts/lib/load-engine.mjs', root))), openingsSHA256: hash(await readFile(new URL('scripts/lib/chess-openings.mjs', root))) },
  model: MODEL_METADATA,
  environment: { node: process.version, platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model },
  settings: { mode: 'search', budgetMs, baselineMaxNodes: maxNodes, candidateMaxNodes, maxPlies, clockPerSideMs: Math.ceil(maxPlies / 2) * budgetMs + reserveMs, reserveMs, openingSet, rounds, plannedGames, openings, colorReversed: true, adjudication: 'Only rules-terminal games and explicit time/illegal-move forfeits are scored. Move-cap truncations remain unfinished and unscored.', clockPolicy: 'Competition clock exhaustion is a forfeit regardless of remaining mating material; such wins are reported separately from checkmate.' },
  caveats: ['This small pilot cannot establish a reliable Elo change.', 'Identical model weights are shared; this tests decision-engine changes, not a new trained network.', 'The configured node limits can count different work units across engine versions. They are recorded separately; total move budgets and game clocks are equal.', 'Wall-time limits are soft because individual synchronous operations cannot be interrupted. Actual elapsed time around the entire decision call is deducted from equal game clocks.', 'Opening order is fixed; colors reverse within each pair. No evaluation-based win/draw adjudication is used.'],
  games: [],
};
function summarize() {
  return ['baseline', 'improved'].map(engine => {
    const scored = report.games.filter(game => game.result !== '*');
    const wins = scored.filter(game => game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === engine).length;
    const draws = scored.filter(game => game.result === '1/2-1/2').length;
    const moves = report.games.flatMap(game => game.moves.filter(move => move.engine === engine));
    return { engine, games: report.games.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: report.games.length - scored.length, points: wins + draws / 2, playedMoves: moves.length, meanActualMs: moves.length ? moves.reduce((sum, move) => sum + move.elapsedMs, 0) / moves.length : null, meanNodeCount: moves.length ? moves.reduce((sum, move) => sum + move.nodes, 0) / moves.length : null, nodeUnits: [...new Set(moves.map(move => move.nodeUnit))] };
  });
}
async function save() {
  report.summary = summarize();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await writeFile(pgnOutput, report.games.map(game => game.pgn).join('\n\n') + '\n');
}
// Exclude the shared first-forward warmup from the game clocks.
model.infer(new Chess());
for (let round = 0; round < rounds; round++) for (let openingIndex = 0; openingIndex < openings.length; openingIndex++) {
  const opening = openings[openingIndex];
  for (let reverse = 0; reverse < 2; reverse++) {
    const chess = new Chess(); for (const move of opening.moves) chess.move(move);
    const openingFen = chess.fen();
    const whiteEngine = reverse ? 'improved' : 'baseline', blackEngine = reverse ? 'baseline' : 'improved';
    const clocks = { w: report.settings.clockPerSideMs, b: report.settings.clockPerSideMs };
    const moves = [];
    let outcome = terminal(chess);
    for (let ply = 0; ply < maxPlies && !outcome; ply++) {
      const color = chess.turn(), engine = color === 'w' ? whiteEngine : blackEngine, beforeFen = chess.fen();
      const started = performance.now();
      const result = await engines[engine].chooseMove(chess, model, { mode: 'search', budgetMs: Math.min(budgetMs, Math.max(1, clocks[color])), maxNodes: engine === 'baseline' ? maxNodes : candidateMaxNodes });
      const elapsedMs = performance.now() - started;
      clocks[color] -= elapsedMs;
      if (clocks[color] <= 0) { outcome = { status: 'time-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
      let played;
      try { played = chess.move({ from: result.move?.slice(0, 2), to: result.move?.slice(2, 4), ...(result.move?.[4] ? { promotion: result.move[4] } : {}) }); }
      catch (error) { outcome = { status: 'invalid-move-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w', error: error.message }; break; }
      moves.push({ ply: ply + 1, engine, color, move: uciOf(played), san: played.san, beforeFen, afterFen: chess.fen(), elapsedMs, reportedElapsedMs: result.elapsedMs, nodes: result.nodes, nodeUnit: result.nodeUnit || 'neural-tree-visit', tacticalNodes: result.tacticalNodes ?? null, qNodes: result.qNodes ?? null, depth: result.depth ?? null, completedIterations: result.completedIterations ?? null, scoreCp: result.scoreCp ?? null, searchKind: result.searchKind || 'neural-mcts', inferenceCalls: result.inferenceCalls, proven: result.proven || false, stopReason: result.stopReason });
      outcome = terminal(chess);
      if ((ply + 1) % 40 === 0) console.log(`Game ${report.games.length + 1}/${plannedGames} ${opening.name} ${ply + 1}/${maxPlies} plies`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    outcome ||= { status: 'truncated', result: '*', winner: null };
    chess.header('Event', 'INTUITION controlled before-after AI match', 'White', whiteEngine, 'Black', blackEngine, 'Opening', opening.name, 'Result', outcome.result, 'Termination', outcome.status);
    report.games.push({ id: report.games.length + 1, round: round + 1, pair: openingIndex + 1, opening: opening.name, openingMoves: opening.moves, openingFen, whiteEngine, blackEngine, ...outcome, plies: moves.length, finalFen: chess.fen(), clocks, moves, pgn: chess.pgn() });
    await save();
    console.log(`FINISHED ${report.games.length}/${plannedGames} ${opening.name}: ${whiteEngine} vs ${blackEngine} ${outcome.result} (${outcome.status}) ${moves.length} plies`);
  }
}
report.finishedAt = new Date().toISOString();
await save();
console.log(JSON.stringify(report.summary));
console.log(`Saved ${output.pathname} and ${pgnOutput.pathname}`);
