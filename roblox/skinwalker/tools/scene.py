"""Phase 1 showcase scene: a foggy dead forest at midnight, lit by a work floodlight."""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, light, lerp, mul, norm, part, sub, v

GROUND = (36, 32, 27)
MUD = (30, 24, 19)
BARK = (40, 34, 29)
BARK_DK = (28, 24, 21)
ROCK = (62, 62, 64)
METAL = (38, 39, 42)
BLOOD = (92, 3, 5)

SPAWN = v(0, -0.4, -30)
CREATURE_CHEST = v(0, 8.2, -1.2)


def anchored(name, cf, size, color, mat, **kw):
    kw.setdefault("collide", True)
    return part(name, cf, size, color, mat, anchored=True, **kw)


def flat_disc(name, centre, diameter, color, mat="SmoothPlastic", thick=0.06, refl=0.0):
    cf = CF.along(add(centre, v(0, -thick / 2, 0)), add(centre, v(0, thick / 2, 0)))
    return anchored(name, cf, (thick, diameter, diameter), color, mat, shape="Cylinder", reflectance=refl, collide=False)


def build_scene(seed=99) -> Inst:
    rng = random.Random(seed)
    scene = Inst("Model", "Showcase")

    scene.add(anchored("Ground", CF(v(0, -1, 0)), (512, 2, 512), GROUND, "Ground"))
    for _ in range(9):
        c = v(rng.uniform(-9, 9), -0.42, rng.uniform(-9, 7))
        scene.add(anchored("Mud", CF.angles(0, rng.uniform(0, math.pi), 0, c),
                           (rng.uniform(4, 9), 1, rng.uniform(3, 7)), MUD, "Mud", ellipsoid=True))

    # ---- blood (medium): one pool under the jaw plus a few splatters
    scene.add(flat_disc("BloodPool", v(0.3, 0.06, -3.6), 2.6, BLOOD, refl=0.3))
    scene.add(flat_disc("BloodPool", v(1.1, 0.06, -2.7), 1.5, BLOOD, refl=0.3))
    for _ in range(9):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(1.5, 4.5)
        scene.add(flat_disc("BloodSplat", v(math.cos(a) * r, 0.05, -3.2 + math.sin(a) * r),
                            rng.uniform(0.2, 0.6), BLOOD, refl=0.25))

    # ---- dead trees in a loose ring, leaving the view from the spawn open
    placed = 0
    while placed < 22:
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(14, 60)
        x, z = math.cos(a) * r, math.sin(a) * r
        if z < -6 and abs(x) < 10:  # keep the sightline clear
            continue
        scene.add(dead_tree(rng, v(x, 0, z)))
        placed += 1
    for _ in range(10):
        c = v(rng.uniform(-30, 30), 0.2, rng.uniform(-25, 30))
        s = rng.uniform(1.2, 3.5)
        scene.add(anchored("Rock", CF.angles(rng.uniform(-0.3, 0.3), rng.uniform(0, 3), 0, c),
                           (s * 1.4, s * 0.8, s), ROCK, "Slate", ellipsoid=True))

    scene.add(floodlight(v(-9, 0, -7), CREATURE_CHEST))

    # cold rim light from behind so the silhouette and tendrils read in the fog
    rim = anchored("RimLight", CF.look(v(4, 15, 13), sub(CREATURE_CHEST, v(4, 15, 13))), (1, 1, 1), (0, 0, 0),
                   "SmoothPlastic", transparency=1, collide=False, shadow=False, query=False)
    rim.meta["hidden"] = True
    rim.add(light("SpotLight", "Rim", brightness=3.5, range_=32, color=(130, 155, 255), angle=55, face="Front"))
    scene.add(rim)

    spawn = Inst("SpawnLocation", "Spawn")
    sp = anchored("Spawn", CF.look(SPAWN, v(0, 0, 1)), (6, 1, 6), GROUND, "Ground", transparency=1)
    spawn.props.update(sp.props)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    scene.add(spawn)
    return scene


