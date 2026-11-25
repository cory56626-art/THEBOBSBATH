"""Steal a Storm: the map. 8 bases along the south edge, a road, then the wild in three zones going north:
Drizzle Meadow (green), Thunder Plains (dry gold) and the Eye of the Storm (dark, with a giant vortex overhead).

build_room() -> (map Model, [extra workspace instances]). The server reads plots from workspace.Plots.
"""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, light, part, v

PLOT_COUNT = 8
PLOT_W, PLOT_D = 40, 40
PLOT_Z = -26  # plot centre z (front edge at z = -6, facing north / +Z)
PLOT_X0, PLOT_STEP = -154, 44
PLOT_COLORS = [(120, 190, 255), (255, 150, 150), (150, 230, 150), (255, 210, 120), (200, 160, 255),
               (120, 225, 215), (255, 170, 220), (220, 220, 140)]

MEADOW = (98, 178, 82)
PLAINS = (186, 168, 96)
EYE = (70, 64, 84)
ROAD = (150, 140, 128)
STONE = (128, 126, 124)


def box(parent, name, cf, size, color, mat="SmoothPlastic", **kw):
    kw.setdefault("collide", True)
    p = part(name, cf, size, color, mat, anchored=True, **kw)
    parent.add(p)
    return p


def build_plot(i):
    cx = PLOT_X0 + PLOT_STEP * i
    c = v(cx, 0, PLOT_Z)
    col = PLOT_COLORS[i]
    m = Inst("Model", f"Plot{i + 1}")
    idx = Inst("IntValue", "Index")
    idx.set("Value", "int", i + 1)
    m.add(idx)
    floor = box(m, "Floor", CF(add(c, v(0, 0.5, 0))), (PLOT_W, 1, PLOT_D), col, "SmoothPlastic")
    floor.set("Reflectance", "float", 0.02)
    box(m, "Trim", CF(add(c, v(0, 0.45, 0))), (PLOT_W + 1.2, 0.9, PLOT_D + 1.2), (240, 240, 245), "SmoothPlastic")
    wall = tuple(int(x * 0.75) for x in col)
    # back and side walls (tall enough that nobody hops over), open front facing the wild
    box(m, "WallBack", CF(add(c, v(0, 6, -PLOT_D / 2 + 0.75))), (PLOT_W, 12, 1.5), wall, "SmoothPlastic")
    for sx in (-1, 1):
        box(m, "WallSide", CF(add(c, v(sx * (PLOT_W / 2 - 0.75), 6, 0))), (1.5, 12, PLOT_D), wall, "SmoothPlastic")
        box(m, "Pillar", CF(add(c, v(sx * (PLOT_W / 2 - 0.75), 7, PLOT_D / 2 - 0.75))), (2.4, 14, 2.4),
            (235, 235, 240), "SmoothPlastic")
        box(m, "PillarCap", CF(add(c, v(sx * (PLOT_W / 2 - 0.75), 14.3, PLOT_D / 2 - 0.75))), (3, 0.6, 3), col,
            "Neon", collide=False)
    # the lock laser across the front (hidden until the base is locked)
    laser = box(m, "Laser", CF(add(c, v(0, 5, PLOT_D / 2 - 0.75))), (PLOT_W - 3, 10, 0.3), (255, 40, 60), "Neon",
                collide=False, transparency=1, query=False)
    laser.meta["hidden"] = True
    # owner sign on the back wall
    sign = box(m, "Sign", CF(add(c, v(0, 9.5, -PLOT_D / 2 + 1.6))), (24, 4.5, 0.3), (30, 30, 40), "SmoothPlastic",
               collide=False)
    sign.set("Reflectance", "float", 0.1)
    # pedestals: 2 rows of 5
    for k in range(10):
        row, colm = k // 5, k % 5
        px, pz = -15 + 7.5 * colm, -12 + 11 * row
        pc = add(c, v(px, 0, pz))
        ped = box(m, f"Pedestal{k + 1}", CF.along(add(pc, v(0, 1, 0)), add(pc, v(0, 2.6, 0))), (1.6, 4.4, 4.4),
                  (238, 238, 242), "Marble", shape="Cylinder")
        ped.set("Reflectance", "float", 0.05)
        box(m, "PedestalRing", CF.along(add(pc, v(0, 2.6, 0)), add(pc, v(0, 2.75, 0))), (0.15, 4.7, 4.7), col, "Neon",
            shape="Cylinder", collide=False)
    # where you appear
    box(m, "SpawnPad", CF(add(c, v(0, 1.05, 12))), (6, 0.1, 6), (255, 255, 255), "Neon", collide=False,
        transparency=0.6, query=False)
    return m


