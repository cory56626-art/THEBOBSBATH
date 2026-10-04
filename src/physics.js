/** Ground-plane physics. Distances are metres; speeds are metres per second. */
const CAR_RADIUS = 1.8;
const PERSON_RADIUS = 0.4;
const MAX_DT = 0.25;
const EPS = 1e-5;
const CONTACT_GAP = 0.002;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const approach = (value, target, step) => value < target
  ? Math.min(value + step, target) : Math.max(value - step, target);

function boxOf(collider) {
  if (!collider || collider.disabled || collider.solid === false) return null;
  let minX, maxX, minZ, maxZ;
  if (Number.isFinite(collider.minX)) {
    ({ minX, maxX, minZ, maxZ } = collider);
  } else if (collider.min && collider.max) {
    minX = collider.min.x; maxX = collider.max.x;
    minZ = collider.min.z; maxZ = collider.max.z;
  } else {
    const { x, z } = collider;
    const hx = collider.hx ?? collider.width / 2;
    const hz = collider.hz ?? collider.depth / 2;
    minX = x - hx; maxX = x + hx;
    minZ = z - hz; maxZ = z + hz;
  }
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  return {
    minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ),
  };
}

function boxesOf(colliders) {
  return colliders.map(boxOf).filter(Boolean);
}

function circlesOf(obstacles, moving) {
  return obstacles.filter(obstacle => obstacle && obstacle !== moving
    && !obstacle.disabled && obstacle.active !== false
    && !(moving?.id !== undefined && obstacle.id === moving.id)
    && Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z))
    .map(obstacle => ({ x: obstacle.x, z: obstacle.z,
      radius: Math.max(0, finite(obstacle.radius ?? obstacle.r, CAR_RADIUS)) }));
}

function expanded(box, radius) {
  return { minX: box.minX - radius, maxX: box.maxX + radius,
    minZ: box.minZ - radius, maxZ: box.maxZ + radius };
}

/** Slab intersection, including entry normal. Starts on a wall may move away. */
function segmentBox(x, z, dx, dz, box) {
  let enter = -Infinity;
  let leave = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [start, delta, min, max, axis] of [
    [x, dx, box.minX, box.maxX, 'x'],
    [z, dz, box.minZ, box.maxZ, 'z'],
  ]) {
    if (Math.abs(delta) < EPS) {
      if (start < min || start > max) return null;
      continue;
    }
    let near = (min - start) / delta;
    let far = (max - start) / delta;
    const normal = delta > 0 ? -1 : 1;
    if (near > far) [near, far] = [far, near];
    if (near > enter) {
      enter = near;
      nx = axis === 'x' ? normal : 0;
      nz = axis === 'z' ? normal : 0;
    }
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }
  if (leave < 0 || enter > 1) return null;
  return { t: enter, leave, nx, nz };
}

function segmentCircle(x, z, dx, dz, circle, radius) {
  const px = x - circle.x;
  const pz = z - circle.z;
  const r = radius + circle.radius;
  const a = dx * dx + dz * dz;
  if (a < EPS * EPS) return null;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < -EPS || t > 1) return null;
  const cx = px + dx * t;
  const cz = pz + dz * t;
  const length = Math.hypot(cx, cz) || 1;
  return { t: Math.max(0, t), nx: cx / length, nz: cz / length };
}

function sweep(x, z, dx, dz, radius, boxes, bounds, circles = []) {
  let nearest = null;
  const consider = hit => {
    if (hit && hit.t >= -EPS && hit.t <= 1
      && (!nearest || hit.t < nearest.t)
      && dx * hit.nx + dz * hit.nz < -EPS) nearest = hit;
  };
  for (const box of boxes) consider(segmentBox(x, z, dx, dz, expanded(box, radius)));
  for (const circle of circles) consider(segmentCircle(x, z, dx, dz, circle, radius));
  const limit = Math.max(radius, bounds) - radius;
  if (dx > EPS && x + dx > limit) consider({ t: (limit - x) / dx, nx: -1, nz: 0 });
  if (dx < -EPS && x + dx < -limit) consider({ t: (-limit - x) / dx, nx: 1, nz: 0 });
  if (dz > EPS && z + dz > limit) consider({ t: (limit - z) / dz, nx: 0, nz: -1 });
  if (dz < -EPS && z + dz < -limit) consider({ t: (-limit - z) / dz, nx: 0, nz: 1 });
  return nearest;
}

