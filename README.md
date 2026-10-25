# Hulkbuster & Titan Breaker — Combat Lab

[Play on GitHub Pages](https://cory56626-art.github.io/THEBOBSBATH/)

A self-contained 3D spectator combat sandbox. Choose the movie-inspired Mark XLIV Hulkbuster or **Titan Breaker, Elias Vane’s original autonomous containment armor**, and watch it fight **Hulk, Venom, Ultron, Carnage, The Thing, or Wolverine** in a city or a flat grass arena. The city includes evacuating civilians, soldiers, tanks, physical cars and destructible buildings.

- Ten rigid bodies per fighter, constrained joints, motor-assisted walking and balance, force-driven strikes, impact damage, physical projectiles and debris. Launches suspend locomotion motors so fighters travel ballistically, tumble and recover. No timed or predetermined winner.
- Film-inspired loadouts: charged repulsor blasts, rapid hydraulic combinations and rocket charges; Hulk leaps with landing shockwaves, smashes and thunderclaps; Venom tendril pulls, wall-directed throws, pounces and healing; Ultron energy salvos, gravity lift-and-throw, flight and sentries.
- Physical impacts fracture building collision cells and matching facade geometry. Concrete chunks, dust clouds, fireballs, smoke, shockwaves and glowing energy trails make heavy hits visible. Upper structures remain simplified static towers.
- Per-limb damage, progressive armor shedding, bruises, cuts and blood. Severe joint failure can separate limbs. Hulk's optional limb regrowth takes longer than normal healing; Venom naturally reforms.
- Veronica carries six replacement modules. Repairs consume stock, and enemy attacks can destroy her pod. No infinite repair supply.
- Optional Ultron transfer consumes a surviving sentry to provide one backup body.
- Hulkbuster flight is limited to 2.8 seconds; Ultron gets 3.5 seconds. Both must land and recharge for 14 seconds before taking off again.
- Go to Sleep is a close-range gas discharge with target-dependent success chances. Successful exposure produces a temporary limp ragdoll, followed by resistance to immediate repeats. Robots are immune.
- Match health is independent of local part durability. Depleted head/core integrity cannot secretly end a fight while the visible bar remains high. Single hits are capped at 6.5% of maximum match health.
- Hulk gains resistance and strength as rage grows. Carnage uses tendrils and blades, The Thing relies on rock armor and weight, and Wolverine uses claws, pounces and healing. Military tanks and infantry deal meaningful damage with finite armor.

## Titan Breaker

Titan Breaker is a silent, 3.35 m metallic dark-grey machine with cyan eyes and a cyan chest reactor. Its Zeno armor is slightly more durable than vibranium, but plates and components can still fracture or be torn away. Its mission is live capture, with an onboard AI independent from Sunday.

Its established systems are heavy grappling and strikes, bilateral piston punches, separate Red Thruster punches, palm repulsors, 30 homing missiles split 15 per forearm, a breakable body-wrapping Zeno restraint rope, wrist shields, sustained flight, ground-based air-suction stabilizers and optical camouflage. Sunday scans and delivers replacement components from above Veronica’s altitude using Red Thrusters. Optical stealth does not defeat every sensor, and large amounts of water compromise the machine’s effectiveness.

Dual-arm pistons block simultaneous repulsor fire. One arm may use pistons while the opposite palm fires. Red Thruster punches cannot stack with the piston mechanism in the same attack. These are separate attacks, not additive damage modes. Missile ammunition and damaged arms are tracked; neither Zeno nor the restraint rope is indestructible. Full flight is part of Titan Breaker’s supplied design and is separate from Hulkbuster’s and Ultron’s short flight bursts.

The supplied character design and reference image are the source for Titan Breaker. [Design and simulation notes](arena/RESEARCH.md#titan-breaker--original-character-design) preserve its limits. No additional weapons or transformations are assumed.

## Controls

Choose your hero, opponent and battlefield, then **Begin engagement**. AI controls both fighters. Drag to orbit and scroll/pinch to zoom. Camera presets follow either fighter or the fight. Manual command buttons request the selected hero’s abilities; range, charge, equipment and cooldowns still apply.

**Space** pauses; **C** changes camera; **R** resets the fight. Numbered commands follow the selected hero’s on-screen loadout. Hulkbuster’s **1–6** commands are repulsor, jackhammer, boost, repair, flight and Go to Sleep. Use quarter speed for slow motion. Settings include limb regrowth, severe separation, injury effects, network transfer, military response, graphics quality and optional 2.4 m battlefield flooding. Flooding provides a way to test Titan Breaker’s established water weakness. Touch controls are included. Combat sound starts with the engagement; use ♪ to mute it. Leaving the tab pauses the simulation.

## Scope and research

[Research and sources](arena/RESEARCH.md) are also linked from the in-game Field notes. MCU film references inform Hulkbuster, Hulk and Ultron. Sony films supply Venom and Carnage; The Thing uses The Fantastic Four: First Steps, and Wolverine uses the healthy Hugh Jackman movie portrayal with the yellow-and-blue suit. Extended abilities are selectable; numerical durability, masses, regeneration times and repair stock are gameplay tuning.

Models are detailed procedural likenesses, not film meshes or photoreal scans. Titan Breaker is based on the original design supplied in this conversation, attributed to Elias Vane. Physics uses simplified rigid collision shapes and assisted locomotion. Organic damage is a visual game system rather than anatomical simulation. Ability and repair effects follow explicit game rules. This is an unofficial fan experiment.

## Development

No build step or runtime CDN dependency. Three.js r169 is shared with the archived house game; Cannon-es 0.20.0, fonts, and licenses are vendored in `arena/vendor/`. All character/environment geometry and textures are generated locally.

```sh
npm test
npm run serve
# In another terminal, with Python Playwright and Chromium installed:
python tests/arena_browser.py
python tests/arena_pace.py
python tests/arena_roster.py
python tests/titan_browser.py
```

Open `http://localhost:8000/`. The site needs WebGL and JavaScript. Graphics automatically lower resolution and mesh detail on software renderers and smaller devices. The simulation retains elapsed wall time when rendering slows. Character surfaces and physical rubble use batched geometry and instancing. `ARENA_BASE_URL` selects another deployment for browser checks.

- `arena/simulation.js`: physical rigs, collisions, AI, abilities, damage, regrowth, repairs, city response.
- `arena/models.js`: characters, armor loss, injury overlays and aerial repair platforms.
- `arena/environment.js`: city/grass, vehicles, civilians, soldiers and sentries.
- `arena/main.js`: rendering, clear-sight director camera, UI and wall-time-preserving fixed-step loop.
- `arena/effects.js`: fixed particle/instance pools for fire, dust, smoke, beams and shockwaves.
- `arena/simulation.test.js`: physics and game-rule regression tests.
- `tests/arena_browser.py`: desktop/mobile browser integration checks.

GitHub Pages serves `main` from the root. All asset paths work under `/THEBOBSBATH/`.

## Preserved games

- [House Observatory](https://cory56626-art.github.io/THEBOBSBATH/observatory/) — previous front page, with original assets under `house/`.
- [Meridian — Open City](https://cory56626-art.github.io/THEBOBSBATH/meridian/)
- [LATCH — The Appeals Desk](https://cory56626-art.github.io/THEBOBSBATH/appeals/)

Original house simulation tests remain part of `npm test`; its browser check defaults to `/observatory/`.
