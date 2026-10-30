import { Chess } from 'chess.js';
import { chooseMove, playUci, throwIfAborted, ENGINE_VERSION } from './engine.js';
import { extractFeatures, trainController, canonicalPositionKey } from './controller.js';

export const MODES = Object.freeze(['direct', 'search', 'selective']);
const modelIdOf = model => model.metadata?.modelId || model.modelId || 'unknown';
const uciOf = move => move.from + move.to + (move.promotion || '');
const yieldToHost = () => new Promise(resolve => setTimeout(resolve, 0));
const openingFen = moves => { const c = new Chess(); for (const move of moves) c.move(move); return c.fen(); };
const matingMoves = fen => { const c = new Chess(fen); return c.moves({ verbose: true }).filter(move => { c.move(move); const mate = c.isCheckmate(); c.undo(); return mate; }).map(uciOf); };
const position = (id, name, fen, expectedMoves) => ({ id, name, fen, ...(expectedMoves ? { expectedMoves } : {}) });
const mate = (id, name, fen) => position(id, name, fen, matingMoves(fen));
const TACTICS = [
  mate('mate-white', 'White: finish in one', '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'),
  mate('mate-black', 'Black: finish in one', '8/8/8/8/8/6k1/5q2/7K b - - 0 1'),
  mate('mate-corner', 'Corner mating net', 'k7/8/1QK5/8/8/8/8/8 w - - 0 1'),
  position('free-queen', 'Capture the hanging queen', '7k/8/8/4q3/3P4/8/8/K7 w - - 0 1', ['d4e5']),
  position('rook-capture', 'Rook wins a queen', '4k3/8/8/8/4q3/8/4R3/4K3 w - - 0 1', ['e2e4']),
  mate('promotion-mate', 'Promotion finishes the game', '7k/P7/6K1/8/8/8/8/8 w - - 0 1'),
];
const ENDGAMES = [
  position('pawn-ending', 'King and pawn ending', '8/4k3/8/4P3/4K3/8/8/8 w - - 0 1'),
  position('rook-ending', 'Rook and king technique', '8/7k/8/6K1/8/8/8/R7 w - - 0 1'),
  position('terminal-stalemate', 'Recognize stalemate', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', []),
  position('terminal-mate', 'Recognize checkmate', '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', []),
];
const OPENINGS = [
  position('initial', 'Initial position', new Chess().fen()),
  position('italian', 'Italian development', openingFen(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'])),
  position('queens-gambit', 'Queen’s Gambit structure', openingFen(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'])),
  position('sicilian', 'Open Sicilian', openingFen(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])),
];
export const BENCHMARK_SUITES = Object.freeze({ mixed: [...TACTICS.slice(0, 4), ...ENDGAMES, ...OPENINGS.slice(1, 3)], tactics: TACTICS, endgames: ENDGAMES, openings: OPENINGS, smoke: [TACTICS[0], TACTICS[3], ENDGAMES[2]] });

function randomSource(seed) { let x = seed >>> 0; return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296; }; }
const CALIBRATION_OPENINGS = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6'],
  ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5'],
  ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6', 'O-O', 'Be7'],
  ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7'],
  ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4'],
];
function generateCalibrationPositions() {
  const random = randomSource(20261030), result = [], seen = new Set(Object.values(BENCHMARK_SUITES).flat().map(p => canonicalPositionKey(p.fen)));
  for (let game = 0; game < CALIBRATION_OPENINGS.length; game++) {
    const chess = new Chess(); for (const move of CALIBRATION_OPENINGS[game]) chess.move(move);
    for (let ply = 0; ply < 28 && !chess.isGameOver(); ply++) {
      const moves = chess.moves({ verbose: true });
      const weights = moves.map(m => m.captured ? 2.2 : m.piece === 'p' ? 1.2 : 1);
      let sample = random() * weights.reduce((a, b) => a + b, 0), index = 0;
      while (sample > weights[index] && index < moves.length - 1) sample -= weights[index++];
      chess.move(moves[index]);
      if ([3, 9, 15, 21].includes(ply) && !chess.isGameOver()) {
        const key = canonicalPositionKey(chess.fen());
        if (!seen.has(key)) { result.push({ id: `cal-${game}-${ply}`, name: `Calibration game ${game + 1}, sample ${Math.floor(ply / 6) + 1}`, fen: chess.fen(), groupId: `calibration-game-${game}` }); seen.add(key); }
      }
    }
  }
  return result;
}
export const CALIBRATION_POSITIONS = Object.freeze(generateCalibrationPositions());

function safeOptions(options) {
  return { budgetMs: Math.max(10, Math.min(10000, Number(options.budgetMs) || 500)), maxNodes: Math.max(1, Math.min(4096, Number(options.maxNodes) || 64)), threshold: Math.max(0, Math.min(1, Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : .5)) };
}

export async function runSuite(model, options = {}) {
  const { suite = 'mixed', signal, onProgress, gate = null } = options;
  const positions = Array.isArray(suite) ? suite : BENCHMARK_SUITES[suite];
  if (!positions?.length) throw new Error('Choose a non-empty benchmark suite.');
  const settings = { ...safeOptions(options), suite: typeof suite === 'string' ? suite : 'custom', modes: [...MODES], timing: 'same per-move wall-time cap and search node cap; direct uses no tree search' };
  const rows = [], total = positions.length * MODES.length;
  throwIfAborted(signal);
  model.infer(new Chess()); // Exclude the common first-inference warm-up from timed comparisons.
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i], order = MODES.map((_, j) => MODES[(i + j) % MODES.length]);
    for (const mode of order) {
      throwIfAborted(signal);
      const chess = new Chess(p.fen), result = await chooseMove(chess, model, { ...settings, mode, gate, signal });
      const expectedMatch = p.expectedMoves === undefined ? null : p.expectedMoves.length ? p.expectedMoves.includes(result.move) : result.move === null;
      const row = { positionId: p.id, name: p.name, fen: p.fen, ...result, expectedMatch, modelId: modelIdOf(model), budgetMs: settings.budgetMs, maxNodes: settings.maxNodes };
      rows.push(row); onProgress?.({ phase: 'suite', completed: rows.length, total, row });
      await yieldToHost();
    }
  }
  const summary = MODES.map(mode => {
    const items = rows.filter(r => r.mode === mode), labelled = items.filter(r => r.expectedMatch !== null);
    return { mode, positions: items.length, averageMs: items.reduce((s, r) => s + r.elapsedMs, 0) / items.length, averageNodes: items.reduce((s, r) => s + r.nodes, 0) / items.length, searched: items.filter(r => r.searched).length, expectedCorrect: labelled.filter(r => r.expectedMatch).length, expectedTotal: labelled.length };
  });
  return { kind: 'suite', rows, summary, settings, modelId: modelIdOf(model), createdAt: new Date().toISOString() };
}