/** Repair overlapping spawns and small floating-point overlaps. */
function depenetrate(body, radius, boxes, bounds, circles = []) {
  const limit = Math.max(radius, bounds) - radius;
  let collided = false;
  for (let iteration = 0; iteration < 8; iteration++) {
    let moved = false;
    const bx = clamp(body.x, -limit, limit);
    const bz = clamp(body.z, -limit, limit);
    if (body.x !== bx || body.z !== bz) {
      body.x = bx; body.z = bz; moved = true;
    }
    for (const original of boxes) {
      const box = expanded(original, radius);
      if (body.x <= box.minX || body.x >= box.maxX
        || body.z <= box.minZ || body.z >= box.maxZ) continue;
      const edges = [
        { distance: body.x - box.minX, x: box.minX - CONTACT_GAP, z: body.z },
        { distance: box.maxX - body.x, x: box.maxX + CONTACT_GAP, z: body.z },
        { distance: body.z - box.minZ, x: body.x, z: box.minZ - CONTACT_GAP },
        { distance: box.maxZ - body.z, x: body.x, z: box.maxZ + CONTACT_GAP },
      ];
      edges.sort((a, b) => a.distance - b.distance);
      body.x = edges[0].x; body.z = edges[0].z; moved = true;
    }
    for (const circle of circles) {
      const dx = body.x - circle.x;
      const dz = body.z - circle.z;
      const distance = Math.hypot(dx, dz);
      const required = radius + circle.radius;
      if (distance >= required) continue;
      const nx = distance > EPS ? dx / distance : 1;
      const nz = distance > EPS ? dz / distance : 0;
      body.x = circle.x + nx * (required + CONTACT_GAP);
      body.z = circle.z + nz * (required + CONTACT_GAP);
      moved = true;
    }
    collided ||= moved;
    if (!moved) break;
  }
  body.x = clamp(body.x, -limit, limit);
  body.z = clamp(body.z, -limit, limit);
  return collided;
}

export function createVehicle({ x = 0, z = 112, angle = 0 } = {}) {
  return { x: finite(x), z: finite(z, 112), angle: finite(angle), speed: 0,
    steer: 0, slip: 0, vx: 0, vz: 0, damage: 0, health: 100, collisionTimer: 0 };
}

/** Forward is (-sin(angle), -cos(angle)); positive steering turns right. */
export function updateVehicle(car, input = {}, dt = 0, colliders = [], bounds = 210, obstacles = []) {
  const elapsed = clamp(finite(dt), 0, MAX_DT);
  if (!elapsed) return { collision: false, impact: 0 };
  const boxes = boxesOf(colliders);
  const circles = circlesOf(obstacles, car);
  bounds = Math.max(CAR_RADIUS, finite(bounds, 210));
  car.x = finite(car.x); car.z = finite(car.z);
  car.angle = finite(car.angle); car.speed = finite(car.speed);
  car.steer = finite(car.steer); car.slip = finite(car.slip);
  car.health = clamp(finite(car.health, 100), 0, 100);
  car.damage = clamp(finite(car.damage), 0, 100);
  car.collisionTimer = Math.max(0, finite(car.collisionTimer) - elapsed);
  let collision = depenetrate(car, CAR_RADIUS, boxes, bounds, circles);
  let impact = 0;
  const throttle = clamp(finite(input.throttle), -1, 1);
  const steering = clamp(finite(input.steer), -1, 1);
  const steps = Math.ceil(elapsed / (1 / 120));
  const step = elapsed / steps;

  for (let index = 0; index < steps; index++) {
    const handbrake = Boolean(input.handbrake);
    const brake = Boolean(input.brake);
    car.steer = approach(car.steer, steering, step * 4.5);
    const braking = brake ? 19 : handbrake ? 12 : 0;
    if (braking) car.speed = approach(car.speed, 0, braking * step);
    else if (throttle) {
      const opposing = throttle * car.speed < -0.2;
      car.speed += throttle * (opposing ? 14 : 8) * step;
    }
    const rollingDrag = 0.32 + 0.004 * car.speed * car.speed;
    car.speed = approach(car.speed, 0, rollingDrag * step);
    car.speed = clamp(car.speed, -12, 35);
    if (car.health <= 0) car.speed = approach(car.speed, 0, 8 * step);

    const steeringAngle = 0.53 / (1 + Math.abs(car.speed) / 32);
    const turn = Math.abs(car.speed) > 0.1
      ? -car.speed / 2.7 * Math.tan(car.steer * steeringAngle) * step : 0;
    car.angle += turn;
    // Inertia retains a small sideways component during turns, especially under handbrake.
    car.slip += car.speed * Math.sin(turn);
    car.slip *= Math.exp(-(handbrake ? 2.8 : 9) * step);
    const maxSlip = Math.abs(car.speed) * (handbrake ? 0.45 : 0.24);
    car.slip = clamp(car.slip, -maxSlip, maxSlip);
    const fx = -Math.sin(car.angle), fz = -Math.cos(car.angle);
    const rx = Math.cos(car.angle), rz = -Math.sin(car.angle);
    let vx = fx * car.speed + rx * car.slip;
    let vz = fz * car.speed + rz * car.slip;
    let remaining = step;
    for (let contact = 0; contact < 3 && remaining > EPS; contact++) {
      const dx = vx * remaining, dz = vz * remaining;
      const hit = sweep(car.x, car.z, dx, dz, CAR_RADIUS, boxes, bounds, circles);
      if (!hit) {
        car.x += dx; car.z += dz; remaining = 0; break;
      }
      collision = true;
      const distance = Math.hypot(dx, dz);
      const travel = Math.max(0, hit.t - CONTACT_GAP / Math.max(distance, EPS));
      car.x += dx * travel; car.z += dz * travel;
      const incoming = Math.max(0, -(vx * hit.nx + vz * hit.nz));
      impact = Math.max(impact, incoming);
      if (incoming > 5) {
        const damage = Math.min(32, (incoming - 5) * 1.35);
        car.health = Math.max(0, car.health - damage);
        car.damage = Math.min(100, car.damage + damage);
      }
      car.collisionTimer = 0.4;
      // Low restitution; the tangential component loses energy rather than sticking.
      vx = (vx + incoming * hit.nx) * 0.72 + hit.nx * incoming * 0.1;
      vz = (vz + incoming * hit.nz) * 0.72 + hit.nz * incoming * 0.1;
      remaining *= 1 - hit.t;
    }
    car.speed = vx * fx + vz * fz;
    car.slip = vx * rx + vz * rz;
    car.vx = vx; car.vz = vz;
  }
  // Keep yaw bounded without changing orientation after long sessions.
  car.angle = Math.atan2(Math.sin(car.angle), Math.cos(car.angle));
  return { collision, impact };
}

