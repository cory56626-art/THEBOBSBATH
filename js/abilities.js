// Abilities are the ball's *identity* — a passive that reshapes how it fights,
// plus a super that fires once its meter fills.
//
// Hooks (all optional):
//   update(ball, world, dt)
//   damageMult(ball)                 -> multiplier applied to damage it deals
//   onDealDamage(ball, target, amt, world)
//   onTakeDamage(ball, amt, source, world) -> returns the amount actually taken
//   onDeath(ball, world)
//   fireSuper(ball, world)
//   aura(ctx, ball)                  -> drawn under the ball

import { TAU, clamp, rand, chance, withAlpha } from './utils.js';

// Ricker's metal mode: full power for RICKER_HOLD, then eases off over RICKER_FADE.
const RICKER_HOLD = 5;
const RICKER_FADE = 2.5;

/** Default super for abilities that don't define one: a damaging shockwave. */
function novaSuper(ball, world) {
  const radius = 320;
  world.fx.ring(ball.x, ball.y, ball.color, radius, 22);
  world.fx.burst(ball.x, ball.y, ball.color, 46, 700, 9);
  world.fx.addShake(16);
  world.fx.addFlash(ball.color, 0.35);
  for (const other of world.balls) {
    if (other === ball || !other.alive) continue;
    const d = Math.hypot(other.x - ball.x, other.y - ball.y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      world.damage(other, 26 * falloff + 8, ball, { crit: true });
      const [nx, ny] = [(other.x - ball.x) / (d || 1), (other.y - ball.y) / (d || 1)];
      other.vx += nx * 520;
      other.vy += ny * 520;
    }
  }
}

