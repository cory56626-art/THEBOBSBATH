/**
 * Gato 2 search core: an original, self-contained 0x88 board with incremental
 * Zobrist keys and make/unmake, a faithful port of Gato 1's evaluation, and a
 * principal-variation alpha-beta search with standard selectivity (null move,
 * late-move reductions, futility and SEE pruning in quiescence).
 *
 * chess.js stays the rules authority for the game itself. This module copies
 * the caller's position (and its reversible history for repetition checks),
 * searches privately and never mutates the caller's board.
 */

import { PARAMS, PARAM_COUNT, pstIndex } from './gato-eval-params.js';
import { GATO3_WEIGHTS } from './gato3-weights.js';

// Piece codes: type | color << 3. White 1..6, black 9..14.
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const MATE = 30000, INF = 32000, MATE_BOUND = MATE - 512;
const MAX_PLY = 96;
const STOP = Symbol('gato search limit');
const TYPE_OF = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
const PROMO_CHAR = ['', '', 'n', 'b', 'r', 'q'];
const SEE_VALUE = [0, 100, 320, 330, 500, 950, 20000];
const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_OFFSETS = [-17, -15, 15, 17];
const ROOK_OFFSETS = [-16, -1, 1, 16];
const QUEEN_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];

// Move encoding: from | to << 7 | promotionType << 14 | flag << 17.
const F_QUIET = 0, F_CAPTURE = 1, F_DOUBLE = 2, F_EP = 3, F_CASTLE_K = 4, F_CASTLE_Q = 5;
const encode = (from, to, promo, flag) => from | (to << 7) | (promo << 14) | (flag << 17);
const mFrom = move => move & 127, mTo = move => (move >> 7) & 127;
const mPromo = move => (move >> 14) & 7, mFlag = move => (move >> 17) & 7;
const squareName = sq => String.fromCharCode(97 + (sq & 7)) + (8 - (sq >> 4));
const parseSquare = name => (8 - Number(name[1])) * 16 + (name.charCodeAt(0) - 97);
export const moveToUci = move => squareName(mFrom(move)) + squareName(mTo(move)) + PROMO_CHAR[mPromo(move)];

// Deterministic Zobrist keys from a fixed xorshift seed (two 32-bit halves).
let seed = 0x9e3779b9 | 0;
const random32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const Z_PIECE_LO = new Int32Array(16 * 128), Z_PIECE_HI = new Int32Array(16 * 128);
for (let i = 0; i < Z_PIECE_LO.length; i++) { Z_PIECE_LO[i] = random32(); Z_PIECE_HI[i] = random32(); }
const Z_SIDE_LO = random32(), Z_SIDE_HI = random32();
const Z_CASTLE_LO = new Int32Array(16), Z_CASTLE_HI = new Int32Array(16);
for (let i = 0; i < 16; i++) { Z_CASTLE_LO[i] = random32(); Z_CASTLE_HI[i] = random32(); }
const Z_EP_LO = new Int32Array(8), Z_EP_HI = new Int32Array(8);
for (let i = 0; i < 8; i++) { Z_EP_LO[i] = random32(); Z_EP_HI[i] = random32(); }

// Castling rights: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side.
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[116] = 12; CASTLE_MASK[119] = 14; CASTLE_MASK[112] = 13;
CASTLE_MASK[4] = 3; CASTLE_MASK[7] = 11; CASTLE_MASK[0] = 7;

// ---------------------------------------------------------------------------
// Evaluation: a weight vector over integer features (see gato-eval-params.js).
// MG_VALUE gates the endgame mop-up term only; it is not a tuned weight.
const MG_VALUE = [0, 100, 320, 335, 500, 950, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const PIECE_PHASE = new Int8Array(16), PIECE_MATERIAL = new Int16Array(16);
for (let type = PAWN; type <= KING; type++) { PIECE_PHASE[type] = PIECE_PHASE[type | 8] = PHASE[type]; PIECE_MATERIAL[type] = MG_VALUE[type]; PIECE_MATERIAL[type | 8] = -MG_VALUE[type]; }
const ATTACK_WEIGHT = [0, 0, 2, 2, 3, 5, 0];
const MOBILITY_PARAM = [0, 0, PARAMS.mobilityKnight, PARAMS.mobilityBishop, PARAMS.mobilityRook, PARAMS.mobilityQueen, 0];
const P_DOUBLED = PARAMS.doubled, P_ISOLATED = PARAMS.isolated, P_SUPPORTED = PARAMS.supported, P_PHALANX = PARAMS.phalanx;
const P_PASSED = PARAMS.passed, P_PASSED_ENEMY_KING = PARAMS.passedEnemyKing, P_PASSED_OWN_KING = PARAMS.passedOwnKing, P_PASSED_BLOCKED = PARAMS.passedBlocked;
const P_ROOK_OPEN = PARAMS.rookOpen, P_ROOK_SEMI = PARAMS.rookSemiOpen;
const P_SHIELD_ONE = PARAMS.shieldOne, P_SHIELD_TWO = PARAMS.shieldTwo, P_SHIELD_MISSING = PARAMS.shieldMissing, P_SHIELD_FILE = PARAMS.shieldFile;
const P_BISHOP_PAIR = PARAMS.bishopPair, P_KING_DANGER = PARAMS.kingDanger, P_TEMPO = PARAMS.tempo;
const P_THREAT_PAWN = PARAMS.threatByPawn, P_THREAT_MINOR = PARAMS.threatByMinor, P_THREAT_ROOK = PARAMS.threatByRook;
const kingDistance = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));

// Late-move reduction table.
const LMR = [];
for (let d = 0; d < 64; d++) { LMR[d] = new Int8Array(64); for (let m = 0; m < 64; m++) LMR[d][m] = d && m ? Math.floor(0.75 + Math.log(d) * Math.log(m) / 2.25) : 0; }

export { PARAM_COUNT };
// ALIGNED[from - king + 119] is 1 when a square shares a rank, file or
// diagonal with the king; only such a piece can be pinned.
const ALIGNED = new Uint8Array(239);
for (const d of QUEEN_OFFSETS) for (let k = 1; k < 8; k++) ALIGNED[d * k + 119] = 1;
const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

