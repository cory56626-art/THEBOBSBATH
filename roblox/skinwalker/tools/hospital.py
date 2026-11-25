"""The abandoned hospital map, generated from a layout grid.

Every letter is a room, '#' is corridor. Walls go between different letters; doors are listed explicitly.
Furniture, lockers/closets (tagged "HideSpot"), lights (some broken, some tagged "FlickerLight"),
nav points (tagged "NavPoint") and signs are placed per room type.
"""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, light, mul, part, v

C = 12  # cell size (studs)
WALL_H = 15
DOOR_W, DOOR_H = 7.5, 11.5
TILE_H = 4  # two-tone walls: tiles below, plaster above

LAYOUT = [
    "MMMM#AABB#CC#OOO",
    "MMMM#AABB#CC#OOO",
    "MMMM#AABB#CC#OOO",
    "################",
    "SSS#WWWWWW#TT#FF",
    "SSS#WWWWWW#TT#FF",
    "SSS#WWWWWW#TT#FF",
    "################",
    "LLLLLL#DD#EE#BBB",
    "LLLLLL#DD#EE#BBB",
    "LLLLLL#DD#EE#BBB",
]
ROWS, COLS = len(LAYOUT), len(LAYOUT[0])

ROOMS = {
    "M": ("Morgue", "morgue"), "A": ("Room 101", "private"), "B": ("Room 102", "private"),
    "C": ("Supply", "storage"), "O": ("Operating Theatre", "surgery"), "S": ("Staff Lockers", "staff"),
    "W": ("Ward B", "ward"), "T": ("Storage", "storage"), "F": ("Cafeteria", "cafeteria"),
    "L": ("Reception", "lobby"), "D": ("Room 103", "private"), "E": ("Room 104", "private"),
    "#": ("Corridor", "corridor"),
}
# (row, col, direction) for each doorway; direction is the edge of that cell the door is in
DOORS = [
    (2, 1, "S"), (1, 3, "E"), (2, 5, "S"), (2, 7, "S"), (2, 10, "S"), (2, 14, "S"), (1, 13, "W"),
    (4, 1, "N"), (5, 2, "E"), (4, 6, "N"), (6, 8, "S"), (5, 4, "W"), (5, 11, "W"), (5, 14, "W"), (6, 15, "S"),
    (8, 2, "N"), (9, 5, "E"), (8, 7, "N"), (8, 10, "N"), (8, 14, "N"), (9, 13, "W"),
]
RAISED = {"F": 3.0}  # room floor heights (the cafeteria is up a few steps)

# palette
LINO = (78, 92, 86)
TILE = (96, 118, 108)
PLASTER = (150, 146, 132)
CEIL = (52, 52, 50)
METAL = (92, 98, 104)
METAL_DK = (55, 58, 62)
SHEET = (176, 172, 158)
WOOD = (92, 70, 52)
GRIME = (40, 36, 30)
OLD_BLOOD = (58, 16, 14)


def cell_xz(r, c):
    return ((c + 0.5) * C - COLS * C / 2, (r + 0.5) * C - ROWS * C / 2)


def room_cells(ch):
    return [(r, c) for r in range(ROWS) for c in range(COLS) if LAYOUT[r][c] == ch]


def room_bounds(ch):
    cells = room_cells(ch)
    r0, r1 = min(r for r, _ in cells), max(r for r, _ in cells)
    c0, c1 = min(c for _, c in cells), max(c for _, c in cells)
    x0, z0 = c0 * C - COLS * C / 2, r0 * C - ROWS * C / 2
    x1, z1 = (c1 + 1) * C - COLS * C / 2, (r1 + 1) * C - ROWS * C / 2
    return x0, z0, x1, z1


def at(ch, r, c):
    if 0 <= r < ROWS and 0 <= c < COLS:
        return LAYOUT[r][c]
    return None


def floor_y(ch):
    return RAISED.get(ch, 0.0)


class Builder:
    def __init__(self, seed=31):
        self.rng = random.Random(seed)
        self.root = Inst("Model", "Hospital")
        self.groups = {}
        self.doors = []  # world positions of door centres (keep furniture clear)

    def group(self, name):
        if name not in self.groups:
            g = Inst("Model", name)
            self.groups[name] = g
            self.root.add(g)
        return self.groups[name]

    def box(self, grp, name, cf, size, color, mat="SmoothPlastic", collide=True, query=True, **kw):
        p = part(name, cf, size, color, mat, anchored=True, collide=collide, query=query, **kw)
        self.group(grp).add(p)
        return p

    def near_door(self, x, z, d=6.0):
        return any(math.hypot(x - dx, z - dz) < d for dx, dz in self.doors)