export async function calibrateController(model, options = {}) {
  const { signal, onProgress, positions = CALIBRATION_POSITIONS } = options, settings = safeOptions(options), samples = [];
  for (const p of positions) {
    throwIfAborted(signal);
    const chess = new Chess(p.fen);
    if (chess.isGameOver()) continue;
    const prediction = model.infer(chess), features = extractFeatures(chess, prediction);
    const direct = await chooseMove(chess, model, { ...settings, mode: 'direct', signal });
    const reference = await chooseMove(chess, model, { ...settings, mode: 'search', signal });
    samples.push({ fen: p.fen, groupId: p.groupId || p.id, features, label: Number(direct.move !== reference.move), modelId: modelIdOf(model), directMove: direct.move, referenceMove: reference.move, referenceNodes: reference.nodes, referenceMs: reference.elapsedMs });
    onProgress?.({ phase: 'calibration', completed: samples.length, total: positions.length, sample: samples.at(-1) });
    await yieldToHost();
  }
  throwIfAborted(signal);
  const gate = trainController(samples, { seed: options.seed ?? 42, iterations: options.iterations ?? 600 });
  gate.referenceSettings = { budgetMs: settings.budgetMs, maxNodes: settings.maxNodes };
  gate.referenceEngineVersion = ENGINE_VERSION;
  gate.createdAt = new Date().toISOString();
  return gate;
}

function terminalOutcome(chess) {
  if (chess.isCheckmate()) return { status: 'checkmate', result: chess.turn() === 'w' ? '0-1' : '1-0', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isGameOver()) return { status: chess.isStalemate() ? 'stalemate' : chess.isThreefoldRepetition() ? 'threefold-repetition' : chess.isInsufficientMaterial() ? 'insufficient-material' : 'draw', result: '1/2-1/2', winner: null };
  return null;
}

