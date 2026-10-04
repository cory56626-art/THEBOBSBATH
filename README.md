# Meridian — Open City

An original single-player 3D city game that runs entirely in the browser. No accounts, ads, paid APIs, or runtime server. The game uses procedural architecture and materials, metre-scale vehicles and people, and deterministic NPC state machines.

## Play

[Open the game on GitHub Pages](https://cory56626-art.github.io/THEBOBSBATH/). Click **Enter the city**. A desktop keyboard and mouse gives the best experience; touch controls are available on phones. A current WebGL-capable browser is required. Use **Performance** graphics in the pause menu for slower devices.

| Action | Control |
| --- | --- |
| Drive / walk | W A S D or arrow keys |
| Brake | Space |
| Exit / enter your car | E (stop the car first) |
| Sprint on foot | Shift |
| Look around | Drag the scene |
| Aim | Hold right mouse |
| Fire on foot | Left click or F |
| Reload | R |
| Camera perspective | C |
| Horn | H |
| Expand district map | M |
| Pause / resume | Escape |

Drive toward Civic Square, exit your car, and respond to the armed hostile cell. Protect civilians, clear the square, and drive away to finish the response. Afterward, explore freely. Police investigate gunfire and pursue crimes; break line of sight to lose a wanted level. Hostiles engage nearby player/officer threats. Civilians walk sidewalks and flee nearby danger. Traffic follows lane circuits and yields to obstacles. Buildings obstruct movement, sight, and gunfire.

Health regenerates slowly when threats and police alerts have cleared. Return to your car to replenish reserve ammunition. Use **Restart session** to recover from a disabled vehicle or begin a new scenario. Session state is reset on refresh; graphics and sound preferences are stored locally when browser storage is available.

## Scope

This is a compact browser prototype of a city action game, with procedural graphics and rule-based NPC AI. It has one district, one player vehicle, one scenario, and free roam. Collision is approximated with ground-plane boxes/circles; NPC driving and walking use navigation graphs and lane routes. Device/browser performance varies.

## Development

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
npm test
npm run build
```

The production build goes into `docs/` with relative asset paths for GitHub Pages project hosting. Dependencies are bundled locally; gameplay does not depend on a CDN. The source branch is `game/meridian-city` in `cory56626-art/THEBOBSBATH`.

Browser verification uses Playwright with Chromium. The optional `?debug=1` query enables controlled test scenarios; the normal URL exposes only read-only diagnostic snapshots. There are no network administration or privileged APIs.

The final production build passed all three browser flows: desktop driving, braking, walking, camera changes, shooting/reloading, pause/resume and restart; civilian panic, police pursuit/wanted escalation, building-blocked gunfire, mission completion and respawn; and phone touch controls in portrait and landscape. The browser run reported no console errors, page exceptions, or failed asset requests.

To repeat the production checks, keep the preview server running in one terminal:

```sh
npm run build
npm run preview -- --port 4173
```

Then run in another terminal:

```sh
GAME_BASE_URL=http://127.0.0.1:4173/ npm run test:e2e
```

The test configuration uses system Chromium at `/usr/bin/chromium` with software WebGL rendering. Set `CHROMIUM_PATH` to another Chromium executable if needed. For a live project page, set `GAME_BASE_URL` to its full URL with a trailing slash.

## Credits

City, actor meshes, textures, audio, interface, and simulation are authored procedurally for this project. Three.js is distributed under the MIT license; its license is included in `public/THIRD_PARTY.txt` and the published site. Vite is used to build the site. See `LICENSE` for this project's source license.
