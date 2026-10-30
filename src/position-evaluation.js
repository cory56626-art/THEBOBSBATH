// Original, tapered static evaluation for the tactical search. This module
// deliberately uses only the pinned chess.js 1.4.0 board representation; it
// never generates moves or calls an external engine/network.
const MG = Object.freeze({ p: 100, n: 320, b: 335, r: 500, q: 950, k: 0 });
const EG = Object.freeze({ p: 120, n: 300, b: 325, r: 520, q: 930, k: 0 });
const PHASE = Object.freeze({ p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 });
const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP = [-17, -15, 15, 17];
const ROOK = [-16, -1, 1, 16];
const QUEEN = [...BISHOP, ...ROOK];
const PASSED_MG = [0, 0, 8, 15, 28, 48, 85, 0];
const PASSED_EG = [0, 0, 15, 30, 55, 95, 150, 0];
const TABLES = {};

// Rank is relative to the piece's own side: 0 is its home rank and 7 is the
// promotion rank. Mirroring ranks and swapping colors preserves every term.
for (const type of Object.keys(MG)) {
  TABLES[type] = { mg: new Int16Array(128), eg: new Int16Array(128) };
  for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const fc = 3.5 - Math.abs(file - 3.5), rc = 3.5 - Math.abs(rank - 3.5);
    let mg = MG[type], eg = EG[type];
    if (type === 'p') { mg += 6 * (rank - 1) + 4 * fc; eg += 4 * rank + 2 * fc; }
    if (type === 'n') { mg += 12 * fc + 8 * rc - (file === 0 || file === 7 ? 12 : 0); eg += 8 * fc + 8 * rc; }
    if (type === 'b') { mg += 5 * fc + 5 * rc + 2 * rank; eg += 5 * fc + 5 * rc; }
    if (type === 'r') { mg += 2 * rank + (rank === 6 ? 20 : 0); eg += 2 * fc + (rank === 6 ? 30 : 0); }
    if (type === 'q') { mg += 3 * fc + 3 * rc; eg += 5 * fc + 5 * rc; }
    if (type === 'k') {
      mg += (rank <= 1 && (file <= 2 || file >= 6) ? 28 : 0) - 12 * fc - 14 * rank;
      eg += 12 * fc + 12 * rc;
    }
    TABLES[type].mg[rank * 16 + file] = Math.round(mg);
    TABLES[type].eg[rank * 16 + file] = Math.round(eg);
  }
}

function mobility(board, square, type, color) {
  const offsets = type === 'n' ? KNIGHT : type === 'b' ? BISHOP : type === 'r' ? ROOK : QUEEN;
  let count = 0;
  for (const offset of offsets) {
    let to = square + offset;
    while (!(to & 0x88)) {
      const target = board[to];
      if (target?.color === color) break;
      if (type !== 'n' || !pawnAttacks(board, to, color === 'w' ? 'b' : 'w')) count++;
      if (target || type === 'n') break;
      to += offset;
    }
  }
  return count;
}

function pawnAttacks(board, square, color) {
  const direction = color === 'w' ? 16 : -16;
  const a = board[square + direction - 1], b = board[square + direction + 1];
  return (a?.type === 'p' && a.color === color) || (b?.type === 'p' && b.color === color);
}

const kingDistance = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));

/** Return an integer centipawn estimate from the side-to-move's perspective.
 * Mate, stalemate, fifty-move, repetition, and insufficient-material outcomes
 * belong to the search and must be checked before treating this as a leaf.
 */
