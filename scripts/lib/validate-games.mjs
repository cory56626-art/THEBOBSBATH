import { Chess } from 'chess.js';

function require(condition, message) {
  if (!condition) throw new Error(message);
}

/** Replay full histories independently of summary scores and stored per-move FENs. */
export function validateGames(report) {
  require(Array.isArray(report.games), 'Report has no games');
  const stats = { games: report.games.length, scored: 0, unfinished: 0, moves: 0, terminations: {} };
  for (const game of report.games) {
    const context = `Game ${game.id}`;
    const chess = new Chess();
    for (const san of game.openingMoves) chess.move(san);
    require(chess.fen() === game.openingFen, `${context}: opening FEN does not match opening history`);
    for (let index = 0; index < game.moves.length; index++) {
      const move = game.moves[index];
      require(move.ply === index + 1, `${context}: nonsequential ply`);
      require(move.beforeFen === chess.fen(), `${context}: before-FEN mismatch at ply ${move.ply}`);
      require(move.color === chess.turn(), `${context}: wrong side at ply ${move.ply}`);
      require(move.engine === (move.color === 'w' ? game.whiteEngine : game.blackEngine), `${context}: wrong engine at ply ${move.ply}`);
      require(Number.isFinite(move.elapsedMs) && move.elapsedMs >= 0, `${context}: invalid measured time at ply ${move.ply}`);
      const played = chess.move({ from: move.move.slice(0, 2), to: move.move.slice(2, 4), ...(move.move[4] ? { promotion: move.move[4] } : {}) });
      require(played.san === move.san, `${context}: SAN mismatch at ply ${move.ply}`);
      require(chess.fen() === move.afterFen, `${context}: after-FEN mismatch at ply ${move.ply}`);
    }
    require(game.plies === game.moves.length, `${context}: played-ply count mismatch`);
    require(chess.fen() === game.finalFen, `${context}: final FEN mismatch`);
    const pgn = new Chess();
    pgn.loadPgn(game.pgn);
    require(pgn.fen() === game.finalFen, `${context}: PGN final FEN mismatch`);
    require(pgn.history().join(' ') === chess.history().join(' '), `${context}: PGN history mismatch`);
    require(pgn.getHeaders().Result === game.result, `${context}: PGN result mismatch`);
    if (game.status === 'truncated') {
      require(game.result === '*' && game.winner === null && !chess.isGameOver(), `${context}: truncated game must be unfinished and unscored`);
      require(game.moves.length === report.settings.maxPlies, `${context}: truncated game did not reach the played-ply cap`);
      stats.unfinished++;
    } else if (game.status === 'checkmate') {
      require(chess.isCheckmate(), `${context}: claimed checkmate is not checkmate`);
      const winner = chess.turn() === 'w' ? 'b' : 'w';
      require(game.winner === winner && game.result === (winner === 'w' ? '1-0' : '0-1'), `${context}: checkmate winner mismatch`);
      stats.scored++;
    } else if (game.status.endsWith('forfeit')) {
      require(['1-0', '0-1'].includes(game.result), `${context}: forfeit has no winner`);
      require(game.winner === (game.result === '1-0' ? 'w' : 'b'), `${context}: forfeit winner mismatch`);
      if (game.status === 'time-forfeit') require(Math.min(game.clocks.w, game.clocks.b) <= 0, `${context}: time forfeit without an exhausted clock`);
      stats.scored++;
    } else {
      const draws = {
        stalemate: chess.isStalemate(),
        'threefold-repetition': chess.isThreefoldRepetition(),
        'insufficient-material': chess.isInsufficientMaterial(),
        'fifty-move-draw': chess.isDrawByFiftyMoves(),
      };
      require(draws[game.status] && game.result === '1/2-1/2' && game.winner === null, `${context}: draw status or result mismatch`);
      stats.scored++;
    }
    if (!game.status.endsWith('forfeit')) {
      for (const color of ['w', 'b']) {
        const spent = game.moves.filter(move => move.color === color).reduce((sum, move) => sum + move.elapsedMs, 0);
        require(Math.abs(report.settings.clockPerSideMs - spent - game.clocks[color]) < 0.001, `${context}: ${color} game clock mismatch`);
      }
    }
    stats.moves += game.moves.length;
    stats.terminations[game.status] = (stats.terminations[game.status] || 0) + 1;
  }
  return stats;
}
