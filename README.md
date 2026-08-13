# Wobbly Battle Simulator

A 3D physics battle simulator that runs in the browser — a homage to
[Totally Accurate Battle Simulator](https://store.steampowered.com/app/508440/).
Spend a budget placing armies of wobbling ragdolls on your half of the field,
press start, and then lose all control while they charge, swing, miss, trip over
each other and get launched into the air.

Nothing about the fighting is animated. Every unit is an **active ragdoll**: a
floppy skeleton that stands up only because spring "muscles" hold it there, and
falls over the moment something hits it hard enough.

**[▶ Play it](https://cory56626-art.github.io/THEBOBSBATH/)**

![status](https://img.shields.io/badge/status-playable-4ecdc4)
![deps](https://img.shields.io/badge/build%20step-none-blue)

---

## What's in it

- **70 units across 10 factions** — Tribal, Farmer, Medieval, Ancient, Viking,
  Dynasty, Renaissance, Pirate, Spooky and Wild West, each with the seven-unit
  shape the real game uses: a cheap body, a ranged option, a heavy, a boss.
  Point costs follow the originals, from the 50-point Halfling to the
  4000-point Da Vinci Tank.
- **16 campaign battles**, each a fixed enemy army and a budget smaller than
  what you are facing. They are counter puzzles: spread out against splash,
  close fast on artillery, put something heavy in front of archers.
- **Sandbox** with no budget and control of both sides.
- **Abilities** that change how a fight goes — healing, inspiring auras,
  lifesteal, summoning, poison, burning, thorns, lightning, and a lasso that
  drags people off their feet.
- Progress saves to `localStorage`.

## How a battle works

1. Pick a faction, pick a unit, click on your half of the field to place it.
   Drag to lay out a rank. Right-click removes.
2. Watch the budget bar. In campaign you will always be outspent.
3. Press **Start**, and stop being in charge.
4. Hold **F** for slow motion, because the best moments go past too quickly.

## Controls

| | |
|---|---|
| Click / drag | Place the selected unit |
| Right-click | Remove a unit |
| Right-drag | Orbit the camera |
| Shift-drag | Pan |
| WASD | Move across the field |
| Scroll · Q / E | Zoom |
| Space | Start battle |
| Hold F · G | Slow motion / very slow motion |
| T | Freeze time |
| R | Reset |
| 1–7 | Pick a unit from the current faction |

---

## How it works

### The wobbler

Each unit is nine points — head, chest, hip, two hands, two knees, two feet —
connected by distance constraints and integrated with Verlet. On its own that
skeleton is a bag of sticks that collapses instantly.

What makes it stand is a set of **muscles**: every step, spring forces pull each
joint toward where it *should* be in the unit's local frame. A `balance` value
from 0 to 1 scales how much authority those muscles have. Steep torso tilt and
hard knocks drain it; it regenerates over time. So a unit that takes a
ballista bolt goes limp, tumbles, and then wobbles back upright a second later
under its own power — none of which is scripted.

Dying just switches the muscles off permanently and loosens the joints, which
is why corpses fold into heaps instead of holding a pose.

Weight resists knockback, exactly as in the original: a King at 12× barely
flinches at the arrow that sends a Squire cartwheeling.

### The renderer

Nothing in the battle owns a mesh. There are four `InstancedMesh` primitives —
sphere, cylinder, box, cone — and every frame the entire scene is re-emitted
into them: limbs, heads, googly eyes, hats, weapons, arrows, explosions. The
whole battle is roughly four draw calls, and the flat low-poly result is the
look the game wanted anyway.

Because units are drawn directly from their physics joints, whatever shape the
solver has folded someone into is exactly what you see.

### The AI

Deliberately thin. Find the nearest enemy, walk until the weapon reaches, swing.
The entertainment does not come from clever tactics inside a unit; it comes from
a hundred simple units colliding with a physics engine that does not respect
anyone's plans.

### Layout

```
index.html          markup and the deployment panel
css/styles.css
js/physics.js       Verlet points, distance constraints, spatial hash
js/wobbler.js       the active ragdoll — skeleton, muscles, balance, damage
js/units.js         faction and unit tables
js/battle.js        simulation: AI, weapons, projectiles, abilities
js/campaign.js      the 16 battles
js/render.js        three.js scene and the instanced primitive emitters
js/ui.js            panel, camera rig, input, campaign flow
js/audio.js         sound, synthesised at runtime — no audio files
vendor/             three.js, vendored so the page has no external requests
```

## Running it locally

Static site, no build step. It just needs to be served over HTTP, since ES
modules do not load from `file://`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deployment

Pushing to `main` publishes to GitHub Pages via
`.github/workflows/pages.yml`. There is nothing to compile — the workflow
uploads the repository as-is.

## Credits

Totally Accurate Battle Simulator is made by
[Landfall Games](https://landfall.se/). This is an independent homage built
from scratch, not affiliated with or endorsed by them, and shares no code or
assets with the original.

[three.js](https://threejs.org/) is vendored under `vendor/` (MIT, see
`vendor/three-LICENSE.txt`). Everything else here is original.
