// Original SVG chess pieces. No remote images or font glyphs are required.
const PIECES = {
  p: '<circle cx="32" cy="18" r="8"/><path d="M25 28h14l-3 8 5 12H23l5-12z"/><path d="M21 48h22l3 7H18z"/>',
  r: '<path d="M18 10h8v7h6v-7h6v7h8v-7h3v17l-7 5v15H22V32l-7-5V10z"/><path d="M21 47h22l4 8H17z"/><path d="M23 26h18" fill="none"/>',
  n: '<path d="M21 48c0-10 10-14 12-23l-11 8-9-7 10-12 3-8 8 6c13 1 17 11 17 23v13z"/><path d="m25 13 6 3m-9 9 5-2" fill="none"/><circle cx="35" cy="20" r="1.7" class="piece-detail"/><path d="M20 48h29l3 7H16z"/>',
  b: '<path d="M32 7c-8 7-13 12-13 18 0 6 6 10 10 11l-7 12h20l-7-12c4-1 10-5 10-11 0-6-5-11-13-18z"/><path d="m34 17-6 11" fill="none"/><path d="M21 48h22l4 7H17z"/>',
  q: '<path d="m17 21 5 23h20l5-23-10 9-5-15-5 15z"/><circle cx="15" cy="18" r="3.5"/><circle cx="32" cy="11" r="3.5"/><circle cx="49" cy="18" r="3.5"/><path d="M22 44h20v5H22zM20 49h24l4 6H16z"/>',
  k: '<path d="M32 6v15m-6-9h12" fill="none" stroke-width="3.4"/><path d="M32 22c-10-13-24-2-15 10l7 12h16l7-12c9-12-5-23-15-10z"/><path d="M24 44h16v5H24zM21 49h22l5 6H16z"/><path d="M23 33h18" fill="none"/>',
};
const NAMES = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };

function positionFromFen(fen) {
  const ranks = String(fen).split(' ')[0].split('/');
  if (ranks.length !== 8) throw new Error('The board requires a valid FEN position.');
  const position = new Map();
  ranks.forEach((line, row) => {
    let column = 0;
    for (const item of line) {
      if (/^[1-8]$/.test(item)) column += Number(item);
      else {
        if (!/^[pnbrqkPNBRQK]$/.test(item) || column > 7) throw new Error('Invalid FEN board.');
        position.set(`${'abcdefgh'[column]}${8 - row}`, item);
        column += 1;
      }
    }
    if (column !== 8) throw new Error('Invalid FEN rank.');
  });
  return position;
}

function pieceSvg(piece) {
  const white = piece === piece.toUpperCase();
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" class="chess-piece ${white ? 'white-piece' : 'black-piece'}"><g fill="${white ? '#fff5de' : '#20323d'}" stroke="${white ? '#20323d' : '#eee5cc'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PIECES[piece.toLowerCase()]}</g></svg>`;
}

/** Draw an accessible, dependency-free chessboard from a legal FEN position. */
export function renderBoard(container, fen, options = {}) {
  const {
    orientation = 'w', selected = null, targets = [], lastMove = null,
    onSquareClick = () => {}, disabled = false,
  } = options;
  const position = positionFromFen(fen);
  const focusedSquare = container.contains(document.activeElement)
    ? document.activeElement?.dataset?.square : null;
  const files = orientation === 'b' ? [...'hgfedcba'] : [...'abcdefgh'];
  const ranks = orientation === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const targetSquares = new Set(Array.from(targets, target => typeof target === 'string' ? target : target.to));
  const previousSquares = typeof lastMove === 'string' ? [lastMove.slice(0, 2), lastMove.slice(2, 4)]
    : Array.isArray(lastMove) ? lastMove : [lastMove?.from, lastMove?.to];
  const fragment = document.createDocumentFragment();
  ranks.forEach((rank, row) => files.forEach((file, column) => {
    const square = `${file}${rank}`;
    const piece = position.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `square ${('abcdefgh'.indexOf(file) + rank) % 2 === 0 ? 'light' : 'dark'}`;
    button.dataset.square = square;
    button.dataset.index = String(row * 8 + column);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-rowindex', String(row + 1));
    button.setAttribute('aria-colindex', String(column + 1));
    button.setAttribute('aria-label', piece ? `${piece === piece.toUpperCase() ? 'White' : 'Black'} ${NAMES[piece.toLowerCase()]} on ${square}` : `Empty ${square}`);
    button.setAttribute('aria-selected', String(selected === square));
    button.disabled = Boolean(disabled);
    if (selected === square) button.classList.add('selected');
    if (previousSquares.includes(square)) button.classList.add('last-move');
    if (targetSquares.has(square)) {
      button.classList.add('legal-target');
      if (piece) button.classList.add('capture-target');
      button.setAttribute('aria-description', piece ? 'Legal capture' : 'Legal move');
    }
    if (piece) button.innerHTML = pieceSvg(piece);
    if (column === 0) {
      const coordinate = document.createElement('span');
      coordinate.className = 'square-coordinate rank-coordinate';
      coordinate.setAttribute('aria-hidden', 'true');
      coordinate.textContent = String(rank);
      button.append(coordinate);
    }
    if (row === 7) {
      const coordinate = document.createElement('span');
      coordinate.className = 'square-coordinate file-coordinate';
      coordinate.setAttribute('aria-hidden', 'true');
      coordinate.textContent = file;
      button.append(coordinate);
    }
    button.addEventListener('click', () => onSquareClick(square));
    button.addEventListener('keydown', event => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
      let index = row * 8 + column;
      if (event.key in offsets) {
        if ((event.key === 'ArrowLeft' && column === 0) || (event.key === 'ArrowRight' && column === 7)) return;
        index += offsets[event.key];
      } else if (event.key === 'Home') index = row * 8;
      else if (event.key === 'End') index = row * 8 + 7;
      else return;
      const next = container.querySelector(`[data-index="${index}"]`);
      if (next) { event.preventDefault(); next.focus(); }
    });
    fragment.append(button);
  }));
  container.setAttribute('role', 'grid');
  container.setAttribute('aria-label', `Chessboard. ${orientation === 'b' ? 'Black' : 'White'} at the bottom. Use arrow keys to explore squares.`);
  container.setAttribute('aria-rowcount', '8');
  container.setAttribute('aria-colcount', '8');
  container.replaceChildren(fragment);
  if (/^[a-h][1-8]$/.test(focusedSquare || '')) container.querySelector(`[data-square="${focusedSquare}"]`)?.focus({ preventScroll: true });
}