def tree(parent, rng, x, z, scale=1.0, dry=False):
    h = rng.uniform(7, 11) * scale
    box(parent, "Trunk", CF.along(v(x, 0, z), v(x, h, z)), (h, 1.4 * scale, 1.4 * scale), (96, 66, 44), "Wood",
        shape="Cylinder")
    leaf = (150, 140, 70) if dry else (60, 140, 60)
    for k in range(3):
        r = rng.uniform(4.2, 5.8) * scale
        off = v(rng.uniform(-1.6, 1.6), h + rng.uniform(-0.5, 2.5), rng.uniform(-1.6, 1.6))
        box(parent, "Leaves", CF(add(v(x, 0, z), off)), (r * 1.3, r, r * 1.3), tuple(int(c * rng.uniform(0.85, 1.1))
                                                                                  for c in leaf), "Grass",
            ellipsoid=True)


def rock(parent, rng, x, z, s, color=STONE):
    for k in range(rng.randint(1, 3)):
        sz = (s * rng.uniform(0.7, 1.2), s * rng.uniform(0.5, 0.9), s * rng.uniform(0.7, 1.2))
        box(parent, "Rock", CF.angles(rng.uniform(-0.2, 0.2), rng.uniform(0, 6.3), rng.uniform(-0.2, 0.2),
                                      v(x + rng.uniform(-s / 3, s / 3), sz[1] * 0.3, z + rng.uniform(-s / 3, s / 3))),
            sz, color, "Slate")


def zone_sign(parent, name, z, color):
    for sx in (-1, 1):
        box(parent, "ArchPost", CF(v(sx * 9, 7, z)), (1.6, 14, 1.6), (90, 70, 50), "Wood")
    box(parent, "ArchBeam", CF(v(0, 14.5, z)), (21, 1.4, 1.6), (90, 70, 50), "Wood")
    s = box(parent, "ZoneSign", CF(v(0, 12, z)), (16, 3.2, 0.4), color, "SmoothPlastic", collide=False)
    s.add(Inst("StringValue", "Text", Value=("string", name)))


