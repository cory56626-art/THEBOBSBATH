import { PATH, MODES, TOWERS, ENEMIES, TILE_X, TILE_Z } from './data.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const segments = PATH.slice(1).map(([x, z], i) => {
  const [ax, az] = PATH[i];
  return { ax, az, x, z, length: Math.hypot(x - ax, z - az) };
});
const totalLength = segments.reduce((n, s) => n + s.length, 0);

export function positionOnPath(progress) {
  let p = clamp(progress, 0, totalLength);
  for (const s of segments) {
    if (p <= s.length) return { x: s.ax + (s.x - s.ax) * p / s.length, z: s.az + (s.z - s.az) * p / s.length };
    p -= s.length;
  }
  const [x, z] = PATH.at(-1);
  return { x, z };
}

export function nearestTile(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const ix = Math.round((x + 12) / 2), iz = Math.round((z + 8) / 2);
  if (ix < 0 || ix >= TILE_X.length || iz < 0 || iz >= TILE_Z.length) return null;
  return { x: TILE_X[ix], z: TILE_Z[iz] };
}

export function distanceToPath(x, z) {
  return Math.min(...segments.map(s => {
    const dx = s.x - s.ax, dz = s.z - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
  }));
}

export function makeWave(number, mode) {
  const difficulty = MODES[mode].difficulty;
  const count = 7 + Math.floor(number * 1.8 * Math.sqrt(difficulty));
  const list = [];
  const isFinal = number === MODES[mode].waves;
  const bossWave = isFinal || (number >= 12 && number % 9 === 0);
  for (let i = 0; i < count; i++) {
    let type = 'drifter';
    if (number >= 3 && i % 4 === 1) type = 'skitter';
    if (number >= 5 && i % 6 === 3) type = 'plated';
    if (number >= 7 && i % 7 === 4) type = 'shroud';
    if (number >= 9 && i % 6 === 5) type = 'glider';
    if (number >= 11 && i % 8 === 2) type = 'mender';
    if (number >= 14 && i % 9 === 7) type = 'cluster';
    list.push({ type, at: i * Math.max(.48, 1.08 - number * .012) });
  }
  if (bossWave) list.push({ type: isFinal ? 'sovereign' : 'titan', at: count * .8 + 2 });
  return list;
}

export function towerStats(tower) {
  const data = TOWERS[tower.type], level = tower.level;
  return {
    damage: data.damage ? Math.round(data.damage * (1 + level * .46 + (level >= 5 ? .38 : 0))) : 0,
    rate: data.rate ? data.rate * (1 + level * .12) : 0,
    range: data.range + level * .27,
    splash: data.splash ? data.splash + level * .17 : 0,
    slow: data.slow ? Math.max(.22, data.slow - level * .035) : 0,
    income: data.income ? data.income + level * 58 : 0,
    detect: (tower.type === 'prism' && level >= 2) || (tower.type === 'aegis' && level >= 3) || (tower.type === 'spark' && level >= 4),
  };
}

let nextId = 1;
export class Battle {
  constructor(mode = 'ember', loadout = ['spark', 'prism', 'frost', 'relay']) {
    if (!MODES[mode]) throw new Error('Unknown mode');
    this.mode = mode;
    this.loadout = [...new Set(loadout)].filter(type => TOWERS[type]).slice(0, 4);
    this.cash = MODES[mode].cash;
    this.health = MODES[mode].health;
    this.wave = 0;
    this.phase = 'build';
    this.towers = [];
    this.enemies = [];
    this.events = [];
    this.kills = 0;
    this.spawns = [];
    this.spawnClock = 0;
    this.elapsed = 0;
  }

  canPlace(type, x, z) {
    if (!this.loadout.includes(type)) return 'Not in loadout';
    const tile = nearestTile(x, z);
    if (!tile || Math.abs(tile.x - x) > .05 || Math.abs(tile.z - z) > .05) return 'Outside the build grid';
    if (distanceToPath(x, z) < 1.48) return 'Too close to the route';
    if (this.towers.some(t => distance(t, tile) < 1.75)) return 'Tile occupied';
    if (this.cash < TOWERS[type].cost) return 'Not enough cash';
    if (this.phase === 'victory' || this.phase === 'defeat') return 'Battle ended';
    return null;
  }

  place(type, x, z) {
    const error = this.canPlace(type, x, z);
    if (error) return { error };
    const tower = { id: nextId++, type, x, z, level: 0, spent: TOWERS[type].cost, cooldown: .1, target: 'first', shots: 0 };
    this.towers.push(tower);
    this.cash -= tower.spent;
    this.events.push({ type: 'place', tower });
    return { tower };
  }

  upgrade(id) {
    const tower = this.towers.find(t => t.id === id);
    if (!tower) return { error: 'Tower not found' };
    const cost = TOWERS[tower.type].upgrades[tower.level];
    if (cost === undefined) return { error: 'Maximum level' };
    if (this.cash < cost) return { error: 'Not enough cash' };
    this.cash -= cost;
    tower.spent += cost;
    tower.level++;
    this.events.push({ type: 'upgrade', tower });
    return { tower };
  }

