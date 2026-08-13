/**
 * The simulation: armies, unit AI, weapons, projectiles and abilities — in 3D.
 *
 * The AI is deliberately thin: pick the nearest enemy, walk until the weapon
 * reaches, swing. In TABS the entertainment does not come from clever tactics
 * inside a unit; it comes from a hundred simple units colliding with a physics
 * engine that does not respect anyone's plans. Keeping the brain simple is what
 * lets the bodies be funny.
 */

import { World, FIXED_DT, clamp, rand, distToSeg } from './physics.js';
import { Wobbler, HEAD, CHEST, HIP, HAND_R } from './wobbler.js';
import { UNIT_BY_ID } from './units.js';

export const HALF_W = 60;
export const HALF_D = 26;
/** How many bodies stay on the field before the oldest are cleared away. */
const MAX_CORPSES = 60;

/** Gentle rolling terrain — flat ground is stable but dull. */
export function terrainHeight(x, z) {
  return (
    Math.sin(x * 0.048) * 0.6 +
    Math.sin(z * 0.071 + 1.3) * 0.45 +
    Math.sin(x * 0.031 + z * 0.021) * 0.35
  );
}

export class Sim {
  constructor() {
    this.world = new World({
      halfW: HALF_W,
      halfD: HALF_D,
      iterations: 6,
      height: terrainHeight,
    });

    this.units = [];
    this.projectiles = [];
    this.fx = [];
    this.state = 'deploy'; // deploy | battle | over
    this.winner = null;
    this.time = 0;
    this.acc = 0;
    this.onEvent = null;
  }

  reset() {
    for (const u of this.units) u.destroy();
    this.units.length = 0;
    this.projectiles.length = 0;
    this.fx.length = 0;
    this.state = 'deploy';
    this.winner = null;
    this.time = 0;
  }

  clearTeam(team) {
    for (const u of this.units) if (u.team === team) u.destroy();
    this.units = this.units.filter((u) => u.team !== team);
  }

  groundAt(x, z) {
    return this.world.groundAt(x, z);
  }

  spawn(defId, team, x, z) {
    const def = UNIT_BY_ID[defId];
    if (!def) return null;
    const u = new Wobbler(
      this.world,
      def,
      team,
      clamp(x, -HALF_W + 1, HALF_W - 1),
      clamp(z, -HALF_D + 1, HALF_D - 1)
    );
    this.units.push(u);
    return u;
  }

