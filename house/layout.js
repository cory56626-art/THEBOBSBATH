/** The house is centered at the origin; one world unit is roughly a metre. */
export const HOUSE = Object.freeze({ width: 50, depth: 42 });

export const ROOMS = [];
export const WALLS = [];
export const FURNITURE = [];
export const HIDING_SPOTS = [];

const roomNames = [
  'Blue bedroom', 'Study', 'Laundry', 'Guest bedroom',
  'Dining room', 'Kitchen', 'Library', 'Music room',
  'Storage', 'Playroom', 'Lounge', 'Bathroom',
  'Main bedroom', 'Nursery', 'Workshop', 'Back bedroom',
];
const colors = [0x37384a, 0x474039, 0x35423e, 0x44363c, 0x4a4036, 0x394748, 0x393947, 0x443c45];
const wingColumns = [[-24.85, -13.5], [-13.5, -2.5], [2.5, 13.5], [13.5, 24.85]];
const rows = [[-20.85, -11.5], [-11.5, -2.5], [2.5, 11.5], [11.5, 20.85]];

// Rectangles are centres and dimensions, including wall thickness.
function wall(x, z, w, d) { WALLS.push({ x, z, w, d }); }
function splitVertical(x, low, high, doors) {
  let start = low;
  for (const centre of [...doors].sort((a, b) => a - b)) {
    const before = centre - 1.2;
    if (before > start) wall(x, (start + before) / 2, 0.3, before - start);
    start = centre + 1.2;
  }
  if (start < high) wall(x, (start + high) / 2, 0.3, high - start);
}
function splitHorizontal(z, low, high, doors) {
  let start = low;
  for (const centre of [...doors].sort((a, b) => a - b)) {
    const before = centre - 1.2;
    if (before > start) wall((start + before) / 2, z, before - start, 0.3);
    start = centre + 1.2;
  }
  if (start < high) wall((start + high) / 2, z, high - start, 0.3);
}

wall(-25, 0, 0.3, 42);
wall(25, 0, 0.3, 42);
wall(0, -21, 50, 0.3);
// The visual exit door fills the gap; it stays closed until all three objects are found.
splitHorizontal(21, -25, 25, [0]);

for (const x of [-2.5, 2.5]) {
  splitVertical(x, -20.85, -2.5, [-16.2, -7]);
  splitVertical(x, 2.5, 20.85, [7, 16.2]);
}
for (const x of [-13.5, 13.5]) {
  splitVertical(x, -20.85, -2.5, [-16.2, -7]);
  splitVertical(x, 2.5, 20.85, [7, 16.2]);
}
for (const z of [-11.5, 11.5]) {
  splitHorizontal(z, -24.85, -2.5, [-19.2, -8]);
  splitHorizontal(z, 2.5, 24.85, [8, 19.2]);
}
for (const z of [-2.5, 2.5]) {
  splitHorizontal(z, -24.85, -2.5, [-19.2, -8]);
  splitHorizontal(z, 2.5, 24.85, [8, 19.2]);
}

