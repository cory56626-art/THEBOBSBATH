import { Chess } from 'chess.js';
import { renderBoard } from './board.js';
import { serializePosition, playUci, ENGINE_VERSION } from './engine.js';
import { BENCHMARK_SUITES, rowsToCSV } from './benchmark.js';
import defaultGate from './default-controller.json';
import { BOT_PROFILE, BOTS, botById, formatInterval, generationLabel } from './bot-profile.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const modeNames = { direct: 'Direct policy', search: 'Always search', selective: 'Selective thinking' };
let game = new Chess(), orientation = 'w', selected = null, lastMove = null, modelMetadata = null;
let ready = false, busy = false, activeId = null, watchRunning = false, latestDecision = null;
let startingGame = false, gameEpoch = 0, gameNotice = null, autoMoveTimer = null;
let latestReport = null, lastComparison = [], gate = defaultGate;
let battle = null; // { running, seats, total, budgetMs, games, current }
const pending = new Map(), logs = [], reports = [];
let sequence = 0;
try {
  const saved = JSON.parse(localStorage.getItem('intuition-controller-v1') || 'null');
  if (saved?.trained && saved.modelId === defaultGate.modelId) gate = saved;
} catch { /* A blocked or full localStorage never prevents play. */ }

const worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' });
function log(type, detail) {
  logs.push({ time: new Date().toISOString(), type, detail });
  if (logs.length > 1000) logs.shift();
}
function toast(message, error = false) {
  const el = $('toast');
  if (el) { el.textContent = message; el.hidden = false; el.dataset.error = String(error); }
  log(error ? 'error' : 'notice', message);
}
const opponent = () => botById($('opponent')?.value || BOT_PROFILE.id);
function settings() {
  const bot = opponent();
  return { botId: bot.id, budgetMs: Number($('budget')?.value || bot.rating.budgetMs), maxNodes: Number($('node-limit')?.value || bot.rating.maxNodes), gate, threshold: Number($('controller-threshold')?.value || 0.5) };
}
const battleRunning = () => !!battle?.running;
function request(type, options = {}, position = serializePosition(game), onProgress) {
  if (!ready) return Promise.reject(new Error('The neural model is still loading.'));
  if (busy) return Promise.reject(new Error('An experiment is already running. Cancel it before starting another.'));
  const id = ++sequence;
  busy = true; activeId = id; updateControls();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, type });
    worker.postMessage({ id, type, position, options });
    log('request', { id, type, options: { ...options, gate: options.gate ? { trained: options.gate.trained, modelId: options.gate.modelId } : null }, fen: position.fen });
  });
}
worker.onmessage = event => {
  const data = event.data;
  if (data.type === 'loading') {
    $('model-status').textContent = data.message?.stage === 'weights' ? 'Verifying model weights…' : 'Loading neural model…';
    return;
  }
  if (data.type === 'ready') {
    ready = true; modelMetadata = data.metadata;
    $('model-status').textContent = 'Neural model ready';
    if ($('model-detail')) $('model-detail').textContent = `${Number(data.metadata?.parameters || 116266).toLocaleString()} parameters · local inference · verified weights`;
    log('model-ready', data.metadata);
    renderGate(); render(); maybeAutoMove(); return;
  }
  if (data.type === 'init-error') { toast(`Model could not load: ${data.error}. Reload to retry.`, true); $('model-status').textContent = 'Model unavailable'; return; }
  const task = pending.get(data.id);
  if (!task) return;
  if (data.type === 'progress') {
    task.onProgress?.(data.progress);
    if (data.progress.row) log('position-result', data.progress.row);
    if (data.progress.game) log('completed-game', data.progress.game);
    if (data.progress.sample) log('controller-sample', data.progress.sample);
    return;
  }
  pending.delete(data.id); busy = false; activeId = null; updateControls();
  if (data.type === 'result') { log('result', { id: data.id }); task.resolve(data.result); }
  else {
    const progressId = { suite: 'suite-progress', matches: 'match-progress', calibrate: 'controller-progress' }[task.type];
    if (progressId) $(progressId).textContent = data.type === 'cancelled' ? 'Cancelled. Completed measurements are in the session log.' : `Stopped: ${data.error}`;
    task.reject(Object.assign(new Error(data.error || 'Run cancelled'), { name: data.type === 'cancelled' ? 'AbortError' : 'Error' }));
  }
};
worker.onerror = event => {
  ready = false; busy = false;
  $('model-status').textContent = 'Engine error';
  for (const task of pending.values()) task.reject(new Error(event.message || 'Engine worker failed'));
  pending.clear(); activeId = null; updateControls(); toast('The engine stopped unexpectedly. Reload the page to retry.', true);
};
async function cancelActive() {
  watchRunning = false;
  clearTimeout(autoMoveTimer); autoMoveTimer = null;
  if (!busy) return;
  const id = activeId;
  worker.postMessage({ type: 'cancel' });
  // Wait for the worker acknowledgement before accepting another request.
  await new Promise(resolve => {
    const timer = setInterval(() => { if (!pending.has(id)) { clearInterval(timer); resolve(); } }, 20);
  });
}
function handle(action) {
  return async event => {
    try { await action(event); }
    catch (error) { if (error.name === 'AbortError') toast('Run cancelled.'); else toast(error.message, true); }
    finally { updateControls(); }
  };
}
function bind(id, action, event = 'click') { $(id)?.addEventListener(event, handle(action)); }

