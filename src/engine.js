import { Chess } from 'chess.js';
import { extractFeatures, predictRisk } from './controller.js';
import { tacticalSearch } from './tactical-search.js';

export const ENGINE_VERSION = 'intuition-hybrid-3';
export const uciOf = move => move.from + move.to + (move.promotion || '');
const clock = () => performance.now();
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
}

export function serializePosition(chess) {
  const history = chess.history({ verbose: true });
  return { fen: chess.fen(), initialFen: history[0]?.before || chess.fen(), moves: history.map(uciOf) };
}

export function restorePosition(position) {
  const chess = new Chess(position.initialFen || position.fen);
  for (const move of position.moves || []) playUci(chess, move);
  return chess;
}

export function playUci(chess, uci) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
}

function predictionFor(chess, model) {
  const prediction = model.infer(chess);
  const entries = prediction.candidates || prediction.policy || [];
  const legal = chess.moves({ verbose: true });
  const byUci = new Map(entries.map(item => [item.uci, item]));
  const candidates = legal.map(move => {
    const original = byUci.get(uciOf(move));
    return { uci: uciOf(move), san: move.san, probability: Math.max(1e-9, Number(original?.probability) || 0) };
  });
  if (candidates.length && !candidates.some(candidate => byUci.has(candidate.uci))) {
    throw new Error('The model did not return any legal moves for this position.');
  }
  const total = candidates.reduce((sum, item) => sum + item.probability, 0);
  for (const candidate of candidates) candidate.probability /= total;
  candidates.sort((a, b) => b.probability - a.probability || a.uci.localeCompare(b.uci));
  const entropy = candidates.length > 1 ? -candidates.reduce((sum, item) => sum + item.probability * Math.log(item.probability), 0) / Math.log(candidates.length) : 0;
  return { ...prediction, candidates, value: clamp(Number(prediction.value) || 0, -1, 1), confidence: candidates[0]?.probability || 0, entropy };
}

function terminalValue(chess) {
  if (chess.isCheckmate()) return -1;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  return null;
}

function emptyResult(mode, started, chess) {
  return { mode, move: null, san: null, value: chess.isCheckmate() ? -1 : 0, confidence: 0, entropy: 0, nodes: 0, simulations: 0, elapsedMs: clock() - started, inferenceCalls: 0, searched: false, rootStats: [], pv: [], terminal: true, engineVersion: ENGINE_VERSION, gate: { risk: null, triggered: false, reason: 'Game over' } };
}

function policyResult(chess, prediction, started, mode = 'direct') {
  const best = prediction.candidates[0];
  return { mode, move: best.uci, san: best.san, value: prediction.value, confidence: prediction.confidence, entropy: prediction.entropy, nodes: 0, simulations: 0, elapsedMs: clock() - started, inferenceCalls: 1, searched: false, pv: [best.uci], rootStats: prediction.candidates.map(item => ({ ...item, prior: item.probability, visits: 0, value: null })), modelId: prediction.modelId, engineVersion: ENGINE_VERSION, gate: { risk: null, triggered: false, reason: 'Direct policy; no tree search' } };
}

export function directMove(chess, model) {
  const started = clock();
  if (chess.isGameOver()) return emptyResult('direct', started, chess);
  return policyResult(chess, predictionFor(chess, model), started);
}

function controllerProblem(gate, modelId, budgetMs, maxNodes) {
  if (!gate?.trained || gate.modelId !== modelId) return 'No compatible trained controller; verifying the move';
  if (gate.referenceSettings && (gate.referenceSettings.budgetMs !== budgetMs || gate.referenceSettings.maxNodes !== maxNodes)) return 'Search caps changed; verifying the move';
  if (gate.referenceEngineVersion !== ENGINE_VERSION) return 'Controller lacks validation for this engine; verifying the move';
  const m = gate.metrics;
  if (!m || !Number.isInteger(m.testCount) || m.testCount < 30 || !Number.isFinite(m.testPositiveRate) || !(m.testPositiveRate > 0 && m.testPositiveRate < 1)) return 'Insufficient independent controller validation; verifying the move';
  if (!Number.isFinite(m.brier) || !Number.isFinite(m.baselineBrier) || m.brier < 0 || m.baselineBrier > 1 || m.brier >= m.baselineBrier) return 'Controller did not beat its validation baseline; verifying the move';
  return null;
}

// Exact rules screen the final move, including a fallback returned at tiny caps.
// Neither a neural prior nor a truncated search is permission to miss mate in one.
function screenMove(board, candidate) {
  playUci(board, candidate.uci);
  try {
    const terminal = terminalValue(board);
    return { terminal, allowsMate: terminal === null && board.moves({ verbose: true }).some(move => move.san.endsWith('#')) };
  } finally { board.undo(); }
}

