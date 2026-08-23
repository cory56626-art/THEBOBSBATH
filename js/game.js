import * as THREE from '../vendor/three.module.min.js';
import { CFG, COL } from './config.js';
import { World } from './scene.js';
import { makeTeam } from './character.js';
import { Rope } from './rope.js';
import { Fx } from './fx.js';
import { BotBrain } from './bots.js';

const clamp = THREE.MathUtils.clamp;

export class Game {
  constructor(canvas, sfx, hooks = {}) {
    this.sfx = sfx;
    this.hooks = hooks;
    this.world = new World(canvas);
    this.rope = new Rope(this.world.scene);
    this.fx = new Fx(this.world.scene, this.world.puffTex);

    this.state = 'idle';
    this.teamCache = new Map();

    // Your side never changes — blue, on the left, pulling toward -X.
    this.blue = makeTeam({
      side: -1, shirt: COL.blue, accent: COL.blueD,
      count: CFG.teamSize, frontX: CFG.frontX, spacing: CFG.spacing,
    });
    this.blueGroup = new THREE.Group();
    for (const c of this.blue) this.blueGroup.add(c.group);
    this.world.scene.add(this.blueGroup);

    this.redGroup = new THREE.Group();
    this.world.scene.add(this.redGroup);
    this.red = [];

    // A little marker so you always know which puller is you.
    this.youMark = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: COL.gold, emissive: 0x5a3c00, roughness: 0.3, metalness: 0.4 })
    );
    cone.rotation.x = Math.PI;
    this.youMark.add(cone);
    this.world.scene.add(this.youMark);

    this._v = new THREE.Vector3();
    this.leftGrips = [];
    this.rightGrips = [];
    for (let i = 0; i < CFG.teamSize; i++) {
      this.leftGrips.push(new THREE.Vector3());
      this.rightGrips.push(new THREE.Vector3());
    }

    this.reset();
  }

  /* ── setup ───────────────────────────────────────────────────────────── */

  setBot(def) {
    this.botDef = def;
    if (!this.teamCache.has(def.id)) {
      const team = makeTeam({
        side: 1, shirt: def.shirt, accent: def.accent,
        count: CFG.teamSize, frontX: CFG.frontX, spacing: CFG.spacing,
      });
      const g = new THREE.Group();
      for (const c of team) g.add(c.group);
      this.teamCache.set(def.id, { team, g });
    }
    if (this.redHolder) this.redGroup.remove(this.redHolder);
    const { team, g } = this.teamCache.get(def.id);
    this.red = team;
    this.redHolder = g;
    this.redGroup.add(g);
  }

  reset() {
    this.pos = 0;
    this.vel = 0;
    this.pp = 0;
    this.bp = 0;
    this.elapsed = 0;
    this.taps = 0;
    this.tapTimes = [];
    this.botTapTimes = [];
    this.cps = 0;
    this.botCps = 0;
    this.peakCps = 0;
    this.surge = 0;
    this.surgeLeft = 0;
    this.goalNow = CFG.goal;
    this.overT = 0;
    this.won = false;
    this.lastPopLead = 0;
    this.streak = 0;
    this.blueGroup.position.x = 0;
    this.redGroup.position.x = 0;
    this.world.setGoalDistance(CFG.goal);
    this.world.setZoom(1);
    this.fx.clearConfetti();
    for (const c of this.blue) c.setMood('idle');
    for (const c of this.red) c.setMood('idle');
  }

  /* ── flow ────────────────────────────────────────────────────────────── */

  beginCountdown() {
    this.reset();
    this.brain = new BotBrain(this.botDef);
    this.state = 'countdown';
    this.world.aimFactor = 0.42;
    this.cdLeft = 3.35;
    this.cdShown = -1;
    for (const c of this.blue) c.setMood('ready');
    for (const c of this.red) c.setMood('ready');
    this.world.setZoom(1.06);
  }

  abort() {
    this.state = 'idle';
    this.reset();
  }

  /* ── input ───────────────────────────────────────────────────────────── */

  tap() {
    if (this.state !== 'play') return;
    this.taps++;
    this.tapTimes.push(this.elapsed);
    this.pp += CFG.clickPower;
    if (this.surge < 100) this.surge = Math.min(100, this.surge + CFG.surgeGain);

    const front = this.blue[0];
    for (const c of this.blue) c.tug(1);
    this.sfx.tap();
    if (Math.random() < 0.4) this.sfx.creak();

    front.ropeAnchor(this._v);
    this.fx.puff(front.group.position.x + this.blueGroup.position.x - 0.2, 0.12, front.group.position.z,
                 { color: 0xe7dcc0, size: 0.42, life: 0.4, up: 0.9, spread: 0.5 });
  }

  useSurge() {
    if (this.state !== 'play' || this.surge < 100 || this.surgeLeft > 0) return false;
    this.surge = 0;
    this.surgeLeft = CFG.surgeTime;
    this.sfx.surge();
    this.world.shake(0.6);
    this.world.cheer(0.8);
    const p = this.blue[0].group.getWorldPosition(this._v);
    this.fx.ring(p.x, 0.1, p.z, 0xffd24a);
    this.hooks.onPop?.('SURGE!', { color: '#ffd24a', size: 46 });
    return true;
  }

  /* ── per-frame ───────────────────────────────────────────────────────── */

  frame(dt) {
    if (this.state === 'countdown') this._countdown(dt);
    else if (this.state === 'play') this._play(dt);
    else if (this.state === 'over') this._over(dt);
    else this._idle(dt);

    this._poseTeams(dt);
    this.fx.update(dt);
    this.world.update(dt, this.state === 'idle' ? 0 : this.pos);
    this.world.render();
  }

  _idle(dt) {
    const t = this.world.time;
    this.world.setZoom(1.28);
    this.world.aimFactor = 0.42;
    this.pos = Math.sin(t * 0.35) * 0.22;
    for (const c of this.blue) c.setMood('idle');
    for (const c of this.red) c.setMood('idle');
    this.pp = this.bp = 0;
  }

  _countdown(dt) {
    this.cdLeft -= dt;
    const n = Math.ceil(this.cdLeft - 0.35);
    if (n !== this.cdShown) {
      this.cdShown = n;
      if (n >= 1) { this.hooks.onCountdown?.(String(n)); this.sfx.beep(false); }
      else if (n === 0) { this.hooks.onCountdown?.('PULL!'); this.sfx.whistle(); this.world.cheer(1.2); }
    }
    if (this.cdLeft <= 0) {
      this.state = 'play';
      this.hooks.onCountdown?.(null);
      for (const c of this.blue) c.setMood('pull');
      for (const c of this.red) c.setMood('pull');
    }
  }

  _play(dt) {
    this.elapsed += dt;

    // Pull decays exponentially, so a steady tap rate settles at a steady pull.
    const decay = Math.pow(0.5, dt / CFG.halfLife);
    this.pp *= decay;
    this.bp *= decay;

    const lead = clamp(-this.pos / this.goalNow, -1, 1);   // +1 = you're winning
    const taps = this.brain.update(dt, lead);
    for (let i = 0; i < taps; i++) {
      this.bp += CFG.clickPower;
      this.botTapTimes.push(this.elapsed);
      for (const c of this.red) c.tug(1);
    }
    if (taps && Math.random() < 0.25) this.sfx.creak();

    if (this.surgeLeft > 0) this.surgeLeft -= dt;
    const mult = this.surgeLeft > 0 ? CFG.surgeMul : 1;

    const net = this.pp * mult - this.bp;

    // Dragging the rope further into your own half gets harder the closer the
    // knot is to the line — leads have to be earned twice.
    const adv = -this.pos / this.goalNow;
    let eff = net;
    if (net * adv > 0) eff = net / (1 + CFG.resist * adv * adv);
    const target = clamp(-eff * CFG.speed, -CFG.maxVel, CFG.maxVel);
    this.vel += (target - this.vel) * (1 - Math.exp(-dt * CFG.accel));

    // Sudden death: the chalk lines creep in so nothing stalls forever.
    const sd = clamp((this.elapsed - CFG.suddenStart) / CFG.suddenSpan, 0, 1);
    this.goalNow = CFG.goal * (1 - (1 - CFG.suddenMin) * sd);
    this.world.setGoalDistance(this.goalNow);

    this.pos = clamp(this.pos + this.vel * dt, -this.goalNow, this.goalNow);

    this._cps(dt);
    this._juice(dt, net);

    if (this.pos <= -this.goalNow) this._end(true);
    else if (this.pos >= this.goalNow) this._end(false);
  }

  _cps(dt) {
    const w = CFG.cpsWindow;
    const cut = this.elapsed - w;
    while (this.tapTimes.length && this.tapTimes[0] < cut) this.tapTimes.shift();
    while (this.botTapTimes.length && this.botTapTimes[0] < cut) this.botTapTimes.shift();
    const raw = this.tapTimes.length / w;
    const braw = this.botTapTimes.length / w;
    const k = 1 - Math.exp(-dt * 7);
    this.cps += (raw - this.cps) * k;
    this.botCps += (braw - this.botCps) * k;
    if (this.elapsed > 1.2) this.peakCps = Math.max(this.peakCps, this.cps);
  }

  _juice(dt, net) {
    const strain = clamp((this.pp + this.bp) / 7, 0, 1);
    this.strain = strain;

    // Boots scrabbling in the dirt whenever the rope is actually moving.
    const speed = Math.abs(this.vel);
    if (speed > 0.35 && Math.random() < speed * dt * 5) {
      const losing = this.vel > 0 ? this.blue[0] : this.red[0];
      const gx = losing.group.position.x + (this.vel > 0 ? this.blueGroup.position.x : this.redGroup.position.x);
      this.fx.puff(gx, 0.14, losing.group.position.z, {
        color: 0xd8c9a4, size: 0.5, life: 0.5, up: 0.8, spread: 0.8,
      });
    }
    if (strain > 0.55 && Math.random() < dt * 6) {
      const c = Math.random() < 0.5 ? this.blue[0] : this.red[0];
      const off = c === this.blue[0] ? this.blueGroup.position.x : this.redGroup.position.x;
      this.fx.sweat(c.group.position.x + off, 1.85, c.group.position.z, c === this.blue[0] ? -1 : 1);
    }

    // Milestone shouts as the knot crosses each side's territory.
    const lead = -this.pos / this.goalNow;
    const step = Math.trunc(lead * 3);
    if (step !== this.lastPopLead) {
      if (step > this.lastPopLead && step > 0) {
        this.hooks.onPop?.(['PULLING!', 'GREAT PULL!', 'ALMOST THERE!'][Math.min(step - 1, 2)],
                           { color: '#9fe8ff', size: 34 });
        this.world.cheer(0.5);
      } else if (step < this.lastPopLead && step < 0) {
        this.hooks.onPop?.(['LOSING GROUND!', 'PULL HARDER!', 'DANGER!'][Math.min(-step - 1, 2)],
                           { color: '#ffb3a2', size: 34 });
      }
      this.lastPopLead = step;
      this.world.shake(0.18);
    }

    if (this.surgeLeft > 0) this.world.shake(dt * 1.1);
    this.world.cheer(strain * dt * 0.9);
  }

  _end(won) {
    this.state = 'over';
    this.won = won;
    this.overT = 0;
    this.world.setZoom(1.2);
    this.world.aimFactor = 0.86;   // frame the pile-up, not the empty half
    this.world.shake(1.1);
    this.world.cheer(1.6);

    const winners = won ? this.blue : this.red;
    const losers = won ? this.red : this.blue;
    for (const c of winners) c.setMood('win');
    for (const c of losers) c.setMood('lose');

    this.fx.confetti(this.pos);
    this.fx.ring(this.pos, 0.1, 0, won ? 0x9fe8ff : 0xffb3a2);
    for (let i = 0; i < 10; i++) {
      this.fx.puff(this.pos + (Math.random() - 0.5) * 3, 0.2, (Math.random() - 0.5) * 3,
                   { color: 0x6b4a2f, size: 0.8, life: 0.9, up: 2.2, spread: 1.6 });
    }
    this.sfx.splat();
    won ? this.sfx.win() : this.sfx.lose();

    const stats = {
      won,
      avgCps: this.elapsed > 0 ? this.taps / this.elapsed : 0,
      peakCps: this.peakCps,
      taps: this.taps,
      time: this.elapsed,
      bot: this.botDef,
    };
    this.stats = stats;
    this.hooks.onEnd?.(stats);
  }

  _over(dt) {
    this.overT += dt;
    // Drag the losers a little further for the indignity of it.
    const extra = Math.min(1, this.overT * 1.4) * 0.9;
    const dir = this.won ? -1 : 1;
    this.pos = clamp(dir * (this.goalNow + extra), -CFG.goal - 1.2, CFG.goal + 1.2);
    this.pp *= Math.pow(0.5, dt / 0.3);
    this.bp *= Math.pow(0.5, dt / 0.3);
    if (this.overT < 1.2 && Math.random() < dt * 12) {
      this.fx.puff(this.pos + (Math.random() - 0.5) * 2.4, 0.15, (Math.random() - 0.5) * 2.4,
                   { color: 0x5d4025, size: 0.6, life: 0.7, up: 1.6, spread: 1.2 });
    }
  }

  /* ── shared posing ───────────────────────────────────────────────────── */

  _poseTeams(dt) {
    this.blueGroup.position.x = this.pos;
    this.redGroup.position.x = this.pos;

    const pe = clamp(this.pp / 4.2, 0, 1);
    const be = clamp(this.bp / 4.2, 0, 1);
    for (const c of this.blue) c.update(dt, pe);
    for (const c of this.red) c.update(dt, be);

    for (let i = 0; i < this.blue.length; i++) this.blue[i].ropeAnchor(this.leftGrips[i]);
    for (let i = 0; i < this.red.length; i++) this.red[i].ropeAnchor(this.rightGrips[i]);
    this.rope.update(dt, this.leftGrips, this.rightGrips, this.strain || 0);

    const f = this.blue[0];
    this.youMark.position.set(
      f.group.position.x + this.blueGroup.position.x,
      2.62 + Math.sin(this.world.time * 3.4) * 0.11,
      f.group.position.z
    );
    this.youMark.rotation.y = this.world.time * 1.6;
    this.youMark.visible = this.state !== 'over' || this.won;
  }

  /** World point → CSS pixels, for DOM pop-ups anchored to the action. */
  project(v) {
    const p = this._v.copy(v).project(this.world.camera);
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  playerHeadScreenPos() {
    const f = this.blue[0];
    this._v.set(f.group.position.x + this.blueGroup.position.x, 2.4, f.group.position.z);
    return this.project(this._v);
  }
}
