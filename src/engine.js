import { Chess } from 'chess.js';
import { extractFeatures, predictRisk } from './controller.js';

export const ENGINE_VERSION = 'intuition-mcts-2';
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

function node(prior = 1, uci = null, san = null) {
  return { prior, uci, san, visits: 0, sum: 0, children: [], expanded: false, onePlyChecked: false, networkValue: 0, solved: null, mateDistance: null, provenMove: null };
}

function expand(current, prediction) {
  current.expanded = true;
  current.onePlyChecked = true;
  current.networkValue = prediction.value;
  current.children = prediction.candidates.map(move => node(move.probability, move.uci, move.san));
  // SAN comes from the legal rules engine, independently of the neural policy.
  // A checkmate marker is a proof and must outrank a confident prediction.
  for (const child of current.children) if (child.san.endsWith('#')) {
    child.solved = -1; child.mateDistance = 0; child.expanded = true; child.onePlyChecked = true;
  }
  updateProof(current);
}

function updateProof(current) {
  if (!current.children.length || current.solved !== null) return;
  const wins = current.children.filter(child => child.solved === -1);
  if (wins.length) {
    const best = wins.sort((a, b) => a.mateDistance - b.mateDistance || b.prior - a.prior)[0];
    current.solved = 1; current.mateDistance = best.mateDistance + 1; current.provenMove = best.uci;
  } else if (current.children.every(child => child.solved !== null)) {
    current.solved = Math.max(...current.children.map(child => -child.solved));
    const best = current.children.filter(child => -child.solved === current.solved)
      .sort((a, b) => current.solved === -1 ? b.mateDistance - a.mateDistance : b.prior - a.prior)[0];
    current.mateDistance = current.solved === 0 ? null : best.mateDistance + 1;
    current.provenMove = best.uci;
  }
}

function pickChild(parent) {
  const scale = Math.sqrt(parent.visits + 1);
  let selected = null;
  let highest = -Infinity;
  // An exact terminal result gains nothing from hundreds of repeat visits.
  // Spend the remaining budget resolving alternatives instead.
  const unresolved = parent.children.filter(child => child.solved === null);
  for (const child of unresolved.length ? unresolved : parent.children) {
    const q = child.visits ? -child.sum / child.visits : parent.networkValue - 0.15;
    const score = q + 1.6 * child.prior * scale / (1 + child.visits);
    if (score > highest) { selected = child; highest = score; }
  }
  return selected;
}

function bestChild(parent) {
  const wins = parent.children.filter(child => child.solved === -1);
  if (wins.length) return wins.sort((a, b) => a.mateDistance - b.mateDistance || b.prior - a.prior)[0];
  const notLost = parent.children.filter(child => child.solved !== 1);
  const available = notLost.length ? notLost : parent.children;
  if (!notLost.length) return [...available].sort((a, b) => b.mateDistance - a.mateDistance || b.visits - a.visits)[0];
  const best = [...available].sort((a, b) => b.visits - a.visits || b.prior - a.prior || a.uci.localeCompare(b.uci))[0];
  const draw = available.find(child => child.solved === 0);
  return draw && best.solved === null && best.visits && -best.sum / best.visits < 0 ? draw : best;
}

