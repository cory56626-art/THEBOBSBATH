"""Car templates built from parts (ServerStorage.Cars): a police cruiser and SUV, and civilian cars.

A car model: PrimaryPart "Chassis" (invisible collision box resting on the ground; the server adds the drive
constraints), welded body parts, Motor6D wheels the clients spin and steer, a VehicleSeat "DriveSeat", a
"Passenger" seat and two "RearSeat"s (suspects ride there). Origin: car centre on the ground, front = -Z.
"""
from __future__ import annotations

import math

from rbx import CF, Inst, part, v, weld, motor

BLACK = (24, 24, 28)
GLASS = (40, 50, 64)
CHROME = (180, 182, 188)


def build_car(name, kind, paint, police=False, length=15.0, width=7.0, height=5.4, cab_len=7.6, wheel_r=1.35,
              pickup=False, sports=False, suv=False):
    m = Inst("Model", name)
    m.add(Inst("StringValue", "Kind", Value=("string", kind)))
    parts = []
    L, W = length, width
    ride = 0.9 if not sports else 0.7

    def add(nm, cf, size, color, mat="SmoothPlastic", **kw):
        p = part(nm, cf, size, color, mat, anchored=False, collide=False, **kw)
        parts.append(p)
        return p

    chassis = part("Chassis", CF(v(0, 1.3, 0)), (W, 2.6, L), (0, 0, 0), anchored=False, collide=True, transparency=1)
    chassis.set("Massless", "bool", False)
    body_top = ride + (2.0 if not sports else 1.6)
    # lower body
    lower = add("Body", CF(v(0, ride + (body_top - ride) / 2, 0)), (W, body_top - ride, L), paint[0])
    lower.set("Reflectance", "float", 0.12)
    # hood and trunk slightly lower than the body line
    add("Hood", CF.angles(-0.06, 0, 0, v(0, body_top + 0.15, -L / 2 + (L - cab_len) * 0.3)), (W - 0.2, 0.4, (L - cab_len) * 0.6),
        paint[0]).set("Reflectance", "float", 0.12)
    if not pickup:
        add("Trunk", CF(v(0, body_top + 0.1, L / 2 - (L - cab_len) * 0.22)), (W - 0.2, 0.3, (L - cab_len) * 0.42), paint[0])
    # cabin with windows
    cab_h = (height - body_top) if not sports else (height - body_top - 0.3)
    cz = 0.6 if not pickup else -1.6
    cab = add("Cabin", CF(v(0, body_top + cab_h / 2, cz)), (W - 0.6, cab_h, cab_len), paint[1])
    cab.set("Reflectance", "float", 0.12)
    add("Windshield", CF.angles(0.55, 0, 0, v(0, body_top + cab_h * 0.5, cz - cab_len / 2 - 0.5)), (W - 0.8, cab_h * 1.1, 0.15),
        GLASS, "Glass", transparency=0.25)
    add("RearWindow", CF.angles(-0.5, 0, 0, v(0, body_top + cab_h * 0.5, cz + cab_len / 2 + 0.4)), (W - 0.8, cab_h, 0.15),
        GLASS, "Glass", transparency=0.25)
    for s in (-1, 1):
        add("SideWindow", CF(v(s * (W / 2 - 0.28), body_top + cab_h * 0.55, cz)), (0.12, cab_h * 0.62, cab_len * 0.86),
            GLASS, "Glass", transparency=0.25)
        add("Pillar", CF(v(s * (W / 2 - 0.26), body_top + cab_h * 0.55, cz)), (0.14, cab_h * 0.7, 0.4), paint[1])
        add("Mirror", CF(v(s * (W / 2 + 0.25), body_top + 0.35, cz - cab_len / 2 + 0.4)), (0.5, 0.45, 0.7), paint[1])
        # door seams
        add("DoorLine", CF(v(s * (W / 2 + 0.01), ride + 1.0, cz - 0.3)), (0.05, 1.8, 0.08), BLACK)
        add("Handle", CF(v(s * (W / 2 + 0.03), body_top - 0.4, cz - 1.6)), (0.06, 0.16, 0.6), CHROME, "Metal")
    if pickup:
        add("BedFloor", CF(v(0, ride + 1.0, L / 2 - 2.8)), (W - 0.4, 0.2, 5.2), BLACK)
        for s in (-1, 1):
            add("BedSide", CF(v(s * (W / 2 - 0.15), body_top + 0.4, L / 2 - 2.8)), (0.3, 0.8, 5.4), paint[0])
        add("Tailgate", CF(v(0, body_top + 0.4, L / 2 - 0.15)), (W - 0.2, 0.8, 0.3), paint[0])
    # bumpers, grille, lights
    add("FrontBumper", CF(v(0, ride + 0.45, -L / 2 - 0.15)), (W + 0.1, 0.8, 0.5), BLACK if police else CHROME,
        "SmoothPlastic" if police else "Metal")
    add("RearBumper", CF(v(0, ride + 0.45, L / 2 + 0.15)), (W + 0.1, 0.8, 0.5), BLACK if police else CHROME,
        "SmoothPlastic" if police else "Metal")
    add("Grille", CF(v(0, ride + 1.25, -L / 2 - 0.05)), (W * 0.45, 0.6, 0.2), BLACK)
    for s in (-1, 1):
        hl = add("Headlight", CF(v(s * (W / 2 - 1.0), ride + 1.35, -L / 2 - 0.06)), (1.3, 0.55, 0.2), (255, 250, 230), "Neon")
        sl = Inst("SpotLight", "Beam", Brightness=("float", 3), Range=("float", 45), Angle=("float", 60),
                  Color=("Color3", (255, 245, 220)), Shadows=("bool", False), Enabled=("bool", True))
        sl.set("Face", "token", 5)  # Front
        hl.add(sl)
        add("Taillight", CF(v(s * (W / 2 - 0.9), ride + 1.35, L / 2 + 0.06)), (1.4, 0.5, 0.2), (220, 30, 30), "Neon")
    # wheels (Motor6D so clients can spin and steer them)
    wheels = []
    for zname, wz in (("F", -L / 2 + 2.6), ("R", L / 2 - 2.6)):
        for xname, s in (("L", -1), ("R", 1)):
            wx = s * (W / 2 - 0.55)
            tire = part("Wheel" + zname + xname, CF.along(v(wx - 0.55, wheel_r, wz), v(wx + 0.55, wheel_r, wz)),
                        (1.1, wheel_r * 2, wheel_r * 2), (30, 30, 32), "SmoothPlastic", shape="Cylinder", anchored=False,
                        collide=False)
            rim = part("Rim", CF.along(v(wx + s * 0.5, wheel_r, wz), v(wx + s * 0.6, wheel_r, wz)), (0.1, wheel_r * 1.2,
                                                                                                  wheel_r * 1.2),
                       CHROME if not police else (90, 92, 98), "Metal", shape="Cylinder", anchored=False, collide=False)
            wheels.append((tire, rim))
            # wheel arch
            add("Arch", CF(v(wx, wheel_r + 0.4, wz)), (1.2, 0.5, wheel_r * 2.4), BLACK)
    if police:
        # black & white livery: white doors, black ends
        for s in (-1, 1):
            door = add("DoorPanel", CF(v(s * (W / 2 + 0.02), ride + (body_top - ride) / 2, cz)), (0.04, body_top - ride - 0.2,
                                                                                                 cab_len - 0.4), (240, 240, 242))
            door.add(Inst("StringValue", "Text", Value=("string", "POLICE")))
            door.add(Inst("StringValue", "Face", Value=("string", "Left" if s < 0 else "Right")))
        add("PushBar", CF(v(0, ride + 1.2, -L / 2 - 0.7)), (W * 0.7, 1.6, 0.25), BLACK)
        for s in (-1, 1):
            add("PushBarPost", CF(v(s * W * 0.3, ride + 1.2, -L / 2 - 0.45)), (0.3, 1.6, 0.6), BLACK)
        roof = body_top + cab_h
        add("LightBarBase", CF(v(0, roof + 0.15, cz - 0.5)), (W * 0.78, 0.3, 1.3), BLACK)
        n = 4
        seg = (W * 0.74) / (n * 2)
        for i in range(n * 2):
            x = -W * 0.37 + seg * (i + 0.5)
            red = i < n
            add("LightRed" if red else "LightBlue", CF(v(x, roof + 0.48, cz - 0.5)), (seg - 0.06, 0.4, 1.1),
                (255, 40, 40) if red else (40, 90, 255), "Neon", transparency=0.55)
        add("Antenna", CF(v(W * 0.3, roof + 1.2, cz + cab_len / 2 - 0.5)), (0.08, 2.4, 0.08), BLACK)
        if suv:
            add("Spotlight", CF(v(-W / 2 - 0.1, body_top + cab_h * 0.6, cz - cab_len / 2 + 0.8)), (0.3, 0.5, 0.5), CHROME,
                "Metal")
    # seats
    seats = []
    seat_y = ride + 1.0
    drive = part("DriveSeat", CF(v(-1.5, seat_y, cz - 1.0)), (2.2, 0.6, 2.2), (40, 40, 44), "Fabric", cls="VehicleSeat",
                 anchored=False, collide=False)
    drive.set("HeadsUpDisplay", "bool", False)
    drive.set("MaxSpeed", "float", 0)
    drive.set("CanTouch", "bool", False)
    seats.append(drive)
    pas = part("Passenger", CF(v(1.5, seat_y, cz - 1.0)), (2.2, 0.6, 2.2), (40, 40, 44), "Fabric", cls="Seat",
               anchored=False, collide=False)
    pas.set("CanTouch", "bool", False)
    seats.append(pas)
    if not pickup and not sports:
        for s in (-1, 1):
            rs = part("RearSeat", CF(v(s * 1.5, seat_y, cz + 2.0)), (2.2, 0.6, 2.2), (40, 40, 44), "Fabric", cls="Seat",
                      anchored=False, collide=False)
            rs.set("CanTouch", "bool", False)
            seats.append(rs)
    for p in parts + seats:
        p.add(weld("Weld", chassis, p))
    for tire, rim in wheels:
        tire.add(motor("Axle", chassis, tire))
        rim.add(weld("Weld", tire, rim))
    m.add(chassis, *parts, *seats, *(t for t, _ in wheels), *(r for _, r in wheels))
    m.set("PrimaryPart", "Ref", chassis)
    return m


def build_cars():
    folder = Inst("Folder", "Cars")
    folder.add(build_car("Cruiser", "Cruiser", ((22, 22, 26), (22, 22, 26)), police=True))
    folder.add(build_car("Interceptor", "Interceptor", ((22, 22, 26), (22, 22, 26)), police=True, length=16, width=7.6,
                         height=6.6, cab_len=9.4, wheel_r=1.55, suv=True))
    folder.add(build_car("Sedan", "Sedan", ((150, 30, 36), (150, 30, 36))))
    folder.add(build_car("Hatchback", "Hatchback", ((40, 90, 160), (40, 90, 160)), length=12.5, cab_len=7.4))
    folder.add(build_car("Pickup", "Pickup", ((210, 205, 195), (210, 205, 195)), pickup=True, length=16, height=6.2,
                         cab_len=5.6, wheel_r=1.55))
    folder.add(build_car("Sports", "Sports", ((240, 190, 30), (30, 30, 34)), sports=True, length=14.5, height=4.6,
                         cab_len=6.0, wheel_r=1.25))
    return folder