  remove(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) {
      u.destroy();
      this.units.splice(i, 1);
    }
  }

  cost(team) {
    let c = 0;
    for (const u of this.units) if (u.team === team) c += u.def.cost;
    return c;
  }

  countAlive(team) {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead) n++;
    return n;
  }

  start() {
    if (this.state !== 'deploy') return;
    this.state = 'battle';
    this.time = 0;
  }

  // ---- main loop ------------------------------------------------------

  /** Advances by real seconds; internally runs a fixed timestep. */
  update(dt, speed = 1) {
    this.acc += Math.min(dt, 0.1) * speed;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 8) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === 8) this.acc = 0; // don't spiral if we fell behind
  }

  step(dt) {
    const fighting = this.state === 'battle';
    if (fighting) this.time += dt;

    for (const u of this.units) {
      if (fighting) this.think(u, dt);
      else {
        u.moveDir = 0;
        u.aim = null;
      }
      u.update(dt);
    }

    this.world.step(dt);

    if (fighting) {
      this.stepProjectiles(dt);
      this.stepStatus(dt);
    }
    this.stepFx(dt);
    this.cullCorpses();
    if (fighting) this.checkWin();
  }

  // ---- unit brain -----------------------------------------------------

  think(u, dt) {
    if (u.dead) {
      u.moveDir = 0;
      return;
    }

    u.retarget = (u.retarget ?? rand(0, 0.3)) - dt;
    if (u.retarget <= 0 || !u.target || u.target.dead) {
      u.target = this.findTarget(u);
      u.retarget = 0.25 + Math.random() * 0.25;
    }

    const t = u.target;
    const def = u.def;
    const chest = u.pts[CHEST];

    if (!t) {
      // Nothing left to fight: drift toward the enemy half.
      u.moveDir = 0;
      u.aim = null;
      this.stepAbility(u, dt);
      return;
    }

    const tp = t.pts[CHEST];
    u.aim = { x: tp.x, y: tp.y, z: tp.z };
    const dist = Math.hypot(tp.x - chest.x, tp.y - chest.y, tp.z - chest.z);

    // --- movement ---
    const reach = def.type === 'ranged' ? def.reach : def.reach + u.h * 0.35;
    const want = reach * (def.type === 'ranged' ? 0.72 : 0.8);
    const tooClose = reach * (def.type === 'ranged' ? 0.35 : 0.55);

    if (def.speed === 0) {
      u.moveDir = 0; // siege pieces are emplaced
    } else if (dist > want) {
      u.moveDir = 1;
    } else if (dist < tooClose) {
      u.moveDir = def.type === 'ranged' ? -1 : 0;
    } else {
      u.moveDir = 0;
    }
    if (!u.standing) u.moveDir = 0;

    // --- attack state machine ---
    const a = u.attack;
    u.cooldown -= dt;

    if (a.state === 'idle') {
      if (dist <= reach && u.cooldown <= 0 && u.standing) {
        a.state = 'windup';
        a.t = 0;
        a.hits = new Set();
      }
    } else if (a.state === 'windup') {
      a.t += dt;
      if (a.t >= (def.windup ?? 0.22)) {
        a.state = 'strike';
        a.t = 0;
        if (def.type === 'ranged') this.fire(u, t);
        else this.emit('swing');
      }
    } else if (a.state === 'strike') {
      a.t += dt;
      if (def.type !== 'ranged') this.meleeHit(u);
      if (a.t >= 0.22) {
        a.state = 'recover';
        a.t = 0;
        u.cooldown = def.cooldown / (u.buff || 1);
      }
    } else {
      a.t += dt;
      if (u.cooldown <= 0) a.state = 'idle';
    }

    this.stepAbility(u, dt);
  }

  findTarget(u) {
    let best = null;
    let bestD = Infinity;
    const c = u.pts[CHEST];
    for (const o of this.units) {
      if (o.team === u.team || o.dead) continue;
      const p = o.pts[CHEST];
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // ---- melee ----------------------------------------------------------

  meleeHit(u) {
    const def = u.def;
    const hand = u.pts[HAND_R];
    const d = u.armDir();
    const reach = def.reach;
    const tipX = hand.x + d.x * reach;
    const tipY = hand.y + d.y * reach;
    const tipZ = hand.z + d.z * reach;
    const hitR = 0.32 * u.size;

    const midX = (hand.x + tipX) / 2, midY = (hand.y + tipY) / 2, midZ = (hand.z + tipZ) / 2;
    const span = reach / 2 + hitR;

    for (const o of this.units) {
      if (o.team === u.team || o.dead || u.attack.hits.has(o.id)) continue;
      // Cheap bounding-sphere reject before the three per-joint segment tests.
      const c = o.pts[CHEST];
      if (Math.hypot(c.x - midX, c.y - midY, c.z - midZ) > span + 1.6 * o.size) continue;
      for (const idx of [HEAD, CHEST, HIP]) {
        const p = o.pts[idx];
        const dd = distToSeg(p.x, p.y, p.z, hand.x, hand.y, hand.z, tipX, tipY, tipZ);
        if (dd < hitR + p.radius) {
          this.applyHit(u, o, p, def.dmg, def.knockback, d.x, d.y, d.z);
          u.attack.hits.add(o.id);
          break;
        }
      }
    }
  }

  applyHit(src, tgt, point, dmg, knockback, dx, dy, dz) {
    const final = dmg * (src ? src.buff || 1 : 1);
    const before = tgt.hp;
    // Every hit adds a little lift, so victims tumble rather than slide.
    tgt.damage(final, dx * knockback, dy * knockback + knockback * 0.4, dz * knockback, point);
    const dealt = Math.min(before, final);

    this.fx.push({
      kind: 'hit',
      x: point.x, y: point.y, z: point.z,
      t: 0, life: 0.4,
      color: tgt.def.bones ? 0xe8e2d0 : 0xffd76a,
    });

    if (src && !src.dead) {
      const ab = src.ability;
      if (ab && ab.kind === 'lifesteal') {
        src.hp = Math.min(src.maxHp, src.hp + dealt * ab.ratio);
      }
      if (src.def.burn) this.addStatus(tgt, 'burn', 3, src.def.burn);
      // Thorns pay damage back to whoever walked into them.
      if (tgt.def.thorns && !tgt.dead) {
        src.damage(tgt.def.thorns, 0, 1, 0, src.pts[CHEST]);
      }
    }
    if (tgt.dead) this.emit('death');
  }

  // ---- ranged ---------------------------------------------------------

  fire(u, target) {
    const def = u.def;
    const p = def.proj;
    if (!p) return;

    const hand = u.pts[HAND_R];
    const tp = target.pts[CHEST];
    const shots = def.volley || 1;

    for (let i = 0; i < shots; i++) {
      // Lead the target by the shot's rough time of flight.
      const rough = Math.hypot(tp.x - hand.x, tp.y - hand.y, tp.z - hand.z) / p.speed;
      const lx = tp.x + (tp.vx / FIXED_DT) * rough * 0.7;
      const ly = tp.y + (tp.vy / FIXED_DT) * rough * 0.4;
      const lz = tp.z + (tp.vz / FIXED_DT) * rough * 0.7;

      let v = solveArc(lx - hand.x, ly - hand.y, lz - hand.z, p.speed, p.gravity);
      // Spread: shotguns scatter, volleys fan, everyone has a little wobble.
      const sp = def.spread ?? (shots > 1 ? 0.05 : 0.02);
      v = {
        x: v.x + rand(-sp, sp) * p.speed,
        y: v.y + rand(-sp, sp) * p.speed * 0.6,
        z: v.z + rand(-sp, sp) * p.speed,
      };

      this.projectiles.push({
        x: hand.x, y: hand.y, z: hand.z,
        vx: v.x, vy: v.y, vz: v.z,
        g: p.gravity,
        r: p.r,
        kind: p.kind,
        dmg: def.dmg,
        knockback: def.knockback,
        team: u.team,
        owner: u,
        splash: p.splash || 0,
        splashDmg: p.splashDmg || 0,
        pierce: p.pierce || 0,
        poison: p.poison || 0,
        slow: p.slow || 0,
        yank: !!p.yank,
        life: 8,
        hit: new Set(),
      });
    }
    this.emit('shoot');
  }

  stepProjectiles(dt) {
    const keep = [];
    for (const b of this.projectiles) {
      b.life -= dt;
      b.vy -= b.g * dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const nz = b.z + b.vz * dt;
      let consumed = false;

      // Test along the travel segment so fast shots can't tunnel through.
      const midX = (b.x + nx) / 2, midY = (b.y + ny) / 2, midZ = (b.z + nz) / 2;
      const span = Math.hypot(nx - b.x, ny - b.y, nz - b.z) / 2 + b.r + 1.2;
      for (const o of this.units) {
        if (o.dead || o.team === b.team || b.hit.has(o.id)) continue;
        // Cheap reject against the segment's bounding sphere before the three
        // per-joint segment tests. Most units are nowhere near most shots.
        const c = o.pts[CHEST];
        if (Math.hypot(c.x - midX, c.y - midY, c.z - midZ) > span + 1.6 * o.size) continue;
        for (const idx of [HEAD, CHEST, HIP]) {
          const p = o.pts[idx];
          if (distToSeg(p.x, p.y, p.z, b.x, b.y, b.z, nx, ny, nz) < p.radius + b.r + 0.08) {
            b.hit.add(o.id);
            const d = Math.hypot(b.vx, b.vy, b.vz) || 1;
            this.applyHit(b.owner, o, p, b.dmg, b.knockback, b.vx / d, b.vy / d, b.vz / d);
            if (b.poison) this.addStatus(o, 'poison', 4, b.poison);
            if (b.slow) this.addStatus(o, 'slow', 3, b.slow);
            if (b.yank && b.owner) {
              // The lasso drags its victim back toward the thrower.
              const ox = b.owner.pts[HIP].x - p.x;
              const oz = b.owner.pts[HIP].z - p.z;
              const od = Math.hypot(ox, oz) || 1;
              p.impulse((ox / od) * 18 * FIXED_DT, 5 * FIXED_DT, (oz / od) * 18 * FIXED_DT);
            }
            if (b.splash) this.explode(p.x, p.y, p.z, b);
            if (b.pierce > 0) b.pierce--;
            else consumed = true;
            break;
          }
        }
        if (consumed) break;
      }

      if (!consumed && ny <= this.groundAt(nx, nz) + b.r) {
        const gy = this.groundAt(nx, nz);
        if (b.splash) this.explode(nx, gy + 0.2, nz, b);
        else this.fx.push({ kind: 'hit', x: nx, y: gy + 0.1, z: nz, t: 0, life: 0.3, color: 0xb09a72 });
        consumed = true;
      }

      b.x = nx; b.y = ny; b.z = nz;
      const inBounds =
        Math.abs(b.x) < HALF_W + 4 && Math.abs(b.z) < HALF_D + 4 && b.y > -20 && b.y < 200;
      if (!consumed && b.life > 0 && inBounds) keep.push(b);
    }
    this.projectiles = keep;
  }

  explode(x, y, z, b) {
    const r = b.splash;
    this.fx.push({ kind: 'blast', x, y, z, r, t: 0, life: 0.5, color: blastColor(b.kind) });
    this.emit('boom');
    for (const o of this.units) {
      if (o.dead) continue;
      const p = o.pts[CHEST];
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const f = 1 - d / r;
      const inv = d < 1e-4 ? 0 : 1 / d;
      this.applyHit(
        b.owner, o, p,
        b.splashDmg * f,
        b.knockback * 1.3 * f,
        dx * inv, dy * inv, dz * inv
      );
    }
  }

  // ---- abilities & statuses ------------------------------------------

  stepAbility(u, dt) {
    // Note: `buff` is owned by stepStatus, which runs once after every unit has
    // thought. Resetting it here would wipe inspire before projectiles resolve.
    const ab = u.ability;
    if (!ab) return;
    ab.t -= dt;

    if (ab.kind === 'heal' && ab.t <= 0) {
      let best = null;
      let bestFrac = 0.98;
      for (const o of this.units) {
        if (o.team !== u.team || o.dead || o === u) continue;
        const p = o.pts[CHEST], c = u.pts[CHEST];
        if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) > ab.radius) continue;
        const frac = o.hp / o.maxHp;
        if (frac < bestFrac) { bestFrac = frac; best = o; }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + ab.amount);
        const a = u.pts[CHEST], c = best.pts[CHEST];
        this.fx.push({
          kind: 'beam',
          x: a.x, y: a.y, z: a.z,
          x2: c.x, y2: c.y, z2: c.z,
          t: 0, life: 0.35, color: 0x7cf7a0,
        });
        ab.t = u.def.cooldown;
      }
    }

    if (ab.kind === 'summon' && ab.t <= 0 && ab.used < 4) {
      ab.used++;
      ab.t = u.def.cooldown;
      for (let i = 0; i < ab.count; i++) {
        const x = u.pts[HIP].x + rand(-1.5, 1.5);
        const z = u.pts[HIP].z + rand(-1.5, 1.5);
        this.spawn(ab.spawn, u.team, x, z);
        this.fx.push({
          kind: 'blast', x, y: this.groundAt(x, z) + 0.6, z,
          r: 1.2, t: 0, life: 0.4, color: 0xb39ddb,
        });
      }
    }

    if (ab.kind === 'lightning' && ab.t <= 0 && u.target && !u.target.dead) {
      const p = u.target.pts[CHEST], c = u.pts[CHEST];
      if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < u.def.reach) {
        ab.t = 3.2;
        this.fx.push({ kind: 'bolt', x: p.x, y: p.y, z: p.z, t: 0, life: 0.32 });
        this.explode(p.x, p.y, p.z, {
          splash: ab.radius,
          splashDmg: ab.dmg,
          knockback: ab.knockback ?? 18,
          owner: u,
          kind: 'bolt',
        });
      }
    }
  }

  addStatus(u, kind, dur, power) {
    u.status = u.status || {};
    u.status[kind] = { t: dur, power };
  }

  stepStatus(dt) {
    // Gather inspire sources once rather than scanning every unit against every
    // other unit each step — that pairing is the one honestly quadratic thing
    // in here, and there are usually only one or two banner-carriers.
    const auras = [];
    for (const o of this.units) {
      if (!o.dead && o.ability && o.ability.kind === 'inspire') auras.push(o);
    }

    for (const u of this.units) {
      if (u.dead) continue;

      // Inspiring allies raise this unit's damage; the strongest aura wins.
      let buff = 1;
      for (const o of auras) {
        if (o.team !== u.team) continue;
        const p = o.pts[CHEST], c = u.pts[CHEST];
        if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < o.ability.radius) {
          buff = Math.max(buff, o.ability.power);
        }
      }
      u.buff = buff;

      const st = u.status;
      if (!st) continue;
      for (const k of Object.keys(st)) {
        const s = st[k];
        s.t -= dt;
        if (s.t <= 0) { delete st[k]; continue; }
        if (k === 'burn' || k === 'poison') {
          u.hp -= s.power * dt;
          if (u.hp <= 0) {
            u.die();
            this.emit('death');
          }
        }
      }
    }
  }

  // ---- effects --------------------------------------------------------

  stepFx(dt) {
    const keep = [];
    for (const f of this.fx) {
      f.t += dt;
      if (f.t < f.life) keep.push(f);
    }
    this.fx = keep;
  }

  cullCorpses() {
    // Corpses are half the fun, but they are also points in the solver. Count
    // before allocating: this runs 120 times a second and almost always bails.
    let n = 0;
    for (const u of this.units) if (u.dead) n++;
    if (n <= MAX_CORPSES) return;

    let toDrop = n - MAX_CORPSES;
    const drop = new Set();
    for (const u of this.units) {
      if (toDrop === 0) break;
      if (u.dead) {
        drop.add(u);
        toDrop--;
      }
    }
    for (const u of drop) u.destroy();
    this.units = this.units.filter((u) => !drop.has(u));
  }

  checkWin() {
    const a = this.countAlive(0);
    const b = this.countAlive(1);
    if (a > 0 && b > 0) return;
    this.state = 'over';
    this.winner = a > 0 ? 0 : b > 0 ? 1 : -1;
    this.emit('over', this.winner);
  }

  emit(kind, data) {
    if (this.onEvent) this.onEvent(kind, data);
  }
}

