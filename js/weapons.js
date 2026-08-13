// Weapon definitions and behaviour.
//
// The genre's signature mechanic is *escalation*: every connected hit makes the
// weapon a little longer and a little stronger (the "+0.5 per hit" rule the
// popular apps use). Fights therefore start slow and end in chaos, which is what
// keeps people watching to the end.
//
// Every weapon exposes the same shape to the rest of the engine:
//   create(ball)                  -> per-ball mutable state
//   update(ball, world, dt)       -> movement, cooldowns, spawning projectiles
//   hitboxes(ball)                -> [{ax,ay,bx,by,thick} | {x,y,r}] tested vs enemies
//   draw(ctx, ball)               -> render

import { TAU, rand, clamp, withAlpha, setLength } from './utils.js';
import { ARENA } from './config.js';

const METAL = '#e9f0ff';

/** Shared: point on the rim of a ball at `angle`, `out` px beyond the surface. */
function rim(ball, angle, out = 0) {
  return [
    ball.x + Math.cos(angle) * (ball.r + out),
    ball.y + Math.sin(angle) * (ball.r + out),
  ];
}

/** Shared melee: a blade that sweeps around the ball. */
function meleeUpdate(ball, world, dt) {
  const w = ball.weapon;
  w.angle += w.spin * dt;
  if (w.angle > TAU) w.angle -= TAU;
}

function meleeHitboxes(ball) {
  const w = ball.weapon;
  const [ax, ay] = rim(ball, w.angle, -4);
  const len = w.len + w.level * w.growLen;
  return [{
    ax, ay,
    bx: ax + Math.cos(w.angle) * len,
    by: ay + Math.sin(w.angle) * len,
    thick: w.thick,
  }];
}

