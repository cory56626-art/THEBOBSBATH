// Central tuning knobs. Everything gameplay-ish lives here so the feel can be
// dialled in from one place.
export const CFG = {
  // ── Arena ──────────────────────────────────────────────────────────────
  arenaR:     15,     // radius of the floating island, metres
  goal:       5.0,    // how far the knot must travel to win, metres
  ropeY:      1.26,   // height of the rope at the hands
  frontX:     2.05,   // front puller's distance from the centre line
  spacing:    1.5,    // gap between team-mates along the rope
  teamSize:   3,

  // ── Pull maths ─────────────────────────────────────────────────────────
  // A tap adds `clickPower` to your pull, which then decays exponentially.
  // Steady tapping at C clicks/sec settles at C * clickPower * halfLife/ln2,
  // so your pull is directly proportional to your CPS.
  clickPower: 1.0,
  halfLife:   0.42,
  speed:      1.05,   // metres/sec of rope travel per unit of net pull
  maxVel:     2.4,
  resist:     1.7,    // extending a lead gets progressively harder
  accel:      8.0,    // how quickly rope velocity chases the target

  // ── Surge ──────────────────────────────────────────────────────────────
  surgeMul:      2.4,
  surgeTime:     2.8,
  surgeGain:     0.95,  // charge % per tap — roughly two surges a match

  // ── Sudden death: the chalk lines creep inward on long matches ─────────
  suddenStart: 22,
  suddenSpan:  38,
  suddenMin:   0.18,  // goal never shrinks below this fraction

  // ── Match ──────────────────────────────────────────────────────────────
  cpsWindow: 1.0,     // rolling window for the CPS readout, seconds
};

export const COL = {
  blue:  0x3b8ef0, blueD: 0x1e5fb4, blueL: 0x8fc9ff,
  red:   0xf4573c, redD:  0xbb2f1c, redL:  0xffa38f,
  gold:  0xffc93c, goldD: 0xd18f00,
  grass: 0x6ec25a, grassD:0x54a747,
  mud:   0x5d4025, rope:  0xc79a5b, ropeD: 0x9a713b,
  skin:  [0xffd9b3, 0xf0b98a, 0xc98a5c, 0x9c6437, 0x6f4526],
};
