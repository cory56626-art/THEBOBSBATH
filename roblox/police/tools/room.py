"""Precinct 9: the town of Northfield and its highway loop.

Everything is flat at ground level (roads and sidewalks are paint on the ground) so cars never catch on curbs.
build_room() -> (map Model, [extra workspace instances]).
  World/Spots: CFrame markers for parked civilian cars ("CivSpot") and police parking ("PoliceSpot")
  World/Station/BookingZone, World/Jail/Cell1..4, World/Hideout/HideoutSpawn, World/Station/CopSpawn,
  World/Blocks/CivSpawn (civilians), World/Blocks/GunStore, World/Blocks/TaxiStand
"""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, light, part, v

GRID = [-360, -180, 0, 180, 360]  # road centre lines (both directions)
ROAD_W = 30
WALK = 8
HWY = 560
HWY_W = 52
EDGE = 700

ASPHALT = (52, 54, 58)
HWY_ASPHALT = (60, 62, 66)
SIDEWALK = (176, 172, 166)
LOT = (120, 120, 124)
GRASS = (88, 140, 70)
WHITE = (235, 235, 230)
YELLOW = (240, 200, 60)
BRICK = (150, 82, 64)


def box(parent, name, cf, size, color, mat="SmoothPlastic", **kw):
    kw.setdefault("collide", True)
    p = part(name, cf, size, color, mat, anchored=True, **kw)
    parent.add(p)
    return p


def paint(parent, name, x, z, sx, sz, color, mat="SmoothPlastic", y=0.03, rot=0.0):
    """A flat strip painted on the ground (no collision: cars ride on the ground underneath)."""
    return box(parent, name, CF.angles(0, rot, 0, v(x, y, z)), (sx, 0.05, sz), color, mat, collide=False)


def sign(parent, cf, size, text, color=(30, 34, 50), text_color=(255, 255, 255)):
    s = box(parent, "SignBoard", cf, size, color, "SmoothPlastic", collide=False)
    s.add(Inst("StringValue", "Text", Value=("string", text)))
    s.add(Inst("Color3Value", "TextColor", Value=("Color3", text_color)))
    return s


def windows(parent, cx, cz, w, d, h, floors, color=(90, 140, 190), y0=0.0, skip_front=False):
    """Rows of glowing glass windows around a box building."""
    fh = h / floors
    for f in range(floors):
        y = y0 + fh * (f + 0.55)
        for side in range(4):
            if skip_front and side == 0 and f == 0:
                continue
            if side in (0, 1):  # +z / -z faces
                zz = cz + (d / 2 + 0.06) * (1 if side == 0 else -1)
                box(parent, "Window", CF(v(cx, y, zz)), (w * 0.86, fh * 0.45, 0.12), color, "Glass", collide=False,
                    transparency=0.1)
            else:
                xx = cx + (w / 2 + 0.06) * (1 if side == 2 else -1)
                box(parent, "Window", CF(v(xx, y, cz)), (0.12, fh * 0.45, d * 0.86), color, "Glass", collide=False,
                    transparency=0.1)


def building(parent, name, cx, cz, w, d, h, color, mat="Concrete", floors=2, roof=(70, 70, 76), win=(90, 140, 190)):
    m = Inst("Model", name)
    box(m, "Walls", CF(v(cx, h / 2, cz)), (w, h, d), color, mat)
    box(m, "Roof", CF(v(cx, h + 0.4, cz)), (w + 1.2, 0.8, d + 1.2), roof, "Slate")
    box(m, "RoofUnit", CF(v(cx + w * 0.2, h + 1.8, cz - d * 0.15)), (6, 2.2, 5), (150, 150, 155), "Metal")
    windows(m, cx, cz, w, d, h, floors, win)
    parent.add(m)
    return m


def tree(parent, rng, x, z, scale=1.0):
    h = rng.uniform(6, 9) * scale
    box(parent, "Trunk", CF.along(v(x, 0, z), v(x, h, z)), (h, 1.2 * scale, 1.2 * scale), (96, 70, 50), "Wood",
        shape="Cylinder")
    for _ in range(3):
        r = rng.uniform(4, 5.5) * scale
        off = v(rng.uniform(-1.5, 1.5), h + rng.uniform(-0.5, 2.5), rng.uniform(-1.5, 1.5))
        box(parent, "Leaves", CF(add(v(x, 0, z), off)), (r * 1.3, r, r * 1.3),
            tuple(int(c * rng.uniform(0.85, 1.1)) for c in (62, 120, 58)), "Grass", ellipsoid=True)


