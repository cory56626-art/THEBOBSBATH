/** Development diagnostics for the recorded v2 arena losses; never a held-out strength test. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { UciEngine } from './lib/uci-engine.mjs';

const root = new URL('../', import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); return [arg.slice(0, at < 0 ? undefined : at).replace(/^--/, ''), at < 0 ? true : arg.slice(at + 1)]; }));
const binary = args.stockfish || process.env.STOCKFISH_BINARY;
if (!binary) throw new Error('Pass --stockfish=/absolute/path/to/stockfish or set STOCKFISH_BINARY');
const nodes = Number(args.nodes || 100000);
if (!Number.isInteger(nodes) || nodes < 1000) throw new Error('--nodes must be an integer >=1000');
const thresholdCp = 200;
const sha = value => createHash('sha256').update(value).digest('hex');
const arenaBytes = await readFile(new URL('docs/ai-bot-arena.json', root));
const arena = JSON.parse(arenaBytes);
const opponent = new UciEngine(binary);
const report = {
  createdAt: new Date().toISOString(), purpose: 'Development diagnosis of recorded v2 losses; inspected positions must not become held-out validation data',
  sourceArena: { path: 'docs/ai-bot-arena.json', SHA256: sha(arenaBytes), engine: arena.engine, model: arena.model },
  oracle: { executableSHA256: sha(await readFile(binary)), nodesPerQuery: nodes, confirmationNodesPerQuery: 500000, threads: 1, hashMB: 16, hashClearedPerQuery: true, scoreSelection: 'Last unbounded info score (completed iteration estimate); retain the final reported line separately because a node limit can interrupt an aspiration search with a bound.' },
  diagnosticScriptSHA256: sha(await readFile(new URL('scripts/diagnose-v2-losses.mjs', root))),
  selection: { split: 'development', skills: [5], completedLossesOnly: true, gameIds: [], thresholdCp, stop: 'Analyze INTUITION moves chronologically within each completed loss. Stop at the first finite score regret >=200cp, newly allowed forced mate, or lost forced winning mate. Retain earlier rows.' },
  caveats: ['Fixed-node Stockfish estimates can be unstable; restricted and unrestricted root searches can disagree.', 'This selects failures after observing outcomes, so it is development diagnosis, not independent strength evidence.', 'No Stockfish evaluation is used by the deployed playing engine.', 'All scores use the side-to-move perspective at the position before INTUITION chose its move. Mate scores are kept separate from centipawns.'],
  games: [],
};

const asSan = (fen, move) => {
  if (!move || move === '(none)') return null;
  const chess = new Chess(fen);
  return chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }).san;
};
const pvSan = (fen, moves) => {
  const chess = new Chess(fen), san = [];
  for (const move of moves.slice(0, 10)) {
    try { san.push(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }).san); }
    catch { break; }
  }
  return san;
};
async function analyze(history, forcedMove, queryNodes = nodes) {
  await opponent.newGame();
  opponent.send(`position startpos moves ${history.join(' ')}`);
  let info = null, lastExact = null;
  opponent.collect = line => {
    const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
    if (!line.startsWith('info ') || !score) return;
    info = { score: { type: score[1], value: Number(score[2]), bound: /\b(lowerbound|upperbound)\b/.exec(line)?.[1] || null }, depth: Number(/\bdepth (\d+)/.exec(line)?.[1] || 0), nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] || 0), timeMs: Number(/\btime (\d+)/.exec(line)?.[1] || 0), pv: /\bpv (.+)/.exec(line)?.[1]?.trim().split(/\s+/) || [] };
    if (!info.score.bound) lastExact = info;
  };
  try {
    const done = await opponent.request(`go nodes ${queryNodes}${forcedMove ? ` searchmoves ${forcedMove}` : ''}`, line => line.startsWith('bestmove '));
    if (!info) throw new Error('Oracle returned no evaluation');
    const selected = lastExact || info;
    return { ...selected, bestMove: selected.pv[0] || done.split(/\s+/)[1], reportedBestMove: done.split(/\s+/)[1], finalReportedInfo: info, forcedMove: forcedMove || null };
  } finally { opponent.collect = null; }
}
try {
  await opponent.init();
  await opponent.configure({ Threads: 1, Hash: 16, MultiPV: 1, Ponder: false, UCI_LimitStrength: false, 'Skill Level': 20 });
  report.oracle.name = opponent.name;
  const games = arena.games.filter(game => game.skill === 5 && game.result !== '*' && game.result !== '1/2-1/2' && game[game.winner === 'w' ? 'whiteEngine' : 'blackEngine'] !== 'intuition');
  report.selection.gameIds = games.map(game => game.id);
  for (const game of games) {
    const chess = new Chess(), history = [];
    for (const move of game.openingMoves) { const made = chess.move(move); history.push(made.from + made.to + (made.promotion || '')); }
    const diagnostic = { id: game.id, opening: game.opening, whiteEngine: game.whiteEngine, blackEngine: game.blackEngine, result: game.result, rows: [], firstLargeMistake: null };
    for (const move of game.moves) {
      if (chess.fen() !== move.beforeFen) throw new Error(`Arena history mismatch in game${game.id}, ply${move.ply}`);
      if (move.engine === 'intuition') {
        const reference = await analyze(history);
        const chosen = reference.bestMove === move.move ? reference : await analyze(history, move.move);
        const comparable = reference.score.type === 'cp' && chosen.score.type === 'cp' && !reference.score.bound && !chosen.score.bound;
        const rawCpDelta = comparable ? reference.score.value - chosen.score.value : null;
        const newlyAllowsForcedMate = chosen.score.type === 'mate' && chosen.score.value < 0 && !(reference.score.type === 'mate' && reference.score.value < 0);
        const losesForcedWinningMate = reference.score.type === 'mate' && reference.score.value > 0 && !(chosen.score.type === 'mate' && chosen.score.value > 0);
        const row = { gameId: game.id, playedPly: move.ply, fullMoveNumber: Number(move.beforeFen.split(' ')[5]), color: move.color, fen: move.beforeFen, history: [...history], move: move.move, san: move.san, bestMove: reference.bestMove, bestSan: asSan(move.beforeFen, reference.bestMove), reference, chosen, referencePvSan: pvSan(move.beforeFen, reference.pv), chosenPvSan: pvSan(move.beforeFen, chosen.pv), rawCpDelta, cpLoss: rawCpDelta === null ? null : Math.max(0, rawCpDelta), newlyAllowsForcedMate, losesForcedWinningMate, inferenceCalls: move.inferenceCalls, treeNodes: move.treeNodes, elapsedMs: move.elapsedMs, split: 'development' };
        diagnostic.rows.push(row);
        console.log(`game${game.id} ply${move.ply}: ${move.san}, best ${row.bestSan}, regret ${row.cpLoss ?? (newlyAllowsForcedMate ? 'new losing mate' : 'mate scores')}`);
        if ((row.cpLoss !== null && row.cpLoss >= thresholdCp) || newlyAllowsForcedMate || losesForcedWinningMate) {
          const confirmationReference = await analyze(history, null, 500000);
          const confirmationChosen = confirmationReference.bestMove === move.move ? confirmationReference : await analyze(history, move.move, 500000);
          const cpComparable = confirmationReference.score.type === 'cp' && confirmationChosen.score.type === 'cp' && !confirmationReference.score.bound && !confirmationChosen.score.bound;
          row.confirmation = { nodesPerQuery: 500000, reference: confirmationReference, chosen: confirmationChosen, bestSan: asSan(move.beforeFen, confirmationReference.bestMove), referencePvSan: pvSan(move.beforeFen, confirmationReference.pv), chosenPvSan: pvSan(move.beforeFen, confirmationChosen.pv), cpLoss: cpComparable ? Math.max(0, confirmationReference.score.value - confirmationChosen.score.value) : null };
          diagnostic.firstLargeMistake = row;
          console.log(`confirmation game${game.id}: ${row.confirmation.bestSan}, regret ${row.confirmation.cpLoss}`);
          break;
        }
      }
      chess.move({ from: move.move.slice(0, 2), to: move.move.slice(2, 4), ...(move.move[4] ? { promotion: move.move[4] } : {}) });
      history.push(move.move);
    }
    report.games.push(diagnostic);
    await writeFile(new URL(args.output || 'docs/v2-loss-diagnosis.json', root), JSON.stringify(report, null, 2) + '\n');
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL(args.output || 'docs/v2-loss-diagnosis.json', root), JSON.stringify(report, null, 2) + '\n');
} finally { await opponent.close(); }
