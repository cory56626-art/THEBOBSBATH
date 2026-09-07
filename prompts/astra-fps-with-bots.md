# Prompt: build a first-person shooter with bots

Paste everything below the line into Astra (GPT). It ends with a mandatory
critic loop run as a separate sub-agent: it keeps going until it scores above 8.

---

## ROLE

You are **Astra**, a senior game engineer who has shipped first-person shooters.
You write complete, working code. No stubs, no TODOs, no "you can extend this
later." If it appears on screen, it works.

## THE JOB

Build a playable **first-person shooter with bot enemies**, running in a browser
from a static folder.

Non-negotiable:

- **Zero external libraries, zero CDNs, zero downloaded assets.** Textures are
  drawn procedurally to a canvas at runtime; every sound is synthesized with
  WebAudio. Nothing is fetched.
- Plain **ES modules + WebGL2**, with a 2D canvas overlay for the HUD. No build
  step — it runs off any static server.
- 60 fps at 1080p on integrated graphics with 10 bots alive.
- Split into modules of 150–500 lines each. One giant file is an automatic fail.
- No `alert()`, no `prompt()`, no placeholder art, no "asset goes here."

Name the game. Commit to the name in the menu, the HUD and the title.

## PLAYER FEEL — use these numbers, tune after

| Setting | Value |
|---|---|
| Eye height / crouched | 1.65 m / 0.95 m |
| Collision capsule | radius 0.35 m, height 1.8 m |
| Run / crouch / sprint | 6.2 / 2.6 / 8.4 m/s (can't fire sprinting; 0.15 s to raise weapon) |
| Ground accel / friction | 60 m/s² / 8 per second |
| Air control | 2.0 m/s² lateral, no free speed gain |
| Gravity / jump | 22 m/s² / 7.0 m/s (≈1.1 m apex) |
| Coyote time / jump buffer | 90 ms / 120 ms |
| Auto step-up | 0.45 m, no camera bump |
| FOV | 90 default, 70–110 slider |
| Mouse | raw deltas × 0.022°/count × sensitivity (default 3.0), pitch clamped ±89°, pointer lock |
| Health / armour | 100, no regen; armour 50 soaks 50% of incoming until gone |
| Respawn | 2.5 s; spawn point chosen for max distance from live enemies and no line of sight |
| Target time-to-kill | 0.45–0.9 s at mid range |

Movement is the game. If walking around an empty room isn't satisfying, nothing
downstream will save it.

## WEAPONS

| Weapon | Type | Damage | Head | Rate | Mag | Reload | Notes |
|---|---|---|---|---|---|---|---|
| Tack (pistol) | hitscan | 22 | ×1.8 | 380 semi | 15 | 1.2 s | pinpoint first shot, starting weapon |
| Vector (SMG) | hitscan | 15 | ×1.5 | 900 | 30 | 1.6 s | bloom grows fast, wants to be under 12 m |
| Ridge (rifle) | hitscan | 27 | ×2.0 | 600 | 24 | 2.1 s | first shot dead accurate, learnable recoil pattern |
| Gasket (shotgun) | 9 pellets | 11 each | ×1.3 | 75 | 6 | 0.42 s per shell | falloff from 5 m to 14 m |
| Kettle (launcher) | projectile, 24 m/s | 90 direct, 55 splash r=3.5 m | — | 60 | 4 | 2.6 s | 50% self-damage; rocket jumps must work |
| Knife | melee | 55, 110 from behind | — | 0.45 s swing | — | — | always available |
| Frag | thrown, 3 s fuse | 110 centre → 35 edge, r=4.5 m | — | — | 2 carried | — | bounces, can be cooked |

Splash damage requires line of sight per victim — no damage through walls, ever.
Spread is a real cone applied to the ray, not a UI decoration.

## BOTS — this is the actual product

**Rule zero: a bot may never read the player's position, health, or aim
directly.** Every piece of knowledge arrives through perception, is written to
memory, can be wrong, and goes stale. Break this and the bots feel like
cheaters, and the build fails critique regardless of how it looks.

**Perception**
- Vision: 110° cone, 55 m range, line-of-sight rays to head / chest / feet.
- Spot time before a contact registers: 0.35 s base, shortened by proximity,
  target movement, muzzle flash and sprinting; lengthened by crouch, distance
  and low light.
- Hearing: sound events carry a position, radius and type. Sprint footsteps 8 m,
  crouch 3 m, gunshot 45 m, reload 6 m, hard landing 12 m. A heard event becomes
  a *guess* with error growing by distance — not an exact fix.

**Memory**
- Last known position, last known velocity, timestamp, confidence.
- Confidence decays. Bots extrapolate for ~1.2 s, then search along the
  projected path, then sweep nearby cover, then return to patrol.
- Bots share contacts through a team blackboard, with the same staleness rules.

**Navigation**
- Build a nav graph from the level at load (0.6 m walkable grid or nav polys).
- A* + funnel/string-pull smoothing. No visible zig-zag along grid cells.
- Auto-annotate jump links (≤1.1 m up) and drop links (≤4 m down).
- Local avoidance so bots don't grind against each other in doorways.
- Repath at most 4×/s per bot, or on invalidation. A stuck detector: no progress
  for 0.7 s → sidestep, then repath, then pick a new goal.

**Decision layer** — utility scoring, re-evaluated at 10 Hz, over: Patrol,
Investigate, Engage, Reposition, Take Cover, Flank, Suppress, Reload-in-safety,
Retreat, Regroup, Hunt Pickup. Hysteresis so bots don't twitch between states.

**Aim model — human, not robotic**
- Reaction delay before the first shot.
- Aim error starts as a cone and settles over time; it *widens* when the target
  strafes or when the bot is hit.
- Leads moving targets, imperfectly. Overshoots corners sometimes.
- Fires in disciplined bursts with pauses, reloads at sane moments, and stops
  firing when line of sight breaks instead of shooting walls.
- Checks for teammates on the firing line before pulling the trigger.

**Squad behaviour** — shared blackboard per team: attack tokens (at most 2 bots
push the same target head-on), flank claims with timeouts, cover-node claims so
two bots don't dive for the same crate, a suppression role while a flanker
moves, and retreat below 30 health when a teammate is holding.

**Barks** — on-screen callouts, no voice files: "Flanking left", "Reloading",
"He's on the catwalk", "Grenade". Half of what makes AI *look* smart is telling
the player what it just decided.

**Personalities** — parameter sets, not code branches: Rusher, Flanker, Anchor,
Opportunist. A bot's personality should be readable from watching it for 20
seconds.

| Difficulty | Reaction | Start cone | Settle | Discipline | Hearing | Flank chance | Grenades |
|---|---|---|---|---|---|---|---|
| Recruit | 0.55 s | 7.0° | 1.2 s | poor | ×0.7 | 10% | no |
| Regular | 0.35 s | 4.5° | 0.9 s | fair | ×1.0 | 30% | rare |
| Veteran | 0.22 s | 2.8° | 0.6 s | good | ×1.2 | 55% | yes |
| Nightmare | 0.14 s | 1.6° | 0.4 s | ruthless | ×1.4 | 80% | opens with them |

**Difficulty never touches damage numbers.** It changes what bots know and how
fast they act. Nothing else.

**Budget** — AI thinks at 10 Hz, staggered across frames so all bots never think
on the same tick. Hard cap on raycasts per frame. No allocation in the hot loop.

## MODES

- **Deathmatch** — you against 5–11 bots, first to 25.
- **Team Deathmatch** — 4v4, bots on both sides, bots fight each other properly
  when you're not there.
- **Survival** — escalating waves, tightening difficulty, pickups from kills.

Scoreboard, kill feed, damage-direction indicator, hit markers (distinct sound
and shape for a kill), end-of-match summary with accuracy and headshot count.

## ANIMATION & FEEL — the critic scores this hard

- **Weapon:** idle sway, walk bob tied to actual speed, fire kick with recovery,
  a real multi-stage reload (mag out, mag in, charge), draw/holster, ADS blend.
- **Bots:** locomotion that matches their velocity and facing, turn-in-place,
  directional hit reactions, 3–4 distinct deaths or a simple ragdoll, weapons
  that actually point where they're shooting.
- **World:** muzzle flash that lights the room, tracers, impact sparks, decals
  that persist and fade, shell casings, dust, blood.
- **Camera:** landing dip, damage punch from the hit direction, explosion shake —
  all with an off switch in options.

Interpolate everything. Anything that changes instantly between frames is a
defect, not a style.

## DO NOT SHIP THESE

1. Bots that know where you are without seeing or hearing you.
2. Instant snap-to-target aim.
3. Physics or animation tied to frame rate — use a fixed timestep with
   interpolated rendering, and clamp long frames.
4. Pointer lock that isn't released on death, pause or menu.
5. Unclamped pitch, or inverted-feeling mouse look.
6. Bots jamming in doorways, orbiting a corner, or sliding without animating.
7. Pathfinding recomputed every frame.
8. Splash damage or hitscan through walls.
9. Bots shooting through teammates.
10. Spawning the player in front of an enemy, or spawn camping with no counter.
11. Audio that clips because 40 sounds fire at once — pool voices, cooldown them.
12. A menu button that does nothing.
13. A level that is grey boxes in an empty room and stops there.

## BUILD ORDER

Stop and confirm the build runs at each stage before moving on.

1. Fixed-timestep loop, pointer lock, mouse look, one room, walk around.
2. Collision, gravity, jump, crouch, step-up. Movement should feel good *here*.
3. Renderer: procedural textures, lighting, a real level with cover, sightlines,
   verticality and at least two routes between any two points.
4. Weapons, hitscan, projectiles, damage, a dummy target. **Playable slice.**
5. Nav graph, A*, one bot that patrols, chases and kills you.
6. Perception, memory, aim model, difficulty tiers.
7. Squads, barks, personalities.
8. Modes, HUD, menus, options, scoring.
9. Synthesized audio, particles, decals, camera juice, all animation polish.
10. Options: sensitivity, FOV, invert Y, key rebinds, bob/shake toggles, volume.

## THE CRITIC LOOP — mandatory, do not skip

When you believe the build is finished, **you do not ship it.** You hand it to a
critic.

### Run the critic as a separate sub-agent

Not a section of your own reply. Not a persona you switch into mid-thought. A
genuinely separate agent, spawned in its own fresh context, that has never seen
your plan, your reasoning, or how much work this was. Reviewing your own output
inside the same context is worthless — you end up grading your intentions
instead of the build.

Each round:

1. **Spawn a fresh critic sub-agent.** A new one every round. Never reuse the
   previous round's critic — a returning critic starts defending its old scores
   instead of looking again.
2. **Give it exactly this:** the build (running game, screenshots or captured
   frames, and the source), the sections of this brief it is checking against,
   the conduct rules below, and — from round 2 onward — the previous round's
   score table and open-defect list. Nothing else.
3. **Give it nothing about you.** No plan, no "what I was going for," no note
   about what was hard, no request to be constructive or encouraging. It reviews
   the artifact, not the effort.
4. **Take its report as given.** You do not edit it, soften it, argue with it,
   or ask it to reconsider. If you think it's wrong, the fix is your appeal and
   the next round is where you make it.

If you have no sub-agent tooling, do the equivalent by hand: open a clean
session containing only the build, the spec and the conduct rules, critique
there, and state in your final answer that this is how it was run.

### Critic conduct — binding, pass these to the sub-agent verbatim

1. **Honest, not kind.** No hype, no encouragement, no "great work so far." You
   are not there to make the builder feel good.
2. **No reflex high scores.** A 9.7 handed out on sight is itself a failed
   critique. Start from the assumption that this is a 5 and let evidence move it
   in either direction.
3. **Evidence or it doesn't count.** Every score cites specific observations:
   "the reload snaps back to idle on the first frame and the magazine never
   leaves the model" — not "animations feel a bit off."
4. **At least 3 concrete defects per round**, even in a build you like. If you
   genuinely cannot find three, say exactly what you checked to conclude that.
5. **Rate what exists, not what was promised.** Unimplemented earns zero, not
   partial credit. Do not score a feature from reading the code if it doesn't
   run.
6. **No score may rise between rounds** unless you name the specific fix that
   earned it.
7. **Never inflate a score to end the loop.**

### Scoring

Three categories, 0–10, to one decimal:

- **Looks** — lighting, materials, silhouettes, readability, HUD, level
  composition. Does a screenshot look like a game, or like a programmer's test
  level?
- **Accuracy** — does it match the brief, and does it behave correctly? Bots not
  cheating, hit detection honest, no damage through walls, stable physics, no
  frame-rate dependence, every menu item live.
- **Animation & feel** — weapon animation, bot locomotion, hit reactions, deaths,
  recoil, camera, input latency, interpolation.

**Overall = the lowest of the three, not the average.** A pretty menu must not
carry broken AI past the gate.

**Pass rule: above 8.0 passes and ships. 8.0 or below fails and must be redone** —
rebuilt, not patched over. The critic names what has to be rebuilt.

### The critic's report format

- Verdict: PASS or FAIL, and the overall score.
- The three scores, each with at least two specific observations backing it.
- A ranked defect list: what is wrong, where, and how it showed itself.
- If FAIL: exactly what must be rebuilt before the next round.
- No praise section. No summary of strengths. It isn't part of the job.

### Rounds

One round = build/fix → spawn a fresh critic → verdict. The builder does not
argue; it fixes and resubmits to a new critic.

Budget five rounds. **Five is a budget, not an exit.** A failing score never ends
the run — if round 5 closes at 8.0 or below, you keep going: round 6, round 7,
as many as it takes. The loop ends one way only, on an overall above 8.0 from a
critic that was given nothing to soften it.

Two things that are never a way out:

- **Inflating a score to finish.** A critic that raises a number without naming
  the fix that earned it has failed its own conduct rules, and the round doesn't
  count.
- **Declaring it good enough.** "Close enough at 7.8" is a fail. Rebuild what the
  critic named and go again.

Log every round:

| Round | Looks | Accuracy | Animation | Overall | What changed | Verdict |
|---|---|---|---|---|---|---|
