// The genetic algorithm: rank a generation, keep the best intact, breed the
// rest, and mutate. Includes two small pressure valves — hypermutation and
// fresh immigrants — that kick in when a lineage stops improving.

import { Genome } from './genome.js';
import { mulberry32, clamp } from './util.js';

export const DEFAULTS = {
  size: 24,
  hidden: 10,
  rate: 0.14,     // fraction of weights touched per mutation
  power: 0.45,    // size of a typical nudge
  morph: 0,       // 0 = body frozen, 1 = full morphological drift
  elite: 2,
  trial: 'plains',
  seed: 1337,
};

export class Population {
  constructor(blueprint, cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.blueprint = blueprint;
    this.rng = mulberry32(this.cfg.seed);
    this.generation = 1;
    this.history = [];      // { gen, best, avg, worst }
    this.champions = [];    // { gen, fitness, genome: JSON }
    this.best = null;       // all-time { gen, fitness, genome }
    this.stagnant = 0;
    this.evaluated = 0;
    this.members = [];
    this.spawn();
  }

  spawn() {
    this.members = [];
    for (let i = 0; i < this.cfg.size; i++) {
      const g = Genome.seed(this.blueprint, this.rng, this.cfg.hidden);
      g.idx = i; g.gen = 1;
      this.members.push({ genome: g, fitness: null });
    }
  }

  /** Resize a live population without throwing away what it has learned. */
  resize(size) {
    const old = this.cfg.size;
    this.cfg.size = size;
    if (size < old) { this.members.length = size; return; }
    const ranked = [...this.members].sort((a, b) => (b.fitness ?? -99) - (a.fitness ?? -99));
    for (let i = old; i < size; i++) {
      const parent = ranked[Math.floor(this.rng() * Math.min(4, ranked.length))] || null;
      const g = parent
        ? parent.genome.clone().mutate({ rate: this.cfg.rate, power: this.cfg.power, morph: this.cfg.morph }, this.rng)
        : Genome.seed(this.blueprint, this.rng, this.cfg.hidden);
      g.idx = i; g.gen = this.generation;
      this.members.push({ genome: g, fitness: null });
    }
  }

  score(i, fitness) {
    this.members[i].fitness = fitness;
    this.evaluated++;
  }

  get pending() { return this.members.filter((m) => m.fitness === null).length; }

  /** Tournament selection — a mild pressure that still lets outsiders breed. */
  pickParent(ranked) {
    const k = 3;
    let best = null;
    for (let i = 0; i < k; i++) {
      const c = ranked[Math.floor(this.rng() * ranked.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  /** Rank, record, breed. Returns the stats row for the generation just ended. */
  advance() {
    const ranked = [...this.members]
      .filter((m) => m.fitness !== null)
      .sort((a, b) => b.fitness - a.fitness);
    if (!ranked.length) return null;

    const best = ranked[0];
    const avg = ranked.reduce((s, m) => s + m.fitness, 0) / ranked.length;
    const row = { gen: this.generation, best: best.fitness, avg, worst: ranked[ranked.length - 1].fitness };
    this.history.push(row);

    this.champions.push({ gen: this.generation, fitness: best.fitness, genome: best.genome.toJSON() });
    if (this.champions.length > 400) this.champions.shift();

    if (!this.best || best.fitness > this.best.fitness + 1e-6) {
      this.best = { gen: this.generation, fitness: best.fitness, genome: best.genome.clone() };
      this.stagnant = 0;
    } else {
      this.stagnant++;
    }

    // Punctuated equilibrium: when a lineage stalls, shake the weights harder
    // and harder for a while, then snap back and let it re-converge. A boost
    // that only ever ramps up eventually destroys the population it is meant
    // to rescue.
    const cycle = this.stagnant > 8 ? ((this.stagnant - 8) % 26) / 26 : 0;
    const boost = 1 + cycle * 1.7;
    const mut = {
      rate: clamp(this.cfg.rate * boost, 0, 0.9),
      power: this.cfg.power * boost,
      morph: this.cfg.morph,
    };

    const next = [];
    const elite = Math.min(this.cfg.elite, ranked.length);
    for (let i = 0; i < elite; i++) {
      const g = ranked[i].genome.clone();
      g.lineage = ranked[i].genome.lineage;
      next.push({ genome: g, fitness: null, elite: true });
    }
    const immigrants = this.stagnant > 10 ? 1 : 0;
    while (next.length < this.cfg.size) {
      let child;
      if (next.length >= this.cfg.size - immigrants) {
        child = Genome.seed(this.blueprint, this.rng, this.cfg.hidden);
      } else {
        const a = this.pickParent(ranked), b = this.pickParent(ranked);
        child = Genome.cross(a.genome, b.genome, this.rng).mutate(mut, this.rng);
      }
      next.push({ genome: child, fitness: null });
    }

    this.generation++;
    next.forEach((m, i) => { m.genome.idx = i; m.genome.gen = this.generation; });
    this.members = next;
    return row;
  }

  toJSON() {
    return {
      cfg: this.cfg,
      generation: this.generation,
      blueprint: this.blueprint,
      history: this.history,
      champions: this.champions.slice(-120),
      best: this.best ? { gen: this.best.gen, fitness: this.best.fitness, genome: this.best.genome.toJSON() } : null,
      members: this.members.map((m) => m.genome.toJSON()),
    };
  }

  static fromJSON(j) {
    const p = new Population(j.blueprint, j.cfg);
    p.generation = j.generation;
    p.history = j.history || [];
    p.champions = j.champions || [];
    p.best = j.best ? { gen: j.best.gen, fitness: j.best.fitness, genome: Genome.fromJSON(j.best.genome) } : null;
    if (j.members?.length) {
      p.members = j.members.map((g, i) => {
        const genome = Genome.fromJSON(g);
        genome.idx = i;
        return { genome, fitness: null };
      });
      p.cfg.size = p.members.length;
    }
    return p;
  }
}
