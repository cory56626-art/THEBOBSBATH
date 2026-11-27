"""Car templates built from parts (ServerStorage.Cars): police cruiser, SUV and SWAT van; civilian cars and a taxi.

A car model: PrimaryPart "Chassis" (invisible collision box resting on the ground; the server adds the drive
constraints), welded body parts, Motor6D wheels the clients spin and steer, a VehicleSeat "DriveSeat", a
"Passenger" seat and "RearSeat"s (suspects ride there). Origin: car centre on the ground, front = -Z.

Sized for Roblox avatars (measured in Roblox: a seated R15 avatar's head top is 3.76 studs above the seat top and its
arms reach 2 studs to each side of the seat centre), so the cabin is hollow glass with room for the driver's head.
"""
from __future__ import annotations

import math

from rbx import CF, Inst, part, v, weld, motor

BLACK = (24, 24, 28)
GLASS = (40, 50, 64)
CHROME = (180, 182, 188)
TRIM = (34, 34, 38)
SEAT = (46, 46, 52)
HEAD_ABOVE_SEAT = 3.8  # seated avatar: head top above the seat's top surface


def build_car(name, kind, paint, police=False, length=17.5, width=8.4, height=6.1, cab_len=9.0, wheel_r=1.45,
              pickup=False, sports=False, suv=False, van=False, taxi=False, rear_seats=True):
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
    roof = height if not sports else height - 0.3
    cab_h = roof - body_top
    cz = 0.4 if not pickup else -1.8  # cabin centre (z)
    front = cz - cab_len / 2
    back = cz + cab_len / 2
    # lower body (doors), hood and trunk
    lower = add("Body", CF(v(0, ride + (body_top - ride) / 2, 0)), (W, body_top - ride, L), paint[0])
    lower.set("Reflectance", "float", 0.12)
    hood_len = front - (-L / 2) - 0.6
    add("Hood", CF.angles(-0.05, 0, 0, v(0, body_top + 0.12, -L / 2 + 0.3 + hood_len / 2)), (W - 0.3, 0.3, hood_len),
        paint[0]).set("Reflectance", "float", 0.15)
    if not pickup and not van:
        trunk_len = L / 2 - back - 0.4
        if trunk_len > 0.6:
            add("Trunk", CF(v(0, body_top + 0.1, back + 0.2 + trunk_len / 2)), (W - 0.3, 0.25, trunk_len), paint[0])
    # hollow cabin: roof, pillars, glass all round
    slant = 1.6 if not sports else 2.2
    add("Roof", CF(v(0, roof - 0.15, cz + 0.2)), (W - 0.5, 0.3, cab_len - 1.2), paint[1]).set("Reflectance", "float", 0.12)
    tilt = math.atan2(slant, cab_h)
    glen = math.hypot(slant, cab_h)
    add("Windshield", CF.angles(tilt, 0, 0, v(0, body_top + cab_h / 2, front + slant / 2 - 0.4)), (W - 0.7, glen, 0.12),
        GLASS, "Glass", transparency=0.55)
    rslant = 1.2 if not van else 0.2
    rtilt = math.atan2(rslant, cab_h)
    add("RearWindow", CF.angles(-rtilt, 0, 0, v(0, body_top + cab_h / 2, back - rslant / 2 + 0.4)),
        (W - 0.7, math.hypot(rslant, cab_h), 0.12), GLASS, "Glass", transparency=0.55)
    for s in (-1, 1):
        x = s * (W / 2 - 0.12)
        add("SideWindow", CF(v(x, body_top + cab_h * 0.48, cz + 0.2)), (0.1, cab_h * 0.86, cab_len - 1.6), GLASS, "Glass",
            transparency=0.5)
        # pillars: A (front, leaning with the windshield), B (between the doors), C (back)
        add("Pillar", CF.angles(tilt, 0, 0, v(s * (W / 2 - 0.2), body_top + cab_h / 2, front + slant / 2 - 0.3)),
            (0.3, glen, 0.35), paint[1])
        add("Pillar", CF(v(s * (W / 2 - 0.2), body_top + cab_h / 2, cz + 0.6)), (0.32, cab_h, 0.45), paint[1])
        add("Pillar", CF.angles(-rtilt, 0, 0, v(s * (W / 2 - 0.2), body_top + cab_h / 2, back - rslant / 2 + 0.3)),
            (0.3, math.hypot(rslant, cab_h), 0.5), paint[1])
        add("Mirror", CF(v(s * (W / 2 + 0.3), body_top + 0.45, front + 1.0)), (0.5, 0.5, 0.8), paint[1])
        add("DoorLine", CF(v(s * (W / 2 + 0.01), ride + 1.0, cz + 0.6)), (0.05, 1.8, 0.08), BLACK)
        add("DoorLine", CF(v(s * (W / 2 + 0.01), ride + 1.0, front + 0.3)), (0.05, 1.8, 0.08), BLACK)
        add("Handle", CF(v(s * (W / 2 + 0.03), body_top - 0.45, cz - 1.2)), (0.06, 0.16, 0.7), CHROME, "Metal")
        if rear_seats and not pickup:
            add("Handle", CF(v(s * (W / 2 + 0.03), body_top - 0.45, cz + 2.6)), (0.06, 0.16, 0.7), CHROME, "Metal")
    # interior: trim, dashboard, steering wheel, seat backs
    add("InteriorTrim", CF(v(0, body_top + 0.02, cz + 0.2)), (W - 0.5, 0.06, cab_len - 1.0), TRIM)
    add("Dashboard", CF(v(0, body_top + 0.35, front + 0.9)), (W - 0.7, 0.7, 1.2), TRIM)
    add("DashGlow", CF(v(-1.9, body_top + 0.71, front + 1.1)), (1.4, 0.05, 0.5), (90, 200, 255), "Neon")
    sx = W / 2 - 2.2
    seat_y = ride + 0.15 if not sports else ride + 0.05
    seat_top = seat_y + 0.2
    front_z = cz - 1.1
    rear_z = cz + 2.6
    wheel = add("SteeringWheel", CF.along(v(-sx, body_top + 0.9, front + 1.9), v(-sx, body_top + 1.1, front + 2.05)),
                (0.18, 1.7, 1.7), BLACK, shape="Cylinder")
    _ = wheel
    seat_rows = [front_z] + ([rear_z] if rear_seats and not pickup else [])
    for z in seat_rows:
        for s in (-1, 1):
            add("SeatBack", CF.angles(0.12, 0, 0, v(s * sx, seat_top + 1.4, z + 1.25)), (2.1, 2.8, 0.5), SEAT, "Fabric")
            add("Headrest", CF(v(s * sx, seat_top + 3.1, z + 1.45)), (1.3, 0.8, 0.4), SEAT, "Fabric")
    if pickup:
        add("BedFloor", CF(v(0, ride + 1.0, L / 2 - 3.0)), (W - 0.4, 0.2, 5.6), BLACK)
        for s in (-1, 1):
            add("BedSide", CF(v(s * (W / 2 - 0.15), body_top + 0.45, L / 2 - 3.0)), (0.3, 0.9, 5.8), paint[0])
        add("Tailgate", CF(v(0, body_top + 0.45, L / 2 - 0.15)), (W - 0.2, 0.9, 0.3), paint[0])
    # bumpers, grille, lights
    add("FrontBumper", CF(v(0, ride + 0.45, -L / 2 - 0.15)), (W + 0.1, 0.8, 0.5), BLACK if police else CHROME,
        "SmoothPlastic" if police else "Metal")
    add("RearBumper", CF(v(0, ride + 0.45, L / 2 + 0.15)), (W + 0.1, 0.8, 0.5), BLACK if police else CHROME,
        "SmoothPlastic" if police else "Metal")
    add("Grille", CF(v(0, ride + 1.3, -L / 2 - 0.05)), (W * 0.42, 0.7, 0.2), BLACK)
    add("Plate", CF(v(0, ride + 0.95, L / 2 + 0.42)), (2.2, 0.8, 0.08), (235, 235, 225))
    for s in (-1, 1):
        hl = add("Headlight", CF(v(s * (W / 2 - 1.1), ride + 1.4, -L / 2 - 0.06)), (1.5, 0.6, 0.2), (255, 250, 230), "Neon")
        sl = Inst("SpotLight", "Beam", Brightness=("float", 3), Range=("float", 50), Angle=("float", 60),
                  Color=("Color3", (255, 245, 220)), Shadows=("bool", False), Enabled=("bool", True))
        sl.set("Face", "token", 5)  # Front
        hl.add(sl)
        add("Taillight", CF(v(s * (W / 2 - 1.0), ride + 1.4, L / 2 + 0.06)), (1.6, 0.55, 0.2), (220, 30, 30), "Neon")
    # wheels (Motor6D so clients can spin and steer them)
    wheels = []
    for zname, wz in (("F", -L / 2 + 2.9), ("R", L / 2 - 2.9)):
        for xname, s in (("L", -1), ("R", 1)):
            wx = s * (W / 2 - 0.6)
            tire = part("Wheel" + zname + xname, CF.along(v(wx - 0.6, wheel_r, wz), v(wx + 0.6, wheel_r, wz)),
                        (1.2, wheel_r * 2, wheel_r * 2), (30, 30, 32), "SmoothPlastic", shape="Cylinder", anchored=False,
                        collide=False)
            rim = part("Rim", CF.along(v(wx + s * 0.55, wheel_r, wz), v(wx + s * 0.65, wheel_r, wz)),
                       (0.1, wheel_r * 1.2, wheel_r * 1.2), CHROME if not police else (90, 92, 98), "Metal",
                       shape="Cylinder", anchored=False, collide=False)
            wheels.append((tire, rim))
            add("Arch", CF(v(wx, wheel_r + 0.45, wz)), (1.3, 0.5, wheel_r * 2.4), BLACK)
    if police:
        for s in (-1, 1):
            door = add("DoorPanel", CF(v(s * (W / 2 + 0.02), ride + (body_top - ride) / 2, cz + 0.6)),
                       (0.04, body_top - ride - 0.2, 7.4), (240, 240, 242))
            door.add(Inst("StringValue", "Text", Value=("string", "SWAT" if van else "POLICE")))
            door.add(Inst("StringValue", "Face", Value=("string", "Left" if s < 0 else "Right")))
        add("PushBar", CF(v(0, ride + 1.3, -L / 2 - 0.7)), (W * 0.7, 1.7, 0.25), BLACK)
        for s in (-1, 1):
            add("PushBarPost", CF(v(s * W * 0.3, ride + 1.3, -L / 2 - 0.45)), (0.3, 1.7, 0.6), BLACK)
        add("LightBarBase", CF(v(0, roof + 0.15, cz - 1.0)), (W * 0.78, 0.3, 1.3), BLACK)
        n = 4
        seg = (W * 0.74) / (n * 2)
        for i in range(n * 2):
            x = -W * 0.37 + seg * (i + 0.5)
            red = i < n
            add("LightRed" if red else "LightBlue", CF(v(x, roof + 0.48, cz - 1.0)), (seg - 0.06, 0.4, 1.1),
                (255, 40, 40) if red else (40, 90, 255), "Neon", transparency=0.55)
        add("Antenna", CF(v(W * 0.3, roof + 1.2, back - 1.0)), (0.08, 2.4, 0.08), BLACK)
        if suv or van:
            add("Spotlight", CF(v(-W / 2 - 0.1, body_top + 0.6, front + 1.2)), (0.3, 0.5, 0.5), CHROME, "Metal")
    if taxi:
        sign = add("TaxiSign", CF(v(0, roof + 0.45, cz)), (2.8, 0.6, 1.0), (255, 220, 60), "Neon")
        _ = sign
        for s in (-1, 1):
            add("Checker", CF(v(s * (W / 2 + 0.02), ride + 1.55, cz + 0.6)), (0.04, 0.35, 7.0), BLACK)
    if van:
        add("RoofRack", CF(v(0, roof + 0.2, cz + 1.4)), (W - 1.2, 0.2, cab_len - 3), (60, 62, 66), "Metal")
    # seats: tops at seat_top; an avatar's head ends up HEAD_ABOVE_SEAT higher, inside the roof
    assert seat_top + HEAD_ABOVE_SEAT <= roof - 0.3, (name, seat_top + HEAD_ABOVE_SEAT, roof)
    seats = []
    drive = part("DriveSeat", CF(v(-sx, seat_y, front_z)), (2.1, 0.4, 2.1), SEAT, "Fabric", cls="VehicleSeat",
                 anchored=False, collide=False)
    drive.set("HeadsUpDisplay", "bool", False)
    drive.set("MaxSpeed", "float", 0)
    drive.set("CanTouch", "bool", False)
    seats.append(drive)
    pas = part("Passenger", CF(v(sx, seat_y, front_z)), (2.1, 0.4, 2.1), SEAT, "Fabric", cls="Seat", anchored=False,
               collide=False)
    pas.set("CanTouch", "bool", False)
    seats.append(pas)
    if rear_seats and not pickup:
        for s in (-1, 1):
            rs = part("RearSeat", CF(v(s * sx, seat_y, rear_z)), (2.1, 0.4, 2.1), SEAT, "Fabric", cls="Seat",
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
    m.meta = {"roof": roof, "seat_top": seat_top, "sx": sx, "front_z": front_z, "rear_z": rear_z, "W": W}
    return m


def build_cars():
    folder = Inst("Folder", "Cars")
    folder.add(build_car("Cruiser", "Cruiser", ((22, 22, 26), (22, 22, 26)), police=True))
    folder.add(build_car("Interceptor", "Interceptor", ((22, 22, 26), (22, 22, 26)), police=True, length=18.5, width=8.8,
                         height=6.9, cab_len=10, wheel_r=1.65, suv=True))
    folder.add(build_car("SwatVan", "SwatVan", ((30, 34, 40), (30, 34, 40)), police=True, length=20, width=9.2,
                         height=8.4, cab_len=13, wheel_r=1.75, van=True))
    folder.add(build_car("Sedan", "Sedan", ((150, 30, 36), (150, 30, 36))))
    folder.add(build_car("Hatchback", "Hatchback", ((40, 90, 160), (40, 90, 160)), length=15.5, cab_len=9.0))
    folder.add(build_car("Pickup", "Pickup", ((210, 205, 195), (210, 205, 195)), pickup=True, length=18.5, height=6.6,
                         cab_len=6.4, wheel_r=1.65))
    folder.add(build_car("Sports", "Sports", ((240, 190, 30), (30, 30, 34)), sports=True, length=17, height=5.8,
                         cab_len=7.4, wheel_r=1.35, rear_seats=False))
    folder.add(build_car("Taxi", "Taxi", ((250, 200, 30), (250, 200, 30)), taxi=True))
    return folder
