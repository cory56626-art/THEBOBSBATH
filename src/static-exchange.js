/** Local static exchange estimate on one target square. This is a move-ordering
 * and selective-search heuristic, not a proof about tactics away from target.
 * No chess.js state is mutated. EP, promotions and last-rank targets return
 * null so uncertain special exchanges cannot trigger capture pruning. */
const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 20000 };
const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
const RAYS = [-17, -16, -15, -1, 1, 15, 16, 17];
const other = color => color === 'w' ? 'b' : 'w';

function attacks(board, target, color) {
  const direction = color === 'w' ? 16 : -16;
  for (const offset of [direction - 1, direction + 1]) {
    const from = target + offset;
    if (!(from & 0x88) && board[from]?.color === color && board[from].type === 'p') return true;
  }
  for (const offset of KNIGHT) {
    const from = target + offset;
    if (!(from & 0x88) && board[from]?.color === color && board[from].type === 'n') return true;
  }
  for (const offset of KING) {
    const from = target + offset;
    if (!(from & 0x88) && board[from]?.color === color && board[from].type === 'k') return true;
  }
  for (const offset of RAYS) {
    for (let from = target + offset; !(from & 0x88); from += offset) {
      const piece = board[from];
      if (!piece) continue;
      if (piece.color === color && (piece.type === 'q' || piece.type === (Math.abs(offset) === 1 || Math.abs(offset) === 16 ? 'r' : 'b'))) return true;
      break;
    }
  }
  return false;
}

function leastAttacker(board, target, color, kings, probe) {
  const candidates = [];
  const add = (from, type) => {
    if (!(from & 0x88) && board[from]?.color === color && board[from].type === type) candidates.push(from);
  };
  const direction = color === 'w' ? 16 : -16;
  add(target + direction - 1, 'p'); add(target + direction + 1, 'p');
  for (const offset of KNIGHT) add(target + offset, 'n');
  for (const offset of KING) add(target + offset, 'k');
  for (const offset of RAYS) {
    for (let from = target + offset; !(from & 0x88); from += offset) {
      const piece = board[from];
      if (!piece) continue;
      if (piece.color === color && (piece.type === 'q' || piece.type === (Math.abs(offset) === 1 || Math.abs(offset) === 16 ? 'r' : 'b'))) candidates.push(from);
      break;
    }
  }
  candidates.sort((a, b) => VALUE[board[a].type] - VALUE[board[b].type] || a - b);
  for (const from of candidates) {
    probe();
    const piece = board[from], captured = board[target];
    board[from] = undefined; board[target] = piece;
    const safe = !attacks(board, piece.type === 'k' ? target : kings[color], other(color));
    board[from] = piece; board[target] = captured;
    if (safe) return from;
  }
  return null;
}

export function staticExchange(chess, move, probe = () => {}) {
  const target = move.to;
  if (!move.captured || move.promotion || !chess._board[target] || (target >> 4) === 0 || (target >> 4) === 7) return null;
  probe();
  const board = chess._board.slice();
  const kings = { w: chess._kings.w, b: chess._kings.b };
  const piece = board[move.from];
  board[move.from] = undefined; board[target] = piece;
  if (piece.type === 'k') kings[piece.color] = target;
  if (attacks(board, kings[piece.color], other(piece.color))) return null;
  const gains = [VALUE[move.captured]];
  let side = other(piece.color);
  // Every iteration removes a piece, so 32 iterations cover any legal board.
  for (let depth = 1; depth < 32; depth++) {
    const from = leastAttacker(board, target, side, kings, probe);
    if (from === null) break;
    gains.push(VALUE[board[target].type] - gains[depth - 1]);
    const next = board[from];
    board[from] = undefined; board[target] = next;
    if (next.type === 'k') kings[side] = target;
    side = other(side);
  }
  if (gains.length === 32) return null; // Unreachable oversized FEN: do not prune from an incomplete exchange.
  for (let depth = gains.length - 1; depth > 0; depth--) gains[depth - 1] = -Math.max(-gains[depth - 1], gains[depth]);
  return gains[0];
}
