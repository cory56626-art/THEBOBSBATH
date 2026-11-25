"""Tiny toolkit for writing Roblox .rbxlx place files from Python.

Coordinates and CFrames follow Roblox conventions: Y is up, a CFrame's
columns are (RightVector, UpVector, -LookVector), and a Part's "front" is -Z.
"""
from __future__ import annotations

import itertools
import math
from xml.sax.saxutils import escape

# --------------------------------------------------------------------------- math

def v(x, y, z):
    return (float(x), float(y), float(z))

def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))
def norm(a):
    l = length(a)
    return (0.0, 1.0, 0.0) if l < 1e-9 else mul(a, 1.0 / l)
def lerp(a, b, t): return add(a, mul(sub(b, a), t))


class CF:
    """A CFrame: position p and rotation R (3x3, rows), columns = right, up, back."""

    __slots__ = ("p", "R")

    def __init__(self, p=(0.0, 0.0, 0.0), R=None):
        self.p = tuple(float(c) for c in p)
        self.R = R or ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))

    @staticmethod
    def from_axes(p, right, up, back):
        return CF(p, ((right[0], up[0], back[0]), (right[1], up[1], back[1]), (right[2], up[2], back[2])))

    @staticmethod
    def angles(rx=0.0, ry=0.0, rz=0.0, p=(0.0, 0.0, 0.0)):
        """Same as Roblox CFrame.Angles(rx, ry, rz): R = Rx * Ry * Rz."""
        cx, sx = math.cos(rx), math.sin(rx)
        cy, sy = math.cos(ry), math.sin(ry)
        cz, sz = math.cos(rz), math.sin(rz)
        Rx = ((1, 0, 0), (0, cx, -sx), (0, sx, cx))
        Ry = ((cy, 0, sy), (0, 1, 0), (-sy, 0, cy))
        Rz = ((cz, -sz, 0), (sz, cz, 0), (0, 0, 1))
        return CF(p, _mm(_mm(Rx, Ry), Rz))

    @staticmethod
    def along(a, b, up_hint=(0.0, 1.0, 0.0)):
        """CFrame centred between a and b whose X axis points from a to b."""
        x = norm(sub(b, a))
        if abs(dot(x, norm(up_hint))) > 0.98:
            up_hint = (0.0, 0.0, 1.0) if abs(x[2]) < 0.9 else (1.0, 0.0, 0.0)
        y = norm(sub(up_hint, mul(x, dot(up_hint, x))))
        z = cross(x, y)
        return CF.from_axes(lerp(a, b, 0.5), x, y, z)

    @staticmethod
    def look(p, forward, up_hint=(0.0, 1.0, 0.0)):
        """CFrame at p whose LookVector (-Z) is `forward`."""
        back = mul(norm(forward), -1.0)
        if abs(dot(back, norm(up_hint))) > 0.98:
            up_hint = (0.0, 0.0, 1.0)
        right = norm(cross(up_hint, back))
        up = cross(back, right)
        return CF.from_axes(p, right, up, back)

    def __mul__(self, other: "CF") -> "CF":
        return CF(add(self.p, self.rot(other.p)), _mm(self.R, other.R))

    def rot(self, vec):
        R = self.R
        return (dot(R[0], vec), dot(R[1], vec), dot(R[2], vec))

    def point(self, vec):
        return add(self.p, self.rot(vec))

    def inverse(self) -> "CF":
        Rt = tuple(tuple(self.R[j][i] for j in range(3)) for i in range(3))
        t = CF((0, 0, 0), Rt)
        return CF(mul(t.rot(self.p), -1.0), Rt)

    def translated(self, d) -> "CF":
        return CF(add(self.p, d), self.R)

    def components(self):
        R = self.R
        return (*self.p, R[0][0], R[0][1], R[0][2], R[1][0], R[1][1], R[1][2], R[2][0], R[2][1], R[2][2])


def _mm(A, B):
    return tuple(tuple(sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)) for i in range(3))


# --------------------------------------------------------------------------- instances