let index = 0;
for (let row = 0; row < rows.length; row++) {
  for (let col = 0; col < wingColumns.length; col++) {
    const [left, right] = wingColumns[col];
    const [top, bottom] = rows[row];
    const id = `room-${index}`;
    const room = { id, name: roomNames[index], x: (left + right) / 2, z: (top + bottom) / 2,
      w: right - left - 0.3, d: bottom - top - 0.3, tint: colors[index % colors.length] };
    ROOMS.push(room);

    const bedX = left + 2.15;
    const bedZ = top + 2.5;
    const closetX = right - 2.1;
    const closetZ = bottom - 0.8;
    FURNITURE.push({ id: `bed-${index}`, type: 'bed', x: bedX, z: bedZ, w: 2.25, d: 3.25, roomId: id });
    HIDING_SPOTS.push({ id: `bed-${index}`, type: 'bed', x: bedX + 1.65, z: bedZ + 0.4, roomId: id });
    FURNITURE.push({ id: `closet-${index}`, type: 'closet', x: closetX, z: closetZ, w: 2.7, d: 0.95, roomId: id });
    HIDING_SPOTS.push({ id: `closet-${index}`, type: 'closet', x: closetX, z: closetZ - 1.1, roomId: id });

    const extraType = ['table', 'shelf', 'sink', 'sofa'][index % 4];
    FURNITURE.push({ id: `extra-${index}`, type: extraType,
      x: right - 1.25, z: top + 2.4, w: extraType === 'sofa' ? 1.3 : 1.1,
      d: extraType === 'sofa' ? 2.8 : 1.6, roomId: id });
    index++;
  }
}
ROOMS.push({ id: 'hall-north', name: 'North hall', x: 0, z: -11.7, w: 4.7, d: 18.3, tint: 0x333238 });
ROOMS.push({ id: 'hall-south', name: 'Exit hall', x: 0, z: 11.7, w: 4.7, d: 18.3, tint: 0x333238 });
ROOMS.push({ id: 'hall-cross', name: 'Cross hall', x: 0, z: 0, w: 49.7, d: 4.7, tint: 0x373336 });

export const ITEMS = Object.freeze([
  { id: 'key', label: 'Brass key', x: -18.5, z: -15.1 },
  { id: 'fuse', label: 'Power fuse', x: 8, z: -6 },
  { id: 'cutters', label: 'Bolt cutters', x: 19, z: 15.4 },
]);
export const EXIT = Object.freeze({ x: 0, z: 19.6 });
export const SURVIVOR_SPAWN = Object.freeze({ x: -19, z: 16 });
export const MONSTER_SPAWN = Object.freeze({ x: 0, z: -12 });

export const ACTOR_RADIUS = 0.3;
const SOLIDS = [...WALLS, ...FURNITURE];
const SIGHT_BLOCKERS = [...WALLS, ...FURNITURE.filter(f => f.type === 'closet' || f.type === 'shelf')];

export function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

