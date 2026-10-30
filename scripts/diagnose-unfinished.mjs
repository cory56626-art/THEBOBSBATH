/** Post-match development diagnostics; this never adjudicates or changes a game. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { UciEngine } from './lib/uci-engine.mjs';
import { validateGames } from './lib/validate-games.mjs';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(0, index < 0 ? undefined : index).replace(/^--/, ''), index < 0 ? true : arg.slice(index + 1)];
}));
const binary = args.stockfish || process.env.STOCKFISH_BINARY;
if (typeof binary !== 'string' || !binary.trim()) throw new Error('Pass --stockfish=/absolute/path/to/stockfish or set STOCKFISH_BINARY');
const source = new URL(args.input || 'docs/ai-v3-stockfish5.json', root);
const output = new URL(args.output || 'docs/ai-v3-unfinished-diagnostic.json', root);
const nodes = Number(args.nodes ?? 100000);
if (!Number.isInteger(nodes) || nodes < 1000) throw new Error('--nodes must be an integer >= 1000');
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = await readFile(source);
const games = JSON.parse(bytes);
const replayValidation = validateGames(games);
const oracle = new UciEngine(binary);
const options = { Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, UCI_LimitStrength: false, 'Skill Level': 20 };
const report = {
  startedAt: new Date().toISOString(), inputReportSHA256: hash(bytes), sourceReport: source.pathname.split('/').pop(), replayValidation,
  scriptSHA256: hash(await readFile(new URL('scripts/diagnose-unfinished.mjs', root))),
  oracle: { source: 'https://github.com/official-stockfish/Stockfish/releases/tag/sf_19', executableSHA256: hash(await readFile(binary)), options },
  settings: { nodes, fullHistory: true, hashClearedPerPosition: true },
  caveats: [
    'Post-match development diagnostics on unfinished positions, selected after observing the results. This is not an independent strength test.',
    'Fixed-node evaluations are estimates, not proofs of perfect chess play.',
    'Every source game retains its original unfinished, unscored result. These evaluations do not adjudicate, extend or rescore any game.',
    'Scores are reported from the side to move and separately converted to the INTUITION side. Mate distances remain in Stockfish UCI units.',
  ], positions: [],
};
try {
  await oracle.init();
  report.oracle.name = oracle.name;
  await oracle.configure(options);
  for (const game of games.games.filter(item => item.status === 'truncated')) {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const history = chess.history({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
    await oracle.newGame();
    let rawInfo = null, latestExactInfo = null;
    const collect = line => {
      const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
      if (!line.startsWith('info ') || !score) return;
      rawInfo = line;
      if (!/\b(lowerbound|upperbound)\b/.test(line)) latestExactInfo = {
        score: { type: score[1], value: Number(score[2]) },
        depth: Number(/\bdepth (\d+)/.exec(line)?.[1] || 0),
        nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] || 0), rawInfo: line,
      };
    };
    oracle.lines.on('line', collect);
    const result = await oracle.chooseMove(history, nodes);
    oracle.lines.off('line', collect);
    if (!result.info?.score) throw new Error(`No oracle score for game ${game.id}`);
    const color = game.whiteEngine === 'intuition' ? 'w' : 'b';
    const stmSign = chess.turn() === color ? 1 : -1;
    const material = { w: { pieces: {}, centipawns: 0 }, b: { pieces: {}, centipawns: 0 } };
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    for (const row of chess.board()) for (const piece of row) if (piece) {
      material[piece.color].pieces[piece.type] = (material[piece.color].pieces[piece.type] || 0) + 1;
      material[piece.color].centipawns += values[piece.type];
    }
    const pvSan = [];
    const pv = new Chess();
    pv.loadPgn(game.pgn);
    for (const uci of result.info.pv) pvSan.push(pv.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }).san);
    const bound = /\b(lowerbound|upperbound)\b/.exec(rawInfo || '')?.[1] || null;
    const intuitionBound = !bound || stmSign === 1 ? bound : bound === 'lowerbound' ? 'upperbound' : 'lowerbound';
    const position = {
      gameId: game.id, opening: game.opening, originalResult: game.result, originalStatus: game.status,
      fen: chess.fen(), intuitionColor: color, sideToMove: chess.turn(), material,
      intuitionMaterialBalanceCp: material[color].centipawns - material[color === 'w' ? 'b' : 'w'].centipawns,
      oracle: { ...result.info, bestMove: result.move, bound, rawInfo, latestExactInfo },
      intuitionScore: { type: result.info.score.type, value: result.info.score.value * stmSign, bound: intuitionBound },
      latestExactIntuitionScore: latestExactInfo ? { type: latestExactInfo.score.type, value: latestExactInfo.score.value * stmSign, depth: latestExactInfo.depth, nodes: latestExactInfo.nodes } : null, pvSan,
    };
    report.positions.push(position);
    console.log(`Game ${game.id}: INTUITION score ${position.intuitionScore.value} ${position.intuitionScore.type}, material ${position.intuitionMaterialBalanceCp} cp`);
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output.pathname}`);
} finally { await oracle.close(); }
