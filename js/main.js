// Wiring: screens, controls, persistence, and the single animation loop that
// drives whichever screen is currently visible.

import { $, $$, el, clamp, fmt } from './util.js';
import { Designer } from './designer.js';
import { Lab, SPEEDS } from './lab.js';
import { Archive } from './archive.js';
import { PRESETS, randomBody } from './presets.js';
import { TRIAL_LIST, trialOf } from './trials.js';
import { drawBody } from './render.js';
import { Population } from './evolution.js';
import { Genome } from './genome.js';
import * as store from './storage.js';

const SPEED_LABEL = ['½×', '1×', '2×', '4×', '8×'];

const ui = {
  screen: 'design',
  creatureId: null,
};

/* ══════════════════ screens ══════════════════ */
function showScreen(name) {
  ui.screen = name;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.screen === name));
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === `screen-${name}`));
  requestAnimationFrame(() => { resizeAll(); if (name === 'archive') refreshArchive(); });
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showScreen(t.dataset.screen)));

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ══════════════════ designer ══════════════════ */
const designer = new Designer($('#designCanvas'), { onChange: onDesignChange });

function onDesignChange(stats) {
  $('#designStat').textContent = `${stats.nodes} nodes · ${stats.muscles} muscles · ${stats.bones} bones`;
  const n = designer.selNode >= 0 ? designer.body.nodes[designer.selNode] : null;
  const l = designer.selLink >= 0 ? designer.body.links[designer.selLink] : null;
  $('#nodeSel').textContent = n ? `#${designer.selNode + 1}` : 'defaults';
  const src = n || designer.defaults;
  $('#grip').value = src.friction; $('#gripOut').textContent = src.friction.toFixed(2);
  $('#size').value = src.r; $('#sizeOut').textContent = src.r.toFixed(0);
  $('#mass').value = src.mass; $('#massOut').textContent = src.mass.toFixed(1);
  $('#linkProps').hidden = !l;
  if (l) {
    $('#linkSel').textContent = `#${designer.selLink + 1} · ${l.kind}`;
    $('#amp').value = l.amp; $('#ampOut').textContent = l.amp.toFixed(2);
    $('#toggleKind').textContent = l.kind === 'bone' ? 'Turn into a muscle' : 'Turn into a bone';
  }
  $('#toEvolveBtn').disabled = !stats.valid;
}

$$('#tools .tool').forEach((b) => b.addEventListener('click', () => {
  $$('#tools .tool').forEach((x) => x.classList.toggle('is-active', x === b));
  designer.tool = b.dataset.tool;
  designer.linkFrom = -1;
  const hints = {
    node: 'Click empty space to place a node. Drag an existing node to move it.',
    link: 'Click one node, then another, to join them. Muscles contract; bones never change length.',
    move: 'Drag nodes to reshape the body. Drag the background to pan; scroll to zoom.',
    erase: 'Click a node or a link to delete it.',
  };
  $('#designHint').innerHTML = hints[designer.tool];
}));

$('#symmetry').addEventListener('change', (e) => { designer.symmetry = e.target.checked; });
$('#linkKind').addEventListener('change', (e) => { designer.boneMode = e.target.checked; });
$('#grip').addEventListener('input', (e) => { $('#gripOut').textContent = (+e.target.value).toFixed(2); designer.patchNode({ friction: +e.target.value }); });
$('#size').addEventListener('input', (e) => { $('#sizeOut').textContent = (+e.target.value).toFixed(0); designer.patchNode({ r: +e.target.value }); });
$('#mass').addEventListener('input', (e) => { $('#massOut').textContent = (+e.target.value).toFixed(1); designer.patchNode({ mass: +e.target.value }); });
$('#amp').addEventListener('input', (e) => { $('#ampOut').textContent = (+e.target.value).toFixed(2); designer.patchLink({ amp: +e.target.value }); });
$('#toggleKind').addEventListener('click', () => {
  const l = designer.body.links[designer.selLink];
  if (l) { designer.patchLink({ kind: l.kind === 'bone' ? 'muscle' : 'bone' }); onDesignChange(designer.stats()); }
});

