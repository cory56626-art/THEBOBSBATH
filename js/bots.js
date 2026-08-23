/**
 * The rival ladder. `cps` is the bot's honest baseline clicks-per-second —
 * everything else just shapes how it spends them.
 */
export const BOTS = [
  {
    id: 'rusty', name: 'Rusty Bolt', face: '🤖', shirt: 0xf4573c, accent: 0x9c3020,
    cps: 3.0, grit: 0.30, burst: 1.20, burstEvery: 7.0, burstLen: 1.6,
    choke: 0.55, stamina: 0.00,
    blurb: 'Squeaky. Slow. Weirdly confident.',
    taunt: 'BEEP. Prepare to be… out-tugged?',
  },
  {
    id: 'bouncy', name: 'Bouncy', face: '🐇', shirt: 0xff8fc0, accent: 0xc2557f,
    cps: 4.1, grit: 0.26, burst: 1.35, burstEvery: 5.5, burstLen: 1.4,
    choke: 0.35, stamina: 0.05,
    blurb: 'All twitch, no plan.',
    taunt: 'Hop hop! Can you keep up?',
  },
  {
    id: 'kelp', name: 'Coach Kelp', face: '🦑', shirt: 0x3fb08a, accent: 0x22624c,
    cps: 4.9, grit: 0.40, burst: 1.22, burstEvery: 6.0, burstLen: 2.0,
    choke: 0.22, stamina: 0.00,
    blurb: 'Eight arms. All of them coaching.',
    taunt: 'Technique beats speed. Usually.',
  },
  {
    id: 'pips', name: 'Twin Pips', face: '👯', shirt: 0xa77bff, accent: 0x6440b0,
    cps: 5.6, grit: 0.22, burst: 1.55, burstEvery: 4.6, burstLen: 1.2,
    choke: 0.18, stamina: 0.04,
    blurb: 'Two brains, one rope.',
    taunt: 'We counted. You lose twice.',
  },
  {
    id: 'ironclaw', name: 'Ironclaw', face: '🦀', shirt: 0xe0452f, accent: 0x8e2216,
    cps: 6.3, grit: 0.18, burst: 1.18, burstEvery: 8.0, burstLen: 2.4,
    choke: 0.06, stamina: 0.00,
    blurb: 'Never tires. Never blinks.',
    taunt: 'Grip locked. Enjoy the drag.',
  },
  {
    id: 'tina', name: 'Turbo Tina', face: '🐆', shirt: 0xffb02e, accent: 0xb4700a,
    cps: 7.1, grit: 0.20, burst: 1.62, burstEvery: 4.2, burstLen: 1.5,
    choke: 0.10, stamina: 0.10,
    blurb: 'Sprints. Naps. Sprints again.',
    taunt: 'Blink and you are in the mud.',
  },
  {
    id: 'meltdown', name: 'Major Meltdown', face: '🌋', shirt: 0xff5a2b, accent: 0x8f2306,
    cps: 8.0, grit: 0.45, burst: 1.45, burstEvery: 5.0, burstLen: 1.8,
    choke: 0.05, stamina: 0.16,
    blurb: 'Gets scarier the more he loses.',
    taunt: 'I only warm up when I am behind.',
  },
  {
    id: 'kraken', name: 'THE KRAKEN', face: '🐙', shirt: 0x6a4bd6, accent: 0x38236f,
    cps: 9.1, grit: 0.30, burst: 1.35, burstEvery: 6.0, burstLen: 2.2,
    choke: 0.02, stamina: 0.06,
    blurb: 'Ten arms. Zero mercy.',
    taunt: 'The rope was mine before you touched it.',
  },
];

/**
 * Turns a bot definition into a stream of taps. Deliberately built on the same
 * tap→pull pipeline the player uses, so the CPS readouts mean the same thing
 * on both sides of the rope.
 */
export class BotBrain {
  constructor(def) {
    this.def = def;
    this.next = 1 / def.cps;
    this.t = 0;
    this.burstT = def.burstEvery * (0.4 + Math.random() * 0.5);
    this.burstLeft = 0;
    this.chokeLeft = 0;
    this.chokeT = 4 + Math.random() * 5;
    this.rate = def.cps;
  }

  /** @param {number} lead +1 = player is winning, -1 = bot is winning */
  update(dt, lead) {
    const d = this.def;
    this.t += dt;

    // Bursts: short, telegraphed pushes.
    this.burstT -= dt;
    if (this.burstT <= 0) { this.burstLeft = d.burstLen; this.burstT = d.burstEvery * (0.75 + Math.random() * 0.6); }
    if (this.burstLeft > 0) this.burstLeft -= dt;

    // Chokes: the low-tier bots fumble the rope now and then.
    this.chokeT -= dt;
    if (this.chokeT <= 0) {
      this.chokeT = 4 + Math.random() * 6;
      if (Math.random() < d.choke) this.chokeLeft = 0.5 + Math.random() * 0.7;
    }
    if (this.chokeLeft > 0) this.chokeLeft -= dt;

    const wave     = 1 + 0.10 * Math.sin(this.t * 1.6) + 0.05 * Math.sin(this.t * 4.1 + 1.3);
    const comeback = 1 + d.grit * Math.max(0, lead);         // digs in when losing
    const fatigue  = 1 - Math.min(0.28, d.stamina * (this.t / 45));
    const burst    = this.burstLeft > 0 ? d.burst : 1;
    const choke    = this.chokeLeft > 0 ? 0.32 : 1;

    this.rate = Math.max(0.4, d.cps * wave * comeback * fatigue * burst * choke);
    this.bursting = this.burstLeft > 0 && choke === 1;

    let taps = 0;
    this.next -= dt;
    while (this.next <= 0) {
      taps++;
      this.next += (1 / this.rate) * (0.8 + Math.random() * 0.42);
      if (taps > 20) break;                                   // paranoia guard
    }
    return taps;
  }
}
