"""Steal a Storm: the map. 8 bases along the south edge, a road, then five stages going north, each harder than the
last: Drizzle Meadow, Thunder Plains (the Thunder King's arena), Frostbite Peaks, Cinder Wastes (lava rivers and
geysers) and the Eye of the Storm (the Tornado Tyrant's arena under a giant vortex).

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
SNOW = (232, 238, 246)
BASALT = (58, 50, 50)
EYE = (70, 64, 84)
GATES = [120, 230, 340, 450]
Z_END = 586
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


def cone(parent, name, x, z, base_r, height, color, mat="SmoothPlastic", y0=0.0, layers=6, collide=False):
    """A cone from stacked cylinders (mountains, pine layers, volcanoes)."""
    for k in range(layers):
        a, b = k / layers, (k + 1) / layers
        r = base_r * (1 - (a + b) / 2) + 0.4
        box(parent, name, CF.along(v(x, y0 + height * a, z), v(x, y0 + height * b + 0.05, z)),
            (height / layers + 0.05, r * 2, r * 2), color, mat, shape="Cylinder", collide=collide)


def pine(parent, rng, x, z, scale=1.0):
    h = rng.uniform(4, 5.5) * scale
    box(parent, "Trunk", CF.along(v(x, 0, z), v(x, h, z)), (h, 1.1 * scale, 1.1 * scale), (80, 56, 40), "Wood",
        shape="Cylinder")
    for k in range(3):
        y = h * 0.6 + k * 3.2 * scale
        r = (4.6 - k * 1.3) * scale
        box(parent, "PineLayer", CF.along(v(x, y, z), v(x, y + 3.4 * scale, z)), (3.4 * scale, r * 2, r * 2),
            (40, 95, 70), "Grass", shape="Cylinder", collide=k == 0)
        box(parent, "PineSnow", CF.along(v(x, y + 3.4 * scale, z), v(x, y + 3.9 * scale, z)),
            (0.5 * scale, r * 1.5, r * 1.5), SNOW, "Snow", shape="Cylinder", collide=False)


def gate(parent, stage, name, z, color):
    for sx in (-1, 1):
        box(parent, "GatePost", CF(v(sx * 13, 10, z)), (3, 20, 3), (70, 66, 80), "Slate")
        box(parent, "GateRune", CF(v(sx * 13, 10, z - 1.55)), (1, 16, 0.2), color, "Neon", collide=False)
    box(parent, "GateBeam", CF(v(0, 20.5, z)), (30, 2.5, 3.2), (70, 66, 80), "Slate")
    s = box(parent, "ZoneSign", CF(v(0, 16.4, z)), (22, 4.6, 0.4), tuple(int(c * 0.45) for c in color), "SmoothPlastic",
            collide=False)
    s.add(Inst("StringValue", "Text", Value=("string", f"STAGE {stage}: {name}")))


def portal(parent, name, pos, color, radius=5.0):
    """An upright glowing ring you walk into."""
    m = Inst("Model", name)
    for k in range(20):
        a = k / 20 * math.pi * 2
        p = add(pos, v(math.cos(a) * radius, radius + 0.6 + math.sin(a) * radius, 0))
        box(m, "PortalRing", CF.angles(0, 0, a, p), (0.9, 1.9, 0.9), color, "Neon", collide=False)
    core = box(m, "PortalCore", CF.along(add(pos, v(0, radius + 0.6, -0.1)), add(pos, v(0, radius + 0.6, 0.1))),
               (0.2, radius * 1.9, radius * 1.9), color, "Neon", shape="Cylinder", collide=False, transparency=0.55)
    core.meta["cf"] = CF.angles(0, math.pi / 2, 0, add(pos, v(0, radius + 0.6, 0))) * CF.angles(0, 0, math.pi / 2)
    core.set("CFrame", "CoordinateFrame", CF(add(pos, v(0, radius + 0.6, 0)), ((0, 0, 1), (0, 1, 0), (-1, 0, 0))))
    core.meta["cf"] = CF(add(pos, v(0, radius + 0.6, 0)), ((0, 0, 1), (0, 1, 0), (-1, 0, 0)))
    box(m, "PortalBase", CF.along(pos, add(pos, v(0, 0.4, 0))), (0.4, radius * 2.6, radius * 2.6), (40, 36, 50), "Slate",
        shape="Cylinder", collide=False)
    parent.add(m)
    return m


def arena(parent, rng, name, title, center, radius, floor_color, floor_mat, pillar_color, rune_color):
    m = Inst("Model", name)
    box(m, "ArenaFloor", CF.along(add(center, v(0, -0.2, 0)), add(center, v(0, 0.25, 0))), (0.45, radius * 2, radius * 2),
        floor_color, floor_mat, shape="Cylinder")
    box(m, "ArenaRing", CF.along(add(center, v(0, 0.2, 0)), add(center, v(0, 0.32, 0))), (0.12, radius * 2 - 3,
                                                                                         radius * 2 - 3),
        rune_color, "Neon", shape="Cylinder", collide=False, transparency=0.6)
    box(m, "ArenaInner", CF.along(add(center, v(0, 0.25, 0)), add(center, v(0, 0.36, 0))), (0.12, radius * 2 - 5,
                                                                                          radius * 2 - 5),
        floor_color, floor_mat, shape="Cylinder", collide=False)
    n = 14
    for k in range(n):
        a = k / n * math.pi * 2
        if abs(math.sin(a) + 1) < 0.25:  # leave the south side open (the way in)
            continue
        h = rng.uniform(8, 18) if k % 3 else rng.uniform(3, 6)
        p = add(center, v(math.cos(a) * (radius + 3), h / 2, math.sin(a) * (radius + 3)))
        box(m, "ArenaPillar", CF.angles(0, -a, rng.uniform(-0.06, 0.06), p), (3.4, h, 3.4), pillar_color, "Slate")
        box(m, "ArenaRune", CF.angles(0, -a, 0, add(p, v(-math.cos(a) * 1.75, 0, -math.sin(a) * 1.75))),
            (0.2, h * 0.7, 1.2), rune_color, "Neon", collide=False)
    s = box(m, "ZoneSign", CF(add(center, v(0, 24, -radius - 2))), (28, 5, 0.4), tuple(int(c * 0.4) for c in rune_color),
            "SmoothPlastic", collide=False)
    s.add(Inst("StringValue", "Text", Value=("string", title)))
    for sx in (-1, 1):
        box(m, "ArenaPost", CF(add(center, v(sx * 15, 11, -radius - 2))), (2.4, 22, 2.4), pillar_color, "Slate")
    portal(m, "ArenaExit", add(center, v(0, 0, -radius + 6)), (120, 255, 160), 3.6)
    parent.add(m)
    return m


def build_room(seed=11):
    rng = random.Random(seed)
    world = Inst("Model", "World")
    # ground: base strip, road, then the five stages
    box(world, "GroundBase", CF(v(0, -1, -48)), (420, 2, 84), (110, 170, 96), "Grass")
    box(world, "Road", CF(v(0, -0.95, 2)), (420, 2, 16), ROAD, "Asphalt")
    for x in range(-200, 201, 20):
        box(world, "RoadLine", CF(v(x, 0.06, 2)), (8, 0.05, 0.6), (240, 230, 200), "SmoothPlastic", collide=False)
    for x in range(-180, 181, 36):  # street lamps
        box(world, "LampPost", CF(v(x, 5, 10.5)), (0.5, 10, 0.5), (50, 50, 60), "Metal")
        lamp = box(world, "LampBulb", CF(v(x, 10.2, 10.5)), (1.4, 1, 1.4), (255, 230, 170), "Neon", collide=False)
        lamp.add(light("PointLight", "Glow", brightness=1, range_=18, color=(255, 220, 160)))
    grounds = [("GroundStage1", 10, 120, MEADOW, "Grass"), ("GroundStage2", 120, 230, PLAINS, "Grass"),
               ("GroundStage3", 230, 340, SNOW, "Snow"), ("GroundStage4", 340, 450, BASALT, "Basalt"),
               ("GroundStage5", 450, Z_END + 4, EYE, "Slate")]
    for name, z0, z1, col, mat in grounds:
        box(world, name, CF(v(0, -1, (z0 + z1) / 2)), (420, 2, z1 - z0), col, mat)
    # invisible boundary
    mid = (Z_END - 62) / 2
    for name, cf, size in (("BoundW", CF(v(-188, 40, mid)), (2, 100, Z_END + 70)),
                           ("BoundE", CF(v(188, 40, mid)), (2, 100, Z_END + 70)),
                           ("BoundS", CF(v(0, 40, -62)), (380, 100, 2)), ("BoundN", CF(v(0, 40, Z_END)), (380, 100, 2))):
        b = box(world, name, cf, size, (0, 0, 0), transparency=1, query=False)
        b.meta["hidden"] = True
    # the scenery beyond the boundary: hills, snowy mountains, volcanoes, storm cliffs
    for k in range(44):
        side = -1 if k % 2 == 0 else 1
        z = -50 + k * 15
        x = side * (206 + rng.uniform(0, 14))
        if z < 230:
            r = rng.uniform(30, 46)
            colr = MEADOW if z < 120 else PLAINS
            box(world, "Hill", CF(v(x, -4, z)), (r * 1.4, r, r * 1.2), tuple(int(c * 0.9) for c in colr), "Grass",
                ellipsoid=True, collide=False)
        elif z < 340:
            if k % 2 == 0 or rng.random() < 0.5:
                cone(world, "Mountain", x + side * 10, z, rng.uniform(26, 36), rng.uniform(55, 80), (200, 210, 225), "Rock")
                cone(world, "MountainSnow", x + side * 10, z, rng.uniform(12, 16), 22, SNOW, "Snow", y0=rng.uniform(42, 52),
                     layers=4)
        elif z < 450:
            if k % 3 == 0:
                vx = x + side * 14
                cone(world, "Volcano", vx, z, 34, 52, (54, 44, 44), "Basalt")
                crater = box(world, "Crater", CF.along(v(vx, 50, z), v(vx, 51, z)), (1, 12, 12), (255, 110, 30), "Neon",
                             shape="Cylinder", collide=False)
                crater.add(light("PointLight", "Glow", brightness=3, range_=60, color=(255, 120, 50)))
                crater.add(Inst("Smoke", "Smoke", Size=("float", 20), RiseVelocity=("float", 12),
                                Color=("Color3", (60, 56, 56)), Opacity=("float", 0.25)))
            else:
                r = rng.uniform(26, 36)
                box(world, "Ridge", CF(v(x, -2, z)), (r * 1.3, r * 0.8, r * 1.2), (64, 54, 52), "Basalt", ellipsoid=True,
                    collide=False)
        else:
            box(world, "Cliff", CF.angles(0, rng.uniform(0, 6), 0, v(x, 16, z)), (rng.uniform(28, 40), rng.uniform(40, 70), 24),
                (58, 52, 70), "Slate", collide=False)
    for k in range(14):
        x = -190 + k * 29
        box(world, "Cliff", CF.angles(0, rng.uniform(0, 6), 0, v(x, 18, Z_END + 14 + rng.uniform(0, 8))),
            (rng.uniform(30, 44), rng.uniform(50, 80), 24), (58, 52, 70), "Slate", collide=False)
    # stage gates
    gate(world, 1, "DRIZZLE MEADOW", 20, (90, 200, 90))
    for i, (z, nm, col) in enumerate(zip(GATES, ["THUNDER PLAINS", "FROSTBITE PEAKS", "CINDER WASTES", "EYE OF THE STORM"],
                                         [(255, 210, 80), (150, 220, 255), (255, 120, 50), (190, 120, 255)])):
        gate(world, i + 2, nm, z, col)

    # ---- stage 1: Drizzle Meadow
    for _ in range(30):
        x, z = rng.uniform(-178, 178), rng.uniform(28, 116)
        if abs(x) < 16 or (abs(x + 120) < 22 and abs(z - 62) < 22):
            continue
        tree(world, rng, x, z, rng.uniform(0.8, 1.2))
    for _ in range(80):
        x, z = rng.uniform(-180, 180), rng.uniform(12, 118)
        box(world, "Flower", CF(v(x, 0.25, z)), (0.6, 0.5, 0.6),
            rng.choice([(255, 220, 90), (255, 140, 180), (240, 240, 255), (180, 140, 255)]), "SmoothPlastic",
            collide=False, ellipsoid=True)
    for _ in range(8):
        rock(world, rng, rng.uniform(-170, 170), rng.uniform(30, 115), rng.uniform(3, 6))
    pond = box(world, "Pond", CF.along(v(-120, -0.15, 62), v(-120, 0.06, 62)), (0.21, 30, 26), (70, 140, 210), "Glass",
               shape="Cylinder", collide=False, transparency=0.25)
    pond.set("Reflectance", "float", 0.3)
    # a windmill
    wx, wz = 140, 72
    cone(world, "Windmill", wx, wz, 5, 22, (230, 225, 215), "WoodPlanks", layers=4, collide=True)
    box(world, "WindmillCap", CF(v(wx, 23, wz)), (7, 4, 7), (170, 60, 50), "WoodPlanks", ellipsoid=True)
    for k in range(4):
        a = k * math.pi / 2 + 0.3
        box(world, "WindmillBlade", CF(v(wx, 22, wz - 4.2)) * CF.angles(0, 0, a) * CF(v(0, 6, 0)), (1.6, 12, 0.3),
            (240, 235, 225), "WoodPlanks", collide=False)
    # ---- stage 2: Thunder Plains (and the Thunder King's arena)
    for _ in range(14):
        x, z = rng.uniform(-178, 178), rng.uniform(126, 226)
        if abs(x) < 60 and abs(z - 176) < 56:
            continue
        tree(world, rng, x, z, rng.uniform(0.7, 1.1), dry=True)
    for _ in range(18):
        x, z = rng.uniform(-175, 175), rng.uniform(126, 226)
        if abs(x) < 58 and abs(z - 176) < 54:
            continue
        rock(world, rng, x, z, rng.uniform(4, 9), (150, 136, 110))
    for _ in range(10):  # hay bales
        x, z = rng.uniform(-170, 170), rng.uniform(126, 226)
        if abs(x) < 60 and abs(z - 176) < 56:
            continue
        box(world, "HayBale", CF.angles(0, rng.uniform(0, 3), 0, v(x, 1.6, z)) * CF.angles(0, 0, math.pi / 2),
            (3.6, 3.2, 3.2), (220, 190, 100), "Fabric", shape="Cylinder")
    for _ in range(60):
        x, z = rng.uniform(-180, 180), rng.uniform(122, 228)
        box(world, "Tuft", CF.angles(0, rng.uniform(0, 6), 0.2, v(x, 0.8, z)), (0.4, 1.8, 0.4), (200, 180, 100), "Grass",
            collide=False)
    tk = arena(world, rng, "ThunderArena", "THE THUNDER KING'S ARENA", v(0, 0, 176), 46, (120, 118, 112), "Cobblestone",
               (110, 108, 104), (110, 170, 255))
    for a in (0.6, 2.4, 3.9, 5.5):  # lightning rods
        p = v(math.cos(a) * 36, 0, 176 + math.sin(a) * 36)
        box(tk, "LightningRod", CF(add(p, v(0, 7, 0))), (0.5, 14, 0.5), (150, 150, 160), "Metal")
        box(tk, "RodTip", CF(add(p, v(0, 14.4, 0))), (1, 1, 1), (150, 200, 255), "Neon", collide=False, shape="Ball")
    # ---- stage 3: Frostbite Peaks
    for _ in range(30):
        x, z = rng.uniform(-178, 178), rng.uniform(236, 336)
        if abs(x) < 16 or (abs(x - 100) < 30 and abs(z - 290) < 30):
            continue
        pine(world, rng, x, z, rng.uniform(0.8, 1.3))
    for _ in range(18):
        x, z = rng.uniform(-175, 175), rng.uniform(236, 336)
        tilt = rng.uniform(-0.4, 0.4)
        box(world, "IceCrystal", CF.angles(tilt, rng.uniform(0, 6), -tilt, v(x, 2.5, z)), (1.6, rng.uniform(4, 8), 1.6),
            (150, 225, 255), "Neon", collide=False, transparency=0.25)
    for _ in range(16):
        x, z = rng.uniform(-175, 175), rng.uniform(236, 336)
        r = rng.uniform(3, 7)
        box(world, "SnowPile", CF(v(x, 0.2, z)), (r * 2, r * 0.8, r * 1.6), SNOW, "Snow", ellipsoid=True)
    lake = box(world, "FrozenLake", CF.along(v(100, -0.15, 290), v(100, 0.08, 290)), (0.23, 50, 50), (190, 225, 245), "Ice",
               shape="Cylinder", collide=True)
    lake.set("Reflectance", "float", 0.35)
    # ---- stage 4: Cinder Wastes (lava rivers you have to jump or cross at the stone bridges, and geysers)
    lava = Inst("Folder", "Lava")
    for zr in (370, 402, 434):
        x = -186.0
        gap_at = sorted(rng.sample([-140, -90, -40, 10, 60, 110, 160], 3))
        cuts = [(g - 8, g + 8) for g in gap_at]
        edges = [-186.0]
        for a, b in cuts:
            edges += [a, b]
        edges.append(186.0)
        for k in range(0, len(edges), 2):
            x0, x1 = edges[k], edges[k + 1]
            if x1 - x0 < 1:
                continue
            seg = box(lava, "Lava", CF(v((x0 + x1) / 2, 0.06, zr)), (x1 - x0, 0.25, 9), (255, 110, 30), "Neon",
                      collide=False)
            if (x1 - x0) > 40:
                seg.add(light("PointLight", "Glow", brightness=1.5, range_=20, color=(255, 120, 40)))
        for a, b in cuts:
            box(world, "Bridge", CF(v((a + b) / 2, 0.4, zr)), (b - a - 1, 0.6, 12), (90, 84, 80), "Cobblestone")
    world.add(lava)
    geysers = Inst("Folder", "Geysers")
    for x, z in ((-150, 356), (-95, 388), (-30, 418), (35, 386), (95, 420), (150, 358), (-60, 446), (70, 446)):
        box(geysers, "GeyserRim", CF.along(v(x, 0, z), v(x, 0.7, z)), (0.7, 7, 7), (40, 34, 34), "Basalt", shape="Cylinder")
        box(geysers, "Geyser", CF.along(v(x, 0, z), v(x, 0.8, z)), (0.8, 4, 4), (255, 120, 40), "Neon", shape="Cylinder",
            collide=False)
    world.add(geysers)
    for _ in range(24):
        x, z = rng.uniform(-175, 175), rng.uniform(346, 448)
        if any(abs(z - zr) < 9 for zr in (370, 402, 434)):
            continue
        h = rng.uniform(3, 9)
        box(world, "Obsidian", CF.angles(rng.uniform(-0.3, 0.3), rng.uniform(0, 6), rng.uniform(-0.3, 0.3), v(x, h / 2 - 0.5, z)),
            (rng.uniform(1.5, 3), h, rng.uniform(1.5, 3)), (24, 20, 28), "Glass")
    for _ in range(16):
        x, z = rng.uniform(-175, 175), rng.uniform(346, 448)
        if any(abs(z - zr) < 9 for zr in (370, 402, 434)):
            continue
        box(world, "Crack", CF.angles(0, rng.uniform(0, 6.3), 0, v(x, 0.03, z)), (rng.uniform(5, 11), 0.06, 0.5),
            (255, 120, 40), "Neon", collide=False)
    # ---- stage 5: Eye of the Storm (and the Tornado Tyrant's arena)
    for _ in range(22):
        x, z = rng.uniform(-175, 175), rng.uniform(456, Z_END - 10)
        if abs(x) < 64 and abs(z - 512) < 62:
            continue
        rock(world, rng, x, z, rng.uniform(5, 12), (52, 48, 64))
    for _ in range(20):
        x, z = rng.uniform(-170, 170), rng.uniform(456, Z_END - 10)
        box(world, "Crack", CF.angles(0, rng.uniform(0, 6.3), 0, v(x, 0.03, z)), (rng.uniform(6, 14), 0.06, 0.6),
            (150, 90, 255), "Neon", collide=False)
    for _ in range(16):  # floating rocks
        x, z, y = rng.uniform(-170, 170), rng.uniform(456, Z_END - 10), rng.uniform(18, 42)
        box(world, "FloatingRock", CF.angles(rng.uniform(0, 3), rng.uniform(0, 3), 0, v(x, y, z)),
            (rng.uniform(5, 12), rng.uniform(3, 6), rng.uniform(5, 10)), (60, 54, 74), "Slate", ellipsoid=True, collide=False)
    arena(world, rng, "TyrantArena", "THE TORNADO TYRANT'S ARENA", v(0, 0, 512), 52, (50, 44, 66), "Slate", (70, 62, 90),
          (190, 120, 255))
    vortex = Inst("Model", "Vortex")
    for ring in range(4):
        rad = 44 + ring * 22
        n = 14 + ring * 4
        for k in range(n):
            a = k / n * 2 * math.pi + ring * 0.4
            pos = v(math.cos(a) * rad, 78 + ring * 6 + rng.uniform(-3, 3), 512 + math.sin(a) * rad)
            shade = 40 + ring * 12
            box(vortex, "VortexCloud", CF.angles(0, -a, 0, pos), (rng.uniform(26, 36), rng.uniform(10, 16), 18),
                (shade, shade - 6, shade + 14), "SmoothPlastic", collide=False, ellipsoid=True, query=False, shadow=False)
    eye = box(vortex, "EyeGlow", CF(v(0, 72, 512)), (30, 4, 30), (170, 110, 255), "Neon", collide=False,
              ellipsoid=True, query=False, shadow=False)
    eye.add(light("PointLight", "Glow", brightness=3, range_=60, color=(170, 120, 255)))
    world.add(vortex)
    # wind launch pads: highways home from every stage, and a few heading out
    pads = Inst("Folder", "GustPads")
    pad_list = []
    for z in (112, 224, 334, 446, 568):
        for x in (-125, -45, 45, 125):
            pad_list.append((x + rng.uniform(-6, 6), z, (0, 0, -1)))
    for x in (-110, -20, 70, 150):
        pad_list.append((x, 15, (0, 0, 1)))
    for x, z, d in pad_list:
        pad = box(pads, "GustPad", CF.along(v(x, 0, z), v(x, 0.35, z)), (0.35, 9, 9), (120, 230, 255), "Neon",
                  shape="Cylinder", collide=False, transparency=0.25)
        pad.add(Inst("Vector3Value", "Launch", Value=("Vector3", (d[0] * 100.0, 0.0, d[2] * 100.0))))
        box(pads, "GustRim", CF.along(v(x, 0, z), v(x, 0.3, z)), (0.3, 10.4, 10.4), (40, 60, 90), "Metal",
            shape="Cylinder", collide=False)
        yaw = 0.0 if d[2] < 0 else math.pi
        arrow = CF.angles(0, yaw, 0, v(x, 0.4, z))
        box(pads, "GustArrow", arrow * CF(v(0, 0, 1.2)), (1.1, 0.12, 3.2), (255, 255, 255), "Neon", collide=False)
        for sx in (-1, 1):
            box(pads, "GustArrow", arrow * CF.angles(0, sx * 0.7, 0, v(sx * 0.9, 0, -0.9)), (0.9, 0.12, 2.8),
                (255, 255, 255), "Neon", collide=False)
    world.add(pads)
    # the boss portal by the road (lights up while a boss is awake) and the leaderboard
    portal(world, "BossPortal", v(-40, 0, 15), (255, 80, 80), 5)
    box(world, "Leaderboard", CF(v(40, 10, 16)), (24, 15, 0.8), (30, 34, 50), "SmoothPlastic", collide=True)
    for sx in (-1, 1):
        box(world, "BoardPost", CF(v(40 + sx * 11, 4, 16.6)), (1, 8, 1), (70, 60, 50), "Wood")
    box(world, "BoardTrim", CF(v(40, 17.8, 16)), (25, 0.8, 1.2), (255, 200, 80), "Neon", collide=False)
    # the plots
    plots = Inst("Folder", "Plots")
    for i in range(PLOT_COUNT):
        plots.add(build_plot(i))
    spawn = part("Spawn", CF.look(v(0, 0.06, 2), v(0, 0, 1)), (10, 0.1, 10), (200, 200, 200), "SmoothPlastic",
                 cls="SpawnLocation", anchored=True, collide=False, transparency=1)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    return world, [plots, spawn]
