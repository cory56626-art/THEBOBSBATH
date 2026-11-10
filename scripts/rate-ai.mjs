/** Predeclared color-reversed Stockfish nominal-Elo ladder. Never adjudicates a truncated game. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { Chess } from 'chess.js';
import { createModelFromBytes, MODEL_METADATA } from '../model/index.js';
import { UciEngine } from './lib/uci-engine.mjs';
import { loadEngine } from './lib/load-engine.mjs';
import { getOpenings } from './lib/chess-openings.mjs';
import { DEFAULT_ELOS, eloOptions, validateEloOptions } from './lib/elo-protocol.mjs';
import { aiScore, estimateRating } from './lib/elo-rating.mjs';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(0, index < 0 ? undefined : index).replace(/^--/, ''), index < 0 ? true : arg.slice(index + 1)];
}));
const integer = (name, fallback, minimum) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return value;
};
const hash = value => createHash('sha256').update(value).digest('hex');
const budgetMs = integer('budget', 150, 1);
const maxNodes = integer('max-nodes', 32768, 1);
const maxPlies = integer('max-plies', 400, 2);
const reserveMs = integer('reserve', 1000, 0);
const rounds = integer('rounds', 1, 1);
const elos = args.elos ? String(args.elos).split(',').map(Number) : [...DEFAULT_ELOS];
if (!elos.length || elos.some(elo => !Number.isInteger(elo)) || new Set(elos).size !== elos.length) throw new Error('--elos must contain distinct integer Elo settings');
const binary = args.stockfish || process.env.STOCKFISH_BINARY;
if (typeof binary !== 'string' || !binary.trim()) throw new Error('Pass --stockfish=/absolute/path/to/stockfish or set STOCKFISH_BINARY');
if (args['engine-source'] && args['engine-revision']) throw new Error('Specify only one engine source or Git revision');
const output = new URL(args.output || 'docs/ai-provisional-elo.json', root);
const pgnOutput = new URL(args.pgn || 'docs/ai-provisional-elo.pgn', root);
const engineModule = await loadEngine(args['engine-revision'] ? { sourceRevision: args['engine-revision'] } : { sourcePath: args['engine-source'] || 'src/engine.js' });
const weights = await readFile(new URL('model/weights.bin', root));
const capsule = await readFile(new URL('model/capsule.json', root));
const model = createModelFromBytes(JSON.parse(capsule), weights);
const openingSet = args['opening-set'] || 'pilot8'; // Four openings; arena4 contains only two.
const openings = getOpenings(openingSet);
const plannedGames = elos.length * openings.length * 2 * rounds;
const uciOf = move => move.from + move.to + (move.promotion || '');
function terminal(chess) {
  if (chess.isCheckmate()) return { status: 'checkmate', result: chess.turn() === 'w' ? '0-1' : '1-0', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (!chess.isGameOver()) return null;
  const status = chess.isStalemate() ? 'stalemate' : chess.isThreefoldRepetition() ? 'threefold-repetition' : chess.isInsufficientMaterial() ? 'insufficient-material' : 'fifty-move-draw';
  return { status, result: '1/2-1/2', winner: null };
}
const scripts = ['scripts/rate-ai.mjs', 'scripts/lib/elo-rating.mjs', 'scripts/lib/elo-protocol.mjs', 'scripts/lib/uci-engine.mjs', 'scripts/lib/load-engine.mjs', 'scripts/lib/chess-openings.mjs', 'model/index.js', 'model/runtime.js', 'package-lock.json'];
const fingerprints = Object.fromEntries(await Promise.all(scripts.map(async path => [path, hash(await readFile(new URL(path, root)))])));
let gitCommit = null;
try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const report = {
  protocol: 'nominal-stockfish-elo-ladder-v1', startedAt: new Date().toISOString(), gitCommit,
  engine: { version: engineModule.ENGINE_VERSION, sourceSHA256: engineModule.sourceSHA256, sourceRef: engineModule.sourceRef, sourceDependencies: engineModule.sourceDependencies, sourceRevision: engineModule.sourceRevision, sourceFiles: engineModule.sourceFiles, sourceTreeSHA256: engineModule.sourceTreeSHA256, packageDependencies: engineModule.packageDependencies, packageLockSHA256: engineModule.packageLockSHA256, runtimePackageLockSHA256: engineModule.runtimePackageLockSHA256, mode: 'search' },
  model: { ...MODEL_METADATA, actualWeightsSHA256: hash(weights), capsuleSHA256: hash(capsule) },
  fingerprints,
  opponent: { releaseReference: 'https://github.com/official-stockfish/Stockfish/releases/tag/sf_19', executableSHA256: hash(await readFile(binary)), name: null, advertisedOptions: [], configuredOptions: [] },
  settings: {
    budgetMs, maxNodes, maxPlies, stockfishSearch: { movetime: budgetMs }, stockfishNodeCap: null,
    elos, openingSet, openings, rounds, plannedGames, colorReversed: true, threads: 1, hashMiB: 16,
    clockPerSideMs: Math.ceil(maxPlies / 2) * budgetMs + reserveMs, reserveMs,
    hashClearedPerGame: true,
    adjudication: 'Only rules-terminal games and explicit time/illegal-move forfeits are scored. All move-cap truncations remain unfinished and unscored. Any unfinished game or incomplete schedule withholds the main rating estimate.',
    clockPolicy: 'Competition clock exhaustion is a forfeit regardless of remaining mating material; checkmate and time wins are counted separately. Actual wall time including protocol/model overhead is deducted.',
  },
  environment: { node: process.version, platform: os.platform(), architecture: os.arch(), cpu: os.cpus()[0]?.model },
  caveats: [
    'This is a provisional estimate on Stockfish 19’s nominal UCI_Elo setting scale at the recorded test limits. It is not an official human, FIDE, Lichess, or Chess.com rating.',
    'Stockfish documents its UCI_Elo calibration at 120 seconds + 1 second against CCRL 40/4. Testing at 150 ms per move does not transfer that calibration. Systematic scale error is unquantified and is not covered by the interval.',
    'The conservative interval uses entire color-reversed pairs as independent units and the logistic expected-score model. Only four fixed opening families are tested; opening selection bias and departures from the score model are not measured.',
    'Stockfish limiter play may be randomized internally. Recorded source, dependency, model, protocol and binary hashes establish provenance, not bit-for-bit reproducibility of games.',
    'The node cap limits AI tactical work, while Stockfish uses a single native CPU thread and pure go movetime with no node cap. Equal move budgets do not mean equal algorithms or node work.',
    'Per-move limits are soft because synchronous work and UCI communications cannot be interrupted exactly. Equal finite game clocks account for actual elapsed time.',
    'Stockfish is an offline benchmark opponent only, never a dependency of the deployed move chooser.',
  ],
  games: [],
};
function summarize() {
  return elos.map(elo => {
    const games = report.games.filter(game => game.elo === elo);
    const scored = games.filter(game => aiScore(game) !== null);
    const wins = scored.filter(game => aiScore(game) === 1).length;
    const draws = scored.filter(game => aiScore(game) === 0.5).length;
    const terminations = Object.fromEntries([...new Set(games.map(game => game.status))].map(status => [status, games.filter(game => game.status === status).length]));
    return { elo, games: games.length, scored: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: games.length - scored.length, points: wins + draws / 2, terminations };
  });
}
async function save() {
  report.summary = summarize();
  report.rating = estimateRating(report.games, { plannedGames, budgetMs });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await writeFile(pgnOutput, report.games.map(game => game.pgn).join('\n\n') + '\n');
}
// Save the frozen schedule and fingerprints before playing the first game.
await save();
const stockfish = new UciEngine(binary);
try {
  await stockfish.init();
  if (!/^Stockfish 19\b/.test(stockfish.name || '')) throw new Error(`This protocol requires Stockfish 19; got ${stockfish.name}`);
  validateEloOptions(stockfish.options, elos);
  report.opponent.name = stockfish.name;
  report.opponent.advertisedOptions = [...stockfish.options];
  model.infer(new Chess());
  for (const elo of elos) {
    const options = eloOptions(elo);
    await stockfish.configure(options);
    report.opponent.configuredOptions.push({ elo, options });
    await save();
    for (let round = 0; round < rounds; round++) for (let openingIndex = 0; openingIndex < openings.length; openingIndex++) {
      const opening = openings[openingIndex];
      for (let reverse = 0; reverse < 2; reverse++) {
        await stockfish.newGame();
        const chess = new Chess(), history = [];
        for (const san of opening.moves) history.push(uciOf(chess.move(san)));
        const openingFen = chess.fen();
        const whiteEngine = reverse ? 'stockfish' : 'intuition', blackEngine = reverse ? 'intuition' : 'stockfish';
        const clocks = { w: report.settings.clockPerSideMs, b: report.settings.clockPerSideMs }, moves = [];
        let outcome = terminal(chess);
        for (let ply = 0; ply < maxPlies && !outcome; ply++) {
          const color = chess.turn(), engine = color === 'w' ? whiteEngine : blackEngine;
          const beforeFen = chess.fen(), started = performance.now();
          const result = engine === 'intuition'
            ? await engineModule.chooseMove(chess, model, { mode: 'search', budgetMs: Math.min(budgetMs, Math.max(1, clocks[color])), maxNodes })
            : await stockfish.chooseMove(history, { movetime: Math.min(budgetMs, Math.max(1, Math.floor(clocks[color]))) });
          const elapsedMs = performance.now() - started;
          clocks[color] -= elapsedMs;
          if (clocks[color] <= 0) { outcome = { status: 'time-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
          let played;
          try { played = chess.move({ from: result.move?.slice(0, 2), to: result.move?.slice(2, 4), ...(result.move?.[4] ? { promotion: result.move[4] } : {}) }); }
          catch (error) { outcome = { status: 'invalid-move-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w', error: error.message, attemptedMove: result.move }; break; }
          history.push(uciOf(played));
          moves.push({ ply: ply + 1, engine, color, move: uciOf(played), san: played.san, beforeFen, afterFen: chess.fen(), elapsedMs, reportedElapsedMs: result.elapsedMs ?? null, nodes: result.nodes ?? result.info?.nodes ?? null, nodeUnit: result.nodeUnit || (engine === 'intuition' ? 'tactical-position' : 'native-stockfish-node'), tacticalNodes: result.tacticalNodes ?? null, qNodes: result.qNodes ?? null, depth: result.depth ?? null, completedIterations: result.completedIterations ?? null, scoreCp: result.scoreCp ?? null, searchKind: result.searchKind || (engine === 'intuition' ? 'hybrid-alpha-beta' : 'stockfish'), inferenceCalls: result.inferenceCalls ?? null, proven: result.proven ?? null, stopReason: result.stopReason ?? null, stockfish: result.info ?? null });
          outcome = terminal(chess);
          if ((ply + 1) % 40 === 0) console.log(`Game ${report.games.length + 1}/${plannedGames}, nominal Elo ${elo}, ${opening.name}: ${ply + 1}/${maxPlies} plies`);
        }
        outcome ||= { status: 'truncated', result: '*', winner: null };
        chess.header('Event', 'INTUITION provisional Stockfish nominal-Elo ladder', 'White', whiteEngine, 'Black', blackEngine, 'Opening', opening.name, 'Result', outcome.result, 'Termination', outcome.status, 'StockfishElo', String(elo), 'StockfishMoveTimeMs', String(budgetMs));
        report.games.push({ id: report.games.length + 1, round: round + 1, elo, pair: openingIndex + 1, opening: opening.name, openingMoves: opening.moves, openingFen, whiteEngine, blackEngine, ...outcome, plies: moves.length, finalFen: chess.fen(), clocks, moves, pgn: chess.pgn() });
        await save();
        console.log(`FINISHED ${report.games.length}/${plannedGames}: Nominal Elo ${elo}, ${whiteEngine} vs ${blackEngine}, ${outcome.result} (${outcome.status}), ${moves.length} plies`);
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.opponent.commandCount = stockfish.commands.length;
  await save();
  console.log(JSON.stringify({ summary: report.summary, rating: report.rating }));
  console.log(`Saved ${output.pathname} and ${pgnOutput.pathname}`);
} catch (error) {
  report.error = error.message;
  await save();
  throw error;
} finally { await stockfish.close(); }
