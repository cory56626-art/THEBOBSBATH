// Original procedural rig. Feet live in document coordinates and stay planted;
// only a lifted leg interpolates to a new contact. The body has its own inertia.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const copy = p => ({ x: p.x, y: p.y });
const order = [0, 6, 2, 4, 1, 7, 3, 5];

// Circle intersection gives the knee of a two-segment leg. Each leg keeps its
// bend side, avoiding the elbow flipping that arbitrary sine-wave joints cause.
export function solveLeg(root, toe, upper, lower, bend = 1) {
  const dx = toe.x - root.x, dy = toe.y - root.y;
  const raw = Math.hypot(dx, dy);
  const d = clamp(raw, Math.abs(upper - lower) + .00001, upper + lower - .00001);
  const ux = raw > .00001 ? dx / raw : 0;
  const uy = raw > .00001 ? dy / raw : 1;
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend;
  return {
    knee: { x: root.x + ux * along - uy * across, y: root.y + uy * along + ux * across },
    toe: { x: root.x + ux * d, y: root.y + uy * d },
    reachable: raw >= Math.abs(upper - lower) && raw <= upper + lower,
  };
}

export function localPoint(body, x, y) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  return { x: body.x + x * c - y * s, y: body.y + x * s + y * c };
}

export function createRig(x, y, scale = 1) {
  const body = { x, y, vx: 0, vy: 0, angle: 0 };
  const legs = Array.from({ length: 8 }, (_, i) => {
    const side = i < 4 ? -1 : 1, pair = i % 4;
    const rest = { x: side * [44, 66, 70, 43][pair] * scale, y: [-70, -25, 29, 76][pair] * scale };
    const toe = localPoint(body, rest.x, rest.y);
    return { side, pair, rest, toe, from: copy(toe), to: copy(toe), lift: 1, stepping: false,
      upper: [43, 45, 47, 44][pair] * scale, lower: [65, 59, 62, 71][pair] * scale,
      bend: -side * (pair < 2 ? -1 : 1), plantedAt: 0, steps: 0 };
  });
  return { body, goal: { x, y }, scale, legs, sequence: 0, stepDelay: 0, steps: 0 };
}

export function translateBodyForScroll(rig, dy) {
  rig.body.y += dy;
  rig.goal.y += dy;
  // Deliberately leave all toes in document space: they grip the passing text.
}

export function updateRig(rig, dt, now, findContact, { running = true, reduced = false, pace = 1 } = {}) {
  if (!running) return;
  const b = rig.body;
  if (reduced) {
    b.x = rig.goal.x; b.y = rig.goal.y; b.vx = b.vy = b.angle = 0;
    for (const leg of rig.legs) {
      const p = localPoint(b, leg.rest.x, leg.rest.y);
      leg.toe = findContact(p, leg); leg.stepping = false;
    }
    return;
  }
  // Small stable integration steps keep frame rate changes from changing gait.
  const elapsed = Math.min(dt, .12);
  const count = Math.max(1, Math.ceil(elapsed / .008));
  const h = elapsed / count;
  const stiffness = 180 * pace * pace, damping = 24 * pace;
  for (let k = 0; k < count; k++) {
    b.vx += ((rig.goal.x - b.x) * stiffness - b.vx * damping) * h;
    b.vy += ((rig.goal.y - b.y) * stiffness - b.vy * damping) * h;
    b.x += b.vx * h; b.y += b.vy * h;
  }
  const tilt = clamp(b.vx / (650 * pace), -.32, .32);
  b.angle += (tilt - b.angle) * (1 - Math.exp(-dt * 13));
  rig.stepDelay = Math.max(0, rig.stepDelay - dt);

  for (const leg of rig.legs) {
    if (!leg.stepping) continue;
    leg.lift = Math.min(1, leg.lift + dt / leg.duration);
    const u = leg.lift, ease = u * u * (3 - 2 * u);
    leg.toe.x = leg.from.x + (leg.to.x - leg.from.x) * ease + Math.sin(Math.PI * u) * leg.side * 4 * rig.scale;
    leg.toe.y = leg.from.y + (leg.to.y - leg.from.y) * ease - Math.sin(Math.PI * u) * 11 * rig.scale;
    if (u >= 1) { leg.toe = copy(leg.to); leg.stepping = false; leg.plantedAt = now; }
  }

  // Stagger the lifts; five or more feet support the body throughout a stride.
  let moving = rig.legs.filter(l => l.stepping).length;
  if (moving >= 3 || rig.stepDelay > 0) return;
  const candidates = rig.legs.map((leg, i) => {
    const rest = localPoint(b, leg.rest.x + clamp(b.vx * .07, -18, 18), leg.rest.y);
    const root = localPoint(b, leg.side * 4 * rig.scale, (leg.pair - 1.5) * 5 * rig.scale);
    const reach = distance(root, leg.toe) / (leg.upper + leg.lower);
    const error = distance(rest, leg.toe);
    const priority = reach > .92 ? 100 + reach : error / rig.scale;
    return { leg, i, rest, error, reach, priority };
  }).filter(c => !c.leg.stepping && now - c.leg.plantedAt > .09 && (c.error > 24 * rig.scale || c.reach > .92));
  if (!candidates.length) return;
  candidates.sort((a, b) => b.priority - a.priority || ((order.indexOf(a.i) - rig.sequence + 8) % 8) - ((order.indexOf(b.i) - rig.sequence + 8) % 8));
  const chosen = candidates[0], leg = chosen.leg;
  leg.from = copy(leg.toe);
  leg.to = copy(findContact(chosen.rest, leg));
  if (distance(leg.to, leg.toe) < 7 * rig.scale) return;
  leg.lift = 0; leg.stepping = true;
  leg.duration = clamp(.14 / pace + distance(leg.from, leg.to) * .0004, .095, .23);
  leg.steps++; rig.steps++; rig.sequence = (order.indexOf(chosen.i) + 1) % 8;
  rig.stepDelay = .045 / pace;
}

export function legPose(rig, leg) {
  const root = localPoint(rig.body, leg.side * 4 * rig.scale, (leg.pair - 1.5) * 5 * rig.scale);
  // A small amount of extension matches the elastic, angular digital rig.
  const stretch = Math.max(1, distance(root, leg.toe) / ((leg.upper + leg.lower) * .985));
  let upper = leg.upper * stretch, lower = leg.lower * stretch;
  const reach = distance(root, leg.toe);
  if (reach < Math.abs(upper - lower)) {
    // Preserve the toe's grip when the body passes close over a folded foot.
    const total = upper + lower;
    upper = (total - reach * .95) / 2;
    lower = (total + reach * .95) / 2;
  }
  return { root, ...solveLeg(root, leg.toe, upper, lower, leg.bend) };
}
