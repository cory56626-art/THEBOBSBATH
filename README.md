# PRIMORDIA

**A creature evolution sandbox that runs entirely in your browser.**

Design a creature out of nodes and muscles, give it a name, then watch a whole
population of them learn to use the body you drew. Nothing about walking,
hopping or swimming is programmed — every gait is discovered by a genetic
algorithm, generation after generation, in front of you.

**▶ Play: https://cory56626-art.github.io/THEBOBSBATH/**

No build step, no bundler, no dependencies. It is plain ES modules and a 2D
canvas; open `index.html` on any static host and it runs.

---

## The loop

| | |
|---|---|
| **1 · Design** | Place nodes, connect them with muscles or rigid bones, tune grip / size / mass, and name your species. Or start from fifteen blueprints — eight abstract shapes and seven animals — or hit **Surprise me**. |
| **2 · Evolve** | A population of your creature spawns, each with a randomly wired nervous system. They all flail. The ones that flail *slightly* less badly get to breed. Repeat. |
| **3 · Archive** | Race any two recorded generations against each other in the same trial. Generation 1 against generation 400 is the whole point of the project in one screen. |

## What is actually being evolved

Each creature carries a **genome**: a body and a brain.

- **The body** is a soft-body mesh — point masses connected by distance
  constraints, integrated with Verlet. Muscles are constraints whose rest
  length is driven by the brain; bones are constraints that never move.
- **The brain** is a small recurrent neural network. It reads the height,
  velocity and ground contact of every node plus a phase clock, and outputs a
  contraction signal per muscle at 20 Hz while physics runs at 60 Hz. The
  recurrence matters: a gait is a memory of where you are in the stride.

Each generation, everyone lives out the trial. They are ranked, the top two are
kept untouched, and the rest of the next generation is bred by tournament
selection, uniform crossover and Gaussian mutation. When a lineage stops
improving, mutation ramps up in cycles and the occasional stranger is dropped
into the gene pool — stagnation is met with turbulence, then calm.

With **Body drift** turned up, the shape mutates too: limbs grow, thicken, and
fall off across generations, and the brain is resized to fit whatever body it
wakes up in.

## The blueprints

**Shapes** — Tadpole, Worm, Blob, Pogo, Crab, Biped, Quadruped, Eel.

**Animals**, drawn as real side-on anatomy with sticky paws and slippery backs:

| Animal | What makes it different |
|---|---|
| **Kangaroo** | One enormous hind leg, a long foot and a counterweight tail. Everything about it wants to hop. |
| **Cheetah** | A spine built out of muscle rather than bone, so the whole back flexes into the stride. |
| **Human** | Tall, narrow and permanently falling forward. Two legs is a hard way to live. |
| **Chimp** | Arms longer than its legs, knuckles on the floor. |
| **Monkey** | Light bones and a tail half its own length. |
| **Gorilla** | Enormous chest, short legs, arms like pistons. Slow to start, hard to stop. |
| **Shark** | No legs, no grip, one forked tail. Helpless on land, unbeatable in water. |

## The nine trials

| | Trial | What selection rewards |
|---|---|---|
| ⟶ | **Salt Flats** | Distance carried right on flat ground. The purest test of a gait. |
| ∿ | **Rolling Dunes** | Same race over sine hills. Punishes one-trick gaits. |
| ⬡ | **Boulder Field** | Flat ground buried under rubble. You cannot run through it, only over. |
| ⩗ | **The Chasm** | Ground, then nothing, then ground again. Crawlers stall at the first edge. |
| ◺ | **The Ascent** | Altitude on a slope that never ends. Grip is everything. |
| 🌲 | **The Canopy** | A great tree. Branch to branch, all the way up. Getting up is the whole job. |
| ↑ | **High Vault** | Peak height of the centre of mass. One good launch is all that counts. |
| ≈ | **The Abyss** | Distance swum. Buoyant, viscous, no floor worth touching. |
| ⇶ | **Standing Gale** | Share of its own height held while the wind shoves it around. |

Boulders, branches and tree trunks are solid boxes the physics resolves against
properly, so a creature can stand on a branch, wedge under a rock, or fall off
either.

## How scoring works

Fitness is deliberately hard to cheat:

- **Travel** is measured from the position a creature *holds* over the last 15%
  of its life, never the instant it stopped — a dive across the line does not
  beat a gait that carried the body there and kept it there.
- **Posture** is measured against the creature's own standing height, so a tall
  body cannot win a balance trial just by being tall.
- **The climb** scores altitude held plus how long it was held. Distance credit
  gets spent sprinting along the ground underneath the tree and peak-height
  credit gets spent hopping on the spot, so neither is offered.
- **A body that tears itself apart** scores just below standing still, rather
  than as the huge outlier that used to drag every generation average down.

Swimming works because limbs get **anisotropic drag** — a segment slicing
edge-on barely resists while the same segment swept broadside pushes hard.
With plain isotropic drag any repeating stroke would simply undo itself and the
creature would go nowhere, which is the scallop theorem doing its job.

Switching trials mid-run keeps the brains and changes the world, so you can
drop a sprinter into the ocean and watch it work the problem out.

## Watching it

- **Arenas at once** — 1 to 36 creatures simulated side by side. The first two
  arenas are always last generation's champions, so at one arena you are
  watching the reigning best.
- **Speed** — ½× to 8×.
- **Turbo** — drops rendering entirely and grinds hundreds of generations in
  seconds, then hands you back the champion to watch.
- The gold flag is the record to beat, ground posts are one metre apart, muscles
  glow hot as they contract and cold as they stretch, and node colour is grip:
  orange grips, blue slides.

## Controls

<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> switch screens, <kbd>Space</kbd> pauses
and resumes a run. In the designer, scroll to zoom and drag the background to
pan.

## Saving

Creatures, champions and the run in progress are saved to your browser's local
storage — reload the page and you pick up where you left off. **Export** writes
a creature or a whole run (bodies, brains, history) to a JSON file you can share
or import later.

## Running it locally

Any static server will do, since ES modules will not load over `file://`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html          three screens: design, evolve, archive
css/styles.css
js/physics.js       Verlet point masses, constraints, terrain, solid blocks, fluid
js/brain.js         recurrent neural network + mutation and crossover
js/genome.js        body + brain, morphological mutation, breeding
js/simulation.js    one creature, one trial, one lifetime
js/trials.js        the nine worlds and what each one rewards
js/evolution.js     the genetic algorithm
js/render.js        all canvas drawing
js/designer.js      the creature editor
js/lab.js           arena scheduling under a frame budget
js/archive.js       the time machine
js/presets.js       starter bodies
js/storage.js       local storage, import and export
js/main.js          wiring
```
