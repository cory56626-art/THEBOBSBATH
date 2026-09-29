# Flip Lab — 3D physics playground

Play the static GitHub Page at [THEBOBSBATH/noomiclone](https://cory56626-art.github.io/THEBOBSBATH/noomiclone/). This is an original, unofficial NoomiClone-inspired experiment, with no assets or code from that game.

## Controls

- Hold **Arch** or **Tuck** to drive the gymnast's shoulder, spine, hip, and knee joints. Releasing the pose turns the joint motors off.
- Hold **Let Go** (Up/W) to open both hands. Lift your finger or key to close the hands; a hand grabs only if it actually reaches a nearby bar.
- **R** resets. **M** changes map. **I** toggles AI. **C** changes the 3D camera angle.
- Six maps are open playgrounds. Only Chimp Chase has an escape point. There is no automatic stand-up, position correction, run input, or recovery after a fall.

The player is a set of independent rigid bodies connected by physical joints, solved with Rapier at 90 Hz. Pose controls set finite-torque joint motor targets. The torso stays in its front plane and the neck is a limited hinge, so the face cannot turn backward. Hand grips are damped physical springs attached at the actual fingertips; a released hand must move away before it can regrab the same rail. Gravity, contacts, inertia, constraints, and friction determine movement. The AI reads bar positions and swing velocity, aims its free arm using the same finite-torque joints, releases its trailing hand, and switches swing patterns when stalled. It never assigns player positions or velocities. Chimp locomotion uses rolling torque and a motorized pillar grip. The renderer uses Three.js and renders all geometry in 3D.

The seven maps have different bar height paths, gaps, floors, platforms, and bounce beds. Classic Bars is the straight open setup; Rooftop Lines spans three separate roofs; Trampoline Yard has low clusters above bounce beds; Concrete Gym climbs high steps; Neon Underpass alternates low and tall rails; Canopy Grove follows an arched branch line; Chimp Chase is the only map with an ending.

## Build

`npm install && npm run build` regenerates `game.js`. The page works on GitHub Pages without a server runtime; its libraries are bundled into `game.js`. `npm run test:physics` checks landing, idle ragdoll behavior, chimp climbing, and AI behavior. Third-party license texts are in `vendor/`.