def build_room(seed=11):
    rng = random.Random(seed)
    world = Inst("Model", "World")
    # ground: base strip, road, then the three zones
    box(world, "GroundBase", CF(v(0, -1, -48)), (420, 2, 84), (110, 170, 96), "Grass")
    box(world, "Road", CF(v(0, -0.95, 2)), (420, 2, 16), ROAD, "Concrete")
    for x in range(-200, 201, 20):  # road dashes
        box(world, "RoadLine", CF(v(x, 0.06, 2)), (8, 0.05, 0.6), (240, 230, 200), "SmoothPlastic", collide=False)
    box(world, "GroundMeadow", CF(v(0, -1, 65)), (420, 2, 110), MEADOW, "Grass")
    box(world, "GroundPlains", CF(v(0, -1, 175)), (420, 2, 110), PLAINS, "Grass")
    box(world, "GroundEye", CF(v(0, -1, 290)), (420, 2, 120), EYE, "Slate")
    # invisible boundary
    for name, cf, size in (("BoundW", CF(v(-188, 40, 140)), (2, 100, 420)), ("BoundE", CF(v(188, 40, 140)), (2, 100, 420)),
                           ("BoundS", CF(v(0, 40, -62)), (380, 100, 2)), ("BoundN", CF(v(0, 40, 336)), (380, 100, 2))):
        b = box(world, name, cf, size, (0, 0, 0), transparency=1, query=False)
        b.meta["hidden"] = True
    # rolling hills and cliffs beyond the boundary
    for k in range(26):
        side = -1 if k % 2 == 0 else 1
        z = -50 + k * 15
        r = rng.uniform(30, 46)
        colr = MEADOW if z < 120 else PLAINS if z < 230 else EYE
        box(world, "Hill", CF(v(side * (205 + rng.uniform(0, 12)), -4, z)), (r * 1.4, r, r * 1.2),
            tuple(int(c * 0.9) for c in colr), "Grass" if z < 230 else "Slate", ellipsoid=True, collide=False)
    for k in range(14):
        x = -190 + k * 29
        box(world, "Cliff", CF.angles(0, rng.uniform(0, 6), 0, v(x, 16, 352 + rng.uniform(0, 8))),
            (rng.uniform(30, 44), rng.uniform(40, 70), 24), (58, 52, 70), "Slate", collide=False)
    # zone arches on the main path
    zone_sign(world, "DRIZZLE MEADOW", 20, (60, 130, 60))
    zone_sign(world, "THUNDER PLAINS", 124, (150, 120, 40))
    zone_sign(world, "EYE OF THE STORM", 232, (90, 50, 130))
    # meadow: trees, flowers, a few rocks
    for _ in range(34):
        x, z = rng.uniform(-178, 178), rng.uniform(26, 118)
        if abs(x) < 14:
            continue
        tree(world, rng, x, z, rng.uniform(0.8, 1.2))
    for _ in range(80):
        x, z = rng.uniform(-180, 180), rng.uniform(12, 118)
        box(world, "Flower", CF(v(x, 0.25, z)), (0.6, 0.5, 0.6),
            rng.choice([(255, 220, 90), (255, 140, 180), (240, 240, 255), (180, 140, 255)]), "SmoothPlastic",
            collide=False, ellipsoid=True)
    for _ in range(10):
        rock(world, rng, rng.uniform(-170, 170), rng.uniform(30, 115), rng.uniform(3, 6))
    # plains: dry trees, more rocks, tall grass tufts
    for _ in range(18):
        x, z = rng.uniform(-178, 178), rng.uniform(128, 226)
        if abs(x) < 14:
            continue
        tree(world, rng, x, z, rng.uniform(0.7, 1.1), dry=True)
    for _ in range(24):
        rock(world, rng, rng.uniform(-175, 175), rng.uniform(128, 226), rng.uniform(4, 9), (150, 136, 110))
    for _ in range(70):
        x, z = rng.uniform(-180, 180), rng.uniform(124, 228)
        box(world, "Tuft", CF.angles(0, rng.uniform(0, 6), 0.2, v(x, 0.8, z)), (0.4, 1.8, 0.4), (200, 180, 100),
            "Grass", collide=False)
    # eye of the storm: jagged dark rocks, glowing cracks, the vortex overhead
    for _ in range(26):
        rock(world, rng, rng.uniform(-175, 175), rng.uniform(238, 326), rng.uniform(5, 12), (52, 48, 64))
    for _ in range(22):
        x, z = rng.uniform(-170, 170), rng.uniform(240, 326)
        box(world, "Crack", CF.angles(0, rng.uniform(0, 6.3), 0, v(x, 0.03, z)), (rng.uniform(6, 14), 0.06, 0.6),
            (150, 90, 255), "Neon", collide=False)
    vortex = Inst("Model", "Vortex")
    for ring in range(4):
        rad = 40 + ring * 22
        n = 14 + ring * 4
        for k in range(n):
            a = k / n * 2 * math.pi + ring * 0.4
            pos = v(math.cos(a) * rad, 70 + ring * 6 + rng.uniform(-3, 3), 290 + math.sin(a) * rad)
            shade = 40 + ring * 12
            box(vortex, "VortexCloud", CF.angles(0, -a, 0, pos), (rng.uniform(26, 36), rng.uniform(10, 16), 18),
                (shade, shade - 6, shade + 14), "SmoothPlastic", collide=False, ellipsoid=True, query=False,
                shadow=False)
    eye = box(vortex, "EyeGlow", CF(v(0, 64, 290)), (30, 4, 30), (170, 110, 255), "Neon", collide=False,
              ellipsoid=True, query=False, shadow=False)
    eye.add(light("PointLight", "Glow", brightness=3, range_=60, color=(170, 120, 255)))
    world.add(vortex)
    # the plots
    plots = Inst("Folder", "Plots")
    for i in range(PLOT_COUNT):
        plots.add(build_plot(i))
    # a neutral spawn on the road (the server moves each player to their own base)
    spawn = part("Spawn", CF.look(v(0, 0.06, 2), v(0, 0, 1)), (10, 0.1, 10), (200, 200, 200), "SmoothPlastic",
                 cls="SpawnLocation", anchored=True, collide=False, transparency=1)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    return world, [plots, spawn]
