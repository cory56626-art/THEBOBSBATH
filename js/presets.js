// Starter bodies. Coordinates are in world units with y running downward, so
// negative y is "above the ground line". Friction is grip: 1 is a rubber foot,
// 0.1 is a wet stone.

const M = (a, b, amp = 0.34) => ({ a, b, kind: 'muscle', amp });
const B = (a, b) => ({ a, b, kind: 'bone' });

export const PRESETS = [
  {
    id: 'tadpole', name: 'Tadpole', group: 'Shapes', best: 'Salt Flats',
    hint: 'Three nodes, three muscles. The simplest thing that can learn to move.',
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
    id: 'worm', name: 'Worm', group: 'Shapes', best: 'Salt Flats',
    hint: 'Alternating grip, like a real worm. It has to invent peristalsis.',
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
    id: 'blob', name: 'Blob', group: 'Shapes', best: 'Salt Flats',
    hint: 'A ring of muscle with no obvious front. It will find one.',
    body: {
      nodes: Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a) * 44, y: -52 + Math.sin(a) * 44, r: 10, friction: 0.85, mass: 1 };
      }),
      links: [M(0, 1), M(1, 2), M(2, 3), M(3, 4), M(4, 5), M(5, 0), M(0, 3, 0.3), M(1, 4, 0.3), M(2, 5, 0.3)],
    },
  },
  {
    id: 'pogo', name: 'Pogo', group: 'Shapes', best: 'High Vault',
    hint: 'One heavy mass over one sticky foot. Built to launch.',
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
    id: 'crab', name: 'Crab', group: 'Shapes', best: 'Standing Gale',
    hint: 'Wide, low and stubborn. Very hard to knock over.',
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
  {
    id: 'biped', name: 'Biped', group: 'Shapes', best: 'Salt Flats',
    hint: 'Two legs and a top-heavy torso. Falls over beautifully for a while.',
    body: {
      nodes: [
        { x: 0, y: -112, r: 12, friction: 0.4, mass: 1.6 },
        { x: 0, y: -62, r: 11, friction: 0.4, mass: 1.4 },
        { x: -22, y: -34, r: 8, friction: 0.4, mass: 0.8 },
        { x: -26, y: -10, r: 10, friction: 0.98, mass: 1 },
        { x: 22, y: -34, r: 8, friction: 0.4, mass: 0.8 },
        { x: 26, y: -10, r: 10, friction: 0.98, mass: 1 },
      ],
      links: [B(0, 1), M(1, 2), M(2, 3), M(1, 4), M(4, 5), M(1, 3, 0.28), M(1, 5, 0.28), M(0, 2, 0.2), M(0, 4, 0.2)],
    },
  },
  {
    id: 'quadruped', name: 'Quadruped', group: 'Shapes', best: 'Rolling Dunes',
    hint: 'A spine and four feet. Gallop, trot or faceplant.',
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
    id: 'eel', name: 'Eel', group: 'Shapes', best: 'The Abyss',
    hint: 'Slick and segmented. Useless on land, lethal in the Abyss.',
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

  // ── Animals ──────────────────────────────────────────────────────────
  // Side-on anatomy, facing right. Grip stands in for skin: paws and feet are
  // sticky, backs and heads are not.
  {
    id: 'kangaroo', name: 'Kangaroo', group: 'Animals', best: 'High Vault',
    hint: 'One enormous hind leg, a long foot and a counterweight tail. Everything about it wants to hop.',
    body: {
      nodes: [
        { x: 56, y: -108, r: 9, friction: 0.3, mass: 0.9 },   // 0 head
        { x: 34, y: -80, r: 11, friction: 0.4, mass: 1.5 },   // 1 chest
        { x: 2, y: -58, r: 12, friction: 0.4, mass: 1.8 },    // 2 hip
        { x: -16, y: -32, r: 8, friction: 0.4, mass: 1.0 },   // 3 knee
        { x: -8, y: -11, r: 9, friction: 0.98, mass: 0.9 },   // 4 heel
        { x: 34, y: -9, r: 10, friction: 0.98, mass: 1.0 },   // 5 long toe
        { x: -36, y: -46, r: 9, friction: 0.6, mass: 1.2 },   // 6 tail base
        { x: -74, y: -26, r: 8, friction: 0.7, mass: 0.9 },   // 7 tail tip
        { x: 48, y: -62, r: 6, friction: 0.4, mass: 0.4 },    // 8 forepaw
      ],
      links: [
        B(0, 1), B(1, 2), M(2, 3, 0.42), M(3, 4, 0.38), B(4, 5), M(3, 5, 0.34),
        M(2, 4, 0.42), M(2, 6, 0.3), M(6, 7, 0.3), B(1, 8), M(1, 3, 0.24),
      ],
    },
  },
  {
    id: 'cheetah', name: 'Cheetah', group: 'Animals', best: 'Salt Flats',
    hint: 'A spine built as muscle rather than bone. The whole back flexes into the stride.',
    body: {
      nodes: [
        { x: 86, y: -46, r: 8, friction: 0.3, mass: 0.7 },    // 0 head
        { x: 62, y: -54, r: 9, friction: 0.4, mass: 0.9 },    // 1 neck
        { x: 38, y: -58, r: 10, friction: 0.4, mass: 1.2 },   // 2 shoulder
        { x: 4, y: -62, r: 10, friction: 0.4, mass: 1.2 },    // 3 mid spine
        { x: -30, y: -58, r: 10, friction: 0.4, mass: 1.3 },  // 4 hip
        { x: -72, y: -44, r: 7, friction: 0.5, mass: 0.6 },   // 5 tail
        { x: 40, y: -32, r: 7, friction: 0.4, mass: 0.7 },    // 6 fore knee
        { x: 46, y: -9, r: 8, friction: 0.95, mass: 0.7 },    // 7 fore paw
        { x: -32, y: -32, r: 7, friction: 0.4, mass: 0.7 },   // 8 hind knee
        { x: -38, y: -9, r: 8, friction: 0.95, mass: 0.7 },   // 9 hind paw
      ],
      links: [
        B(0, 1), B(1, 2), M(2, 3, 0.3), M(3, 4, 0.3), M(2, 4, 0.14), M(4, 5, 0.3),
        M(2, 6, 0.34), M(6, 7, 0.34), M(4, 8, 0.36), M(8, 9, 0.36),
        M(2, 7, 0.26), M(4, 9, 0.26),
      ],
    },
  },
  {
    id: 'human', name: 'Human', group: 'Animals', best: 'Standing Gale',
    hint: 'Tall, narrow and permanently falling forward. Two legs is a hard way to live.',
    body: {
      nodes: [
        { x: 2, y: -152, r: 10, friction: 0.3, mass: 1.1 },   // 0 head
        { x: 0, y: -116, r: 11, friction: 0.4, mass: 1.6 },   // 1 chest
        { x: 0, y: -84, r: 10, friction: 0.4, mass: 1.4 },    // 2 pelvis
        { x: -10, y: -46, r: 7, friction: 0.4, mass: 0.8 },   // 3 left knee
        { x: -16, y: -9, r: 9, friction: 0.98, mass: 0.8 },   // 4 left foot
        { x: 12, y: -46, r: 7, friction: 0.4, mass: 0.8 },    // 5 right knee
        { x: 18, y: -9, r: 9, friction: 0.98, mass: 0.8 },    // 6 right foot
        { x: -26, y: -92, r: 6, friction: 0.4, mass: 0.5 },   // 7 left hand
        { x: 28, y: -92, r: 6, friction: 0.4, mass: 0.5 },    // 8 right hand
      ],
      links: [
        B(0, 1), B(1, 2), M(2, 3, 0.36), M(3, 4, 0.34), M(2, 5, 0.36), M(5, 6, 0.34),
        M(2, 4, 0.3), M(2, 6, 0.3), M(1, 7, 0.34), M(1, 8, 0.34), M(0, 3, 0.16), M(0, 5, 0.16),
      ],
    },
  },
  {
    id: 'chimp', name: 'Chimp', group: 'Animals', best: 'The Canopy',
    hint: 'Arms longer than its legs, knuckles on the floor. Reaches for things above it.',
    body: {
      nodes: [
        { x: 36, y: -96, r: 9, friction: 0.3, mass: 1.0 },    // 0 head
        { x: 14, y: -78, r: 12, friction: 0.4, mass: 1.7 },   // 1 chest
        { x: -16, y: -64, r: 10, friction: 0.4, mass: 1.3 },  // 2 pelvis
        { x: 34, y: -48, r: 7, friction: 0.4, mass: 0.8 },    // 3 fore elbow
        { x: 44, y: -11, r: 9, friction: 0.97, mass: 0.9 },   // 4 fore knuckle
        { x: 6, y: -46, r: 7, friction: 0.4, mass: 0.7 },     // 5 near elbow
        { x: 10, y: -11, r: 9, friction: 0.97, mass: 0.8 },   // 6 near knuckle
        { x: -20, y: -36, r: 7, friction: 0.4, mass: 0.8 },   // 7 knee
        { x: -30, y: -10, r: 9, friction: 0.95, mass: 0.8 },  // 8 foot
      ],
      links: [
        B(0, 1), B(1, 2), M(1, 3, 0.38), M(3, 4, 0.38), M(1, 5, 0.38), M(5, 6, 0.38),
        M(2, 7, 0.34), M(7, 8, 0.34), M(1, 4, 0.3), M(2, 6, 0.24), M(2, 8, 0.3),
      ],
    },
  },
  {
    id: 'monkey', name: 'Monkey', group: 'Animals', best: 'The Canopy',
    hint: 'Light bones and a tail half its own length. Cheap to lift, easy to throw about.',
    body: {
      nodes: [
        { x: 30, y: -72, r: 7, friction: 0.3, mass: 0.6 },    // 0 head
        { x: 8, y: -58, r: 9, friction: 0.4, mass: 1.0 },     // 1 body
        { x: -16, y: -50, r: 8, friction: 0.4, mass: 0.8 },   // 2 hip
        { x: -46, y: -44, r: 5, friction: 0.4, mass: 0.35 },  // 3 tail mid
        { x: -76, y: -30, r: 5, friction: 0.4, mass: 0.3 },   // 4 tail tip
        { x: 24, y: -32, r: 5, friction: 0.4, mass: 0.4 },    // 5 elbow
        { x: 28, y: -9, r: 7, friction: 0.96, mass: 0.5 },    // 6 hand
        { x: -20, y: -30, r: 5, friction: 0.4, mass: 0.4 },   // 7 knee
        { x: -26, y: -9, r: 7, friction: 0.96, mass: 0.5 },   // 8 foot
      ],
      links: [
        B(0, 1), B(1, 2), M(1, 5, 0.4), M(5, 6, 0.4), M(2, 7, 0.4), M(7, 8, 0.4),
        M(2, 3, 0.34), M(3, 4, 0.34), M(1, 6, 0.3), M(2, 8, 0.3),
      ],
    },
  },
  {
    id: 'gorilla', name: 'Gorilla', group: 'Animals', best: 'Boulder Field',
    hint: 'Enormous chest, short legs, arms like pistons. Slow to start and very hard to stop.',
    body: {
      nodes: [
        { x: 34, y: -104, r: 11, friction: 0.3, mass: 1.3 },  // 0 head
        { x: 10, y: -84, r: 15, friction: 0.4, mass: 2.6 },   // 1 chest
        { x: -24, y: -68, r: 13, friction: 0.4, mass: 2.0 },  // 2 pelvis
        { x: 40, y: -50, r: 9, friction: 0.4, mass: 1.2 },    // 3 fore elbow
        { x: 48, y: -12, r: 11, friction: 0.98, mass: 1.2 },  // 4 fore knuckle
        { x: 10, y: -48, r: 9, friction: 0.4, mass: 1.1 },    // 5 near elbow
        { x: 14, y: -12, r: 11, friction: 0.98, mass: 1.1 },  // 6 near knuckle
        { x: -30, y: -38, r: 9, friction: 0.4, mass: 1.2 },   // 7 knee
        { x: -42, y: -11, r: 11, friction: 0.96, mass: 1.1 }, // 8 foot
      ],
      links: [
        B(0, 1), B(1, 2), M(1, 3, 0.32), M(3, 4, 0.32), M(1, 5, 0.32), M(5, 6, 0.32),
        M(2, 7, 0.36), M(7, 8, 0.36), M(1, 4, 0.26), M(2, 8, 0.3), M(2, 6, 0.22),
      ],
    },
  },
  {
    id: 'shark', name: 'Shark', group: 'Animals', best: 'The Abyss',
    hint: 'No legs, no grip, one forked tail. Helpless on land and unbeatable in water.',
    body: {
      nodes: [
        { x: 92, y: -44, r: 7, friction: 0.1, mass: 0.7 },    // 0 snout
        { x: 66, y: -42, r: 11, friction: 0.1, mass: 1.2 },   // 1 head
        { x: 34, y: -42, r: 12, friction: 0.1, mass: 1.3 },   // 2 body
        { x: 2, y: -42, r: 10, friction: 0.1, mass: 1.0 },    // 3 body
        { x: -28, y: -42, r: 8, friction: 0.1, mass: 0.8 },   // 4 body
        { x: -54, y: -42, r: 6, friction: 0.1, mass: 0.5 },   // 5 peduncle
        { x: -76, y: -60, r: 6, friction: 0.1, mass: 0.45 },  // 6 upper fluke
        { x: -76, y: -24, r: 6, friction: 0.1, mass: 0.45 },  // 7 lower fluke
        { x: 30, y: -66, r: 5, friction: 0.1, mass: 0.3 },    // 8 dorsal fin
      ],
      links: [
        B(0, 1), M(1, 2, 0.2), M(2, 3, 0.26), M(3, 4, 0.3), M(4, 5, 0.34),
        M(5, 6, 0.32), M(5, 7, 0.32), B(6, 7), B(2, 8),
        // Skip-links are the muscles that actually bend a body. Without them a
        // chain can only stretch along its own line, and a fish that cannot
        // curve cannot swim.
        M(1, 3, 0.24), M(2, 4, 0.28), M(3, 5, 0.32), M(4, 6, 0.3), M(4, 7, 0.3),
      ],
    },
  },
];

export const GROUPS = ['Shapes', 'Animals'];

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
