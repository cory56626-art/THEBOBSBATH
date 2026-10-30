/** Color-reversed, shared-model old-vs-new AI matches; no evaluation adjudication. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Chess } from 'chess.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i < 0 ? undefined : i).replace(/^--/, ''), i < 0 ? true : arg.slice(i + 1)]; }));
const hash = value => createHash('sha256').update(value).digest('hex');
const budgetMs = Math.max(20, Number(args.budget) || 150);
const maxNodes = Math.max(1, Math.floor(Number(args['max-nodes']) || 64));
const maxPlies = Math.max(2, Math.floor(Number(args['max-plies']) || 160));
const reserveMs = Math.max(0, Number(args.reserve) || 1000);
const output = new URL(args.output || 'docs/ai-match-comparison.json', root);
const pgnOutput = new URL(args.pgn || 'docs/ai-match-comparison.pgn', root);

async function loadEngine(path) {
  const source = await readFile(new URL(path, root), 'utf8');
  const moduleSource = source.replace(/(from\s+|import\s*)['"]([^'"]+)['"]/g, (_, prefix, specifier) => `${prefix}${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, new URL('src/engine.js', root)).href : import.meta.resolve(specifier))}`);
  const engine = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  return { ...engine, sourceSHA256: hash(source) };
}
const baseline = await loadEngine(args.baseline || '/workspace/tools/ai-baseline-engine.js');
const improved = await loadEngine(args.candidate || 'src/engine.js');
const model = createModelFromBytes(JSON.parse(await readFile(new URL('model/capsule.json', root), 'utf8')), await readFile(new URL('model/weights.bin', root)));
const engines = { baseline, improved };
const openings = [
  { name: 'Italian', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { name: 'Queen’s Gambit', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'] },
  { name: 'Sicilian', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'] },
  { name: 'English', moves: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5'] },
];
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
  engines: { baseline: { version: baseline.ENGINE_VERSION, sourceSHA256: baseline.sourceSHA256, sourceRef: 'Published 8915eb4 snapshot unless --baseline overrides' }, improved: { version: improved.ENGINE_VERSION, sourceSHA256: improved.sourceSHA256 } },
  model: MODEL_METADATA,
  environment: { node: process.version, platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model },
  settings: { mode: 'search', budgetMs, maxNodes, maxPlies, clockPerSideMs: Math.ceil(maxPlies / 2) * budgetMs + reserveMs, reserveMs, openings, colorReversed: true, adjudication: 'Only rules-terminal games and explicit time/illegal-move forfeits are scored. Move-cap truncations remain unfinished and unscored.' },
  caveats: ['Eight games cannot establish a reliable strength or Elo change.', 'Identical model weights are shared; this tests search/verification changes, not a new trained network.', 'Wall-time limits are soft because individual neural evaluations cannot be interrupted. Actual elapsed time is deducted from equal game clocks.', 'Opening order is fixed; colors reverse within each pair. No evaluation-based win/draw adjudication is used.'],
  games: [],
};
function summarize() {
  return ['baseline', 'improved'].map(engine => {
    const scored = report.games.filter(game => game.result !== '*');
    const wins = scored.filter(game => game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === engine).length;
    const draws = scored.filter(game => game.result === '1/2-1/2').length;
    const moves = report.games.flatMap(game => game.moves.filter(move => move.engine === engine));
    return { engine, games: report.games.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: report.games.length - scored.length, points: wins + draws / 2, playedMoves: moves.length, meanActualMs: moves.length ? moves.reduce((sum, move) => sum + move.elapsedMs, 0) / moves.length : null, meanTreeNodes: moves.length ? moves.reduce((sum, move) => sum + move.nodes, 0) / moves.length : null };
  });
}
async function save() {
  report.summary = summarize();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await writeFile(pgnOutput, report.games.map(game => game.pgn).join('\n\n') + '\n');
}
// Exclude the shared first-forward warmup from the game clocks.
model.infer(new Chess());
for (let openingIndex = 0; openingIndex < openings.length; openingIndex++) {
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
      const result = await engines[engine].chooseMove(chess, model, { mode: 'search', budgetMs: Math.min(budgetMs, Math.max(1, clocks[color])), maxNodes });
      clocks[color] -= result.elapsedMs;
      if (clocks[color] <= 0) { outcome = { status: 'time-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
      let played;
      try { played = chess.move({ from: result.move?.slice(0, 2), to: result.move?.slice(2, 4), ...(result.move?.[4] ? { promotion: result.move[4] } : {}) }); }
      catch (error) { outcome = { status: 'invalid-move-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w', error: error.message }; break; }
      moves.push({ ply: ply + 1, engine, color, move: uciOf(played), san: played.san, beforeFen, afterFen: chess.fen(), elapsedMs: result.elapsedMs, nodes: result.nodes, inferenceCalls: result.inferenceCalls, proven: result.proven || false, stopReason: result.stopReason });
      outcome = terminal(chess);
      if ((ply + 1) % 20 === 0) console.log(`Game ${report.games.length + 1}/8 ${opening.name} ${ply + 1}/${maxPlies} plies`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    outcome ||= { status: 'truncated', result: '*', winner: null };
    chess.header('Event', 'INTUITION controlled before-after AI match', 'White', whiteEngine, 'Black', blackEngine, 'Opening', opening.name, 'Result', outcome.result, 'Termination', outcome.status);
    report.games.push({ id: report.games.length + 1, pair: openingIndex + 1, opening: opening.name, openingMoves: opening.moves, openingFen, whiteEngine, blackEngine, ...outcome, plies: moves.length, finalFen: chess.fen(), clocks, moves, pgn: chess.pgn() });
    await save();
    console.log(`FINISHED ${report.games.length}/8 ${opening.name}: ${whiteEngine} vs ${blackEngine} ${outcome.result} (${outcome.status}) ${moves.length} plies`);
  }
}
report.finishedAt = new Date().toISOString();
await save();
console.log(JSON.stringify(report.summary));
console.log(`Saved ${output.pathname} and ${pgnOutput.pathname}`);
