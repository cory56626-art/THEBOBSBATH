// Trials are the selection pressure. Each one is a world plus a definition of
// what "doing well" means in it — change the trial and the same body evolves a
// completely different gait.

export const TRIALS = {
  plains: {
    id: 'plains',
    name: 'Salt Flats',
    glyph: '⟶',
    blurb: 'Flat, endless, boring. Run right. The purest test of a gait.',
    goal: 'Distance travelled right',
    unit: 'm',
    gravity: 0.42,
    duration: 900,
    terrain: () => 0,
    sky: ['#101c26', '#1d3a44'],
    ground: ['#2b3a2f', '#1a2620'],
    score: (s) => (s.com.x - s.start.x) / 100,
  },

  dunes: {
    id: 'dunes',
    name: 'Rolling Dunes',
    glyph: '∿',
    blurb: 'Same race, but the floor keeps moving. Punishes one-trick gaits.',
    goal: 'Distance travelled right',
    unit: 'm',
    gravity: 0.42,
    duration: 900,
    terrain: (x) => Math.sin(x / 190) * 34 + Math.sin(x / 71 + 1.7) * 11,
    sky: ['#1a1522', '#4a3350'],
    ground: ['#4a3a2a', '#2a2018'],
    score: (s) => (s.com.x - s.start.x) / 100,
  },

  ascent: {
    id: 'ascent',
    name: 'The Ascent',
    glyph: '◺',
    blurb: 'A slope that never stops. Gravity is the enemy; grip is everything.',
    goal: 'Altitude gained',
    unit: 'm',
    gravity: 0.42,
    duration: 1000,
    terrain: (x) => (x > 0 ? -x * 0.34 : 0) - (x > 0 ? Math.sin(x / 40) * 4 : 0),
    sky: ['#0f1a20', '#2b4650'],
    ground: ['#3b3f4a', '#20232b'],
    score: (s) => (s.start.y - s.com.y) / 100,
  },

  vault: {
    id: 'vault',
    name: 'High Vault',
    glyph: '↑',
    blurb: 'One question: how far off the ground can you throw yourself?',
    goal: 'Peak height of centre of mass',
    unit: 'm',
    gravity: 0.5,
    duration: 700,
    terrain: () => 0,
    sky: ['#141024', '#3a2a58'],
    ground: ['#33304a', '#1c1a2a'],
    score: (s) => s.peak / 100,
  },

  abyss: {
    id: 'abyss',
    name: 'The Abyss',
    glyph: '≈',
    blurb: 'Buoyant, viscous, no floor worth touching. Legs are useless. Swim.',
    goal: 'Distance swum right',
    unit: 'm',
    gravity: 0.30,
    duration: 1000,
    terrain: () => 520,
    spawnY: 140,
    water: { level: -80, drag: 0.985, buoyancy: 0.302, normal: 0.0016 },
    damping: 0.999,
    sky: ['#04141c', '#0a3040'],
    ground: ['#062430', '#03141c'],
    score: (s) => (s.com.x - s.start.x) / 100,
  },

  gale: {
    id: 'gale',
    name: 'Standing Gale',
    glyph: '⇶',
    blurb: 'Stay tall while the wind shoves you around. Balance, not speed.',
    goal: 'Average height held, upwind',
    unit: 'pts',
    gravity: 0.42,
    duration: 900,
    terrain: () => 0,
    wind: (t, rng) => Math.sin(t / 130) * 0.05 + Math.sin(t / 37) * 0.022 - 0.012,
    sky: ['#1b1a12', '#4a4426'],
    ground: ['#3d3826', '#221f16'],
    // Height held, minus how far the gale pushed you back.
    score: (s) => s.heightSum / Math.max(1, s.steps) / 100 * 3 + (s.com.x - s.start.x) / 400,
  },
};

export const TRIAL_LIST = Object.values(TRIALS);
export const trialOf = (id) => TRIALS[id] || TRIALS.plains;