def streetlight(parent, x, z, facing):
    """facing: unit (dx, dz) from the pole toward the road."""
    box(parent, "LampPole", CF(v(x, 7, z)), (0.6, 14, 0.6), (60, 62, 68), "Metal")
    ax, az = x + facing[0] * 3, z + facing[1] * 3
    box(parent, "LampArm", CF.along(v(x, 13.6, z), v(ax, 13.6, az)), (3.2, 0.4, 0.4), (60, 62, 68), "Metal")
    bulb = box(parent, "LampBulb", CF(v(ax, 13.2, az)), (1.6, 0.4, 1.0), (255, 236, 190), "Neon", collide=False)
    bulb.add(light("SpotLight", "Glow", brightness=2.5, range_=34, color=(255, 226, 180), angle=110, face="Bottom"))


def traffic_light(parent, x, z, facing):
    m = Inst("Model", "TrafficLight")
    box(m, "Pole", CF(v(x, 8, z)), (0.7, 16, 0.7), (50, 52, 56), "Metal")
    hx, hz = x + facing[0] * 5, z + facing[1] * 5
    box(m, "Arm", CF.along(v(x, 15.4, z), v(hx, 15.4, hz)), (5.2, 0.5, 0.5), (50, 52, 56), "Metal")
    box(m, "Housing", CF(v(hx, 13.6, hz)), (1.6, 4.4, 1.6), (30, 30, 32), "Metal")
    for i, (nm, col) in enumerate((("Red", (255, 50, 40)), ("Amber", (255, 180, 40)), ("Green", (60, 230, 90)))):
        lamp = box(m, "Lamp" + nm, CF(v(hx, 15 - i * 1.4, hz)), (1.0, 1.0, 1.8), col, "Neon", collide=False,
                   transparency=0.7)
        lamp.meta["shape"] = "Block"
    parent.add(m)


def road_x(parent, z, x0, x1, width, center="double"):
    """A road running along x at z."""
    paint(parent, "Road", (x0 + x1) / 2, z, x1 - x0, width, ASPHALT, "Asphalt", y=0.04)
    if center == "double":
        for dz in (-0.35, 0.35):
            paint(parent, "LineYellow", (x0 + x1) / 2, z + dz, x1 - x0, 0.3, YELLOW, y=0.09)
    for e in (-1, 1):
        paint(parent, "LineEdge", (x0 + x1) / 2, z + e * (width / 2 - 1), x1 - x0, 0.3, WHITE, y=0.09)


def road_z(parent, x, z0, z1, width, center="double"):
    paint(parent, "Road", x, (z0 + z1) / 2, width, z1 - z0, ASPHALT, "Asphalt", y=0.04)
    if center == "double":
        for dx in (-0.35, 0.35):
            paint(parent, "LineYellow", x + dx, (z0 + z1) / 2, 0.3, z1 - z0, YELLOW, y=0.09)
    for e in (-1, 1):
        paint(parent, "LineEdge", x + e * (width / 2 - 1), (z0 + z1) / 2, 0.3, z1 - z0, WHITE, y=0.09)


def car_spot(parent, name, x, z, yaw):
    s = box(parent, name, CF.angles(0, yaw, 0, v(x, 1, z)), (1, 1, 1), (255, 255, 255), collide=False,
            transparency=1, query=False)
    s.meta["hidden"] = True
    return s


