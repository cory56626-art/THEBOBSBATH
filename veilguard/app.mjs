import { MODES, TOWERS, levelFromXp, xpForLevel } from './data.mjs';
import { Battle, nearestTile, towerStats } from './sim.mjs';
import { WorldView } from './view.mjs?v=3';

const $ = id => document.getElementById(id);
const icons = { spark: '✦', prism: '◇', frost: '❄', relay: '◈', mortar: '✶', aegis: '⬡' };
const modeIcons = { ember: '✧', tempest: '⌁', eclipse: '◈' };
const defaults = { coins: 0, xp: 0, victories: 0, unlocks: ['spark', 'prism', 'frost', 'relay'], loadout: ['spark', 'prism', 'frost', 'relay'], mode: 'ember' };

function loadProfile() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('veilguard-save-v1')) || {}; } catch { /* Storage can be unavailable. */ }
  const unlocks = [...new Set([...defaults.unlocks, ...(Array.isArray(saved.unlocks) ? saved.unlocks : [])])].filter(t => TOWERS[t]);
  const loadout = [...new Set(Array.isArray(saved.loadout) ? saved.loadout : defaults.loadout)].filter(t => unlocks.includes(t)).slice(0, 4);
  return { coins: Math.max(0, Number(saved.coins) || 0), xp: Math.max(0, Number(saved.xp) || 0),
    victories: Math.max(0, Number(saved.victories) || 0), unlocks,
    loadout: loadout.length ? loadout : [...defaults.loadout], mode: MODES[saved.mode] ? saved.mode : 'ember' };
}
const profile = loadProfile();
function saveProfile() { try { localStorage.setItem('veilguard-save-v1', JSON.stringify(profile)); } catch { /* Private browsing remains playable. */ } }

let view;
let battle = null;
let selectedType = null;
let selectedId = null;
let paused = false;
let speed = 1;
let accumulator = 0;
let lastFrame = performance.now();
let lastHud = 0;
let toasted;
let guideReturn = 'menu';
let guideWasPaused = false;
let shopRenderKey = null;
let waveRenderKey = null;
let inspectorRenderKey = null;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toasted);
  toasted = setTimeout(() => $('toast').classList.remove('show'), 2600);
}

function renderMenu() {
  $('modes').innerHTML = Object.entries(MODES).map(([id, mode]) => `
    <button class="mode-card ${profile.mode === id ? 'selected' : ''}" data-mode="${id}" aria-pressed="${profile.mode === id}" style="--accent:${mode.color}">
      <span class="mode-sigil">${modeIcons[id]}</span><span class="mode-copy"><strong>${mode.name}</strong><small>${mode.subtitle}</small></span>
      <span class="mode-waves">${mode.waves} WAVES<br>×${mode.reward} REWARD</span>
    </button>`).join('');
  $('loadout').innerHTML = Object.entries(TOWERS).map(([id, tower]) => {
    const unlocked = profile.unlocks.includes(id), equipped = profile.loadout.includes(id);
    return `<button class="loadout-item ${equipped ? 'equipped' : ''} ${unlocked ? '' : 'locked'}" data-tower="${id}" aria-label="${unlocked ? `${equipped ? 'Unequip' : 'Equip'} ${tower.name}` : `Unlock ${tower.name} for ${tower.unlock} coins`}" aria-pressed="${equipped}" title="${tower.description}" style="--accent:${tower.color}">
      <span class="tower-icon">${icons[id]}</span><span class="tower-text"><strong>${tower.name}</strong><small>${unlocked ? tower.role : `${tower.unlock} coins to unlock`}</small></span><span class="loadout-badge">${unlocked ? (equipped ? '✓' : '+') : '◆'}</span>
    </button>`;
  }).join('');
  $('loadout-count').textContent = `${profile.loadout.length} / 4`;
  const level = levelFromXp(profile.xp), current = xpForLevel(level), next = xpForLevel(level + 1);
  $('profile').innerHTML = `<div class="profile-row"><strong>Defender level ${level}</strong><span class="coin">◆ ${Math.floor(profile.coins)} COINS</span></div>
    <div class="xp-track"><i style="width:${Math.max(0, Math.min(100, (profile.xp - current) / (next - current) * 100))}%"></i></div>
    <div class="profile-note">${Math.floor(profile.xp)} / ${next} EXP to level ${level + 1} · ${profile.victories} completed campaigns<br>Coins and EXP persist on this device.</div>`;
}

