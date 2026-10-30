import { Chess } from 'chess.js';
import { renderBoard } from './board.js';
import { serializePosition, playUci } from './engine.js';
import { BENCHMARK_SUITES, rowsToCSV } from './benchmark.js';
import defaultGate from './default-controller.json';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const modeNames = { direct: 'Direct policy', search: 'Always search', selective: 'Selective thinking' };
let game = new Chess(), orientation = 'w', selected = null, lastMove = null, modelMetadata = null;
let ready = false, busy = false, activeId = null, watchRunning = false, latestDecision = null;
let latestReport = null, lastComparison = [], gate = defaultGate;
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
function settings() {
  return { budgetMs: Number($('budget')?.value || 500), maxNodes: Number($('node-limit')?.value || 128), gate, threshold: Number($('controller-threshold')?.value || 0.5) };
}
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
    renderGate(); updateControls(); maybeAutoMove(); return;
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
  if (game.isCheckmate()) return `Checkmate. ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
  if (game.isStalemate()) return 'Draw by stalemate.';
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (game.isDraw()) return 'Draw by the fifty-move rule.';
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · check' : ''}`;
}
function humanCanMove() {
  return ready && !busy && !game.isGameOver() && $('side')?.value !== 'watch' && $('side')?.value === game.turn();
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
    if ($(`${id}-detail`)) $(`${id}-detail`).textContent = $('side').value === color ? 'YOUR SIDE' : modeNames[$('mode').value].toUpperCase();
  }
  const history = game.history();
  $('move-list').innerHTML = history.length ? Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => `<div class="move-row"><span>${i + 1}.</span><span>${escape(history[i * 2])}</span><span>${escape(history[i * 2 + 1] || '')}</span></div>`).join('') : '<p class="empty-state">Your first move starts the experiment.</p>';
  $('move-list').scrollTop = $('move-list').scrollHeight;
  updateControls(false);
}
function updateControls(redraw = true) {
  for (const id of ['play-engine', 'compare-modes', 'run-suite', 'run-matches', 'train-controller', 'load-fen', 'load-pgn', 'reset-controller']) if ($(id)) $(id).disabled = !ready || busy;
  if (watchRunning && $('side')?.value === 'watch') $('play-engine').disabled = false;
  if ($('undo')) $('undo').disabled = !game.history().length;
  if ($('cancel-run')) $('cancel-run').disabled = !busy;
  if ($('stop-active')) { $('stop-active').hidden = !busy; $('stop-active').disabled = !busy; }
  for (const id of ['mode', 'budget', 'node-limit', 'side', 'controller-threshold']) if ($(id)) $(id).disabled = busy;
  $('play-engine').textContent = $('side')?.value === 'watch' ? watchRunning ? 'Pause watching' : 'Watch engines play' : 'Let engine move';
  if ($('mode-description')) $('mode-description').textContent = {
    direct: 'One neural prediction. No tree search.', search: 'The same neural model guides a budgeted tree search.', selective: 'A learned controller decides when to search. Untrained controllers always search.',
  }[$('mode')?.value || 'direct'];
  if (redraw && $('board')) renderBoard($('board'), game.fen(), { orientation, selected, targets: selected ? game.moves({ square: selected, verbose: true }).map(m => m.to) : [], lastMove, onSquareClick: handle(onSquare), disabled: !humanCanMove() });
}
function renderDecision(result) {
  latestDecision = result;
  $('metric-time').textContent = `${Math.round(result.elapsedMs)} ms`;
  $('metric-nodes').textContent = String(result.nodes);
  $('metric-confidence').textContent = `${Math.round(result.confidence * 100)}%`;
  $('metric-gate').textContent = result.mode === 'selective' ? result.searched ? 'Search' : 'Direct' : result.searched ? 'Always' : 'Off';
  if ($('decision-label')) $('decision-label').textContent = `${modeNames[result.mode]} chose ${result.san || '—'} · ${result.gate?.reason || ''}`;
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
  if (!ready || busy || game.isGameOver()) return;
  const expectedFen = game.fen();
  const result = await request('choose', { ...settings(), mode: $('mode').value });
  if (game.fen() !== expectedFen || !result.move) return;
  const move = playUci(game, result.move);
  lastMove = [move.from, move.to]; selected = null;
  renderDecision(result); render();
  log('move', { ...result, fenBefore: expectedFen, fenAfter: game.fen() });
}
async function maybeAutoMove() {
  if (!ready || busy || game.isGameOver()) { if (game.isGameOver()) watchRunning = false; return; }
  const side = $('side')?.value || 'w';
  if ((side === 'watch' && watchRunning) || (side !== 'watch' && game.turn() !== side)) {
    try { await engineMove(); if (watchRunning) setTimeout(() => handle(maybeAutoMove)(), 80); }
    catch (error) { watchRunning = false; if (error.name !== 'AbortError') toast(error.message, true); }
  }
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
  return { experimentVersion: '0.1.0', engineVersion: 'intuition-mcts-1', createdAt: new Date().toISOString(), model: modelMetadata, environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory || null }, controller: gate, ...data };
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