# ----------------------------------------------------------------------------------------- shell
def build_shell(b: Builder):
    door_set = set()
    for r, c, d in DOORS:
        door_set.add((r, c, d))
        nr, nc = {"N": (r - 1, c), "S": (r + 1, c), "E": (r, c + 1), "W": (r, c - 1)}[d]
        door_set.add((nr, nc, {"N": "S", "S": "N", "E": "W", "W": "E"}[d]))
        x, z = cell_xz(r, c)
        dx, dz = {"N": (0, -C / 2), "S": (0, C / 2), "E": (C / 2, 0), "W": (-C / 2, 0)}[d]
        b.doors.append((x + dx, z + dz))

    for r in range(ROWS):
        for c in range(COLS):
            ch = LAYOUT[r][c]
            x, z = cell_xz(r, c)
            fy = floor_y(ch)
            kind = ROOMS[ch][1]
            col, mat = {
                "corridor": (LINO, "SmoothPlastic"), "morgue": ((112, 120, 122), "Slate"),
                "surgery": ((128, 140, 138), "Slate"), "lobby": ((104, 96, 86), "Marble"),
                "cafeteria": (WOOD, "WoodPlanks"), "staff": ((96, 100, 104), "Slate"),
            }.get(kind, ((120, 116, 104), "SmoothPlastic"))
            jit = b.rng.uniform(-6, 6)
            col = tuple(max(0, min(255, k + jit)) for k in col)
            door_cell = any(rr == r and cc == c for rr, cc, _ in DOORS)
            if fy and door_cell:
                # ground-level floor here; steps() builds the stairs and the raised landing on top
                b.box("Floor", "Floor", CF(v(x, -0.5, z)), (C, 1, C), col, mat)
            elif fy:
                b.box("Floor", "Floor", CF(v(x, (fy - 1) / 2, z)), (C, fy + 1, C), col, mat)
            else:
                b.box("Floor", "Floor", CF(v(x, -0.5, z)), (C, 1, C), col, mat)
            b.box("Ceiling", "Ceiling", CF(v(x, WALL_H + 0.5, z)), (C, 1, C), CEIL, "Concrete")
            # walls on east/south edges between different rooms, and all edges facing outside
            for d, (nr, nc) in (("E", (r, c + 1)), ("S", (r + 1, c)), ("W", (r, c - 1)), ("N", (r - 1, c))):
                other = at(ch, nr, nc)
                if other == ch:
                    continue
                if d in ("W", "N") and other is not None:
                    continue  # the neighbour builds the shared wall
                wall(b, x, z, d, (r, c, d) in door_set, fy, floor_y(other) if other else 0)


def wall(b: Builder, x, z, d, door, fy_a, fy_b):
    base = min(fy_a, fy_b)
    if d in ("E", "W"):
        wx, wz, length, along = x + (C / 2 if d == "E" else -C / 2), z, C, "z"
    else:
        wx, wz, length, along = x, z + (C / 2 if d == "S" else -C / 2), C, "x"

    def seg(off, ln, y0, y1, color, mat):
        if ln <= 0.01 or y1 - y0 <= 0.01:
            return
        cx, cz = (wx, wz + off) if along == "z" else (wx + off, wz)
        size = (1, y1 - y0, ln) if along == "z" else (ln, y1 - y0, 1)
        b.box("Walls", "Wall", CF(v(cx, (y0 + y1) / 2, cz)), size, color, mat)

    def column(off, ln):
        seg(off, ln, base, base + TILE_H, TILE, "SmoothPlastic")
        seg(off, ln, base + TILE_H, WALL_H, PLASTER, "Concrete")

    if not door:
        column(0, length)
        return
    side = (length - DOOR_W) / 2
    column(-(DOOR_W / 2 + side / 2), side)
    column(DOOR_W / 2 + side / 2, side)
    seg(0, DOOR_W, base + DOOR_H, WALL_H, PLASTER, "Concrete")
    # a dark door frame
    for o in (-DOOR_W / 2, DOOR_W / 2):
        cx, cz = (wx, wz + o) if along == "z" else (wx + o, wz)
        b.box("Walls", "DoorFrame", CF(v(cx, base + DOOR_H / 2, cz)), (1.3, DOOR_H, 0.4) if along == "z" else
              (0.4, DOOR_H, 1.3), (60, 56, 50), "Wood", collide=False)


