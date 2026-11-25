"""Gato's Chess Club: a cozy club room with chess tables, built from parts.

Exports build_room() -> (room Model, [extra workspace instances]) and the piece/Gato templates are built by
templates.py (stored in ReplicatedStorage at runtime by the server).
"""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, light, part, v

SQ = 1.5  # board square size (studs)
TABLE_TOP = 3.4  # table surface height

WOOD_FLOOR = (112, 74, 46)
WALL = (196, 178, 150)
WAINSCOT = (86, 56, 36)
CEILING = (70, 52, 40)
LIGHT_SQ = (226, 200, 156)
DARK_SQ = (122, 80, 50)
FRAME = (58, 36, 22)
TABLE_WOOD = (92, 60, 38)

# (name, mode, level, x, z): Gato tables (play the bot) and friend tables (play each other)
TABLES = [
    ("GatoTable_Kitten", "bot", "Kitten", -26, -22),
    ("GatoTable_Cat", "bot", "Cat", 0, -22),
    ("GatoTable_Gato", "bot", "Gato", 26, -22),
    ("FriendTable_1", "pvp", "", -26, 8),
    ("FriendTable_2", "pvp", "", 0, 8),
    ("FriendTable_3", "pvp", "", 26, 8),
]


def box(parent, name, cf, size, color, mat="SmoothPlastic", **kw):
    kw.setdefault("collide", True)
    p = part(name, cf, size, color, mat, anchored=True, **kw)
    parent.add(p)
    return p


def string_value(name, value):
    s = Inst("StringValue", name)
    s.set("Value", "string", value)
    return s


def build_table(name, mode, level, x, z, rng):
    m = Inst("Model", name)
    m.add(string_value("Mode", mode), string_value("Level", level))
    c = v(x, 0, z)
    # round pedestal table
    box(m, "Top", CF.along(add(c, v(0, TABLE_TOP - 0.4, 0)), add(c, v(0, TABLE_TOP, 0))), (0.4, 16, 16), TABLE_WOOD,
        "Wood", shape="Cylinder")
    box(m, "Pedestal", CF.along(add(c, v(0, 0, 0)), add(c, v(0, TABLE_TOP - 0.4, 0))), (TABLE_TOP - 0.4, 2.2, 2.2),
        FRAME, "Wood", shape="Cylinder")
    box(m, "Foot", CF.along(add(c, v(0, 0, 0)), add(c, v(0, 0.4, 0))), (0.4, 7, 7), FRAME, "Wood", shape="Cylinder")
    # board: frame + 64 squares, rank 1 toward +Z (white sits at +Z)
    board = Inst("Model", "Board")
    top = TABLE_TOP + 0.15
    box(board, "Frame", CF(add(c, v(0, TABLE_TOP + 0.08, 0))), (SQ * 8 + 1.2, 0.16, SQ * 8 + 1.2), FRAME, "Wood")
    for rank in range(8):
        for file in range(8):
            sq = (7 - rank) * 16 + file  # 0x88 index (row 0 = rank 8)
            px, pz = (file - 3.5) * SQ, (3.5 - rank) * SQ
            light_sq = (file + rank) % 2 == 1
            p = box(board, f"Sq_{sq}", CF(add(c, v(px, top + 0.05, pz))), (SQ, 0.1, SQ),
                    LIGHT_SQ if light_sq else DARK_SQ, "Wood")
            p.set("Reflectance", "float", 0.04)
    # board centre marker (the server reads its position)
    center = box(board, "Center", CF(add(c, v(0, top + 0.1, 0))), (0.2, 0.2, 0.2), (0, 0, 0), collide=False,
                 transparency=1, query=False)
    center.meta["hidden"] = True
    m.add(board)
    # chairs: SeatSouth (+Z, white unless the board is flipped) and SeatNorth (-Z). At Gato tables the north
    # chair belongs to Gato (the seat is disabled).
    for seat_name, dz, yaw in (("SeatSouth", 10.0, 0.0), ("SeatNorth", -10.0, math.pi)):
        sc = CF.angles(0, yaw, 0, add(c, v(0, 0, dz)))
        pt = lambda lx, ly, lz: sc.point(v(lx, ly, lz))  # noqa: E731
        # the seat faces the table: a Seat's front (-Z) must point at the board
        seat = part(seat_name, CF(pt(0, 2.0, 0), sc.R), (3, 0.6, 3), (120, 44, 40), "Fabric", cls="Seat",
                    anchored=True, collide=True)
        if mode == "bot" and seat_name == "SeatNorth":
            seat.set("Disabled", "bool", True)
        m.add(seat)
        box(m, "ChairBack", CF(pt(0, 4.0, 1.6), sc.R), (3, 3.6, 0.4), FRAME, "Wood")
        box(m, "ChairCushion", CF(pt(0, 4.0, 1.35), sc.R), (2.5, 2.8, 0.2), (120, 44, 40), "Fabric")
        for lx in (-1.2, 1.2):
            for lz in (-1.2, 1.2):
                box(m, "ChairLeg", CF(pt(lx, 0.85, lz), sc.R), (0.3, 1.7, 0.3), FRAME, "Wood")
    if mode == "bot":
        m.add(build_gato(CF.angles(0, math.pi, 0, add(c, v(0, 2.3, -10.0)))))
    # sign above the table
    title = (f"GATO · {level.upper()}" if mode == "bot" else "FRIEND TABLE")
    sign = box(m, "Sign", CF(add(c, v(0, 11.5, 0))), (9, 1.6, 0.25), (34, 24, 18), "Wood", collide=False)
    sign.add(string_value("Text", title))
    box(m, "SignChain", CF(add(c, v(0, 13.2, 0))), (0.12, 1.8, 0.12), (40, 40, 40), "Metal", collide=False)
    lamp = box(m, "Lamp", CF.along(add(c, v(0, 14.4, 0)), add(c, v(0, 15.4, 0))), (1, 3.2, 3.2), (255, 214, 150),
               "Neon", shape="Cylinder", collide=False)
    lamp.add(light("SpotLight", "Glow", brightness=2.2, range_=20, color=(255, 214, 160), angle=70, face="Left",
                   shadows=True))
    return m


