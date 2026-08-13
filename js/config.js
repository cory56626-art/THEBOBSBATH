// Central tunables. Anything a viewer can change from the setup screen lives in
// SETTINGS; structural constants live up top.

// Logical canvas resolution — 9:16, the aspect ratio TikTok / Reels / Shorts use.
// The canvas backing store really is this size, so recordings come out 1080x1920.
export const W = 1080;
export const H = 1920;

// Arena inset from the canvas edge (room for the HUD at the top).
const ARENA_FULL = {
  x: 60,
  y: 300,
  w: W - 120,
  h: H - 300 - 90,
  radius: 54,
};

// Live arena box. Mutated by sizeArena() rather than replaced, so every module
// that imported it sees the current dimensions.
export const ARENA = { ...ARENA_FULL };

// Roster-dependent base size, before any sudden-death shrink is applied.
let baseScale = 1;

/**
 * Fit the cage to the crowd. Two fighters in a full-size arena spend most of a
 * match sailing past each other — measured contact rate was ~0.7 hits/sec
 * versus ~6.8 with eight balls, and 43% of duels never resolved. Tightening the
 * box for small rosters fixes the contact problem at its source.
 */
export function sizeArena(fighterCount) {
  const t = Math.max(0, Math.min(1, (fighterCount - 2) / 4));
  baseScale = 0.66 + (1 - 0.66) * t;
  applyArenaShrink(1);
}

/** Closing walls. `factor` of 1 is the full cage, 0.45 is the tightest. */
export function applyArenaShrink(factor) {
  const scale = baseScale * factor;
  ARENA.w = Math.round(ARENA_FULL.w * scale);
  ARENA.h = Math.round(ARENA_FULL.h * scale);
  ARENA.x = Math.round(ARENA_FULL.x + (ARENA_FULL.w - ARENA.w) / 2);
  ARENA.y = Math.round(ARENA_FULL.y + (ARENA_FULL.h - ARENA.h) / 2);
  ARENA.radius = Math.round(54 * scale);
}

export const PHYSICS = {
  substeps: 5,          // collision passes per frame — keeps fast balls from tunnelling
  restitution: 0.8,     // ball-vs-ball bounciness — full elasticity flung
                        // fighters apart and starved the fight of contact
  wallRestitution: 1.0,
  separationBias: 0.6,  // how hard overlapping balls are pushed apart
};

export const PALETTE = [
  '#ff5b6e', '#4ecdc4', '#ffd166', '#a78bfa',
  '#5aa9ff', '#7ee08a', '#ff8fab', '#ff9f45',
  '#e0e7ff', '#f472b6',
];

// Default roster names. Bob gets top billing — it is his bath, after all.
export const NAMES = [
  'Bob', 'Rocco', 'Vex', 'Nyx', 'Pip', 'Gunk',
  'Duke', 'Milo', 'Fizz', 'Bram',
];

export const SETTINGS = {
  ballSpeed: 460,        // px/s — balls hold this speed forever, they never settle
  maxHp: 150,
  hpSizeMode: true,      // ball radius tracks remaining HP
  baseRadius: 46,
  aggression: 0.68,      // 0 = pure random bouncing, 1 = beelines at the nearest enemy
  pickups: true,
  pickupInterval: 6,     // seconds between health/power drops
  supers: true,
  sound: true,
  trails: true,
  timeScale: 1,
  showDamage: true,
};

export const SUPER_CHARGE_MAX = 100;

// Escalation. Without it two healing balls can circle each other forever, which
// is death for a short-form video. After RAGE_START seconds all damage ramps up
// and health drops stop spawning, so every match is guaranteed to finish.
export const RAGE = {
  start: 30,     // seconds before damage begins climbing
  ramp: 42,      // seconds to gain +1x
  max: 4.0,      // hard ceiling on the multiplier
  heartCutoff: 52, // no more healing pickups after this
  minArena: 0.42,  // walls close to this fraction of the cage over the ramp
};
