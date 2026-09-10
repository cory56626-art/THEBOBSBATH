# STILL HERE — Backrooms Survival

**Play:** https://cory56626-art.github.io/THEBOBSBATH/

A first-person, fully 3D survival game for desktop and touch devices. Scavenge during the day, build a shelter, and survive increasingly dangerous nights.

- 130 × 130 meter seeded maze with loops, furniture, textured walls, ceiling fixtures, and five secret areas: the chair assembly, pool annex, records office, conservatory, and replica home.
- Food, water, stamina, healing, scavenging, jump, sprint, flashlight, shove, recoverable downed teammates, and supply restocks at dawn.
- Place, rotate, and dismantle barricades and work lights. Entities break barricades and slow near lights.
- Stalkers, light-sensitive Watchers, and Still Lifes: distorted copies of player avatars that echo recent radio messages.
- Three optional tactical bots: Mira (scout), Dex (builder), and Sol (medic). They navigate, gather and share supplies, build, heal, rescue, and follow natural-language survival commands. Their contextual dialogue is local and rule-based, not a remotely hosted language model. Optional spoken replies use browser speech synthesis.
- Private, host-authoritative multiplayer for up to four human players plus three bots. Invite codes and links, late joining, synchronized supplies, building, chat, characters, enemies, and day/night state. PeerJS Cloud supplies signaling; WebRTC carries game data. No account or API key is needed. The host must keep the game open. Restrictive networks or signaling outages may prevent internet connections; same-device tabs can connect through BroadcastChannel.
- Three difficulty settings, touch joystick and look controls, graphics/audio settings, a field map, and local personal records.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move / look | WASD / mouse (or drag) | Left joystick / drag right side |
| Sprint / jump | Shift / Space | RUN / JUMP |
| Collect / revive | E | USE |
| Shove | Left click | PUSH |
| Food / water / medkit | 1 / 2 / 3 | Inventory buttons |
| Flashlight | F | Light button |
| Build / rotate / dismantle | B / R / X | Build / Rotate / dismantle button |
| Team radio / map | T / M | Radio / Map |
| Pause | Escape | Pause button |

## Running and development

All runtime files are static and included in this repository. Serve the repository root with any HTTP server, for example `python3 -m http.server 8080`. GitHub Actions publishes `main` to GitHub Pages. No build step is needed.

Code lives in `backrooms/`: `world.js` generates the collision map and navigation grid; `sim.js` owns game rules and bot planning; `models.js` constructs all 3D geometry; `network.js` manages lobbies and connections; `game.js` renders the game and handles input/UI. Vendor libraries are pinned and included with their licenses.

The previous painting app remains at [paint.html](paint.html).

## References

The survival loop is inspired by [3008 by uglyburger0](https://www.roblox.com/games/2768379856/3008). The fictional setting and distorted-copy idea are inspired by the Backrooms and Kane Pixels’ work, including [Backrooms — Found Footage #3](https://www.youtube.com/watch?v=acdYs9tPLko). Still Life behavior here is an original gameplay adaptation, not a claim about definitive canon. This is an unofficial fan game with original procedural geometry and audio; it does not include film footage or Roblox assets.

[Three.js](https://threejs.org/) and [PeerJS](https://peerjs.com/) are MIT licensed. See `backrooms/vendor/LICENSES.txt`.
