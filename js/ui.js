/**
 * Game shell: deployment UI, camera rig, input handling, campaign flow.
 *
 * The loop mirrors the real game — pick a mode, spend a budget placing units on
 * your half of the field, press start, then lose all control and watch. Slow
 * motion exists because the best moments go past too fast at normal speed.
 */

import { Sim, HALF_W, HALF_D } from './battle.js';
import { Renderer, TEAM_NAME } from './render.js';
import { FACTIONS, UNIT_BY_ID, unitsOf } from './units.js';
import { LEVELS, deployLevel } from './campaign.js';
import { initAudio, resumeAudio, sfx, setAudioEnabled } from './audio.js';
import { clamp } from './physics.js';

const SAVE_KEY = 'wbs.progress.v1';

/** Orbiting camera rig: a target point on the field plus yaw/pitch/distance. */
class CameraRig {
  constructor() {
    this.reset();
  }

  /**
   * The default view sits behind the blue line looking across at the enemy —
   * your army in the foreground, theirs on the far side. It reads as "your
   * side of the field" far better than a neutral overhead shot.
   */
  reset() {
    this.tx = -2;
    this.ty = 2;
    this.tz = 0;
    this.yaw = -Math.PI / 2;
    this.pitch = 0.46;
    this.dist = 74;
    this.wantDist = 74;
  }

