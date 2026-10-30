/** Actual chess games against explicitly limited native Stockfish opponents. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { Chess } from 'chess.js';
import { chooseMove, ENGINE_VERSION } from '../src/engine.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';
import { UciEngine } from './lib/uci-engine.mjs';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(0, index < 0 ? undefined : index).replace(/^--/, ''), index < 0 ? true : arg.slice(index + 1)];
}));
const integer = (name, fallback, minimum) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return value;
};
const hash = value => createHash('sha256').update(value).digest('hex');
const budgetMs = integer('budget', 150, 1);
const maxNodes = integer('max-nodes', 64, 1);
const maxPlies = integer('max-plies', 160, 2);
const stockfishNodes = integer('stockfish-nodes', 1000, 1);
const reserveMs = integer('reserve', 1000, 0);
const skills = String(args.skills ?? '0,5').split(',').map(Number);
if (skills.some(value => !Number.isInteger(value) || value < 0 || value > 20)) throw new Error('--skills must contain integers from 0 to 20');
const binary = args.stockfish || process.env.STOCKFISH_BINARY;
if (typeof binary !== 'string' || !binary.trim()) throw new Error('Pass --stockfish=/absolute/path/to/stockfish or set STOCKFISH_BINARY to the executable path');
const output = new URL(args.output || 'docs/ai-bot-arena.json', root);
const pgnOutput = new URL(args.pgn || 'docs/ai-bot-arena.pgn', root);
const weights = await readFile(new URL('model/weights.bin', root));
const model = createModelFromBytes(JSON.parse(await readFile(new URL('model/capsule.json', root), 'utf8')), weights);
const stockfish = new UciEngine(binary);
const openings = [
  { name: 'Italian', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { name: 'Queen’s Gambit', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'] },
];
const plannedGames = skills.length * openings.length * 2;
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
  engine: { version: ENGINE_VERSION, sourceSHA256: hash(await readFile(new URL('src/engine.js', root))), mode: 'search' },
  model: { ...MODEL_METADATA, actualWeightsSHA256: hash(weights) },
  scripts: { arenaSHA256: hash(await readFile(new URL('scripts/arena-ai.mjs', root))), uciClientSHA256: hash(await readFile(new URL('scripts/lib/uci-engine.mjs', root))) },
  opponent: { source: 'https://github.com/official-stockfish/Stockfish/releases/tag/sf_19', executableSHA256: hash(await readFile(binary)), name: null, advertisedOptions: [], configuredOptions: [] },
  settings: { budgetMs, maxNodes, maxPlies, stockfishNodes, skills, clockPerSideMs: Math.ceil(maxPlies / 2) * budgetMs + reserveMs, reserveMs, plannedGames, openings, colorReversed: true, hashClearedPerGame: true, adjudication: 'Only rules-terminal games and explicit time/illegal-move forfeits are scored. Move-cap truncations remain unfinished and unscored.', clockPolicy: 'Competition clock exhaustion is a forfeit regardless of remaining mating material; such wins are reported separately from checkmate.' },
  environment: { node: process.version, platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model },
  caveats: [
    'These are deliberately limited Stockfish opponents, not full-strength Stockfish and not independently rated chess bots.',
    'Skill Level settings and a fixed Stockfish node cap do not establish a human Elo rating. No rating is inferred from this small pilot.',
    'The engines use different algorithms and limits: 150 ms and 64 tree visits for INTUITION by default, and 1000 native nodes for Stockfish. This is a development ladder, not equal-compute testing.',
    'Stockfish low-skill play can be randomized internally; the binary, settings, openings and moves are recorded but reruns need not be identical.',
    'Both sides have equal game clocks. Actual wall time, including UCI communication, is deducted. Individual neural inferences cannot be interrupted, so per-move time limits are soft.',
    'Stockfish is an external offline test opponent only. It is not called by the deployed AI.',
  ],
  games: [],
};
function summarize() {
  return skills.map(skill => {
    const games = report.games.filter(game => game.skill === skill);
    const scored = games.filter(game => game.result !== '*');
    const wins = scored.filter(game => game.winner && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] === 'intuition').length;
    const draws = scored.filter(game => game.result === '1/2-1/2').length;
    return { skill, games: games.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: games.length - scored.length, points: wins + draws / 2 };
  });
}
async function save() {
  report.summary = summarize();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await writeFile(pgnOutput, report.games.map(game => game.pgn).join('\n\n') + '\n');
}
try {
  await stockfish.init();
  report.opponent.name = stockfish.name;
  report.opponent.advertisedOptions = [...stockfish.options];
  model.infer(new Chess()); // Shared model warmup is excluded from clocks.
  for (const skill of skills) {
    const options = { Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, UCI_LimitStrength: false, 'Skill Level': skill };
    await stockfish.configure(options);
    report.opponent.configuredOptions.push({ skill, options });
    for (let openingIndex = 0; openingIndex < openings.length; openingIndex++) {
      const opening = openings[openingIndex];
      for (let reverse = 0; reverse < 2; reverse++) {
        await stockfish.newGame();
        const chess = new Chess(), history = [];
        for (const san of opening.moves) history.push(uciOf(chess.move(san)));
        const openingFen = chess.fen();
        const whiteEngine = reverse ? 'stockfish' : 'intuition', blackEngine = reverse ? 'intuition' : 'stockfish';
        const clocks = { w: report.settings.clockPerSideMs, b: report.settings.clockPerSideMs };
        const moves = [];
        let outcome = terminal(chess);
        for (let ply = 0; ply < maxPlies && !outcome; ply++) {
          const color = chess.turn(), engine = color === 'w' ? whiteEngine : blackEngine;
          const beforeFen = chess.fen(), started = performance.now();
          const result = engine === 'intuition'
            ? await chooseMove(chess, model, { mode: 'search', budgetMs: Math.min(budgetMs, Math.max(1, clocks[color])), maxNodes })
            : await stockfish.chooseMove(history, stockfishNodes);
          const elapsedMs = performance.now() - started;
          clocks[color] -= elapsedMs;
          if (clocks[color] <= 0) { outcome = { status: 'time-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
          let played;
          try { played = chess.move({ from: result.move?.slice(0, 2), to: result.move?.slice(2, 4), ...(result.move?.[4] ? { promotion: result.move[4] } : {}) }); }
          catch (error) { outcome = { status: 'invalid-move-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w', error: error.message, attemptedMove: result.move }; break; }
          history.push(uciOf(played));
          moves.push({ ply: ply + 1, engine, color, move: uciOf(played), san: played.san, beforeFen, afterFen: chess.fen(), elapsedMs, reportedElapsedMs: result.elapsedMs ?? null, treeNodes: result.nodes ?? null, inferenceCalls: result.inferenceCalls ?? null, proven: result.proven ?? null, stopReason: result.stopReason ?? null, stockfish: result.info ?? null });
          outcome = terminal(chess);
          if ((ply + 1) % 40 === 0) console.log(`Game ${report.games.length + 1}/${plannedGames}, skill ${skill}, ${opening.name}: ${ply + 1}/${maxPlies} plies`);
        }
        outcome ||= { status: 'truncated', result: '*', winner: null };
        chess.header('Event', 'INTUITION versus limited Stockfish pilot', 'White', whiteEngine, 'Black', blackEngine, 'Opening', opening.name, 'Result', outcome.result, 'Termination', outcome.status, 'StockfishSkill', String(skill), 'StockfishNodes', String(stockfishNodes));
        report.games.push({ id: report.games.length + 1, skill, pair: openingIndex + 1, opening: opening.name, openingMoves: opening.moves, openingFen, whiteEngine, blackEngine, ...outcome, plies: moves.length, finalFen: chess.fen(), clocks, moves, pgn: chess.pgn() });
        await save();
        console.log(`FINISHED ${report.games.length}/${plannedGames}: Skill ${skill}, ${whiteEngine} vs ${blackEngine}, ${outcome.result} (${outcome.status}), ${moves.length} plies`);
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.opponent.commandCount = stockfish.commands.length;
  await save();
  console.log(JSON.stringify(report.summary));
  console.log(`Saved ${output.pathname} and ${pgnOutput.pathname}`);
} finally { await stockfish.close(); }