function resetWorldView() {
  for (const id of [...view.towerMeshes.keys()]) view.removeTower(id);
  for (const id of [...view.enemyMeshes.keys()]) view.removeEnemy(id);
  for (const shot of view.projectiles) view.scene.remove(shot.mesh);
  for (const flash of view.flashes) view.scene.remove(flash.mesh);
  view.projectiles.length = 0;
  view.flashes.length = 0;
  view.setGhost(null);
  view.setRange(0, 0, 1, false);
}

function startBattle() {
  resetWorldView();
  battle = new Battle(profile.mode, profile.loadout);
  selectedType = null;
  selectedId = null;
  paused = false;
  speed = 1;
  accumulator = 0;
  shopRenderKey = waveRenderKey = inspectorRenderKey = null;
  $('menu').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('end-screen').classList.add('hidden');
  $('game-ui').classList.remove('hidden');
  $('battle-tip').classList.remove('hidden');
  updateHUD();
}

function toMenu() {
  battle = null;
  paused = false;
  selectedType = null;
  selectedId = null;
  resetWorldView();
  $('game-ui').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('end-screen').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderMenu();
}

function chooseTower(type) {
  if (!battle || !battle.loadout.includes(type)) return;
  selectedType = selectedType === type ? null : type;
  selectedId = null;
  view.setGhost(null);
  view.setRange(0, 0, 1, false);
  updateHUD();
}

function choosePlaced(id) {
  selectedId = battle?.towers.some(t => t.id === id) ? id : null;
  selectedType = null;
  view.setGhost(null);
  updateHUD();
}

function updateHUD() {
  if (!battle) return;
  const config = MODES[battle.mode];
  $('mode-label').textContent = `${config.name.toUpperCase()} CAMPAIGN`;
  $('hp-label').innerHTML = `${Math.ceil(battle.health)} <span>◆</span>`;
  $('wave-label').textContent = `${battle.wave} / ${config.waves}`;
  $('cash-label').textContent = `$${Math.floor(battle.cash).toLocaleString()}`;
  $('speed').textContent = `${speed}× SPEED`;
  $('pause').textContent = paused ? '▶ RESUME' : 'Ⅱ PAUSE';
  const between = battle.phase === 'build';
  $('wave-control').classList.toggle('hidden', !between);
  const waveKey = `${battle.phase}:${battle.wave}`;
  if (waveKey !== waveRenderKey) {
    waveRenderKey = waveKey;
    $('wave-kicker').textContent = battle.wave ? `WAVE ${battle.wave} CLEARED` : 'THE FIRST WAVE AWAITS';
    $('wave-title').textContent = battle.wave ? 'Your defense holds.' : 'Set your defenses.';
    $('start-wave').innerHTML = `Begin wave ${battle.wave + 1} <span>→</span>`;
  }
  $('placement-hint').classList.toggle('hidden', !selectedType);
  const shopKey = `${battle.loadout.join(',')}:${selectedType || ''}`;
  if (shopKey !== shopRenderKey) {
    shopRenderKey = shopKey;
    $('shop').innerHTML = battle.loadout.map((id, index) => {
      const tower = TOWERS[id];
      return `<button class="shop-card ${selectedType === id ? 'active' : ''}" data-pick="${id}" title="${tower.description}" style="--accent:${tower.color}" aria-label="${index + 1}: ${tower.name}, $${tower.cost}" aria-pressed="${selectedType === id}">
        <span class="tower-icon">${icons[id]}</span><span class="shop-details"><strong>${index + 1}. ${tower.name}</strong><small>$${tower.cost}</small></span></button>`;
    }).join('');
  }
  const tower = battle.towers.find(t => t.id === selectedId);
  $('inspector').classList.toggle('hidden', !tower);
  const inspectorKey = tower ? `${tower.id}:${tower.level}:${tower.target}:${tower.spent}` : '';
  if (inspectorKey !== inspectorRenderKey) {
    inspectorRenderKey = inspectorKey;
  if (tower) {
    const info = TOWERS[tower.type], stats = towerStats(tower), cost = info.upgrades[tower.level];
    $('inspector').innerHTML = `<button class="close-inspector" data-action="close" aria-label="Close tower details">×</button>
      <div class="inspector-top" style="--accent:${info.color}"><span class="tower-icon">${icons[tower.type]}</span><div><h3>${info.name}</h3><div class="level">LEVEL ${tower.level} / 5</div></div></div>
      <p>${info.description}</p><dl><dt>Damage</dt><dd>${stats.damage || 'Support'}</dd><dt>Range</dt><dd>${stats.range.toFixed(1)}</dd><dt>${stats.income ? 'Wave income' : 'Attack rate'}</dt><dd>${stats.income ? `$${stats.income}` : `${stats.rate.toFixed(2)}/s`}</dd><dt>Invested</dt><dd>$${tower.spent}</dd></dl>
      <div class="inspector-actions"><button class="upgrade-action" data-action="upgrade" aria-label="${cost === undefined ? 'Maximum level' : `Upgrade ${info.name} for ${cost} cash`}" ${cost === undefined ? 'disabled' : ''}>${cost === undefined ? 'MAX LEVEL' : `UPGRADE · $${cost}`}<br><small>${cost === undefined ? 'Fully powered' : info.bonus[tower.level]}</small></button>
      <button data-action="target" ${tower.type === 'relay' ? 'disabled' : ''}>TARGET: ${tower.target.toUpperCase()} ↻</button><button class="sell" data-action="sell">SELL · +$${Math.floor(tower.spent * .7)}</button></div>`;
  }
  }
  if (tower) {
    const stats = towerStats(tower);
    if (!selectedType) view.setRange(tower.x, tower.z, stats.range, true);
  } else if (!selectedType) view.setRange(0, 0, 1, false);
}