$('#twitchBtn').addEventListener('click', () => {
  if (designer.preview) { designer.stopTwitch(); return; }
  if (!designer.twitch()) toast('Needs at least 2 nodes and 1 muscle');
});
$('#randomBtn').addEventListener('click', () => {
  designer.setBody(randomBody(Math.random));
  $('#nameInput').value = randomName();
  ui.creatureId = null;
  $('#designHint').textContent = 'A body nobody designed on purpose. Twitch it, then send it to evolve.';
});
$('#clearBtn').addEventListener('click', () => { designer.clear(); designer.fit(); });

const SYLL_A = ['Wob', 'Skit', 'Gru', 'Thra', 'Mor', 'Vex', 'Bly', 'Zan', 'Kre', 'Pol', 'Nid', 'Orb'];
const SYLL_B = ['bler', 'ling', 'nak', 'dorf', 'ix', 'top', 'mus', 'gan', 'wick', 'oid', 'ant', 'ur'];
const randomName = () =>
  SYLL_A[(Math.random() * SYLL_A.length) | 0] + SYLL_B[(Math.random() * SYLL_B.length) | 0];

/* ── library + presets ── */
function thumb(body) {
  const c = document.createElement('canvas');
  c.width = 92; c.height = 68;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1219';
  ctx.fillRect(0, 0, 92, 68);
  drawBody(ctx, { x: 0, y: 0, w: 92, h: 68 }, body, { pad: 8, maxZoom: 0.7 });
  return c;
}

function renderPresets() {
  const list = $('#presetList');
  list.textContent = '';
  for (const p of PRESETS) {
    const card = el('button', { class: 'card', type: 'button', title: p.hint }, [
      thumb(p.body),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'card-title', text: p.name }),
        el('div', { class: 'card-sub', text: `${p.body.nodes.length} nodes · ${p.body.links.length} links` }),
      ]),
    ]);
    card.addEventListener('click', () => {
      designer.setBody(p.body);
      $('#nameInput').value = p.name;
      ui.creatureId = null;
      $('#designHint').textContent = p.hint;
    });
    list.append(card);
  }
}

function renderLibrary() {
  const list = $('#libraryList');
  list.textContent = '';
  const items = store.creatures();
  if (!items.length) {
    list.append(el('p', { class: 'hint', text: 'Nothing saved yet. Build something and press Save.' }));
    return;
  }
  for (const c of items) {
    const card = el('div', { class: 'card' }, [
      thumb(c.body),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'card-title', text: c.name }),
        el('div', { class: 'card-sub', text: c.note || `${c.body.nodes.length} nodes` }),
      ]),
    ]);
    card.addEventListener('click', () => {
      designer.setBody(c.body);
      $('#nameInput').value = c.name;
      ui.creatureId = c.id;
    });
    const x = el('button', { class: 'card-x', type: 'button', title: 'Delete', text: '✕' });
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      store.deleteCreature(c.id);
      renderLibrary();
    });
    card.append(x);
    list.append(card);
  }
}

$('#saveBtn').addEventListener('click', () => {
  const stats = designer.stats();
  if (!stats.nodes) return toast('Nothing to save');
  const name = ($('#nameInput').value || 'Unnamed').trim();
  ui.creatureId = ui.creatureId || store.uid();
  store.saveCreature({ id: ui.creatureId, name, body: designer.getBody(), note: `${stats.nodes} nodes · ${stats.muscles} muscles` });
  renderLibrary();
  toast(`Saved “${name}”`);
});

$('#exportBtn').addEventListener('click', () => {
  const name = ($('#nameInput').value || 'creature').trim();
  store.download(`${name.toLowerCase().replace(/\s+/g, '-')}.primordia.json`, {
    kind: 'creature', name, body: designer.getBody(),
  });
});

$('#importBtn').addEventListener('click', async () => {
  try {
    const data = await store.uploadJSON();
    if (data.kind === 'run' && data.pop) {
      const pop = Population.fromJSON(data.pop);
      lab.adopt(pop, data.name || 'Imported');
      designer.setBody(pop.blueprint);
      $('#nameInput').value = data.name || 'Imported';
      showScreen('evolve');
      toast(`Loaded run at generation ${pop.generation}`);
      return;
    }
    const body = data.body || data;
    if (!body.nodes?.length) throw new Error('no body');
    designer.setBody(body);
    $('#nameInput').value = data.name || 'Imported';
    ui.creatureId = null;
    toast('Imported');
  } catch (err) {
    toast('Could not read that file');
  }
});

