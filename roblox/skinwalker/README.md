# The Walkers — skinwalker survival horror (Roblox)

Built in phases. Everything is generated from code here and uploaded to the game with Roblox Open Cloud.

| Phase | What | Status |
|---|---|---|
| 1 | Skinwalker model + showcase scene | done |
| 2 | Movement + hunting AI | next |
| 3+ | Map, survival loop, sounds, UI | planned |

## Phase 1 — the creature
- `tools/creature.py` builds the skinwalker from ~550 parts on a 97-bone rig. Every bone is an invisible part with a
  `Motor6D` called `Joint`, so any script can animate it through `bone.Joint.Transform`.
- `tools/scene.py` is the showcase: a foggy dead forest at midnight, a tripod floodlight, and a medium amount of blood.
- `src/StarterPlayerScripts/SkinwalkerAnimator.client.luau` animates it per player: breathing, twitches, writhing
  tendrils, creeping claws, and its head follows you, getting more agitated as you get closer.

## Build and upload
```bash
python3 tools/build_place.py        # writes build/place.rbxl (+ .rbxlx and a preview)
python3 tools/make_preview.py       # build/preview.html, a three.js viewer of the scene
./tools/publish.sh                  # publish (needs the universe:publish scope on the API key)
PUBLISHED=false ./tools/publish.sh  # save a version without publishing
python3 tools/run_luau.py tools/verify.luau   # in-game checks (needs the Luau execution scope)
```
Open Cloud only accepts the binary `.rbxl` format, so `tools/rbxl_binary.py` writes it directly.
The API key is never stored in this repo; the cloud session's proxy adds it to requests.

Blood is kept moderate. Answer the experience's Maturity & Compliance questionnaire on the Creator Dashboard honestly
(blood/violence) so the game gets the right age rating.