export async function runPairedMatches(model, options = {}) {
  const { signal, onProgress, gate = null } = options, settings = { ...safeOptions(options), rounds: Math.max(2, Math.min(8, Math.floor(Number(options.rounds) || 2))), maxPlies: Math.max(2, Math.min(400, Math.floor(Number(options.maxPlies) || 80))), timing: 'equal per-move wall-time cap, equal initial game clocks, equal search node cap', openingProtocol: 'same opening for each color-reversed game pair' };
  if (settings.rounds % 2) settings.rounds++;
  const pairs = [['direct', 'search'], ['direct', 'selective'], ['search', 'selective']], games = [], total = pairs.length * settings.rounds;
  for (const pair of pairs) for (let round = 0; round < settings.rounds; round++) {
    throwIfAborted(signal);
    const opening = CALIBRATION_OPENINGS[Math.floor(round / 2) % CALIBRATION_OPENINGS.length].slice(0, 6);
    const chess = new Chess(); for (const move of opening) chess.move(move);
    const whiteMode = pair[round % 2], blackMode = pair[1 - round % 2], clocks = { w: settings.budgetMs * Math.ceil(settings.maxPlies / 2), b: settings.budgetMs * Math.ceil(settings.maxPlies / 2) }, moves = [];
    let outcome = terminalOutcome(chess);
    for (let ply = 0; ply < settings.maxPlies && !outcome; ply++) {
      throwIfAborted(signal);
      const color = chess.turn(), mode = color === 'w' ? whiteMode : blackMode;
      const selected = await chooseMove(chess, model, { ...settings, budgetMs: Math.min(settings.budgetMs, Math.max(1, clocks[color])), mode, gate, signal });
      clocks[color] -= selected.elapsedMs;
      if (clocks[color] <= 0) { outcome = { status: 'time-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
      try { playUci(chess, selected.move || ''); } catch { outcome = { status: 'invalid-move-forfeit', result: color === 'w' ? '0-1' : '1-0', winner: color === 'w' ? 'b' : 'w' }; break; }
      moves.push({ ply: chess.history().length, color, mode, ...selected });
      outcome = terminalOutcome(chess);
      onProgress?.({ phase: 'matches', completed: games.length, total, gameProgress: { game: games.length + 1, ply: ply + 1, maxPlies: settings.maxPlies, fen: chess.fen(), whiteMode, blackMode } });
      await yieldToHost();
    }
    outcome ||= { status: 'truncated', result: '*', winner: null };
    chess.header('Event', 'Intuition paired experiment', 'White', whiteMode, 'Black', blackMode, 'Result', outcome.result);
    const game = { id: games.length + 1, pair: pair.join('-vs-'), round: round + 1, whiteMode, blackMode, opening, openingFen: openingFen(opening), ...outcome, plies: moves.length, finalFen: chess.fen(), clocks, moves, pgn: chess.pgn(), modelId: modelIdOf(model) };
    games.push(game); onProgress?.({ phase: 'matches', completed: games.length, total, game });
  }
  const standings = MODES.map(mode => {
    const played = games.filter(g => g.whiteMode === mode || g.blackMode === mode), scored = played.filter(g => g.result !== '*');
    const wins = scored.filter(g => (g.winner === 'w' && g.whiteMode === mode) || (g.winner === 'b' && g.blackMode === mode)).length, draws = scored.filter(g => g.result === '1/2-1/2').length;
    const moveRows = played.flatMap(g => g.moves.filter(m => m.mode === mode));
    return { mode, games: played.length, completed: scored.length, wins, draws, losses: scored.length - wins - draws, unfinished: played.length - scored.length, points: wins + draws / 2, averageMs: moveRows.length ? moveRows.reduce((s, m) => s + m.elapsedMs, 0) / moveRows.length : 0, searched: moveRows.filter(m => m.searched).length, moves: moveRows.length };
  });
  return { kind: 'matches', games, standings, settings, modelId: modelIdOf(model), createdAt: new Date().toISOString() };
}

export function rowsToCSV(rows) {
  if (!rows?.length) return '';
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => { let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n');
}