function finish(outcome) {
  const won = outcome === 'victory', config = MODES[battle.mode];
  const coins = Math.round((18 + battle.wave * 3 + battle.kills / 6 + (won ? config.waves * 3 : 0)) * config.reward);
  const xp = Math.round((25 + battle.wave * 13 + battle.kills * 1.5 + (won ? config.waves * 11 : 0)) * config.reward);
  profile.coins += coins;
  profile.xp += xp;
  if (won) profile.victories++;
  saveProfile();
  $('result-kicker').textContent = won ? 'CAMPAIGN COMPLETE' : 'THE BEACON WENT DARK';
  $('result-title').textContent = won ? 'The light endures.' : 'Another stand awaits.';
  $('result-desc').textContent = won ? `You held through all ${config.waves} waves of ${config.name}.` : `You reached wave ${battle.wave} of ${config.waves}. Refine your line and try again.`;
  $('rewards').innerHTML = `<div><small>WAVES</small><strong>${battle.wave} / ${config.waves}</strong></div><div><small>COINS</small><strong>+${coins}</strong></div><div><small>EXP</small><strong>+${xp}</strong></div>`;
  $('end-screen').classList.remove('hidden');
  view.setGhost(null);
  view.setRange(0, 0, 1, false);
}

function processEvents() {
  if (!battle || !battle.events.length) return;
  for (const event of battle.events.splice(0)) {
    view.event(event);
    if (event.type === 'wave') {
      notify(`Wave ${event.wave} is here`);
      $('battle-tip').classList.add('hidden');
    } else if (event.type === 'clear') notify(`Wave cleared · +$${event.bonus} defense bonus`);
    else if (event.type === 'leak') notify(`Beacon breached · ${event.health} health left`);
    else if (event.type === 'end') finish(event.outcome);
  }
  updateHUD();
}

function startWave() {
  if (paused || !battle) return;
  if (battle.startWave()) processEvents();
}

function togglePause() {
  if (!battle || ['victory', 'defeat'].includes(battle.phase)) return;
  paused = !paused;
  $('pause-screen').classList.toggle('hidden', !paused);
  updateHUD();
}

function openGuide() {
  guideReturn = battle ? 'battle' : 'menu';
  guideWasPaused = paused;
  $('guide').classList.remove('hidden');
  if (battle && !paused) togglePause();
}
function closeGuide() { $('guide').classList.add('hidden'); if (guideReturn === 'battle' && !guideWasPaused && paused) togglePause(); }

function interactAt(x, y) {
  if (!battle || paused || ['victory', 'defeat'].includes(battle.phase)) return;
  const picked = view.pick(x, y);
  if (picked.towerId) { choosePlaced(picked.towerId); return; }
  if (selectedType && picked.tile) {
    const result = battle.place(selectedType, picked.tile.x, picked.tile.z);
    if (result.error) notify(result.error);
    else {
      $('battle-tip').classList.add('hidden');
      processEvents();
      notify(`${TOWERS[selectedType].name} placed`);
    }
  } else if (!selectedType) choosePlaced(null);
}