export function evaluatePosition(chess) {
  const board = chess._board;
  const pawnFiles = { w: new Int8Array(8), b: new Int8Array(8) };
  const pawnRows = { w: new Uint8Array(8), b: new Uint8Array(8) };
  const bishops = { w: 0, b: 0 };
  let mg = 0, eg = 0, phase = 0, material = 0;

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) { square += 7; continue; }
    const piece = board[square];
    if (!piece) continue;
    const sign = piece.color === 'w' ? 1 : -1;
    const rank = piece.color === 'w' ? 7 - (square >> 4) : square >> 4;
    const relative = rank * 16 + (square & 7), table = TABLES[piece.type];
    mg += sign * table.mg[relative]; eg += sign * table.eg[relative];
    phase += PHASE[piece.type]; material += sign * MG[piece.type];
    if (piece.type === 'p') {
      pawnFiles[piece.color][square & 7]++;
      pawnRows[piece.color][square & 7] |= 1 << (square >> 4);
    } else if (piece.type === 'b') bishops[piece.color]++;
    if (piece.type !== 'p' && piece.type !== 'k') {
      const moves = mobility(board, square, piece.type, piece.color);
      const weight = piece.type === 'n' ? 4 : piece.type === 'b' ? 3 : piece.type === 'r' ? 2 : 1;
      mg += sign * weight * moves; eg += sign * weight * moves;
    }
  }

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) { square += 7; continue; }
    const piece = board[square];
    if (!piece) continue;
    const color = piece.color, other = color === 'w' ? 'b' : 'w', sign = color === 'w' ? 1 : -1;
    const file = square & 7, row = square >> 4;
    const own = pawnFiles[color], enemy = pawnFiles[other];
    if (piece.type === 'p') {
      if (own[file] > 1) { mg -= sign * 10; eg -= sign * 15; }
      if (!(own[file - 1] || own[file + 1])) { mg -= sign * 13; eg -= sign * 11; }
      const enemyRows = pawnRows[other][file] | (pawnRows[other][file - 1] || 0) | (pawnRows[other][file + 1] || 0);
      const ahead = color === 'w' ? (1 << row) - 1 : 255 ^ ((1 << (row + 1)) - 1);
      const rank = color === 'w' ? 7 - row : row;
      if (!(enemyRows & ahead) && !(pawnRows[color][file] & ahead)) {
        mg += sign * PASSED_MG[rank]; eg += sign * PASSED_EG[rank];
        if (rank >= 3 && chess._kings[color] >= 0 && chess._kings[other] >= 0) {
          const next = square + (color === 'w' ? -16 : 16);
          eg += sign * 4 * (kingDistance(next, chess._kings[other]) - kingDistance(next, chess._kings[color]));
        }
      }
      if (pawnAttacks(board, square, color)) { mg += sign * 6; eg += sign * 9; }
    } else if (piece.type === 'r' && !own[file]) {
      mg += sign * (enemy[file] ? 12 : 23); eg += sign * (enemy[file] ? 8 : 15);
    } else if (piece.type === 'k') {
      const forward = color === 'w' ? -16 : 16;
      for (let delta = -1; delta <= 1; delta++) {
        const one = square + forward + delta, two = square + 2 * forward + delta;
        if (one & 0x88) continue;
        if (board[one]?.type === 'p' && board[one].color === color) mg += sign * 12;
        else if (!(two & 0x88) && board[two]?.type === 'p' && board[two].color === color) mg += sign * 5;
        else mg -= sign * 8;
        if (!own[file + delta]) mg -= sign * 8;
      }
    }
  }
  if (bishops.w >= 2) { mg += 30; eg += 45; }
  if (bishops.b >= 2) { mg -= 30; eg -= 45; }
  // With a decisive material edge, bring the winning king near its opponent
  // and prefer an edge-bound defending king. This helps finish simple endings.
  if (Math.abs(material) >= 450 && phase <= 8 && chess._kings.w >= 0 && chess._kings.b >= 0) {
    const sign = material > 0 ? 1 : -1, weak = chess._kings[sign === 1 ? 'b' : 'w'];
    const edgeDistance = Math.min(weak & 7, 7 - (weak & 7), weak >> 4, 7 - (weak >> 4));
    eg += sign * (14 * (7 - kingDistance(chess._kings.w, chess._kings.b)) - 12 * edgeDistance);
  }
  const p = Math.min(24, phase);
  const tapered = (mg * p + eg * (24 - p)) / 24;
  const whiteScore = Math.sign(tapered) * Math.floor(Math.abs(tapered) + 0.5);
  return whiteScore === 0 ? 0 : chess._turn === 'w' ? whiteScore : -whiteScore;
}
