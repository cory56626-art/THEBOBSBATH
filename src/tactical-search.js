/** Independent bounded chess search. chess.js is pinned to 1.4.0; tests guard its
 * reversible low-level move contract so search avoids SAN construction per node. */
import { evaluatePosition } from './position-evaluation.js';

const MATE = 30000, INF = 32000, MASK = (1n << 64n) - 1n;
const STOP = Symbol('search limit');
const MATERIAL = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 20000 };
const square = index => String.fromCharCode(97 + (index & 7)) + (8 - (index >> 4));
export const internalMoveUci = move => square(move.from) + square(move.to) + (move.promotion || '');
const contribution = (hash, count) => count ? ((hash ^ (hash >> 23n)) * BigInt(2 * count + 1)) & MASK : 0n;
const mateStore = (score, ply) => score > MATE - 200 ? score + ply : score < -MATE + 200 ? score - ply : score;
const mateRead = (score, ply) => score > MATE - 200 ? score - ply : score < -MATE + 200 ? score + ply : score;

function assertBoard(chess) {
  if (!Array.isArray(chess._board) || !(chess._positionCount instanceof Map) || typeof chess._hash !== 'bigint' || typeof chess._moves !== 'function' || typeof chess._makeMove !== 'function' || typeof chess._undoMove !== 'function') throw new Error('Tactical search requires the pinned chess.js 1.4.0 board contract');
}