function createSearcher(weights = GATO3_WEIGHTS) {
  if (weights.mg.length !== PARAM_COUNT || weights.eg.length !== PARAM_COUNT) throw new Error('Evaluation weights do not match the parameter layout');
  const WM = Int32Array.from(weights.mg), WE = Int32Array.from(weights.eg);
  // Signed (white-positive) piece-square values per piece code and square.
  const PSQ_MG = new Int32Array(16 * 128), PSQ_EG = new Int32Array(16 * 128);
  for (let color = 0; color < 2; color++) for (let type = PAWN; type <= KING; type++) for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const index = pstIndex(type, color ? sq >> 4 : 7 - (sq >> 4), sq & 7), sign = color ? -1 : 1, code = type | (color << 3);
    PSQ_MG[code * 128 + sq] = sign * WM[index]; PSQ_EG[code * 128 + sq] = sign * WE[index];
  }
  const board = new Int8Array(128);
  const kings = new Int16Array(2);
  const counts = new Int8Array(16); // pieces by code
  let psqMg = 0, psqEg = 0, phaseSum = 0, materialSum = 0; // incremental, white perspective
  const EVAL_SIZE = 1 << 16, EVAL_MASK = EVAL_SIZE - 1;
  const evLo = new Int32Array(EVAL_SIZE), evHi = new Int32Array(EVAL_SIZE), evScore = new Int16Array(EVAL_SIZE), evGen = new Int32Array(EVAL_SIZE);
  let side = 0, castle = 0, ep = -1, halfMoves = 0, hashLo = 0, hashHi = 0;

  // Undo stack (one entry per applied move along the search path).
  const STACK = 1024;
  const uMove = new Int32Array(STACK), uCaptured = new Int8Array(STACK), uCastle = new Int8Array(STACK);
  const uEp = new Int16Array(STACK), uHalf = new Int16Array(STACK), uLo = new Int32Array(STACK), uHi = new Int32Array(STACK);
  const uMg = new Int32Array(STACK), uEg = new Int32Array(STACK), uPhase = new Int32Array(STACK), uMat = new Int32Array(STACK);
  let sp = 0;
  // Position keys from the reversible game history and the current search path.
  const keyLo = new Int32Array(STACK + 512), keyHi = new Int32Array(STACK + 512);
  let keyCount = 0;

  const moveBuf = new Int32Array(MAX_PLY * 256 + 512), scoreBuf = new Int32Array(MAX_PLY * 256 + 512);
  const killers = new Int32Array(MAX_PLY * 2), history = new Int32Array(16 * 128);
  const counter = new Int32Array(16 * 128);
  const ttLo = new Int32Array(TT_SIZE), ttHi = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE);
  const ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE), ttGen = new Int32Array(TT_SIZE);
  let generation = 0;
  const pvTable = new Int32Array(MAX_PLY * MAX_PLY), pvLength = new Int32Array(MAX_PLY + 1);
  const evalStack = new Int32Array(MAX_PLY + 2), lastMove = new Int32Array(MAX_PLY + 2);

  // Limits, set per search.
  let nodes = 0, qNodes = 0, maxNodes = 0, deadline = 0, signal = null, selDepth = 0;

  // ---- board -------------------------------------------------------------
  function epKeyActive() {
    if (ep < 0) return false;
    const pawn = side === 0 ? PAWN : PAWN | 8, from = ep + (side === 0 ? 16 : -16);
    return (!((from - 1) & 0x88) && board[from - 1] === pawn) || (!((from + 1) & 0x88) && board[from + 1] === pawn);
  }
  function computeHash() {
    let lo = 0, hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (p) { lo ^= Z_PIECE_LO[p * 128 + sq]; hi ^= Z_PIECE_HI[p * 128 + sq]; }
    }
    if (side) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    lo ^= Z_CASTLE_LO[castle]; hi ^= Z_CASTLE_HI[castle];
    // The en-passant file is keyed only while a capture is actually possible.
    if (epKeyActive()) { lo ^= Z_EP_LO[ep & 7]; hi ^= Z_EP_HI[ep & 7]; }
    hashLo = lo; hashHi = hi;
  }

  function loadFen(fen) {
    const [placement, turn, rights, epText, half] = fen.trim().split(/\s+/);
    board.fill(0); kings[0] = kings[1] = -1;
    let sq = 0;
    for (const ch of placement) {
      if (ch === '/') { sq += 8; continue; }
      if (ch >= '1' && ch <= '8') { sq += Number(ch); continue; }
      const lower = ch.toLowerCase(), color = ch === lower ? 1 : 0, type = TYPE_OF[lower];
      board[sq] = type | (color << 3);
      if (type === KING) kings[color] = sq;
      sq++;
    }
    side = turn === 'b' ? 1 : 0;
    castle = 0;
    if (rights && rights !== '-') for (const ch of rights) castle |= ch === 'K' ? 1 : ch === 'Q' ? 2 : ch === 'k' ? 4 : ch === 'q' ? 8 : 0;
    // Keep only rights whose king and rook are still in place.
    if (board[116] !== KING || board[119] !== ROOK) castle &= ~1;
    if (board[116] !== KING || board[112] !== ROOK) castle &= ~2;
    if (board[4] !== (KING | 8) || board[7] !== (ROOK | 8)) castle &= ~4;
    if (board[4] !== (KING | 8) || board[0] !== (ROOK | 8)) castle &= ~8;
    ep = epText && epText !== '-' ? parseSquare(epText) : -1;
    halfMoves = Number(half) || 0;
    computeHash();
    counts.fill(0); psqMg = psqEg = phaseSum = materialSum = 0;
    for (let s2 = 0; s2 < 128; s2++) if (!(s2 & 0x88) && board[s2]) {
      const p = board[s2];
      counts[p]++; psqMg += PSQ_MG[p * 128 + s2]; psqEg += PSQ_EG[p * 128 + s2]; phaseSum += PIECE_PHASE[p]; materialSum += PIECE_MATERIAL[p];
    }
    sp = 0;
  }

  function isAttacked(sq, by) {
    // Pawns: a white pawn attacks from the row below (higher index).
    if (by === 0) {
      if (!((sq + 15) & 0x88) && board[sq + 15] === PAWN) return true;
      if (!((sq + 17) & 0x88) && board[sq + 17] === PAWN) return true;
    } else {
      if (!((sq - 15) & 0x88) && board[sq - 15] === (PAWN | 8)) return true;
      if (!((sq - 17) & 0x88) && board[sq - 17] === (PAWN | 8)) return true;
    }
    const c = by << 3, knight = KNIGHT | c, king = KING | c, bishop = BISHOP | c, rook = ROOK | c, queen = QUEEN | c;
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_OFFSETS[i];
      if (!(t & 0x88) && board[t] === knight) return true;
    }
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_OFFSETS[i];
      if (!(t & 0x88) && board[t] === king) return true;
    }
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_OFFSETS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = board[t];
        if (p) { if (p === bishop || p === queen) return true; break; }
        t += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_OFFSETS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = board[t];
        if (p) { if (p === rook || p === queen) return true; break; }
        t += d;
      }
    }
    return false;
  }
  const inCheckNow = () => isAttacked(kings[side], side ^ 1);

  // Applies a pseudo-legal move. Returns false (already undone) if it leaves
  // the mover's king in check.
  // `notInCheck` (optional) lets non-king moves off the king's lines skip the legality probe.
  function make(move, notInCheck = false) {
    const from = mFrom(move), to = mTo(move), flag = mFlag(move), promo = mPromo(move);
    const piece = board[from], us = side, them = us ^ 1;
    uMove[sp] = move; uCastle[sp] = castle; uEp[sp] = ep; uHalf[sp] = halfMoves; uLo[sp] = hashLo; uHi[sp] = hashHi;
    uMg[sp] = psqMg; uEg[sp] = psqEg; uPhase[sp] = phaseSum; uMat[sp] = materialSum;
    let captured = 0, lo = hashLo, hi = hashHi;
    if (epKeyActive()) { lo ^= Z_EP_LO[ep & 7]; hi ^= Z_EP_HI[ep & 7]; }
    if (flag === F_EP) {
      const capSq = to + (us === 0 ? 16 : -16);
      captured = board[capSq]; board[capSq] = 0;
      lo ^= Z_PIECE_LO[captured * 128 + capSq]; hi ^= Z_PIECE_HI[captured * 128 + capSq];
    } else if (board[to]) {
      captured = board[to];
      lo ^= Z_PIECE_LO[captured * 128 + to]; hi ^= Z_PIECE_HI[captured * 128 + to];
    }
    uCaptured[sp] = captured;
    if (captured) {
      counts[captured]--;
      const capSq = flag === F_EP ? to + (us === 0 ? 16 : -16) : to;
      psqMg -= PSQ_MG[captured * 128 + capSq]; psqEg -= PSQ_EG[captured * 128 + capSq];
      phaseSum -= PIECE_PHASE[captured]; materialSum -= PIECE_MATERIAL[captured];
    }
    if (promo) { counts[piece]--; counts[promo | (us << 3)]++; phaseSum += PHASE[promo]; materialSum += PIECE_MATERIAL[promo | (us << 3)] - PIECE_MATERIAL[piece]; }
    board[from] = 0;
    lo ^= Z_PIECE_LO[piece * 128 + from]; hi ^= Z_PIECE_HI[piece * 128 + from];
    const placed = promo ? promo | (us << 3) : piece;
    board[to] = placed;
    psqMg += PSQ_MG[placed * 128 + to] - PSQ_MG[piece * 128 + from]; psqEg += PSQ_EG[placed * 128 + to] - PSQ_EG[piece * 128 + from];
    lo ^= Z_PIECE_LO[placed * 128 + to]; hi ^= Z_PIECE_HI[placed * 128 + to];
    if ((piece & 7) === KING) {
      kings[us] = to;
      if (flag === F_CASTLE_K || flag === F_CASTLE_Q) {
        const rookFrom = flag === F_CASTLE_K ? to + 1 : to - 2, rookTo = flag === F_CASTLE_K ? to - 1 : to + 1, rook = ROOK | (us << 3);
        board[rookFrom] = 0; board[rookTo] = rook;
        psqMg += PSQ_MG[rook * 128 + rookTo] - PSQ_MG[rook * 128 + rookFrom]; psqEg += PSQ_EG[rook * 128 + rookTo] - PSQ_EG[rook * 128 + rookFrom];
        lo ^= Z_PIECE_LO[rook * 128 + rookFrom] ^ Z_PIECE_LO[rook * 128 + rookTo];
        hi ^= Z_PIECE_HI[rook * 128 + rookFrom] ^ Z_PIECE_HI[rook * 128 + rookTo];
      }
    }
    const newCastle = castle & CASTLE_MASK[from] & CASTLE_MASK[to];
    if (newCastle !== castle) { lo ^= Z_CASTLE_LO[castle] ^ Z_CASTLE_LO[newCastle]; hi ^= Z_CASTLE_HI[castle] ^ Z_CASTLE_HI[newCastle]; castle = newCastle; }
    ep = flag === F_DOUBLE ? (from + to) >> 1 : -1;
    halfMoves = (piece & 7) === PAWN || captured ? 0 : halfMoves + 1;
    side = them; lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    if (ep >= 0 && epKeyActive()) { lo ^= Z_EP_LO[ep & 7]; hi ^= Z_EP_HI[ep & 7]; }
    hashLo = lo; hashHi = hi;
    sp++;
    if ((!notInCheck || (piece & 7) === KING || flag === F_EP || ALIGNED[from - kings[us] + 119]) && isAttacked(kings[us], them)) { unmake(); return false; }
    keyLo[keyCount] = hashLo; keyHi[keyCount] = hashHi; keyCount++;
    return true;
  }
  function unmake(fromSearch = false) {
    sp--;
    if (fromSearch) keyCount--;
    const move = uMove[sp], from = mFrom(move), to = mTo(move), flag = mFlag(move), promo = mPromo(move);
    side ^= 1;
    const us = side, placed = board[to], piece = promo ? PAWN | (us << 3) : placed;
    board[from] = piece; board[to] = 0;
    const captured = uCaptured[sp];
    if (flag === F_EP) board[to + (us === 0 ? 16 : -16)] = captured;
    else board[to] = captured;
    if (captured) counts[captured]++;
    if (promo) { counts[piece]++; counts[placed]--; }
    if ((piece & 7) === KING) {
      kings[us] = from;
      if (flag === F_CASTLE_K || flag === F_CASTLE_Q) {
        const rookFrom = flag === F_CASTLE_K ? to + 1 : to - 2, rookTo = flag === F_CASTLE_K ? to - 1 : to + 1;
        board[rookFrom] = board[rookTo]; board[rookTo] = 0;
      }
    }
    castle = uCastle[sp]; ep = uEp[sp]; halfMoves = uHalf[sp]; hashLo = uLo[sp]; hashHi = uHi[sp];
    psqMg = uMg[sp]; psqEg = uEg[sp]; phaseSum = uPhase[sp]; materialSum = uMat[sp];
  }
  const undo = () => unmake(true);

  function makeNull() {
    uMove[sp] = 0; uCastle[sp] = castle; uEp[sp] = ep; uHalf[sp] = halfMoves; uLo[sp] = hashLo; uHi[sp] = hashHi; uCaptured[sp] = 0;
    sp++;
    if (epKeyActive()) { hashLo ^= Z_EP_LO[ep & 7]; hashHi ^= Z_EP_HI[ep & 7]; }
    // A null move is a repetition barrier: no earlier position can recur across it.
    ep = -1; halfMoves = 0; side ^= 1; hashLo ^= Z_SIDE_LO; hashHi ^= Z_SIDE_HI;
    keyLo[keyCount] = hashLo; keyHi[keyCount] = hashHi; keyCount++;
  }
  function unmakeNull() {
    sp--; keyCount--;
    side ^= 1; castle = uCastle[sp]; ep = uEp[sp]; halfMoves = uHalf[sp]; hashLo = uLo[sp]; hashHi = uHi[sp];
  }

  // ---- move generation (pseudo-legal) -------------------------------------
  function generate(start, capturesOnly) {
    let n = start;
    const us = side, them = us ^ 1;
    const forward = us === 0 ? -16 : 16, startRow = us === 0 ? 6 : 1, promoRow = us === 0 ? 0 : 7;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (!p || (p >> 3) !== us) continue;
      const type = p & 7;
      if (type === PAWN) {
        const one = sq + forward;
        if (!(one & 0x88) && !board[one]) {
          if ((one >> 4) === promoRow) {
            moveBuf[n++] = encode(sq, one, QUEEN, F_QUIET);
            if (!capturesOnly) { moveBuf[n++] = encode(sq, one, KNIGHT, F_QUIET); moveBuf[n++] = encode(sq, one, ROOK, F_QUIET); moveBuf[n++] = encode(sq, one, BISHOP, F_QUIET); }
          } else if (!capturesOnly) {
            moveBuf[n++] = encode(sq, one, 0, F_QUIET);
            const two = one + forward;
            if ((sq >> 4) === startRow && !board[two]) moveBuf[n++] = encode(sq, two, 0, F_DOUBLE);
          }
        }
        for (let side2 = -1; side2 <= 1; side2 += 2) {
          const to = one + side2;
          if (to & 0x88) continue;
          const target = board[to];
          if (target && (target >> 3) === them) {
            if ((to >> 4) === promoRow) {
              moveBuf[n++] = encode(sq, to, QUEEN, F_CAPTURE);
              if (!capturesOnly) { moveBuf[n++] = encode(sq, to, KNIGHT, F_CAPTURE); moveBuf[n++] = encode(sq, to, ROOK, F_CAPTURE); moveBuf[n++] = encode(sq, to, BISHOP, F_CAPTURE); }
            } else moveBuf[n++] = encode(sq, to, 0, F_CAPTURE);
          } else if (to === ep && !target) moveBuf[n++] = encode(sq, to, 0, F_EP);
        }
        continue;
      }
      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (let i = 0; i < 8; i++) {
          const to = sq + offsets[i];
          if (to & 0x88) continue;
          const target = board[to];
          if (!target) { if (!capturesOnly) moveBuf[n++] = encode(sq, to, 0, F_QUIET); }
          else if ((target >> 3) === them) moveBuf[n++] = encode(sq, to, 0, F_CAPTURE);
        }
        if (type === KING && !capturesOnly) {
          if (us === 0 && sq === 116) {
            if ((castle & 1) && !board[117] && !board[118] && board[119] === ROOK && !isAttacked(116, 1) && !isAttacked(117, 1) && !isAttacked(118, 1)) moveBuf[n++] = encode(116, 118, 0, F_CASTLE_K);
            if ((castle & 2) && !board[115] && !board[114] && !board[113] && board[112] === ROOK && !isAttacked(116, 1) && !isAttacked(115, 1) && !isAttacked(114, 1)) moveBuf[n++] = encode(116, 114, 0, F_CASTLE_Q);
          } else if (us === 1 && sq === 4) {
            if ((castle & 4) && !board[5] && !board[6] && board[7] === (ROOK | 8) && !isAttacked(4, 0) && !isAttacked(5, 0) && !isAttacked(6, 0)) moveBuf[n++] = encode(4, 6, 0, F_CASTLE_K);
            if ((castle & 8) && !board[3] && !board[2] && !board[1] && board[0] === (ROOK | 8) && !isAttacked(4, 0) && !isAttacked(3, 0) && !isAttacked(2, 0)) moveBuf[n++] = encode(4, 2, 0, F_CASTLE_Q);
          }
        }
        continue;
      }
      const offsets = type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : QUEEN_OFFSETS;
      for (let i = 0; i < offsets.length; i++) {
        const d = offsets[i];
        let to = sq + d;
        while (!(to & 0x88)) {
          const target = board[to];
          if (!target) { if (!capturesOnly) moveBuf[n++] = encode(sq, to, 0, F_QUIET); }
          else { if ((target >> 3) === them) moveBuf[n++] = encode(sq, to, 0, F_CAPTURE); break; }
          to += d;
        }
      }
    }
    return n;
  }

  function hasLegalMove(start) {
    const end = generate(start, false);
    for (let i = start; i < end; i++) if (make(moveBuf[i])) { undo(); return true; }
    return false;
  }

  // ---- evaluation ------------------------------------------------------------
  // Each term adds weight * count. With `trace` set, counts are recorded per
  // parameter instead (white-positive), which is what the offline tuner fits.
  const pawnFiles = [new Int8Array(8), new Int8Array(8)], pawnRows = [new Uint8Array(8), new Uint8Array(8)];
  const zone = [new Int32Array(128), new Int32Array(128)];
  let zoneStamp = 0, accMg = 0, accEg = 0, trace = null;
  const attackUnits = new Int32Array(2), attackerCount = new Int32Array(2);
  function add(index, count) {
    if (trace) trace[index] += count;
    else { accMg += WM[index] * count; accEg += WE[index] * count; }
  }
  function pawnDefends(sq, color) {
    // Same as pawnAttacks(board, square, color) in Gato 1's evaluation.
    const a = sq + (color === 0 ? 15 : -17), b = sq + (color === 0 ? 17 : -15), pawn = PAWN | (color << 3);
    return (a >= 0 && a < 128 && board[a] === pawn) || (b >= 0 && b < 128 && board[b] === pawn);
  }
  function evaluate() {
    const slot = hashLo & EVAL_MASK;
    if (evGen[slot] === generation && evLo[slot] === hashLo && evHi[slot] === hashHi) return evScore[slot];
    const score = evaluateFull();
    evGen[slot] = generation; evLo[slot] = hashLo; evHi[slot] = hashHi; evScore[slot] = score;
    return score;
  }
  /** White-positive [mg, eg] before tapering; mop-up is returned separately (untuned). */
  let mopUp = 0;
  function evaluateTerms() {
    pawnFiles[0].fill(0); pawnFiles[1].fill(0); pawnRows[0].fill(0); pawnRows[1].fill(0);
    accMg = 0; accEg = 0;
    let bishopsW = 0, bishopsB = 0;
    const stamp = ++zoneStamp;
    attackUnits[0] = attackUnits[1] = attackerCount[0] = attackerCount[1] = 0;
    for (let color = 0; color < 2; color++) {
      const k = kings[color];
      if (k < 0) continue;
      zone[color][k] = stamp;
      for (let i = 0; i < 8; i++) { const t = k + KING_OFFSETS[i]; if (!(t & 0x88)) zone[color][t] = stamp; }
    }
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (!p) continue;
      const color = p >> 3, type = p & 7, sign = color ? -1 : 1, enemy = color ^ 1;
      if (trace) trace[pstIndex(type, color ? sq >> 4 : 7 - (sq >> 4), sq & 7)] += sign;
      if (type === PAWN) {
        pawnFiles[color][sq & 7]++; pawnRows[color][sq & 7] |= 1 << (sq >> 4);
        // A pawn attacking any enemy piece other than a pawn.
        const a = sq + (color === 0 ? -17 : 15), b = sq + (color === 0 ? -15 : 17);
        if (!(a & 0x88) && board[a] && (board[a] >> 3) === enemy && (board[a] & 7) > PAWN && (board[a] & 7) < KING) add(P_THREAT_PAWN, sign);
        if (!(b & 0x88) && board[b] && (board[b] >> 3) === enemy && (board[b] & 7) > PAWN && (board[b] & 7) < KING) add(P_THREAT_PAWN, sign);
        continue;
      }
      if (type === BISHOP) { if (color) bishopsB++; else bishopsW++; }
      if (type === KING) continue;
      const offsets = type === KNIGHT ? KNIGHT_OFFSETS : type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : QUEEN_OFFSETS;
      const enemyZone = zone[enemy];
      let count = 0, hits = 0;
      for (let i = 0; i < offsets.length; i++) {
        let to = sq + offsets[i];
        while (!(to & 0x88)) {
          if (enemyZone[to] === stamp) hits++;
          const target = board[to];
          if (target && (target >> 3) === color) break;
          if (type !== KNIGHT || !pawnDefends(to, enemy)) count++;
          if (target) {
            const victim = target & 7;
            if ((type === KNIGHT || type === BISHOP) && (victim === ROOK || victim === QUEEN)) add(P_THREAT_MINOR, sign);
            else if (type === ROOK && victim === QUEEN) add(P_THREAT_ROOK, sign);
          }
          if (target || type === KNIGHT) break;
          to += offsets[i];
        }
      }
      add(MOBILITY_PARAM[type] + count, sign);
      if (hits) { attackerCount[color]++; attackUnits[color] += hits * ATTACK_WEIGHT[type]; }
    }
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (!p) continue;
      const color = p >> 3, type = p & 7;
      if (type !== PAWN && type !== ROOK && type !== KING) continue;
      const other = color ^ 1, sign = color ? -1 : 1, file = sq & 7, row = sq >> 4;
      const own = pawnFiles[color], enemy = pawnFiles[other];
      if (type === PAWN) {
        if (own[file] > 1) add(P_DOUBLED, sign);
        if (!((file > 0 && own[file - 1]) || (file < 7 && own[file + 1]))) add(P_ISOLATED, sign);
        if ((file > 0 && board[sq - 1] === p) || (file < 7 && board[sq + 1] === p)) add(P_PHALANX, sign);
        const enemyRows = pawnRows[other][file] | (file > 0 ? pawnRows[other][file - 1] : 0) | (file < 7 ? pawnRows[other][file + 1] : 0);
        const ahead = color === 0 ? (1 << row) - 1 : 255 ^ ((1 << (row + 1)) - 1);
        const rank = color === 0 ? 7 - row : row;
        if (!(enemyRows & ahead) && !(pawnRows[color][file] & ahead)) {
          add(P_PASSED + rank, sign);
          const next = sq + (color === 0 ? -16 : 16);
          if (!(next & 0x88) && board[next]) add(P_PASSED_BLOCKED, sign);
          if (rank >= 3 && kings[color] >= 0 && kings[other] >= 0) {
            add(P_PASSED_ENEMY_KING, sign * kingDistance(next, kings[other]));
            add(P_PASSED_OWN_KING, sign * kingDistance(next, kings[color]));
          }
        }
        if (pawnDefends(sq, color)) add(P_SUPPORTED, sign);
      } else if (type === ROOK) {
        if (!own[file]) add(enemy[file] ? P_ROOK_SEMI : P_ROOK_OPEN, sign);
      } else {
        const forward = color === 0 ? -16 : 16, pawn = PAWN | (color << 3);
        for (let delta = -1; delta <= 1; delta++) {
          const one = sq + forward + delta, two = sq + 2 * forward + delta;
          if (one & 0x88) continue;
          if (board[one] === pawn) add(P_SHIELD_ONE, sign);
          else if (!(two & 0x88) && board[two] === pawn) add(P_SHIELD_TWO, sign);
          else add(P_SHIELD_MISSING, sign);
          if (!own[file + delta]) add(P_SHIELD_FILE, sign);
        }
      }
    }
    if (bishopsW >= 2) add(P_BISHOP_PAIR, 1);
    if (bishopsB >= 2) add(P_BISHOP_PAIR, -1);
    for (let color = 0; color < 2; color++) {
      if (attackerCount[color] < 2 || !counts[QUEEN | (color << 3)]) continue;
      add(P_KING_DANGER + Math.min(11, Math.floor(attackUnits[color] / 3)), color ? -1 : 1);
    }
    add(P_TEMPO, side === 0 ? 1 : -1);
    mopUp = 0;
    const material = materialSum;
    if (Math.abs(material) >= 450 && phaseSum <= 8 && kings[0] >= 0 && kings[1] >= 0) {
      const sign = material > 0 ? 1 : -1, weak = kings[sign === 1 ? 1 : 0];
      const edgeDistance = Math.min(weak & 7, 7 - (weak & 7), weak >> 4, 7 - (weak >> 4));
      mopUp = sign * (14 * (7 - kingDistance(kings[0], kings[1])) - 12 * edgeDistance);
    }
  }
  function evaluateFull() {
    evaluateTerms();
    const mg = psqMg + accMg, eg = psqEg + accEg + mopUp;
    const ph = Math.min(24, phaseSum);
    const tapered = (mg * ph + eg * (24 - ph)) / 24;
    const white = Math.sign(tapered) * Math.floor(Math.abs(tapered) + 0.5);
    return white === 0 ? 0 : side === 0 ? white : -white;
  }
  /** Feature counts for the tuner: { features, phase, mopUp, side }. */
  function traceFeatures() {
    const features = new Int32Array(PARAM_COUNT);
    trace = features;
    try { evaluateTerms(); } finally { trace = null; }
    return { features, phase: Math.min(24, phaseSum), mopUp, side };
  }

  // ---- draws ---------------------------------------------------------------
  function insufficientMaterial() {
    if (counts[PAWN] || counts[PAWN | 8] || counts[ROOK] || counts[ROOK | 8] || counts[QUEEN] || counts[QUEEN | 8]) return false;
    let minors = 0, bishopColors = 0, bishops = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const type = board[sq] & 7;
      if (!type || type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      minors++;
      if (type === BISHOP) { bishops++; bishopColors |= 1 << (((sq >> 4) + (sq & 7)) & 1); }
    }
    if (minors <= 1) return true;
    // Any number of bishops, all on one square color, cannot mate (chess.js rule).
    return bishops === minors && bishopColors !== 3;
  }
  // A position repeated anywhere since the last irreversible move scores as a draw.
  function repeated() {
    const lo = keyLo[keyCount - 1], hi = keyHi[keyCount - 1];
    const limit = Math.max(0, keyCount - 1 - halfMoves);
    for (let i = keyCount - 3; i >= limit; i -= 2) if (keyLo[i] === lo && keyHi[i] === hi) return true;
    return false;
  }

  // ---- static exchange evaluation -----------------------------------------
  function leastAttacker(sq, by, occ) {
    // Returns the square of the least valuable attacker of `by` on sq, using the
    // occupancy overlay `occ` (1 = removed). -1 if none.
    const c = by << 3;
    const pawnA = by === 0 ? sq + 15 : sq - 17, pawnB = by === 0 ? sq + 17 : sq - 15;
    if (!(pawnA & 0x88) && !occ[pawnA] && board[pawnA] === (PAWN | c)) return pawnA;
    if (!(pawnB & 0x88) && !occ[pawnB] && board[pawnB] === (PAWN | c)) return pawnB;
    for (let i = 0; i < 8; i++) { const t = sq + KNIGHT_OFFSETS[i]; if (!(t & 0x88) && !occ[t] && board[t] === (KNIGHT | c)) return t; }
    let bestSq = -1, bestType = 99;
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_OFFSETS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = occ[t] ? 0 : board[t];
        if (p) { if ((p >> 3) === by && ((p & 7) === BISHOP || (p & 7) === QUEEN) && (p & 7) < bestType) { bestType = p & 7; bestSq = t; } break; }
        t += d;
      }
    }
    if (bestType === BISHOP) return bestSq;
    for (let i = 0; i < 4; i++) {
      const d = ROOK_OFFSETS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = occ[t] ? 0 : board[t];
        if (p) { if ((p >> 3) === by && ((p & 7) === ROOK || (p & 7) === QUEEN) && (p & 7) < bestType) { bestType = p & 7; bestSq = t; } break; }
        t += d;
      }
    }
    if (bestSq >= 0) return bestSq;
    for (let i = 0; i < 8; i++) { const t = sq + KING_OFFSETS[i]; if (!(t & 0x88) && !occ[t] && board[t] === (KING | c)) return t; }
    return -1;
  }
  const seeOcc = new Uint8Array(128), seeGain = new Int32Array(40);
  // Material outcome of the capture sequence started by `move`, side-to-move view.
  function see(move) {
    const from = mFrom(move), to = mTo(move), flag = mFlag(move);
    seeOcc.fill(0);
    let target = flag === F_EP ? PAWN : board[to] & 7;
    let attackerType = board[from] & 7;
    if (mPromo(move)) attackerType = mPromo(move);
    seeGain[0] = SEE_VALUE[target] + (mPromo(move) ? SEE_VALUE[mPromo(move)] - SEE_VALUE[PAWN] : 0);
    seeOcc[from] = 1;
    if (flag === F_EP) seeOcc[to + (side === 0 ? 16 : -16)] = 1;
    let by = side ^ 1, depth = 0;
    while (depth < 38) {
      const sq = leastAttacker(to, by, seeOcc);
      if (sq < 0) break;
      depth++;
      seeGain[depth] = SEE_VALUE[attackerType] - seeGain[depth - 1];
      if (attackerType === KING) { depth--; break; } // a king cannot be captured; previous capture stands
      attackerType = board[sq] & 7;
      seeOcc[sq] = 1;
      by ^= 1;
    }
    while (depth > 0) { seeGain[depth - 1] = -Math.max(-seeGain[depth - 1], seeGain[depth]); depth--; }
    return seeGain[0];
  }

  // ---- search ---------------------------------------------------------------
  function visit(quiet) {
    if (nodes >= maxNodes) throw STOP;
    nodes++;
    if (quiet) qNodes++;
    if ((nodes & 1023) === 0) {
      if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
      if (performance.now() >= deadline) throw STOP;
    }
  }
  const ttIndex = () => hashLo & TT_MASK;
  function ttStoreScore(score, ply) { return score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score; }
  function ttReadScore(score, ply) { return score > MATE_BOUND ? score - ply : score < -MATE_BOUND ? score + ply : score; }
  function ttStore(depth, flag, score, move, ply) {
    const i = ttIndex();
    if (ttGen[i] === generation && ttDepth[i] > depth && ttLo[i] !== hashLo) return; // keep deeper data of this search
    ttLo[i] = hashLo; ttHi[i] = hashHi; ttGen[i] = generation; ttDepth[i] = depth; ttFlag[i] = flag;
    ttScore[i] = ttStoreScore(score, ply); ttMove[i] = move;
  }

  function scoreMoves(start, end, ply, hashMove, rootPriors) {
    const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
    const prev = ply > 0 ? lastMove[ply - 1] : 0;
    const counterMove = prev ? counter[(board[mTo(prev)] & 15) * 128 + mTo(prev)] : 0;
    for (let i = start; i < end; i++) {
      const move = moveBuf[i];
      let s;
      if (move === hashMove) s = 1 << 30;
      else {
        const flag = mFlag(move), promo = mPromo(move);
        if (flag === F_CAPTURE || flag === F_EP) {
          const victim = flag === F_EP ? PAWN : board[mTo(move)] & 7, attacker = board[mFrom(move)] & 7;
          s = 1e8 + victim * 64 - attacker + (promo === QUEEN ? 5e6 : 0);
          // Losing captures go behind the quiet killers.
          if (SEE_VALUE[victim] < SEE_VALUE[attacker] && see(move) < 0) s = -2e6 + victim * 64 - attacker;
        } else if (promo) s = promo === QUEEN ? 9e7 : 1000 + promo;
        else if (move === k1) s = 8e6;
        else if (move === k2) s = 7e6;
        else if (move === counterMove) s = 6e6;
        else s = history[(board[mFrom(move)] & 15) * 128 + mTo(move)];
      }
      if (rootPriors) s += Math.round((rootPriors.get(moveToUci(move)) || 0) * 40000);
      scoreBuf[i] = s;
    }
  }
  function pickNext(i, end) {
    let best = i, bestScore = scoreBuf[i];
    for (let j = i + 1; j < end; j++) if (scoreBuf[j] > bestScore) { bestScore = scoreBuf[j]; best = j; }
    if (best !== i) {
      const m = moveBuf[i]; moveBuf[i] = moveBuf[best]; moveBuf[best] = m;
      const s = scoreBuf[i]; scoreBuf[i] = scoreBuf[best]; scoreBuf[best] = s;
    }
    return moveBuf[i];
  }

  function nonPawnMaterial(color) {
    const c = color << 3;
    return counts[KNIGHT | c] + counts[BISHOP | c] + counts[ROOK | c] + counts[QUEEN | c] > 0;
  }

  function quiescence(alpha, beta, ply, start) {
    visit(true);
    pvLength[ply] = ply;
    if (ply > selDepth) selDepth = ply;
    if (ply >= MAX_PLY - 1) return evaluate();
    const inCheck = inCheckNow();
    if (halfMoves >= 100 || repeated() || insufficientMaterial()) {
      if (!inCheck || hasLegalMove(start)) return 0;
      return -MATE + ply;
    }
    let best = -INF, stand = 0;
    if (!inCheck) {
      stand = evaluate();
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
    }
    const end = generate(start, !inCheck);
    scoreMoves(start, end, ply, 0, null);
    let legal = 0;
    for (let i = start; i < end; i++) {
      const move = pickNext(i, end);
      if (!inCheck) {
        const flag = mFlag(move), promo = mPromo(move);
        const victim = flag === F_EP ? PAWN : board[mTo(move)] & 7;
        // Delta pruning: even winning this piece cannot lift the score to alpha.
        if (!promo && stand + SEE_VALUE[victim] + 200 <= alpha) continue;
        if (scoreBuf[i] < 1e8 && !promo) continue; // SEE-losing capture
      }
      if (!make(move, !inCheck)) continue;
      legal++;
      lastMove[ply] = move;
      let score;
      try { score = -quiescence(-beta, -alpha, ply + 1, end); } finally { undo(); }
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          pvTable[ply * MAX_PLY + ply] = move;
          for (let j = ply + 1; j < pvLength[ply + 1]; j++) pvTable[ply * MAX_PLY + j] = pvTable[(ply + 1) * MAX_PLY + j];
          pvLength[ply] = pvLength[ply + 1];
          if (score >= beta) return score;
        }
      }
    }
    if (inCheck && !legal) return -MATE + ply;
    // Stalemate is realistic only for a king-and-pawns side with no captures.
    if (!inCheck && !legal && !nonPawnMaterial(side) && !hasLegalMove(end)) return 0;
    return best;
  }

  function negamax(depth, alpha, beta, ply, inCheck, allowNull, start) {
    const pvNode = beta - alpha > 1;
    if (depth <= 0 && !inCheck) return quiescence(alpha, beta, ply, start);
    if (depth < 0) depth = 0;
    visit(false);
    pvLength[ply] = ply;
    if (ply > selDepth) selDepth = ply;
    if (ply >= MAX_PLY - 1) return evaluate();
    if (ply > 0) {
      if (halfMoves >= 100 || repeated() || insufficientMaterial()) {
        if (!inCheck || hasLegalMove(start)) return 0;
        return -MATE + ply;
      }
      // Mate distance pruning.
      const mateAlpha = Math.max(alpha, -MATE + ply), mateBeta = Math.min(beta, MATE - ply - 1);
      if (mateAlpha >= mateBeta) return mateAlpha;
    }
    const i = ttIndex();
    let hashMove = 0;
    if (ttGen[i] === generation && ttLo[i] === hashLo && ttHi[i] === hashHi) {
      hashMove = ttMove[i];
      if (ply > 0 && !pvNode && ttDepth[i] >= depth) {
        const score = ttReadScore(ttScore[i], ply), flag = ttFlag[i];
        if (flag === TT_EXACT || (flag === TT_LOWER && score >= beta) || (flag === TT_UPPER && score <= alpha)) return score;
      }
    }
    const staticEval = inCheck ? -INF : evaluate();
    evalStack[ply] = staticEval;
    const improving = !inCheck && ply >= 2 && staticEval > evalStack[ply - 2];
    const mateWindow = Math.abs(beta) >= MATE_BOUND || Math.abs(alpha) >= MATE_BOUND;
    if (!pvNode && !inCheck && ply > 0 && !mateWindow) {
      // Reverse futility: far above beta at shallow depth.
      if (depth <= 6 && staticEval - (85 - (improving ? 25 : 0)) * depth >= beta) return staticEval;
      // Null move: give the opponent a free move; if still >= beta, prune.
      if (allowNull && depth >= 3 && staticEval >= beta && nonPawnMaterial(side)) {
        const r = 3 + Math.floor(depth / 4) + Math.min(2, Math.floor((staticEval - beta) / 200));
        makeNull();
        lastMove[ply] = 0;
        let score;
        try { score = -negamax(depth - 1 - r, -beta, -beta + 1, ply + 1, false, false, start); } finally { unmakeNull(); }
        if (score >= beta) return score >= MATE_BOUND ? beta : score;
      }
      // Razoring: hopeless at depth 1-2, verify with quiescence.
      if (depth <= 2 && staticEval + 300 * depth < alpha) {
        const score = quiescence(alpha, alpha + 1, ply, start);
        if (score <= alpha) return score;
      }
    }
    // Internal iterative reduction without a hash move.
    if (!hashMove && depth >= 5 && !inCheck) depth--;

    const end = generate(start, false);
    scoreMoves(start, end, ply, hashMove, ply === 0 ? rootPriorMap : null);
    const originalAlpha = alpha;
    let best = -INF, bestMove = 0, legal = 0, quietsTried = 0;
    const futile = !pvNode && !inCheck && depth <= 3 && !mateWindow && staticEval + 120 + 110 * depth <= alpha;
    const quietLimit = 3 + depth * depth * (improving ? 2 : 1);
    for (let n = start; n < end; n++) {
      const move = pickNext(n, end);
      const flag = mFlag(move), promo = mPromo(move);
      const isQuiet = flag !== F_CAPTURE && flag !== F_EP && !promo;
      const moveScore = scoreBuf[n];
      // Shallow pruning of late quiet moves and clearly losing captures.
      if (ply > 0 && legal > 0 && !inCheck && !mateWindow && best > -MATE_BOUND) {
        if (isQuiet && !pvNode && depth <= 3 && quietsTried >= quietLimit) continue;
        if (!isQuiet && !pvNode && depth <= 3 && moveScore < 1e6 && see(move) < -90 * depth) continue;
      }
      if (!make(move, !inCheck)) continue;
      const givesCheck = inCheckNow();
      if (futile && isQuiet && legal > 0 && !givesCheck && best > -MATE_BOUND) { undo(); continue; }
      legal++;
      if (isQuiet) quietsTried++;
      lastMove[ply] = move;
      if (ply === 0) rootSearched.push(move);
      let score;
      try {
        const extension = givesCheck ? 1 : 0;
        let newDepth = depth - 1 + (ply < 2 * rootDepth ? extension : 0);
        if (legal === 1) score = -negamax(newDepth, -beta, -alpha, ply + 1, givesCheck, true, end);
        else {
          let reduction = 0;
          if (depth >= 3 && isQuiet && !givesCheck && !inCheck && legal > (pvNode ? 3 : 2)) {
            reduction = LMR[Math.min(63, depth)][Math.min(63, legal)];
            if (pvNode) reduction--;
            if (!improving) reduction++;
            if (moveScore >= 6e6) reduction--; // killer / counter move
            else if (moveScore > 4000) reduction--;
            else if (moveScore < -4000) reduction++;
            reduction = Math.max(0, Math.min(newDepth - 1, reduction));
          }
          score = -negamax(newDepth - reduction, -alpha - 1, -alpha, ply + 1, givesCheck, true, end);
          if (score > alpha && reduction) score = -negamax(newDepth, -alpha - 1, -alpha, ply + 1, givesCheck, true, end);
          if (score > alpha && score < beta) score = -negamax(newDepth, -beta, -alpha, ply + 1, givesCheck, true, end);
        }
      } finally { undo(); }
      if (ply === 0) rootScores.set(move, { score, alpha, beta });
      if (score > best) {
        best = score; bestMove = move;
        if (score > alpha) {
          alpha = score;
          pvTable[ply * MAX_PLY + ply] = move;
          for (let j = ply + 1; j < pvLength[ply + 1]; j++) pvTable[ply * MAX_PLY + j] = pvTable[(ply + 1) * MAX_PLY + j];
          pvLength[ply] = pvLength[ply + 1];
          if (ply === 0) rootBest = { move, score };
          if (score >= beta) {
            if (isQuiet) {
              if (killers[ply * 2] !== move) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = move; }
              const hi = (board[mFrom(move)] & 15) * 128 + mTo(move);
              history[hi] += depth * depth * 8 - Math.floor(history[hi] * depth * depth / 1024);
              const prev = ply > 0 ? lastMove[ply - 1] : 0;
              if (prev) counter[(board[mTo(prev)] & 15) * 128 + mTo(prev)] = move;
              // Penalize quiet moves searched before the cutoff.
              for (let j = start; j < n; j++) {
                const other = moveBuf[j];
                if (mFlag(other) === F_CAPTURE || mFlag(other) === F_EP || mPromo(other)) continue;
                const oi = (board[mFrom(other)] & 15) * 128 + mTo(other);
                history[oi] -= depth * depth * 8 + Math.floor(history[oi] * depth * depth / 1024);
              }
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    ttStore(depth, best >= beta ? TT_LOWER : best > originalAlpha ? TT_EXACT : TT_UPPER, best, bestMove, ply);
    return best;
  }

  let rootPriorMap = null, rootDepth = 1, rootSearched = [], rootScores = new Map(), rootBest = null;

  /** Plain alpha-beta without selectivity, used only to confirm a found mate. */
  function verifyMate(depth, alpha, beta, ply, start) {
    visit(false);
    const inCheck = inCheckNow();
    if (ply > 0 && (halfMoves >= 100 || repeated() || insufficientMaterial())) {
      if (!inCheck || hasLegalMove(start)) return 0;
      return -MATE + ply;
    }
    if (depth <= 0) return inCheck ? (hasLegalMove(start) ? 0 : -MATE + ply) : 0;
    const end = generate(start, false);
    let best = -INF, legal = 0;
    scoreMoves(start, end, ply, 0, null);
    for (let n = start; n < end; n++) {
      const move = pickNext(n, end);
      if (!make(move)) continue;
      legal++;
      let score;
      try { score = -verifyMate(depth - 1, -beta, -alpha, ply + 1, end); } finally { undo(); }
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    return best;
  }

  /** Load the position, the reversible history keys and run a bounded search. */
  let lastRootFen = null;
  async function run(setup, options) {
    loadFen(setup.fen);
    keyCount = 0;
    for (const key of setup.historyKeys || []) { keyLo[keyCount] = key[0]; keyHi[keyCount] = key[1]; keyCount++; }
    keyLo[keyCount] = hashLo; keyHi[keyCount] = hashHi; keyCount++;
    const started = performance.now();
    const budgetMs = Math.max(1, Math.min(30000, Number(options.budgetMs) || 150));
    maxNodes = Math.max(1, Math.floor(Number(options.maxNodes) || 20000));
    const maxDepth = Math.max(1, Math.min(64, Math.floor(Number(options.maxDepth) || 64)));
    deadline = started + budgetMs; signal = options.signal || null;
    nodes = 0; qNodes = 0; selDepth = 0;
    // Continuing the same game (the previous root is one or two plies back):
    // keep the transposition table and evaluation cache, and halve history.
    const continued = !!setup.continuation && lastRootFen !== null;
    if (continued) for (let i = 0; i < history.length; i++) history[i] >>= 1;
    else { generation++; history.fill(0); counter.fill(0); }
    killers.fill(0);
    lastRootFen = setup.fen;
    rootPriorMap = new Map((options.priors || []).map(move => [move.uci, Number(move.probability ?? move.prior) || 0]));
    const rootInCheck = inCheckNow();
    // Legal root moves and a deterministic fallback ordered by the neural prior.
    const end = generate(0, false);
    const legalRoot = [];
    for (let i = 0; i < end; i++) if (make(moveBuf[i])) { undo(); legalRoot.push(moveBuf[i]); }
    const terminal = !legalRoot.length || halfMoves >= 100 || repeatCount() >= 3 || insufficientMaterial();
    if (terminal) return { move: null, scoreCp: !legalRoot.length && rootInCheck ? -MATE : 0, nodes: 0, qNodes: 0, depth: 0, pv: [], completedIterations: 0, elapsedMs: performance.now() - started, stopReason: 'terminal', terminal: true, proven: false, mateInPlies: null, rootStats: [] };
    legalRoot.sort((a, b) => (rootPriorMap.get(moveToUci(b)) || 0) - (rootPriorMap.get(moveToUci(a)) || 0) || (moveToUci(a) < moveToUci(b) ? -1 : 1));
    let best = legalRoot[0], scoreCp = evaluate(), pv = [best], depth = 0, completed = 0, interrupted = false;
    let rootStats = [];
    const startSp = sp, startKeys = keyCount;
    try {
      for (let target = 1; target <= maxDepth; target++) {
        rootDepth = target; rootSearched = []; rootScores = new Map(); rootBest = null;
        let score;
        if (target >= 4 && Math.abs(scoreCp) < MATE_BOUND) {
          let delta = 30, lo = Math.max(-INF, scoreCp - delta), hi = Math.min(INF, scoreCp + delta);
          for (;;) {
            score = negamax(target, lo, hi, 0, rootInCheck, false, 0);
            if (score <= lo) { lo = Math.max(-INF, score - delta); delta *= 2; }
            else if (score >= hi) { hi = Math.min(INF, score + delta); delta *= 2; }
            else break;
            if (delta > 1000) { lo = -INF; hi = INF; }
          }
        } else score = negamax(target, -INF, INF, 0, rootInCheck, false, 0);
        if (pvLength[0] > 0) { pv = Array.from(pvTable.subarray(0, pvLength[0])); best = pv[0]; }
        scoreCp = score; depth = target; completed++;
        rootStats = [...rootScores].map(([move, info]) => ({ uci: moveToUci(move), valueCp: info.score, bound: info.score <= info.alpha ? 'upper' : info.score >= info.beta ? 'lower' : null, depth: target }));
        options.onProgress?.({ nodes, qNodes, depth, selDepth, elapsedMs: performance.now() - started, pv: pv.map(moveToUci), scoreCp });
        if (Math.abs(scoreCp) >= MATE_BOUND && target >= MATE - Math.abs(scoreCp) + 2) break;
        // Stop early when the next iteration is unlikely to finish.
        if (performance.now() - started > budgetMs * 0.8) break;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
      }
    } catch (error) {
      if (error !== STOP) throw error;
      interrupted = true;
      // A partially searched iteration may still have improved on the previous best move.
      if (rootBest && rootBest.move !== best && rootSearched.length && rootBest.score > scoreCp - 30 && Math.abs(rootBest.score) < MATE_BOUND) {
        best = rootBest.move; pv = [best]; scoreCp = rootBest.score;
      }
    } finally {
      while (sp > startSp) unmake(keyCount > startKeys);
      keyCount = startKeys;
    }
    let proven = false;
    if (scoreCp >= MATE_BOUND && best === pv[0]) {
      // Confirm the mate with plain full-width alpha-beta when budget allows.
      const plies = MATE - scoreCp;
      const savedMax = maxNodes;
      try {
        if (make(best)) {
          try { proven = -verifyMate(plies - 1, -INF, -(MATE - plies) + 1, 1, 0) >= MATE - plies; } finally { undo(); }
        }
      } catch (error) { if (error !== STOP) throw error; } finally { maxNodes = savedMax; while (sp > startSp) unmake(keyCount > startKeys); keyCount = startKeys; }
    }
    const stopReason = proven ? 'proven-mate' : nodes >= maxNodes ? 'node-limit' : interrupted ? 'time-limit' : 'depth-limit';
    return { move: moveToUci(best), scoreCp, nodes, qNodes, depth, selDepth, pv: pv.map(moveToUci), completedIterations: completed, elapsedMs: performance.now() - started, stopReason, proven, mateInPlies: proven ? MATE - scoreCp : null, rootStats, continued };
  }

  function repeatCount() {
    const lo = keyLo[keyCount - 1], hi = keyHi[keyCount - 1];
    let count = 1;
    const limit = Math.max(0, keyCount - 1 - halfMoves);
    for (let i = keyCount - 3; i >= limit; i -= 2) if (keyLo[i] === lo && keyHi[i] === hi) count++;
    return count;
  }

  // Exposed for tests: perft and evaluation parity.
  function perft(depth, start = 0) {
    if (depth === 0) return 1;
    const end = generate(start, false);
    let total = 0;
    for (let i = start; i < end; i++) if (make(moveBuf[i])) { total += perft(depth - 1, end); undo(); }
    return total;
  }
  // Recompute every incremental field from scratch at each node of a perft walk.
  function verifyIncremental(depth, start = 0) {
    const saved = [hashLo, hashHi, psqMg, psqEg, phaseSum, materialSum, ...counts];
    computeHash();
    let mg = 0, eg = 0, ph = 0, mat = 0;
    const fresh = new Int8Array(16);
    for (let sq = 0; sq < 128; sq++) if (!(sq & 0x88) && board[sq]) { const p = board[sq]; fresh[p]++; mg += PSQ_MG[p * 128 + sq]; eg += PSQ_EG[p * 128 + sq]; ph += PIECE_PHASE[p]; mat += PIECE_MATERIAL[p]; }
    const expected = [hashLo, hashHi, mg, eg, ph, mat, ...fresh];
    hashLo = saved[0]; hashHi = saved[1];
    if (expected.some((value, i) => value !== saved[i])) throw new Error(`Incremental state drift: ${saved} vs ${expected}`);
    if (kings[0] < 0 || board[kings[0]] !== KING || board[kings[1]] !== (KING | 8)) throw new Error('King square drift');
    if (depth === 0) return 1;
    const end = generate(start, false);
    let total = 0;
    for (let i = start; i < end; i++) if (make(moveBuf[i])) { total += verifyIncremental(depth - 1, end); undo(); }
    return total;
  }
  /** Tuner hook: follow quiescence's principal variation to a quiet leaf and trace it. */
  function traceQuietLeaf(fen) {
    loadFen(fen);
    keyCount = 0; keyLo[keyCount] = hashLo; keyHi[keyCount] = hashHi; keyCount++;
    nodes = 0; qNodes = 0; maxNodes = 2_000_000; deadline = Infinity; signal = null; generation++;
    killers.fill(0); history.fill(0); counter.fill(0);
    const q = quiescence(-INF, INF, 0, 0);
    const line = Array.from(pvTable.subarray(0, pvLength[0]));
    let applied = 0;
    for (const move of line) { if (!make(move)) break; applied++; }
    const traced = traceFeatures();
    const leafEval = evaluateFull();
    while (applied--) undo();
    return { ...traced, q, leafEval, pvLength: line.length, rootSide: side };
  }
  function historyKeyFor(fen) { loadFen(fen); return [hashLo, hashHi]; }

  return { get lastRootFen() { return lastRootFen; }, verify: (fen, depth) => { loadFen(fen); keyCount = 0; return verifyIncremental(depth); }, run, perft: (fen, depth) => { loadFen(fen); keyCount = 0; return perft(depth); }, evaluateFen: fen => { loadFen(fen); return evaluateFull(); }, traceFen: fen => { loadFen(fen); return traceFeatures(); }, traceQuietLeaf, historyKeyFor, seeFor: (fen, uci) => { loadFen(fen); const end = generate(0, false); for (let i = 0; i < end; i++) if (moveToUci(moveBuf[i]) === uci) return see(moveBuf[i]); return null; } };
}

// Idle searchers are reused; a concurrent search gets its own instance.
const idle = [];
const acquire = () => idle.pop() || createSearcher();
const release = searcher => { if (idle.length < 2) idle.push(searcher); };
/** Prefer the idle searcher whose last root is one or two plies behind this game. */
function acquireFor(priorFens) {
  const index = idle.findIndex(searcher => priorFens.includes(searcher.lastRootFen));
  if (index < 0) return { searcher: acquire(), continuation: false };
  return { searcher: idle.splice(index, 1)[0], continuation: true };
}

/**
 * Reads the caller's game backwards without changing it: the positions since
 * the last irreversible move (oldest first, for repetition) and the positions
 * one and two plies back (to recognise a continuing game).
 */
function readHistory(chess) {
  const history = chess._history;
  if (!Array.isArray(history) || !history.length) return { reversible: [], prior: [] };
  const count = Math.min(history.length, Math.max(2, chess._halfMoves | 0));
  const reversibleCount = Math.min(chess._halfMoves | 0, history.length);
  const fens = [], undone = [];
  try {
    for (let i = 0; i < count; i++) { const move = chess.undo(); if (!move) break; undone.push(move); fens.push(chess.fen()); }
  } finally {
    for (let i = undone.length - 1; i >= 0; i--) chess.move(undone[i]);
  }
  return { reversible: fens.slice(0, reversibleCount).reverse(), prior: fens.slice(0, 2) };
}

/**
 * Search the caller's chess.js position. The caller's board and history are
 * restored before this returns (moves are undone/replayed only to read the
 * history needed for repetition detection and game continuity).
 */
export async function gatoSearch(chess, options = {}) {
  if (options.signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
  const fen = chess.fen(), pgnLength = chess._history?.length;
  const { reversible, prior } = readHistory(chess);
  if (chess.fen() !== fen || chess._history?.length !== pgnLength) throw new Error('Gato search failed to restore its caller board');
  const { searcher, continuation } = acquireFor(prior);
  try {
    const historyKeys = reversible.map(item => searcher.historyKeyFor(item));
    return await searcher.run({ fen, historyKeys, continuation }, options);
  } finally { release(searcher); }
}

/** Test hooks: move-generation perft, evaluation parity and SEE. */
export function gatoPerft(fen, depth) { const s = acquire(); try { return s.perft(fen, depth); } finally { release(s); } }
/** Evaluate a FEN, optionally with alternative weights (tests and tuning only). */
export function gatoEvaluate(fen, { weights } = {}) {
  if (weights) return createSearcher(weights).evaluateFen(fen);
  const s = acquire(); try { return s.evaluateFen(fen); } finally { release(s); }
}
/** Integer feature counts behind the evaluation of a FEN (tuning only). */
export function gatoTrace(fen) { const s = acquire(); try { return s.traceFen(fen); } finally { release(s); } }
/** Exported for the tuner: a searcher with explicit weights. */
export const createGatoSearcher = createSearcher;
export function gatoSee(fen, uci) { const s = acquire(); try { return s.seeFor(fen, uci); } finally { release(s); } }
export function gatoVerifyIncremental(fen, depth) { const s = acquire(); try { return s.verify(fen, depth); } finally { release(s); } }