// ---- helpers ----------------------------------------------------------

/**
 * Ballistic aim in 3D. Returns the launch velocity that lands a shot on the
 * offset (dx, dy, dz) with y up, choosing the flatter of the two arcs and
 * falling back to a 45-degree lob when the target is out of range.
 */
function solveArc(dx, dy, dz, v, g) {
  const R = Math.hypot(dx, dz);
  if (g < 1e-4 || R < 1e-4) {
    const d = Math.hypot(dx, dy, dz) || 1;
    return { x: (dx / d) * v, y: (dy / d) * v, z: (dz / d) * v };
  }
  const ux = dx / R, uz = dz / R;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * R * R + 2 * dy * v2);
  if (disc < 0) {
    const c = Math.SQRT1_2 * v;
    return { x: ux * c, y: c, z: uz * c };
  }
  const theta = Math.atan2(v2 - Math.sqrt(disc), g * R);
  const vh = v * Math.cos(theta);
  return { x: ux * vh, y: v * Math.sin(theta), z: uz * vh };
}

function blastColor(kind) {
  switch (kind) {
    case 'pumpkin': return 0xff9a3c;
    case 'firework': return 0xff5bd0;
    case 'fire': return 0xff7a2f;
    case 'bolt': return 0x9fd8ff;
    case 'potion': return 0x8ee06a;
    default: return 0xffb347;
  }
}