def build_gato(cf):
    """Gato, the robot cat, sitting in a chair (cf = seat top, facing the board along -Z)."""
    m = Inst("Model", "Gato")
    body, light_grey, accent = (64, 68, 78), (205, 208, 214), (255, 172, 60)

    def piece(name, pos, size, col=body, mat="SmoothPlastic", rx=0.0, ry=0.0, rz=0.0, shape="Block",
              ellipsoid=False):
        p = part(name, cf * CF.angles(rx, ry, rz, v(*pos)), size, col, mat, shape=shape, anchored=True,
                 collide=False, ellipsoid=ellipsoid, reflectance=0.1 if mat != "Neon" else 0)
        m.add(p)
        return p

    piece("Body", (0, 1.5, 0.3), (3.0, 3.2, 2.6), ellipsoid=True)
    piece("Belly", (0, 1.3, -0.85), (1.9, 2.2, 0.7), light_grey, ellipsoid=True)
    piece("Collar", (0, 3.05, 0.1), (2.3, 0.35, 2.0), accent, "Neon", ellipsoid=True)
    piece("Head", (0, 4.2, 0), (3.3, 2.7, 2.7), ellipsoid=True)
    piece("Visor", (0, 4.15, -1.0), (2.5, 1.7, 0.8), (22, 24, 30), ellipsoid=True)
    for x in (-0.55, 0.55):
        piece("Eye", (x, 4.3, -1.36), (0.5, 0.62, 0.18), accent, "Neon", ellipsoid=True)
    piece("Nose", (0, 3.85, -1.4), (0.26, 0.18, 0.12), (255, 120, 150), "Neon", ellipsoid=True)
    for x in (-1, 1):
        piece("Whisker", (x * 0.95, 3.85, -1.25), (0.9, 0.05, 0.05), light_grey, "Metal", ry=x * 0.15, rz=x * 0.12)
        piece("Whisker", (x * 0.95, 3.7, -1.25), (0.9, 0.05, 0.05), light_grey, "Metal", ry=x * 0.15,
              rz=-x * 0.05)
        piece("Ear", (x * 1.0, 5.55, 0.05), (0.95, 1.2, 0.5), rz=-x * 0.32)
        piece("EarTip", (x * 1.02, 5.55, -0.22), (0.45, 0.65, 0.08), accent, "Neon", rz=-x * 0.32)
        piece("Arm", (x * 1.45, 1.7, -1.0), (0.75, 2.3, 0.75), rx=-1.0, rz=x * 0.12, ellipsoid=True)
        piece("Paw", (x * 1.4, 1.95, -2.05), (0.8, 0.55, 0.9), light_grey, ellipsoid=True)
        piece("Leg", (x * 0.85, 0.35, -1.0), (0.95, 0.8, 1.9), ellipsoid=True)
    piece("Tail", (0, 0.6, 1.85), (0.45, 0.45, 2.4), rx=-0.5, ellipsoid=True)
    piece("TailTip", (0, 1.3, 2.75), (0.5, 0.5, 0.5), accent, "Neon", shape="Ball")
    piece("Antenna", (0, 6.0, 0.25), (0.12, 1.1, 0.12), (150, 150, 160), "Metal")
    piece("AntennaTip", (0, 6.6, 0.25), (0.4, 0.4, 0.4), accent, "Neon", shape="Ball")
    return m


