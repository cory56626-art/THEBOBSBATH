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
  walker: { health: 72, speed: 49, reward: 20, damage: 1, radius: 11, color: '#76914a' },
  runner: { health: 52, speed: 78, reward: 24, damage: 1, radius: 9, color: '#91a94f' },
  brute: { health: 245, speed: 31, reward: 48, damage: 2, radius: 14, color: '#647c45' },
  armored: { health: 490, speed: 25, reward: 82, damage: 3, radius: 16, color: '#536846' },
  titan: { health: 1650, speed: 20, reward: 320, damage: 6, radius: 22, color: '#4e6936' },
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
  canvas.setAttribute('aria-label', '2D zombie tower defense battlefield');
  document.querySelector('#gameTitle em').textContent = '2D';
  document.querySelector('.brand-kicker').innerHTML = '<span></span> Compatibility protocol';
  document.querySelector('.menu-tip').textContent = 'Tap a tower, then tap a build pad. The 3D version still runs on WebGL devices.';
  document.querySelector('.mission-id strong').textContent = 'SECTOR 07 · 2D';

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
    showToast('2D mode active · Select a tower, then tap a build pad.');
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
      enemy.x = point.x;
      enemy.y = point.y;
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
      x: tower.x + Math.cos(tower.angle) * 22,
      y: tower.y + Math.sin(tower.angle) * 22,
    };
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
    state.effects.push({ type: 'defeat', x: enemy.x, y: enemy.y, color: enemy.stats.color, age: 0, life: 0.42, size: enemy.stats.radius });
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
    view.scale = Math.min(view.width / FIELD.width, view.height / FIELD.height);
    view.x = (view.width - FIELD.width * view.scale) / 2;
    view.y = (view.height - FIELD.height * view.scale) / 2;
    positionPadButtons();
  }

  function positionPadButtons() {
    const buttonSize = clamp(62 * view.scale, 34, 72);
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

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const backdrop = ctx.createLinearGradient(0, 0, 0, view.height);
    backdrop.addColorStop(0, '#11191a');
    backdrop.addColorStop(1, '#050809');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, view.width, view.height);

    const shakeAmount = state.shake * 6;
    ctx.save();
    ctx.translate(view.x + (Math.random() - 0.5) * shakeAmount, view.y + (Math.random() - 0.5) * shakeAmount);
    ctx.scale(view.scale, view.scale);
    drawGround();
    drawBuildings();
    drawRoad();
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

    const vignette = ctx.createRadialGradient(view.width / 2, view.height / 2, view.height * 0.24, view.width / 2, view.height / 2, view.width * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.52)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function drawGround() {
    ctx.fillStyle = '#17201e';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = 'rgba(93,120,107,.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); ctx.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); ctx.stroke();
    }
    for (let index = 0; index < 110; index += 1) {
      const x = (index * 97) % FIELD.width;
      const y = (index * 53 + 41) % FIELD.height;
      ctx.fillStyle = index % 3 ? 'rgba(87,111,96,.15)' : 'rgba(184,244,61,.08)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawBuildings() {
    BUILDINGS.forEach((building, index) => {
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.fillRect(building.x + 12, building.y + 12, building.w, building.h);
      ctx.fillStyle = index % 2 ? '#263032' : '#202a2c';
      ctx.fillRect(building.x, building.y, building.w, building.h);
      ctx.fillStyle = '#111819';
      ctx.beginPath();
      ctx.moveTo(building.x, building.y);
      ctx.lineTo(building.x + building.tall, building.y - building.tall * 0.55);
      ctx.lineTo(building.x + building.w + building.tall, building.y - building.tall * 0.55);
      ctx.lineTo(building.x + building.w, building.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#182123';
      ctx.beginPath();
      ctx.moveTo(building.x + building.w, building.y);
      ctx.lineTo(building.x + building.w + building.tall, building.y - building.tall * 0.55);
      ctx.lineTo(building.x + building.w + building.tall, building.y + building.h - building.tall * 0.55);
      ctx.lineTo(building.x + building.w, building.y + building.h);
      ctx.closePath();
      ctx.fill();
      for (let row = 0; row < Math.floor(building.h / 28); row += 1) {
        for (let col = 0; col < Math.floor(building.w / 28); col += 1) {
          if ((row + col + index) % 3 === 0) continue;
          ctx.fillStyle = 'rgba(170,205,92,.23)';
          ctx.fillRect(building.x + 12 + col * 28, building.y + 12 + row * 28, 11, 8);
        }
      }
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
    ctx.strokeStyle = '#65706d';
    ctx.lineWidth = 76;
    tracePath();
    ctx.stroke();
    ctx.strokeStyle = '#292f30';
    ctx.lineWidth = 68;
    tracePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(204,193,111,.62)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    tracePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawGate() {
    ctx.save();
    ctx.translate(6, 410);
    ctx.fillStyle = '#20292a';
    ctx.fillRect(-13, -62, 17, 124);
    ctx.fillRect(-13, -66, 60, 14);
    ctx.fillRect(-13, 52, 60, 14);
    ctx.fillStyle = '#b8f43d';
    ctx.fillRect(2, -53, 5, 42);
    ctx.fillRect(2, 11, 5, 42);
    ctx.font = '800 11px Inter, sans-serif';
    ctx.fillText('SPAWN', 13, -73);
    ctx.restore();
  }

  function drawBase() {
    ctx.save();
    ctx.translate(1080, 410);
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.fillRect(-31, -65, 105, 138);
    ctx.fillStyle = '#343f40';
    ctx.fillRect(-40, -74, 104, 138);
    ctx.fillStyle = '#171d1f';
    ctx.fillRect(-18, -55, 82, 100);
    ctx.fillStyle = '#ff4d55';
    ctx.fillRect(-35, -61, 6, 38);
    ctx.fillRect(-35, 22, 6, 38);
    ctx.shadowColor = '#ff4d55';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff4d55';
    ctx.beginPath(); ctx.arc(25, -2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfd8d5';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.fillText('BASE', 4, -83);
    ctx.restore();
  }

  function drawPads() {
    const definition = TOWERS[state.selectedType];
    state.pads.forEach((pad) => {
      const selected = state.selectedTower?.pad === pad;
      const color = pad.tower ? TOWERS[pad.tower.type].color : definition.color;
      ctx.save();
      ctx.translate(pad.x, pad.y);
      ctx.shadowColor = color;
      ctx.shadowBlur = selected ? 24 : pad.tower ? 5 : 13 + Math.sin(state.time * 2 + pad.pulse) * 4;
      ctx.strokeStyle = selected ? '#ffffff' : color;
      ctx.globalAlpha = pad.tower ? 0.42 : 0.8;
      ctx.lineWidth = selected ? 4 : 2;
      ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#26312e';
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#53615d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
  }

  function drawRange(tower) {
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = TOWERS[tower.type].color;
    ctx.globalAlpha = 0.48;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.stats.range, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `${TOWERS[tower.type].color}0b`;
    ctx.fill();
    ctx.restore();
  }

  function drawTower(tower) {
    const definition = TOWERS[tower.type];
    const levelScale = 1 + (tower.level - 1) * 0.08;
    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.scale(levelScale, levelScale);
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath(); ctx.ellipse(7, 8, 23, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#192120';
    ctx.strokeStyle = '#687773';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.rotate(tower.angle);
    if (tower.type === 'ranger') {
      ctx.fillStyle = '#54635e';
      ctx.fillRect(-11, -10, 22, 20);
      ctx.fillStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 10;
      ctx.fillRect(2, -4, 27, 8);
      ctx.fillRect(-6, -13, 5, 5);
      ctx.fillRect(-6, 8, 5, 5);
    } else if (tower.type === 'cannon') {
      ctx.fillStyle = '#52605c';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 11;
      ctx.fillRect(2, -7, 30, 14);
      ctx.fillStyle = '#202928';
      ctx.fillRect(25, -9, 10, 18);
    } else {
      ctx.rotate(-tower.angle);
      ctx.strokeStyle = definition.color;
      ctx.shadowColor = definition.color; ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 14 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = definition.color;
      ctx.rotate(state.time * 1.8);
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(10, 0); ctx.lineTo(0, 15); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    if (tower.level > 1) {
      ctx.fillStyle = definition.color;
      ctx.font = '800 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`L${tower.level}`, tower.x, tower.y + 39);
    }
  }

  function drawEnemy(enemy) {
    const radius = enemy.stats.radius;
    const slowed = state.time < enemy.slowUntil;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath(); ctx.ellipse(-2, 8, radius * 1.25, radius * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    const step = Math.sin(enemy.gait) * radius * 0.42;
    ctx.fillStyle = '#252f34';
    ctx.fillRect(-radius * 0.7, -radius * 0.62 + step, radius * 1.2, radius * 0.36);
    ctx.fillRect(-radius * 0.7, radius * 0.26 - step, radius * 1.2, radius * 0.36);
    ctx.fillStyle = enemy.type === 'armored' || enemy.type === 'titan' ? '#465153' : '#4c3d38';
    ctx.beginPath(); ctx.roundRect(-radius * 0.55, -radius * 0.8, radius * 1.25, radius * 1.6, 4); ctx.fill();
    ctx.fillStyle = enemy.stats.color;
    ctx.beginPath(); ctx.arc(radius * 0.67, 0, radius * 0.58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7ff75';
    ctx.shadowColor = '#b8f43d'; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(radius * 0.92, -radius * 0.2, Math.max(1.4, radius * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(radius * 0.92, radius * 0.2, Math.max(1.4, radius * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (slowed) {
      ctx.strokeStyle = '#4eeaf2';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, radius + 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    const width = enemy.type === 'titan' ? 55 : 38;
    const health = clamp(enemy.health / enemy.stats.health, 0, 1);
    ctx.fillStyle = 'rgba(6,9,10,.86)';
    ctx.fillRect(enemy.x - width / 2 - 2, enemy.y - radius - 14, width + 4, 7);
    ctx.fillStyle = health < 0.28 ? '#ff4d55' : health < 0.6 ? '#ffac3e' : '#b8f43d';
    ctx.fillRect(enemy.x - width / 2, enemy.y - radius - 12, width * health, 3);
  }

  function drawProjectiles() {
    state.projectiles.forEach((projectile) => {
      const color = TOWERS[projectile.type].color;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = projectile.type === 'cannon' ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(projectile.trailX, projectile.trailY); ctx.lineTo(projectile.x, projectile.y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.type === 'cannon' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
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
      if (effect.type === 'blast') {
        ctx.globalAlpha = (1 - progress) * 0.42;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size * progress, 0, Math.PI * 2); ctx.fill();
      } else if (effect.type === 'defeat') {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.size * (0.7 + progress * 1.8), 0, Math.PI * 2); ctx.stroke();
        for (let index = 0; index < 5; index += 1) {
          const angle = index / 5 * Math.PI * 2;
          ctx.fillRect(effect.x + Math.cos(angle) * progress * 22 - 2, effect.y + Math.sin(angle) * progress * 22 - 2, 4, 4);
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