def build_station(world, rng):
    """Precinct 9 HQ: the station, the booking garage, the jail wing and the police lot (block -90,-90)."""
    st = Inst("Model", "Station")
    bx, bz = -98, -134  # main building
    box(st, "Walls", CF(v(bx, 13, bz)), (84, 26, 40), (200, 196, 186), "Concrete")
    box(st, "Base", CF(v(bx, 1.5, bz)), (85, 3, 41), (120, 118, 114), "Concrete")
    box(st, "Roof", CF(v(bx, 26.4, bz)), (86, 0.8, 42), (60, 62, 70), "Slate")
    box(st, "Band", CF(v(bx, 18, bz)), (84.4, 1.6, 40.4), (30, 60, 140), "SmoothPlastic")
    windows(st, bx, bz, 84, 40, 26, 2, (110, 160, 210))
    # entrance canopy and doors facing the lot (+z)
    box(st, "Canopy", CF(v(bx, 11, bz + 24)), (22, 0.8, 8), (40, 44, 54), "Metal")
    for sx in (-10, 10):
        box(st, "CanopyPost", CF(v(bx + sx, 5.5, bz + 27.5)), (0.8, 11, 0.8), (40, 44, 54), "Metal")
    box(st, "Doors", CF(v(bx, 4.5, bz + 20.1)), (10, 9, 0.3), (120, 170, 220), "Glass", collide=False,
        transparency=0.3)
    sign(st, CF.look(v(bx, 22, bz + 20.3), v(0, 0, 1)), (40, 5, 0.4), "PRECINCT 9 POLICE", (20, 40, 100))
    # flag pole
    box(st, "FlagPole", CF(v(bx - 30, 12, bz + 30)), (0.6, 24, 0.6), (200, 200, 205), "Metal")
    box(st, "Flag", CF(v(bx - 27, 21.5, bz + 30)), (6, 3.6, 0.2), (30, 60, 150), "Fabric", collide=False)
    # the booking garage (sally port): drive in or walk suspects in here to book them
    gx, gz = -36, -132
    box(st, "GarageBack", CF(v(gx, 9, gz - 16)), (34, 18, 2), (180, 176, 168), "Concrete")
    for sx in (-1, 1):
        box(st, "GarageSide", CF(v(gx + sx * 16, 9, gz)), (2, 18, 34), (180, 176, 168), "Concrete")
    box(st, "GarageRoof", CF(v(gx, 18.4, gz)), (36, 0.8, 36), (60, 62, 70), "Slate")
    paint(st, "GarageFloor", gx, gz, 30, 32, (90, 90, 96), "Concrete", y=0.06)
    zone = box(st, "BookingZone", CF(v(gx, 4, gz)), (28, 8, 30), (255, 220, 60), collide=False, transparency=1,
               query=False)
    zone.meta["hidden"] = True
    for k in range(6):
        paint(st, "HazardStripe", gx - 12 + k * 4.8, gz + 16, 2.4, 1.2, YELLOW, y=0.11)
    sign(st, CF.look(v(gx, 15, gz + 17.2), v(0, 0, 1)), (24, 3.4, 0.4), "BOOKING", (150, 110, 20))
    # the lot
    lot = paint(st, "Lot", -90, -62, 140, 70, LOT, "Asphalt", y=0.09)
    lot.meta["hidden"] = False
    spots = Inst("Folder", "PoliceSpots")
    for i in range(8):
        x = -150 + i * 15
        for zrow, yaw in ((-46, math.pi), (-80, 0.0)):
            paint(st, "SpotLine", x - 7.5, zrow, 0.3, 16, WHITE, y=0.14)
            if i == 7:
                paint(st, "SpotLine", x + 7.5, zrow, 0.3, 16, WHITE, y=0.14)
            car_spot(spots, "PoliceSpot", x, zrow, yaw)
    st.add(spots)
    cop = box(st, "CopSpawn", CF.look(v(bx, 1, bz + 32), v(0, 0, 1)), (8, 1, 8), (30, 60, 150), collide=False,
              transparency=1, query=False)
    cop.meta["hidden"] = True
    world.add(st)
    # the jail wing: four cells with bars (jailed criminals wait here)
    jail = Inst("Model", "Jail")
    jx, jz = -150, -134
    box(jail, "JailWalls", CF(v(jx, 0.2, jz)), (24, 0.4, 40), (90, 92, 96), "Concrete")
    for k in range(4):
        cz = jz - 15 + k * 10
        cell = box(jail, f"Cell{k + 1}", CF(v(jx - 4, 3, cz)), (8, 1, 8), (90, 92, 96), collide=False, transparency=1,
                   query=False)
        cell.meta["hidden"] = True
        box(jail, "CellWall", CF(v(jx - 4, 6, cz - 5)), (12, 12, 0.6), (150, 150, 154), "Concrete")
        for b in range(9):
            box(jail, "Bars", CF(v(jx + 2.2, 6, cz - 4 + b)), (0.25, 12, 0.25), (70, 72, 78), "Metal")
    box(jail, "CellWall", CF(v(jx - 4, 6, jz + 25)), (12, 12, 0.6), (150, 150, 154), "Concrete")
    box(jail, "BackWall", CF(v(jx - 10.3, 6, jz + 5)), (0.6, 12, 40), (150, 150, 154), "Concrete")
    # the outside of the back wall: a weak, patched section (jailbreaks are breached here)
    box(jail, "Patch", CF(v(jx - 10.7, 4, jz)), (0.3, 7, 8), (128, 124, 120), "Brick")
    sign(jail, CF.look(v(jx - 10.9, 9, jz), v(-1, 0, 0)), (8, 1.4, 0.2), "COUNTY JAIL", (60, 62, 70))
    box(jail, "JailRoof", CF(v(jx - 4, 12.3, jz + 5)), (13, 0.6, 41), (60, 62, 70), "Slate")
    box(jail, "Corridor", CF(v(jx + 6, 6, jz + 5)), (0.6, 12, 40), (200, 196, 186), "Concrete")
    world.add(jail)