# ----------------------------------------------------------------------------------------- lights
def build_lights(b: Builder):
    for r in range(ROWS):
        for c in range(COLS):
            ch = LAYOUT[r][c]
            x, z = cell_xz(r, c)
            roll = b.rng.random()
            if roll < 0.32:  # broken fixture, dark
                p = b.box("Lights", "BrokenLamp", CF.angles(0, 0, b.rng.uniform(-0.25, 0.25), v(x, WALL_H - 0.3, z)),
                          (6, 0.3, 1.4), (70, 72, 70), "SmoothPlastic", collide=False, query=False)
                continue
            if roll > 0.82 and ROOMS[ch][1] == "corridor":
                continue
            flicker = b.rng.random() < 0.3
            p = b.box("Lights", "Lamp", CF(v(x, WALL_H - 0.2, z)), (6, 0.25, 1.4), (205, 225, 214), "Neon",
                      collide=False, query=False, shadow=False)
            p.add(light("SurfaceLight", "Glow", brightness=1.1, range_=19, color=(185, 212, 200), angle=120,
                        face="Bottom", shadows=b.rng.random() < 0.15))
            if flicker:
                p.tag("FlickerLight")
    # red emergency lamps by some doorways
    for (dx, dz) in b.doors[::3]:
        p = b.box("Lights", "EmergencyLamp", CF(v(dx, DOOR_H + 1.2, dz)), (0.8, 0.5, 0.8), (255, 40, 30), "Neon",
                  collide=False, query=False, shadow=False)
        p.add(light("PointLight", "Glow", brightness=0.8, range_=12, color=(255, 50, 35)))