MATERIAL = {
    "Plastic": 256, "SmoothPlastic": 272, "Neon": 288, "Wood": 512, "WoodPlanks": 528,
    "Marble": 784, "Basalt": 788, "Slate": 800, "Concrete": 816, "Granite": 832,
    "Brick": 848, "Pebble": 864, "Rock": 896, "CorrodedMetal": 1040, "DiamondPlate": 1056,
    "Metal": 1088, "Grass": 1280, "Sand": 1296, "Fabric": 1312, "Mud": 1344, "Ground": 1360,
    "Glass": 1568, "Snow": 1328, "Ice": 1536, "Glacier": 1552, "CrackedLava": 804, "Cobblestone": 880,
    "Sandstone": 912, "LeafyGrass": 1284, "Asphalt": 1376, "Pavement": 836, "Limestone": 820,
}
SHAPE = {"Ball": 0, "Block": 1, "Cylinder": 2}
NORMAL_ID = {"Right": 0, "Top": 1, "Back": 2, "Left": 3, "Bottom": 4, "Front": 5}

_ref_counter = itertools.count(1)


class Inst:
    def __init__(self, cls: str, name: str | None = None, **props):
        self.cls = cls
        self.ref = f"RBX{next(_ref_counter):06d}"
        self.props: dict[str, tuple[str, object]] = {}
        self.children: list[Inst] = []
        if name is not None:
            self.set("Name", "string", name)
        for k, val in props.items():
            self.set(k, *val)

    def set(self, key, typ, value):
        self.props[key] = (typ, value)
        return self

    def tag(self, *names: str) -> "Inst":
        existing = self.props.get("Tags", ("BinaryString", ""))[1]
        tags = [t for t in existing.split("\x00") if t] + list(names)
        self.props["Tags"] = ("BinaryString", "\x00".join(tags))
        return self

    def add(self, *children: "Inst") -> "Inst":
        self.children.extend(children)
        return self

    # -- serialisation
    def to_xml(self, out: list[str], depth=1):
        pad = "\t" * depth
        out.append(f'{pad}<Item class="{self.cls}" referent="{self.ref}">')
        out.append(f"{pad}\t<Properties>")
        for key, (typ, value) in self.props.items():
            out.append(f"{pad}\t\t{_prop_xml(key, typ, value)}")
        out.append(f"{pad}\t</Properties>")
        for child in self.children:
            child.to_xml(out, depth + 1)
        out.append(f"{pad}</Item>")


def _f(x: float) -> str:
    return repr(round(float(x), 6))


def _prop_xml(key, typ, value) -> str:
    if typ == "string":
        return f'<string name="{key}">{escape(str(value))}</string>'
    if typ == "bool":
        return f'<bool name="{key}">{"true" if value else "false"}</bool>'
    if typ in ("float", "double"):
        return f'<{typ} name="{key}">{_f(value)}</{typ}>'
    if typ in ("int", "int64", "token"):
        return f'<{typ} name="{key}">{int(value)}</{typ}>'
    if typ == "Vector3":
        x, y, z = value
        return f'<Vector3 name="{key}"><X>{_f(x)}</X><Y>{_f(y)}</Y><Z>{_f(z)}</Z></Vector3>'
    if typ == "CoordinateFrame":
        names = ["X", "Y", "Z", "R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"]
        body = "".join(f"<{n}>{_f(c)}</{n}>" for n, c in zip(names, value.components()))
        return f'<CoordinateFrame name="{key}">{body}</CoordinateFrame>'
    if typ == "Color3":
        r, g, b = value
        return f'<Color3 name="{key}"><R>{_f(r / 255)}</R><G>{_f(g / 255)}</G><B>{_f(b / 255)}</B></Color3>'
    if typ == "Color3uint8":
        r, g, b = (int(max(0, min(255, round(c)))) for c in value)
        return f'<Color3uint8 name="{key}">{0xFF000000 | (r << 16) | (g << 8) | b}</Color3uint8>'
    if typ == "BinaryString":
        import base64
        raw = value.encode("utf-8") if isinstance(value, str) else value
        return f'<BinaryString name="{key}">{base64.b64encode(raw).decode()}</BinaryString>'
    if typ == "Ref":
        return f'<Ref name="{key}">{value.ref if value is not None else "null"}</Ref>'
    if typ == "ProtectedString":
        safe = str(value).replace("]]>", "]]]]><![CDATA[>")
        return f'<ProtectedString name="{key}"><![CDATA[{safe}]]></ProtectedString>'
    if typ == "NumberRange":
        lo, hi = value
        return f'<NumberRange name="{key}">{_f(lo)} {_f(hi)} </NumberRange>'
    if typ == "NumberSequence":
        # value: list of (time, value, envelope)
        body = " ".join(f"{_f(t)} {_f(val)} {_f(env)}" for t, val, env in value)
        return f'<NumberSequence name="{key}">{body} </NumberSequence>'
    if typ == "ColorSequence":
        # value: list of (time, (r, g, b))
        body = " ".join(f"{_f(t)} {_f(c[0] / 255)} {_f(c[1] / 255)} {_f(c[2] / 255)} 0" for t, c in value)
        return f'<ColorSequence name="{key}">{body} </ColorSequence>'
    raise ValueError(f"unknown property type {typ}")