for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => {
  for (const button of document.querySelectorAll('[data-tab]')) { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.classList.toggle('active', active); }
  for (const panel of document.querySelectorAll('[id^="panel-"]')) panel.hidden = panel.id !== `panel-${tab.dataset.tab}`;
});
bind('new-game', async () => { await cancelActive(); game = new Chess(); lastMove = null; selected = null; render(); await maybeAutoMove(); });
bind('undo', async () => { await cancelActive(); game.undo(); if ($('side').value !== 'watch' && game.turn() !== $('side').value && game.history().length) game.undo(); selected = null; lastMove = null; render(); });
bind('flip', () => { orientation = orientation === 'w' ? 'b' : 'w'; render(); });
bind('side', async () => { await cancelActive(); orientation = $('side').value === 'b' ? 'b' : 'w'; selected = null; render(); await maybeAutoMove(); }, 'change');
bind('mode', () => render(), 'change');
bind('play-engine', async () => { if ($('side').value === 'watch') { if (watchRunning) { await cancelActive(); updateControls(); } else { watchRunning = true; await maybeAutoMove(); } } else { await engineMove(); await maybeAutoMove(); } });
bind('cancel-run', async () => { await cancelActive(); toast('Run cancelled.'); });
bind('stop-active', async () => { await cancelActive(); toast('Run cancelled.'); });
bind('load-fen', async () => { const next = new Chess($('fen-input').value.trim()); await cancelActive(); game = next; selected = null; lastMove = null; render(); toast('Position loaded.'); });
bind('copy-fen', async () => { await navigator.clipboard.writeText(game.fen()); toast('FEN copied.'); });
bind('load-pgn', async () => { const next = new Chess(); next.loadPgn($('pgn-input').value); await cancelActive(); game = next; selected = null; lastMove = null; render(); toast('PGN loaded with its move history.'); });
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
window.__INTUITION__ = { get ready() { return ready; }, get busy() { return busy; }, get fen() { return game.fen(); }, get latestDecision() { return latestDecision; }, get latestReport() { return latestReport; }, get model() { return modelMetadata; } };
const suiteLabels = { smoke: 'Quick check · 3 positions', mixed: 'Mixed suite · 10 positions', tactics: 'Tactics · 6 positions', endgames: 'Endgames · 4 positions', openings: 'Openings · 4 positions' };
$('suite-select').innerHTML = Object.entries(suiteLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
$('metric-confidence').title = 'Raw policy preference, not a calibrated probability that this move is correct.';
document.addEventListener('keydown', event => { if (event.key === 'Escape' && busy) handle(cancelActive)(); });
render(); renderGate();
log('session-start', { version: '0.1.0', suites: Object.keys(BENCHMARK_SUITES) });
