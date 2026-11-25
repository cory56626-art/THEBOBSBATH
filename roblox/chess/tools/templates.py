"""Staunton-style chess piece templates built from parts (ReplicatedStorage.ChessTemplates).

Each piece is a Model named e.g. "WhiteKnight": every part anchored, PrimaryPart "Base" (invisible) at the base
centre on y = 0, facing -Z (the knight looks toward -Z). Clients clone these and move them with Model:PivotTo.
"""
from __future__ import annotations

import math

from rbx import CF, Inst, part, v

S = 0.6  # piece units -> studs (a board square is 1.5 studs)
IVORY = (236, 226, 204)
EBONY = (44, 34, 30)


def build_piece(kind, color):
    col = IVORY if color == "White" else EBONY
    accent = (40, 30, 26) if color == "White" else (205, 190, 165)  # eyes, mitre slit
    model = Inst("Model", color + kind)
    parts = []

    def add_part(name, cf, size, c=None, shape="Block", ellipsoid=False):
        p = part(name, cf, size, c or col, "SmoothPlastic", shape=shape, anchored=True, collide=False,
                 ellipsoid=ellipsoid, reflectance=0.06 if color == "White" else 0.1)
        parts.append(p)
        return p

    def cyl(name, y0, y1, d, c=None):
        return add_part(name, CF.along(v(0, y0 * S, 0), v(0, y1 * S, 0)), ((y1 - y0) * S, d * S, d * S), c,
                        shape="Cylinder")

    def taper(name, y0, y1, d0, d1, steps=3):
        for i in range(steps):
            a, b = y0 + (y1 - y0) * i / steps, y0 + (y1 - y0) * (i + 1) / steps
            cyl(name, a, b + 0.01, d0 + (d1 - d0) * (i + 0.5) / steps)

    def ball(name, pos, d, c=None):
        return add_part(name, CF(v(pos[0] * S, pos[1] * S, pos[2] * S)), (d * S, d * S, d * S), c, shape="Ball")

    def blk(name, pos, size, rx=0.0, ry=0.0, rz=0.0, c=None, ellipsoid=False):
        return add_part(name, CF.angles(rx, ry, rz, v(pos[0] * S, pos[1] * S, pos[2] * S)),
                        tuple(s * S for s in size), c, ellipsoid=ellipsoid)

    base = part("Base", CF(v(0, 0.05, 0)), (2.0 * S, 0.1, 2.0 * S), col, anchored=True, collide=False,
                transparency=1)
    wide = {"Pawn": 1.85, "Knight": 2.05, "Bishop": 1.95, "Rook": 2.05, "Queen": 2.15, "King": 2.2}[kind]
    cyl("Foot", 0, 0.24, wide)
    cyl("Foot", 0.24, 0.36, wide - 0.2)
    cyl("Foot", 0.36, 0.46, wide - 0.4)
    if kind == "Pawn":
        taper("Stem", 0.46, 1.45, 1.2, 0.72)
        cyl("Collar", 1.4, 1.55, 1.25)
        ball("Head", (0, 2.0, 0), 1.05)
    elif kind == "Rook":
        taper("Tower", 0.46, 2.25, 1.55, 1.3, 2)
        cyl("Ring", 2.2, 2.4, 1.72)
        cyl("Crown", 2.4, 2.95, 1.62)
        cyl("Hollow", 2.95, 3.0, 1.0, (30, 24, 20) if color == "White" else (20, 16, 14))
        for k in range(4):
            a = k * math.pi / 2
            blk("Merlon", (math.cos(a) * 0.6, 3.15, math.sin(a) * 0.6), (0.42, 0.42, 0.62), ry=-a)
    elif kind == "Knight":
        cyl("Plinth", 0.46, 0.95, 1.5)
        blk("Chest", (0, 1.3, -0.2), (1.15, 1.0, 1.05), ellipsoid=True)
        blk("Neck", (0, 1.75, 0.15), (0.95, 1.5, 1.05), rx=0.22)
        blk("Head", (0, 2.5, -0.4), (0.85, 0.72, 1.55), rx=-0.5)
        blk("Muzzle", (0, 2.12, -1.0), (0.72, 0.6, 0.55), rx=-0.5)
        blk("Brow", (0, 2.85, -0.05), (0.86, 0.5, 0.95))
        blk("Mane", (0, 2.2, 0.66), (0.32, 1.7, 0.42), rx=0.25, ellipsoid=True)
        for x in (-0.22, 0.22):
            blk("Ear", (x, 3.22, 0.18), (0.18, 0.5, 0.26), rz=-x * 0.8)
        for x in (-0.44, 0.44):
            blk("Eye", (x, 2.72, -0.42), (0.06, 0.14, 0.2), c=accent)
        for x in (-0.18, 0.18):
            blk("Nostril", (x, 2.0, -1.28), (0.12, 0.1, 0.06), c=accent)
    elif kind == "Bishop":
        taper("Stem", 0.46, 2.15, 1.25, 0.75)
        cyl("Collar", 2.1, 2.25, 1.3)
        cyl("Collar", 2.25, 2.35, 0.95)
        blk("Mitre", (0, 2.95, 0), (1.02, 1.4, 1.02), ellipsoid=True)
        blk("Slit", (0.16, 3.1, -0.44), (0.1, 0.62, 0.16), rz=0.55, c=accent)
        ball("Tip", (0, 3.72, 0), 0.32)
    elif kind == "Queen":
        taper("Stem", 0.46, 2.75, 1.4, 0.8)
        cyl("Collar", 2.7, 2.85, 1.45)
        cyl("Neck", 2.85, 3.1, 0.95)
        cyl("Crown", 3.1, 3.4, 1.22)
        cyl("Crown", 3.4, 3.55, 1.45)
        for k in range(8):
            a = k * math.pi / 4
            ball("Point", (math.cos(a) * 0.66, 3.62, math.sin(a) * 0.66), 0.3)
        blk("Dome", (0, 3.6, 0), (1.0, 0.55, 1.0), ellipsoid=True)
        ball("Top", (0, 3.98, 0), 0.38)
    elif kind == "King":
        taper("Stem", 0.46, 2.95, 1.45, 0.85)
        cyl("Collar", 2.9, 3.05, 1.5)
        cyl("Neck", 3.05, 3.3, 1.0)
        cyl("Crown", 3.3, 3.62, 1.42)
        blk("Dome", (0, 3.68, 0), (1.15, 0.5, 1.15), ellipsoid=True)
        blk("CrossV", (0, 4.3, 0), (0.26, 0.95, 0.26))
        blk("CrossH", (0, 4.38, 0), (0.72, 0.24, 0.26))
    model.add(base, *parts)
    model.set("PrimaryPart", "Ref", base)
    return model


def build_templates():
    folder = Inst("Folder", "ChessTemplates")
    for color in ("White", "Black"):
        for kind in ("Pawn", "Knight", "Bishop", "Rook", "Queen", "King"):
            folder.add(build_piece(kind, color))
    return folder


def place_copy(model: Inst, cf: CF) -> list:
    """Preview helper: world-space metas of a template's parts placed at cf."""
    out = []
    for c in model.children:
        meta = getattr(c, "meta", None)
        if meta:
            m = dict(meta)
            m["cf"] = cf * meta["cf"]
            out.append((c, m))
    return out
