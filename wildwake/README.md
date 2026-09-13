# Wildwake

A complete compact single-player survival game in Glasswater Valley. Original procedural 3D environment and skinned wildlife; no AI-generated images or external asset requests. Runs from a static GitHub Pages directory. The bundled release includes all JavaScript and the Rapier WebAssembly runtime.

## Playing

Open `wildwake/index.html` through HTTP or GitHub Pages. Start empty-handed, gather the objects around the clearing, craft a hatchet, harvest trees, make a spear, practice at the old range, build camp, cook, and rest through the night. Explore the stone arch and lantern grove for hidden caches. The jaguar and chimpanzee are territorial; deer graze and retreat.

WASD move, mouse look, Shift sprint, Space jump, C crouch, E interact, I or Tab inventory, B crafting, 1–8 hotbar, Q drop, F eat, R rotate placement, X dismantle, F5 save, Escape pause. Hold left mouse to charge an equipped spear; release to throw. Right mouse cancels. Touch controls include a movement joystick, drag-to-look, action, interact, sprint, crouch and jump.

Settings: sensitivity, volume, graphics, touch mode. Saves and autosaves use browser local storage and remain on that device/browser. The whole world pauses in inventory/settings and when backgrounded. Interacting with a camp structure allows time and cooking to continue.

## Physics and intentional approximations

- Three.js 0.186.0 and Rapier 3D 0.20.0, pinned and bundled. 60 Hz fixed physics; 8 solver iterations, 4 CCD substeps, additional solver iterations on constrained structures, collision groups, sleeping loose bodies, and a cap of 180 recoverable loose stacks.
- All trees, rocks, targets, structural frames and terrain have collision volumes. Grass and small ferns are flexible visual foliage. Terrain uses a 1-unit triangle grid; terrain cannot be excavated and trees are harvested as a whole resource node rather than a full falling tree simulation.
- Loose objects have mass, friction, restitution, angular motion and gravity. Timber is buoyant, dense stones sink. Water is a simplified drag/buoyancy volume rather than fluid simulation. Loose building timbers fall; shelter roofs use a fixed Rapier constraint to their anchored frame.
- Spear flight is a rigid body with CCD plus five swept shaft-radius ray paths per physics step. Contact angle and fictional material properties distinguish lodging and deflection. Hits on animals additionally test bone-local ellipsoids along the actual path; resistance is deducted in intersection order. No random critical-hit rolls. A spear attached to an animated bone or moving target is stored in the local coordinate frame and follows its translation and rotation.
- Animal locomotion is **hybrid**, not a fully free active ragdoll: a stabilized, upright dynamic body receives steering forces and collision impulses. A skinned procedural mesh has articulated joint-limited bones, distance-driven stepping and two-segment terrain foot IK. Anatomical and limb colliders are animated sensor volumes; the core capsule handles solid contacts. Limbs do not have individually simulated muscles or separate dynamic rigid bodies. Strong impacts produce bounded recoil and influence the root body. There is no dismemberment or graphic injury rendering.
- Hidden outer, frame and abstract internal organ volumes are fictional gameplay layers. They are not medically accurate or suitable as real-world targeting or injury information. Wildlife eventually recovers from incapacitation. Forage-based food allows the whole survival loop without hunting.
- AI has species-specific awareness, vision/occlusion, nearby-event hearing, home territories, thirst, fatigue, resting, grazing, drinking, watching, contact-window attacks and retreat. Local obstacle steering is used instead of an expensive global navigation mesh; the compact terrain layout keeps routes connected. Distant perception decisions are reduced in frequency. Five animals are simulated by default.
- Browser hardware and thermal conditions affect rendering speed; the fixed physics schedule is capped on very long frames, so prolonged stalls slow the game rather than cause an unstable catch-up explosion.

## Development and verification

```
cd wildwake
npm install
npm test
npm run build
python -m http.server 8000
```

`src/verification.js` exercises the same simulation used by the game, in isolated worlds. `tests/simulation.test.mjs` runs it in Node. Add `?verify=1` to the game URL and click **Run verification** to run the same checks in a browser. The verification does not modify the player's saved expedition.

The suite covers empty-handed gathering, crafting and resource accounting, harvesting, projectile sweeping and recovery, moving-target and bone-local lodging, storage, construction, cooking, drinking, resting, save/load, variable rendering schedules, and bounded wildlife physics on uneven ground. A non-graphic first-person play check is also performed against GitHub Pages before final delivery.

## Credits and licenses

All Wildwake game code, procedural geometry, interface design and synthesized audio were created for this project. Three.js is MIT licensed; Rapier is Apache-2.0 licensed. The license texts are in `vendor/`. No downloaded artwork, copyrighted game assets or generated AI images are used.

The previous Backrooms game is retained at `../backrooms.html`.