def dead_tree(rng, base):
    tree = Inst("Model", "DeadTree")
    h = rng.uniform(14, 26)
    lean = v(rng.uniform(-0.12, 0.12), 1, rng.uniform(-0.12, 0.12))
    top = add(base, mul(norm(lean), h))
    d = rng.uniform(0.9, 1.6)
    tree.add(anchored("Trunk", CF.along(add(base, v(0, -0.5, 0)), top), (h, d, d), BARK, "Wood", shape="Cylinder"))
    for _ in range(rng.randint(3, 6)):
        start = lerp(base, top, rng.uniform(0.45, 0.95))
        a = rng.uniform(0, 2 * math.pi)
        out = norm(v(math.cos(a), rng.uniform(0.3, 1.0), math.sin(a)))
        ln = rng.uniform(3, 7)
        end = add(start, mul(out, ln))
        bd = d * rng.uniform(0.3, 0.45)
        tree.add(anchored("Branch", CF.along(start, end), (ln, bd, bd), BARK_DK, "Wood", shape="Cylinder", collide=False))
        for _ in range(rng.randint(1, 3)):
            s2 = lerp(start, end, rng.uniform(0.4, 0.9))
            a2 = rng.uniform(0, 2 * math.pi)
            e2 = add(s2, mul(norm(v(math.cos(a2), rng.uniform(0.0, 1.2), math.sin(a2))), rng.uniform(1.5, 3.5)))
            tree.add(anchored("Twig", CF.along(s2, e2), (_dist(s2, e2), bd * 0.5, bd * 0.5), BARK_DK, "Wood",
                              shape="Cylinder", collide=False))
    return tree


def _dist(a, b):
    d = sub(b, a)
    return math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)


def floodlight(base, target):
    """Work light on a tripod, like a search team left it behind."""
    m = Inst("Model", "Floodlight")
    head = add(base, v(0, 5.6, 0))
    aim = norm(sub(target, head))
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.4
        foot = add(base, v(math.cos(a) * 2.0, 0, math.sin(a) * 2.0))
        m.add(anchored("Leg", CF.along(foot, add(head, v(0, -0.6, 0))), (_dist(foot, head), 0.16, 0.16), METAL, "Metal",
                       shape="Cylinder"))
    m.add(anchored("Pole", CF.along(add(head, v(0, -1.2, 0)), head), (1.2, 0.22, 0.22), METAL, "Metal", shape="Cylinder"))
    back = sub(head, mul(aim, 0.7))
    front = add(head, mul(aim, 0.7))
    m.add(anchored("Housing", CF.along(back, front), (1.4, 2.0, 2.0), METAL, "Metal", shape="Cylinder"))
    lens_a, lens_b = front, add(front, mul(aim, 0.08))
    lens = anchored("Lens", CF.along(lens_a, lens_b), (0.08, 1.75, 1.75), (225, 235, 255), "Neon",
                    shape="Cylinder", collide=False)
    lens.add(light("SpotLight", "Beam", brightness=9, range_=46, color=(215, 228, 255), angle=48,
                   shadows=True, face="Right"))
    m.add(lens)
    for k in range(-2, 3):  # protective grille bars
        off = mul(norm((aim[2], 0, -aim[0])), k * 0.32)
        a2 = add(add(front, mul(aim, 0.12)), add(off, v(0, -0.85, 0)))
        b2 = add(add(front, mul(aim, 0.12)), add(off, v(0, 0.85, 0)))
        m.add(anchored("Grille", CF.along(a2, b2), (1.7, 0.06, 0.06), METAL, "Metal", shape="Cylinder", collide=False))
    # cable to a little generator with a red status light
    gen = add(base, v(-3.5, 0.6, -2.5))
    m.add(anchored("Generator", CF.angles(0, 0.5, 0, gen), (2.2, 1.2, 1.4), (70, 62, 30), "Metal"))
    led = anchored("StatusLight", CF(add(gen, v(0, 0.65, 0))), (0.15, 0.15, 0.15), (255, 40, 30), "Neon",
                   shape="Ball", collide=False)
    led.add(light("PointLight", "Glow", brightness=1.2, range_=5, color=(255, 50, 40)))
    m.add(led)
    pts = [add(gen, v(0.8, -0.5, 0.3)), add(base, v(-1.8, 0.08, -0.8)), add(base, v(-0.4, 0.08, 0.3)), add(base, v(0, 0.6, 0))]
    for i in range(len(pts) - 1):
        m.add(anchored("Cable", CF.along(pts[i], pts[i + 1]), (_dist(pts[i], pts[i + 1]), 0.1, 0.1), (15, 15, 15),
                       "SmoothPlastic", shape="Cylinder", collide=False))
    return m