def build_house(parent, rng, cx, cz, facing):
    col = rng.choice([(230, 220, 200), (200, 215, 230), (230, 205, 190), (210, 225, 200), (240, 235, 225)])
    roof = rng.choice([(110, 60, 50), (70, 70, 80), (90, 80, 70)])
    m = Inst("Model", "House")
    box(m, "Walls", CF(v(cx, 6, cz)), (22, 12, 18), col, "WoodPlanks")
    for s in (-1, 1):
        box(m, "Roof", CF.angles(s * 0.55, 0, 0, v(cx, 14.6, cz + s * 4.6)), (24, 0.8, 11), roof, "Slate")
    box(m, "Gable", CF(v(cx, 14, cz)), (21.6, 4, 9), col, "WoodPlanks")
    door_z = cz + facing * 9.05
    box(m, "Door", CF(v(cx - 4, 4, door_z)), (3.6, 8, 0.3), (120, 70, 50), "Wood")
    for wx in (3, 8):
        box(m, "Window", CF(v(cx + wx - 2, 7, door_z)), (3.6, 3.6, 0.2), (150, 190, 220), "Glass", collide=False)
    paint(m, "Driveway", cx + 6, cz + facing * 19, 9, 20, (140, 138, 134), "Concrete", y=0.09)
    paint(m, "Path", cx - 4, cz + facing * 16, 3, 14, (190, 186, 180), "Concrete", y=0.1)
    box(m, "Mailbox", CF(v(cx - 9, 2, cz + facing * 27)), (0.8, 1, 1.4), (40, 60, 120), "Metal")
    box(m, "MailPost", CF(v(cx - 9, 0.8, cz + facing * 27)), (0.3, 1.6, 0.3), (90, 70, 50), "Wood")
    parent.add(m)