  apply(cam, dt) {
    this.dist += (this.wantDist - this.dist) * Math.min(1, dt * 12);
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.tx + Math.sin(this.yaw) * cp * this.dist,
      this.ty + Math.sin(this.pitch) * this.dist,
      this.tz + Math.cos(this.yaw) * cp * this.dist
    );
    cam.lookAt(this.tx, this.ty, this.tz);
  }

  /** Pan across the ground in the direction the camera is facing. */
  pan(dx, dz) {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.tx += dx * c - dz * s;
    this.tz += -dx * s - dz * c;
    this.tx = clamp(this.tx, -HALF_W - 12, HALF_W + 12);
    this.tz = clamp(this.tz, -HALF_D - 12, HALF_D + 12);
  }
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.gfx = new Renderer(this.canvas);
    this.rig = new CameraRig();
    this.sim = new Sim();

    this.mode = 'campaign';
    this.level = 0;
    this.faction = FACTIONS[0].id;
    this.selected = null;
    this.placeTeam = 0;
    this.speed = 1;
    this.paused = false;
    this.sound = true;

    this.pointer = { down: false, button: 0, orbit: false, pan: false, lx: 0, ly: 0, moved: 0 };
    this.keys = new Set();
    this.lastPlace = null;

    this.progress = this.load();
    this.sim.onEvent = (kind, data) => this.onSimEvent(kind, data);

    this.buildPanel();
    this.bind();
    this.loadLevel(this.firstUnbeaten());
    this.resize();
  }

  // ---- persistence ----------------------------------------------------

  load() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY)) || { beaten: [] };
    } catch {
      return { beaten: [] };
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
    } catch {
      /* private browsing; progress just won't persist */
    }
  }

  firstUnbeaten() {
    for (let i = 0; i < LEVELS.length; i++) {
      if (!this.progress.beaten.includes(LEVELS[i].id)) return i;
    }
    return 0;
  }

  // ---- level / mode ---------------------------------------------------

  loadLevel(i) {
    this.level = clamp(i, 0, LEVELS.length - 1);
    this.sim.reset();
    if (this.mode === 'campaign') {
      deployLevel(this.sim, LEVELS[this.level], HALF_W, HALF_D);
    }
    this.rig.reset();
    this.hideResult();
    this.refresh();
  }

  setMode(m) {
    this.mode = m;
    this.placeTeam = 0;
    document.getElementById('campaignBox').hidden = m !== 'campaign';
    document.getElementById('teamBox').hidden = m !== 'sandbox';
    for (const b of document.querySelectorAll('[data-mode]')) {
      b.classList.toggle('on', b.dataset.mode === m);
    }
    this.loadLevel(this.level);
  }

  get budget() {
    return this.mode === 'campaign' ? LEVELS[this.level].budget : Infinity;
  }

  get spent() {
    return this.sim.cost(0);
  }

  canAfford(def) {
    return this.mode === 'sandbox' || this.spent + def.cost <= this.budget;
  }

  // ---- panel ----------------------------------------------------------

  buildPanel() {
    const lv = document.getElementById('levelList');
    lv.innerHTML = '';
    LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'level';
      b.dataset.i = i;
      b.innerHTML = `<span class="ln">${i + 1}</span><span class="lt">${l.name}</span><span class="lb">${l.budget}</span>`;
      b.addEventListener('click', () => {
        this.loadLevel(i);
        this.closePanelOnMobile();
      });
      lv.appendChild(b);
    });

    const ft = document.getElementById('factionTabs');
    ft.innerHTML = '';
    for (const f of FACTIONS) {
      const b = document.createElement('button');
      b.className = 'ftab';
      b.dataset.f = f.id;
      b.textContent = f.name;
      b.style.setProperty('--fc', f.color);
      b.title = f.blurb;
      b.addEventListener('click', () => {
        this.faction = f.id;
        this.renderUnitGrid();
      });
      ft.appendChild(b);
    }

    this.renderUnitGrid();
  }

  renderUnitGrid() {
    const grid = document.getElementById('unitGrid');
    grid.innerHTML = '';
    for (const u of unitsOf(this.faction)) {
      const b = document.createElement('button');
      b.className = 'ucard';
      b.dataset.u = u.id;
      const role = u.speed === 0 ? 'Siege' : u.type === 'ranged' ? 'Ranged' : 'Melee';
      b.innerHTML = `
        <span class="uname">${u.name}</span>
        <span class="urole">${u.boss ? 'Boss · ' : ''}${role}</span>
        <span class="ustats"><i title="Health">♥ ${u.hp}</i><i title="Damage per hit">⚔ ${u.dmg}</i></span>
        <span class="ucost">${u.cost}</span>`;
      b.addEventListener('click', () => {
        this.selected = this.selected === u.id ? null : u.id;
        this.refresh();
      });
      grid.appendChild(b);
    }
    this.refresh();
  }

  refresh() {
    for (const b of document.querySelectorAll('.ftab')) {
      b.classList.toggle('on', b.dataset.f === this.faction);
    }
    for (const b of document.querySelectorAll('.ucard')) {
      const def = UNIT_BY_ID[b.dataset.u];
      b.classList.toggle('on', this.selected === def.id);
      b.classList.toggle('broke', !this.canAfford(def));
    }
    for (const b of document.querySelectorAll('.level')) {
      const i = +b.dataset.i;
      b.classList.toggle('on', i === this.level);
      b.classList.toggle('done', this.progress.beaten.includes(LEVELS[i].id));
    }

    const spent = this.spent;
    const bud = this.budget;
    document.getElementById('spent').textContent = spent.toLocaleString();
    document.getElementById('budget').textContent = bud === Infinity ? '∞' : bud.toLocaleString();
    const bar = document.getElementById('budgetFill');
    bar.style.width = bud === Infinity ? '100%' : `${clamp((spent / bud) * 100, 0, 100)}%`;
    bar.classList.toggle('full', bud !== Infinity && spent > bud * 0.92);

    this.updateCounts();

    const hint = document.getElementById('levelHint');
    hint.hidden = this.mode !== 'campaign';
    if (this.mode === 'campaign') hint.textContent = LEVELS[this.level].hint;

    for (const b of document.querySelectorAll('[data-team]')) {
      b.classList.toggle('on', +b.dataset.team === this.placeTeam);
    }
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.classList.toggle('on', +b.dataset.speed === this.speed && !this.paused);
    }

    document.getElementById('startBtn').textContent =
      this.sim.state === 'deploy' ? 'Start battle' : 'Reset';
  }

  updateCounts() {
    document.getElementById('blueCount').textContent = this.sim.countAlive(0);
    document.getElementById('redCount').textContent = this.sim.countAlive(1);
  }

  // ---- input ----------------------------------------------------------

  bind() {
    window.addEventListener('resize', () => this.resize());
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      initAudio();
      resumeAudio();
      const p = this.pointer;
      p.down = true;
      p.button = e.button;
      p.moved = 0;
      p.lx = e.clientX;
      p.ly = e.clientY;
      p.pan = e.shiftKey || e.button === 1;
      p.orbit = !p.pan && (e.button === 2 || !this.selected || this.sim.state !== 'deploy');

      if (!p.orbit && !p.pan && e.button === 0) {
        this.lastPlace = null;
        this.placeAt(e);
      }
    });

    cv.addEventListener('pointermove', (e) => {
      const p = this.pointer;
      this.updateGhost(e);
      if (!p.down) return;
      const dx = e.clientX - p.lx;
      const dy = e.clientY - p.ly;
      p.moved += Math.abs(dx) + Math.abs(dy);
      p.lx = e.clientX;
      p.ly = e.clientY;

      if (p.pan) {
        const k = this.rig.dist * 0.0016;
        this.rig.pan(-dx * k, -dy * k);
      } else if (p.orbit) {
        this.rig.yaw -= dx * 0.005;
        this.rig.pitch = clamp(this.rig.pitch + dy * 0.004, 0.06, 1.45);
      } else if (this.selected) {
        this.placeAt(e);
      }
    });

    const up = (e) => {
      const p = this.pointer;
      // A right-click that did not turn into an orbit drag removes a unit.
      if (p.down && p.button === 2 && p.moved < 6) this.removeAt(e);
      p.down = false;
      p.orbit = false;
      p.pan = false;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => {
      this.pointer.down = false;
    });
    cv.addEventListener('pointerleave', () => {
      this.gfx.ghost.visible = false;
    });

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.rig.wantDist = clamp(this.rig.wantDist * Math.exp(e.deltaY * 0.0011), 9, 150);
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'tab') {
        e.preventDefault();
        this.toggleStart();
      } else if (k === 'r') {
        this.loadLevel(this.level);
      } else if (k === 't') {
        this.paused = !this.paused;
        this.refresh();
      } else if (k === 'escape') {
        this.selected = null;
        this.refresh();
      } else if (k >= '1' && k <= '7') {
        const u = unitsOf(this.faction)[+k - 1];
        if (u) {
          this.selected = u.id;
          this.refresh();
        }
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    document.getElementById('startBtn').addEventListener('click', () => {
      initAudio();
      resumeAudio();
      this.toggleStart();
    });
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.sim.clearTeam(0);
      this.refresh();
    });
    document.getElementById('panelToggle').addEventListener('click', () => {
      document.body.classList.toggle('panel-closed');
      this.resize();
    });

    for (const b of document.querySelectorAll('[data-mode]')) {
      b.addEventListener('click', () => this.setMode(b.dataset.mode));
    }
    for (const b of document.querySelectorAll('[data-team]')) {
      b.addEventListener('click', () => {
        this.placeTeam = +b.dataset.team;
        this.refresh();
      });
    }
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.addEventListener('click', () => this.setSpeed(+b.dataset.speed));
    }
    document.getElementById('soundBtn').addEventListener('click', (e) => {
      this.sound = !this.sound;
      setAudioEnabled(this.sound);
      e.currentTarget.classList.toggle('off', !this.sound);
      e.currentTarget.textContent = this.sound ? '🔊' : '🔇';
    });
    document.getElementById('retryBtn').addEventListener('click', () => this.loadLevel(this.level));
    document.getElementById('nextBtn').addEventListener('click', () => this.loadLevel(this.level + 1));
  }

  setSpeed(s) {
    this.speed = s;
    this.paused = false;
    this.refresh();
  }

  toggleStart() {
    if (this.sim.state === 'deploy') {
      if (this.sim.countAlive(0) === 0) return;
      this.sim.start();
      this.selected = null;
      this.gfx.ghost.visible = false;
      sfx('start');
    } else {
      this.loadLevel(this.level);
    }
    this.refresh();
  }

  /** Raycasts the pointer onto the terrain. Returns a Vector3 or null. */
  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    return this.gfx.pickGround(nx, ny);
  }

  validSpot(x, team) {
    if (Math.abs(x) > HALF_W - 1) return false;
    if (this.mode === 'campaign') return x < -1.5;
    return team === 0 ? x < -1.5 : x > 1.5;
  }

  placeAt(e) {
    if (this.sim.state !== 'deploy' || !this.selected) return;
    const def = UNIT_BY_ID[this.selected];
    const hit = this.pick(e);
    if (!hit || !this.validSpot(hit.x, this.placeTeam) || !this.canAfford(def)) return;
    // Spacing so a drag lays out a rank instead of a single heap.
    const gap = 0.95 * (def.size ?? 1);
    if (this.lastPlace && Math.hypot(hit.x - this.lastPlace.x, hit.z - this.lastPlace.z) < gap) {
      return;
    }
    this.lastPlace = { x: hit.x, z: hit.z };
    this.sim.spawn(this.selected, this.placeTeam, hit.x, hit.z);
    sfx('place');
    this.refresh();
  }

  removeAt(e) {
    if (this.sim.state !== 'deploy') return;
    const hit = this.pick(e);
    if (!hit) return;
    let best = null;
    let bd = 2.2;
    for (const u of this.sim.units) {
      if (this.mode === 'campaign' && u.team !== 0) continue;
      const d = Math.hypot(u.x - hit.x, u.z - hit.z);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) {
      this.sim.remove(best);
      this.refresh();
    }
  }

  updateGhost(e) {
    const g = this.gfx.ghost;
    if (this.sim.state !== 'deploy' || !this.selected || this.pointer.orbit || this.pointer.pan) {
      g.visible = false;
      return;
    }
    const hit = this.pick(e);
    const def = UNIT_BY_ID[this.selected];
    if (!hit) {
      g.visible = false;
      return;
    }
    const ok = this.validSpot(hit.x, this.placeTeam) && this.canAfford(def);
    const s = def.size ?? 1;
    g.visible = true;
    g.scale.set(s, s, s);
    g.position.set(hit.x, hit.y + 0.9 * s, hit.z);
    g.material.color.setHex(ok ? (this.placeTeam === 0 ? 0x4a8be8 : 0xe25555) : 0x666666);
    g.material.opacity = ok ? 0.5 : 0.2;
  }

  // ---- events ---------------------------------------------------------

  onSimEvent(kind, data) {
    if (kind === 'over') this.showResult(data);
    else sfx(kind);
  }

  showResult(winner) {
    const won = winner === 0;
    if (this.mode === 'campaign' && won) {
      const id = LEVELS[this.level].id;
      if (!this.progress.beaten.includes(id)) {
        this.progress.beaten.push(id);
        this.save();
      }
    }
    const title = document.getElementById('resultTitle');
    title.textContent = winner === -1 ? 'Mutual annihilation' : won ? 'Victory' : 'Defeat';
    title.className = won ? 'win' : 'lose';
    document.getElementById('resultSub').textContent =
      winner === -1
        ? 'Everybody fell over. Nobody got up.'
        : `${TEAM_NAME[winner]} holds the field after ${this.sim.time.toFixed(1)}s.`;
    document.getElementById('nextBtn').hidden = !(
      this.mode === 'campaign' && won && this.level < LEVELS.length - 1
    );
    document.getElementById('result').hidden = false;
    sfx(won ? 'win' : 'lose');
    this.refresh();
  }

  hideResult() {
    document.getElementById('result').hidden = true;
  }

  // ---- loop -----------------------------------------------------------

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gfx.resize(Math.max(1, r.width), Math.max(1, r.height), dpr);
    this.cssW = r.width;
    this.cssH = r.height;
  }

  panFromKeys(dt) {
    const k = this.keys;
    const sp = this.rig.dist * 0.55 * dt;
    let dx = 0;
    let dz = 0;
    if (k.has('a') || k.has('arrowleft')) dx -= sp;
    if (k.has('d') || k.has('arrowright')) dx += sp;
    if (k.has('w') || k.has('arrowup')) dz -= sp;
    if (k.has('s') || k.has('arrowdown')) dz += sp;
    if (dx || dz) this.rig.pan(dx, dz);
    if (k.has('q')) this.rig.wantDist = clamp(this.rig.wantDist * 0.985, 9, 150);
    if (k.has('e')) this.rig.wantDist = clamp(this.rig.wantDist * 1.015, 9, 150);
  }

  run() {
    let last = performance.now();
    let tick = 0;

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      this.panFromKeys(dt);
      // Holding F is the slow-motion button, exactly as in the real game.
      const slow = this.keys.has('f') ? 0.18 : this.keys.has('g') ? 0.06 : 1;
      if (!this.paused) this.sim.update(dt, this.speed * slow);

      const r = this.canvas.getBoundingClientRect();
      if (Math.abs(r.width - this.cssW) > 1 || Math.abs(r.height - this.cssH) > 1) this.resize();

      this.rig.apply(this.gfx.camera, dt);
      this.gfx.sync(this.sim, this);
      this.gfx.render();

      tick += dt;
      if (tick > 0.2) {
        tick = 0;
        this.updateCounts();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  closePanelOnMobile() {
    if (window.innerWidth < 820) {
      document.body.classList.add('panel-closed');
      this.resize();
    }
  }
}
