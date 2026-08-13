// All canvas drawing: background, arena, fighters, HUD, winner card.

import { TAU, clamp, withAlpha, roundRect, formatTime } from './utils.js';
import { W, H, ARENA, SETTINGS } from './config.js';
import { WEAPONS } from './weapons.js';

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

export function render(ctx, world, hookText) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawBackdrop(ctx);

  const [sx, sy] = world.fx.shakeOffset();
  ctx.save();
  ctx.translate(sx, sy);

  drawArena(ctx);

  // Clip so trails, beams and debris stay inside the tub.
  ctx.save();
  roundRect(ctx, ARENA.x, ARENA.y, ARENA.w, ARENA.h, ARENA.radius);
  ctx.clip();

  for (const b of world.balls) if (b.alive) b.drawTrail(ctx);
  world.drawHazards(ctx);
  world.drawPickups(ctx);
  world.fx.drawWorld(ctx);

  for (const b of world.balls) {
    if (!b.alive) continue;
    WEAPONS[b.weaponKey].draw(ctx, b);
  }
  for (const b of world.balls) {
    if (!b.alive) continue;
    b.drawBody(ctx);
  }
  world.drawProjectiles(ctx);

  for (const b of world.balls) {
    if (!b.alive) continue;
    b.drawPlate(ctx);
  }

  world.fx.drawNumbers(ctx);
  ctx.restore(); // end clip

  ctx.restore(); // end shake

  drawHud(ctx, world, hookText);
  drawKillFeed(ctx, world);

  if (world.fx.flash > 0) {
    ctx.fillStyle = withAlpha(world.fx.flashColor, world.fx.flash * 0.5);
    ctx.fillRect(0, 0, W, H);
  }

  if (world.state === 'over') drawWinner(ctx, world);

  ctx.restore();
}

function drawBackdrop(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0f22');
  g.addColorStop(0.5, '#111834');
  g.addColorStop(1, '#080c1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawArena(ctx) {
  ctx.save();
  // Floor.
  const g = ctx.createLinearGradient(0, ARENA.y, 0, ARENA.y + ARENA.h);
  g.addColorStop(0, 'rgba(30,44,92,0.85)');
  g.addColorStop(1, 'rgba(16,24,54,0.9)');
  roundRect(ctx, ARENA.x, ARENA.y, ARENA.w, ARENA.h, ARENA.radius);
  ctx.fillStyle = g;
  ctx.fill();

  // Inner glow.
  ctx.strokeStyle = 'rgba(126,224,192,0.16)';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,210,255,0.75)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx, world, hookText) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Hook text — the "will X win?" line that makes these videos work.
  if (hookText) {
    ctx.font = `900 54px ${FONT}`;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(6,10,24,0.9)';
    ctx.strokeText(hookText, W / 2, 62);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hookText, W / 2, 62);
  }

  // Fighter chips.
  const list = world.balls;
  const perRow = list.length <= 4 ? list.length : 4;
  const cw = 244;
  const ch = 72;
  const gap = 10;
  const rows = Math.ceil(list.length / perRow);
  const startY = 104;

  list.forEach((b, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, list.length - row * perRow);
    const rowW = inRow * cw + (inRow - 1) * gap;
    const x = (W - rowW) / 2 + col * (cw + gap);
    const y = startY + row * (ch + gap);
    drawChip(ctx, b, x, y, cw, ch);
  });

  // Timer, tucked under the chips.
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = 'rgba(200,215,255,0.65)';
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(world.time), W - 62, startY + rows * (ch + gap) + 12);
  ctx.restore();
}

function drawChip(ctx, b, x, y, w, h) {
  ctx.save();
  const dead = !b.alive;
  ctx.globalAlpha = dead ? 0.35 : 1;

  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(12,18,40,0.82)';
  ctx.fill();
  ctx.strokeStyle = dead ? 'rgba(120,140,200,0.3)' : withAlpha(b.color, 0.9);
  ctx.lineWidth = 3;
  ctx.stroke();

  // Colour dot.
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(x + 30, y + h / 2, 17, 0, TAU);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 27px ${FONT}`;
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(b.name, x + 58, y + 30);

  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = 'rgba(190,205,255,0.65)';
  ctx.fillText(WEAPONS[b.weaponKey].label, x + 58, y + h - 30);

  // Health bar.
  const bw = w - 70;
  const by = y + h - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 58, by, bw, 9);
  const frac = b.hpFrac;
  ctx.fillStyle = frac > 0.5 ? '#7ee08a' : frac > 0.22 ? '#ffd166' : '#ff5b6e';
  ctx.fillRect(x + 58, by, bw * frac, 9);

  // Kill count.
  if (b.kills > 0) {
    ctx.textAlign = 'right';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`${b.kills}`, x + w - 14, y + 32);
  }

  if (dead) {
    ctx.textAlign = 'right';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillStyle = '#ff5b6e';
    ctx.fillText('OUT', x + w - 14, y + h - 26);
  }
  ctx.restore();
}

function drawKillFeed(ctx, world) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 27px ${FONT}`;
  let y = H - 46;
  for (const item of world.fx.feed) {
    const a = clamp(item.life / 1.2, 0, 1);
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(6,10,24,${a * 0.8})`;
    ctx.strokeText(item.text, 62, y);
    ctx.fillStyle = withAlpha(item.color || '#ffffff', a);
    ctx.fillText(item.text, 62, y);
    y -= 38;
  }
  ctx.restore();
}

function drawWinner(ctx, world) {
  const t = clamp(world.endTimer / 0.5, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(4,7,18,${0.72 * t})`;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const w = world.winner;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (w) {
    // Ball portrait.
    ctx.fillStyle = withAlpha(w.color, 0.3 * t);
    ctx.beginPath();
    ctx.arc(cx, cy - 90, 180 * t, 0, TAU);
    ctx.fill();
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(cx, cy - 90, 120 * t, 0, TAU);
    ctx.fill();
    const grad = ctx.createRadialGradient(cx - 42, cy - 138, 12, cx, cy - 90, 120);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy - 90, 120 * t, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = t;
    ctx.font = `900 56px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('WINNER', cx, cy + 100);

    ctx.font = `900 110px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(w.name, cx, cy + 190);

    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = 'rgba(200,215,255,0.8)';
    ctx.fillText(
      `${WEAPONS[w.weaponKey].label}  ·  ${w.kills} KO  ·  ${Math.round(w.damageDealt)} dmg`,
      cx, cy + 258
    );
    ctx.fillText(`${Math.ceil(w.hp)} HP remaining`, cx, cy + 308);
  } else {
    ctx.globalAlpha = t;
    ctx.font = `900 84px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('EVERYONE DIED', cx, cy);
  }
  ctx.restore();
}