export const ABILITIES = {
  none: {
    label: 'None',
    blurb: 'A pure fighter. No tricks, no downsides.',
    fireSuper: novaSuper,
  },

  vampire: {
    label: 'Vampire',
    blurb: 'Heals for 45% of all damage dealt.',
    color: '#ff5b6e',
    onDealDamage(ball, target, amt, world) {
      const healed = amt * 0.45;
      ball.heal(healed);
      // Batched: a "+N" on every single hit was permanent screen clutter.
      ball.lifestealAccum = (ball.lifestealAccum || 0) + healed;
      if (ball.lifestealAccum >= 20) {
        world.fx.number(ball.x, ball.y - ball.r - 30, `+${Math.round(ball.lifestealAccum)}`, '#7ee08a');
        ball.lifestealAccum = 0;
      }
    },
    fireSuper(ball, world) {
      // Drains every living enemy at once.
      world.fx.ring(ball.x, ball.y, '#ff5b6e', 420, 20);
      world.fx.addFlash('#ff5b6e', 0.4);
      let total = 0;
      for (const other of world.balls) {
        if (other === ball || !other.alive) continue;
        total += 18;
        world.damage(other, 18, ball, { crit: true, skipOnDeal: true });
        world.fx.spray(other.x, other.y, Math.atan2(ball.y - other.y, ball.x - other.x), '#ff5b6e', 12, 400);
      }
      ball.heal(total);
    },
    aura(ctx, ball) {
      ctx.fillStyle = withAlpha('#ff5b6e', 0.16 + Math.sin(ball.age * 3) * 0.05);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 20, 0, TAU);
      ctx.fill();
    },
  },

  shield: {
    label: 'Shield',
    blurb: 'A rotating barrier soaks 70% of each hit and rebuilds between them.',
    color: '#5aa9ff',
    init(ball) {
      ball.shield = 40;
      ball.shieldMax = 40;
      ball.shieldAngle = rand(0, TAU);
    },
    update(ball, world, dt) {
      ball.shieldAngle += 2.2 * dt;
      // Rebuilds only after a lull, so sustained pressure still breaks through.
      ball.shieldCooldown = Math.max(0, (ball.shieldCooldown || 0) - dt);
      if (ball.shieldCooldown <= 0 && ball.shield < ball.shieldMax) {
        ball.shield = Math.min(ball.shieldMax, ball.shield + 7 * dt);
      }
    },
    onTakeDamage(ball, amt, source, world) {
      ball.shieldCooldown = 1.6;
      if (ball.shield <= 0) return amt;
      // Caps absorption at 70% of the hit. A shield that could eat 100% of every
      // hit made the ball unkillable whenever incoming damage was slower than
      // its regen — that was the stalemate.
      const absorbed = Math.min(ball.shield, amt * 0.7);
      ball.shield -= absorbed;
      // The ring flash already reads as "that was blocked" — no text needed.
      world.fx.ring(ball.x, ball.y, '#5aa9ff', ball.r + 46, 9);
      return amt - absorbed;
    },
    fireSuper(ball, world) {
      ball.shieldMax += 25;
      ball.shield = ball.shieldMax;
      world.fx.ring(ball.x, ball.y, '#5aa9ff', 340, 24);
      world.fx.number(ball.x, ball.y - ball.r - 70, 'FORTIFY', '#5aa9ff', true);
      novaSuper(ball, world);
    },
    aura(ctx, ball) {
      if (ball.shield <= 0) return;
      const frac = ball.shield / ball.shieldMax;
      ctx.save();
      ctx.strokeStyle = withAlpha('#5aa9ff', 0.35 + frac * 0.45);
      ctx.lineWidth = 6;
      const r = ball.r + 26;
      for (let i = 0; i < 3; i++) {
        const a0 = ball.shieldAngle + (i / 3) * TAU;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r, a0, a0 + 1.4 * frac);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  regen: {
    label: 'Regen',
    blurb: 'Steadily heals. Wins wars of attrition.',
    color: '#7ee08a',
    update(ball, world, dt) {
      if (ball.hp < ball.maxHp) ball.heal(4.5 * dt);
    },
    fireSuper(ball, world) {
      ball.heal(ball.maxHp * 0.4);
      world.fx.ring(ball.x, ball.y, '#7ee08a', 300, 20);
      world.fx.number(ball.x, ball.y - ball.r - 70, 'RESTORE', '#7ee08a', true);
      novaSuper(ball, world);
    },
    aura(ctx, ball) {
      const p = (ball.age * 0.9) % 1;
      ctx.strokeStyle = withAlpha('#7ee08a', 0.5 * (1 - p));
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 8 + p * 34, 0, TAU);
      ctx.stroke();
    },
  },

  toxic: {
    label: 'Toxic',
    blurb: 'Hits apply stacking poison that keeps ticking.',
    color: '#a3e635',
    onDealDamage(ball, target, amt, world) {
      target.poison = (target.poison || 0) + 14;
      target.poisonSource = ball;
    },
    fireSuper(ball, world) {
      for (const other of world.balls) {
        if (other === ball || !other.alive) continue;
        other.poison = (other.poison || 0) + 45;
        other.poisonSource = ball;
      }
      world.fx.ring(ball.x, ball.y, '#a3e635', 460, 22);
      world.fx.number(ball.x, ball.y - ball.r - 70, 'OUTBREAK', '#a3e635', true);
      world.fx.addFlash('#a3e635', 0.3);
    },
    aura(ctx, ball) {
      ctx.fillStyle = withAlpha('#a3e635', 0.14);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 16 + Math.sin(ball.age * 4) * 4, 0, TAU);
      ctx.fill();
    },
  },

  berserk: {
    label: 'Berserk',
    blurb: 'The closer to death, the harder it hits — up to double damage.',
    color: '#ff9f45',
    damageMult(ball) {
      const missing = 1 - ball.hp / ball.maxHp;
      return 1 + missing * 1.0;
    },
    fireSuper(ball, world) {
      ball.berserkFrenzy = 4;
      world.fx.number(ball.x, ball.y - ball.r - 70, 'FRENZY', '#ff9f45', true);
      novaSuper(ball, world);
    },
    update(ball, world, dt) {
      if (ball.berserkFrenzy > 0) {
        ball.berserkFrenzy -= dt;
        if (ball.weapon.spin) ball.weapon.angle += ball.weapon.spin * dt * 1.8;
      }
    },
    aura(ctx, ball) {
      const rage = 1 - ball.hp / ball.maxHp;
      if (rage < 0.15) return;
      ctx.fillStyle = withAlpha('#ff9f45', rage * 0.28);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 12 + rage * 20, 0, TAU);
      ctx.fill();
    },
  },

  bomb: {
    label: 'Bomb',
    blurb: 'Detonates on death, taking neighbours with it.',
    color: '#ff8fab',
    onDeath(ball, world) {
      const radius = 380;
      world.fx.ring(ball.x, ball.y, '#ff8fab', radius, 26);
      world.fx.burst(ball.x, ball.y, '#ff8fab', 70, 900, 12);
      world.fx.addShake(28);
      world.fx.addFlash('#ff8fab', 0.55);
      for (const other of world.balls) {
        if (other === ball || !other.alive) continue;
        const d = Math.hypot(other.x - ball.x, other.y - ball.y);
        if (d < radius) {
          const falloff = 1 - d / radius;
          world.damage(other, 45 * falloff, ball, { crit: true });
          other.vx += ((other.x - ball.x) / (d || 1)) * 700;
          other.vy += ((other.y - ball.y) / (d || 1)) * 700;
        }
      }
    },
    fireSuper(ball, world) {
      novaSuper(ball, world);
      world.fx.number(ball.x, ball.y - ball.r - 70, 'BOOM', '#ff8fab', true);
    },
    aura(ctx, ball) {
      const pulse = 0.5 + Math.sin(ball.age * 6) * 0.5;
      ctx.fillStyle = withAlpha('#ff8fab', 0.1 + pulse * 0.14);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 14, 0, TAU);
      ctx.fill();
    },
  },

  ghost: {
    label: 'Ghost',
    blurb: '24% chance to phase straight through an incoming hit.',
    color: '#e0e7ff',
    onTakeDamage(ball, amt, source, world) {
      if (chance(0.24)) {
        world.fx.number(ball.x, ball.y - ball.r - 40, 'MISS', '#e0e7ff');
        ball.ghostFlash = 0.3;
        return 0;
      }
      return amt;
    },
    update(ball, world, dt) {
      if (ball.ghostFlash > 0) ball.ghostFlash -= dt;
    },
    fireSuper(ball, world) {
      ball.ghostInvuln = 3;
      world.fx.number(ball.x, ball.y - ball.r - 70, 'FADE', '#e0e7ff', true);
      novaSuper(ball, world);
    },
    aura(ctx, ball) {
      ctx.fillStyle = withAlpha('#e0e7ff', ball.ghostInvuln > 0 ? 0.3 : 0.1);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 18, 0, TAU);
      ctx.fill();
    },
  },

  ricker: {
    label: 'Ricker',
    blurb: 'Super goes chrome: 5 seconds spinning and flying at nearly triple speed, then winds down.',
    color: '#dfe6f7',
    // Wants to be in metal mode as often as possible, so it charges quicker.
    superChargeMult: 1.1,

    // 5 seconds at full tilt, then a 2.5s wind-down — RICKER_HOLD + RICKER_FADE.
    fireSuper(ball, world) {
      ball.ricker = RICKER_HOLD + RICKER_FADE;
      ball.rickerSpin = 0;
      world.fx.number(ball.x, ball.y - ball.r - 70, 'RICKED', '#dfe6f7', true);
      world.fx.ring(ball.x, ball.y, '#dfe6f7', 360, 22);
      world.fx.burst(ball.x, ball.y, '#dfe6f7', 36, 620, 8);
      world.fx.addFlash('#dfe6f7', 0.3);
      world.fx.addShake(15);
    },

    update(ball, world, dt) {
      if (ball.ricker <= 0) return;
      ball.ricker -= dt;

      // Ramp holds at 1 for the first 5s, then eases to 0 over the last 2.5s,
      // so it slows and de-chromes gradually rather than snapping back.
      const k = clamp(ball.ricker / RICKER_FADE, 0, 1);
      ball.rickerSpin += dt * (6 + 26 * k);
      ball.speedMult = 1 + 1.8 * k;
      if (ball.weapon.spin) ball.weapon.angle += ball.weapon.spin * dt * 5 * k;

      if (chance(dt * 30 * k)) {
        world.fx.burst(
          ball.x + rand(-ball.r, ball.r), ball.y + rand(-ball.r, ball.r),
          '#dfe6f7', 1, 140, 4
        );
      }
      if (ball.ricker <= 0) {
        ball.ricker = 0;
        ball.speedMult = 1;
      }
    },

    damageMult(ball) {
      if (ball.ricker <= 0) return 1;
      return 1 + 0.3 * clamp(ball.ricker / RICKER_FADE, 0, 1);
    },

    /** Chrome banding, rotating with the spin so it reads as spinning metal. */
    bodyOverlay(ctx, ball) {
      if (ball.ricker <= 0) return;
      const k = clamp(ball.ricker / RICKER_FADE, 0, 1);
      const r = ball.r;
      const a = ball.rickerSpin || 0;

      ctx.save();
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r, 0, TAU);
      ctx.clip();

      const g = ctx.createLinearGradient(
        ball.x - Math.cos(a) * r, ball.y - Math.sin(a) * r,
        ball.x + Math.cos(a) * r, ball.y + Math.sin(a) * r
      );
      g.addColorStop(0.0, '#f6f9ff');
      g.addColorStop(0.18, '#8a97b3');
      g.addColorStop(0.36, '#ffffff');
      g.addColorStop(0.54, '#69748e');
      g.addColorStop(0.72, '#e8eeff');
      g.addColorStop(0.88, '#7c88a3');
      g.addColorStop(1.0, '#f2f6ff');
      ctx.fillStyle = g;
      ctx.fillRect(ball.x - r, ball.y - r, r * 2, r * 2);
      ctx.restore();
    },

    aura(ctx, ball) {
      if (ball.ricker <= 0) return;
      const k = clamp(ball.ricker / RICKER_FADE, 0, 1);
      ctx.strokeStyle = withAlpha('#dfe6f7', 0.5 * k);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 12 + 16 * k, 0, TAU);
      ctx.stroke();
    },
  },
  titan: {
    label: 'Titan',
    blurb: '+60% health and mass, but noticeably slower.',
    color: '#ffd166',
    init(ball) {
      ball.maxHp = Math.round(ball.maxHp * 1.6);
      ball.hp = ball.maxHp;
      ball.speedMult = 0.72;
      ball.massMult = 2.2;
    },
    fireSuper(ball, world) {
      world.fx.addShake(30);
      novaSuper(ball, world);
      world.fx.number(ball.x, ball.y - ball.r - 70, 'QUAKE', '#ffd166', true);
    },
    aura(ctx, ball) {
      ctx.strokeStyle = withAlpha('#ffd166', 0.3);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 14, 0, TAU);
      ctx.stroke();
    },
  },
};

export const ABILITY_KEYS = Object.keys(ABILITIES);

/** Poison ticks live here so every ball gets them regardless of its own ability. */
export function tickStatus(ball, world, dt) {
  if (ball.poison > 0) {
    const tick = Math.min(ball.poison, 9 * dt);
    ball.poison -= tick;
    ball.hp -= tick;
    ball.poisonAccum = (ball.poisonAccum || 0) + tick;
    if (ball.poisonAccum >= 5) {
      world.fx.number(ball.x, ball.y - ball.r - 20, `-${Math.round(ball.poisonAccum)}`, '#a3e635');
      ball.poisonAccum = 0;
    }
    if (chance(dt * 8)) {
      world.fx.burst(ball.x + rand(-ball.r, ball.r), ball.y + rand(-ball.r, ball.r), '#a3e635', 1, 60, 4);
    }
    if (ball.hp <= 0) world.kill(ball, ball.poisonSource || null);
  }
  if (ball.ghostInvuln > 0) ball.ghostInvuln -= dt;
  ball.age += dt;
}
