const MODES = {
  casual: { name: 'Casual', waves: 12, cash: 700, lives: 30, healthScale: 0.82, speedScale: 0.92, rewardScale: 1.18, completionBonus: 105 },
  intermediate: { name: 'Intermediate', waves: 16, cash: 600, lives: 20, healthScale: 1, speedScale: 1, rewardScale: 1, completionBonus: 90 },
  hard: { name: 'Hard', waves: 20, cash: 500, lives: 12, healthScale: 1.28, speedScale: 1.1, rewardScale: 0.9, completionBonus: 78 },
};

const TOWERS = {
  ranger: { name: 'Ranger', icon: 'R', cost: 250, color: '#b8f43d', damage: 14, range: 150, rate: 0.5, projectileSpeed: 620, upgradeCosts: [190, 330] },
  cannon: { name: 'Cannon', icon: 'C', cost: 450, color: '#ffa63d', damage: 48, range: 125, rate: 1.42, projectileSpeed: 410, splash: 48, upgradeCosts: [320, 520] },
  frost: { name: 'Cryo', icon: 'F', cost: 350, color: '#4eeaf2', damage: 8, range: 135, rate: 0.78, projectileSpeed: 520, slow: 0.55, slowTime: 2.4, upgradeCosts: [260, 430] },
};

const ENEMIES = {
  walker: { health: 72, speed: 49, reward: 20, damage: 1, radius: 14, color: '#8fbd59', jacket: '#603f57' },
  runner: { health: 52, speed: 78, reward: 24, damage: 1, radius: 12, color: '#b3d667', jacket: '#bd6547' },
  brute: { health: 245, speed: 31, reward: 48, damage: 2, radius: 18, color: '#789d4d', jacket: '#4e5267' },
  armored: { health: 490, speed: 25, reward: 82, damage: 3, radius: 20, color: '#728a55', jacket: '#40535e' },
  titan: { health: 1650, speed: 20, reward: 320, damage: 6, radius: 27, color: '#6e9544', jacket: '#493f54' },
};

const FIELD = { width: 1120, height: 680 };
const PATH = [
  { x: -45, y: 410 }, { x: 105, y: 410 }, { x: 195, y: 340 },
  { x: 350, y: 340 }, { x: 425, y: 220 }, { x: 615, y: 220 },
  { x: 705, y: 320 }, { x: 845, y: 320 }, { x: 925, y: 410 },
  { x: 1150, y: 410 },
];

const PAD_POINTS = [
  { x: 125, y: 505 }, { x: 135, y: 300 }, { x: 265, y: 450 }, { x: 315, y: 245 },
  { x: 350, y: 525 }, { x: 495, y: 325 }, { x: 520, y: 135 }, { x: 620, y: 390 },
  { x: 700, y: 135 }, { x: 770, y: 245 }, { x: 810, y: 470 }, { x: 915, y: 265 },
  { x: 955, y: 525 }, { x: 1025, y: 330 },
];

const BUILDINGS = [
  { x: 25, y: 55, w: 145, h: 120, tall: 26 },
  { x: 205, y: 40, w: 118, h: 145, tall: 34 },
  { x: 850, y: 42, w: 125, h: 145, tall: 28 },
  { x: 995, y: 50, w: 105, h: 180, tall: 38 },
  { x: 15, y: 535, w: 95, h: 110, tall: 24 },
  { x: 485, y: 495, w: 110, h: 145, tall: 31 },
  { x: 660, y: 510, w: 105, h: 125, tall: 23 },
];

const STREET_LIGHTS = [
  { x: 190, y: 270 }, { x: 365, y: 395 }, { x: 455, y: 165 },
  { x: 670, y: 255 }, { x: 825, y: 375 }, { x: 980, y: 455 },
];

const STREET_PROPS = [
  { type: 'car', x: 230, y: 205, angle: -0.08, color: '#426878' },
  { type: 'car', x: 735, y: 520, angle: 0.08, color: '#8f543f' },
  { type: 'crate', x: 407, y: 420 }, { type: 'crate', x: 875, y: 220 },
  { type: 'barrier', x: 1015, y: 348, angle: 0.75 },
];