/** The caller's complete position and history are restored on every exit. */
export async function tacticalSearch(chess, options = {}) {
  assertBoard(chess);
  const started = performance.now();
  const budgetMs = Math.max(1, Math.min(30000, Number(options.budgetMs) || 150));
  const maxNodes = Math.max(1, Math.floor(Number(options.maxNodes) || 20000));
  const maxDepth = Math.max(1, Math.min(32, Math.floor(Number(options.maxDepth) || 16)));
  const deadline = started + budgetMs;
  const counts = new Map(chess._positionCount);
  let context = 0n;
  for (const [hash, count] of counts) context ^= contribution(hash, count);
  const tt = new Map(), killers = [], history = new Int32Array(128 * 128 * 2), pv = [];
  const priors = new Map((options.priors || []).map(move => [move.uci, Number(move.probability ?? move.prior) || 0]));
  let nodes = 0, qNodes = 0, completedIterations = 0, rootStats = [], partialRootStats = [];
  const initialHistoryLength = chess._history.length, initialHash = chess._hash;
  let interrupted = false;
  const aborted = () => { if (options.signal?.aborted) throw new DOMException('Run cancelled', 'AbortError'); };
  const visit = (quiescent = false) => {
    aborted();
    if (nodes >= maxNodes || performance.now() >= deadline) throw STOP;
    nodes++;
    if (quiescent) qNodes++;
  };
  function make(move) {
    chess._makeMove(move);
    const hash = chess._hash, count = counts.get(hash) || 0;
    context ^= contribution(hash, count) ^ contribution(hash, count + 1);
    counts.set(hash, count + 1);
  }
  function undo() {
    const hash = chess._hash, count = counts.get(hash);
    context ^= contribution(hash, count) ^ contribution(hash, count - 1);
    if (count === 1) counts.delete(hash); else counts.set(hash, count - 1);
    chess._undoMove();
  }
  function hasLegalMove(pseudo = chess._moves({ legal: false })) {
    const color = chess._turn;
    for (const move of pseudo) {
      chess._makeMove(move);
      let safe;
      try { safe = !chess._isKingAttacked(color); } finally { chess._undoMove(); }
      if (safe) return true;
    }
    return false;
  }
  function drawn(inCheck) {
    if (chess._halfMoves < 100 && (counts.get(chess._hash) || 0) < 3 && !chess.isInsufficientMaterial()) return false;
    // Checkmate ends the game before draw claims, including a 100th half-move.
    return !inCheck || hasLegalMove();
  }
  function order(moves, ply, preferred, root = false) {
    const side = chess._turn === 'w' ? 0 : 1;
    const ranked = moves.map(move => {
      const uci = internalMoveUci(move);
      let score = move.captured ? 100000 + 16 * MATERIAL[move.captured] - MATERIAL[move.piece] : 0;
      if (move.promotion) score += 80000 + MATERIAL[move.promotion];
      if (uci === preferred) score += 10000000;
      if (!move.captured && !move.promotion) score += killers[ply]?.[0] === uci ? 60000 : killers[ply]?.[1] === uci ? 50000 : history[side * 16384 + move.from * 128 + move.to];
      // A learned root suggestion improves ordering but never replaces minimax.
      if (root) score += (priors.get(uci) || 0) * 40000;
      return { move, score, uci };
    });
    ranked.sort((a, b) => b.score - a.score || a.uci.localeCompare(b.uci));
    return ranked;
  }
  function quietCutoff(move, ply, depth) {
    if (move.captured || move.promotion) return;
    const uci = internalMoveUci(move);
    if (killers[ply]?.[0] !== uci) killers[ply] = [uci, killers[ply]?.[0]];
    const index = (chess._turn === 'w' ? 0 : 16384) + move.from * 128 + move.to;
    history[index] = Math.min(40000, history[index] + depth * depth * 20);
  }
  function quiescence(alpha, beta, ply) {
    visit(true); pv[ply] = [];
    if (ply >= 96) throw STOP; // Never invent a stand-pat score while in check.
    const inCheck = chess._isKingAttacked(chess._turn);
    if (drawn(inCheck)) return 0;
    const moves = chess._moves({ legal: false });
    if (!inCheck && !hasLegalMove(moves)) return 0;
    if (!inCheck) {
      const stand = evaluatePosition(chess);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
    const color = chess._turn;
    let legal = 0;
    for (const { move, uci } of order(inCheck ? moves : moves.filter(move => move.captured || move.promotion), ply)) {
      make(move);
      let score;
      try {
        if (chess._isKingAttacked(color)) continue;
        legal++;
        score = -quiescence(-beta, -alpha, ply + 1);
      } finally { undo(); }
      if (score >= beta) return score;
      if (score > alpha) { alpha = score; pv[ply] = [uci, ...(pv[ply + 1] || [])]; }
    }
    if (inCheck && !legal) return -MATE + ply;
    return alpha;
  }
  function negamax(depth, alpha, beta, ply) {
    if (depth <= 0) return quiescence(alpha, beta, ply);
    visit(); pv[ply] = [];
    const inCheck = chess._isKingAttacked(chess._turn);
    if (drawn(inCheck)) return 0;
    const hash = chess._hash, halfMoves = chess._halfMoves, originalAlpha = alpha;
    const old = tt.get(hash);
    if (ply && old && old.depth >= depth && old.halfMoves === halfMoves && old.context === context) {
      const score = mateRead(old.score, ply);
      if (old.flag === 'exact' || (old.flag === 'lower' && score >= beta) || (old.flag === 'upper' && score <= alpha)) {
        pv[ply] = old.move ? [old.move] : [];
        return score;
      }
    }
    const color = chess._turn;
    let best = -INF, bestMove = null, legal = 0;
    const moves = order(chess._moves({ legal: false }), ply, old?.move, ply === 0);
    for (const { move, uci } of moves) {
      const searchAlpha = alpha;
      make(move);
      let score;
      try {
        if (chess._isKingAttacked(color)) continue;
        legal++;
        score = -negamax(depth - 1, -beta, -alpha, ply + 1);
      } finally { undo(); }
      if (ply === 0) partialRootStats.push({ uci, valueCp: score, bound: score <= searchAlpha ? 'upper' : score >= beta ? 'lower' : null });
      if (score > best) { best = score; bestMove = uci; pv[ply] = [uci, ...(pv[ply + 1] || [])]; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) { quietCutoff(move, ply, depth); break; }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    const entry = { depth, score: mateStore(best, ply), flag: best <= originalAlpha ? 'upper' : best >= beta ? 'lower' : 'exact', move: bestMove, halfMoves, context };
    if (tt.size < 50000 || tt.has(hash)) tt.set(hash, entry);
    return best;
  }
  aborted();
  const legalMoves = chess._moves();
  if (!legalMoves.length || chess._halfMoves >= 100 || (counts.get(chess._hash) || 0) >= 3 || chess.isInsufficientMaterial()) return { move: null, scoreCp: !legalMoves.length && chess.isCheck() ? -MATE : 0, nodes: 0, qNodes: 0, depth: 0, pv: [], completedIterations: 0, elapsedMs: performance.now() - started, stopReason: 'terminal', terminal: true, proven: false, mateInPlies: null, rootStats: [] };
  const fallback = order(legalMoves, 0, null, true)[0].uci;
  let best = fallback, scoreCp = evaluatePosition(chess), bestPv = [fallback], depth = 0;
  try {
    for (let target = 1; target <= maxDepth; target++) {
      partialRootStats = [];
      const score = negamax(target, -INF, INF, 0);
      scoreCp = score; bestPv = pv[0].length ? [...pv[0]] : bestPv; best = bestPv[0]; depth = target;
      completedIterations++;
      rootStats = partialRootStats.map(stat => ({ ...stat, depth: target }));
      options.onProgress?.({ nodes, qNodes, depth, elapsedMs: performance.now() - started, pv: bestPv, scoreCp });
      if (Math.abs(scoreCp) > MATE - 200) break;
      await new Promise(resolve => setTimeout(resolve, 0));
      aborted();
    }
  } catch (error) {
    if (error !== STOP) throw error;
    interrupted = true;
  } finally {
    // Recursive try/finally pairs restore every applied move, even on budget
    // exhaustion, cancellation, model callbacks, or unexpected exceptions.
    if (chess._history.length !== initialHistoryLength || chess._hash !== initialHash) throw new Error('Tactical search failed to restore its caller board');
  }
  const proven = scoreCp > MATE - 200;
  return { move: best, scoreCp, nodes, qNodes, depth, pv: bestPv, completedIterations, elapsedMs: performance.now() - started, stopReason: proven ? 'proven-mate' : nodes >= maxNodes ? 'node-limit' : interrupted ? 'time-limit' : 'depth-limit', proven, mateInPlies: proven ? MATE - scoreCp : null, rootStats };
}
