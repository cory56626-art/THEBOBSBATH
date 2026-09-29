# Flip Lab — 3D physics playground

Play the static GitHub Page at [THEBOBSBATH/noomiclone](https://cory56626-art.github.io/THEBOBSBATH/noomiclone/). This is an original, unofficial NoomiClone-inspired experiment, with no assets or code from that game.

## Controls

- Hold **Arch** or **Tuck** to drive the gymnast's shoulder, spine, hip, and knee joints. Releasing the pose turns the joint motors off.
- Hold **Let Go** (Up/W) to open both hands. Lift your finger or key to close the hands; a hand grabs only if it actually reaches a nearby bar.
- **R** resets. **M** changes map. **I** toggles AI. **C** changes the 3D camera angle.
- Six maps are open playgrounds. Only Chimp Chase has an escape point. There is no automatic stand-up, position correction, run input, or recovery after a fall.

The player is a set of independent 3D rigid bodies connected by physical joints, solved with Rapier at 90 Hz. Pose controls set finite-torque joint motor targets. Gravity, contacts, inertia, constraints, and friction determine movement. The AI uses those same motors and grip joints; it can lose balance or fail a trick. Chimp locomotion uses rolling torque and a motorized pillar grip. The renderer uses Three.js and renders all geometry in 3D.

## Build

`npm install && npm run build` regenerates `game.js`. The page works on GitHub Pages without a server runtime; its libraries are bundled into `game.js`. `npm run test:physics` checks landing, idle ragdoll behavior, chimp climbing, and AI behavior. Third-party license texts are in `vendor/`.