/** Slab intersection, also used to guarantee movement never cuts a wall corner. */
export function segmentIntersectsBox(ax, az, bx, bz, box, padding = 0) {
  const minX = box.x - box.w / 2 - padding, maxX = box.x + box.w / 2 + padding;
  const minZ = box.z - box.d / 2 - padding, maxZ = box.z + box.d / 2 + padding;
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  for (const [origin, delta, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-10) {
      if (origin < min || origin > max) return false;
    } else {
      let near = (min - origin) / delta, far = (max - origin) / delta;
      if (near > far) [near, far] = [far, near];
      tmin = Math.max(tmin, near);
      tmax = Math.min(tmax, far);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function isWalkable(x, z, radius = ACTOR_RADIUS) {
  if (Math.abs(x) > 24.85 - radius || Math.abs(z) > 20.85 - radius) return false;
  return !SOLIDS.some(b => Math.abs(x - b.x) <= b.w / 2 + radius && Math.abs(z - b.z) <= b.d / 2 + radius);
}

export function canWalkSegment(a, b, radius = ACTOR_RADIUS) {
  return isWalkable(a.x, a.z, radius) && isWalkable(b.x, b.z, radius) &&
    !SOLIDS.some(box => segmentIntersectsBox(a.x, a.z, b.x, b.z, box, radius));
}

export function lineOfSight(a, b) {
  return !SIGHT_BLOCKERS.some(box => segmentIntersectsBox(a.x, a.z, b.x, b.z, box));
}

// A fixed navigation graph is shared by all simulations and does not use random state.
const STEP = 0.7;
const NX = 71, NZ = 59;
const nodes = Array.from({ length: NX * NZ }, (_, id) => {
  const ix = id % NX, iz = Math.floor(id / NX);
  const x = -24.5 + ix * STEP, z = -20.3 + iz * STEP;
  return { id, ix, iz, x, z, open: isWalkable(x, z), edges: [] };
});
for (const node of nodes) {
  if (!node.open) continue;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const ix = node.ix + dx, iz = node.iz + dz;
    if (ix < 0 || ix >= NX || iz < 0 || iz >= NZ) continue;
    const next = nodes[iz * NX + ix];
    if (next.open && canWalkSegment(node, next)) node.edges.push({ id: next.id, cost: Math.hypot(dx, dz) * STEP });
  }
}

function nearestNode(point) {
  let best = null, bestD = Infinity;
  const cx = Math.round((point.x + 24.5) / STEP), cz = Math.round((point.z + 20.3) / STEP);
  for (let r = 0; r <= 5; r++) {
    for (let iz = Math.max(0, cz - r); iz <= Math.min(NZ - 1, cz + r); iz++) {
      for (let ix = Math.max(0, cx - r); ix <= Math.min(NX - 1, cx + r); ix++) {
        const node = nodes[iz * NX + ix];
        if (!node.open) continue;
        const d = distance(node, point);
        if (d < bestD && canWalkSegment(point, node)) { bestD = d; best = node; }
      }
    }
    if (best && bestD <= r * STEP) return best;
  }
  return best;
}

export function nearestWalkable(x, z) {
  if (isWalkable(x, z)) return { x, z };
  let best = null, d = Infinity;
  for (const n of nodes) {
    if (!n.open) continue;
    const nextD = Math.hypot(n.x - x, n.z - z);
    if (nextD < d) { d = nextD; best = n; }
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 };
}

class MinHeap {
  constructor() { this.entries = []; }
  push(entry) {
    const a = this.entries; a.push(entry);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= entry.priority) break;
      a[i] = a[parent]; i = parent;
    }
    a[i] = entry;
  }
  pop() {
    const a = this.entries, first = a[0], tail = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1].priority < a[child].priority) child++;
        if (a[child].priority >= tail.priority) break;
        a[i] = a[child]; i = child;
      }
      a[i] = tail;
    }
    return first;
  }
  get length() { return this.entries.length; }
}

/** Returns collision-safe waypoints, or an empty array for an invalid destination. */
export function findPath(start, goal) {
  if (!isWalkable(start.x, start.z) || !isWalkable(goal.x, goal.z)) return [];
  if (canWalkSegment(start, goal)) return [{ x: goal.x, z: goal.z }];
  const a = nearestNode(start), b = nearestNode(goal);
  if (!a || !b) return [];
  const costs = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const closed = new Uint8Array(nodes.length);
  const heap = new MinHeap();
  costs[a.id] = 0;
  heap.push({ id: a.id, priority: distance(a, b) });
  while (heap.length) {
    const current = heap.pop().id;
    if (closed[current]) continue;
    if (current === b.id) break;
    closed[current] = 1;
    for (const edge of nodes[current].edges) {
      const cost = costs[current] + edge.cost;
      if (cost >= costs[edge.id]) continue;
      costs[edge.id] = cost;
      previous[edge.id] = current;
      heap.push({ id: edge.id, priority: cost + distance(nodes[edge.id], b) });
    }
  }
  if (!Number.isFinite(costs[b.id])) return [];
  const path = [{ x: goal.x, z: goal.z }];
  let cursor = b.id;
  while (cursor !== -1) {
    path.push({ x: nodes[cursor].x, z: nodes[cursor].z });
    if (cursor === a.id) break;
    cursor = previous[cursor];
  }
  path.reverse();
  const simplified = [];
  let anchor = start, i = 0;
  while (i < path.length) {
    let furthest = i;
    for (let j = i + 1; j < path.length && j < i + 20; j++) {
      if (canWalkSegment(anchor, path[j])) furthest = j;
    }
    simplified.push(path[furthest]);
    anchor = path[furthest];
    i = furthest + 1;
  }
  return simplified;
}

export function pathLength(start, path) {
  let result = 0, previous = start;
  for (const p of path) { result += distance(previous, p); previous = p; }
  return result;
}