$('#toEvolveBtn').addEventListener('click', () => {
  if (!designer.stats().valid) return toast('Needs at least 2 nodes and 1 muscle');
  startRun();
});

/* ══════════════════ evolution lab ══════════════════ */
const lab = new Lab($('#arenaCanvas'), { on: onLabEvent });
const archive = new Archive($('#replayCanvas'));

const trialSel = $('#trialSel');
for (const t of TRIAL_LIST) {
  trialSel.append(el('option', { value: t.id, text: `${t.glyph}  ${t.name}` }));
}
trialSel.value = 'plains';

function cfgFromUI() {
  return {
    size: +$('#popSize').value,
    trial: trialSel.value,
    rate: +$('#mutRate').value,
    morph: +$('#morph').value,
  };
}

function startRun() {
  const name = ($('#nameInput').value || 'Creature').trim();
  lab.arenaCount = +$('#arenaCount').value;
  lab.speed = +$('#speed').value;
  lab.start(designer.getBody(), name, cfgFromUI());
  lab.running = true;
  $('#arenaEmpty').hidden = true;
  showScreen('evolve');
  updatePlayBtn();
  toast(`${name}: generation 1 — nobody knows how to move yet`);
}

$('#playBtn').addEventListener('click', () => {
  if (!lab.pop) {
    if (!designer.stats().valid) { showScreen('design'); return toast('Design a creature first'); }
    startRun();
    return;
  }
  lab.running = !lab.running;
  updatePlayBtn();
});

function updatePlayBtn() {
  const b = $('#playBtn');
  if (!lab.pop) { b.textContent = '▶ Start'; return; }
  b.textContent = lab.running ? '⏸ Pause' : '▶ Resume';
}

$('#skipBtn').addEventListener('click', () => { if (lab.pop) lab.skipGeneration(); });
$('#resetBtn').addEventListener('click', () => {
  if (!lab.blueprint) return;
  lab.start(lab.blueprint, lab.speciesName, cfgFromUI());
  lab.running = true;
  updatePlayBtn();
  toast('Population reset — brains wiped');
});

$('#turboBtn').addEventListener('click', () => {
  if (!lab.pop) return toast('Nothing running');
  if (lab.turbo) lab.exitTurbo(); else lab.enterTurbo();
  $('#turboOverlay').hidden = !lab.turbo;
  updatePlayBtn();
});
$('#turboStop').addEventListener('click', () => {
  lab.exitTurbo();
  $('#turboOverlay').hidden = true;
});

$('#popSize').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('#popOut').textContent = v;
  const arena = $('#arenaCount');
  arena.max = Math.min(36, v);
  if (+arena.value > +arena.max) { arena.value = arena.max; $('#arenaOut').textContent = arena.value; lab.setArenaCount(+arena.value); }
  if (lab.pop) lab.setPopSize(v);
});
$('#arenaCount').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('#arenaOut').textContent = v;
  lab.setArenaCount(v);
});
$('#speed').addEventListener('input', (e) => {
  lab.speed = +e.target.value;
  $('#speedOut').textContent = SPEED_LABEL[lab.speed];
});
$('#mutRate').addEventListener('input', (e) => {
  $('#mutOut').textContent = (+e.target.value).toFixed(2);
  lab.setMutation(+e.target.value);
});
$('#morph').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('#morphOut').textContent = v === 0 ? 'off' : v.toFixed(1);
  lab.setMorph(v);
});
trialSel.addEventListener('change', () => {
  if (!lab.pop) return;
  lab.setTrial(trialSel.value);
  toast(`Environment shifted to ${trialOf(trialSel.value).name} — brains carried over`);
});

$('#saveChampBtn').addEventListener('click', () => {
  if (!lab.pop?.best) return toast('No champion yet');
  const best = lab.pop.best;
  const name = `${lab.speciesName} gen ${best.gen}`;
  store.saveCreature({
    id: store.uid(), name,
    body: best.genome.body,
    note: `${lab.trial.name} · ${best.fitness.toFixed(2)}${lab.trial.unit === 'm' ? 'm' : ''}`,
  });
  store.recordHall({
    name: lab.speciesName, trial: lab.trial.id, trialName: lab.trial.name,
    gen: best.gen, fitness: best.fitness, unit: lab.trial.unit,
    genome: best.genome.toJSON(),
  });
  renderLibrary();
  renderHall();
  toast(`“${name}” saved to your library and the hall of fame`);
});