function initControls() {
  $('modes').addEventListener('click', event => {
    const id = event.target.closest('[data-mode]')?.dataset.mode;
    if (!id) return;
    profile.mode = id;
    saveProfile();
    renderMenu();
  });
  $('loadout').addEventListener('click', event => {
    const id = event.target.closest('[data-tower]')?.dataset.tower;
    if (!id) return;
    if (!profile.unlocks.includes(id)) {
      if (profile.coins < TOWERS[id].unlock) return notify(`Need ${TOWERS[id].unlock} coins to unlock ${TOWERS[id].name}`);
      profile.coins -= TOWERS[id].unlock;
      profile.unlocks.push(id);
      notify(`${TOWERS[id].name} unlocked! Tap to equip.`);
    } else if (profile.loadout.includes(id)) {
      if (profile.loadout.length === 1) return notify('Keep at least one tower equipped');
      profile.loadout.splice(profile.loadout.indexOf(id), 1);
    } else if (profile.loadout.length === 4) return notify('Four tower slots max. Unequip one first.');
    else profile.loadout.push(id);
    saveProfile();
    renderMenu();
  });
  $('begin').onclick = startBattle;
  $('shop').addEventListener('click', event => {
    const id = event.target.closest('[data-pick]')?.dataset.pick;
    if (id) chooseTower(id);
  });
  $('inspector').addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !selectedId || !battle) return;
    if (action === 'close') return choosePlaced(null);
    const tower = battle.towers.find(t => t.id === selectedId);
    if (!tower) return;
    if (action === 'target') {
      const order = ['first', 'last', 'strong', 'near'];
      tower.target = order[(order.indexOf(tower.target) + 1) % order.length];
      notify(`Target: ${tower.target}`);
    } else if (action === 'upgrade') {
      const result = battle.upgrade(selectedId);
      if (result.error) notify(result.error);
      else { notify(`${TOWERS[tower.type].name} upgraded to level ${tower.level}`); processEvents(); }
    } else if (action === 'sell') {
      const result = battle.sell(selectedId);
      if (result.error) notify(result.error);
      else { choosePlaced(null); processEvents(); notify(`Sold for $${result.refund}`); }
    }
    updateHUD();
  });
  $('start-wave').onclick = startWave;
  $('speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; updateHUD(); };
  $('pause').onclick = togglePause;
  $('resume').onclick = togglePause;
  $('quit').onclick = toMenu;
  $('retry').onclick = startBattle;
  $('to-menu').onclick = toMenu;
  $('open-guide').onclick = openGuide;
  $('close-guide').onclick = closeGuide;
  $('guide-done').onclick = closeGuide;
  $('guide').addEventListener('click', event => { if (event.target === $('guide')) closeGuide(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('guide').classList.contains('hidden')) closeGuide();
      else if (selectedType) chooseTower(selectedType);
      else if (selectedId) choosePlaced(null);
      else if (battle) togglePause();
    }
    if (!battle || paused || !$('end-screen').classList.contains('hidden')) return;
    if (event.code === 'Space') { event.preventDefault(); startWave(); }
    if (event.key.toLowerCase() === 'p') togglePause();
    const n = Number(event.key);
    if (n >= 1 && n <= 4 && battle.loadout[n - 1]) chooseTower(battle.loadout[n - 1]);
  });
  const canvas = $('world');
  let drag = null;
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (drag) {
      const delta = event.clientX - drag.lastX;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) view.orbitBy(delta * .004);
      drag.lastX = event.clientX;
    }
    if (selectedType && battle) {
      const tile = view.pick(event.clientX, event.clientY).tile;
      view.setGhost(tile, tile ? !battle.canPlace(selectedType, tile.x, tile.z) : false, tile ? TOWERS[selectedType].range : null);
      if (!tile) view.setRange(0, 0, 1, false);
    }
  });
  canvas.addEventListener('pointerup', event => {
    if (drag && !drag.moved) interactAt(event.clientX, event.clientY);
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (selectedType) { view.setGhost(null); view.setRange(0, 0, 1, false); } });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    view.zoom = Math.max(.85, Math.min(1.45, view.zoom - Math.sign(event.deltaY) * .08));
    view.resize();
  }, { passive: false });
}

function frame(now) {
  const dt = Math.min(.06, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (battle && !paused && battle.phase === 'wave') {
    accumulator += dt * speed;
    let steps = 0;
    while (accumulator >= .05 && steps++ < 6 && battle.phase === 'wave') {
      battle.step(.05);
      accumulator -= .05;
    }
    processEvents();
  }
  if (battle && now - lastHud > 220) { updateHUD(); lastHud = now; }
  view.sync(battle, dt);
  requestAnimationFrame(frame);
}

try {
  view = new WorldView($('world'));
  initControls();
  renderMenu();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('load-error').textContent = 'This browser could not start a 3D canvas. Try a browser with Canvas 2D support.';
  $('load-error').classList.remove('hidden');
}
