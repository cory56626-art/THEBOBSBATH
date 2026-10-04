/**
 * Deterministic, renderer-independent city simulation. Units are meters/seconds.
 * createSimulation({colliders, roads, bounds, seed}) exposes stable people/traffic
 * arrays. Collider formats: {x,z,hx,hz}, {minX,maxX,minZ,maxZ}, or Box3 min/max.
 * step(dt, {x,z,inCar,speed}) clamps dt to 0.1 and returns events:
 *   {type:'damage',amount,source} -- damage to the player
 *   {type:'gunfire',source,x,z,targetX,targetZ} -- NPC shot, hit or miss
 *   {type:'message',text} -- dispatch/status notification
 * shoot({x,z,dx,dz,range=70}) returns the nearest living hit actor, or null.
 * The player owns their position and health; this module never changes them.
 * Actors use forward=(-sin(angle),-cos(angle)), hp=0/state='down' when defeated.
 * This is a rule-based finite-state simulation; no network/model is required.
 */

const TAU = Math.PI * 2;
const ACTOR_RADIUS = 0.62;
const SIDEWALK = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const heading = (dx, dz) => Math.atan2(-dx, -dz);
const normalizeAngle = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

function normalizeBox(box) {
  const x = Number(box.x ?? 0), z = Number(box.z ?? 0);
  const hx = Number(box.hx ?? (box.width ?? box.w ?? 0) / 2);
  const hz = Number(box.hz ?? (box.depth ?? box.d ?? 0) / 2);
  const minX = Number(box.minX ?? box.min?.x ?? x - hx);
  const maxX = Number(box.maxX ?? box.max?.x ?? x + hx);
  const minZ = Number(box.minZ ?? box.min?.z ?? z - hz);
  const maxZ = Number(box.maxZ ?? box.max?.z ?? z + hz);
  return { minX, maxX, minZ, maxZ };
}

// Slab intersection, with the same clearance for navigation and movement.
function segmentBox(ax, az, bx, bz, box, padding = 0) {
  let near = 0, far = 1;
  for (const [a, delta, min, max] of [
    [ax, bx - ax, box.minX - padding, box.maxX + padding],
    [az, bz - az, box.minZ - padding, box.maxZ + padding],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (a < min || a > max) return false;
    } else {
      let enter = (min - a) / delta, leave = (max - a) / delta;
      if (enter > leave) [enter, leave] = [leave, enter];
      near = Math.max(near, enter);
      far = Math.min(far, leave);
      if (near > far) return false;
    }
  }
  return far >= 0 && near <= 1;
}