def build_room(seed=5):
    rng = random.Random(seed)
    room = Inst("Model", "ChessClub")
    W, D, H = 100, 84, 22
    box(room, "Floor", CF(v(0, -0.5, 0)), (W, 1, D), WOOD_FLOOR, "WoodPlanks")
    box(room, "Rug", CF(v(0, 0.03, -7)), (76, 0.06, 52), (112, 34, 36), "Fabric", collide=False)
    box(room, "RugBorder", CF(v(0, 0.02, -7)), (79, 0.04, 55), (190, 150, 80), "Fabric", collide=False)
    box(room, "Ceiling", CF(v(0, H + 0.5, 0)), (W, 1, D), CEILING, "WoodPlanks")
    for x in (-30, -10, 10, 30):
        box(room, "Beam", CF(v(x, H - 0.6, 0)), (1.4, 1.2, D), FRAME, "Wood")
    for name, cf, size in (("WallN", CF(v(0, H / 2, -D / 2)), (W, H, 1)), ("WallS", CF(v(0, H / 2, D / 2)), (W, H, 1)),
                           ("WallW", CF(v(-W / 2, H / 2, 0)), (1, H, D)), ("WallE", CF(v(W / 2, H / 2, 0)), (1, H, D))):
        box(room, name, cf, size, WALL, "Concrete")
        sx, _, sz = size
        wcf = CF(add(cf.p, v(0, -H / 2 + 2.5, 0)))
        box(room, "Wainscot", wcf, (sx + 0.4 if sx > 1 else 1.4, 5, sz + 0.4 if sz > 1 else 1.4), WAINSCOT, "Wood")
        box(room, "Rail", CF(add(cf.p, v(0, -H / 2 + 5.1, 0))), (sx + 0.6 if sx > 1 else 1.7, 0.3,
                                                                  sz + 0.6 if sz > 1 else 1.7), FRAME, "Wood")
    # tall windows on the north wall with a moonlit night beyond
    for wx in (-36, -12, 12, 36):
        z = -D / 2 + 0.55
        box(room, "WindowGlow", CF(v(wx, 12, z)), (10, 12, 0.2), (36, 52, 92), "Neon", collide=False)
        box(room, "WindowFrame", CF(v(wx, 12, z + 0.2)), (10.8, 0.5, 0.4), FRAME, "Wood")
        box(room, "WindowFrame", CF(v(wx, 12, z + 0.2)), (0.5, 12.8, 0.4), FRAME, "Wood")
        for dy in (-6.2, 6.2):
            box(room, "WindowFrame", CF(v(wx, 12 + dy, z + 0.2)), (10.8, 0.5, 0.4), FRAME, "Wood")
        for dx in (-5.2, 5.2):
            box(room, "WindowFrame", CF(v(wx + dx, 12, z + 0.2)), (0.5, 12.8, 0.4), FRAME, "Wood")
        box(room, "WindowSill", CF(v(wx, 5.6, z + 0.7)), (11.4, 0.4, 1.4), FRAME, "Wood")
        for dx in (-6.4, 6.4):  # curtains
            box(room, "Curtain", CF(v(wx + dx, 11.5, z + 0.9)), (1.6, 14, 0.4), (120, 30, 34), "Fabric",
                collide=False)
    # bookshelves on the side walls
    for side in (-1, 1):
        for zc in (-26, -6, 14):
            x = side * (W / 2 - 1.7)
            box(room, "Shelf", CF(v(x, 7.5, zc)), (2.6, 15, 12), FRAME, "Wood")
            for row in range(5):
                y = 1.7 + row * 2.8
                box(room, "ShelfBoard", CF(v(x - side * 0.2, y - 0.1, zc)), (2.4, 0.2, 11.6), (74, 46, 28), "Wood",
                    collide=False)
                zz = zc - 5.5
                while zz < zc + 5.0:
                    w = rng.uniform(0.35, 0.7)
                    h = rng.uniform(1.6, 2.3)
                    col = rng.choice([(130, 30, 30), (30, 60, 104), (40, 84, 52), (156, 124, 60), (74, 42, 84),
                                      (186, 176, 152), (34, 34, 38)])
                    tilt = rng.uniform(-0.12, 0.12) if rng.random() < 0.15 else 0.0
                    box(room, "Book", CF.angles(tilt, 0, 0, v(x - side * 0.4, y + h / 2, zz + w / 2)), (1.7, h, w),
                        col, "SmoothPlastic", collide=False)
                    zz += w + 0.05
    # fireplace on the south wall, with a little lounge in front of it
    fz = D / 2
    box(room, "Fireplace", CF(v(0, 6, fz - 1.75)), (16, 12, 3.5), (96, 72, 62), "Brick")
    box(room, "Opening", CF(v(0, 2.6, fz - 3.52)), (7, 4.6, 0.06), (14, 10, 9), "Slate", collide=False)
    box(room, "HearthStone", CF(v(0, 0.15, fz - 5)), (11, 0.3, 3), (70, 66, 64), "Slate")
    for dx, rz in ((-0.6, 0.15), (0.6, -0.15)):
        box(room, "Log", CF.angles(0, 0.3 * dx, rz, v(dx, 0.6, fz - 4.4)), (2.6, 0.5, 0.5), (70, 44, 26), "Wood",
            shape="Cylinder", collide=False)
    fire = box(room, "Fire", CF(v(0, 0.9, fz - 4.4)), (1.6, 0.4, 0.6), (255, 120, 40), "Neon", collide=False)
    fire.add(Inst("Fire", "Flames", Size=("float", 4), Heat=("float", 7)),
             light("PointLight", "Glow", brightness=3, range_=30, color=(255, 140, 60), shadows=True))
    box(room, "Mantel", CF(v(0, 7.2, fz - 3.8)), (17, 0.6, 1.4), FRAME, "Wood")
    for dx in (-6, -4.8, 4.8, 6):  # candles on the mantel
        box(room, "Candle", CF.along(v(dx, 7.5, fz - 3.8), v(dx, 8.5, fz - 3.8)), (1, 0.3, 0.3), (240, 230, 210),
            collide=False, shape="Cylinder")
        f = box(room, "Flame", CF(v(dx, 8.65, fz - 3.8)), (0.12, 0.25, 0.12), (255, 190, 90), "Neon", collide=False)
        f.add(light("PointLight", "Glow", brightness=0.4, range_=7, color=(255, 190, 110)))
    for dx in (-13, 13):  # armchairs
        ac = CF.angles(0, math.pi + (0.45 if dx < 0 else -0.45), 0, v(dx, 0, fz - 8))
        box(room, "ArmchairSeat", ac * CF(v(0, 1.4, 0)), (4.4, 1.2, 4), (120, 44, 40), "Fabric")
        box(room, "ArmchairBack", ac * CF(v(0, 3.2, 1.8)), (4.4, 3.4, 0.9), (120, 44, 40), "Fabric")
        for sx in (-2.1, 2.1):
            box(room, "ArmchairArm", ac * CF(v(sx, 2.3, 0.2)), (0.7, 1.6, 4.2), (104, 38, 34), "Fabric")
    # warm hanging lamps
    for lx in (-26, 0, 26):
        for lz in (-36, -7, 22):
            box(room, "LampCord", CF(v(lx, H - 1.5, lz)), (0.1, 3, 0.1), (30, 30, 30), collide=False)
            p = box(room, "CeilingLamp", CF.along(v(lx, H - 3.4, lz), v(lx, H - 2.8, lz)), (0.6, 2.2, 2.2),
                    (255, 222, 172), "Neon", collide=False, shape="Cylinder")
            p.add(light("PointLight", "Glow", brightness=0.7, range_=26, color=(255, 210, 160)))
    # potted plants in the corners
    for px, pz in ((-45, -38), (45, -38), (-45, 38), (45, 38)):
        box(room, "Pot", CF.along(v(px, 0, pz), v(px, 2.4, pz)), (2.4, 2.6, 2.6), (150, 80, 50), "Concrete",
            shape="Cylinder")
        for k in range(8):
            a = k * 0.8
            box(room, "Leaf", CF.angles(0, a, 0, v(px, 0, pz)) * CF.angles(rng.uniform(0.25, 0.7), 0, 0,
                                                                         v(0, 4.1, -0.7)),
                (0.9, 3.6, 0.2), (50, 112, 62), "Grass", collide=False, ellipsoid=True)
    tables = Inst("Folder", "Tables")
    for t in TABLES:
        tables.add(build_table(*t, rng))
    spawn = part("Spawn", CF.look(v(0, 0.06, 31), v(0, 0, -1)), (8, 0.1, 8), (190, 150, 80), "Fabric",
                 cls="SpawnLocation", anchored=True, collide=False, transparency=1)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    return room, [tables, spawn]
