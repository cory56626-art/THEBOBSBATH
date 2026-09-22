# Veilguard

An original, single-player 3D tower-defense game. Defend the beacon against mechanical constructs on a winding route. Inspired by the *tower-defense genre*, with original setting, models, units, names, wave rules, and progression.

Play: https://cory56626-art.github.io/THEBOBSBATH/veilguard/

## What is in this version

- Three modes: Ember (18 waves), Tempest (26), Eclipse (34), each with escalating enemy HP, wave size, and reward multiplier.
- Six towers: Spark, Prism, Glacier, Relay, Comet, Sentinel. Choose four for a match. Two unlock with persistent coins.
- Every tower has five upgrades. Attacking towers support First, Last, Strong, and Near target priorities. Select a tower to upgrade or sell for a 70% refund.
- Nine enemy types including armored, hidden, flying, regenerating, splitting, and boss constructs. Prism can detect hidden units after its second upgrade; anti-air towers are marked in their descriptions.
- Match cash is earned from kills, cleared waves, and Relay support. Coins, EXP, levels, and tower unlocks persist in localStorage on this device.
- Procedural 3D humanoid models, animated defenders and enemies, projectile effects, hover placement previews, adjustable speed, pause, drag orbit, and scroll zoom. A Canvas 2D software renderer preserves the 3D scene when WebGL is blocked.

## Controls

Select a tower from the bottom bar, then click/tap an open square to place it. Click a placed tower to inspect, upgrade, change its targeting, or sell it. Use the button above the board to start each wave. On desktop: number keys 1–4 select towers, Space starts the next wave, P pauses, Esc cancels selection, drag rotates the board, and the scroll wheel zooms. On touch, drag to rotate and use the on-screen buttons.

## Development

Serve the repository root with a static HTTP server, then open `/veilguard/`. For example, from the repo root:

```sh
python3 -m http.server 8080
```

Run logic tests with `node --test veilguard/tests/*.test.mjs`. The app is plain HTML/CSS/ES modules and imports the vendored, MIT-licensed Three.js module from `../backrooms/vendor/three.js`; it requires no package installation or external service. Existing GitHub Pages workflow deploys the entire repository when `main` changes.

This is a solo browser game. Co-op, cloud saves, and account systems are not included.
