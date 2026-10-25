# Hulkbuster — Stark Combat Lab

[Play on GitHub Pages](https://cory56626-art.github.io/THEBOBSBATH/)

A self-contained 3D spectator combat sandbox. Watch an autonomous, movie-inspired Mark XLIV Hulkbuster fight **Hulk, Venom, or Ultron** in a city or a flat grass arena. The city includes evacuating civilians, soldiers, tanks, physical cars and destructible buildings.

- Ten rigid bodies per fighter, constrained joints, motor-assisted walking and balance, force-driven strikes, impact damage, physical projectiles and debris. No timed or predetermined winner.
- Film-inspired loadouts: repulsors, hydraulic punches and boosts; Hulk leaps, smashes and thunderclaps; Venom tendrils, bites and healing; Ultron blasts, gravity control, flight and sentries.
- Per-limb damage, progressive armor shedding, bruises, cuts and blood. Severe joint failure can separate limbs. Hulk's optional limb regrowth takes longer than normal healing; Venom naturally reforms.
- Veronica carries six replacement modules. Repairs consume stock, and enemy attacks can destroy her pod. No infinite repair supply.
- Optional Ultron transfer consumes a surviving sentry to provide one backup body.

## Controls

Choose an opponent and battlefield, then **Begin engagement**. AI controls both fighters. Drag to orbit and scroll/pinch to zoom. Camera presets follow either fighter or the fight. Manual command buttons request Hulkbuster abilities; range, charge, equipment and cooldowns still apply.

**Space** pauses; **C** changes camera; **R** resets the fight; **1–4** issue repulsor, jackhammer, boost and repair commands. Use quarter speed for slow motion. Settings include limb regrowth, severe separation, injury effects, network transfer, military response and graphics quality. Touch controls are included. Sound is optional and begins only after enabling it. Leaving the tab pauses the simulation.

## Scope and research

[Research and sources](arena/RESEARCH.md) are also linked from the in-game Field notes. MCU film references inform Hulkbuster, Hulk and Ultron. Tom Hardy's Sony films supply Venom's combat reference. Extended abilities are selectable; numerical durability, masses, regeneration times and repair stock are gameplay tuning.

Models are detailed procedural likenesses, not film meshes or photoreal scans. Physics uses simplified rigid collision shapes and assisted locomotion. Organic damage is a visual game system rather than anatomical simulation. Ability and repair effects follow explicit game rules. This is an unofficial fan experiment.

## Development

No build step or runtime CDN dependency. Three.js r169 is shared with the archived house game; Cannon-es 0.20.0, fonts, and licenses are vendored in `arena/vendor/`. All character/environment geometry and textures are generated locally.

```sh
npm test
npm run serve
# In another terminal, with Python Playwright and Chromium installed:
python tests/arena_browser.py
```

Open `http://localhost:8000/`. The site needs WebGL and JavaScript. Graphics automatically lower resolution on software renderers and slower devices. `ARENA_BASE_URL` selects another deployment for browser checks.

- `arena/simulation.js`: physical rigs, collisions, AI, abilities, damage, regrowth, repairs, city response.
- `arena/models.js`: characters, armor loss, injury overlays, Veronica.
- `arena/environment.js`: city/grass, vehicles, civilians, soldiers and sentries.
- `arena/main.js`: rendering, effects, cameras, UI and fixed-step loop.
- `arena/simulation.test.js`: physics and game-rule regression tests.
- `tests/arena_browser.py`: desktop/mobile browser integration checks.

GitHub Pages serves `main` from the root. All asset paths work under `/THEBOBSBATH/`.

## Preserved games

- [House Observatory](https://cory56626-art.github.io/THEBOBSBATH/observatory/) — previous front page, with original assets under `house/`.
- [Meridian — Open City](https://cory56626-art.github.io/THEBOBSBATH/meridian/)
- [LATCH — The Appeals Desk](https://cory56626-art.github.io/THEBOBSBATH/appeals/)

Original house simulation tests remain part of `npm test`; its browser check defaults to `/observatory/`.
