// Trials are the selection pressure. Each one is a world plus a definition of
// what "doing well" means in it — change the trial and the same body evolves a
// completely different gait.
//
// Scoring rules, applied consistently everywhere:
//   • Travel is measured from the position a creature HOLDS over the last 15%
//     of its life, never the instant it stopped. A dive across the line does
//     not beat a gait that carried the body there and kept it there.
//   • Posture is measured against the creature's own standing height, so a
//     tall body cannot win a balance trial just by being tall.
//   • Every score is in metres (100 world units) unless marked otherwise, so
//     the number on screen means something physical.

import { Block } from './physics.js';

const held = (s) => (s.hold.x - s.start.x) / 100;      // metres carried forward
const climbed = (s) => (s.start.y - s.hold.y) / 100;   // metres of altitude kept

/**
 * Branches up a great tree. The climb starts as a gentle ramp and steepens the
 * higher it goes, so there is always a next rung within reach of whatever a
 * population can currently do, and the canopy stays out of reach for a while.
 */
function canopyBlocks() {
  const blocks = [new Block(-260, -1400, -180, 4, { friction: 0.98, style: 'trunk' })];
  let x = 10, y = 0;
  for (let k = 0; k < 62; k++) {
    // Branches butt together into a continuous stair with risers barely taller
    // than a foot. Spaced-out rungs look more like a tree, but a 24-unit gap
    // over a 24-unit step is unreachable — out of 750 random nervous systems
    // standing on a branch, not one ever reached the next. At curb height,
    // every bit of forward scrambling turns straight into altitude, which is
    // the gradient evolution actually needs to follow.
    y -= 10;
    blocks.push(new Block(x, y, x + 55, y + 240, { friction: 0.99, style: 'branch' }));
    x += 55;
  }
  return blocks;
}

/** Deterministic scatter of boulders — same field for every creature. */
function boulderBlocks() {
  const blocks = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 60; k++) {
    const x = 150 + k * 155 + rnd() * 70;
    const w = 34 + rnd() * 62;
    const h = 20 + rnd() * 52;
    blocks.push(new Block(x, -h, x + w, 6, { friction: 0.92, style: 'rock' }));
  }
  return blocks;
}

export const TRIALS = {
  plains: {
    id: 'plains',
    name: 'Salt Flats',
    glyph: '⟶',
    blurb: 'Flat, endless, boring. Run right. The purest test of a gait.',
    goal: 'Distance carried right',
    unit: 'm',
    gravity: 0.42,
    duration: 900,
    terrain: () => 0,
    sky: ['#101c26', '#1d3a44'],
    ground: ['#2b3a2f', '#1a2620'],
    score: held,
  },

  dunes: {
    id: 'dunes',
    name: 'Rolling Dunes',
    glyph: '∿',
    blurb: 'Same race, but the floor keeps moving. Punishes one-trick gaits.',
    goal: 'Distance carried right',
    unit: 'm',
    gravity: 0.42,
    duration: 900,
    terrain: (x) => Math.sin(x / 190) * 34 + Math.sin(x / 71 + 1.7) * 11,
    sky: ['#1a1522', '#4a3350'],
    ground: ['#4a3a2a', '#2a2018'],
    score: held,
  },

  boulders: {
    id: 'boulders',
    name: 'Boulder Field',
    glyph: '⬡',
    blurb: 'Flat ground buried under rubble. You cannot run through it, only over.',
    goal: 'Distance carried right',
    unit: 'm',
    gravity: 0.42,
    duration: 1000,
    terrain: () => 0,
    blocks: boulderBlocks(),
    sky: ['#181a1e', '#3b4048'],
    ground: ['#3a3a34', '#22221e'],
    score: held,
  },

  chasm: {
    id: 'chasm',
    name: 'The Chasm',
    glyph: '⩗',
    blurb: 'Ground, then nothing, then ground again. Crawlers stall at the first edge.',
    goal: 'Distance carried right',
    unit: 'm',
    gravity: 0.42,
    duration: 1000,
    // Solid ground with a 190-unit hole every 640 units.
    terrain: (x) => {
      if (x < 260) return 0;
      return ((x - 260) % 640) < 190 ? 620 : 0;
    },
    sky: ['#120f1c', '#332a4c'],
    ground: ['#2f2b3c', '#1a1824'],
    score: held,
  },

  ascent: {
    id: 'ascent',
    name: 'The Ascent',
    glyph: '◺',
    blurb: 'A slope that never stops. Gravity is the enemy; grip is everything.',
    goal: 'Altitude held',
    unit: 'm',
    gravity: 0.42,
    duration: 1000,
    terrain: (x) => (x > 0 ? -x * 0.34 - Math.sin(x / 40) * 4 : 0),
    sky: ['#0f1a20', '#2b4650'],
    ground: ['#3b3f4a', '#20232b'],
    score: climbed,
  },

  canopy: {
    id: 'canopy',
    name: 'The Canopy',
    glyph: '🌲',
    blurb: 'A great tree. Branch to branch, all the way up. The hardest trial here — give it a long turbo run.',
    goal: 'Altitude held',
    unit: 'm',
    gravity: 0.42,
    duration: 1600,
    terrain: () => 0,
    blocks: canopyBlocks(),
    spawnX: -55,
    sky: ['#0a1a14', '#1d4032'],
    ground: ['#2c3a24', '#18220f'],
    // Mostly the altitude held at the end, with partial credit for the highest
    // rung reached. The peak term is what gives evolution a gradient to follow
    // before anyone can reliably hang on up there.
    // Altitude held at the end, plus how long the creature managed to stay up
    // there. Distance credit gets spent sprinting along the ground underneath
    // the tree and peak-height credit gets spent hopping on the spot — both
    // beat climbing, so neither is offered. Time-spent-high cannot be faked.
    score: (s) => climbed(s) * 0.6 + (s.lift / 100) * 0.4,
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
    // A leap is instantaneous by nature, so this is the one trial that scores a
    // peak rather than something held.
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
    score: held,
  },

  gale: {
    id: 'gale',
    name: 'Standing Gale',
    glyph: '⇶',
    blurb: 'Stay tall while the wind shoves you around. Balance, and nothing else.',
    goal: 'Average height held',
    unit: 'pts',
    gravity: 0.42,
    duration: 900,
    terrain: () => 0,
    wind: (t) => Math.sin(t / 130) * 0.05 + Math.sin(t / 37) * 0.022 - 0.012,
    sky: ['#1b1a12', '#4a4426'],
    ground: ['#3d3826', '#221f16'],
    // Posture is a ratio of the creature's own standing height: 10 points means
    // it held its full original stance for the whole trial. Ground lost to the
    // wind costs a little, but it can never be farmed for points — this trial
    // used to be quietly won by whoever sprinted the furthest.
    // Simply how high the centre of mass was held, on average, in tenths of a
    // metre. Scoring it as a ratio of the creature's own height sounds fairer
    // but is not: a squat body triples its resting height just by tipping onto
    // one corner, and every run pinned itself to the cap. A population is
    // always one species, so absolute height compares exactly what it should.
    score: (s) => s.standSum / Math.max(1, s.steps) / 10 - Math.max(0, s.start.x - s.hold.x) / 300,
  },
};

export const TRIAL_LIST = Object.values(TRIALS);
export const trialOf = (id) => TRIALS[id] || TRIALS.plains;
