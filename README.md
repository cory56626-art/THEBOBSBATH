# Tug Tussle

A 3D tug-of-war clicker that runs entirely in the browser. Tap faster than your
rival, drag the golden knot past their chalk line, and watch their whole team
faceplant into the mud.

**▶ Play: https://cory56626-art.github.io/THEBOBSBATH/**

No build step, no bundler, no CDN — open `index.html` on any static host and it
runs.

---

## How to play

| | |
|---|---|
| **Tap anywhere** (or <kbd>Space</kbd>) | Every tap is one yank on the rope. Each finger counts, so two-thumb it. |
| **Clicks per second** | Your CPS *is* your pulling power. Out-click the rival and the rope comes your way. |
| **SURGE** | Tapping charges the bar at the bottom. Fire it for 2.8 seconds of 2.4× power — save it for when you're losing ground. <kbd>Shift</kbd> also fires it. |
| **The chalk lines** | Drag the knot past your rival's line to win. Stall past 22 seconds and both lines start creeping inward, so nothing goes on forever. |
| **The ladder** | Beat a rival to unlock the next. Progress is saved in your browser. |

Dragging a lead gets progressively harder the closer the knot gets to the line,
so a comeback is always live — right up until someone lands in the mud.

## The rivals

| # | Rival | CPS | Personality |
|---|---|---|---|
| 1 | Rusty Bolt 🤖 | 3.0 | Fumbles the rope constantly |
| 2 | Bouncy 🐇 | 4.1 | Twitchy little bursts |
| 3 | Coach Kelp 🦑 | 4.9 | Digs in hard when behind |
| 4 | Twin Pips 👯 | 5.6 | Short, sharp double-pulls |
| 5 | Ironclaw 🦀 | 6.3 | Metronomic. Never tires |
| 6 | Turbo Tina 🐆 | 7.1 | Sprints, coasts, sprints |
| 7 | Major Meltdown 🌋 | 8.0 | Gets faster the more he's losing |
| 8 | THE KRAKEN 🐙 | 9.1 | Relentless |

Rival CPS is their honest tap rate, measured the same way yours is — both sides
of the rope run through the identical tap→pull pipeline. Roughly: ~5 CPS clears
the first three, ~6.5 gets you to Ironclaw, and the Kraken wants ~8 plus good
surge timing.

## Running it locally

Any static file server will do — ES modules need HTTP, not `file://`:

```sh
npx http-server -p 8080 -c-1 .
# then open http://localhost:8080
```

## How it's put together

Plain ES modules, no framework, no build. [three.js](https://threejs.org) r169
is vendored in `vendor/` (MIT, licence included). Every texture — the pitch, the
sky gradient, the dust sprites — is painted into a `<canvas>` at load time, and
every sound is synthesised with the Web Audio API, so there are no binary assets
in the repo at all.

```
index.html          markup: canvas, HUD, and the four screens
css/styles.css      the chunky mobile-game chrome
js/config.js        every gameplay tunable in one place
js/main.js          entry point
js/ui.js            screens, input, HUD, floating text
js/game.js          the match: tug simulation and state machine
js/scene.js         arena, lighting, crowd, camera framing
js/character.js     the puller rig and its animation states
js/rope.js          Catmull-Rom rope threaded through every pair of hands
js/fx.js            dust, sweat, mud and confetti
js/bots.js          the rival ladder and its AI
js/audio.js         synthesised sound kit
js/store.js         progress in localStorage
```

### The pull maths

A tap adds a fixed amount to your pull, which then decays exponentially
(`halfLife` in `config.js`). Steady tapping at *C* clicks per second settles at a
steady pull proportional to *C*, so the rope genuinely tracks the CPS gap rather
than raw tap count. The difference between the two sides drives the rope's
velocity, damped so it feels like rope and not like a slider.

Everything worth tuning — pull decay, rope speed, the lead-resistance curve,
surge numbers, sudden-death timing — lives at the top of `js/config.js`.

### Camera

The pitch is a long horizontal line, which is awkward on a phone. The camera
swings further off-axis and higher as the viewport narrows, so on a portrait
screen the rope runs diagonally and uses both dimensions instead of shrinking to
fit the short one.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. There's no build step — the workflow uploads the files
as-is.

## Credits

Built on [three.js](https://threejs.org) r169, vendored in `vendor/` under its
MIT licence (`vendor/three-LICENSE.txt`). Everything else here is original.
