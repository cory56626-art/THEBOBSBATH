import { Chess } from 'chess.js';
import { extractFeatures, predictRisk } from './controller.js';

export const ENGINE_VERSION = 'intuition-mcts-1';
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

function emptyResult(mode, started) {
  return { mode, move: null, san: null, value: 0, confidence: 0, entropy: 0, nodes: 0, simulations: 0, elapsedMs: clock() - started, inferenceCalls: 0, searched: false, rootStats: [], pv: [], terminal: true, engineVersion: ENGINE_VERSION, gate: { risk: null, triggered: false, reason: 'Game over' } };
}

function policyResult(chess, prediction, started, mode = 'direct') {
  const best = prediction.candidates[0];
  return { mode, move: best.uci, san: best.san, value: prediction.value, confidence: prediction.confidence, entropy: prediction.entropy, nodes: 0, simulations: 0, elapsedMs: clock() - started, inferenceCalls: 1, searched: false, pv: [best.uci], rootStats: prediction.candidates.map(item => ({ ...item, prior: item.probability, visits: 0, value: null })), modelId: prediction.modelId, engineVersion: ENGINE_VERSION, gate: { risk: null, triggered: false, reason: 'Direct policy; no tree search' } };
}

export function directMove(chess, model) {
  const started = clock();
  if (chess.isGameOver()) return emptyResult('direct', started);
  return policyResult(chess, predictionFor(chess, model), started);
}

function node(prior = 1, uci = null, san = null) {
  return { prior, uci, san, visits: 0, sum: 0, children: [], expanded: false, networkValue: 0 };
}

function expand(current, prediction) {
  current.expanded = true;
  current.networkValue = prediction.value;
  current.children = prediction.candidates.map(move => node(move.probability, move.uci, move.san));
}

function pickChild(parent) {
  const scale = Math.sqrt(parent.visits + 1);
  let selected = null;
  let highest = -Infinity;
  for (const child of parent.children) {
    const q = child.visits ? -child.sum / child.visits : parent.networkValue - 0.15;
    const score = q + 1.6 * child.prior * scale / (1 + child.visits);
    if (score > highest) { selected = child; highest = score; }
  }
  return selected;
}

function bestChild(parent) {
  return [...parent.children].sort((a, b) => b.visits - a.visits || b.prior - a.prior || a.uci.localeCompare(b.uci))[0];
}

export async function chooseMove(chess, model, options = {}) {
  const started = clock();
  const { signal, onProgress } = options;
  const mode = options.mode || 'direct';
  if (!['direct', 'search', 'selective'].includes(mode)) throw new Error(`Unknown decision mode: ${mode}`);
  throwIfAborted(signal);
  if (chess.isGameOver()) return emptyResult(mode, started);
  const prediction = predictionFor(chess, model);
  throwIfAborted(signal);
  const direct = policyResult(chess, prediction, started, mode);
  if (mode === 'direct') return direct;

  const budgetMs = clamp(Number(options.budgetMs) || 500, 1, 30000);
  const maxNodes = Math.floor(clamp(Number(options.maxNodes) || 128, 1, 4096));

  let gateInfo = { risk: null, triggered: true, reason: 'Always search' };
  if (mode === 'selective') {
    const gate = options.gate;
    const sameBudget = !gate?.referenceSettings || (gate.referenceSettings.budgetMs === budgetMs && gate.referenceSettings.maxNodes === maxNodes);
    const compatible = gate?.trained && (!gate.modelId || gate.modelId === prediction.modelId) && sameBudget;
    const risk = compatible ? predictRisk(gate, extractFeatures(chess, prediction)) : null;
    const threshold = clamp(Number(options.threshold ?? 0.5), 0, 1);
    const triggered = risk === null || risk >= threshold;
    gateInfo = { risk, threshold, triggered, reason: !sameBudget ? 'Search caps changed; retrain controller for these caps' : risk === null ? 'No compatible trained controller; searching safely' : triggered ? 'Controller predicts reference-search disagreement' : 'Controller accepts direct policy' };
    if (!triggered) return { ...direct, gate: gateInfo };
  }

  const root = node();
  expand(root, prediction);
  root.visits = 1;
  root.sum = prediction.value;
  const position = serializePosition(chess);
  let nodes = 1, inferenceCalls = 1, simulations = 0, maxDepth = 0;
  // A synchronous neural evaluation cannot be interrupted. Reserve its observed
  // cost before starting another simulation instead of consistently overrunning
  // the game clock by one complete inference.
  let nextIterationReserveMs = Math.max(2, (clock() - started) * 1.25);
  while (nodes < maxNodes && clock() - started + nextIterationReserveMs < budgetMs) {
    throwIfAborted(signal);
    const iterationStarted = clock();
    const board = restorePosition(position);
    const path = [root];
    let current = root;
    while (current.expanded && current.children.length) {
      current = pickChild(current);
      playUci(board, current.uci);
      path.push(current);
      if (!current.expanded) break;
    }
    let value = terminalValue(board);
    if (value === null) {
      const nextPrediction = predictionFor(board, model);
      expand(current, nextPrediction);
      inferenceCalls++;
      value = nextPrediction.value;
    } else {
      current.expanded = true;
      current.networkValue = value;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      path[i].visits++;
      path[i].sum += value;
      value = -value;
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
  const best = bestChild(root);
  const pv = [];
  let cursor = root;
  while (cursor?.children.length && pv.length < 12) {
    cursor = bestChild(cursor);
    if (!cursor.visits) break;
    pv.push(cursor.uci);
  }
  return {
    ...direct, move: best.uci, san: best.san,
    value: best.visits ? -best.sum / best.visits : prediction.value,
    searched: true, gate: gateInfo, nodes, simulations, inferenceCalls,
    elapsedMs: clock() - started, depth: maxDepth, budgetMs, maxNodes,
    stopReason: nodes >= maxNodes ? 'node-limit' : 'time-limit', pv: pv.length ? pv : [best.uci],
    rootStats: root.children.map(child => ({ uci: child.uci, san: child.san, prior: child.prior, probability: child.prior, visits: child.visits, value: child.visits ? -child.sum / child.visits : null })).sort((a, b) => b.visits - a.visits || b.prior - a.prior),
  };
}