  sell(id) {
    const index = this.towers.findIndex(t => t.id === id);
    if (index < 0) return { error: 'Tower not found' };
    const [tower] = this.towers.splice(index, 1);
    const refund = Math.floor(tower.spent * .7);
    this.cash += refund;
    this.events.push({ type: 'sell', tower });
    return { refund };
  }

  startWave() {
    if (this.phase !== 'build') return false;
    this.wave++;
    this.phase = 'wave';
    this.spawns = makeWave(this.wave, this.mode);
    this.spawnClock = 0;
    this.events.push({ type: 'wave', wave: this.wave });
    return true;
  }

  spawn(type, progress = 0) {
    const data = ENEMIES[type];
    const scale = (1 + (this.wave - 1) * .12) * MODES[this.mode].difficulty;
    const pos = positionOnPath(progress);
    const enemy = { id: nextId++, type, x: pos.x, z: pos.z, progress,
      hp: Math.round(data.hp * scale), maxHp: Math.round(data.hp * scale), speed: data.speed,
      slowUntil: 0, bounty: Math.round(data.bounty * Math.sqrt(scale)), leak: data.leak };
    this.enemies.push(enemy);
    this.events.push({ type: 'spawn', enemy });
    return enemy;
  }

  targetFor(tower, stats) {
    const data = TOWERS[tower.type];
    const candidates = this.enemies.filter(e => {
      const enemy = ENEMIES[e.type];
      return distance(tower, e) <= stats.range && (!enemy.air || data.air) && (!enemy.hidden || stats.detect);
    });
    if (tower.target === 'last') candidates.sort((a, b) => a.progress - b.progress);
    else if (tower.target === 'strong') candidates.sort((a, b) => b.hp - a.hp);
    else if (tower.target === 'near') candidates.sort((a, b) => distance(tower, a) - distance(tower, b));
    else candidates.sort((a, b) => b.progress - a.progress);
    return candidates[0];
  }

  hit(enemy, rawDamage, tower, stats) {
    if (!this.enemies.includes(enemy)) return;
    const data = ENEMIES[enemy.type], kind = TOWERS[tower.type];
    const amount = Math.round(rawDamage * (data.armor && !kind.energy && !kind.pierce ? .55 : 1));
    enemy.hp -= amount;
    if (stats.slow) enemy.slowUntil = this.elapsed + 2.2 + tower.level * .25;
    if (enemy.hp > 0) return;
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.cash += enemy.bounty;
    this.kills++;
    this.events.push({ type: 'destroy', enemy });
    if (data.split) {
      for (let i = 0; i < 2; i++) {
        const child = this.spawn('skitter', Math.max(0, enemy.progress - .2 - i * .5));
        child.hp *= .65;
        child.maxHp = child.hp;
        child.bounty = Math.ceil(child.bounty * .4);
      }
    }
  }

  step(dt) {
    if (this.phase !== 'wave') return;
    dt = clamp(dt, 0, .1);
    this.elapsed += dt;
    this.spawnClock += dt;
    while (this.spawns.length && this.spawns[0].at <= this.spawnClock) {
      this.spawn(this.spawns.shift().type);
    }
    for (const enemy of [...this.enemies]) {
      const data = ENEMIES[enemy.type];
      const factor = enemy.slowUntil > this.elapsed ? .52 : 1;
      enemy.progress += enemy.speed * factor * dt;
      if (enemy.progress >= totalLength) {
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        this.health = Math.max(0, this.health - enemy.leak);
        this.events.push({ type: 'leak', enemy, health: this.health });
        if (!this.health) {
          this.phase = 'defeat';
          this.events.push({ type: 'end', outcome: 'defeat' });
          return;
        }
      } else {
        const pos = positionOnPath(enemy.progress);
        enemy.x = pos.x;
        enemy.z = pos.z;
        if (data.regen) enemy.hp = Math.min(enemy.maxHp, enemy.hp + data.regen * dt);
      }
    }
    for (const tower of this.towers) {
      if (tower.type === 'relay') continue;
      const stats = towerStats(tower);
      const supported = this.towers.some(t => t.type === 'relay' && t.id !== tower.id && distance(t, tower) < towerStats(t).range);
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const enemy = this.targetFor(tower, stats);
      if (!enemy) { tower.cooldown = 0; continue; }
      tower.cooldown = 1 / (stats.rate * (supported ? 1.16 : 1));
      tower.shots++;
      this.events.push({ type: 'shot', tower, enemy, color: TOWERS[tower.type].color, splash: stats.splash });
      if (stats.splash) {
        for (const other of [...this.enemies]) {
          if (distance(enemy, other) <= stats.splash) this.hit(other, stats.damage, tower, stats);
        }
      } else this.hit(enemy, stats.damage, tower, stats);
    }
    if (!this.spawns.length && !this.enemies.length) {
      const bonus = 80 + this.wave * 15 + this.towers.filter(t => t.type === 'relay').reduce((sum, t) => sum + towerStats(t).income, 0);
      this.cash += bonus;
      if (this.wave >= MODES[this.mode].waves) {
        this.phase = 'victory';
        this.events.push({ type: 'end', outcome: 'victory', bonus });
      } else {
        this.phase = 'build';
        this.events.push({ type: 'clear', wave: this.wave, bonus });
      }
    }
  }
}
