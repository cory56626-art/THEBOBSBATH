// Starter bodies. Coordinates are in world units with y running downward, so
// negative y is "above the ground line". Friction is grip: 1 is a rubber foot,
// 0.1 is a wet stone.

const M = (a, b, amp = 0.34) => ({ a, b, kind: 'muscle', amp });
const B = (a, b) => ({ a, b, kind: 'bone' });

export const PRESETS = [
  {
    id: 'tadpole', name: 'Tadpole', hint: 'Three nodes, three muscles. The simplest thing that can learn to move.',
    body: {
      nodes: [
        { x: -30, y: -16, r: 11, friction: 0.9, mass: 1 },
        { x: 30, y: -16, r: 11, friction: 0.9, mass: 1 },
        { x: 0, y: -70, r: 9, friction: 0.3, mass: 0.8 },
      ],
      links: [M(0, 1), M(1, 2), M(0, 2)],
    },
  },
  {
    id: 'worm', name: 'Worm', hint: 'Alternating grip, like a real worm. It has to invent peristalsis.',
    body: {
      // Segments alternate between gripping the floor and riding above it — a
      // perfectly flat chain with uniform grip is mathematically stuck.
      nodes: [0, 1, 2, 3, 4].map((i) => ({
        x: -80 + i * 40,
        y: i % 2 ? -30 : -12,
        r: 11,
        friction: i % 2 ? 0.25 : 0.95,
        mass: 1,
      })),
      links: [M(0, 1), M(1, 2), M(2, 3), M(3, 4), M(0, 2, 0.22), M(1, 3, 0.22), M(2, 4, 0.22)],
    },
  },
  {
    id: 'biped', name: 'Biped', hint: 'Two legs and a top-heavy torso. Falls over beautifully for a while.',
    body: {
      nodes: [
        { x: 0, y: -112, r: 12, friction: 0.4, mass: 1.6 }, // head
        { x: 0, y: -62, r: 11, friction: 0.4, mass: 1.4 },  // hips
        { x: -22, y: -34, r: 8, friction: 0.4, mass: 0.8 }, // L knee
        { x: -26, y: -10, r: 10, friction: 0.98, mass: 1 }, // L foot
        { x: 22, y: -34, r: 8, friction: 0.4, mass: 0.8 },  // R knee
        { x: 26, y: -10, r: 10, friction: 0.98, mass: 1 },  // R foot
      ],
      links: [B(0, 1), M(1, 2), M(2, 3), M(1, 4), M(4, 5), M(1, 3, 0.28), M(1, 5, 0.28), M(0, 2, 0.2), M(0, 4, 0.2)],
    },
  },
  {
    id: 'quadruped', name: 'Quadruped', hint: 'A spine and four feet. Gallop, trot or faceplant.',
    body: {
      nodes: [
        { x: -62, y: -58, r: 11, friction: 0.4, mass: 1.2 },
        { x: 0, y: -64, r: 12, friction: 0.4, mass: 1.5 },
        { x: 62, y: -58, r: 11, friction: 0.4, mass: 1.2 },
        { x: -72, y: -12, r: 10, friction: 0.96, mass: 0.9 },
        { x: -22, y: -12, r: 10, friction: 0.96, mass: 0.9 },
        { x: 26, y: -12, r: 10, friction: 0.96, mass: 0.9 },
        { x: 74, y: -12, r: 10, friction: 0.96, mass: 0.9 },
      ],
      links: [B(0, 1), B(1, 2), M(0, 3), M(0, 4), M(1, 4), M(1, 5), M(2, 5), M(2, 6), M(3, 4, 0.2), M(5, 6, 0.2)],
    },
  },
  {
    id: 'blob', name: 'Blob', hint: 'A ring of muscle with no obvious front. It will find one.',
    body: {
      nodes: Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a) * 44, y: -52 + Math.sin(a) * 44, r: 10, friction: 0.85, mass: 1 };
      }),
      links: [M(0, 1), M(1, 2), M(2, 3), M(3, 4), M(4, 5), M(5, 0), M(0, 3, 0.3), M(1, 4, 0.3), M(2, 5, 0.3)],
    },
  },
  {
    id: 'eel', name: 'Eel', hint: 'Slick and segmented. Useless on land, lethal in the Abyss.',
    body: {
      nodes: Array.from({ length: 7 }, (_, i) => ({
        x: -84 + i * 28,
        y: -40 + Math.sin(i * 0.9) * 11,
        r: 8, friction: 0.15, mass: 0.8,
      })),
      links: [
        M(0, 1), M(1, 2), M(2, 3), M(3, 4), M(4, 5), M(5, 6),
        M(0, 2, 0.25), M(1, 3, 0.25), M(2, 4, 0.25), M(3, 5, 0.25), M(4, 6, 0.25),
      ],
    },
  },
  {
    id: 'pogo', name: 'Pogo', hint: 'One heavy mass over one sticky foot. Built to launch.',
    body: {
      nodes: [
        { x: 0, y: -96, r: 14, friction: 0.3, mass: 2.4 },
        { x: 0, y: -14, r: 11, friction: 0.98, mass: 0.7 },
        { x: 34, y: -60, r: 8, friction: 0.5, mass: 0.6 },
      ],
      links: [M(0, 1, 0.5), M(0, 2), M(1, 2)],
    },
  },
  {
    id: 'crab', name: 'Crab', hint: 'Wide, low and stubborn. Very hard to knock over.',
    body: {
      nodes: [
        { x: 0, y: -58, r: 14, friction: 0.4, mass: 1.8 },
        { x: -54, y: -34, r: 8, friction: 0.5, mass: 0.7 },
        { x: -70, y: -10, r: 10, friction: 0.97, mass: 0.8 },
        { x: 54, y: -34, r: 8, friction: 0.5, mass: 0.7 },
        { x: 70, y: -10, r: 10, friction: 0.97, mass: 0.8 },
      ],
      links: [M(0, 1), M(1, 2), M(0, 3), M(3, 4), M(0, 2, 0.3), M(0, 4, 0.3), B(1, 3)],
    },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

/** "Surprise me": a random connected body that is always at least walkable. */
export function randomBody(rng = Math.random) {
  const n = 3 + Math.floor(rng() * 5);
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const rad = 20 + rng() * 60;
    nodes.push({
      x: Math.cos(a) * rad,
      y: -46 + Math.sin(a) * rad * 0.9,
      r: 7 + rng() * 7,
      friction: rng() < 0.4 ? 0.9 + rng() * 0.1 : 0.15 + rng() * 0.6,
      mass: 0.6 + rng() * 1.4,
    });
  }
  // Sit the whole thing on the ground line.
  const low = Math.max(...nodes.map((p) => p.y + p.r));
  for (const p of nodes) p.y -= low - 2;

  const links = [];
  const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);
  const seen = new Set();
  const add = (a, b) => {
    if (a === b || seen.has(key(a, b))) return;
    seen.add(key(a, b));
    links.push({ a: Math.min(a, b), b: Math.max(a, b), kind: rng() < 0.82 ? 'muscle' : 'bone', amp: 0.18 + rng() * 0.3 });
  };
  for (let i = 1; i < n; i++) add(i, Math.floor(rng() * i)); // spanning tree keeps it in one piece
  const extra = Math.floor(rng() * n);
  for (let i = 0; i < extra; i++) add(Math.floor(rng() * n), Math.floor(rng() * n));
  return { nodes, links };
}