export async function chooseMove(chess, model, options = {}) {
  const started = clock();
  const { signal, onProgress } = options;
  const mode = options.mode || 'direct';
  if (!['direct', 'search', 'selective'].includes(mode)) throw new Error(`Unknown decision mode: ${mode}`);
  throwIfAborted(signal);
  if (chess.isGameOver()) return emptyResult(mode, started, chess);
  const prediction = predictionFor(chess, model);
  throwIfAborted(signal);
  const direct = policyResult(chess, prediction, started, mode);
  if (mode === 'direct') return direct;
  const budgetMs = clamp(Number(options.budgetMs) || 500, 1, 30000);
  const maxNodes = Math.floor(clamp(Number(options.maxNodes) || 32768, 1, 1000000));
  const common = { searchKind: 'neural-ordered-alpha-beta', nodeUnit: 'tactical-position', budgetMs, maxNodes, inferenceCalls: 1 };
  const mate = prediction.candidates.find(candidate => candidate.san.endsWith('#'));
  if (mate) return {
    ...direct, ...common, move: mate.uci, san: mate.san, value: 1, scoreCp: 30000 - 1,
    searched: true, nodes: 1, tacticalNodes: 1, qNodes: 0, simulations: 0,
    depth: 1, completedIterations: 0, tacticalProbes: 0, proven: true, mateInPlies: 1,
    pv: [mate.uci], stopReason: 'proven-mate', elapsedMs: clock() - started,
    gate: { risk: null, triggered: true, reason: 'Immediate checkmate proven by legal moves' },
  };
  const screened = new Map();
  let tacticalProbes = 0;
  const screen = candidate => {
    if (!screened.has(candidate.uci)) { screened.set(candidate.uci, screenMove(chess, candidate)); tacticalProbes++; }
    return screened.get(candidate.uci);
  };
  let gateInfo = { risk: null, triggered: true, reason: 'Always search' };
  if (mode === 'selective') {
    const gate = options.gate;
    const problem = controllerProblem(gate, prediction.modelId, budgetMs, maxNodes);
    const risk = problem ? null : predictRisk(gate, extractFeatures(chess, prediction));
    const threshold = clamp(Number(options.threshold ?? .5), 0, 1);
    const unsafe = screen(prediction.candidates[0]).allowsMate;
    const triggered = unsafe || !Number.isFinite(risk) || risk >= threshold;
    gateInfo = { risk, threshold, triggered, reason: unsafe ? 'Policy move allows an immediate opponent mate; verifying alternatives' : problem || (triggered ? 'Controller predicts reference-search disagreement' : 'Validated controller accepts direct policy') };
    if (!triggered) return { ...direct, tacticalProbes, gate: gateInfo, elapsedMs: clock() - started };
  }
  // Leave room for the final exact-rule screen and result serialization. The
  // neural call, fast search, and safety check share one total decision budget.
  const finalCheckReserveMs = Math.min(8, budgetMs * .05);
  const remainingMs = Math.max(0, budgetMs - (clock() - started) - finalCheckReserveMs);
  const result = remainingMs > 0 ? await tacticalSearch(chess, {
    budgetMs: remainingMs, maxNodes, signal, priors: prediction.candidates,
    onProgress: progress => onProgress?.({ ...progress, inferenceCalls: 1, elapsedMs: clock() - started }),
  }) : { move: direct.move, scoreCp: null, depth: 0, nodes: 0, qNodes: 0, pv: [], completedIterations: 0, stopReason: 'time-limit', proven: false, mateInPlies: null };
  throwIfAborted(signal);
  let selected = prediction.candidates.find(candidate => candidate.uci === result.move) || prediction.candidates[0];
  // Screen replacements too. This pass is bounded by the legal move count and
  // records rule probes separately from the alpha-beta position cap.
  if (screen(selected).allowsMate) {
    for (let index = 0; index < prediction.candidates.length; index++) {
      throwIfAborted(signal);
      const candidate = prediction.candidates[index];
      if (!screen(candidate).allowsMate) { selected = candidate; break; }
      if ((index + 1) % 4 === 0) {
        onProgress?.({ nodes: result.nodes, tacticalProbes, elapsedMs: clock() - started });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
  throwIfAborted(signal);
  const changed = selected.uci !== result.move;
  const exact = screen(selected).terminal;
  const scoreCp = exact === 0 ? 0 : changed ? null : result.scoreCp;
  return {
    ...direct, ...common, move: selected.uci, san: selected.san,
    value: exact === 0 ? 0 : scoreCp === null ? prediction.value : Math.tanh(scoreCp / 600),
    valueSource: scoreCp === null ? 'neural-policy' : 'tactical-search', policyValue: prediction.value, scoreCp, searched: true, gate: gateInfo,
    nodes: result.nodes, tacticalNodes: result.nodes, qNodes: result.qNodes,
    simulations: result.nodes, elapsedMs: clock() - started, depth: result.depth,
    completedIterations: result.completedIterations, tacticalProbes,
    proven: !changed && !!result.proven, mateInPlies: !changed ? result.mateInPlies : null,
    stopReason: result.stopReason, pv: changed || !result.pv?.length ? [selected.uci] : result.pv,
    rootStats: prediction.candidates.map(candidate => ({ ...candidate, prior: candidate.probability, visits: 0, value: null })),
  };
}
