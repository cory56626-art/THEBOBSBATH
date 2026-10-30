import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { evaluatePosition } from '../src/position-evaluation.js';

function mirror(fen) {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  return `${placement.split('/').reverse().join('/').replace(/[a-zA-Z]/g, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())} ${turn === 'w' ? 'b' : 'w'} ${castling === '-' ? '-' : castling.replace(/[a-zA-Z]/g, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())} ${ep === '-' ? '-' : ep[0] + (9 - Number(ep[1]))} ${half} ${full}`;
}

test('static evaluation preserves color/rank mirror symmetry and does not mutate the position', () => {
  const positions = [new Chess().fen(), 'r2q1rk1/pp2bppp/2n1pn2/2bp4/2P5/1PN1PN2/PB1PBPPP/R2Q1RK1 w - - 2 9', '8/2p3k1/3p4/3P4/1P3K2/8/8/8 w - - 0 50', '7k/8/8/8/4Q3/8/5K2/8 w - - 0 1'];
  for (const fen of positions) {
    const board = new Chess(fen), before = board.fen(), hash = board.hash();
    const score = evaluatePosition(board);
    assert.ok(Number.isInteger(score));
    assert.equal(score, evaluatePosition(new Chess(mirror(fen))), fen);
    assert.equal(board.fen(), before); assert.equal(board.hash(), hash);
  }
});

test('material advantage dominates modest positional terms and follows side-to-move perspective', () => {
  const white = new Chess('7k/8/8/8/4Q3/8/5K2/8 w - - 0 1');
  const black = new Chess('7k/8/8/8/4Q3/8/5K2/8 b - - 0 1');
  assert.ok(evaluatePosition(white) > 850);
  assert.equal(evaluatePosition(white), -evaluatePosition(black));
});

test('central knight and advanced passer receive useful positional bonuses', () => {
  const central = new Chess('7k/8/8/3N4/8/8/8/7K w - - 0 1');
  const rim = new Chess('7k/8/8/N7/8/8/8/7K w - - 0 1');
  assert.ok(evaluatePosition(central) > evaluatePosition(rim));
  const advanced = new Chess('7k/3P4/8/8/8/8/8/7K w - - 0 1');
  const home = new Chess('7k/8/8/8/8/8/3P4/7K w - - 0 1');
  assert.ok(evaluatePosition(advanced) > evaluatePosition(home) + 100);
});
