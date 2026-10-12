# Bob’s Bath — House Observatory

[Watch the game](https://cory56626-art.github.io/THEBOBSBATH/)

A real-time 3D spectator horror game. An autonomous survivor searches a large, furnished house for a brass key, power fuse, and bolt cutters, then unlocks the front door. The survivor has three lives; collected objects persist between lives.

The resident is an original, lanky paper-mask monster. It moves around the survivor’s running speed and hunts with forward vision, local sound clues, and fading memory. Walls and tall furniture block sight. Loud pickups, knocked-over objects, footsteps, and closet doors can start an investigation. Lost chases lead to guessed routes and nearby hiding-place searches, rather than following the survivor through walls. The survivor chooses escape routes and hides in closets or under beds.

The house has 16 rooms, three connecting halls, 16 beds, 16 closets, and alternate routes between rooms. Its geometry, collision boundaries, and navigation all use the same layout. Each attempt uses a fresh seed; deterministic decisions allow reproduction of a run.

## Controls

- **Begin observation:** both NPCs act autonomously. You control the camera and simulation.
- **Drag:** orbit or look around the selected actor. **Scroll/pinch:** zoom.
- **House / Survivor / Resident:** choose an overview or following camera. **C:** cycle views.
- **Senses / V:** show the monster’s sight cone and fading last-seen marker. Sound rings show local noise sources.
- **Pause / Space:** pause or resume. **1× / 2× / 4×:** change time speed.
- **↻:** restart with a fresh seed. The field guide lets you set the difficulty for the next attempt.
- Touch devices use the same on-screen controls. Leaving the browser tab pauses the run.
- **♪:** enable optional house ambience and local sound effects. Audio starts only after you choose to enable it.
- Graphics adapt automatically on slower devices. The field guide also offers Performance and High quality settings.

## Development

No build step, server API, accounts, or runtime CDN requests. Three.js r169 is vendored with its MIT license under `house/vendor/`; textures, architecture, furniture, and characters are procedural.

```sh
npm test
npm run serve
```

Open `http://localhost:8000`. The browser needs WebGL and JavaScript. Python 3 serves static files; Node 20+ runs simulation tests. Browser flow checks use Python Playwright and Chromium:

```sh
python tests/browser_smoke.py
```

- `house/layout.js`: house structure, collision, sight occlusion, and A* navigation.
- `house/simulation.js`: deterministic NPC decisions, sensing, hiding, search, lives, and escape.
- `house/renderer.js`: Three.js house, characters, effects, and spectator cameras.
- `house/main.js`: fixed-step loop, UI, floor plan, and controls.
- `tests/`: perception, navigation, simulation, and browser verification.

GitHub Pages serves `main` from the repository root. Relative module and asset paths work under `/THEBOBSBATH/`.

## Existing games

The previous games are preserved:

- [Meridian — Open City](https://cory56626-art.github.io/THEBOBSBATH/meridian/): the previous front-page city game. Its original assets remain in `assets/`.
- [LATCH — The Appeals Desk](https://cory56626-art.github.io/THEBOBSBATH/appeals/): the existing investigation game, unchanged.
