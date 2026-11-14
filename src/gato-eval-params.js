/**
 * Gato 3 evaluation parameter layout. Every term is a (middlegame, endgame)
 * weight pair applied to an integer feature count, white-positive. The
 * initial values reproduce Gato 1/Gato 2's handcrafted evaluation exactly;
 * new terms start at zero. src/gato3-weights.js holds the tuned values.
 */
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

export const PARAMS = {};
let size = 0;
const block = (name, length) => { PARAMS[name] = size; size += length; };
block('pst', 6 * 64);          // (type - 1) * 64 + relativeRank * 8 + file
block('mobilityKnight', 9);    // squares not attacked by enemy pawns, 0..8
block('mobilityBishop', 14);
block('mobilityRook', 15);
block('mobilityQueen', 28);
block('doubled', 1);
block('isolated', 1);
block('supported', 1);
block('phalanx', 1);           // new: a pawn with a friendly pawn beside it
block('passed', 8);            // by relative rank
block('passedEnemyKing', 1);   // king distance to the square in front, rank >= 3
block('passedOwnKing', 1);
block('passedBlocked', 1);     // new: any piece on the square in front
block('rookOpen', 1);
block('rookSemiOpen', 1);
block('shieldOne', 1);
block('shieldTwo', 1);
block('shieldMissing', 1);
block('shieldFile', 1);
block('bishopPair', 1);
block('kingDanger', 12);       // new: attack-unit bucket against a king, attacker has a queen
block('threatByPawn', 1);      // new: pawn attacks an enemy piece
block('threatByMinor', 1);     // new: knight/bishop attacks an enemy rook or queen
block('threatByRook', 1);      // new: rook attacks an enemy queen
block('tempo', 1);             // new: side to move
export const PARAM_COUNT = size;

export const pstIndex = (type, relativeRank, file) => PARAMS.pst + (type - 1) * 64 + relativeRank * 8 + file;

/** Gato 1/Gato 2's handcrafted values in this layout (new terms zero). */
export function gato2Weights() {
  const mg = new Array(PARAM_COUNT).fill(0), eg = new Array(PARAM_COUNT).fill(0);
  const MG = [0, 100, 320, 335, 500, 950, 0], EG = [0, 120, 300, 325, 520, 930, 0];
  for (let type = PAWN; type <= KING; type++) for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const fc = 3.5 - Math.abs(file - 3.5), rc = 3.5 - Math.abs(rank - 3.5);
    let m = MG[type], e = EG[type];
    if (type === PAWN) { m += 6 * (rank - 1) + 4 * fc; e += 4 * rank + 2 * fc; }
    if (type === KNIGHT) { m += 12 * fc + 8 * rc - (file === 0 || file === 7 ? 12 : 0); e += 8 * fc + 8 * rc; }
    if (type === BISHOP) { m += 5 * fc + 5 * rc + 2 * rank; e += 5 * fc + 5 * rc; }
    if (type === ROOK) { m += 2 * rank + (rank === 6 ? 20 : 0); e += 2 * fc + (rank === 6 ? 30 : 0); }
    if (type === QUEEN) { m += 3 * fc + 3 * rc; e += 5 * fc + 5 * rc; }
    if (type === KING) { m += (rank <= 1 && (file <= 2 || file >= 6) ? 28 : 0) - 12 * fc - 14 * rank; e += 12 * fc + 12 * rc; }
    mg[pstIndex(type, rank, file)] = Math.round(m); eg[pstIndex(type, rank, file)] = Math.round(e);
  }
  for (const [name, weight, max] of [['mobilityKnight', 4, 8], ['mobilityBishop', 3, 13], ['mobilityRook', 2, 14], ['mobilityQueen', 1, 27]]) {
    for (let count = 0; count <= max; count++) { mg[PARAMS[name] + count] = weight * count; eg[PARAMS[name] + count] = weight * count; }
  }
  const set = (name, m, e) => { mg[PARAMS[name]] = m; eg[PARAMS[name]] = e; };
  set('doubled', -10, -15); set('isolated', -13, -11); set('supported', 6, 9);
  [0, 0, 8, 15, 28, 48, 85, 0].forEach((value, rank) => { mg[PARAMS.passed + rank] = value; });
  [0, 0, 15, 30, 55, 95, 150, 0].forEach((value, rank) => { eg[PARAMS.passed + rank] = value; });
  set('passedEnemyKing', 0, 4); set('passedOwnKing', 0, -4);
  set('rookOpen', 23, 15); set('rookSemiOpen', 12, 8);
  set('shieldOne', 12, 0); set('shieldTwo', 5, 0); set('shieldMissing', -8, 0); set('shieldFile', -8, 0);
  set('bishopPair', 30, 45);
  return { mg, eg };
}