function gameStatus() {
  if (startingGame) return 'Starting a new game…';
  if (game.isCheckmate()) return `Checkmate. ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
  if (game.isStalemate()) return 'Draw by stalemate.';
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (game.isDraw()) return 'Draw by the fifty-move rule.';
  if (battle?.current) return battleStatusLine();
  if (!ready) return $('side').value === game.turn()
    ? 'The engine is loading. You can select a piece and make your first move.'
    : 'The engine is loading. It will move automatically when ready.';
  if (gameNotice) return gameNotice;
  if ($('side').value === 'watch') return watchRunning
    ? `Watching both sides · ${game.turn() === 'w' ? 'White' : 'Black'} to move`
    : 'Watching is paused. Press Watch engines play to continue.';
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · check' : ''}`;
}
function humanCanMove() {
  return !startingGame && !busy && !battleRunning() && !game.isGameOver() && $('side')?.value !== 'watch' && $('side')?.value === game.turn();
}
function render() {
  const targets = selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : [];
  renderBoard($('board'), game.fen(), { orientation, selected, targets, lastMove, onSquareClick: handle(onSquare), disabled: !humanCanMove() });
  $('game-status').textContent = gameStatus();
  if ($('turn-label')) $('turn-label').textContent = game.turn() === 'w' ? 'WHITE TO MOVE' : 'BLACK TO MOVE';
  $('current-fen').textContent = game.fen();
  const topColor = orientation === 'w' ? 'b' : 'w';
  for (const [id, color] of [['top-player', topColor], ['bottom-player', topColor === 'w' ? 'b' : 'w']]) {
    if ($(id)?.firstChild?.nodeType === Node.TEXT_NODE) $(id).firstChild.nodeValue = color === 'w' ? 'WHITE' : 'BLACK';
    if ($(`${id}-detail`)) $(`${id}-detail`).textContent = battle?.current ? `${botById(battle.current[color]).name.toUpperCase()} · BATTLE` : $('side').value === color ? 'YOUR SIDE' : `${opponent().name.toUpperCase()} · ${modeNames[$('mode').value].toUpperCase()}`;
  }
  const history = game.history();
  $('move-list').innerHTML = history.length ? Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => `<div class="move-row"><span>${i + 1}.</span><span>${escape(history[i * 2])}</span><span>${escape(history[i * 2 + 1] || '')}</span></div>`).join('') : '<p class="empty-state">Your first move starts the experiment.</p>';
  $('move-list').scrollTop = $('move-list').scrollHeight;
  updateControls(false);
}
function renderBotProfile() {
  const bot = opponent(), rating = bot.rating;
  $('bot-name').textContent = bot.name;
  if ($('play-heading')) $('play-heading').textContent = `Play ${bot.name}.`;
  if ($('bot-generation')) $('bot-generation').textContent = generationLabel(bot);
  if ($('bot-rating-note')) $('bot-rating-note').textContent = bot.ratingNote;
  if ($('bot-report-link')) $('bot-report-link').href = `https://github.com/cory56626-art/THEBOBSBATH/blob/main/${bot.report}`;
  document.querySelector('.bot-profile')?.setAttribute('aria-label', `${bot.name} strength estimate`);
  $('bot-rating').textContent = `≈${rating.estimate}`;
  $('bot-rating-interval').textContent = formatInterval(rating);
  const mode = $('mode').value;
  const matches = mode === rating.mode && Number($('budget').value) === rating.budgetMs && Number($('node-limit').value) === rating.maxNodes;
  $('bot-rating-context').textContent = matches
    ? `Current settings match the measured test: Search · ${rating.budgetMs} ms · ${rating.maxNodes.toLocaleString('en-US')} positions.`
    : mode === 'direct'
      ? 'Direct mode is unrated. The estimate above belongs to the measured Search test.'
      : mode === 'selective'
        ? 'Selective mode is unrated. The estimate above belongs to the measured Search test.'
        : `These search limits are unmeasured. The estimate above is for ${rating.budgetMs} ms and ${rating.maxNodes.toLocaleString('en-US')} positions.`;
}
function updateControls(redraw = true) {
  renderBotProfile();
  for (const id of ['play-engine', 'compare-modes', 'run-suite', 'run-matches', 'train-controller', 'load-fen', 'load-pgn', 'reset-controller']) if ($(id)) $(id).disabled = !ready || busy || startingGame;
  if (ready && watchRunning && !startingGame && $('side')?.value === 'watch') $('play-engine').disabled = false;
  $('new-game').disabled = startingGame;
  $('new-game').setAttribute('aria-busy', String(startingGame));
  if ($('undo')) $('undo').disabled = !game.history().length;
  if ($('cancel-run')) $('cancel-run').disabled = !busy;
  if ($('stop-active')) { $('stop-active').hidden = !busy; $('stop-active').disabled = !busy; }
  for (const id of ['mode', 'budget', 'node-limit', 'side', 'controller-threshold', 'opponent']) if ($(id)) $(id).disabled = busy || startingGame || battleRunning();
  for (const id of ['battle-white', 'battle-black', 'battle-games', 'battle-budget']) if ($(id)) $(id).disabled = battleRunning() || startingGame;
  if ($('start-battle')) $('start-battle').disabled = !ready || busy || startingGame || battleRunning();
  if ($('stop-battle')) $('stop-battle').disabled = !battleRunning();
  if ($('export-battle')) $('export-battle').disabled = !battle?.games?.length;
  if ($('play-engine') && battleRunning()) $('play-engine').disabled = true;
  $('play-engine').textContent = $('side')?.value === 'watch' ? watchRunning ? 'Pause watching' : 'Watch engines play' : 'Let engine move';
  if ($('mode-description')) $('mode-description').textContent = {
    direct: 'One neural prediction. No tree search.', search: 'Neural move ordering with tactical search and capture analysis.', selective: 'A learned controller decides when to search. Untrained controllers always search.',
  }[$('mode')?.value || 'direct'];
  if (redraw && $('board')) renderBoard($('board'), game.fen(), { orientation, selected, targets: selected ? game.moves({ square: selected, verbose: true }).map(m => m.to) : [], lastMove, onSquareClick: handle(onSquare), disabled: !humanCanMove() });
}
function renderDecision(result) {
  latestDecision = result;
  $('metric-time').textContent = `${Math.round(result.elapsedMs)} ms`;
  $('metric-nodes').textContent = String(result.nodes);
  $('metric-confidence').textContent = `${Math.round(result.confidence * 100)}%`;
  $('metric-gate').textContent = result.mode === 'selective' ? result.searched ? 'Search' : 'Direct' : result.searched ? 'Always' : 'Off';
  if ($('decision-label')) $('decision-label').textContent = `${result.botId ? `${botById(result.botId).name} · ` : ''}${modeNames[result.mode]} chose ${result.san || '—'} · ${result.gate?.reason || ''}`;
}
function clearDecision() {
  latestDecision = null;
  for (const id of ['metric-time', 'metric-nodes', 'metric-confidence', 'metric-gate']) $(id).textContent = '—';
  $('decision-label').textContent = 'Waiting for the first engine move';
}
async function onSquare(square) {
  if (!humanCanMove()) return;
  if (selected) {
    const moves = game.moves({ square: selected, verbose: true }).filter(move => move.to === square);
    if (moves.length) {
      let promotion;
      if (moves.some(move => move.promotion)) promotion = await choosePromotion();
      if (promotion === null) return;
      const move = game.move({ from: selected, to: square, ...(promotion ? { promotion } : {}) });
      gameNotice = null;
      lastMove = [move.from, move.to]; selected = null; render(); await maybeAutoMove(); return;
    }
  }
  selected = game.get(square)?.color === game.turn() && selected !== square ? square : null;
  render();
}
function choosePromotion() {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'promotion-dialog';
    dialog.innerHTML = '<h2>Promote your pawn</h2><p>Choose the new piece.</p><div>' + [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']].map(([piece,name]) => `<button data-piece="${piece}">${name}</button>`).join('') + '</div><button data-piece="cancel">Cancel</button>';
    let finished = false;
    const finish = piece => { if (finished) return; finished = true; dialog.close(); dialog.remove(); resolve(piece); };
    dialog.addEventListener('click', event => { if (event.target.dataset.piece) finish(event.target.dataset.piece === 'cancel' ? null : event.target.dataset.piece); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    document.body.append(dialog); dialog.showModal();
  });
}
async function engineMove() {
  if (!ready || busy || startingGame || game.isGameOver()) return;
  const expectedEpoch = gameEpoch;
  const expectedFen = game.fen();
  const result = await request('choose', { ...settings(), mode: $('mode').value });
  if (gameEpoch !== expectedEpoch || game.fen() !== expectedFen || !result.move) return;
  const move = playUci(game, result.move);
  gameNotice = null;
  lastMove = [move.from, move.to]; selected = null;
  renderDecision(result); render();
  log('move', { ...result, fenBefore: expectedFen, fenAfter: game.fen() });
}
async function maybeAutoMove() {
  if (battleRunning()) return;
  if (!ready || busy || startingGame || game.isGameOver()) { if (game.isGameOver()) watchRunning = false; return; }
  const expectedEpoch = gameEpoch;
  const side = $('side')?.value || 'w';
  if ((side === 'watch' && watchRunning) || (side !== 'watch' && game.turn() !== side)) {
    try {
      await engineMove();
      if (watchRunning && expectedEpoch === gameEpoch && !startingGame) autoMoveTimer = setTimeout(() => handle(maybeAutoMove)(), 80);
    } catch (error) {
      if (expectedEpoch !== gameEpoch) return;
      watchRunning = false; if (error.name !== 'AbortError') toast(error.message, true);
    }
  }
}

async function startNewGame() {
  if (startingGame) return;
  startingGame = true;
  gameEpoch++;
  if (battle) { battle.running = false; battle.current = null; }
  const side = $('side').value;
  game = new Chess(); selected = null; lastMove = null;
  clearDecision(); activateTab('play');
  toast('Starting a new game…'); render();
  try { await cancelActive(); }
  finally { startingGame = false; }
  watchRunning = side === 'watch';
  const instruction = side === 'watch' ? 'Watching both sides.'
    : side === 'b' ? 'You’re Black. The engine plays White first.'
      : 'You’re White. Select a piece, then a highlighted square.';
  gameNotice = `New game started. ${instruction}`;
  toast(`${gameNotice}${ready ? '' : ' The engine is loading.'}`);
  render();
  if (side === 'w') $('board').querySelector('[data-square="e2"]')?.focus({ preventScroll: true });
  log('new-game', { gameId: gameEpoch, side, mode: $('mode').value });
  await maybeAutoMove();
}

// ---- Bot battle: any two released Gatos, each at its own rated position cap.
const BATTLE_MAX_PLIES = 400;
const seatName = (battleState, seat) => {
  const [a, b] = battleState.seats;
  const name = botById(battleState.seats[seat]).name;
  return a === b ? `${name} ${seat ? 'B' : 'A'}` : name;
};
function battleOutcome(board, plies) {
  if (board.isCheckmate()) return { result: board.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  if (board.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (board.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'threefold repetition' };
  if (board.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient material' };
  if (board.isDraw()) return { result: '1/2-1/2', termination: 'fifty-move rule' };
  if (plies >= BATTLE_MAX_PLIES) return { result: '*', termination: `unfinished at ${BATTLE_MAX_PLIES} plies` };
  return null;
}
function battlePoints(battleState) {
  const points = [0, 0];
  for (const row of battleState.games) {
    if (row.result === '1/2-1/2') { points[0] += .5; points[1] += .5; }
    else if (row.result === '1-0') points[row.whiteSeat]++;
    else if (row.result === '0-1') points[1 - row.whiteSeat]++;
  }
  return points;
}
const half = value => `${Math.floor(value)}${value % 1 ? '½' : ''}`.replace(/^0½$/, '½');
function battleStatusLine() {
  const current = battle.current;
  return `Battle game ${current.number} of ${battle.total} · ${botById(current.w).name} (White) vs ${botById(current.b).name} (Black) · ${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · check' : ''}`;
}
function renderBattle() {
  if (!battle) return;
  const points = battlePoints(battle);
  $('battle-score').hidden = false;
  $('battle-score').innerHTML = `<div class="battle-side"><span>${escape(battle.seats[0] === battle.seats[1] ? 'FIRST PICK' : 'PLAYER')}</span><strong>${escape(seatName(battle, 0))}</strong></div><div class="battle-points" aria-label="Score ${points[0]} to ${points[1]}">${half(points[0])} – ${half(points[1])}</div><div class="battle-side"><span>${escape(battle.seats[0] === battle.seats[1] ? 'SECOND PICK' : 'PLAYER')}</span><strong>${escape(seatName(battle, 1))}</strong></div>`;
  $('battle-results').innerHTML = battle.games.length ? table(['Game', 'White', 'Black', 'Result', 'How it ended', 'Moves'], battle.games.map(row => [row.number, seatName(battle, row.whiteSeat), seatName(battle, 1 - row.whiteSeat), row.result, row.termination, Math.ceil(row.plies / 2)])) : '';
  $('battle-status').textContent = battle.running && battle.current
    ? `Game ${battle.current.number} of ${battle.total} · move ${Math.floor(game.history().length / 2) + 1}`
    : battle.stopped ? `Stopped after ${battle.games.length} complete game${battle.games.length === 1 ? '' : 's'}.` : `Battle complete · ${battle.games.length} game${battle.games.length === 1 ? '' : 's'}.`;
}
async function runBattle() {
  if (battleRunning() || startingGame) return;
  await cancelActive();
  const seats = [$('battle-white').value, $('battle-black').value];
  const total = Number($('battle-games').value) || 1, budgetMs = Number($('battle-budget').value) || 150;
  battle = { running: true, stopped: false, seats, total, budgetMs, games: [], current: null };
  watchRunning = false; activateTab('battle');
  log('battle-start', { seats, total, budgetMs });
  const mine = battle;
  try {
  for (let index = 0; index < total && mine.running; index++) {
    const whiteSeat = index % 2;
    const current = { number: index + 1, whiteSeat, w: seats[whiteSeat], b: seats[1 - whiteSeat] };
    gameEpoch++;
    const epoch = gameEpoch;
    game = new Chess(); selected = null; lastMove = null; gameNotice = null; orientation = 'w';
    battle.current = current; clearDecision(); render(); renderBattle();
    let outcome = battleOutcome(game, 0);
    while (!outcome && mine.running && epoch === gameEpoch) {
      const botId = game.turn() === 'w' ? current.w : current.b, bot = botById(botId), fen = game.fen();
      const result = await request('choose', { mode: 'search', botId, budgetMs, maxNodes: bot.rating.maxNodes, gate });
      if (!mine.running || epoch !== gameEpoch || game.fen() !== fen || !result.move) break;
      const move = playUci(game, result.move);
      lastMove = [move.from, move.to];
      renderDecision(result); render(); renderBattle();
      log('battle-move', { game: current.number, botId, move: result.move, san: result.san, elapsedMs: result.elapsedMs, nodes: result.nodes, depth: result.depth ?? null });
      outcome = battleOutcome(game, game.history().length);
      if (!outcome) await new Promise(resolve => setTimeout(resolve, 120));
    }
    if (!outcome || epoch !== gameEpoch) break;
    game.header('Event', 'Gato bot battle', 'White', botById(current.w).name, 'Black', botById(current.b).name, 'Result', outcome.result, 'Termination', outcome.termination, 'TimeControl', `${budgetMs} ms per move`);
    battle.games.push({ number: current.number, whiteSeat, white: current.w, black: current.b, ...outcome, plies: game.history().length, pgn: game.pgn() });
    log('battle-game', battle.games.at(-1));
    renderBattle();
  }
  } catch (error) {
    // Stopping a battle cancels the in-flight move; that is not an error.
    if (error.name !== 'AbortError') throw error;
  } finally {
    if (!mine.running) mine.stopped = true;
    mine.running = false; mine.current = null;
    if (battle === mine) {
      renderBattle(); render();
      const points = battlePoints(mine);
      toast(`Battle ${mine.stopped ? 'stopped' : 'finished'}: ${seatName(mine, 0)} ${half(points[0])} – ${half(points[1])} ${seatName(mine, 1)}.`);
    }
  }
}
async function stopBattle() {
  if (!battleRunning()) return;
  battle.running = false;
  await cancelActive();
  renderBattle(); render();
}

function table(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderComparison(results) {
  $('comparison-results').innerHTML = table(['Mode','Move','Time','Tree visits','Neural calls','Decision'], results.map(row => [modeNames[row.mode], row.san || 'Game over', `${Math.round(row.elapsedMs)} ms`, row.nodes, row.inferenceCalls, row.mode === 'selective' ? row.gate.reason : row.searched ? 'Searched' : 'Direct']));
}
function renderGate() {
  const metrics = gate.metrics || gate.validation || {};
  $('controller-results').innerHTML = gate.trained ? `<p><strong>Trained controller loaded.</strong> It predicts whether reference search changes the policy move; this is not a probability of a blunder.</p><p class="muted">${escape(metrics.trainCount ?? '—')} training positions · ${escape(metrics.testCount ?? '—')} held-out positions · reference cap ${escape(gate.referenceSettings?.budgetMs ?? '—')} ms / ${escape(gate.referenceSettings?.maxNodes ?? '—')} nodes</p>${table(['Held-out measure','Result'], [['Prediction accuracy', `${Math.round((metrics.accuracy || 0) * 100)}%`], ['Brier error · lower is better', Number(metrics.brier || 0).toFixed(3)], ['Constant predictor Brier', Number(metrics.baselineBrier || 0).toFixed(3)], ['Missed reference changes', metrics.falseNegatives ?? '—']])}<p class="field-help">A small pilot sample measures this controller, not chess strength. Changing the search caps requires retraining. The threshold changes decisions; validation metrics above use 0.50.</p>` : '<p>No trained controller yet. Selective mode will search every move until training succeeds.</p>';
  if (gate.trained && metrics.brier > metrics.baselineBrier) $('controller-results').insertAdjacentHTML('beforeend', '<p class="warning">On this small holdout, the constant predictor scored better. Treat this controller as an experimental baseline.</p>');
}
function reportEnvelope(data) {
  return { experimentVersion: '0.1.0', engineVersion: ENGINE_VERSION, bot: BOT_PROFILE, createdAt: new Date().toISOString(), model: modelMetadata, environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory || null }, controller: gate, ...data };
}
function keepReport(result) {
  latestReport = reportEnvelope(result); reports.push(latestReport);
  if (reports.length > 20) reports.shift();
}
function renderSuite(result) {
  const rows = result.rows || [];
  $('benchmark-results').innerHTML = table(['Position','Mode','Move','Time','Tree visits','Expected move'], rows.map(row => [row.name || row.positionName || row.positionId || row.id, modeNames[row.mode] || row.mode, row.san || row.move || '—', `${Math.round(row.elapsedMs || 0)} ms`, row.nodes ?? 0, row.expectedMatch === undefined || row.expectedMatch === null ? 'Not scored' : row.expectedMatch ? 'Match' : 'Miss'])) + `<details><summary>Full summary and settings</summary><pre>${escape(JSON.stringify({ summary: result.summary, settings: result.settings }, null, 2))}</pre></details>`;
}
function renderMatches(result) {
  const games = result.games || [];
  $('match-results').innerHTML = table(['Game','White','Black','Result','Termination','Plies'], games.map((row,i) => [i+1, modeNames[row.whiteMode] || row.whiteMode, modeNames[row.blackMode] || row.blackMode, row.result || '*', row.status || 'Unfinished', row.plies ?? row.moves?.length ?? '—'])) + `<details open><summary>Standings</summary><pre>${escape(JSON.stringify(result.standings, null, 2))}</pre></details>`;
}
function progressText(id, data) {
  const text = `${data.phase || 'Running'}${data.total ? ` · ${data.completed || 0}/${data.total}` : ''}`;
  $(id).textContent = text;
}
function download(filename, content, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = value => `"${String(typeof value === 'object' && value !== null ? JSON.stringify(value) : value ?? '').replaceAll('"','""')}"`;
  return [keys.map(quote).join(','), ...rows.map(row => keys.map(key => quote(row[key])).join(','))].join('\r\n');
}

function activateTab(name) {
  for (const button of document.querySelectorAll('[data-tab]')) { const active = button.dataset.tab === name; button.setAttribute('aria-selected', String(active)); button.classList.toggle('active', active); }
  for (const panel of document.querySelectorAll('[id^="panel-"]')) panel.hidden = panel.id !== `panel-${name}`;
}
for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => activateTab(tab.dataset.tab));
bind('new-game', startNewGame);
bind('undo', async () => { await cancelActive(); game.undo(); if ($('side').value !== 'watch' && game.turn() !== $('side').value && game.history().length) game.undo(); selected = null; lastMove = null; render(); });
bind('flip', () => { orientation = orientation === 'w' ? 'b' : 'w'; render(); });
bind('side', async () => { await cancelActive(); gameNotice = null; orientation = $('side').value === 'b' ? 'b' : 'w'; selected = null; render(); await maybeAutoMove(); }, 'change');
bind('mode', () => render(), 'change');
bind('opponent', async () => { await cancelActive(); const bot = opponent(); $('node-limit').value = String(bot.rating.maxNodes); $('budget').value = String(bot.rating.budgetMs); gameNotice = null; render(); await maybeAutoMove(); }, 'change');
bind('start-battle', runBattle);
bind('stop-battle', stopBattle);
bind('export-battle', () => { if (!battle?.games?.length) throw new Error('Finish at least one battle game first.'); download('gato-battle.pgn', battle.games.map(row => row.pgn).join('\n\n') + '\n', 'application/x-chess-pgn'); });
for (const id of ['budget', 'node-limit']) bind(id, () => renderBotProfile(), 'change');
bind('play-engine', async () => { if (battleRunning()) return; if ($('side').value === 'watch') { if (watchRunning) { await cancelActive(); updateControls(); } else { watchRunning = true; await maybeAutoMove(); } } else { await engineMove(); await maybeAutoMove(); } });
bind('cancel-run', async () => { await cancelActive(); toast('Run cancelled.'); });
bind('stop-active', async () => { await cancelActive(); toast('Run cancelled.'); });
bind('load-fen', async () => { const next = new Chess($('fen-input').value.trim()); await cancelActive(); gameNotice = null; game = next; selected = null; lastMove = null; render(); toast('Position loaded.'); });
bind('copy-fen', async () => { await navigator.clipboard.writeText(game.fen()); toast('FEN copied.'); });
bind('load-pgn', async () => { const next = new Chess(); next.loadPgn($('pgn-input').value); await cancelActive(); gameNotice = null; game = next; selected = null; lastMove = null; render(); toast('PGN loaded with its move history.'); });
bind('export-pgn', () => download('intuition-game.pgn', game.pgn(), 'application/x-chess-pgn'));
bind('compare-modes', async () => { watchRunning = false; $('comparison-results').textContent = 'Comparing the same position with all three modes…'; const position = serializePosition(game); lastComparison = await request('compare', settings(), position); renderComparison(lastComparison); keepReport({ kind: 'comparison', position, settings: settings(), rows: lastComparison }); });
bind('run-suite', async () => { watchRunning = false; $('suite-progress').textContent = 'Starting position suite…'; const result = await request('suite', { ...settings(), suite: $('suite-select').value }, undefined, data => progressText('suite-progress',data)); renderSuite(result); keepReport(result); $('suite-progress').textContent = `Complete · ${result.rows?.length || 0} decisions recorded`; });
bind('run-matches', async () => { watchRunning = false; $('match-progress').textContent = 'Starting paired games…'; const result = await request('matches', { ...settings(), rounds: Number($('pair-rounds').value), maxPlies: Number($('max-plies').value) }, undefined, data => progressText('match-progress',data)); renderMatches(result); keepReport(result); $('match-progress').textContent = `Complete · ${result.games?.length || 0} games`; });
bind('train-controller', async () => { watchRunning = false; $('controller-progress').textContent = 'Collecting reference decisions…'; const result = await request('calibrate', settings(), undefined, data => progressText('controller-progress',data)); gate = result; try { localStorage.setItem('intuition-controller-v1', JSON.stringify(gate)); } catch { toast('Trained for this session. Browser storage is unavailable.'); } renderGate(); keepReport({ kind: 'calibration', controller: gate }); $('controller-progress').textContent = 'Training complete. Held-out metrics are shown below.'; });
bind('reset-controller', () => { gate = defaultGate; try { localStorage.removeItem('intuition-controller-v1'); } catch {} renderGate(); toast('Restored the shipped controller.'); });
bind('controller-threshold', () => { if ($('threshold-value')) $('threshold-value').textContent = Number($('controller-threshold').value).toFixed(2); }, 'input');
bind('export-json', () => { if (!latestReport) throw new Error('Run a comparison, benchmark, or calibration first.'); download('intuition-experiment.json', JSON.stringify(latestReport,null,2)); });
bind('export-csv', () => { if (!latestReport) throw new Error('Run a comparison or benchmark first.'); const rows = latestReport.rows || latestReport.games || latestReport.controller?.samples || []; if (!rows.length) throw new Error('This report has no tabular rows. Export JSON instead.'); download('intuition-results.csv', rowsToCSV(rows), 'text/csv'); });
bind('download-logs', () => download('intuition-session.json', JSON.stringify(reportEnvelope({ logs, reports, currentPosition: serializePosition(game), latestDecision }),null,2)));

// Keep a compact read-only diagnostic hook for reproducible browser checks.
window.__INTUITION__ = { get ready() { return ready; }, get busy() { return busy; }, get fen() { return game.fen(); }, get latestDecision() { return latestDecision; }, get latestReport() { return latestReport; }, get model() { return modelMetadata; }, get bot() { return BOT_PROFILE; }, get gameId() { return gameEpoch; }, get watchRunning() { return watchRunning; }, get battle() { return battle && { running: battle.running, seats: [...battle.seats], total: battle.total, games: battle.games.map(({ pgn, ...row }) => row), current: battle.current && { ...battle.current } }; }, get opponent() { return opponent().id; } };
const botOptions = selectedId => BOTS.map((bot, index) => `<option value="${bot.id}"${bot.id === selectedId ? ' selected' : ''}>${escape(bot.name)}${index === 0 ? ' · newest' : ''} · ≈${bot.rating.estimate}</option>`).join('');
$('opponent').innerHTML = botOptions(BOT_PROFILE.id);
$('battle-white').innerHTML = botOptions(BOTS[0].id);
$('battle-black').innerHTML = botOptions(BOTS[1]?.id || BOTS[0].id);
const suiteLabels = { smoke: 'Quick check · 3 positions', mixed: 'Mixed suite · 10 positions', tactics: 'Tactics · 6 positions', endgames: 'Endgames · 4 positions', openings: 'Openings · 4 positions' };
$('suite-select').innerHTML = Object.entries(suiteLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
$('metric-confidence').title = 'Raw policy preference, not a calibrated probability that this move is correct.';
document.addEventListener('keydown', event => { if (event.key === 'Escape' && busy) handle(cancelActive)(); });
render(); renderGate();
log('session-start', { version: '0.1.0', suites: Object.keys(BENCHMARK_SUITES) });