$('#exportRunBtn').addEventListener('click', () => {
  if (!lab.pop) return toast('Nothing running');
  store.download(`${lab.speciesName.toLowerCase().replace(/\s+/g, '-')}-gen${lab.pop.generation}.primordia.json`, {
    kind: 'run', name: lab.speciesName, pop: lab.pop.toJSON(),
  });
});

function onLabEvent(ev) {
  if (ev.type === 'state') renderStats(ev.state);
  if (ev.type === 'generation') {
    renderStats(lab.snapshot());
    maybeAutosave();
  }
}

function renderStats(s) {
  if (!s) return;
  $('#runName').textContent = s.name;
  $('#statGen').textContent = s.generation;
  const u = s.unit === 'm' ? 'm' : '';
  $('#statBest').textContent = s.best ? s.best.fitness.toFixed(2) + u : '—';
  const stale = s.genStale ? '~' : '';
  $('#statGenBest').textContent = s.genBest === null ? '—' : stale + s.genBest.toFixed(2) + u;
  $('#statAvg').textContent = s.genAvg === null ? '—' : stale + s.genAvg.toFixed(2) + u;
  $('#statEval').textContent = s.evaluated;
  $('#statStag').textContent = s.stagnant;
  $('#turboGen').textContent = `gen ${s.generation}`;
  $('#turboBest').textContent = s.best ? `best ${s.best.fitness.toFixed(2)}${u} at gen ${s.best.gen}` : 'best —';

  const lb = $('#leaderboard');
  lb.textContent = '';
  s.rows.forEach((r, rank) => {
    const li = el('li', { class: [r.elite ? 'is-elite' : '', r.live ? 'is-live' : '', r.fitness === null ? 'pending' : ''].join(' ').trim() }, [
      el('span', { class: 'lb-rank', text: r.fitness === null ? '·' : String(rank + 1) }),
      el('span', { class: 'lb-name', text: r.name }),
      el('span', { class: 'lb-score', text: r.fitness === null ? (r.live ? 'live' : 'queued') : r.fitness.toFixed(2) }),
    ]);
    li.addEventListener('click', () => {
      const slot = lab.slots.findIndex((sl) => sl && sl.idx === r.i);
      if (slot >= 0) { lab.selected = slot; }
    });
    lb.append(li);
  });
}

/* ══════════════════ archive ══════════════════ */
function refreshArchive() {
  archive.setSource(lab.pop, lab.speciesName);
  const n = archive.count;
  const a = $('#genA'), b = $('#genB');
  $('#archiveEmpty').hidden = n > 0;
  $('#archName').textContent = n ? lab.speciesName : '—';
  a.max = b.max = Math.max(0, n - 1);
  if (n) {
    if (+a.value > n - 1) a.value = 0;
    if (+b.value > n - 1) b.value = n - 1;
    if (+b.value === 0 && n > 1) b.value = n - 1;
    loadLane(0, +a.value);
    loadLane(1, +b.value);
  }
  renderHall();
}

function loadLane(lane, i) {
  const rec = archive.setLane(lane, i);
  const out = lane === 0 ? $('#genAOut') : $('#genBOut');
  out.textContent = rec ? rec.gen : '—';
}

$('#genA').addEventListener('input', (e) => { loadLane(0, +e.target.value); archive.playing = false; });
$('#genB').addEventListener('input', (e) => { loadLane(1, +e.target.value); archive.playing = false; });
$('#replayBtn').addEventListener('click', () => {
  if (!archive.count) return toast('Run some generations first');
  archive.play();
});
$('#latestBtn').addEventListener('click', () => {
  if (!archive.count) return toast('Run some generations first');
  $('#genA').value = 0;
  $('#genB').value = archive.count - 1;
  loadLane(0, 0);
  loadLane(1, archive.count - 1);
  archive.play();
});