function drawBlade(ctx, ball, taper = 0.35) {
  const w = ball.weapon;
  const [ax, ay] = rim(ball, w.angle, -4);
  const len = w.len + w.level * w.growLen;
  const bx = ax + Math.cos(w.angle) * len;
  const by = ay + Math.sin(w.angle) * len;

  ctx.save();
  ctx.lineCap = 'round';
  // Glow underlay tinted with the owner's colour so you can tell whose blade it is.
  ctx.strokeStyle = withAlpha(ball.color, 0.5);
  ctx.lineWidth = w.thick + 10;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.strokeStyle = METAL;
  ctx.lineWidth = w.thick;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  // Tip highlight.
  ctx.fillStyle = ball.color;
  ctx.beginPath();
  ctx.arc(bx, by, w.thick * (0.5 + taper), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function fireProjectile(world, ball, angle, opts = {}) {
  world.projectiles.push({
    x: ball.x + Math.cos(angle) * (ball.r + 12),
    y: ball.y + Math.sin(angle) * (ball.r + 12),
    vx: Math.cos(angle) * (opts.speed || 720),
    vy: Math.sin(angle) * (opts.speed || 720),
    r: opts.r || 11,
    dmg: opts.dmg || 6,
    owner: ball.id,
    color: ball.color,
    life: opts.life || 2.4,
    bounces: opts.bounces || 0,
    kind: opts.kind || 'bolt',
  });
}

export const WEAPONS = {
  sword: {
    label: 'Sword',
    blurb: 'Long sweeping blade. Grows with every hit.',
    kind: 'melee',
    create: () => ({ angle: rand(0, TAU), spin: 4.3, len: 106, thick: 16, dmg: 17, growLen: 3.4, growDmg: 0.85, level: 0, cdTime: 0.28 }),
    update: meleeUpdate,
    hitboxes: meleeHitboxes,
    draw: (ctx, ball) => drawBlade(ctx, ball, 0.4),
  },

  dagger: {
    label: 'Dagger',
    blurb: 'Short and fast. Weak per hit, but escalates quickly.',
    kind: 'melee',
    create: () => ({ angle: rand(0, TAU), spin: 8.2, len: 62, thick: 12, dmg: 10, growLen: 4.2, growDmg: 0.75, level: 0, cdTime: 0.16 }),
    update: meleeUpdate,
    hitboxes: meleeHitboxes,
    draw: (ctx, ball) => drawBlade(ctx, ball, 0.25),
  },

  flail: {
    label: 'Flail',
    blurb: 'Chained head that swings unpredictably. Hits hard.',
    kind: 'melee',
    create: () => ({
      angle: rand(0, TAU), level: 0, dmg: 21, growDmg: 1.0, growLen: 2.2,
      chain: 124, head: 25, cdTime: 0.34,
      hx: 0, hy: 0, hvx: 0, hvy: 0, seeded: false,
    }),
    update(ball, world, dt) {
      const w = ball.weapon;
      if (!w.seeded) {
        w.hx = ball.x + Math.cos(w.angle) * w.chain;
        w.hy = ball.y + Math.sin(w.angle) * w.chain;
        w.seeded = true;
      }
      const chain = w.chain + w.level * w.growLen;

      // Free-flying head, then a hard distance constraint back to the ball. The
      // result swings on its own momentum instead of tracking a tidy circle.
      w.hvy += 1400 * dt;
      w.hvx -= w.hvx * 0.7 * dt;
      w.hvy -= w.hvy * 0.7 * dt;

      // Small tangential kick keeps it orbiting rather than hanging straight down.
      const tx = -(w.hy - ball.y);
      const ty = w.hx - ball.x;
      const [ntx, nty] = setLength(tx, ty, 1);
      w.hvx += ntx * 900 * dt;
      w.hvy += nty * 900 * dt;

      w.hx += w.hvx * dt;
      w.hy += w.hvy * dt;

      const dx = w.hx - ball.x;
      const dy = w.hy - ball.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d !== chain) {
        const nx = dx / d;
        const ny = dy / d;
        w.hx = ball.x + nx * chain;
        w.hy = ball.y + ny * chain;
        // Kill the radial component so the constraint doesn't pump energy in.
        const radial = w.hvx * nx + w.hvy * ny;
        w.hvx -= radial * nx;
        w.hvy -= radial * ny;
      }
      w.hvx = clamp(w.hvx, -2600, 2600);
      w.hvy = clamp(w.hvy, -2600, 2600);
    },
    hitboxes(ball) {
      const w = ball.weapon;
      return [{ x: w.hx, y: w.hy, r: w.head + w.level * 1.2 }];
    },
    draw(ctx, ball) {
      const w = ball.weapon;
      ctx.save();
      ctx.strokeStyle = withAlpha(METAL, 0.75);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(w.hx, w.hy);
      ctx.stroke();

      const hr = w.head + w.level * 1.2;
      ctx.fillStyle = withAlpha(ball.color, 0.45);
      ctx.beginPath();
      ctx.arc(w.hx, w.hy, hr + 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = METAL;
      ctx.beginPath();
      ctx.arc(w.hx, w.hy, hr, 0, TAU);
      ctx.fill();
      // Spikes.
      ctx.strokeStyle = METAL;
      ctx.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + w.hx * 0.004;
        ctx.beginPath();
        ctx.moveTo(w.hx + Math.cos(a) * hr, w.hy + Math.sin(a) * hr);
        ctx.lineTo(w.hx + Math.cos(a) * (hr + 9), w.hy + Math.sin(a) * (hr + 9));
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  orbital: {
    label: 'Orbital',
    blurb: 'Shards circling the ball. Each hit adds another shard.',
    kind: 'melee',
    create: () => ({ angle: rand(0, TAU), spin: 3.6, count: 3, radius: 84, size: 14, dmg: 5.6, growDmg: 0.3, level: 0, cdTime: 0.38 }),
    update(ball, world, dt) {
      const w = ball.weapon;
      w.angle += w.spin * dt;
      w.count = 3 + Math.floor(w.level / 3);
    },
    hitboxes(ball) {
      const w = ball.weapon;
      const dist = w.radius + ball.r * 0.4;
      const out = [];
      for (let i = 0; i < w.count; i++) {
        const a = w.angle + (i / w.count) * TAU;
        out.push({
          x: ball.x + Math.cos(a) * dist,
          y: ball.y + Math.sin(a) * dist,
          r: w.size + w.level * 0.5,
        });
      }
      return out;
    },
    draw(ctx, ball) {
      const w = ball.weapon;
      const dist = w.radius + ball.r * 0.4;
      ctx.save();
      ctx.strokeStyle = withAlpha(ball.color, 0.22);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, dist, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < w.count; i++) {
        const a = w.angle + (i / w.count) * TAU;
        const x = ball.x + Math.cos(a) * dist;
        const y = ball.y + Math.sin(a) * dist;
        const r = w.size + w.level * 0.5;
        ctx.fillStyle = withAlpha(ball.color, 0.5);
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = METAL;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },

  blaster: {
    label: 'Blaster',
    blurb: 'Fires homing-ish bolts at the nearest enemy.',
    kind: 'ranged',
    create: () => ({ cd: 0, rate: 0.66, dmg: 8, growDmg: 0.4, level: 0, angle: 0, cdTime: 0, projGrow: 0.34 }),
    update(ball, world, dt) {
      const w = ball.weapon;
      w.cd -= dt;
      const target = world.nearestEnemy(ball);
      if (target) w.angle = Math.atan2(target.y - ball.y, target.x - ball.x);
      if (w.cd <= 0 && target) {
        w.cd = Math.max(0.16, w.rate - w.level * 0.02);
        fireProjectile(world, ball, w.angle, {
          dmg: w.dmg + w.level * w.growDmg,
          speed: 900, r: 12, kind: 'bolt',
        });
        world.onShoot();
      }
    },
    hitboxes: () => [],
    draw(ctx, ball) {
      const w = ball.weapon;
      const [ax, ay] = rim(ball, w.angle, -6);
      const bx = ax + Math.cos(w.angle) * 34;
      const by = ay + Math.sin(w.angle) * 34;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = METAL;
      ctx.lineWidth = 17;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = ball.color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    },
  },

  shotgun: {
    label: 'Shotgun',
    blurb: 'Slow, brutal spread. Devastating up close.',
    kind: 'ranged',
    create: () => ({ cd: 0, rate: 1.85, dmg: 3.4, growDmg: 0.12, level: 0, angle: 0, pellets: 5, cdTime: 0, projGrow: 0.07 }),
    update(ball, world, dt) {
      const w = ball.weapon;
      w.cd -= dt;
      const target = world.nearestEnemy(ball);
      if (target) w.angle = Math.atan2(target.y - ball.y, target.x - ball.x);
      if (w.cd <= 0 && target) {
        w.cd = Math.max(0.5, w.rate - w.level * 0.03);
        const n = w.pellets + Math.floor(w.level / 9);
        for (let i = 0; i < n; i++) {
          fireProjectile(world, ball, w.angle + rand(-0.34, 0.34), {
            dmg: w.dmg + w.level * w.growDmg,
            speed: rand(700, 1000), r: 8, life: 1.1, kind: 'pellet',
          });
        }
        world.onShoot();
        // Recoil — a nice touch that also nudges the shooter around the arena.
        ball.vx -= Math.cos(w.angle) * 120;
        ball.vy -= Math.sin(w.angle) * 120;
      }
    },
    hitboxes: () => [],
    draw(ctx, ball) {
      const w = ball.weapon;
      const [ax, ay] = rim(ball, w.angle, -6);
      const bx = ax + Math.cos(w.angle) * 44;
      const by = ay + Math.sin(w.angle) * 44;
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = METAL;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(ball.color, 0.9);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    },
  },

  laser: {
    label: 'Laser',
    blurb: 'Charges, locks on, then burns a beam across the arena.',
    kind: 'beam',
    create: () => ({ cd: 1.4, rate: 1.7, charge: 0, firing: 0, dmg: 18, growDmg: 0.95, level: 0, angle: 0, cdTime: 0.45 }),
    update(ball, world, dt) {
      const w = ball.weapon;
      const target = world.nearestEnemy(ball);
      if (w.firing > 0) {
        w.firing -= dt;
        return;
      }
      w.cd -= dt;
      if (target) {
        const want = Math.atan2(target.y - ball.y, target.x - ball.x);
        // Slow tracking while charging, so it can be dodged.
        let diff = ((want - w.angle + Math.PI * 3) % TAU) - Math.PI;
        w.angle += diff * clamp(dt * 3.4, 0, 1);
      }
      w.charge = clamp(1 - w.cd / Math.max(0.4, w.rate - w.level * 0.05), 0, 1);
      if (w.cd <= 0 && target) {
        w.cd = Math.max(0.4, w.rate - w.level * 0.05);
        w.firing = 0.22;
        world.onShoot();
      }
    },
    hitboxes(ball) {
      const w = ball.weapon;
      if (w.firing <= 0) return [];
      const [ax, ay] = rim(ball, w.angle, 0);
      return [{
        ax, ay,
        bx: ax + Math.cos(w.angle) * 1600,
        by: ay + Math.sin(w.angle) * 1600,
        thick: 16,
        beam: true,
      }];
    },
    draw(ctx, ball) {
      const w = ball.weapon;
      const [ax, ay] = rim(ball, w.angle, 0);
      ctx.save();
      ctx.lineCap = 'round';
      if (w.firing > 0) {
        const a = w.firing / 0.22;
        const bx = ax + Math.cos(w.angle) * 1600;
        const by = ay + Math.sin(w.angle) * 1600;
        ctx.strokeStyle = withAlpha(ball.color, 0.35 * a);
        ctx.lineWidth = 46 * a;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = withAlpha(ball.color, 0.9 * a);
        ctx.lineWidth = 20 * a;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 7 * a;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      } else {
        // Targeting line while charging — telegraphs the shot.
        const bx = ax + Math.cos(w.angle) * 420;
        const by = ay + Math.sin(w.angle) * 420;
        ctx.setLineDash([12, 18]);
        ctx.strokeStyle = withAlpha(ball.color, 0.25 + w.charge * 0.5);
        ctx.lineWidth = 3 + w.charge * 4;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = withAlpha(ball.color, w.charge);
        ctx.beginPath();
        ctx.arc(ax, ay, 6 + w.charge * 12, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },

  spikes: {
    label: 'Spikes',
    blurb: 'No weapon — the ball itself is the weapon. Body-slam damage.',
    kind: 'contact',
    create: () => ({ level: 0, dmg: 16, growDmg: 0.72, spin: 1.4, angle: 0, cdTime: 0.4, contact: true }),
    update(ball, world, dt) {
      ball.weapon.angle += ball.weapon.spin * dt;
    },
    hitboxes(ball) {
      // A ring slightly larger than the ball: contact damage on collision.
      return [{ x: ball.x, y: ball.y, r: ball.r + 12 + ball.weapon.level * 0.6 }];
    },
    draw(ctx, ball) {
      const w = ball.weapon;
      const n = 12;
      const out = 16 + w.level * 0.6;
      ctx.save();
      ctx.fillStyle = METAL;
      for (let i = 0; i < n; i++) {
        const a = w.angle + (i / n) * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(ball.x + c * (ball.r + out), ball.y + s * (ball.r + out));
        ctx.lineTo(ball.x + Math.cos(a + 0.13) * (ball.r - 2), ball.y + Math.sin(a + 0.13) * (ball.r - 2));
        ctx.lineTo(ball.x + Math.cos(a - 0.13) * (ball.r - 2), ball.y + Math.sin(a - 0.13) * (ball.r - 2));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  },

  portal: {
    label: 'Portal Gun',
    blurb: 'Fires a portal where it is headed, dives through, and bursts out somewhere far away — glowing hot.',
    kind: 'portal',
    create: () => ({
      cd: 1.6, rate: 2.8, dmg: 21, growDmg: 1.05, level: 0, cdTime: 0.42,
      angle: 0, swirl: 0, charge: 0, inP: null, outP: null, life: 0, outLife: 0,
    }),

    update(ball, world, dt) {
      const w = ball.weapon;
      w.swirl += dt * 2.6;
      // The gun aims where the ball is going, not at an enemy.
      w.angle = Math.atan2(ball.vy, ball.vx);
      if (w.charge > 0) w.charge -= dt;

      // The exit portal lingers for a moment after use, then fades.
      if (w.outLife > 0) w.outLife -= dt;

      if (w.inP) {
        w.life -= dt;
        if (w.life <= 0) { w.inP = null; return; }

        const d = Math.hypot(ball.x - w.inP.x, ball.y - w.inP.y);
        if (d < w.inP.r * 0.85) {
          // The exit is rolled HERE, on entry — not when the gun fires. Nobody
          // gets to see where it comes out until it comes out.
          const from = w.inP;
          const exit = pickExit(from);

          ball.x = exit.x;
          ball.y = exit.y;
          ball.trail.length = 0; // otherwise the trail streaks across the arena
          w.charge = 2.0;
          w.inP = null;
          w.outP = exit;
          w.outLife = 1.5;

          world.fx.burst(from.x, from.y, PORTAL_GREEN, 22, 460, 8);
          world.fx.ring(from.x, from.y, PORTAL_GREEN, 150, 12);
          world.fx.burst(exit.x, exit.y, PORTAL_LIME, 30, 620, 9);
          world.fx.ring(exit.x, exit.y, PORTAL_LIME, 190, 14);
          world.fx.addShake(9);
        }
        return;
      }

      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = Math.max(1.5, w.rate - w.level * 0.07);
        w.inP = makeEntry(ball);
        w.life = 5.5;
        world.fx.ring(w.inP.x, w.inP.y, PORTAL_GREEN, 130, 10);
        world.onShoot();
      }
    },

    hitboxes(ball) {
      // Only dangerous on the way out — the exit slam is the damage.
      const w = ball.weapon;
      if (w.charge <= 0) return [];
      return [{ x: ball.x, y: ball.y, r: ball.r + 18 }];
    },

    draw(ctx, ball) {
      const w = ball.weapon;
      if (w.outP && w.outLife > 0) {
        drawPortal(ctx, w.outP, w.swirl * -1.3, clamp(w.outLife / 0.6, 0, 1));
      }
      if (w.inP) {
        drawPortal(ctx, w.inP, w.swirl, clamp(w.life / 1.2, 0, 1));
      }

      // Charged-up glow while the slam is live.
      if (w.charge > 0) {
        const a = clamp(w.charge / 2.0, 0, 1);
        ctx.fillStyle = withAlpha(PORTAL_LIME, 0.35 * a);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r + 22 * a, 0, TAU);
        ctx.fill();
      }

      drawPortalGun(ctx, ball, w);
    },
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

/** Damage a weapon currently deals, including its accumulated growth. */
export function weaponDamage(ball) {
  const w = ball.weapon;
  return w.dmg + w.level * (w.growDmg || 0);
}

// --------------------------------------------------------------- portal gun

// Rick's portal gun: a metal-grey body with a glowing green vial on top, firing
// an opaque green swirling vortex. Colours follow the show's acid-green palette
// with the lighter yellow-green "goo" highlights.
const PORTAL_GREEN = '#97ce4c';
const PORTAL_LIME = '#d4f24a';
const PORTAL_DEEP = '#2f5417';
const PORTAL_R = 64;

/** Padded bounds the portals are allowed to sit inside. */
function portalBounds() {
  const pad = PORTAL_R + 16;
  return {
    minX: ARENA.x + pad,
    maxX: ARENA.x + ARENA.w - pad,
    minY: ARENA.y + pad,
    maxY: ARENA.y + ARENA.h - pad,
  };
}

/** Entry portal lands ahead of the ball, along the way it is already going. */
function makeEntry(ball) {
  const b = portalBounds();
  const heading = Math.atan2(ball.vy, ball.vx);
  return {
    x: clamp(ball.x + Math.cos(heading) * 250, b.minX, b.maxX),
    y: clamp(ball.y + Math.sin(heading) * 250, b.minY, b.maxY),
    r: PORTAL_R,
  };
}

/** Somewhere random, but never near the portal it just went into. */
function pickExit(from) {
  const b = portalBounds();
  const minDist = Math.min(ARENA.w, ARENA.h) * 0.5;
  for (let i = 0; i < 40; i++) {
    const cx = rand(b.minX, b.maxX);
    const cy = rand(b.minY, b.maxY);
    if (Math.hypot(cx - from.x, cy - from.y) >= minDist) return { x: cx, y: cy, r: PORTAL_R };
  }
  // Arena too tight for the random pick (it shrinks during sudden death) —
  // mirror through the centre, always the farthest point still available.
  return {
    x: clamp(2 * (ARENA.x + ARENA.w / 2) - from.x, b.minX, b.maxX),
    y: clamp(2 * (ARENA.y + ARENA.h / 2) - from.y, b.minY, b.maxY),
    r: PORTAL_R,
  };
}

function drawPortal(ctx, p, swirl, alpha) {
  const { x, y, r } = p;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = withAlpha(PORTAL_GREEN, 0.22);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.3, 0, TAU);
  ctx.fill();

  ctx.fillStyle = PORTAL_DEEP;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  // Swirling energy: nested arcs turning at different rates.
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const rr = r * (0.88 - i * 0.16);
    const a0 = swirl * (1 + i * 0.42) + i * 1.7;
    ctx.strokeStyle = i % 2 ? PORTAL_LIME : PORTAL_GREEN;
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, rr, a0, a0 + 2.3 - i * 0.18);
    ctx.stroke();
  }

  // Bubbling goo flecks.
  for (let i = 0; i < 6; i++) {
    const a = swirl * 1.6 + (i / 6) * TAU;
    const rr = r * (0.3 + 0.45 * ((i * 37) % 10) / 10);
    ctx.fillStyle = withAlpha(PORTAL_LIME, 0.8);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.07, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = PORTAL_LIME;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPortalGun(ctx, ball, w) {
  const [ax, ay] = rim(ball, w.angle, -8);
  const c = Math.cos(w.angle);
  const s = Math.sin(w.angle);
  const bx = ax + c * 40;
  const by = ay + s * 40;

  ctx.save();
  ctx.lineCap = 'butt';
  // Metal-grey body.
  ctx.strokeStyle = '#8d97ad';
  ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = '#59627a';
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(ax + c * 14, ay + s * 14); ctx.lineTo(bx, by); ctx.stroke();

  // Glowing vial on top of the gun.
  const vx = ax + c * 8 - s * 15;
  const vy = ay + s * 8 + c * 15;
  ctx.fillStyle = withAlpha(PORTAL_GREEN, 0.55);
  ctx.beginPath(); ctx.arc(vx, vy, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = PORTAL_LIME;
  ctx.beginPath(); ctx.arc(vx, vy, 8, 0, TAU); ctx.fill();

  // Muzzle glow.
  ctx.fillStyle = withAlpha(PORTAL_LIME, w.inP ? 0.35 : 0.9);
  ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fill();
  ctx.restore();
}
