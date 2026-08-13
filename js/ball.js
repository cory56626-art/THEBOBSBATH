// A single fighter.

import { TAU, clamp, uid, withAlpha, mixHex } from './utils.js';
import { WEAPONS } from './weapons.js';
import { ABILITIES } from './abilities.js';
import { SETTINGS, SUPER_CHARGE_MAX } from './config.js';

const TRAIL_LEN = 16;

export class Ball {
  constructor({ name, color, weapon, ability, x, y, angle }) {
    this.id = uid();
    this.name = name;
    this.color = color;
    this.weaponKey = weapon;
    this.abilityKey = ability;

    this.maxHp = SETTINGS.maxHp;
    this.hp = this.maxHp;
    this.baseR = SETTINGS.baseRadius;

    this.speedMult = 1;
    this.massMult = 1;

    this.x = x;
    this.y = y;
    const speed = SETTINGS.ballSpeed;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.alive = true;
    this.age = 0;
    this.hitFlash = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.superCharge = 0;
    this.superReadyAnnounced = false;
    this.poison = 0;
    this.shield = 0;
    this.shieldMax = 0;
    this.ghostInvuln = 0;
    this.ghostFlash = 0;
    this.berserkFrenzy = 0;

    this.weapon = WEAPONS[this.weaponKey].create(this);
    // Per-target hit cooldowns. Without these a resting blade would deal damage
    // every single frame and a fight would be over in half a second.
    this.hitCd = new Map();

    this.trail = [];

    const abilityDef = ABILITIES[this.abilityKey];
    if (abilityDef && abilityDef.init) abilityDef.init(this);
  }

  get ability() { return ABILITIES[this.abilityKey]; }
  get weaponDef() { return WEAPONS[this.weaponKey]; }
  get hpFrac() { return clamp(this.hp / this.maxHp, 0, 1); }

  /** Radius tracks remaining health when HP-size mode is on. */
  get r() {
    if (!SETTINGS.hpSizeMode) return this.baseR;
    return this.baseR * (0.5 + 0.5 * this.hpFrac);
  }

  get mass() {
    const r = this.r;
    return (r * r) / 1600 * this.massMult;
  }

  get speed() { return SETTINGS.ballSpeed * this.speedMult; }

  /** All healing funnels through here so sudden death can throttle it to zero. */
  heal(amount) {
    const mult = this.world ? this.world.healMult : 1;
    this.hp = Math.min(this.maxHp, this.hp + amount * mult);
  }

  addSuperCharge(amount) {
    if (!SETTINGS.supers) return;
    this.superCharge = clamp(this.superCharge + amount, 0, SUPER_CHARGE_MAX);
  }

  get superReady() { return SETTINGS.supers && this.superCharge >= SUPER_CHARGE_MAX; }

  recordTrail() {
    this.trail.push(this.x, this.y);
    if (this.trail.length > TRAIL_LEN * 2) this.trail.splice(0, 2);
  }

  drawTrail(ctx) {
    if (!SETTINGS.trails || this.trail.length < 6) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = this.trail.length / 2;
    for (let i = 1; i < pts; i++) {
      const t = i / pts;
      ctx.strokeStyle = withAlpha(this.color, t * 0.3);
      ctx.lineWidth = this.r * 1.5 * t;
      ctx.beginPath();
      ctx.moveTo(this.trail[(i - 1) * 2], this.trail[(i - 1) * 2 + 1]);
      ctx.lineTo(this.trail[i * 2], this.trail[i * 2 + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBody(ctx) {
    const r = this.r;
    const ab = this.ability;

    if (ab && ab.aura) ab.aura(ctx, this);

    ctx.save();
    if (this.ghostInvuln > 0) ctx.globalAlpha = 0.45;

    // Outer glow.
    ctx.fillStyle = withAlpha(this.color, 0.28);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r + 14, 0, TAU);
    ctx.fill();

    // Body — flashes white for a moment when struck.
    const flash = clamp(this.hitFlash / 0.18, 0, 1);
    ctx.fillStyle = flash > 0 ? mixHex(this.color, '#ffffff', flash * 0.85) : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();

    // Glossy highlight — cheap, but it makes the ball read as a 3D object.
    const grad = ctx.createRadialGradient(
      this.x - r * 0.35, this.y - r * 0.4, r * 0.1,
      this.x, this.y, r
    );
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();

    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r - 1.5, 0, TAU);
    ctx.stroke();

    if (this.poison > 0) {
      ctx.fillStyle = withAlpha('#a3e635', 0.3);
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Name plate + health bar + super meter, drawn above the ball. */
  drawPlate(ctx) {
    const r = this.r;
    const w = 132;
    const h = 15;
    const x = this.x - w / 2;
    const y = this.y - r - 62;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 30px ui-rounded, "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(6,10,24,0.85)';
    ctx.strokeText(this.name, this.x, y - 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, this.x, y - 10);

    // Health bar.
    ctx.fillStyle = 'rgba(6,10,24,0.75)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, w, h);
    const frac = this.hpFrac;
    ctx.fillStyle = frac > 0.5 ? '#7ee08a' : frac > 0.22 ? '#ffd166' : '#ff5b6e';
    ctx.fillRect(x, y, w * frac, h);

    // Shield overlay sits on the same bar.
    if (this.shieldMax > 0 && this.shield > 0) {
      ctx.fillStyle = withAlpha('#5aa9ff', 0.85);
      ctx.fillRect(x, y, w * clamp(this.shield / this.shieldMax, 0, 1), 5);
    }

    ctx.font = '800 22px ui-rounded, "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(6,10,24,0.85)';
    ctx.strokeText(String(Math.max(0, Math.ceil(this.hp))), this.x, y + h + 22);
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(String(Math.max(0, Math.ceil(this.hp))), this.x, y + h + 22);

    // Super meter.
    if (SETTINGS.supers && this.superCharge > 0) {
      const sy = y + h + 6;
      const sfrac = this.superCharge / 100;
      ctx.fillStyle = 'rgba(6,10,24,0.6)';
      ctx.fillRect(x + 26, sy, w - 52, 6);
      ctx.fillStyle = this.superReady ? '#ffd166' : withAlpha('#ffd166', 0.6);
      ctx.fillRect(x + 26, sy, (w - 52) * sfrac, 6);
    }
    ctx.restore();
  }
}