function renderHall() {
  const list = $('#hallList');
  list.textContent = '';
  const items = store.hall();
  if (!items.length) {
    list.append(el('p', { class: 'hint', text: 'Press “Save champion” on the Evolve tab to enshrine a record here.' }));
    return;
  }
  items.forEach((h, i) => {
    list.append(el('li', {}, [
      el('span', { class: 'lb-rank', text: String(i + 1) }),
      el('span', { class: 'lb-name', text: `${h.name} · ${h.trialName ?? h.trial}` }),
      el('span', { class: 'lb-score', text: h.fitness.toFixed(2) + (h.unit === 'm' ? 'm' : '') }),
    ]));
  });
}

/* ══════════════════ autosave ══════════════════ */
let lastSave = -Infinity; // first generation of a run saves immediately
function maybeAutosave(force = false) {
  const now = performance.now();
  if (!lab.pop || (!force && now - lastSave < 20000)) return;
  lastSave = now;
  try {
    store.saveRun({ name: lab.speciesName, pop: lab.pop.toJSON() });
  } catch { /* over quota: keep running, just do not persist */ }
}
// Both, because visibilitychange is the reliable one on mobile and pagehide
// is the one that fires on a desktop reload.
window.addEventListener('visibilitychange', () => { if (document.hidden) maybeAutosave(true); });
window.addEventListener('pagehide', () => maybeAutosave(true));

/* ══════════════════ loop ══════════════════ */
function resizeAll() {
  designer.resize();
  lab.resize();
  archive.resize();
  const chart = $('#chartCanvas'), lin = $('#lineageCanvas');
  for (const c of [chart, lin]) {
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c._rect = { x: 0, y: 0, w: r.width, h: r.height };
  }
}
window.addEventListener('resize', resizeAll);

let clock = 0;
function frame() {
  requestAnimationFrame(frame);
  clock++;
  if (ui.screen === 'design') {
    designer.tick(2);
    return;
  }
  if (ui.screen === 'evolve') {
    if (lab.turbo) {
      lab.turboTick(24);
      if (clock % 12 === 0) renderStats(lab.snapshot());
    } else {
      lab.tick();
      lab.draw();
      $('#arenaEmpty').hidden = !!lab.pop;
      if (clock % 20 === 0) renderStats(lab.snapshot());
    }
    if (clock % 30 === 0 && lab.pop) {
      const c = $('#chartCanvas');
      lab.drawChartInto(c.getContext('2d'), c._rect || { x: 0, y: 0, w: c.width, h: c.height });
    }
    return;
  }
  if (ui.screen === 'archive') {
    archive.tick(SPEEDS[Math.max(1, +$('#speed').value)] ?? 1);
    archive.draw();
    if (clock % 30 === 0) {
      const c = $('#lineageCanvas');
      archive.drawLineage(c.getContext('2d'), c._rect || { x: 0, y: 0, w: c.width, h: c.height });
    }
  }
}

/* ══════════════════ boot ══════════════════ */
$('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ' && ui.screen === 'evolve') { e.preventDefault(); $('#playBtn').click(); }
  if (e.key === '1') showScreen('design');
  if (e.key === '2') showScreen('evolve');
  if (e.key === '3') showScreen('archive');
});

function boot() {
  renderPresets();
  renderLibrary();
  renderHall();
  resizeAll();

  const saved = store.settings();
  const start = PRESETS[0];
  designer.setBody(start.body);
  $('#nameInput').value = saved.lastName || 'Wobbler';
  $('#designHint').textContent = start.hint;

  const run = store.loadRun();
  if (run?.pop) {
    try {
      lab.adopt(Population.fromJSON(run.pop), run.name);
      trialSel.value = lab.trial.id;
      $('#popSize').value = lab.pop.cfg.size;
      $('#popOut').textContent = lab.pop.cfg.size;
      $('#mutRate').value = lab.pop.cfg.rate;
      $('#mutOut').textContent = lab.pop.cfg.rate.toFixed(2);
      $('#morph').value = lab.pop.cfg.morph;
      $('#morphOut').textContent = lab.pop.cfg.morph === 0 ? 'off' : lab.pop.cfg.morph.toFixed(1);
      lab.setArenaCount(+$('#arenaCount').value);
      updatePlayBtn();
      toast(`Restored ${run.name} at generation ${lab.pop.generation}`);
    } catch { store.clearRun(); }
  }

  $('#nameInput').addEventListener('change', () => store.setSettings({ lastName: $('#nameInput').value }));
  requestAnimationFrame(frame);
}

boot();
