# Wildwake

An expanded single-player survival game in Glasswater Valley. Original procedural 3D environment and skinned wildlife; no AI-generated images or external asset requests. Runs from a static GitHub Pages directory. The bundled release includes all JavaScript and the Rapier WebAssembly runtime.

## Playing

Open `wildwake/index.html` through HTTP or GitHub Pages. Start empty-handed, gather the objects around the clearing, craft a hatchet, harvest trees, make a spear, practice at the old range, build camp, cook, and rest through the night. Explore the stone arch and lantern grove for hidden caches, then travel to Cedar Highlands, Eastwater Reach, Northern Passage and Sunstone Rise. The 432 × 432 terrain covers nine times the original area; the Map tab shows landmarks and camp. The jaguar and chimpanzee are territorial; deer graze and retreat.

WASD move, mouse look, Shift sprint, Space jump, C crouch, E interact, I or Tab inventory, B crafting, 1–8 hotbar, Q drop, F use, T climb or release, G grab or release, M map, R rotate placement, X dismantle, F5 save, Escape pause. Tap left mouse / ACTION for a spear thrust; hold to charge, then release to throw. Thrusts retain the weapon and use a timed geometric contact window. Defeat is permanent and non-graphic. A health bar and hit confirmation expose successful contacts. The trajectory preview and optional near-reticle release assistance account for moving targets; there is no homing in flight. Right mouse cancels. Touch controls include a movement joystick, drag-to-look, action, interact, sprint, crouch, jump, CLIMB and GRAB. On a tree, forward/back climbs/descends; rest at the branch to recover stamina. Space / JUMP releases into physical gravity.

Settings: sensitivity, volume, graphics, touch mode, throw aim assistance. When WebGL2 is unavailable, a Canvas 2D compatibility renderer projects the same Three.js scene and skinned geometry with reduced foliage, coarse terrain, a shorter draw distance and no shadows. It keeps the same Rapier physics and controls. Saves and autosaves use browser local storage and remain on that device/browser. The whole world pauses in inventory/settings and when backgrounded. Interacting with a camp structure allows time and cooking to continue.

## Physics and intentional approximations

- Three.js 0.186.0 and Rapier 3D 0.20.0, pinned and bundled. 60 Hz fixed physics; 8 solver iterations, 4 CCD substeps, additional solver iterations on constrained structures, collision groups, sleeping loose bodies, and a cap of 320 active recoverable loose stacks; distant stacks are serialized and streamed back in without losing their counts.
- All trees, rocks, targets, structural frames and terrain have collision volumes. Grass and small ferns are flexible visual foliage. Terrain uses a 1.5-unit triangle grid; terrain cannot be excavated and trees are harvested as a whole resource node rather than a full falling tree simulation.
- Loose objects have mass, friction, restitution, angular motion and gravity. Timber is buoyant, dense stones sink. Water is a simplified drag/buoyancy volume rather than fluid simulation. Loose building timbers fall; shelter roofs use a fixed Rapier constraint to their anchored frame.
- Spear flight is a rigid body with CCD plus five swept shaft-radius ray paths per physics step. Contact angle and fictional material properties distinguish lodging and deflection. Hits on animals additionally test bone-local ellipsoids along the actual path; resistance is deducted in intersection order. No random critical-hit rolls. A spear attached to an animated bone or moving target is stored in the local coordinate frame and follows its translation and rotation.
- Animal locomotion is **hybrid**, not a fully free active ragdoll: a stabilized, upright dynamic body receives steering forces and collision impulses. A skinned procedural mesh has articulated joint-limited bones, distance-driven stepping and two-segment terrain foot IK. Anatomical and limb colliders are animated sensor volumes; the core capsule handles solid contacts. Limbs do not have individually simulated muscles or separate dynamic rigid bodies. Strong impacts produce bounded recoil and influence the root body. There is no dismemberment or graphic injury rendering.
- Hidden outer, frame and abstract internal organ volumes are fictional gameplay layers. They are not medically accurate or suitable as real-world targeting or injury information. Animals at zero health remain defeated, including across saves. Forage-based food allows the whole survival loop without hunting.
- AI has species-specific awareness, vision/occlusion, nearby-event hearing, home territories, thirst, fatigue, resting, grazing, drinking, watching, contact-window attacks and retreat. Local obstacle steering is used instead of an expensive global navigation mesh; the connected terrain keeps routes accessible. Distant perception decisions are reduced in frequency. Twelve animals populate the expanded world. Animals beyond 85 units sleep until approached.
- Browser hardware and thermal conditions affect rendering speed; the fixed physics schedule is capped on very long frames, so prolonged stalls slow the game rather than cause an unstable catch-up explosion.

## Camp expansion

18 recipes include the original six and fiber cord, field wraps, water pouches, torches, stone picks, workbenches, reinforced spears, bedrolls, timber walls, rain catchers, raised decks and bridge timbers. Workbenches unlock four advanced recipes. Bedrolls set the respawn point; rain catchers fill during rainfall; smaller kits can stand on raised decks. Bridge timbers are loose, buoyant rigid bodies.

Climbing is a kinematic grip along the trunk with solid branch collision and a physical jump-off; it is not a simulated human limb rig. Grabbing applies a bounded damped spring to the actual loose rigid body, and heavier objects reduce walking speed. Airborne movement retains momentum. Original version-3 browser saves migrate in place, preserving the central layout, items and structures.

## Development and verification

```
cd wildwake
npm install
npm test
npm run build
python -m http.server 8000
```

`src/verification.js` exercises the same simulation used by the game, in isolated worlds. `tests/simulation.test.mjs` runs it in Node. Add `?verify=1` to the game URL and click **Run verification** to run the same checks in a browser. The verification does not modify the player's saved expedition.

The suite covers empty-handed gathering, crafting and resource accounting, harvesting, projectile sweeping and recovery, moving-target and bone-local lodging, storage, construction, cooking, drinking, resting, save/load, variable rendering schedules, and bounded wildlife physics on uneven ground. The expansion adds regression checks for melee damage and permanent defeat, predator aggression and attack height, moving-animal throws, climbing and dismounting, all 18 crafting transactions, usable new equipment, distant streaming and old save migration, and twelve nearby animals. The shipped bundle's 82 checks are also run in Chromium by the Verify Wildwake release workflow. Browser evidence is saved as a workflow artifact.

## Credits and licenses

All Wildwake game code, procedural geometry, interface design and synthesized audio were created for this project. Three.js is MIT licensed; Rapier is Apache-2.0 licensed. The license texts are in `vendor/`. No downloaded artwork, copyrighted game assets or generated AI images are used.

The previous Backrooms game is retained at `../backrooms.html`.
