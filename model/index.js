/**
 * Experiment adapter for Peter Baer's pretrained neural-chess capsule.
 * Inference source: MIT. Weights: CC0-1.0. See LICENSE.upstream.txt.
 * This is a real, compact learned transformer baseline, not a Stockfish clone.
 */
import { Chess } from 'chess.js';
import { createEngineFromBytes, featurize, encodeMove, legalPolicySoftmax } from './runtime.js';

export const MODEL_METADATA = Object.freeze({
  name: 'Neural Chess v3.1 clean-distilled',
  modelId: 'v3.1-clean-distilled',
  parameters: 116266,
  weightsBytes: 464936,
  weightsSHA256: '5b584935b8a23a662096d2ecc34f2af8c580058252ef0567194b080187945468',
  source: 'https://github.com/pbaer/neural-chess',
  sourceCommit: '524ba14d4af3b739cbe19bd8cd0b14892e6305ca',
  sourceLicense: 'MIT',
  weightsLicense: 'CC0-1.0',
  valuePerspective: 'side to move',
});

const PROMOTION = { n: 2, b: 3, r: 4, q: 5 };
const squareIndex = (square) => (square.charCodeAt(1) - 49) * 8 + square.charCodeAt(0) - 97;
const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

/** Preserve repetition features when supplied a game with its move history. */
function repetitions(chess, explicitCount) {
  if (Number.isFinite(explicitCount)) return explicitCount;
  if (chess.isThreefoldRepetition()) return 3;
  const key = positionKey(chess.fen());
  let count = 1;
  for (const move of chess.history({ verbose: true })) {
    if (positionKey(move.before) === key) count++;
  }
  return count;
}

/**
 * Convert the rules library's board into the upstream featurizer's contract.
 * Black positions mirror ranks only; files stay fixed. Promotion indices are
 * mapped through the legal move list, covering all four promotion choices.
 */
export function boardFeatures(chess, { repetitionCount } = {}) {
  const fen = chess.fen({ forceEnpassantSquare: true });
  const fields = fen.split(' ');
  const count = repetitions(chess, repetitionCount);
  const pieces = [];
  const types = new Map();
  for (const row of chess.board()) for (const piece of row) {
    if (!piece) continue;
    const square = squareIndex(piece.square);
    pieces.push({ square, color: piece.color, type: piece.type });
    types.set(square, piece.type);
  }
  const board = {
    turn: chess.turn(),
    pieces: () => pieces,
    hasKingsideCastlingRights: (color) => fields[2].includes(color === 'w' ? 'K' : 'k'),
    hasQueensideCastlingRights: (color) => fields[2].includes(color === 'w' ? 'Q' : 'q'),
    epSquare: fields[3] === '-' ? null : squareIndex(fields[3]),
    halfmoveClock: Number(fields[4]),
    fullmoveNumber: Number(fields[5]),
    isRepetition: (n) => count >= n,
    pieceTypeAt: (square) => types.get(square) ?? null,
  };
  return featurize(board);
}

/** Map every legal chess.js move to its canonical model-policy index. */
export function legalMoveIndices(chess) {
  const black = chess.turn() === 'b';
  return chess.moves({ verbose: true }).map((move) => {
    let from = squareIndex(move.from);
    let to = squareIndex(move.to);
    if (black) { from ^= 56; to ^= 56; }
    const index = encodeMove({ from, to, promotion: PROMOTION[move.promotion] ?? null });
    if (index < 0) throw new Error(`Model cannot encode legal move ${move.lan}`);
    return { index, uci: move.from + move.to + (move.promotion ?? ''), san: move.san };
  });
}

/** Build a model without network IO, for reproducible test and Node use. */
export function createModelFromBytes(manifest, weights) {
  const buffer = weights instanceof ArrayBuffer
    ? weights
    : weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength);
  const engine = createEngineFromBytes(manifest, buffer);
  return Object.freeze({
    metadata: MODEL_METADATA,
    infer(input, options = {}) {
      const chess = typeof input === 'string' ? new Chess(input) : input;
      if (!chess || typeof chess.moves !== 'function') throw new TypeError('infer expects a FEN or chess.js Chess instance');
      const moves = legalMoveIndices(chess);
      if (!moves.length) return {
        candidates: [], policy: [], value: chess.isCheckmate() ? -1 : 0,
        entropy: 0, confidence: 0, modelId: MODEL_METADATA.modelId, metadata: MODEL_METADATA,
      };
      const output = engine.forward(boardFeatures(chess, options));
      // Softmax over legal logits directly avoids underflow from illegal logits.
      const probabilities = legalPolicySoftmax(output.policyLogits, moves.map((move) => move.index));
      const candidates = moves.map((move) => ({
        ...move,
        probability: probabilities.get(move.index),
        logit: output.policyLogits[move.index],
      })).sort((a, b) => b.probability - a.probability || a.uci.localeCompare(b.uci));
      let entropy = 0;
      for (const move of candidates) if (move.probability > 0) entropy -= move.probability * Math.log(move.probability);
      entropy = candidates.length > 1 ? entropy / Math.log(candidates.length) : 0;
      return {
        candidates,
        policy: candidates,
        value: output.value,
        entropy,
        // This is policy concentration, not calibrated P(move is correct).
        confidence: candidates[0].probability,
        modelId: MODEL_METADATA.modelId,
        metadata: MODEL_METADATA,
      };
    },
  });
}

let loading;
/** Load the locally hosted, hash-verified weights. No runtime CDN is used. */
export function loadNeuralModel(onProgress = () => {}) {
  if (!loading) loading = (async () => {
    onProgress({ stage: 'manifest', progress: 0 });
    const response = await fetch(new URL('./capsule.json', import.meta.url));
    if (!response.ok) throw new Error(`Model manifest failed to load (HTTP ${response.status})`);
    const manifest = await response.json();
    onProgress({ stage: 'weights', progress: 0.2 });
    const weightsResponse = await fetch(new URL('./weights.bin', import.meta.url));
    if (!weightsResponse.ok) throw new Error(`Model weights failed to load (HTTP ${weightsResponse.status})`);
    const weights = await weightsResponse.arrayBuffer();
    if (weights.byteLength !== MODEL_METADATA.weightsBytes) throw new Error('Model weights have an unexpected size');
    const digest = await crypto.subtle.digest('SHA-256', weights);
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hash !== MODEL_METADATA.weightsSHA256) throw new Error('Model weight integrity verification failed');
    onProgress({ stage: 'ready', progress: 1 });
    return createModelFromBytes(manifest, weights);
  })().catch((error) => { loading = undefined; throw error; });
  return loading;
}

export const loadModel = loadNeuralModel;