def build_room(seed=9):
    rng = random.Random(seed)
    world = Inst("Model", "World")
    box(world, "Ground", CF(v(0, -1, 0)), (EDGE * 2 + 40, 2, EDGE * 2 + 40), GRASS, "Grass")
    # boundary walls and hills
    for name, cf, size in (("BoundW", CF(v(-EDGE, 40, 0)), (2, 100, EDGE * 2)), ("BoundE", CF(v(EDGE, 40, 0)), (2, 100, EDGE * 2)),
                           ("BoundS", CF(v(0, 40, -EDGE)), (EDGE * 2, 100, 2)), ("BoundN", CF(v(0, 40, EDGE)), (EDGE * 2, 100, 2))):
        b = box(world, name, cf, size, (0, 0, 0), transparency=1, query=False)
        b.meta["hidden"] = True
    for k in range(40):
        a = k / 40 * math.pi * 2
        r = EDGE + 30 + rng.uniform(0, 30)
        sz = rng.uniform(50, 90)
        box(world, "Hill", CF(v(math.cos(a) * r, -6, math.sin(a) * r)), (sz * 1.6, sz * 0.7, sz * 1.3),
            tuple(int(c * rng.uniform(0.75, 0.95)) for c in GRASS), "Grass", ellipsoid=True, collide=False)

    roads = Inst("Model", "Roads")
    # town grid: blocks with sidewalks
    for bx in (-270, -90, 90, 270):
        for bz in (-270, -90, 90, 270):
            paint(roads, "Sidewalk", bx, bz, 150, 150, SIDEWALK, "Concrete", y=0.03)
    for g in GRID:
        x0, x1 = -375, 375
        if g == 0:
            x0, x1 = -HWY, HWY
        road_x(roads, g, x0, x1, ROAD_W)
        z0, z1 = -375, 375
        if g == 0:
            z0, z1 = -HWY, HWY
        road_z(roads, g, z0, z1, ROAD_W)
    # intersections: plain asphalt squares over the lines, with crosswalks and stop lines
    for gx in GRID:
        for gz in GRID:
            paint(roads, "Intersection", gx, gz, ROAD_W, ROAD_W, ASPHALT, "Asphalt", y=0.11)
            for k in range(6):
                off = -11 + k * 4.4
                paint(roads, "Crosswalk", gx + off, gz + ROAD_W / 2 + 3, 2.2, 5, WHITE, y=0.15)
                paint(roads, "Crosswalk", gx + off, gz - ROAD_W / 2 - 3, 2.2, 5, WHITE, y=0.15)
                paint(roads, "Crosswalk", gx + ROAD_W / 2 + 3, gz + off, 5, 2.2, WHITE, y=0.15)
                paint(roads, "Crosswalk", gx - ROAD_W / 2 - 3, gz + off, 5, 2.2, WHITE, y=0.15)
    # the highway loop (4 lanes) with dashed lane lines
    for s in (-1, 1):
        paint(roads, "Highway", 0, s * HWY, HWY * 2 + HWY_W, HWY_W, HWY_ASPHALT, "Asphalt", y=0.04)
        paint(roads, "Highway", s * HWY, 0, HWY_W, HWY * 2 + HWY_W, HWY_ASPHALT, "Asphalt", y=0.045)
        for lane in (-13, 13):
            for x in range(-HWY + 20, HWY - 10, 24):
                paint(roads, "LaneDash", x, s * HWY + lane, 10, 0.4, WHITE, y=0.09)
                paint(roads, "LaneDash", s * HWY + lane, x, 0.4, 10, WHITE, y=0.09)
        for dz in (-0.35, 0.35):
            paint(roads, "LineYellow", 0, s * HWY + dz, HWY * 2, 0.3, YELLOW, y=0.09)
            paint(roads, "LineYellow", s * HWY + dz, 0, 0.3, HWY * 2, YELLOW, y=0.09)
        # guard rails on the outside edge
        box(roads, "GuardRail", CF(v(0, 1.1, s * (HWY + HWY_W / 2 + 1))), (HWY * 2 + HWY_W, 1.2, 0.5), (190, 190, 196),
            "Metal")
        box(roads, "GuardRail", CF(v(s * (HWY + HWY_W / 2 + 1), 1.1, 0)), (0.5, 1.2, HWY * 2 + HWY_W), (190, 190, 196),
            "Metal")
    world.add(roads)

    props = Inst("Model", "StreetProps")
    for g in GRID:
        for t in range(-360, 361, 90):
            if t in GRID:
                continue
            streetlight(props, t, g + ROAD_W / 2 + 3, (0, -1))
            streetlight(props, g - ROAD_W / 2 - 3, t + 45 if t + 45 <= 360 else t - 45, (1, 0))
    for gx in (-180, 0, 180):
        for gz in (-180, 0, 180):
            traffic_light(props, gx + ROAD_W / 2 + 2, gz + ROAD_W / 2 + 2, (-1, 0))
            traffic_light(props, gx - ROAD_W / 2 - 2, gz - ROAD_W / 2 - 2, (1, 0))
    for k in range(-HWY, HWY + 1, 140):
        for s in (-1, 1):
            streetlight(props, k, s * (HWY + HWY_W / 2 + 3), (0, -s))
    world.add(props)

    spots = Inst("Folder", "Spots")
    build_station(world, rng)

    blocks = Inst("Model", "Blocks")
    # bank (90, -90)
    bank = building(blocks, "Bank", 90, -110, 80, 44, 22, (226, 220, 206), "Marble", 2, win=(120, 160, 190))
    for k in range(8):
        box(bank, "Column", CF.along(v(58 + k * 9, 0, -86), v(58 + k * 9, 20, -86)), (20, 2.4, 2.4), (240, 238, 230),
            "Marble", shape="Cylinder")
    box(bank, "Portico", CF(v(90, 20.8, -86)), (80, 1.6, 8), (240, 238, 230), "Marble")
    sign(bank, CF.look(v(90, 17.5, -85.6), v(0, 0, 1)), (34, 4, 0.4), "NORTHFIELD BANK", (60, 50, 30), (255, 220, 140))
    paint(blocks, "BankLot", 90, -45, 120, 40, LOT, "Asphalt", y=0.09)
    for i in range(6):
        car_spot(spots, "CivSpot", 45 + i * 16, -45, math.pi)
    # gas station + store (90, 90)
    gas = Inst("Model", "GasStation")
    box(gas, "Canopy", CF(v(70, 13, 90)), (56, 1.4, 34), (230, 230, 232), "SmoothPlastic")
    box(gas, "CanopyStripe", CF(v(70, 12.1, 90)), (56.4, 0.8, 34.4), (200, 40, 40), "Neon", collide=False)
    for sx in (-20, 20):
        for sz in (-10, 10):
            box(gas, "CanopyPost", CF(v(70 + sx, 6.2, 90 + sz)), (1.2, 12.4, 1.2), (220, 220, 224), "Metal")
    for k in range(4):
        px = 52 + k * 12
        box(gas, "Pump", CF(v(px, 2.6, 90)), (2.4, 5.2, 1.6), (220, 60, 50), "SmoothPlastic")
        box(gas, "PumpScreen", CF(v(px, 4, 90.82)), (1.6, 1.2, 0.1), (60, 200, 120), "Neon", collide=False)
    building(gas, "Store", 130, 110, 34, 26, 12, (220, 214, 200), "Brick", 1, win=(160, 200, 230))
    sign(gas, CF.look(v(130, 10.5, 97), v(0, 0, -1)), (22, 3, 0.4), "FUEL & GO", (180, 30, 30))
    sign(gas, CF.look(v(70, 14.6, 72.8), v(0, 0, -1)), (20, 2.4, 0.4), "FUEL & GO", (180, 30, 30))
    paint(gas, "GasLot", 90, 90, 140, 130, LOT, "Asphalt", y=0.09)
    blocks.add(gas)
    # gun store (civilians buy a pistol here)
    guns = building(blocks, "GunStore", 55, 142, 34, 22, 12, (120, 110, 100), "Brick", 1, win=(150, 170, 180))
    sign(guns, CF.look(v(55, 10, 130.6), v(0, 0, -1)), (20, 2.8, 0.4), "IRONSIDE ARMS", (40, 40, 44), (255, 190, 90))
    box(guns, "Door", CF(v(55, 4, 130.9)), (5, 8, 0.3), (60, 50, 40), "Wood")
    # taxi stand in the mall lot
    taxi = Inst("Model", "TaxiStand")
    box(taxi, "Post", CF(v(206, 4, 84)), (0.5, 8, 0.5), (60, 62, 68), "Metal")
    sign(taxi, CF.look(v(206, 8.6, 84), v(0, 0, -1)), (5, 1.8, 0.3), "TAXI", (250, 200, 30), (20, 20, 20))
    box(taxi, "Bench", CF(v(212, 1.2, 86)), (6, 0.4, 1.8), (120, 80, 50), "Wood")
    blocks.add(taxi)
    # town park (-90, 90)
    park = Inst("Model", "Park")
    paint(park, "Lawn", -90, 90, 134, 134, (96, 160, 80), "Grass", y=0.09)
    box(park, "FountainBase", CF.along(v(-90, 0, 90), v(-90, 1.6, 90)), (1.6, 18, 18), (190, 186, 180), "Concrete",
        shape="Cylinder")
    box(park, "FountainWater", CF.along(v(-90, 1.5, 90), v(-90, 1.7, 90)), (0.2, 16, 16), (80, 160, 220), "Glass",
        shape="Cylinder", collide=False, transparency=0.2)
    box(park, "FountainTop", CF.along(v(-90, 1.6, 90), v(-90, 6, 90)), (4.4, 2.4, 2.4), (190, 186, 180), "Concrete",
        shape="Cylinder")
    for k in range(4):
        a = k * math.pi / 2
        paint(park, "Path", -90 + math.cos(a) * 36, 90 + math.sin(a) * 36, 6 if k % 2 == 0 else 54,
              54 if k % 2 == 0 else 6, (200, 190, 170), "Concrete", y=0.14, rot=0)
    for _ in range(14):
        x, z = rng.uniform(-150, -30), rng.uniform(30, 150)
        if abs(x + 90) < 14 or abs(z - 90) < 14:
            continue
        tree(park, rng, x, z, rng.uniform(0.9, 1.2))
    for k in range(6):
        a = k / 6 * math.pi * 2
        bx_, bz_ = -90 + math.cos(a) * 20, 90 + math.sin(a) * 20
        box(park, "Bench", CF.angles(0, -a, 0, v(bx_, 1.2, bz_)), (1.6, 0.4, 5), (120, 80, 50), "Wood")
    blocks.add(park)
    # diner (270, -90)
    diner = building(blocks, "Diner", 270, -120, 60, 30, 12, (230, 230, 232), "SmoothPlastic", 1, win=(170, 210, 230))
    box(diner, "DinerStripe", CF(v(270, 9, -104.8)), (60.4, 1.4, 0.4), (200, 40, 50), "SmoothPlastic")
    sign(diner, CF.look(v(270, 15, -104.6), v(0, 0, 1)), (24, 4, 0.4), "STARLIGHT DINER", (200, 40, 60), (255, 240, 200))
    paint(blocks, "DinerLot", 270, -55, 130, 50, LOT, "Asphalt", y=0.09)
    for i in range(7):
        car_spot(spots, "CivSpot", 220 + i * 16, -55, math.pi)
    # strip mall (270, 90)
    for k, (nm, col) in enumerate((("GROCER", (60, 140, 70)), ("PHONE SHOP", (60, 90, 170)), ("PIZZA", (200, 120, 40)))):
        cx = 228 + k * 42
        building(blocks, "Shop", cx, 125, 40, 26, 12, (214, 206, 190), "Brick", 1, win=(170, 200, 220))
        sign(blocks, CF.look(v(cx, 10.5, 111.8), v(0, 0, -1)), (18, 2.6, 0.4), nm, col)
    paint(blocks, "MallLot", 270, 65, 130, 60, LOT, "Asphalt", y=0.09)
    for i in range(7):
        car_spot(spots, "CivSpot", 220 + i * 16, 62, 0.0)
    # car dealership lot (-270, -90): lots of cars to steal
    paint(blocks, "DealerLot", -270, -90, 134, 134, LOT, "Asphalt", y=0.09)
    building(blocks, "Dealership", -300, -140, 50, 24, 14, (230, 232, 236), "SmoothPlastic", 1, win=(140, 190, 230))
    sign(blocks, CF.look(v(-300, 12, -127.8), v(0, 0, 1)), (26, 3, 0.4), "NORTHFIELD MOTORS", (30, 30, 40),
         (120, 220, 255))
    for row, z in enumerate((-100, -70, -40)):
        for i in range(6):
            car_spot(spots, "CivSpot", -320 + i * 16, z, math.pi * (row % 2))
    # apartments (-270, 90)
    for k, h in ((0, 46), (1, 38)):
        building(blocks, "Apartments", -300 + k * 60, 100, 40, 34, h, (190, 170, 150), "Brick", h // 8,
                 win=(200, 190, 140))
    paint(blocks, "AptLot", -270, 40, 130, 30, LOT, "Asphalt", y=0.09)
    for i in range(7):
        car_spot(spots, "CivSpot", -320 + i * 16, 40, 0.0)
    civ = box(blocks, "CivSpawn", CF.look(v(-270, 1, 62), v(0, 0, -1)), (8, 1, 8), (60, 200, 120), collide=False,
              transparency=1, query=False)
    civ.meta["hidden"] = True
    # industrial and offices (row z = -270)
    building(blocks, "Offices", -270, -270, 60, 60, 64, (120, 140, 160), "Glass", 12, roof=(80, 84, 92),
             win=(140, 190, 230))
    building(blocks, "Factory", -90, -280, 100, 60, 20, (150, 140, 130), "CorrodedMetal", 2, win=(120, 130, 140))
    for k in range(3):
        box(blocks, "Chimney", CF.along(v(-120 + k * 25, 20, -290), v(-120 + k * 25, 46, -290)), (26, 5, 5),
            (140, 70, 60), "Brick", shape="Cylinder")
    building(blocks, "Warehouse", 90, -270, 110, 70, 18, (140, 150, 160), "CorrodedMetal", 1, win=(120, 130, 140))
    # the criminals' hideout (270, -270): a scrapyard behind a fence
    hide = Inst("Model", "Hideout")
    paint(hide, "Yard", 270, -270, 134, 134, (110, 104, 96), "Ground", y=0.09)
    building(hide, "Garage", 290, -300, 50, 40, 16, (120, 100, 90), "CorrodedMetal", 1, win=(90, 90, 90))
    sign(hide, CF.look(v(290, 13, -279.6), v(0, 0, 1)), (20, 3, 0.4), "JOE'S SCRAP", (90, 60, 30), (255, 200, 120))
    for k in range(5):
        col = rng.choice([(170, 60, 40), (40, 90, 150), (60, 120, 70), (200, 150, 40)])
        box(hide, "Container", CF.angles(0, rng.choice([0, math.pi / 2]), 0, v(220 + k * 12, 4.3, -230 - (k % 2) * 20)),
            (8, 8.6, 20), col, "CorrodedMetal")
    for s in (-1, 1):
        box(hide, "Fence", CF(v(270, 4, -270 + s * 66)), (130, 8, 0.4), (120, 124, 128), "DiamondPlate", transparency=0.3)
    hs = box(hide, "HideoutSpawn", CF.look(v(255, 1, -260), v(0, 0, 1)), (8, 1, 8), (255, 140, 40), collide=False,
             transparency=1, query=False)
    hs.meta["hidden"] = True
    blocks.add(hide)
    for i in range(5):
        car_spot(spots, "CivSpot", 225 + i * 14, -310, math.pi / 2)
    # suburbs (row z = 270): houses facing the streets
    for bx in (-270, -90, 90, 270):
        for k in range(3):
            build_house(blocks, rng, bx - 44 + k * 44, 228, 1)
            build_house(blocks, rng, bx - 44 + k * 44, 312, -1)
            car_spot(spots, "CivSpot", bx - 38 + k * 44, 248, 0.0)
        for _ in range(3):
            tree(blocks, rng, bx + rng.uniform(-60, 60), 270 + rng.uniform(-6, 6), rng.uniform(0.8, 1.1))
    # countryside outside the highway: trees and fields
    for _ in range(90):
        a = rng.uniform(0, math.pi * 2)
        r = rng.uniform(HWY + 50, EDGE - 20)
        x, z = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 25 or abs(z) < 25:
            continue
        tree(blocks, rng, x, z, rng.uniform(0.9, 1.4))
    for _ in range(20):
        a = rng.uniform(0, math.pi * 2)
        r = rng.uniform(400, HWY - 40)
        x, z = math.cos(a) * r, math.sin(a) * r
        if max(abs(x), abs(z)) < 395 or abs(x) < 25 or abs(z) < 25:
            continue
        tree(blocks, rng, x, z, rng.uniform(0.9, 1.3))
    world.add(blocks)
    world.add(spots)
    spawn = part("Spawn", CF.look(v(-98, 0.06, -100), v(0, 0, 1)), (10, 0.1, 10), (200, 200, 200), "SmoothPlastic",
                 cls="SpawnLocation", anchored=True, collide=False, transparency=1)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    return world, [spawn]
