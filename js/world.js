// The simulation: physics, weapon hit resolution, damage, pickups, win state.

import {
  TAU, clamp, rand, randInt, pick, chance, distPointSeg, setLength, withAlpha, lerp,
} from './utils.js';
import { ARENA, PHYSICS, SETTINGS, SUPER_CHARGE_MAX, RAGE, sizeArena, applyArenaShrink } from './config.js';
import { WEAPONS } from './weapons.js';
import { ABILITIES, tickStatus } from './abilities.js';
import { Ball } from './ball.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';

// Beyond this separation, steering actively closes the gap instead of orbiting.
const CLOSE_RANGE = 250;

export class World {
  constructor() {
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
    this.fx = new FX();
    this.state = 'idle';       // idle | running | over
    this.winner = null;
    this.time = 0;
    this.pickupTimer = 3;
    this.endTimer = 0;
    this.rageAnnounced = false;
  }

  /** Build a fresh battle from roster entries: {name, color, weapon, ability}. */
  start(roster) {
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
    this.fx.clear();
    this.time = 0;
    this.pickupTimer = 3;
    this.winner = null;
    this.endTimer = 0;
    this.rageAnnounced = false;

    const n = roster.length;
    sizeArena(n);
    applyArenaShrink(1);
    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    // Spread the fighters on an ellipse matching the arena, so a big roster uses
    // the full height instead of clumping into the middle.
    const spawnRx = ARENA.w * 0.34;
    const spawnRy = ARENA.h * 0.36;

    roster.forEach((entry, i) => {
      const a = (i / n) * TAU - Math.PI / 2;
      const ball = new Ball({
        name: entry.name,
        color: entry.color,
        weapon: entry.weapon,
        ability: entry.ability,
        x: cx + Math.cos(a) * spawnRx,
        y: cy + Math.sin(a) * spawnRy,
        angle: a + Math.PI + rand(-0.6, 0.6),
      });
      ball.world = this;
      this.balls.push(ball);
    });

    this.state = 'running';
  }

  get living() { return this.balls.filter((b) => b.alive); }

  /** Global damage multiplier that climbs once a match drags on. */
  get rageMult() {
    if (this.time < RAGE.start) return 1;
    return Math.min(RAGE.max, 1 + (this.time - RAGE.start) / RAGE.ramp);
  }

  /** Healing fades to nothing across the same window. Ramping damage alone did
   *  not guarantee an ending: a regen or vampire ball could out-heal even a 3x
   *  multiplier when hits were landing slowly. With healing gated to zero, any
   *  connected hit is permanent progress and every match terminates. */
  get healMult() {
    if (this.time < RAGE.start) return 1;
    return clamp(1 - (this.time - RAGE.start) / RAGE.ramp, 0, 1);
  }

  /** Walls close in during sudden death. Ramping damage cannot end a fight that
   *  never makes contact, and a duel is exactly that case — so the cage itself
   *  removes the space the balls were using to avoid each other. */
  get arenaShrink() {
    if (this.time < RAGE.start) return 1;
    const t = clamp((this.time - RAGE.start) / RAGE.ramp, 0, 1);
    return 1 - (1 - RAGE.minArena) * t;
  }

