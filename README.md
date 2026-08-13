# Bob's Bath — Ball Battle Simulator

A browser ball-battle simulator, the kind that fills TikTok and Shorts: give each
ball a **weapon** and an **ability**, press start, and watch them fight until one
is left. Every hit makes the winner's weapon bigger, so a match that opens with
polite little taps ends with enormous blades and screen-filling explosions.

Runs entirely client-side — vanilla JS, Canvas 2D, ES modules, **zero
dependencies and zero asset files**. Every sprite, particle and sound is
generated at runtime.

![status](https://img.shields.io/badge/status-playable-4ecdc4)

---

## Quick start

It's a static site, so it just needs to be served over HTTP (ES modules don't
load from `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works — `npx http-server`, `php -S`, VS Code Live Server.

---

## How a battle works

Balls hold a **constant speed and never stop**, bouncing off the walls and off
each other. They carry a light drift toward the nearest enemy — or toward a
health drop when they're hurt — but it is deliberately weak: crank it up and
every ball converges on the middle of the arena and hovers there, which looks
nothing like the genre. When a weapon connects it
deals damage **and levels up**: more reach, more damage, faster fire. That
escalation is the whole shape of the genre. Early hits chip; late hits delete.

Damage also fills a **super meter**. When it tops out the ball automatically
unleashes its ability's super. Last ball alive wins.

### Sudden death

Two healing balls can circle each other forever, which is fatal for a short
video. From **30 seconds** onward:

- all damage ramps up, to a maximum of **4×**
- healing fades to **zero**
- health drops stop spawning
- **the walls close in**, down to 42% of the cage

No match can outlive it. Measured across simulated battles at 2, 4 and 8
fighters: **zero stalemates**, longest fight 62s, median 31–34s.

---

## Weapons

| Weapon | Behaviour |
| --- | --- |
| **Sword** | Long blade sweeping around the ball. Big reach, big growth. |
| **Dagger** | Short and very fast. Weak per hit, escalates quickest. |
| **Flail** | Chained head on a real pendulum constraint — swings unpredictably, hits hardest. |
| **Orbital** | Shards circling the ball. Every third hit adds another shard. |
| **Blaster** | Fires tracking bolts at the nearest enemy. |
| **Shotgun** | Slow spread of pellets, plus recoil that shoves the shooter around. |
| **Laser** | Charges with a visible targeting line, then burns a beam across the arena. |
| **Spikes** | No weapon — the ball itself damages anything it touches. |
| **Portal Gun** | Fires a portal where it's headed, dives through, and bursts out somewhere far away — glowing hot, and anything it touches on the way out takes the slam. |

## Abilities

| Ability | Effect |
| --- | --- |
| **Vampire** | Heals for 45% of all damage dealt. |
| **Shield** | Rotating barrier absorbs 70% of each hit, rebuilds between them. |
| **Regen** | Steadily heals. Wins wars of attrition. |
| **Toxic** | Hits apply stacking poison that keeps ticking. |
| **Berserk** | Damage scales up as health drops — up to double. |
| **Bomb** | Detonates on death, often taking the killer with it. |
| **Ghost** | 24% chance to phase through an incoming hit. |
| **Titan** | +60% health and mass, but noticeably slower. |
| **None** | No tricks, no downsides. |

---

## Recording

**Record** captures the canvas with `MediaRecorder` at its native **1080×1920**
and mixes in the synth audio, then downloads the file. No screen-recording
software and no cropping — the output is already the right shape for TikTok,
Reels and Shorts. MP4 where the browser supports it, WebM otherwise.

The **on-screen hook** field draws a line like *"Who wins?"* across the top of
the frame, which is the convention that makes these videos work.

---

## Settings

Ball speed, starting HP, aggression, and pickup rate are sliders. Toggles cover
health/power drops, supers, HP-size mode (radius tracks remaining health),
motion trails, damage numbers, and sound. Fighters can be added up to 8, removed
down to 2, renamed, recoloured, and randomised.

---

## Balance

Weapons and abilities were tuned against a headless harness that runs the real
`World` simulation with no canvas, thousands of matches at a time. The first
pass was badly skewed — shotgun won **96%** of duels while sword won **9%** —
and two structural bugs turned up that no amount of number-tweaking would have
fixed:

- **Shields absorbed 100% of every hit** and regenerated, so any ball whose
  incoming damage was slower than its regen was literally unkillable. Capping
  absorption at 70% guarantees damage always leaks through.
- **Two balls accelerating toward each other at constant speed don't collide** —
  they settle into a stable mutual orbit at radius `v²/a` (~210px), circling
  just outside weapon reach indefinitely. Contact rate was 0.73 hits/sec in
  duels versus 6.8 with eight balls, and 43% of duels never resolved. Steering
  now bleeds off sideways velocity at range, turning that orbit into a closing
  spiral.

After tuning, all weapons land in a tight duel win-rate band, and every one of
the nine wins matches at every roster size.

The Portal Gun's look follows the show: a metal-grey body with a glowing green
vial on top, firing an opaque green swirling vortex with lighter yellow-green
"goo" flecks.

---

## Project structure

```
index.html          markup + setup panel
css/styles.css      theme + responsive layout
js/
  config.js         tunables, arena sizing, sudden-death constants
  utils.js          math helpers
  world.js          simulation: physics, hit resolution, damage, win state
  ball.js           fighter entity, health, rendering
  weapons.js        the nine weapons
  abilities.js      the nine abilities + status ticks
  fx.js             particles, damage numbers, shake, kill feed
  audio.js          WebAudio synth (pentatonic, so hits sound musical)
  render.js         all canvas drawing
  ui.js             roster editor + settings
  recorder.js       canvas + audio video capture
  main.js           entry point and fixed-timestep loop
```

`window.__battle` is exposed as a test hook (`world`, `ui`, `recorder`,
`SETTINGS`, `Sound`).

---

## Deploying to GitHub Pages

`.github/workflows/pages.yml` publishes the repo root on every push. Enable it
once at **Settings → Pages → Build and deployment → GitHub Actions**, and the
live URL appears after the first run.