def write_place(services: list[Inst], path: str):
    out = ['<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
           'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
           'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">',
           "\t<External>null</External>", "\t<External>nil</External>"]
    for s in services:
        s.to_xml(out)
    out.append("</roblox>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


# --------------------------------------------------------------------------- part helpers

def part(name, cf: CF, size, color, material="SmoothPlastic", *, shape="Block", cls="Part",
         transparency=0.0, reflectance=0.0, anchored=False, collide=False, shadow=True,
         query=True, ellipsoid=False):
    p = Inst(cls, name)
    p.set("CFrame", "CoordinateFrame", cf)
    p.set("size", "Vector3", size)
    p.set("Color3uint8", "Color3uint8", color)
    p.set("Material", "token", MATERIAL[material])
    if cls == "Part":
        p.set("shape", "token", SHAPE[shape])
    p.set("Anchored", "bool", anchored)
    p.set("CanCollide", "bool", collide)
    p.set("CanTouch", "bool", collide)
    p.set("CanQuery", "bool", query)
    p.set("CastShadow", "bool", shadow)
    p.set("Massless", "bool", not anchored)
    p.set("Transparency", "float", transparency)
    p.set("Reflectance", "float", reflectance)
    for face in ("TopSurface", "BottomSurface", "FrontSurface", "BackSurface", "LeftSurface", "RightSurface"):
        p.set(face, "token", 0)
    if ellipsoid:
        p.add(Inst("SpecialMesh", "Mesh", MeshType=("token", 3)))
    # metadata for the preview renderer
    p.meta = {"shape": "Ellipsoid" if ellipsoid else (shape if cls == "Part" else "Wedge"),
              "cf": cf, "size": size, "color": color, "material": material,
              "transparency": transparency}
    return p


def weld(name, p0: Inst, p1: Inst, cls="Weld"):
    c0 = p0.meta["cf"].inverse() * p1.meta["cf"]
    return Inst(cls, name, Part0=("Ref", p0), Part1=("Ref", p1),
                C0=("CoordinateFrame", c0), C1=("CoordinateFrame", CF()))


def motor(name, p0: Inst, p1: Inst):
    """Motor6D whose joint sits at p1's origin (bones are world-aligned)."""
    return weld(name, p0, p1, cls="Motor6D")


def script(cls, name, source):
    s = Inst(cls, name)
    s.set("Source", "ProtectedString", source)
    s.set("Disabled", "bool", False)
    return s


def light(cls, name, *, brightness, range_, color, shadows=False, angle=None, face=None, enabled=True):
    li = Inst(cls, name, Brightness=("float", brightness), Range=("float", range_),
              Color=("Color3", color), Shadows=("bool", shadows), Enabled=("bool", enabled))
    if angle is not None:
        li.set("Angle", "float", angle)
    if face is not None:
        li.set("Face", "token", NORMAL_ID[face])
    return li