  nearestEnemy(ball) {
    let best = null;
    let bestD = Infinity;
    for (const other of this.balls) {
      if (other === ball || !other.alive) continue;
      const d = (other.x - ball.x) ** 2 + (other.y - ball.y) ** 2;
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  onShoot() { Sound.shoot(); }

  // ---------------------------------------------------------------- stepping

  step(dt) {
    if (this.state !== 'running') {
      this.fx.update(dt);
      if (this.state === 'over') this.endTimer += dt;
      return;
    }

    this.time += dt;

    applyArenaShrink(this.arenaShrink);

    if (!this.rageAnnounced && this.time >= RAGE.start) {
      this.rageAnnounced = true;
      this.fx.kill('SUDDEN DEATH — walls closing', '#ff5b6e');
      this.fx.addFlash('#ff5b6e', 0.35);
    }

    // Movement + collisions run in substeps: fast balls with big weapons would
    // otherwise pass through each other between frames.
    const sub = dt / PHYSICS.substeps;
    for (let s = 0; s < PHYSICS.substeps; s++) {
      for (const b of this.balls) {
        if (!b.alive) continue;
        this.steer(b, sub);
        this.integrate(b, sub);
        this.collideWalls(b);
      }
      this.collideBalls();
    }

    for (const b of this.balls) {
      if (!b.alive) continue;
      b.recordTrail();
      b.hitFlash = Math.max(0, b.hitFlash - dt);

      // Tick down per-target hit cooldowns.
      for (const [k, v] of b.hitCd) {
        const nv = v - dt;
        if (nv <= 0) b.hitCd.delete(k); else b.hitCd.set(k, nv);
      }

      WEAPONS[b.weaponKey].update(b, this, dt);
      const ab = ABILITIES[b.abilityKey];
      if (ab && ab.update) ab.update(b, this, dt);

      // Poison can finish a ball off here, so re-check before anything else runs.
      tickStatus(b, this, dt);
      if (!b.alive) continue;

      if (b.superReady) this.tryFireSuper(b);
    }

    this.resolveWeaponHits();
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.fx.update(dt);
    this.checkWin();
  }

  /** Nudge a ball toward whatever it currently wants: a pickup, or a fight. */
  steer(ball, dt) {
    if (SETTINGS.aggression <= 0) return;

    let tx = null;
    let ty = null;

    // Hurt balls prefer a nearby heart over a fight — the "smart targeting"
    // behaviour these sims use to keep matches from stalling out.
    if (ball.hpFrac < 0.55 && this.pickups.length) {
      let best = null;
      let bestD = Infinity;
      for (const p of this.pickups) {
        if (p.type !== 'heart') continue;
        const d = (p.x - ball.x) ** 2 + (p.y - ball.y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) { tx = best.x; ty = best.y; }
    }

    if (tx === null) {
      const enemy = this.nearestEnemy(ball);
      if (enemy) { tx = enemy.x; ty = enemy.y; }
    }
    if (tx === null) return;

    const dx = tx - ball.x;
    const dy = ty - ball.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const accel = SETTINGS.aggression * 1500;
    ball.vx += nx * accel * dt;
    ball.vy += ny * accel * dt;

    // Two balls that simply accelerate toward each other at a fixed speed do not
    // collide — they settle into a stable mutual orbit (v^2/a ~= 210px radius)
    // and circle just outside weapon reach forever. That was the stalemate:
    // full health on both sides with almost no contact for minutes.
    //
    // Bleeding off the sideways component of velocity when the target is far
    // turns that orbit into a closing spiral. Near range is left untouched so
    // the bouncing still looks chaotic rather than magnetic.
    if (dist > CLOSE_RANGE) {
      const tangential = -ball.vx * ny + ball.vy * nx;
      const f = clamp((dist - CLOSE_RANGE) / 420, 0, 1) * 3.4 * dt * SETTINGS.aggression;
      ball.vx += ny * tangential * f;
      ball.vy -= nx * tangential * f;
    }
  }

  integrate(ball, dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Ease the speed back to its nominal value. Doing it gradually (instead of
    // hard-normalising) lets knockback and recoil actually read on screen.
    const sp = Math.hypot(ball.vx, ball.vy);
    const target = ball.speed;
    if (sp > 1e-4) {
      const k = 1 - Math.pow(0.02, dt);
      const next = lerp(sp, target, k);
      ball.vx = (ball.vx / sp) * next;
      ball.vy = (ball.vy / sp) * next;
    } else {
      const a = rand(0, TAU);
      ball.vx = Math.cos(a) * target;
      ball.vy = Math.sin(a) * target;
    }
  }

  collideWalls(ball) {
    const r = ball.r;
    let hit = false;
    if (ball.x - r < ARENA.x) { ball.x = ARENA.x + r; ball.vx = Math.abs(ball.vx) * PHYSICS.wallRestitution; hit = true; }
    else if (ball.x + r > ARENA.x + ARENA.w) { ball.x = ARENA.x + ARENA.w - r; ball.vx = -Math.abs(ball.vx) * PHYSICS.wallRestitution; hit = true; }
    if (ball.y - r < ARENA.y) { ball.y = ARENA.y + r; ball.vy = Math.abs(ball.vy) * PHYSICS.wallRestitution; hit = true; }
    else if (ball.y + r > ARENA.y + ARENA.h) { ball.y = ARENA.y + ARENA.h - r; ball.vy = -Math.abs(ball.vy) * PHYSICS.wallRestitution; hit = true; }

    if (hit) {
      ball.wallCd = (ball.wallCd || 0);
      if (ball.wallCd <= 0) {
        Sound.bounce(0.6);
        ball.wallCd = 0.08;
      }
    }
    if (ball.wallCd > 0) ball.wallCd -= 1 / 60 / PHYSICS.substeps;
  }

  collideBalls() {
    const list = this.living;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist || distSq === 0) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        const ma = a.mass;
        const mb = b.mass;
        const total = ma + mb;

        // Positional correction, weighted so heavy balls shove light ones.
        a.x -= nx * overlap * (mb / total) * PHYSICS.separationBias;
        a.y -= ny * overlap * (mb / total) * PHYSICS.separationBias;
        b.x += nx * overlap * (ma / total) * PHYSICS.separationBias;
        b.y += ny * overlap * (ma / total) * PHYSICS.separationBias;

        // Elastic impulse along the contact normal.
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal > 0) continue; // already separating

        const e = PHYSICS.restitution;
        const jImp = (-(1 + e) * velAlongNormal) / (1 / ma + 1 / mb);
        const ix = jImp * nx;
        const iy = jImp * ny;
        a.vx -= ix / ma;
        a.vy -= iy / ma;
        b.vx += ix / mb;
        b.vy += iy / mb;

        if (!a.bumpCd || a.bumpCd <= 0) {
          Sound.bounce(0.9);
          a.bumpCd = 0.1;
          this.fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 3, 160, 4);
        }
      }
    }
    for (const b of list) if (b.bumpCd > 0) b.bumpCd -= 1 / 60 / PHYSICS.substeps;
  }

  // ------------------------------------------------------------ weapon hits

  resolveWeaponHits() {
    const list = this.living;
    for (const attacker of list) {
      const def = WEAPONS[attacker.weaponKey];
      const boxes = def.hitboxes(attacker);
      if (!boxes.length) continue;

      for (const target of list) {
        if (target === attacker) continue;
        if (attacker.hitCd.has(target.id)) continue;

        let hitBox = null;
        for (const hb of boxes) {
          if (hb.ax !== undefined) {
            const d = distPointSeg(target.x, target.y, hb.ax, hb.ay, hb.bx, hb.by);
            if (d < hb.thick / 2 + target.r) { hitBox = hb; break; }
          } else {
            const d = Math.hypot(target.x - hb.x, target.y - hb.y);
            if (d < hb.r + target.r) { hitBox = hb; break; }
          }
        }
        if (!hitBox) continue;

        const w = attacker.weapon;
        const dmg = w.dmg + w.level * (w.growDmg || 0);
        this.damage(target, dmg, attacker);

        // Escalation: the hit makes the weapon bigger and stronger.
        w.level += 1;

        attacker.hitCd.set(target.id, w.cdTime || 0.3);

        // Knock the target away from the impact.
        const [kx, ky] = setLength(target.x - attacker.x, target.y - attacker.y, 1);
        target.vx += kx * 260;
        target.vy += ky * 260;
      }
    }
  }

  // ------------------------------------------------------------- projectiles

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      let dead = p.life <= 0;

      if (!dead) {
        if (p.x - p.r < ARENA.x || p.x + p.r > ARENA.x + ARENA.w) {
          if (p.bounces > 0) { p.bounces--; p.vx *= -1; p.x = clamp(p.x, ARENA.x + p.r, ARENA.x + ARENA.w - p.r); }
          else dead = true;
        }
        if (p.y - p.r < ARENA.y || p.y + p.r > ARENA.y + ARENA.h) {
          if (p.bounces > 0) { p.bounces--; p.vy *= -1; p.y = clamp(p.y, ARENA.y + p.r, ARENA.y + ARENA.h - p.r); }
          else dead = true;
        }
      }

      if (!dead) {
        for (const b of this.living) {
          if (b.id === p.owner) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r) {
            const owner = this.balls.find((x) => x.id === p.owner) || null;
            this.damage(b, p.dmg, owner);
            if (owner && owner.alive) owner.weapon.level += owner.weapon.projGrow ?? 0.5;
            this.fx.spray(p.x, p.y, Math.atan2(p.vy, p.vx), p.color, 6, 260);
            dead = true;
            break;
          }
        }
      }

      if (dead) this.projectiles.splice(i, 1);
    }
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.fillStyle = withAlpha(p.color, 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.42, 0, TAU);
      ctx.fill();
    }
  }

  // ----------------------------------------------------------------- pickups

  updatePickups(dt) {
    if (SETTINGS.pickups) {
      this.pickupTimer -= dt;
      if (this.pickupTimer <= 0 && this.pickups.length < 6) {
        this.pickupTimer = SETTINGS.pickupInterval;
        this.spawnPickup();
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;
      let taken = false;
      for (const b of this.living) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r) {
          this.collect(b, p);
          taken = true;
          break;
        }
      }
      if (taken) this.pickups.splice(i, 1);
    }
  }

  spawnPickup() {
    const pad = 90;
    this.pickups.push({
      x: rand(ARENA.x + pad, ARENA.x + ARENA.w - pad),
      y: rand(ARENA.y + pad, ARENA.y + ARENA.h - pad),
      r: 30,
      age: 0,
      // Healing dries up late so attrition can actually finish someone off.
      type: this.time < RAGE.heartCutoff && chance(0.62) ? 'heart' : 'power',
    });
  }

  collect(ball, p) {
    if (p.type === 'heart') {
      ball.heal(28);
      this.fx.number(ball.x, ball.y - ball.r - 40, '+28', '#7ee08a');
      this.fx.ring(p.x, p.y, '#7ee08a', 120, 8);
      Sound.heal();
    } else {
      ball.weapon.level += 4;
      ball.addSuperCharge(15);
      this.fx.number(ball.x, ball.y - ball.r - 40, 'POWER UP', '#ffd166');
      this.fx.ring(p.x, p.y, '#ffd166', 130, 9);
      Sound.superReady();
    }
    this.fx.burst(p.x, p.y, p.type === 'heart' ? '#7ee08a' : '#ffd166', 16, 320, 6);
  }

  drawPickups(ctx) {
    for (const p of this.pickups) {
      const bob = Math.sin(p.age * 3) * 6;
      const y = p.y + bob;
      const color = p.type === 'heart' ? '#7ee08a' : '#ffd166';
      ctx.save();
      ctx.fillStyle = withAlpha(color, 0.28);
      ctx.beginPath();
      ctx.arc(p.x, y, p.r + 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, y, p.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.font = '900 32px ui-rounded, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type === 'heart' ? '+' : '★', p.x, y + 1);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ damage

  damage(target, amount, source, opts = {}) {
    if (!target.alive || amount <= 0) return;

    if (target.ghostInvuln > 0) {
      this.fx.number(target.x, target.y - target.r - 40, 'PHASED', '#e0e7ff');
      return;
    }

    let amt = amount * this.rageMult;

    if (source && source.alive) {
      const sab = ABILITIES[source.abilityKey];
      if (sab && sab.damageMult) amt *= sab.damageMult(source);
      if (source.berserkFrenzy > 0) amt *= 1.5;
    }

    const tab = ABILITIES[target.abilityKey];
    if (tab && tab.onTakeDamage) {
      amt = tab.onTakeDamage(target, amt, source, this);
    }
    if (amt <= 0) return;

    target.hp -= amt;
    target.hitFlash = 0.18;
    target.addSuperCharge(amt * 0.45);

    const angle = source ? Math.atan2(target.y - source.y, target.x - source.x) : rand(0, TAU);
    if (SETTINGS.showDamage) {
      this.fx.number(
        target.x, target.y - target.r - 20,
        `-${Math.round(amt)}`,
        opts.crit ? '#ffd166' : '#ffffff',
        opts.crit
      );
    }
    this.fx.spray(target.x, target.y, angle, target.color, opts.crit ? 12 : 5, 360);
    this.fx.addShake(clamp(amt * 0.35, 1.5, 12));
    Sound.hit(clamp(amt / 12, 0.5, 1.6));

    if (source && source.alive) {
      source.damageDealt += amt;
      source.addSuperCharge(amt * 0.8);
      const sab = ABILITIES[source.abilityKey];
      if (sab && sab.onDealDamage && !opts.skipOnDeal) sab.onDealDamage(source, target, amt, this);
    }

    if (target.hp <= 0) this.kill(target, source);
  }

  kill(ball, source) {
    if (!ball.alive) return;
    ball.alive = false;
    ball.hp = 0;

    this.fx.burst(ball.x, ball.y, ball.color, 54, 780, 11);
    this.fx.burst(ball.x, ball.y, '#ffffff', 20, 500, 7);
    this.fx.ring(ball.x, ball.y, ball.color, 220, 16);
    this.fx.addShake(20);
    Sound.death();

    if (source && source !== ball && source.alive) {
      source.kills += 1;
      source.addSuperCharge(30);
      this.fx.kill(`${source.name} knocked out ${ball.name}`, source.color);
    } else {
      this.fx.kill(`${ball.name} was eliminated`, ball.color);
    }

    const ab = ABILITIES[ball.abilityKey];
    if (ab && ab.onDeath) ab.onDeath(ball, this);
  }

  tryFireSuper(ball) {
    ball.superCharge = 0;
    ball.superReadyAnnounced = false;
    Sound.superFire();
    this.fx.number(ball.x, ball.y - ball.r - 90, 'SUPER', '#ffd166', true);
    const ab = ABILITIES[ball.abilityKey];
    if (ab && ab.fireSuper) ab.fireSuper(ball, this);
  }

  checkWin() {
    const alive = this.living;
    if (alive.length <= 1 && this.state === 'running') {
      this.state = 'over';
      this.winner = alive[0] || null;
      this.endTimer = 0;
      Sound.win();
      if (this.winner) {
        this.fx.ring(this.winner.x, this.winner.y, this.winner.color, 520, 26);
        this.fx.burst(this.winner.x, this.winner.y, this.winner.color, 60, 500, 10);
      }
    }
  }
}