export function createSimulation({ colliders = [], roads = [-144, -72, 0, 72, 144], bounds = 210, seed = 42 } = {}) {
  const boxes = colliders.map(normalizeBox).filter((box) =>
    Number.isFinite(box.minX + box.maxX + box.minZ + box.maxZ) && box.maxX > box.minX && box.maxZ > box.minZ);
  const streets = [...new Set(roads.filter(Number.isFinite))].sort((a, b) => a - b);
  if (streets.length < 2) streets.splice(0, streets.length, -72, 0, 72);
  const people = [], traffic = [];
  let randomState, time, heat, score, lastSeen, lastShot, dispatch, paused;
  let threatNear = false;
  let noticeCooldown = 0;
  const gunfire = [];
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const clear = (a, b, radius = 0) => !boxes.some((box) => segmentBox(a.x, a.z, b.x, b.z, box, radius));
  const free = (x, z, radius = ACTOR_RADIUS) => Math.abs(x) < bounds - radius && Math.abs(z) < bounds - radius &&
    !boxes.some((box) => x >= box.minX - radius && x <= box.maxX + radius && z >= box.minZ - radius && z <= box.maxZ + radius);
  const wanted = () => heat <= 0.02 ? 0 : Math.min(5, Math.ceil(heat / 3));

  // A sidewalk graph routes responding officers around entire city blocks.
  const lanes = streets.flatMap((road) => [road - SIDEWALK, road + SIDEWALK]);
  const nodes = [];
  for (const x of lanes) for (const z of lanes) if (free(x, z)) nodes.push({ x, z, edges: [] });
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if ((a.x === b.x || a.z === b.z) && clear(a, b, ACTOR_RADIUS)) {
        const d = distance(a, b);
        a.edges.push({ to: j, d }); b.edges.push({ to: i, d });
      }
    }
  }

  function pathTo(from, to) {
    if (clear(from, to, ACTOR_RADIUS)) return [{ x: to.x, z: to.z }];
    const visible = (point) => nodes.map((node, index) => ({ index, d: distance(point, node) }))
      .sort((a, b) => a.d - b.d).filter(({ index }) => clear(point, nodes[index], ACTOR_RADIUS)).slice(0, 6);
    const starts = visible(from), ends = visible(to);
    if (!starts.length || !ends.length) return [];
    const cost = nodes.map(() => Infinity), previous = nodes.map(() => -1), used = new Set();
    for (const start of starts) cost[start.index] = start.d;
    for (let iteration = 0; iteration < nodes.length; iteration++) {
      let next = -1;
      for (let i = 0; i < nodes.length; i++) if (!used.has(i) && (next < 0 || cost[i] < cost[next])) next = i;
      if (next < 0 || !Number.isFinite(cost[next])) break;
      used.add(next);
      for (const edge of nodes[next].edges) {
        if (cost[next] + edge.d < cost[edge.to]) {
          cost[edge.to] = cost[next] + edge.d; previous[edge.to] = next;
        }
      }
    }
    let end = ends.reduce((best, item) => cost[item.index] + item.d < cost[best.index] + best.d ? item : best, ends[0]);
    if (!Number.isFinite(cost[end.index])) return [];
    const path = [{ x: to.x, z: to.z }];
    let cursor = end.index;
    while (cursor >= 0) { path.unshift({ x: nodes[cursor].x, z: nodes[cursor].z }); cursor = previous[cursor]; }
    return path;
  }

  function move(actor, target, speed, dt, navigation = false) {
    if (!target || speed <= 0) return;
    let destination = target;
    if (navigation && !clear(actor, target, ACTOR_RADIUS)) {
      if (!actor.path?.length || actor.nextPath <= time || distance(actor.pathGoal ?? target, target) > 8) {
        actor.path = pathTo(actor, target); actor.pathGoal = { x: target.x, z: target.z }; actor.nextPath = time + 1.1;
      }
      while (actor.path?.length && distance(actor, actor.path[0]) < 1.1) actor.path.shift();
      destination = actor.path?.[0] ?? target;
    } else actor.path = [];
    const dx = destination.x - actor.x, dz = destination.z - actor.z, length = Math.hypot(dx, dz);
    if (length < 0.04) return;
    actor.angle = heading(dx, dz);
    const amount = Math.min(speed * dt, length);
    const nx = clamp(actor.x + dx / length * amount, -bounds + 1, bounds - 1);
    const nz = clamp(actor.z + dz / length * amount, -bounds + 1, bounds - 1);
    const destinationPoint = { x: nx, z: nz };
    if (clear(actor, destinationPoint, ACTOR_RADIUS) && free(nx, nz)) { actor.x = nx; actor.z = nz; }
    else if (clear(actor, { x: nx, z: actor.z }, ACTOR_RADIUS) && free(nx, actor.z)) actor.x = nx;
    else if (clear(actor, { x: actor.x, z: nz }, ACTOR_RADIUS) && free(actor.x, nz)) actor.z = nz;
  }

  function safePoint(x, z) {
    if (free(x, z)) return { x, z };
    const nearby = nodes.reduce((best, node) => !best || Math.hypot(node.x - x, node.z - z) < Math.hypot(best.x - x, best.z - z) ? node : best, null);
    return nearby ? { x: nearby.x, z: nearby.z } : { x: 0, z: 0 };
  }

  function sidewalkRoute(index) {
    const cells = streets.length - 1;
    const row = Math.floor(index / cells) % cells, col = index % cells;
    const left = streets[col] + SIDEWALK, right = streets[col + 1] - SIDEWALK;
    const top = streets[row] + SIDEWALK, bottom = streets[row + 1] - SIDEWALK;
    return [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }].map((p) => safePoint(p.x, p.z));
  }

  function addPerson(kind, index, point, route) {
    const safe = safePoint(point.x, point.z);
    const actor = {
      id: `${kind}-${index}`, kind, ...safe, angle: random() * TAU,
      hp: kind === 'police' ? 90 : kind === 'hostile' ? 66 : 48,
      state: kind === 'civilian' ? 'walk' : 'patrol',
      speed: kind === 'civilian' ? 1.05 + random() * 0.55 : kind === 'police' ? 1.9 : 1.55,
      route, routeIndex: (index + 1) % route.length, cooldown: 0.4 + random() * 1.8,
      panicUntil: 0, nextPath: 0, path: [], investigateUntil: 0,
      color: Math.floor(random() * 6),
    };
    people.push(actor);
    return actor;
  }

  function reset() {
    randomState = Number(seed) >>> 0;
    time = 0; heat = 0; score = 0; lastSeen = -Infinity; lastShot = -Infinity;
    dispatch = 'City patrol active'; paused = false; noticeCooldown = 0; threatNear = false;
    gunfire.length = 0; people.length = 0; traffic.length = 0;
    for (let i = 0; i < 45; i++) {
      const route = sidewalkRoute(i), edge = i % route.length;
      const point = { x: route[edge].x, z: route[edge].z };
      const next = route[(edge + 1) % route.length], fraction = random() * 0.8;
      point.x += (next.x - point.x) * fraction; point.z += (next.z - point.z) * fraction;
      const actor = addPerson('civilian', i, point, route); actor.routeIndex = (edge + 1) % route.length;
    }
    for (let i = 0; i < 6; i++) {
      const route = sidewalkRoute((i * 3 + 2) % ((streets.length - 1) ** 2));
      addPerson('police', i, route[i % 4], route);
    }
    for (let i = 0; i < 4; i++) {
      const x = 36 + Math.cos(i * Math.PI / 2) * 10, z = 36 + Math.sin(i * Math.PI / 2) * 10;
      const route = [{ x, z }, { x: x + 4, z: z + 5 }, { x: x - 5, z: z + 3 }].map((p) => safePoint(p.x, p.z));
      addPerson('hostile', i, route[0], route);
    }
    const colors = [0x315572, 0xa84636, 0xbdab80, 0x627862, 0x454850, 0xceccc6, 0x2d3b52, 0x9e874b];
    const cells = streets.length - 1;
    for (let i = 0; i < 16; i++) {
      const col = i % cells, row = Math.floor(i / cells) % cells;
      const left = streets[col] + 3, right = streets[col + 1] - 3;
      const top = streets[row] + 3, bottom = streets[row + 1] - 3;
      const route = [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
      const edge = (i * 3) % 4, p = route[edge], next = route[(edge + 1) % 4], fraction = 0.15 + random() * 0.65;
      traffic.push({ id: `traffic-${i}`, x: p.x + (next.x - p.x) * fraction, z: p.z + (next.z - p.z) * fraction,
        angle: heading(next.x - p.x, next.z - p.z), speed: 0, cruiseSpeed: 8 + random() * 4,
        color: colors[i % colors.length], police: false, route, routeIndex: (edge + 1) % 4 });
    }
  }

  function reportCrime(amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    heat = clamp(heat + amount, 0, 15);
    lastSeen = time;
    dispatch = `Dispatch: ${wanted()}-star alert`;
  }

  function rememberGunfire(x, z, source) {
    gunfire.push({ x, z, until: time + 4.5, source });
    if (gunfire.length > 12) gunfire.shift();
    for (const cop of people) if (cop.kind === 'police' && cop.hp > 0 && distance(cop, { x, z }) < 100) {
      cop.investigate = { x, z }; cop.investigateUntil = time + 16;
    }
  }

  function shoot({ x, z, dx, dz, range = 70 } = {}) {
    if (paused || ![x, z, dx, dz, range].every(Number.isFinite)) return null;
    const length = Math.hypot(dx, dz);
    if (length < 1e-8 || range <= 0) return null;
    dx /= length; dz /= length; range = clamp(range, 0, 150);
    let nearest = null, nearestDistance = range;
    for (const actor of people) {
      if (actor.hp <= 0) continue;
      const ox = actor.x - x, oz = actor.z - z, projected = ox * dx + oz * dz;
      const perpendicularSq = ox * ox + oz * oz - projected * projected;
      const radius = 0.85;
      if (perpendicularSq > radius * radius || projected + radius < 0) continue;
      const entry = Math.max(0, projected - Math.sqrt(Math.max(0, radius * radius - perpendicularSq)));
      if (entry >= nearestDistance || !clear({ x, z }, { x: x + dx * entry, z: z + dz * entry })) continue;
      nearest = actor; nearestDistance = entry;
    }
    lastShot = time;
    rememberGunfire(x, z, 'player');
    if (nearest) {
      nearest.hp = Math.max(0, nearest.hp - 34);
      if (nearest.kind === 'hostile') { score += nearest.hp === 0 ? 110 : 10; nearest.state = nearest.hp === 0 ? 'down' : 'engage'; }
      else {
        reportCrime(nearest.kind === 'police' ? 4 : 3);
        score = Math.max(0, score - (nearest.hp === 0 ? 150 : 40));
        if (nearest.hp === 0) nearest.state = 'down';
        else if (nearest.kind === 'civilian') nearest.panicUntil = time + 12;
      }
    } else if (people.some((actor) => actor.kind === 'police' && actor.hp > 0 && distance(actor, { x, z }) < 65 && clear(actor, { x, z }))) {
      reportCrime(0.65);
    }
    return nearest;
  }

  function patrol(actor, dt) {
    const target = actor.route[actor.routeIndex];
    if (distance(actor, target) < 1) actor.routeIndex = (actor.routeIndex + 1) % actor.route.length;
    move(actor, actor.route[actor.routeIndex], actor.speed, dt, true);
  }

  function fire(actor, target, player, events) {
    if (actor.cooldown > 0 || !clear(actor, target)) return;
    actor.cooldown = actor.kind === 'police' ? 1.05 + random() * 0.7 : 1.65 + random() * 0.9;
    actor.angle = heading(target.x - actor.x, target.z - actor.z);
    rememberGunfire(actor.x, actor.z, actor.id);
    events.push({ type: 'gunfire', source: actor.id, x: actor.x, z: actor.z, targetX: target.x, targetZ: target.z });
    const hitChance = clamp(0.86 - distance(actor, target) / 140, 0.3, 0.85);
    if (random() > hitChance) return;
    if (target === player) events.push({ type: 'damage', amount: (actor.kind === 'hostile' ? 5 : 7) * (player.inCar ? 0.55 : 1), source: actor.id });
    else {
      target.hp = Math.max(0, target.hp - (actor.kind === 'police' ? 18 : 12));
      if (target.hp === 0) target.state = 'down';
    }
  }

  function step(dt, player = {}) {
    const events = [];
    if (paused || !Number.isFinite(dt) || dt <= 0) return events;
    dt = Math.min(dt, 0.1); time += dt;
    const hasPlayer = Number.isFinite(player.x) && Number.isFinite(player.z);
    const cops = people.filter((actor) => actor.kind === 'police' && actor.hp > 0);
    const hostiles = people.filter((actor) => actor.kind === 'hostile' && actor.hp > 0);
    for (let i = gunfire.length - 1; i >= 0; i--) if (gunfire[i].until <= time) gunfire.splice(i, 1);
    let seen = false;
    threatNear = false;

    for (const actor of people) {
      if (actor.hp <= 0) { actor.state = 'down'; continue; }
      actor.cooldown -= dt;
      if (actor.kind === 'civilian') {
        const threat = gunfire.find((shot) => distance(actor, shot) < 34) ||
          hostiles.find((enemy) => enemy.state === 'engage' && distance(actor, enemy) < 24 && clear(actor, enemy)) ||
          (hasPlayer && player.inCar && Math.abs(player.speed ?? 0) > 9 && distance(actor, player) < 10 ? player : null);
        if (threat) { actor.panicUntil = time + 6; actor.fleeFrom = { x: threat.x, z: threat.z }; }
        if (actor.panicUntil > time) {
          actor.state = 'flee';
          const source = actor.fleeFrom ?? player;
          const dx = actor.x - (source.x ?? actor.x - 1), dz = actor.z - (source.z ?? actor.z);
          const length = Math.hypot(dx, dz) || 1;
          let target = { x: clamp(actor.x + dx / length * 10, -bounds + 2, bounds - 2), z: clamp(actor.z + dz / length * 10, -bounds + 2, bounds - 2) };
          if (!free(target.x, target.z)) target = safePoint(target.x, target.z);
          move(actor, target, 3.4, dt, true);
        } else { actor.state = 'walk'; patrol(actor, dt); }
        continue;
      }

      if (actor.kind === 'hostile') {
        const playerThreat = hasPlayer && distance(actor, player) < 42 && clear(actor, player);
        const copThreat = cops.filter((cop) => ['engage', 'pursue'].includes(cop.state) && distance(actor, cop) < 48 && clear(actor, cop))
          .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
        const target = copThreat ?? (playerThreat ? player : null);
        if (target) {
          actor.state = 'engage';
          if (hasPlayer && distance(actor, player) < 55) threatNear = true;
          if (distance(actor, target) > 24) move(actor, target, 2.2, dt, true);
          fire(actor, target, player, events);
        } else { actor.state = 'patrol'; patrol(actor, dt); }
        continue;
      }

      const seesPlayer = hasPlayer && distance(actor, player) < 85 && clear(actor, player);
      if (seesPlayer && wanted() > 0) { seen = true; actor.lastKnownPlayer = { x: player.x, z: player.z }; }
      const enemy = hostiles.filter((hostile) => hostile.hp > 0 && hostile.state === 'engage' && distance(actor, hostile) < 62 && clear(actor, hostile))
        .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
      if (enemy && (!seesPlayer || wanted() < 3)) {
        actor.state = 'engage';
        if (distance(actor, enemy) > 30) move(actor, enemy, 3.8, dt, true);
        fire(actor, enemy, player, events);
      } else if (wanted() > 0 && hasPlayer) {
        actor.state = seesPlayer ? 'pursue' : 'search';
        const target = seesPlayer ? player : actor.lastKnownPlayer ?? actor.investigate;
        if (target && distance(actor, target) > (wanted() >= 2 ? 19 : 4)) move(actor, target, 4.6, dt, true);
        else if (!target) patrol(actor, dt);
        if (seesPlayer && wanted() >= 2 && distance(actor, player) < 54) fire(actor, player, player, events);
      } else if (actor.investigateUntil > time && actor.investigate) {
        actor.state = 'investigate'; move(actor, actor.investigate, 3.8, dt, true);
      } else { actor.state = 'patrol'; actor.lastKnownPlayer = null; patrol(actor, dt); }
    }

    if (seen) lastSeen = time;
    if (heat > 0 && time - lastSeen > 20) heat = Math.max(0, heat - dt * 0.4);
    noticeCooldown -= dt;
    const nextDispatch = wanted() > 0 ? (seen ? `Officers pursuing · ${wanted()} star${wanted() > 1 ? 's' : ''}` : 'Search in progress · break line of sight') :
      threatNear ? 'Armed threat nearby · patrol responding' : hostiles.length === 0 ? 'District secured · patrol active' : 'City patrol active';
    if (nextDispatch !== dispatch && noticeCooldown <= 0) {
      dispatch = nextDispatch; noticeCooldown = 4; events.push({ type: 'message', text: dispatch });
    }

    // Each car follows a lane circuit, brakes for pedestrians and lead vehicles,
    // and leaves enough clearance to prevent stationary vehicle stacks.
    for (const car of traffic) {
      if (distance(car, car.route[car.routeIndex]) < 1.8) car.routeIndex = (car.routeIndex + 1) % car.route.length;
      const target = car.route[car.routeIndex], dx = target.x - car.x, dz = target.z - car.z, length = Math.hypot(dx, dz) || 1;
      const fx = dx / length, fz = dz / length;
      const ahead = (other, maxDistance, width) => {
        const ox = other.x - car.x, oz = other.z - car.z, along = ox * fx + oz * fz;
        return along > -1 && along < maxDistance && Math.abs(ox * fz - oz * fx) < width;
      };
      let speed = car.cruiseSpeed;
      if (traffic.some((other) => other !== car && ahead(other, 10, 2.4))) speed = 0;
      if (hasPlayer && ahead(player, player.inCar ? 15 : 11, player.inCar ? 3.8 : 2.4)) speed = 0;
      if (people.some((actor) => actor.hp > 0 && ahead(actor, 9, 2.1))) speed = 0;
      car.speed += clamp(speed - car.speed, -16 * dt, 4 * dt);
      car.angle += normalizeAngle(heading(dx, dz) - car.angle) * Math.min(1, dt * 6);
      const travel = Math.min(length, Math.max(0, car.speed) * dt);
      const next = { x: car.x + fx * travel, z: car.z + fz * travel };
      if (clear(car, next, 1.45) && free(next.x, next.z, 1.45)) { car.x = next.x; car.z = next.z; }
      else car.speed = 0;
    }
    return events;
  }

  function getState() {
    return { wanted: wanted(), heat, hostilesRemaining: people.filter((actor) => actor.kind === 'hostile' && actor.hp > 0).length,
      civiliansSafe: people.filter((actor) => actor.kind === 'civilian' && actor.hp > 0 && actor.state !== 'flee').length,
      threatNear, dispatch, score, time };
  }

  reset();
  return { people, traffic, step, shoot, reportCrime, reset, getState, setPaused(value) { paused = Boolean(value); } };
}