// Check a root alternative with exact rules, without a neural evaluation. An
// expanded node has already examined every legal reply's SAN, including mates.
// The caller's private board is restored even if rule evaluation throws.
function screenRootChild(board, child) {
  if (child.onePlyChecked || child.expanded || child.solved !== null) return 0;
  playUci(board, child.uci);
  try {
    const terminal = terminalValue(board);
    if (terminal !== null) {
      child.solved = terminal; child.expanded = true;
      child.mateDistance = terminal === 0 ? null : 0;
    } else {
      const mateReply = board.moves({ verbose: true }).find(move => move.san.endsWith('#'));
      if (mateReply) {
        child.solved = 1; child.mateDistance = 1; child.provenMove = uciOf(mateReply);
      }
    }
    child.onePlyChecked = true;
  } finally { board.undo(); }
  return 1;
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

export async function chooseMove(chess, model, options = {}) {
  const started = clock();
  const { signal, onProgress } = options;
  const mode = options.mode || 'direct';
  if (!['direct', 'search', 'selective'].includes(mode)) throw new Error(`Unknown decision mode: ${mode}`);
  throwIfAborted(signal);
  if (chess.isGameOver()) return emptyResult(mode, started, chess);
  const predictionStarted = clock();
  const prediction = predictionFor(chess, model);
  const policyEvaluationMs = clock() - predictionStarted;
  throwIfAborted(signal);
  const direct = policyResult(chess, prediction, started, mode);
  if (mode === 'direct') return direct;

  const budgetMs = clamp(Number(options.budgetMs) || 500, 1, 30000);
  const maxNodes = Math.floor(clamp(Number(options.maxNodes) || 128, 1, 4096));

  const root = node();
  expand(root, prediction);
  root.visits = 1; root.sum = prediction.value;
  let tacticalProbes = 0;
  if (root.solved === 1) {
    const mate = bestChild(root);
    return { ...direct, move: mate.uci, san: mate.san, value: 1, searched: true, nodes: 1, simulations: 0, depth: 1, tacticalProbes, proven: true, mateInPlies: 1, pv: [mate.uci], stopReason: 'proven-mate', elapsedMs: clock() - started, gate: { risk: null, triggered: true, reason: 'Immediate checkmate proven by legal moves' } };
  }

  // Check the policy's proposed move for an immediate opponent mate before a
  // controller is allowed to skip verification. This uses rules, not the value
  // network's opinion. Keep one private board and undo search paths thereafter.
  const board = restorePosition(serializePosition(chess));
  const policyChild = root.children.find(child => child.uci === direct.move);
  tacticalProbes += screenRootChild(board, policyChild);
  updateProof(root);

  let gateInfo = { risk: null, triggered: true, reason: 'Always search' };
  if (mode === 'selective') {
    const gate = options.gate;
    const problem = controllerProblem(gate, prediction.modelId, budgetMs, maxNodes);
    const risk = problem ? null : predictRisk(gate, extractFeatures(chess, prediction));
    const threshold = clamp(Number(options.threshold ?? 0.5), 0, 1);
    const triggered = policyChild.solved === 1 || risk === null || risk >= threshold;
    gateInfo = { risk, threshold, triggered, reason: policyChild.solved === 1 ? 'Policy move allows a proven opponent mate; verifying alternatives' : problem || (triggered ? 'Controller predicts reference-search disagreement' : 'Validated controller accepts direct policy') };
    if (!triggered) return { ...direct, tacticalProbes, gate: gateInfo, elapsedMs: clock() - started };
  }
  let nodes = 1, inferenceCalls = 1, simulations = 0, maxDepth = 0;
  // A synchronous neural evaluation cannot be interrupted. Reserve its observed
  // cost before starting another simulation instead of consistently overrunning
  // the game clock by one complete inference.
  // Root setup and tactical screening are paid once. Forecast the next neural
  // evaluation from its measured cost, not from all elapsed setup work.
  let nextIterationReserveMs = Math.max(2, policyEvaluationMs * 1.25);
  while (root.solved === null && nodes < maxNodes && clock() - started + nextIterationReserveMs < budgetMs) {
    throwIfAborted(signal);
    const iterationStarted = clock();
    const path = [root];
    let current = root;
    let applied = 0;
    try {
      while (current.solved === null && current.expanded && current.children.length) {
        current = pickChild(current);
        playUci(board, current.uci); applied++;
        path.push(current);
        if (!current.expanded) break;
      }
      let value = current.solved ?? terminalValue(board);
      if (value === null) {
        const nextPrediction = predictionFor(board, model);
        expand(current, nextPrediction);
        inferenceCalls++;
        value = current.solved ?? nextPrediction.value;
      } else {
        current.expanded = true; current.solved = value;
        current.mateDistance ??= value === 0 ? null : 0;
        current.networkValue = value;
      }
      for (let i = path.length - 1; i >= 0; i--) {
        path[i].visits++; path[i].sum += value;
        updateProof(path[i]);
        value = -(path[i].solved ?? value);
      }
    } finally {
      while (applied-- > 0) board.undo();
    }
    nodes++;
    simulations++;
    maxDepth = Math.max(maxDepth, path.length - 1);
    nextIterationReserveMs = Math.max(nextIterationReserveMs, (clock() - iterationStarted) * 1.25);
    // Yield to allow worker cancellation messages and keep budget checks responsive.
    if (simulations % 4 === 0) {
      onProgress?.({ nodes, simulations, elapsedMs: clock() - started, depth: maxDepth });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throwIfAborted(signal);
  let best = bestChild(root);
  // When time/nodes run out after rejecting the first policy move, the most
  // visited replacement may still be completely unexamined. Do not replace one
  // immediate mate blunder with another. This bounded pass checks each selected
  // alternative at most once, counts rule probes separately, and does no extra
  // neural inference. It proves only terminal results and immediate mate safety;
  // it is not a guarantee that the eventual move is strategically best.
  for (let checked = 0; checked < root.children.length; checked++) {
    throwIfAborted(signal);
    if (best.onePlyChecked || best.expanded || best.solved !== null) break;
    tacticalProbes += screenRootChild(board, best);
    updateProof(root);
    if (best.solved !== 1) break;
    best = bestChild(root);
    if ((checked + 1) % 4 === 0) {
      onProgress?.({ nodes, simulations, elapsedMs: clock() - started, depth: maxDepth, tacticalProbes });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throwIfAborted(signal);
  const pv = [];
  let cursor = root;
  while (cursor?.children.length && pv.length < 12) {
    cursor = bestChild(cursor);
    if (!cursor.visits && cursor.solved === null) break;
    pv.push(cursor.uci);
  }
  return {
    ...direct, move: best.uci, san: best.san,
    value: best.solved !== null ? -best.solved : best.visits ? -best.sum / best.visits : prediction.value,
    searched: true, gate: gateInfo, nodes, simulations, inferenceCalls,
    elapsedMs: clock() - started, depth: maxDepth, budgetMs, maxNodes,
    tacticalProbes, proven: best.solved === -1, mateInPlies: best.solved === -1 ? best.mateDistance + 1 : null,
    stopReason: root.solved !== null ? 'proven-result' : nodes >= maxNodes ? 'node-limit' : 'time-limit', pv: pv.length ? pv : [best.uci],
    rootStats: root.children.map(child => ({ uci: child.uci, san: child.san, prior: child.prior, probability: child.prior, visits: child.visits, value: child.solved !== null ? -child.solved : child.visits ? -child.sum / child.visits : null, provenValue: child.solved !== null ? -child.solved : null })).sort((a, b) => b.visits - a.visits || b.prior - a.prior),
  };
}