const pathSegments = [];
let totalPathLength = 0;
for (let index = 0; index < PATH.length - 1; index += 1) {
  const start = PATH[index];
  const end = PATH[index + 1];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  pathSegments.push({ start, end, length, from: totalPathLength, to: totalPathLength + length });
  totalPathLength += length;
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function startFallbackGame() {
  const originalCanvas = document.querySelector('#gameCanvas');
  const canvas = originalCanvas.cloneNode();
  originalCanvas.replaceWith(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    document.querySelector('#loadingScreen').innerHTML = '<p>This browser could not start either graphics mode.</p>';
    return;
  }

  document.body.classList.add('fallback-2d');
  document.title = 'Last Stand 2D';
  canvas.setAttribute('aria-label', '2D zombie tower defense battlefield');
  document.querySelector('#gameTitle em').textContent = '2D';
  document.querySelector('.brand-kicker').innerHTML = '<span></span> Nightfall protocol';
  document.querySelector('.menu-tip').textContent = 'Select a tower, then tap a build pad. Hold every sector.';
  document.querySelector('.mission-id strong').textContent = 'DISTRICT 07 · 2D';

  const dom = {
    canvas,
    loading: document.querySelector('#loadingScreen'),
    menu: document.querySelector('#menuScreen'),
    hud: document.querySelector('#hud'),
    end: document.querySelector('#endScreen'),
    cash: document.querySelector('#cashValue'),
    lives: document.querySelector('#livesValue'),
    wave: document.querySelector('#waveValue'),
    waveTotal: document.querySelector('#waveTotal'),
    mode: document.querySelector('#modeLabel'),
    objective: document.querySelector('#objectiveText'),
    waveStateLabel: document.querySelector('#waveStateLabel'),
    waveStateText: document.querySelector('#waveStateText'),
    startWave: document.querySelector('#startWaveBtn'),
    speed: document.querySelector('#speedBtn'),
    pause: document.querySelector('#pauseBtn'),
    towerPanel: document.querySelector('#towerPanel'),
    towerIcon: document.querySelector('#towerIcon'),
    towerLevel: document.querySelector('#towerLevel'),
    towerName: document.querySelector('#towerName'),
    towerDamage: document.querySelector('#towerDamage'),
    towerRange: document.querySelector('#towerRange'),
    towerRate: document.querySelector('#towerRate'),
    upgrade: document.querySelector('#upgradeBtn'),
    sell: document.querySelector('#sellBtn'),
    sellValue: document.querySelector('#sellValue'),
    toast: document.querySelector('#toast'),
    damageFlash: document.querySelector('#damageFlash'),
    endKicker: document.querySelector('#endKicker'),
    endTitle: document.querySelector('#endTitle'),
    endSummary: document.querySelector('#endSummary'),
    endWaves: document.querySelector('#endWaves'),
    endKills: document.querySelector('#endKills'),
    endCash: document.querySelector('#endCash'),
  };

  const state = {
    active: false,
    finished: false,
    modeKey: 'casual',
    config: MODES.casual,
    cash: 0,
    lives: 0,
    wave: 0,
    waveActive: false,
    queue: [],
    spawnTimer: 0,
    spawnInterval: 0.7,
    enemies: [],
    towers: [],
    projectiles: [],
    effects: [],
    pads: PAD_POINTS.map((point, index) => ({ ...point, index, tower: null, pulse: Math.random() * Math.PI * 2 })),
    selectedType: 'ranger',
    selectedTower: null,
    hoveredPad: null,
    kills: 0,
    paused: false,
    speed: 1,
    time: 0,
    endCountdown: 0,
    shake: 0,
  };

  const view = { width: 0, height: 0, scale: 1, x: 0, y: 0, dpr: 1 };
  const hitLayer = document.createElement('div');
  hitLayer.className = 'fallback-hit-layer';
  hitLayer.setAttribute('aria-label', 'Build pads');
  document.querySelector('#app').insertBefore(hitLayer, dom.hud);
  const padButtons = state.pads.map((pad) => {
    const button = document.createElement('button');
    button.className = 'fallback-pad-hit';
    button.type = 'button';
    button.setAttribute('aria-label', `Empty build pad ${pad.index + 1}`);
    button.addEventListener('click', () => handlePad(pad));
    button.addEventListener('pointerenter', () => { state.hoveredPad = pad; });
    button.addEventListener('pointerleave', () => { if (state.hoveredPad === pad) state.hoveredPad = null; });
    button.addEventListener('focus', () => { state.hoveredPad = pad; });
    button.addEventListener('blur', () => { if (state.hoveredPad === pad) state.hoveredPad = null; });
    hitLayer.appendChild(button);
    return button;
  });

  let toastTimer;
  let lastFrame = performance.now();

  function bindEvents() {
    document.querySelectorAll('.mode-card').forEach((button) => {
      button.addEventListener('click', () => startGame(button.dataset.mode));
    });
    document.querySelectorAll('.tower-card').forEach((button) => {
      button.addEventListener('click', () => selectTowerType(button.dataset.tower));
    });
    dom.startWave.addEventListener('click', startWave);
    dom.speed.addEventListener('click', cycleSpeed);
    dom.pause.addEventListener('click', togglePause);
    document.querySelector('#menuBtn').addEventListener('click', returnToMenu);
    document.querySelector('#closeTowerPanel').addEventListener('click', clearTowerSelection);
    dom.upgrade.addEventListener('click', upgradeSelectedTower);
    dom.sell.addEventListener('click', sellSelectedTower);
    document.querySelector('#replayBtn').addEventListener('click', () => startGame(state.modeKey));
    document.querySelector('#modesBtn').addEventListener('click', returnToMenu);
    canvas.addEventListener('click', clearTowerSelection);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', (event) => {
      if (!state.active || state.finished) return;
      if (event.key === '1') selectTowerType('ranger');
      if (event.key === '2') selectTowerType('cannon');
      if (event.key === '3') selectTowerType('frost');
      if (event.key === ' ') {
        event.preventDefault();
        togglePause();
      }
      if (event.key === 'Enter' && !state.waveActive) startWave();
      if (event.key === 'Escape') clearTowerSelection();
    });
  }

  function startGame(modeKey) {
    const config = MODES[modeKey];
    if (!config) return;
    Object.assign(state, {
      active: true,
      finished: false,
      modeKey,
      config,
      cash: config.cash,
      lives: config.lives,
      wave: 0,
      waveActive: false,
      queue: [],
      spawnTimer: 0,
      enemies: [],
      towers: [],
      projectiles: [],
      effects: [],
      selectedType: 'ranger',
      selectedTower: null,
      hoveredPad: null,
      kills: 0,
      paused: false,
      speed: 1,
      time: 0,
      endCountdown: 0,
      shake: 0,
    });
    state.pads.forEach((pad) => { pad.tower = null; });
    dom.menu.classList.add('hidden');
    dom.end.classList.add('hidden');
    dom.hud.classList.remove('hidden');
    hitLayer.classList.add('active');
    selectTowerType('ranger', false);
    setWaveReady();
    updateUI();
    showToast('Defense online · Select a tower, then tap a build pad.');
  }

  function returnToMenu() {
    state.active = false;
    state.finished = false;
    state.paused = false;
    state.waveActive = false;
    state.enemies = [];
    state.towers = [];
    state.projectiles = [];
    state.effects = [];
    state.hoveredPad = null;
    state.pads.forEach((pad) => { pad.tower = null; });
    clearTowerSelection();
    hitLayer.classList.remove('active');
    dom.hud.classList.add('hidden');
    dom.end.classList.add('hidden');
    dom.menu.classList.remove('hidden');
    updatePadButtons();
  }

  function buildWave(wave) {
    const extra = state.modeKey === 'hard' ? 3 : state.modeKey === 'intermediate' ? 1 : 0;
    const count = Math.round(4.5 + wave * 1.65 + extra);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const roll = (index * 31 + wave * 17 + (index % 3) * 11) % 100;
      let type = 'walker';
      if (wave >= 9 && roll < Math.min(18, wave)) type = 'armored';
      else if (wave >= 4 && roll < 35) type = 'brute';
      else if (wave >= 2 && roll < 62) type = 'runner';
      result.push(type);
    }
    if (state.modeKey === 'hard' && wave >= 10 && wave % 5 === 0 && wave < state.config.waves) {
      result.splice(Math.floor(result.length / 2), 0, 'armored', 'brute');
    }
    if (wave === state.config.waves) result.push('titan');
    return result;
  }

  function startWave() {
    if (!state.active || state.finished || state.paused || state.waveActive || state.wave >= state.config.waves) return;
    state.wave += 1;
    state.waveActive = true;
    state.queue = buildWave(state.wave);
    state.spawnTimer = 0.18;
    state.spawnInterval = Math.max(0.34, 0.76 - state.wave * 0.018 - (state.modeKey === 'hard' ? 0.06 : 0));
    dom.startWave.disabled = true;
    dom.startWave.textContent = 'WAVE ACTIVE';
    dom.waveStateLabel.textContent = state.wave === state.config.waves ? 'FINAL WAVE' : 'INCOMING';
    dom.waveStateText.textContent = `${state.queue.length} hostiles`;
    dom.objective.textContent = state.wave === state.config.waves ? 'Stop the outbreak leader' : `Defend the base · Wave ${state.wave}`;
    updateUI();
  }

  function setWaveReady() {
    dom.startWave.disabled = false;
    dom.startWave.innerHTML = 'START WAVE <span>→</span>';
    dom.waveStateLabel.textContent = state.wave === 0 ? 'READY' : 'NEXT';
    dom.waveStateText.textContent = `Wave ${state.wave + 1}`;
    dom.objective.textContent = state.wave === 0 ? 'Prepare your defenses' : 'Reinforce before the next wave';
  }

  function finishWave() {
    state.waveActive = false;
    if (state.wave >= state.config.waves) {
      state.endCountdown = 1;
      dom.objective.textContent = 'Sector secured';
      dom.waveStateLabel.textContent = 'CLEAR';
      dom.waveStateText.textContent = 'Outbreak stopped';
      return;
    }
    const bonus = Math.round((state.config.completionBonus + state.wave * 11) * state.config.rewardScale);
    state.cash += bonus;
    setWaveReady();
    updateUI();
    showToast(`Wave ${state.wave} cleared · +$${bonus}`);
  }

  function spawnEnemy(type) {
    const base = ENEMIES[type];
    if (!base) return;
    const waveGrowth = 1 + (state.wave - 1) * 0.13;
    const finalBoost = type === 'titan' ? 1 + state.wave * 0.018 : 1;
    const stats = {
      ...base,
      health: Math.round(base.health * state.config.healthScale * waveGrowth * finalBoost),
      speed: base.speed * state.config.speedScale * (1 + Math.min(state.wave, 14) * 0.011),
      reward: Math.max(1, Math.round(base.reward * state.config.rewardScale)),
    };
    const point = samplePath(0);
    state.enemies.push({
      type,
      stats,
      health: stats.health,
      pathDistance: 0,
      x: point.x,
      y: point.y,
      angle: point.angle,
      alive: true,
      slowUntil: 0,
      slowFactor: 1,
      gait: Math.random() * Math.PI * 2,
      laneOffset: (Math.random() * 2 - 1) * 13,
    });
  }

  function samplePath(pathDistance) {
    const amount = clamp(pathDistance, 0, totalPathLength);
    let segment = pathSegments[pathSegments.length - 1];
    for (const candidate of pathSegments) {
      if (amount <= candidate.to) {
        segment = candidate;
        break;
      }
    }
    const alpha = (amount - segment.from) / segment.length;
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    return {
      x: lerp(segment.start.x, segment.end.x, alpha),
      y: lerp(segment.start.y, segment.end.y, alpha),
      angle: Math.atan2(dy, dx),
    };
  }

  function updateEnemies(dt) {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const slow = state.time < enemy.slowUntil ? enemy.slowFactor : 1;
      enemy.pathDistance += enemy.stats.speed * slow * dt;
      if (enemy.pathDistance >= totalPathLength) {
        enemy.alive = false;
        state.lives = Math.max(0, state.lives - enemy.stats.damage);
        state.shake = 1;
        flashBaseDamage();
        if (state.lives <= 0) endGame(false);
        continue;
      }
      const point = samplePath(enemy.pathDistance);
      enemy.x = point.x - Math.sin(point.angle) * enemy.laneOffset;
      enemy.y = point.y + Math.cos(point.angle) * enemy.laneOffset;
      enemy.angle = point.angle;
      enemy.gait += dt * enemy.stats.speed * 0.09;
    }
    state.enemies = state.enemies.filter((enemy) => enemy.alive);
  }

  function handlePad(pad) {
    if (!state.active || state.finished) return;
    if (pad.tower) {
      selectPlacedTower(pad.tower);
      return;
    }
    const definition = TOWERS[state.selectedType];
    if (state.cash < definition.cost) {
      showToast(`Need $${definition.cost - state.cash} more for ${definition.name}`, true);
      state.effects.push({ type: 'ring', x: pad.x, y: pad.y, color: '#ff4d55', age: 0, life: 0.55, size: 24 });
      return;
    }
    const tower = {
      type: state.selectedType,
      pad,
      x: pad.x,
      y: pad.y,
      level: 1,
      cooldown: Math.random() * 0.2,
      angle: -Math.PI / 2,
      recoil: 0,
      flashUntil: 0,
      invested: definition.cost,
      stats: towerStats(state.selectedType, 1),
    };
    pad.tower = tower;
    state.towers.push(tower);
    state.cash -= definition.cost;
    state.effects.push({ type: 'ring', x: pad.x, y: pad.y, color: definition.color, age: 0, life: 0.55, size: 24 });
    selectPlacedTower(tower);
    updateUI();
  }

  function towerStats(type, level) {
    const base = TOWERS[type];
    const step = level - 1;
    return {
      damage: Math.round(base.damage * (1 + step * 0.72)),
      range: Math.round(base.range * (1 + step * 0.09)),
      rate: Number((base.rate * Math.pow(0.84, step)).toFixed(2)),
      projectileSpeed: base.projectileSpeed,
      splash: base.splash ? base.splash * (1 + step * 0.12) : 0,
      slow: base.slow ? Math.max(0.38, base.slow - step * 0.06) : 0,
      slowTime: base.slowTime ? base.slowTime + step * 0.45 : 0,
    };
  }

  function updateTowers(dt) {
    for (const tower of state.towers) {
      tower.cooldown -= dt;
      tower.recoil = Math.max(0, tower.recoil - dt * 8);
      const target = acquireTarget(tower);
      if (!target) continue;
      tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      if (tower.cooldown <= 0) {
        fire(tower, target);
        tower.cooldown = tower.stats.rate;
      }
    }
  }

  function acquireTarget(tower) {
    let target = null;
    let furthest = -1;
    for (const enemy of state.enemies) {
      if (!enemy.alive || distance(tower, enemy) > tower.stats.range) continue;
      if (enemy.pathDistance > furthest) {
        target = enemy;
        furthest = enemy.pathDistance;
      }
    }
    return target;
  }

  function fire(tower, target) {
    const muzzle = {
      x: tower.x + Math.cos(tower.angle) * 29,
      y: tower.y + Math.sin(tower.angle) * 29,
    };
    tower.recoil = 1;
    tower.flashUntil = state.time + 0.09;
    state.effects.push({ type: 'muzzle', x: muzzle.x, y: muzzle.y, angle: tower.angle, color: TOWERS[tower.type].color, age: 0, life: 0.11, size: tower.type === 'cannon' ? 16 : 10 });
    state.projectiles.push({
      type: tower.type,
      tower,
      target,
      x: muzzle.x,
      y: muzzle.y,
      trailX: muzzle.x,
      trailY: muzzle.y,
      speed: tower.stats.projectileSpeed,
      alive: true,
    });
  }

  function updateProjectiles(dt) {
    for (const projectile of state.projectiles) {
      if (!projectile.alive || !projectile.target.alive) {
        projectile.alive = false;
        continue;
      }
      projectile.trailX = projectile.x;
      projectile.trailY = projectile.y;
      const dx = projectile.target.x - projectile.x;
      const dy = projectile.target.y - projectile.y;
      const remaining = Math.hypot(dx, dy);
      const travel = projectile.speed * dt;
      if (remaining <= travel) {
        projectile.x = projectile.target.x;
        projectile.y = projectile.target.y;
        resolveHit(projectile);
        projectile.alive = false;
      } else {
        projectile.x += dx / remaining * travel;
        projectile.y += dy / remaining * travel;
      }
    }
    state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
  }

  function resolveHit(projectile) {
    const { tower, target } = projectile;
    const definition = TOWERS[tower.type];
    if (tower.type === 'cannon') {
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const gap = distance(enemy, target);
        if (gap <= tower.stats.splash) {
          damageEnemy(enemy, tower.stats.damage * (1 - gap / tower.stats.splash * 0.35));
        }
      }
      state.effects.push({ type: 'blast', x: target.x, y: target.y, color: definition.color, age: 0, life: 0.32, size: tower.stats.splash });
    } else if (tower.type === 'frost') {
      damageEnemy(target, tower.stats.damage);
      target.slowFactor = tower.stats.slow;
      target.slowUntil = Math.max(target.slowUntil, state.time + tower.stats.slowTime);
      state.effects.push({ type: 'snow', x: target.x, y: target.y, color: definition.color, age: 0, life: 0.38, size: 22 });
    } else {
      damageEnemy(target, tower.stats.damage);
      state.effects.push({ type: 'spark', x: target.x, y: target.y, color: definition.color, age: 0, life: 0.24, size: 15 });
    }
  }

  function damageEnemy(enemy, amount) {
    if (!enemy.alive) return;
    enemy.health -= amount;
    if (enemy.health > 0) return;
    enemy.alive = false;
    state.cash += enemy.stats.reward;
    state.kills += 1;
    state.effects.push({ type: 'defeat', x: enemy.x, y: enemy.y, color: enemy.stats.color, age: 0, life: 0.58, size: enemy.stats.radius, reward: enemy.stats.reward });
    updateRemaining();
    updateUI();
  }

  function updateEffects(dt) {
    state.effects.forEach((effect) => { effect.age += dt; });
    state.effects = state.effects.filter((effect) => effect.age < effect.life);
    state.shake = Math.max(0, state.shake - dt * 4.5);
  }

  function selectTowerType(type, announce = true) {
    if (!TOWERS[type]) return;
    state.selectedType = type;
    clearTowerSelection();
    document.querySelectorAll('.tower-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.tower === type);
    });
    if (announce) showToast(`${TOWERS[type].name} selected · Tap an empty pad`);
  }

  function selectPlacedTower(tower) {
    state.selectedTower = tower;
    dom.towerPanel.classList.remove('hidden');
    updateTowerPanel();
    updatePadButtons();
  }

  function clearTowerSelection() {
    state.selectedTower = null;
    dom.towerPanel.classList.add('hidden');
    updatePadButtons();
  }

  function updateTowerPanel() {
    const tower = state.selectedTower;
    if (!tower) return;
    const definition = TOWERS[tower.type];
    const nextCost = definition.upgradeCosts[tower.level - 1];
    dom.towerIcon.textContent = definition.icon;
    dom.towerIcon.style.background = definition.color;
    dom.towerLevel.textContent = `LEVEL ${tower.level}`;
    dom.towerName.textContent = definition.name;
    dom.towerDamage.textContent = tower.stats.damage;
    dom.towerRange.textContent = Math.round(tower.stats.range / 15).toFixed(1);
    dom.towerRate.textContent = `${tower.stats.rate.toFixed(2)}s`;
    dom.sellValue.textContent = `+$${Math.floor(tower.invested * 0.6)}`;
    if (tower.level >= 3) {
      dom.upgrade.disabled = true;
      dom.upgrade.innerHTML = '<span>MAX LEVEL</span><strong>—</strong>';
    } else {
      dom.upgrade.disabled = state.cash < nextCost;
      dom.upgrade.innerHTML = `<span>UPGRADE</span><strong>$${nextCost}</strong>`;
    }
  }

  function upgradeSelectedTower() {
    const tower = state.selectedTower;
    if (!tower || tower.level >= 3) return;
    const definition = TOWERS[tower.type];
    const cost = definition.upgradeCosts[tower.level - 1];
    if (state.cash < cost) {
      showToast(`Need $${cost - state.cash} more to upgrade`, true);
      return;
    }
    state.cash -= cost;
    tower.invested += cost;
    tower.level += 1;
    tower.stats = towerStats(tower.type, tower.level);
    state.effects.push({ type: 'ring', x: tower.x, y: tower.y, color: definition.color, age: 0, life: 0.65, size: 26 });
    updateUI();
    showToast(`${definition.name} upgraded to level ${tower.level}`);
  }

  function sellSelectedTower() {
    const tower = state.selectedTower;
    if (!tower) return;
    const refund = Math.floor(tower.invested * 0.6);
    state.cash += refund;
    tower.pad.tower = null;
    state.towers = state.towers.filter((item) => item !== tower);
    clearTowerSelection();
    updateUI();
    showToast(`${TOWERS[tower.type].name} sold · +$${refund}`);
  }

  function cycleSpeed() {
    const speeds = [1, 2, 3];
    state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length];
    dom.speed.textContent = `${state.speed}×`;
  }

  function togglePause() {
    if (!state.active || state.finished) return;
    state.paused = !state.paused;
    dom.pause.textContent = state.paused ? '▶' : 'Ⅱ';
    dom.pause.setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    dom.objective.textContent = state.paused ? 'Game paused' : state.waveActive ? `Defend the base · Wave ${state.wave}` : 'Prepare your defenses';
    showToast(state.paused ? 'Game paused' : 'Game resumed');
  }

  function endGame(won) {
    if (state.finished) return;
    state.finished = true;
    state.paused = true;
    state.waveActive = false;
    hitLayer.classList.remove('active');
    dom.hud.classList.add('hidden');
    dom.end.classList.remove('hidden');
    dom.endKicker.textContent = won ? 'SECTOR SECURED' : 'BASE OVERRUN';
    dom.endKicker.style.color = won ? 'var(--acid)' : 'var(--red)';
    dom.endTitle.textContent = won ? 'YOU SURVIVED' : 'DEFENSE BROKEN';
    dom.endSummary.textContent = won ? 'The final wave has been stopped.' : `The horde broke through on wave ${state.wave}.`;
    dom.endWaves.textContent = state.wave;
    dom.endKills.textContent = state.kills.toLocaleString();
    dom.endCash.textContent = `$${state.cash.toLocaleString()}`;
  }

  function flashBaseDamage() {
    dom.damageFlash.classList.remove('hit');
    void dom.damageFlash.offsetWidth;
    dom.damageFlash.classList.add('hit');
    showToast('A zombie reached the base!', true);
    updateUI();
  }

  function showToast(message, error = false) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.toggle('error', error);
    dom.toast.classList.add('show');
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2100);
  }

  function updateRemaining() {
    if (!state.waveActive) return;
    const living = state.enemies.filter((enemy) => enemy.alive).length;
    dom.waveStateText.textContent = `${state.queue.length + living} remaining`;
  }

  function updateUI() {
    dom.cash.textContent = Math.floor(state.cash).toLocaleString();
    dom.lives.textContent = state.lives;
    dom.wave.textContent = state.wave;
    dom.waveTotal.textContent = state.config.waves;
    dom.mode.textContent = `${state.config.name.toUpperCase()} · 2D`;
    dom.speed.textContent = `${state.speed}×`;
    dom.pause.textContent = state.paused ? '▶' : 'Ⅱ';
    document.querySelectorAll('.tower-card').forEach((card) => {
      card.classList.toggle('unaffordable', state.cash < TOWERS[card.dataset.tower].cost);
    });
    updatePadButtons();
    updateTowerPanel();
  }

  function updatePadButtons() {
    state.pads.forEach((pad, index) => {
      const button = padButtons[index];
      button.classList.toggle('occupied', Boolean(pad.tower));
      button.classList.toggle('selected', state.selectedTower?.pad === pad);
      if (pad.tower) {
        button.setAttribute('aria-label', `${TOWERS[pad.tower.type].name} level ${pad.tower.level} on build pad ${index + 1}`);
      } else {
        button.setAttribute('aria-label', `Empty build pad ${index + 1}`);
      }
    });
  }

  function resize() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    const compact = view.width <= 760;
    const topSafe = compact ? 58 : 64;
    const bottomSafe = compact ? 120 : 112;
    const playHeight = Math.max(360, view.height - topSafe - bottomSafe);
    view.scale = Math.min(view.width / FIELD.width, playHeight / FIELD.height);
    view.x = (view.width - FIELD.width * view.scale) / 2;
    view.y = topSafe + (playHeight - FIELD.height * view.scale) / 2;
    ctx.imageSmoothingEnabled = true;
    positionPadButtons();
  }

  function positionPadButtons() {
    const buttonSize = clamp(54 * view.scale, 38, 62);
    state.pads.forEach((pad, index) => {
      const button = padButtons[index];
      button.style.width = `${buttonSize}px`;
      button.style.height = `${buttonSize}px`;
      button.style.left = `${view.x + pad.x * view.scale - buttonSize / 2}px`;
      button.style.top = `${view.y + pad.y * view.scale - buttonSize / 2}px`;
    });
  }

  function update(dt) {
    state.time += dt;
    if (state.waveActive) {
      state.spawnTimer -= dt;
      if (state.queue.length && state.spawnTimer <= 0) {
        spawnEnemy(state.queue.shift());
        state.spawnTimer = state.spawnInterval;
        updateRemaining();
      }
    }
    updateEnemies(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    if (state.waveActive && state.queue.length === 0 && state.enemies.length === 0) finishWave();
    if (state.endCountdown > 0) {
      state.endCountdown -= dt;
      if (state.endCountdown <= 0) endGame(true);
    }
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function hexPath(x, y, radius, rotation = Math.PI / 6) {
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = rotation + index * Math.PI / 3;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const backdrop = ctx.createLinearGradient(0, 0, 0, view.height);
    backdrop.addColorStop(0, '#0b191c');
    backdrop.addColorStop(0.58, '#071113');
    backdrop.addColorStop(1, '#030708');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, view.width, view.height);

    const shakeAmount = state.shake * 6;
    ctx.save();
    ctx.translate(view.x + (Math.random() - 0.5) * shakeAmount, view.y + (Math.random() - 0.5) * shakeAmount);
    ctx.scale(view.scale, view.scale);
    drawGround();
    drawRoad();
    drawBuildings();
    drawScenery();
    drawGate();
    drawBase();
    drawPads();
    if (state.selectedTower) drawRange(state.selectedTower);

    const units = [
      ...state.towers.map((tower) => ({ kind: 'tower', y: tower.y, value: tower })),
      ...state.enemies.map((enemy) => ({ kind: 'enemy', y: enemy.y, value: enemy })),
    ].sort((a, b) => a.y - b.y);
    units.forEach((unit) => unit.kind === 'tower' ? drawTower(unit.value) : drawEnemy(unit.value));
    drawProjectiles();
    drawEffects();
    ctx.restore();

    const haze = ctx.createLinearGradient(0, 0, view.width, view.height);
    haze.addColorStop(0, 'rgba(55,145,142,.06)');
    haze.addColorStop(0.5, 'rgba(0,0,0,0)');
    haze.addColorStop(1, 'rgba(166,239,65,.035)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, view.width, view.height);
    const vignette = ctx.createRadialGradient(view.width / 2, view.height / 2, view.height * 0.3, view.width / 2, view.height / 2, view.width * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function drawGround() {
    const ground = ctx.createLinearGradient(0, 0, FIELD.width, FIELD.height);
    ground.addColorStop(0, '#17302d');
    ground.addColorStop(0.45, '#102523');
    ground.addColorStop(1, '#0d1d1e');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    const blocks = [
      [12, 24, 360, 185, '#183231'], [390, 32, 390, 150, '#142d2c'], [805, 20, 300, 205, '#18302f'],
      [12, 470, 340, 195, '#142b29'], [385, 455, 385, 210, '#18302c'], [790, 455, 315, 210, '#13292a'],
    ];
    blocks.forEach(([x, y, width, height, color]) => {
      ctx.fillStyle = color;
      roundedRect(x, y, width, height, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(126,181,165,.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(135,188,171,.09)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 56) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); ctx.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 56) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(101,151,138,.045)';
    for (let diagonal = -FIELD.height; diagonal < FIELD.width; diagonal += 112) {
      ctx.beginPath(); ctx.moveTo(diagonal, 0); ctx.lineTo(diagonal + FIELD.height, FIELD.height); ctx.stroke();
    }

    for (let index = 0; index < 90; index += 1) {
      const x = (index * 131 + 29) % FIELD.width;
      const y = (index * 73 + 47) % FIELD.height;
      const radius = 1 + index % 3;
      ctx.fillStyle = index % 4 === 0 ? 'rgba(179,230,103,.12)' : 'rgba(116,163,149,.13)';
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }

    [[365, 82, 48, 15], [790, 610, 55, 17], [195, 585, 42, 13]].forEach(([x, y, width, height]) => {
      const puddle = ctx.createRadialGradient(x, y, 2, x, y, width);
      puddle.addColorStop(0, 'rgba(73,151,159,.22)');
      puddle.addColorStop(1, 'rgba(20,72,77,0)');
      ctx.fillStyle = puddle;
      ctx.beginPath(); ctx.ellipse(x, y, width, height, -0.12, 0, Math.PI * 2); ctx.fill();
    });
  }

  function tracePath() {
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let index = 1; index < PATH.length; index += 1) ctx.lineTo(PATH[index].x, PATH[index].y);
  }

  function drawRoad() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 104;
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    tracePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#6c8580';
    ctx.lineWidth = 94;
    tracePath();
    ctx.stroke();
    ctx.strokeStyle = '#203638';
    ctx.lineWidth = 84;
    tracePath();
    ctx.stroke();
    const roadShade = ctx.createLinearGradient(0, 180, 0, 470);
    roadShade.addColorStop(0, 'rgba(92,119,116,.14)');
    roadShade.addColorStop(0.55, 'rgba(0,0,0,0)');
    roadShade.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.strokeStyle = roadShade;
    ctx.lineWidth = 76;
    tracePath();
    ctx.stroke();

    for (let pathDistance = 36; pathDistance < totalPathLength - 28; pathDistance += 62) {
      const point = samplePath(pathDistance);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      ctx.fillStyle = 'rgba(238,218,128,.72)';
      roundedRect(-10, -2, 20, 4, 2);
      ctx.fill();
      ctx.restore();
    }

    [350, 900, 1320].forEach((pathDistance) => {
      if (pathDistance >= totalPathLength) return;
      const point = samplePath(pathDistance);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      for (let stripe = -2; stripe <= 2; stripe += 1) {
        ctx.fillStyle = 'rgba(216,228,220,.34)';
        ctx.fillRect(stripe * 9 - 3, -34, 6, 68);
      }
      ctx.restore();
    });

    for (let pathDistance = 165; pathDistance < totalPathLength; pathDistance += 235) {
      const point = samplePath(pathDistance);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      const side = pathDistance % 2 ? -1 : 1;
      ctx.strokeStyle = 'rgba(7,13,14,.48)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, side * 19);
      ctx.lineTo(2, side * 23);
      ctx.lineTo(8, side * 18);
      ctx.lineTo(15, side * 25);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBuildings() {
    BUILDINGS.forEach((building, index) => {
      const depth = clamp(building.tall * 0.44, 11, 18);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(2,7,8,.62)';
      roundedRect(building.x + 15, building.y + 18, building.w, building.h + depth, 7);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = index % 2 ? '#102326' : '#0e2022';
      ctx.beginPath();
      ctx.moveTo(building.x, building.y + building.h);
      ctx.lineTo(building.x + building.w, building.y + building.h);
      ctx.lineTo(building.x + building.w + depth, building.y + building.h + depth);
      ctx.lineTo(building.x + depth, building.y + building.h + depth);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = index % 2 ? '#13292c' : '#112529';
      ctx.beginPath();
      ctx.moveTo(building.x + building.w, building.y);
      ctx.lineTo(building.x + building.w + depth, building.y + depth);
      ctx.lineTo(building.x + building.w + depth, building.y + building.h + depth);
      ctx.lineTo(building.x + building.w, building.y + building.h);
      ctx.closePath();
      ctx.fill();

      const roof = ctx.createLinearGradient(building.x, building.y, building.x + building.w, building.y + building.h);
      roof.addColorStop(0, index % 2 ? '#355052' : '#2d4648');
      roof.addColorStop(1, index % 2 ? '#22393c' : '#203538');
      ctx.fillStyle = roof;
      roundedRect(building.x, building.y, building.w, building.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(144,192,181,.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(7,14,16,.55)';
      ctx.lineWidth = 4;
      roundedRect(building.x + 7, building.y + 7, building.w - 14, building.h - 14, 3);
      ctx.stroke();

      const unitW = clamp(building.w * 0.26, 25, 38);
      const unitH = clamp(building.h * 0.18, 17, 25);
      ctx.fillStyle = '#182b2d';
      roundedRect(building.x + 17, building.y + 18, unitW, unitH, 3);
      ctx.fill();
      ctx.strokeStyle = '#5b7472';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(130,166,161,.35)';
      for (let line = 1; line < 4; line += 1) {
        ctx.beginPath();
        ctx.moveTo(building.x + 20, building.y + 18 + line * unitH / 4);
        ctx.lineTo(building.x + 14 + unitW, building.y + 18 + line * unitH / 4);
        ctx.stroke();
      }

      if (building.w > 110) {
        ctx.fillStyle = index % 3 === 0 ? 'rgba(184,244,61,.4)' : 'rgba(78,234,242,.28)';
        roundedRect(building.x + building.w - 45, building.y + 16, 28, 8, 2);
        ctx.fill();
      }
      for (let windowIndex = 0; windowIndex < Math.floor(building.w / 25); windowIndex += 1) {
        const lit = (windowIndex + index) % 3 !== 0;
        ctx.fillStyle = lit ? 'rgba(222,230,125,.5)' : 'rgba(40,70,70,.5)';
        roundedRect(building.x + 10 + windowIndex * 24, building.y + building.h + 4, 12, 4, 1);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawScenery() {
    STREET_LIGHTS.forEach((lamp, index) => {
      const pulse = 0.8 + Math.sin(state.time * 1.4 + index) * 0.12;
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 30);
      glow.addColorStop(0, `rgba(178,241,110,${0.24 * pulse})`);
      glow.addColorStop(1, 'rgba(178,241,110,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - 30, lamp.y - 30, 60, 60);
      ctx.fillStyle = '#0a1214';
      ctx.beginPath(); ctx.arc(lamp.x + 3, lamp.y + 4, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8ff86';
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.2, 0, Math.PI * 2); ctx.fill();
    });

    STREET_PROPS.forEach((prop) => {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      if (prop.type === 'car') {
        ctx.fillStyle = 'rgba(0,0,0,.42)';
        roundedRect(-24, -11, 50, 25, 8); ctx.fill();
        ctx.fillStyle = prop.color;
        roundedRect(-25, -13, 48, 23, 7); ctx.fill();
        ctx.fillStyle = '#16292f';
        roundedRect(-10, -10, 22, 17, 4); ctx.fill();
        ctx.fillStyle = 'rgba(151,211,215,.34)';
        ctx.fillRect(-6, -8, 6, 13);
        ctx.fillStyle = '#d6e8c4';
        ctx.fillRect(19, -8, 3, 5); ctx.fillRect(19, 3, 3, 5);
      } else if (prop.type === 'crate') {
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-11, -8, 24, 24);
        ctx.fillStyle = '#704f2d'; ctx.fillRect(-12, -12, 22, 22);
        ctx.strokeStyle = '#c08a43'; ctx.lineWidth = 2; ctx.strokeRect(-9, -9, 16, 16);
        ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(7, 7); ctx.moveTo(7, -8); ctx.lineTo(-8, 7); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-22, 3, 46, 8);
        ctx.fillStyle = '#e99035'; roundedRect(-22, -5, 44, 10, 2); ctx.fill();
        ctx.fillStyle = '#202a2b';
        for (let stripe = -17; stripe < 18; stripe += 12) {
          ctx.beginPath(); ctx.moveTo(stripe, -5); ctx.lineTo(stripe + 8, 5); ctx.lineTo(stripe + 14, 5); ctx.lineTo(stripe + 6, -5); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    });
  }

  function drawGate() {
    ctx.save();
    ctx.translate(6, 410);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    roundedRect(-16, -70, 58, 145, 6); ctx.fill();
    ctx.fillStyle = '#20383a';
    roundedRect(-19, -74, 54, 140, 6); ctx.fill();
    ctx.strokeStyle = '#73918b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#b8f43d';
    ctx.fillRect(-2, -59, 6, 42);
    ctx.fillRect(-2, 9, 6, 42);
    ctx.fillStyle = '#dfff94';
    ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(28, -2); ctx.lineTo(20, -10); ctx.moveTo(28, -2); ctx.lineTo(20, 6); ctx.strokeStyle = '#dfff94'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '900 11px Inter, sans-serif';
    ctx.fillStyle = '#d8e5df';
    ctx.fillText('BREACH', 2, -83);
    ctx.restore();
  }

  function drawBase() {
    ctx.save();
    ctx.translate(1082, 410);
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    roundedRect(-48, -90, 135, 190, 9); ctx.fill();
    const bunker = ctx.createLinearGradient(-45, -82, 65, 82);
    bunker.addColorStop(0, '#46605e'); bunker.addColorStop(1, '#1b2b2e');
    ctx.fillStyle = bunker;
    roundedRect(-53, -96, 132, 184, 9); ctx.fill();
    ctx.strokeStyle = '#829893'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#111d20';
    roundedRect(-24, -64, 103, 126, 5); ctx.fill();
    ctx.strokeStyle = '#344b4d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ff5965';
    ctx.fillRect(-47, -72, 7, 46);
    ctx.fillRect(-47, 24, 7, 46);
    ctx.shadowColor = '#ff5965'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff7a82';
    ctx.beginPath(); ctx.arc(29, -2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    for (let y = -46; y <= 42; y += 22) { ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(67, y); ctx.stroke(); }
    ctx.fillStyle = '#e7f0ed';
    ctx.font = '900 11px Inter, sans-serif';
    ctx.fillText('SAFEHOUSE', -25, -106);
    ctx.restore();
  }

  function drawPads() {
    const definition = TOWERS[state.selectedType];
    state.pads.forEach((pad) => {
      const selected = state.selectedTower?.pad === pad;
      const hovered = state.hoveredPad === pad && !pad.tower;
      const color = pad.tower ? TOWERS[pad.tower.type].color : definition.color;
      ctx.save();
      ctx.translate(pad.x, pad.y);
      if (hovered || selected) {
        ctx.globalAlpha = 0.22 + Math.sin(state.time * 4 + pad.pulse) * 0.04;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0, 0, hovered ? 34 : 31, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(3,10,11,.5)';
      hexPath(3, 5, pad.tower ? 25 : 23); ctx.fill();
      const padGradient = ctx.createLinearGradient(-18, -18, 18, 18);
      padGradient.addColorStop(0, '#425c58'); padGradient.addColorStop(1, '#182b2c');
      ctx.fillStyle = padGradient;
      hexPath(0, 0, pad.tower ? 24 : 21); ctx.fill();
      ctx.strokeStyle = selected ? '#ffffff' : hovered ? color : 'rgba(132,164,157,.62)';
      ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
      ctx.stroke();
      ctx.fillStyle = '#0d191b';
      hexPath(0, 0, pad.tower ? 17 : 14); ctx.fill();
      for (let bolt = 0; bolt < 6; bolt += 1) {
        const angle = Math.PI / 6 + bolt * Math.PI / 3;
        ctx.fillStyle = '#91a49f';
        ctx.beginPath(); ctx.arc(Math.cos(angle) * 17, Math.sin(angle) * 17, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      if (!pad.tower) {
        ctx.globalAlpha = hovered ? 1 : 0.52;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (hovered) {
        const label = `${definition.name.toUpperCase()}  $${definition.cost}`;
        ctx.font = '800 10px Inter, sans-serif';
        const labelWidth = ctx.measureText(label).width + 18;
        ctx.fillStyle = 'rgba(5,13,15,.94)';
        roundedRect(pad.x - labelWidth / 2, pad.y - 47, labelWidth, 22, 7); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#f4faf7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, pad.x, pad.y - 36);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    });
  }

  function drawRange(tower) {
    ctx.save();
    const color = TOWERS[tower.type].color;
    ctx.fillStyle = `${color}0a`;
    ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.stats.range, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([3, 9]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.stats.range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.22;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      ctx.beginPath();
      ctx.moveTo(tower.x + Math.cos(angle) * (tower.stats.range - 8), tower.y + Math.sin(angle) * (tower.stats.range - 8));
      ctx.lineTo(tower.x + Math.cos(angle) * tower.stats.range, tower.y + Math.sin(angle) * tower.stats.range);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTower(tower) {
    const definition = TOWERS[tower.type];
    const levelScale = 1 + (tower.level - 1) * 0.08;
    const recoil = (tower.recoil || 0) * (tower.type === 'cannon' ? 5 : 3);
    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.scale(levelScale, levelScale);
    ctx.fillStyle = 'rgba(0,0,0,.46)';
    ctx.beginPath(); ctx.ellipse(5, 9, 27, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c1719';
    hexPath(0, 2, 24); ctx.fill();
    const base = ctx.createLinearGradient(-18, -18, 18, 18);
    base.addColorStop(0, '#58706b'); base.addColorStop(1, '#223638');
    ctx.fillStyle = base;
    hexPath(0, -1, 22); ctx.fill();
    ctx.strokeStyle = state.selectedTower === tower ? '#ffffff' : definition.color;
    ctx.globalAlpha = state.selectedTower === tower ? 1 : 0.55;
    ctx.lineWidth = state.selectedTower === tower ? 2.5 : 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.rotate(tower.angle);
    if (tower.type === 'ranger') {
      ctx.fillStyle = '#233a3d';
      roundedRect(-12, -11, 25, 22, 6); ctx.fill();
      ctx.strokeStyle = '#819792'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#101c1f';
      roundedRect(5 - recoil, -6, 27, 12, 4); ctx.fill();
      ctx.fillStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 10;
      roundedRect(8 - recoil, -3, 27, 6, 2); ctx.fill();
      ctx.fillStyle = '#dfff98';
      ctx.fillRect(30 - recoil, -2, 5, 4);
      ctx.fillStyle = definition.color;
      ctx.beginPath(); ctx.arc(-4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6e8580';
      ctx.fillRect(-7, -15, 4, 6); ctx.fillRect(-7, 9, 4, 6);
    } else if (tower.type === 'cannon') {
      ctx.fillStyle = '#152427';
      roundedRect(-14, -15, 28, 8, 3); ctx.fill();
      roundedRect(-14, 7, 28, 8, 3); ctx.fill();
      ctx.fillStyle = '#41585a';
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#81928f'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 11;
      roundedRect(4 - recoil, -7, 31, 14, 4); ctx.fill();
      ctx.fillStyle = '#202d30';
      roundedRect(27 - recoil, -9, 11, 18, 3); ctx.fill();
      ctx.fillStyle = '#ffc66f';
      ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.rotate(-tower.angle);
      ctx.strokeStyle = '#678580';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 16;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 13 + Math.sin(state.time * 4) * 1.5, state.time, state.time + Math.PI * 1.45); ctx.stroke();
      ctx.fillStyle = definition.color;
      ctx.rotate(state.time * 1.8);
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(9, -3); ctx.lineTo(6, 14); ctx.lineTo(0, 10); ctx.lineTo(-6, 14); ctx.lineTo(-9, -3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8ffff';
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    for (let level = 0; level < 3; level += 1) {
      ctx.fillStyle = level < tower.level ? definition.color : 'rgba(99,124,119,.45)';
      roundedRect(tower.x - 10 + level * 8, tower.y + 29, 5, 3, 1.5); ctx.fill();
    }
  }

  function drawEnemy(enemy) {
    const radius = enemy.stats.radius;
    const slowed = state.time < enemy.slowUntil;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(-2, radius * 0.62, radius * 1.35, radius * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    if (enemy.type === 'titan') {
      ctx.strokeStyle = 'rgba(188,244,86,.2)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, radius + 8 + Math.sin(state.time * 3) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.rotate(enemy.angle);
    const step = Math.sin(enemy.gait) * radius * 0.27;
    ctx.strokeStyle = '#263039';
    ctx.lineWidth = Math.max(5, radius * 0.38);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-radius * 0.28, -radius * 0.24); ctx.lineTo(-radius * 0.92, -radius * 0.4 + step); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-radius * 0.28, radius * 0.24); ctx.lineTo(-radius * 0.92, radius * 0.4 - step); ctx.stroke();
    ctx.fillStyle = '#11191e';
    ctx.beginPath(); ctx.arc(-radius * 0.96, -radius * 0.4 + step, radius * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-radius * 0.96, radius * 0.4 - step, radius * 0.24, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = enemy.stats.jacket;
    ctx.lineWidth = Math.max(5, radius * 0.34);
    ctx.beginPath(); ctx.moveTo(-radius * 0.1, -radius * 0.48); ctx.lineTo(radius * 0.38, -radius * 0.86 - step * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-radius * 0.1, radius * 0.48); ctx.lineTo(radius * 0.38, radius * 0.86 + step * 0.3); ctx.stroke();
    ctx.fillStyle = enemy.stats.color;
    ctx.beginPath(); ctx.arc(radius * 0.42, -radius * 0.89 - step * 0.3, radius * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(radius * 0.42, radius * 0.89 + step * 0.3, radius * 0.22, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = enemy.stats.jacket;
    roundedRect(-radius * 0.48, -radius * 0.58, radius * 1.08, radius * 1.16, radius * 0.3); ctx.fill();
    ctx.strokeStyle = 'rgba(235,244,239,.18)'; ctx.lineWidth = 1.3; ctx.stroke();
    if (enemy.type === 'armored' || enemy.type === 'titan') {
      ctx.fillStyle = '#566a72';
      roundedRect(-radius * 0.25, -radius * 0.48, radius * 0.72, radius * 0.96, radius * 0.18); ctx.fill();
      ctx.strokeStyle = '#91a4a6'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#293b42';
      ctx.fillRect(-radius * 0.1, -radius * 0.38, radius * 0.08, radius * 0.76);
    }

    ctx.fillStyle = enemy.stats.color;
    ctx.beginPath(); ctx.arc(radius * 0.67, 0, radius * 0.56, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = enemy.type === 'runner' ? '#513b2f' : '#314029';
    ctx.beginPath(); ctx.arc(radius * 0.55, 0, radius * 0.54, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
    ctx.fillStyle = '#e6ff83';
    ctx.shadowColor = '#b8f43d'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(radius * 0.94, -radius * 0.2, Math.max(1.5, radius * 0.09), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(radius * 0.94, radius * 0.2, Math.max(1.5, radius * 0.09), 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (slowed) {
      ctx.strokeStyle = '#4eeaf2';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(0, 0, radius + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    const width = enemy.type === 'titan' ? 64 : enemy.type === 'brute' || enemy.type === 'armored' ? 48 : 40;
    const health = clamp(enemy.health / enemy.stats.health, 0, 1);
    const barY = enemy.y - radius - 15;
    ctx.fillStyle = 'rgba(4,10,12,.9)';
    roundedRect(enemy.x - width / 2 - 2, barY - 2, width + 4, 8, 3); ctx.fill();
    ctx.fillStyle = health < 0.28 ? '#ff4d55' : health < 0.6 ? '#ffac3e' : '#b8f43d';
    roundedRect(enemy.x - width / 2, barY, width * health, 4, 2); ctx.fill();
    if (enemy.type !== 'walker' && enemy.type !== 'runner') {
      ctx.fillStyle = 'rgba(229,240,235,.72)';
      ctx.font = '800 7px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(enemy.type.toUpperCase(), enemy.x, barY - 5);
      ctx.textAlign = 'start';
    }
  }

  function drawProjectiles() {
    state.projectiles.forEach((projectile) => {
      const color = TOWERS[projectile.type].color;
      ctx.strokeStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = projectile.type === 'cannon' ? 15 : 10;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = projectile.type === 'cannon' ? 7 : 3;
      ctx.beginPath(); ctx.moveTo(projectile.trailX, projectile.trailY); ctx.lineTo(projectile.x, projectile.y); ctx.stroke();
      ctx.globalAlpha = 1;
      if (projectile.type === 'cannon') {
        ctx.fillStyle = '#20282b';
        ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      } else if (projectile.type === 'frost') {
        ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#d9ffff'; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
      } else {
        ctx.fillStyle = '#f4ffd2';
        ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    });
  }

  function drawEffects() {
    state.effects.forEach((effect) => {
      const progress = clamp(effect.age / effect.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.color;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 14;
      if (effect.type === 'muzzle') {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.angle || 0);
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(effect.size * (1 - progress * 0.25), -effect.size * 0.45); ctx.lineTo(effect.size * 0.68, 0); ctx.lineTo(effect.size * (1 - progress * 0.25), effect.size * 0.45); ctx.closePath(); ctx.fill();
      } else if (effect.type === 'blast') {
        const blastRadius = Math.max(1, effect.size * (0.18 + progress * 0.82));
        const blast = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, blastRadius);
        blast.addColorStop(0, `rgba(255,244,194,${(1 - progress) * 0.9})`);
        blast.addColorStop(0.35, `rgba(255,166,61,${(1 - progress) * 0.55})`);
        blast.addColorStop(1, 'rgba(255,110,35,0)');
        ctx.fillStyle = blast;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, blastRadius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = '#ffc66f'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, blastRadius, 0, Math.PI * 2); ctx.stroke();
      } else if (effect.type === 'defeat') {
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size * (0.7 + progress * 1.5), 0, Math.PI * 2); ctx.stroke();
        for (let index = 0; index < 7; index += 1) {
          const angle = index / 7 * Math.PI * 2;
          const travel = progress * (22 + index % 3 * 5);
          ctx.save();
          ctx.translate(effect.x + Math.cos(angle) * travel, effect.y + Math.sin(angle) * travel);
          ctx.rotate(angle + progress * 3);
          ctx.fillRect(-2, -3, 4, 6);
          ctx.restore();
        }
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.15);
        ctx.fillStyle = '#eaffaf';
        ctx.font = '900 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`+$${effect.reward || 0}`, effect.x, effect.y - 20 - progress * 20);
        ctx.textAlign = 'start';
      } else if (effect.type === 'snow') {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(progress * Math.PI);
        ctx.strokeStyle = effect.color; ctx.lineWidth = 2;
        for (let index = 0; index < 6; index += 1) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(effect.size * (0.5 + progress * 0.45), 0); ctx.stroke();
        }
      } else if (effect.type === 'spark') {
        ctx.translate(effect.x, effect.y);
        ctx.strokeStyle = effect.color; ctx.lineWidth = 2;
        for (let index = 0; index < 5; index += 1) {
          const angle = index / 5 * Math.PI * 2 + progress;
          ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3); ctx.lineTo(Math.cos(angle) * effect.size * (0.6 + progress), Math.sin(angle) * effect.size * (0.6 + progress)); ctx.stroke();
        }
      } else {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size * (0.5 + progress), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (state.active && !state.paused && !state.finished) update(dt * state.speed);
    draw();
    requestAnimationFrame(frame);
  }

  bindEvents();
  resize();
  updateUI();
  dom.loading.classList.add('hidden');
  dom.menu.classList.remove('hidden');
  requestAnimationFrame(frame);
}