/** dx/dz are world-space velocities. The person slides along obstructing walls. */
export function movePerson(person, dx, dz, dt, colliders = [], bounds = 210) {
  const elapsed = clamp(finite(dt), 0, MAX_DT);
  person.x = finite(person.x); person.z = finite(person.z);
  const boxes = boxesOf(colliders);
  bounds = Math.max(PERSON_RADIUS, finite(bounds, 210));
  let collision = depenetrate(person, PERSON_RADIUS, boxes, bounds);
  let mx = finite(dx) * elapsed, mz = finite(dz) * elapsed;
  for (let contact = 0; contact < 4 && Math.hypot(mx, mz) > EPS; contact++) {
    const hit = sweep(person.x, person.z, mx, mz, PERSON_RADIUS, boxes, bounds);
    if (!hit) { person.x += mx; person.z += mz; break; }
    collision = true;
    const travel = Math.max(0, hit.t - CONTACT_GAP / Math.hypot(mx, mz));
    person.x += mx * travel; person.z += mz * travel;
    mx *= 1 - hit.t; mz *= 1 - hit.t;
    const inward = mx * hit.nx + mz * hit.nz;
    if (inward < 0) { mx -= inward * hit.nx; mz -= inward * hit.nz; }
  }
  return { collision };
}

function positionClear(x, z, radius, boxes, bounds) {
  if (Math.abs(x) > bounds - radius || Math.abs(z) > bounds - radius) return false;
  return !boxes.some(original => {
    const box = expanded(original, radius);
    return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
  });
}

/** Null means there is no safe exit; callers should leave the player in the car. */
export function findExit(car, colliders = [], bounds = 210) {
  const boxes = boxesOf(colliders);
  bounds = Math.max(PERSON_RADIUS, finite(bounds, 210));
  const angle = finite(car.angle);
  const rx = Math.cos(angle), rz = -Math.sin(angle);
  const fx = -Math.sin(angle), fz = -Math.cos(angle);
  const candidates = [[rx * 3.2, rz * 3.2], [-rx * 3.2, -rz * 3.2],
    [-fx * 3.8, -fz * 3.8], [fx * 3.8, fz * 3.8],
    [rx * 3 + fx * 2, rz * 3 + fz * 2],
    [-rx * 3 + fx * 2, -rz * 3 + fz * 2]];
  for (const [dx, dz] of candidates) {
    const x = car.x + dx, z = car.z + dz;
    if (!positionClear(x, z, PERSON_RADIUS, boxes, bounds)) continue;
    const crossesWall = boxes.some(box => {
      const hit = segmentBox(car.x, car.z, dx, dz, expanded(box, PERSON_RADIUS));
      return hit && hit.leave >= 0 && hit.t <= 1;
    });
    if (!crossesWall) return { x, z };
  }
  return null;
}

export function hasLineOfSight(ax, az, bx, bz, colliders = []) {
  if (![ax, az, bx, bz].every(Number.isFinite)) return false;
  const dx = bx - ax, dz = bz - az;
  for (const collider of colliders) {
    const box = boxOf(collider);
    if (!box) continue;
    const hit = segmentBox(ax, az, dx, dz, box);
    if (hit && hit.leave >= 0 && hit.t <= 1) return false;
  }
  return true;
}
