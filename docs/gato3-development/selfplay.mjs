// Development-only data generator: fast Gato 2 self-play from randomized
// openings. Writes quiet positions labeled with the final game result.
import { appendFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { gatoSearch } from '../../src/gato-search.js';

const [seedArg, gamesArg, outPath, nodesArg] = process.argv.slice(2);
let seed = Number(seedArg) >>> 0 || 1;
const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const games = Number(gamesArg) || 100;
const maxNodes = Number(nodesArg) || 8000;
writeFileSync(outPath, '');
const started = Date.now();
let positions = 0;
for (let g = 0; g < games; g++) {
  let chess;
  for (;;) {
    chess = new Chess();
    const randomPlies = 4 + Math.floor(random() * 7);
    for (let i = 0; i < randomPlies && !chess.isGameOver(); i++) {
      const moves = chess.moves();
      chess.move(moves[Math.floor(random() * moves.length)]);
    }
    if (chess.isGameOver()) continue;
    const probe = await gatoSearch(chess, { budgetMs: 10000, maxNodes: 3000 });
    if (Math.abs(probe.scoreCp) < 250) break;
  }
  const records = [];
  let result = null, decisive = 0, quiet = 0;
  for (let ply = 0; ply < 400; ply++) {
    if (chess.isGameOver()) {
      result = chess.isCheckmate() ? (chess.turn() === 'w' ? 0 : 1) : 0.5;
      break;
    }
    const fen = chess.fen();
    const r = await gatoSearch(chess, { budgetMs: 10000, maxNodes });
    const whiteScore = chess.turn() === 'w' ? r.scoreCp : -r.scoreCp;
    const move = chess.move({ from: r.move.slice(0, 2), to: r.move.slice(2, 4), ...(r.move[4] ? { promotion: r.move[4] } : {}) });
    const isQuiet = !move.captured && !move.promotion && !chess.isCheck();
    const wasInCheck = new Chess(fen).isCheck();
    if (isQuiet && !wasInCheck && Math.abs(whiteScore) < 3000) records.push(fen);
    // Training-label adjudication only (never used for official results).
    decisive = Math.abs(whiteScore) >= 1000 ? (Math.sign(whiteScore) === Math.sign(decisive) || !decisive ? decisive + Math.sign(whiteScore) : Math.sign(whiteScore)) : 0;
    if (Math.abs(decisive) >= 6) { result = decisive > 0 ? 1 : 0; break; }
    quiet = ply > 120 && Math.abs(whiteScore) < 25 ? quiet + 1 : 0;
    if (quiet >= 24) { result = 0.5; break; }
  }
  if (result === null) result = 0.5;
  appendFileSync(outPath, records.map(fen => `${fen};${result}`).join('\n') + (records.length ? '\n' : ''));
  positions += records.length;
  if ((g + 1) % 20 === 0) console.log(`games ${g + 1}/${games} positions ${positions} elapsed ${Math.round((Date.now() - started) / 1000)}s`);
}
console.log(`done positions ${positions}`);
