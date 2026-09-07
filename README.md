# Last Stand 3D

A fully playable 3D zombie tower-defense game that runs in the browser.

**Play:** https://cory56626-art.github.io/THEBOBSBATH/

## Game modes

| Mode | Waves | Base health | Balance |
|---|---:|---:|---|
| Casual | 12 | 30 | More starting cash, slower zombies, better rewards |
| Intermediate | 16 | 20 | Standard health, speed, cash, and rewards |
| Hard | 20 | 12 | Stronger and faster hordes with less cash |

## Towers

- **Ranger** — fast attacks and long range.
- **Cannon** — heavy splash damage against groups.
- **Cryo** — damages and slows zombies.

Every tower has three levels and can be upgraded or sold. Enemies include
Walkers, Runners, Brutes, Armored zombies, and a final Titan.

## Controls

- Tap or click a tower, then tap a glowing build pad.
- Tap a placed tower to upgrade or sell it.
- Drag to rotate the camera and pinch or scroll to zoom.
- Use the on-screen camera buttons to rotate or reset the view.
- Keyboard: `1`, `2`, `3` select towers; `Enter` starts a wave; `Space` pauses.

## Tech

The game is a static site built with HTML, CSS, JavaScript, and Three.js. There
is no build step. If WebGL is unavailable, the game automatically switches to a
fully playable Canvas 2D version with the same modes, towers, enemies, waves,
upgrades, and economy. GitHub Actions publishes the `main` branch to GitHub Pages.

## Local development

Serve the repository with any static server and open it in a modern browser.
ES modules will not run correctly if `index.html` is opened directly as a
`file://` URL.