# ----------------------------------------------------------------------------------------- props
def bed(b, x, z, yaw, fy=0.0, sheet=SHEET, covered=False):
    cf = CF.angles(0, yaw, 0, v(x, fy, z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    b.box("Props", "BedFrame", CF(pt(0, 1.4, 0), cf.R), (3.6, 0.4, 7.6), METAL, "Metal")
    b.box("Props", "Mattress", CF(pt(0, 2.0, 0.1), cf.R), (3.4, 0.8, 7.2), sheet, "Fabric")
    b.box("Props", "Pillow", CF(pt(0, 2.55, 2.9), cf.R), (2.6, 0.4, 1.2), (190, 186, 172), "Fabric", collide=False)
    for lx in (-1.6, 1.6):
        for lz in (-3.6, 3.6):
            b.box("Props", "Leg", CF(pt(lx, 0.6, lz), cf.R), (0.2, 1.2, 0.2), METAL_DK, "Metal", collide=False)
    b.box("Props", "Headboard", CF(pt(0, 2.6, 3.75), cf.R), (3.6, 2.4, 0.2), METAL, "Metal")
    if covered:  # a sheet over a shape; nothing graphic
        b.box("Props", "CoveredShape", CF(pt(0, 2.75, 0.2), cf.R), (1.8, 0.9, 5.6), (200, 196, 182), "Fabric",
              collide=False, ellipsoid=True)


def gurney(b, x, z, yaw, covered=False):
    cf = CF.angles(0, yaw, 0, v(x, 0, z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    b.box("Props", "Gurney", CF(pt(0, 2.6, 0), cf.R), (2.6, 0.3, 6.6), (150, 156, 160), "Metal")
    for lx in (-1.1, 1.1):
        for lz in (-3, 3):
            b.box("Props", "Wheel", CF.along(pt(lx - 0.2, 0.3, lz), pt(lx + 0.2, 0.3, lz)), (0.4, 0.6, 0.6), METAL_DK,
                  "Metal", collide=False, shape="Cylinder")
            b.box("Props", "Leg", CF(pt(lx, 1.5, lz), cf.R), (0.15, 2.2, 0.15), METAL_DK, "Metal", collide=False)
    if covered:
        b.box("Props", "CoveredShape", CF(pt(0, 3.2, 0), cf.R), (1.7, 0.8, 5.4), (196, 192, 178), "Fabric",
              collide=False, ellipsoid=True)


def wheelchair(b, x, z, yaw, tipped=False):
    cf = CF.angles(0, yaw, 1.3 if tipped else 0, v(x, 1.2 if tipped else 0, z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    b.box("Props", "Seat", CF(pt(0, 1.8, 0), cf.R), (2, 0.25, 2), (40, 40, 44), "Fabric")
    b.box("Props", "Back", CF(pt(0, 3.0, 0.95), cf.R), (2, 2.2, 0.2), (40, 40, 44), "Fabric")
    for lx in (-1.15, 1.15):
        b.box("Props", "Wheel", CF.along(pt(lx - 0.1, 1.4, 0.2), pt(lx + 0.1, 1.4, 0.2)), (0.2, 2.6, 2.6), METAL_DK,
              "Metal", collide=False, shape="Cylinder")


def iv_stand(b, x, z):
    b.box("Props", "IVPole", CF.along(v(x, 0, z), v(x, 6.5, z)), (6.5, 0.15, 0.15), METAL, "Metal", collide=False,
          shape="Cylinder")
    b.box("Props", "IVBag", CF(v(x + 0.3, 5.8, z)), (0.5, 0.9, 0.2), (190, 200, 205), "Glass", collide=False,
          transparency=0.3)


def shelf(b, x, z, yaw):
    cf = CF.angles(0, yaw, 0, v(x, 0, z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    for ly in (0.4, 2.4, 4.4, 6.4):
        b.box("Props", "Shelf", CF(pt(0, ly, 0), cf.R), (6, 0.2, 2), METAL, "Metal")
        for k in range(b.rng.randint(0, 3)):
            s = b.rng.uniform(0.9, 1.6)
            b.box("Props", "Box", CF(pt(b.rng.uniform(-2.3, 2.3), ly + 0.1 + s / 2, 0), cf.R) * CF.angles(0, b.rng.uniform(-0.3, 0.3), 0),
                  (s * 1.2, s, s), (128, 106, 76), "Fabric", collide=False)
    for lx in (-2.9, 2.9):
        for lz in (-0.9, 0.9):
            b.box("Props", "Post", CF(pt(lx, 3.5, lz), cf.R), (0.15, 7, 0.15), METAL_DK, "Metal", collide=False)


def counter(b, x, z, length, yaw, h=4.0, color=WOOD, fy=0.0):
    b.box("Props", "Counter", CF.angles(0, yaw, 0, v(x, fy + h / 2, z)), (length, h, 2.2), color, "Wood")
    b.box("Props", "CounterTop", CF.angles(0, yaw, 0, v(x, fy + h + 0.1, z)), (length + 0.3, 0.2, 2.5),
          (160, 150, 130), "Marble")


def chair(b, x, z, yaw, fy=0.0, fallen=False):
    cf = CF.angles(0 if not fallen else 1.4, yaw, 0, v(x, fy + (0.8 if fallen else 0), z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    b.box("Props", "ChairSeat", CF(pt(0, 1.9, 0), cf.R), (1.8, 0.25, 1.8), (70, 60, 52), "Wood", collide=False)
    b.box("Props", "ChairBack", CF(pt(0, 3.0, 0.85), cf.R), (1.8, 2.0, 0.2), (70, 60, 52), "Wood", collide=False)
    for lx in (-0.75, 0.75):
        for lz in (-0.75, 0.75):
            b.box("Props", "ChairLeg", CF(pt(lx, 0.9, lz), cf.R), (0.15, 1.8, 0.15), METAL_DK, "Metal", collide=False)


def table(b, x, z, yaw, fy=0.0, w=5, d=3):
    b.box("Props", "Table", CF.angles(0, yaw, 0, v(x, fy + 3, z)), (w, 0.3, d), (110, 100, 88), "Wood")
    for lx in (-w / 2 + 0.3, w / 2 - 0.3):
        for lz in (-d / 2 + 0.3, d / 2 - 0.3):
            cf = CF.angles(0, yaw, 0, v(x, fy, z))
            b.box("Props", "TableLeg", CF(cf.point(v(lx, 1.5, lz)), cf.R), (0.25, 3, 0.25), METAL_DK, "Metal")


def debris(b, x0, z0, x1, z1, n, fy=0.0):
    for _ in range(n):
        x, z = b.rng.uniform(x0 + 1, x1 - 1), b.rng.uniform(z0 + 1, z1 - 1)
        if b.near_door(x, z, 4):
            continue
        k = b.rng.random()
        if k < 0.5:
            b.box("Debris", "Paper", CF.angles(0, b.rng.uniform(0, 3), 0, v(x, fy + 0.03, z)), (0.9, 0.04, 1.2),
                  (200, 196, 180), "SmoothPlastic", collide=False, query=False)
        elif k < 0.8:
            b.box("Debris", "CeilingTile", CF.angles(b.rng.uniform(-0.3, 0.3), b.rng.uniform(0, 3), b.rng.uniform(-0.3, 0.3),
                                                     v(x, fy + 0.2, z)), (4, 0.3, 4), (90, 88, 82), "Concrete", collide=False)
        else:
            b.box("Debris", "Grime", CF(v(x, fy + 0.02, z)), (b.rng.uniform(2, 4), 0.03, b.rng.uniform(2, 4)), GRIME,
                  "SmoothPlastic", collide=False, query=False, transparency=0.7, ellipsoid=True)


def hide_spot(b, x, z, yaw, kind="Locker", fy=0.0):
    """A locker or closet you can hide in. Front faces -Z in local space."""
    w, h, d = (3.8, 7.6, 2.9) if kind == "Locker" else (5.0, 8.2, 3.3)
    color = (74, 92, 104) if kind == "Locker" else (88, 66, 48)
    mat = "Metal" if kind == "Locker" else "Wood"
    cf = CF.angles(0, yaw, 0, v(x, fy, z))
    pt = lambda lx, ly, lz: cf.point(v(lx, ly, lz))  # noqa: E731
    m = Inst("Model", kind)
    m.tag("HideSpot")
    t = 0.18

    def piece(name, lx, ly, lz, size, col=color, collide=True):
        p = part(name, CF(pt(lx, ly, lz), cf.R), size, col, mat, anchored=True, collide=collide)
        m.add(p)
        return p

    piece("Back", 0, h / 2, d / 2 - t / 2, (w, h, t))
    piece("Left", -w / 2 + t / 2, h / 2, 0, (t, h, d))
    piece("Right", w / 2 - t / 2, h / 2, 0, (t, h, d))
    piece("Top", 0, h - t / 2, 0, (w, t, d))
    piece("Base", 0, t / 2, 0, (w, t, d))
    # door: solid panel with a band of vent slats at eye height (you can peek out between them)
    eye0, eye1 = 4.4, 5.6
    door = part("Door", CF(pt(0, eye0 / 2, -d / 2 + t / 2), cf.R), (w - 0.1, eye0, t), color, mat, anchored=True,
                collide=True)
    m.add(door)
    top_h = h - eye1
    door.add(part("DoorTop", CF(pt(0, eye1 + top_h / 2, -d / 2 + t / 2), cf.R), (w - 0.1, top_h, t), color, mat,
                  anchored=True, collide=True))
    slats = 5
    for k in range(slats):
        y = eye0 + (k + 0.5) * (eye1 - eye0) / slats
        door.add(part("Slat", CF(pt(0, y, -d / 2 + t / 2), cf.R) * CF.angles(0.5, 0, 0), (w - 0.1, 0.1, 0.3), color,
                      mat, anchored=True, collide=False))
    door.add(part("Handle", CF(pt(w / 2 - 0.5, 3.6, -d / 2 - 0.05), cf.R), (0.15, 0.8, 0.15), (40, 40, 42), "Metal",
                  anchored=True, collide=False))
    # where you stand inside (facing out through the door), and where you step out to (facing away)
    inside = part("Inside", CF(pt(0, 3.0, 0.1), cf.R), (1, 1, 1), (0, 0, 0),
                  anchored=True, collide=False, transparency=1, query=False)
    inside.meta["hidden"] = True
    front = part("Front", CF(pt(0, 3.0, -d / 2 - 2.6), cf.R), (1, 1, 1), (0, 0, 0),
                 anchored=True, collide=False, transparency=1, query=False)
    front.meta["hidden"] = True
    m.add(inside, front)
    b.group("HidingSpots").add(m)


def against(bounds, side, t, inset):
    """Point along a room wall: side N/S/E/W, t in 0..1 along it, inset from the wall. Returns x, z, yaw facing in."""
    x0, z0, x1, z1 = bounds
    if side == "N":
        return x0 + (x1 - x0) * t, z0 + inset, math.pi  # local -Z (front) faces +Z, into the room
    if side == "S":
        return x0 + (x1 - x0) * t, z1 - inset, 0.0
    if side == "W":
        return x0 + inset, z0 + (z1 - z0) * t, -math.pi / 2
    return x1 - inset, z0 + (z1 - z0) * t, math.pi / 2


def furnish(b: Builder, ch):
    name, kind = ROOMS[ch]
    bounds = room_bounds(ch)
    x0, z0, x1, z1 = bounds
    fy = floor_y(ch)
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    rng = b.rng

    def spot(side, t, kind_="Locker", inset=None):
        x, z, yaw = against(bounds, side, t, inset if inset is not None else (1.6 if kind_ == "Locker" else 1.8))
        if not b.near_door(x, z, 5.5):
            hide_spot(b, x, z, yaw, kind_, fy)

    if kind == "ward":
        for i in range(6):
            t = (i + 0.5) / 6
            for side, zz, yaw in (("N", z0 + 4.6, math.pi), ("S", z1 - 4.6, 0.0)):
                x = x0 + (x1 - x0) * t
                if b.near_door(x, zz, 6):
                    continue
                bed(b, x, zz, yaw, covered=rng.random() < 0.15)
                if rng.random() < 0.6:
                    iv_stand(b, x + 2.6, zz + (1.5 if side == "N" else -1.5))
                # privacy curtain between beds (hides you from its eyes)
                if i < 5 and rng.random() < 0.75:
                    cxp = x0 + (x1 - x0) * (i + 1) / 6
                    b.box("Props", "Curtain", CF(v(cxp, 5.2, zz)), (0.12, 8.5, 7), (150, 170, 160), "Fabric",
                          collide=False, transparency=0.05)
        spot("W", 0.25, "Closet")
        spot("E", 0.7, "Closet")
        debris(b, x0, z0, x1, z1, 10)
    elif kind == "private":
        side = "N" if cz < 0 else "S"
        bx, bz, byaw = against(bounds, side, 0.5, 4.6)
        bed(b, bx, bz, byaw, covered=rng.random() < 0.3)
        iv_stand(b, bx + 2.8, bz)
        chair(b, bx - 3.2, bz + (3 if side == "N" else -3), rng.uniform(0, 6), fallen=rng.random() < 0.4)
        spot("E" if rng.random() < 0.5 else "W", 0.5, "Closet")
        debris(b, x0, z0, x1, z1, 5)
    elif kind == "storage":
        for t in (0.25, 0.75):
            x, z, yaw = against(bounds, "W", t, 1.4)
            if not b.near_door(x, z, 5):
                shelf(b, x, z, yaw + math.pi / 2)
        spot("E", 0.4, "Closet")
        debris(b, x0, z0, x1, z1, 6)
    elif kind == "surgery":
        table(b, cx, cz, 0, w=3, d=7.5)
        lamp = b.box("Props", "SurgeryLamp", CF.along(v(cx, WALL_H - 2.6, cz), v(cx, WALL_H - 2.2, cz)), (0.4, 4, 4),
                     (210, 215, 205), "Neon", collide=False, shape="Cylinder")
        lamp.add(light("SpotLight", "Beam", brightness=2.5, range_=16, color=(220, 235, 230), angle=60, face="Left",
                       shadows=True))
        lamp.tag("FlickerLight")
        b.box("Props", "LampArm", CF.along(v(cx, WALL_H - 2.2, cz), v(cx, WALL_H, cz)), (2.2, 0.3, 0.3), METAL,
              "Metal", collide=False, shape="Cylinder")
        for k in range(3):
            tx, tz = cx + rng.uniform(-9, 9), cz + rng.uniform(-9, 9)
            if not b.near_door(tx, tz):
                table(b, tx, tz, rng.uniform(0, 3), w=2.5, d=1.6)
        gurney(b, x0 + 4, z1 - 5, 0.2, covered=True)
        debris(b, x0, z0, x1, z1, 6)
    elif kind == "morgue":
        # wall of body-fridge doors
        for i in range(8):
            for j in range(3):
                x = x0 + 4 + i * 5
                if b.near_door(x, z0 + 0.6, 5):
                    continue
                b.box("Props", "FridgeDoor", CF(v(x, 1.8 + j * 3.2, z0 + 0.65)), (4.4, 2.9, 0.3), (150, 156, 158),
                      "Metal")
                b.box("Props", "Handle", CF(v(x + 1.5, 1.8 + j * 3.2, z0 + 0.9)), (0.2, 0.9, 0.2), METAL_DK, "Metal",
                      collide=False)
        for k, (ox, oz) in enumerate(((-9, 4), (6, 5), (-2, 11))):
            gurney(b, cx + ox, cz + oz, rng.uniform(-0.4, 0.4), covered=k != 2)
        spot("W", 0.6)
        spot("S", 0.85)
        spot("E", 0.4)
        b.box("Props", "Drain", CF(v(cx, 0.03, cz)), (1.2, 0.05, 1.2), (30, 30, 30), "Metal", collide=False)
        b.box("Debris", "OldStain", CF(v(cx + 3, 0.03, cz - 2)), (3, 0.03, 2), OLD_BLOOD, "SmoothPlastic",
              collide=False, query=False, ellipsoid=True, transparency=0.2)
    elif kind == "staff":
        for t in (0.2, 0.4, 0.6, 0.8):
            spot("W", t)
        for t in (0.25, 0.5, 0.75):
            spot("N", t)
        b.box("Props", "Bench", CF(v(cx + 2, 1.2, cz)), (2, 0.4, 10), WOOD, "Wood")
        table(b, cx + 9, cz + 6, 0.3)
        debris(b, x0, z0, x1, z1, 5)
    elif kind == "lobby":
        counter(b, cx + 6, z0 + 7, 14, 0)
        counter(b, cx + 13.2, z0 + 11.5, 7, math.pi / 2)
        for row in range(3):
            for k in range(6):
                x = x0 + 6 + k * 2.4
                z = cz + 2 + row * 4
                if not b.near_door(x, z):
                    chair(b, x, z, math.pi, fallen=rng.random() < 0.2)
        # chained main doors on the outer wall
        b.box("Props", "MainDoors", CF(v(cx, 5.5, z1 - 0.7)), (10, 11, 0.4), (70, 80, 85), "Metal")
        b.box("Props", "Chain", CF(v(cx, 5, z1 - 1.0)) * CF.angles(0, 0, 0.4), (8, 0.4, 0.4), (60, 60, 62), "Metal",
              collide=False)
        b.box("Props", "Plank", CF(v(cx, 7.5, z1 - 1.1)) * CF.angles(0, 0, -0.3), (11, 0.9, 0.3), WOOD, "Wood",
              collide=False)
        sign(b, "EXIT", v(cx, 12.6, z1 - 1.0), 0.0, (255, 60, 50))
        spot("W", 0.3, "Closet")
        debris(b, x0, z0, x1, z1, 8)
    elif kind == "cafeteria":
        for k in range(3):
            tx, tz = cx + rng.uniform(-5, 4), z0 + 7 + k * 10
            table(b, tx, tz, rng.uniform(-0.2, 0.2), fy)
            for o in (-2.6, 2.6):
                chair(b, tx + o, tz, math.pi / 2 if o < 0 else -math.pi / 2, fy, fallen=rng.random() < 0.3)
        counter(b, x1 - 2.2, cz - 4, 18, math.pi / 2, color=(110, 110, 112), fy=fy)
        debris(b, x0, z0, x1, z1, 6, fy)
    elif kind == "corridor":
        pass

    if kind != "corridor":
        sign(b, name.upper(), None, None, (230, 230, 220), ch=ch)


def sign(b: Builder, text, pos, yaw, color, ch=None):
    """A sign board; its text is drawn at runtime by MapSetup (a SurfaceGui), stored in a StringValue."""
    if pos is None:
        # put room signs on the corridor side above the first doorway of the room
        for r, c, d in DOORS:
            if LAYOUT[r][c] == ch:
                x, z = cell_xz(r, c)
                dx, dz = {"N": (0, -C / 2), "S": (0, C / 2), "E": (C / 2, 0), "W": (-C / 2, 0)}[d]
                out = {"N": (0, -0.7), "S": (0, 0.7), "E": (0.7, 0), "W": (-0.7, 0)}[d]
                pos = v(x + dx + out[0], DOOR_H + 1.6, z + dz + out[1])
                yaw = {"N": 0.0, "S": math.pi, "E": -math.pi / 2, "W": math.pi / 2}[d]
                break
        if pos is None:
            return
    p = b.box("Signs", "Sign", CF.angles(0, yaw, 0, pos), (6, 1.4, 0.2), (30, 34, 32), "SmoothPlastic", collide=False)
    val = Inst("StringValue", "Text")
    val.set("Value", "string", text)
    val2 = Inst("Color3Value", "Color")
    val2.set("Value", "Color3", color)
    p.add(val, val2)


def corridor_dressing(b: Builder):
    rng = b.rng
    cells = room_cells("#")
    rng.shuffle(cells)
    placed_lockers = 0
    for (r, c) in cells:
        x, z = cell_xz(r, c)
        k = rng.random()
        # push props against a wall that has no neighbour corridor
        walls = [(d, (dr, dc)) for d, (dr, dc) in (("N", (-1, 0)), ("S", (1, 0)), ("W", (0, -1)), ("E", (0, 1)))
                 if at("#", r + dr, c + dc) != "#"]
        if not walls:
            continue
        d, _ = rng.choice(walls)
        off = {"N": (0, -C / 2 + 2.2), "S": (0, C / 2 - 2.2), "W": (-C / 2 + 2.2, 0), "E": (C / 2 - 2.2, 0)}[d]
        px, pz = x + off[0], z + off[1]
        if b.near_door(px, pz, 6.5):
            continue
        yaw = {"N": math.pi, "S": 0.0, "W": -math.pi / 2, "E": math.pi / 2}[d]
        if k < 0.12 and placed_lockers < 5:
            ix, iz = x + off[0] * 0.75, z + off[1] * 0.75
            hide_spot(b, ix, iz, yaw, "Locker")
            placed_lockers += 1
        elif k < 0.28:
            gurney(b, px, pz, yaw + math.pi / 2 + rng.uniform(-0.2, 0.2), covered=rng.random() < 0.25)
        elif k < 0.4:
            wheelchair(b, px, pz, yaw + rng.uniform(-0.6, 0.6), tipped=rng.random() < 0.35)
        elif k < 0.5:
            b.box("Props", "Bench", CF.angles(0, yaw, 0, v(px, 1.2, pz)), (6, 0.4, 1.6), WOOD, "Wood")
    for (r, c) in room_cells("#"):
        x, z = cell_xz(r, c)
        debris(b, x - C / 2, z - C / 2, x + C / 2, z + C / 2, rng.randint(0, 2))
    # old dried stains (kept small: "light" realistic blood)
    for _ in range(3):
        r, c = rng.choice(room_cells("#"))
        x, z = cell_xz(r, c)
        b.box("Debris", "OldStain", CF(v(x + rng.uniform(-3, 3), 0.03, z + rng.uniform(-3, 3))),
              (rng.uniform(1.5, 3), 0.03, rng.uniform(1, 2)), OLD_BLOOD, "SmoothPlastic", collide=False, query=False,
              ellipsoid=True, transparency=0.25)


def steps(b: Builder):
    """Stairs up into the raised cafeteria (so feet have something to climb), then a landing."""
    for r, c, d in DOORS:
        ch = LAYOUT[r][c]
        if ch not in RAISED:
            continue
        x, z = cell_xz(r, c)
        fy = RAISED[ch]
        n, depth = int(round(fy)), 1.5
        # unit vector pointing into the room from the door edge
        ix, iz = {"W": (1, 0), "E": (-1, 0), "N": (0, 1), "S": (0, -1)}[d]
        edge_x, edge_z = x - ix * C / 2, z - iz * C / 2
        for k in range(n):
            dist = 0.5 + depth * (k + 0.5)
            sx, sz = edge_x + ix * dist, edge_z + iz * dist
            h = (k + 1) * fy / n
            size = (depth, h, C) if ix else (C, h, depth)
            b.box("Floor", "Step", CF(v(sx, h / 2, sz)), size, (96, 86, 74), "Concrete")
        used = 0.5 + depth * n
        rest = C - used
        lx, lz = edge_x + ix * (used + rest / 2), edge_z + iz * (used + rest / 2)
        size = (rest, fy, C) if ix else (C, fy, rest)
        b.box("Floor", "Landing", CF(v(lx, fy / 2, lz)), size, WOOD, "WoodPlanks")


def nav_points(b: Builder):
    for ch in ROOMS:
        if ch == "#":
            continue
        x0, z0, x1, z1 = room_bounds(ch)
        p = b.box("Nav", "NavPoint", CF(v((x0 + x1) / 2, floor_y(ch) + 3, (z0 + z1) / 2)), (1, 1, 1), (0, 0, 0),
                  collide=False, query=False, transparency=1)
        p.meta["hidden"] = True
        p.tag("NavPoint")
    for i, (r, c) in enumerate(room_cells("#")):
        if i % 3 == 0:
            x, z = cell_xz(r, c)
            p = b.box("Nav", "NavPoint", CF(v(x, 3, z)), (1, 1, 1), (0, 0, 0), collide=False, query=False,
                      transparency=1)
            p.meta["hidden"] = True
            p.tag("NavPoint")


def build_hospital(seed=31):
    b = Builder(seed)
    build_shell(b)
    build_lights(b)
    for ch in ROOMS:
        furnish(b, ch)
    corridor_dressing(b)
    steps(b)
    nav_points(b)
    # outside: a big dark ground so nothing looks like a void through broken windows
    b.box("Floor", "Ground", CF(v(0, -2, 0)), (400, 2, 400), (20, 22, 20), "Ground")
    return b


def spawn_point():
    x0, z0, x1, z1 = room_bounds("L")
    return v((x0 + x1) / 2 - 8, 0, (z0 + z1) / 2 + 6)


def creature_point():
    x0, z0, x1, z1 = room_bounds("M")
    return v((x0 + x1) / 2 + 4, 0, (z0 + z1) / 2 + 2)
