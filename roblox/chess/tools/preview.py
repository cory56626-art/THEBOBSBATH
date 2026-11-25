"""Write build/preview.html: a three.js render of the club with pieces set up (for checking looks offline).

    python3 tools/preview.py    then open build/preview.html?cam=x,y,z,tx,ty,tz
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SW = os.path.join(os.path.dirname(ROOT), "skinwalker", "tools")
sys.path.insert(0, SW)
sys.path.insert(0, HERE)

from rbx import CF, v  # noqa: E402
from room import SQ, TABLE_TOP, TABLES, build_room  # noqa: E402
from templates import build_piece  # noqa: E402

BACK = "RNBQKBNR"
NAMES = {"P": "Pawn", "N": "Knight", "B": "Bishop", "R": "Rook", "Q": "Queen", "K": "King"}


def meta_dict(name, m):
    return {"name": name, "shape": m["shape"], "cf": list(m["cf"].components()), "size": list(m["size"]),
            "color": list(m["color"]), "material": m["material"], "transparency": m["transparency"], "lights": []}


def collect(inst, out):
    meta = getattr(inst, "meta", None)
    if meta and not meta.get("hidden") and "cf" in meta:
        lights = []
        for c in inst.children:
            if c.cls in ("SpotLight", "PointLight"):
                lights.append({"type": c.cls, "brightness": c.props["Brightness"][1], "range": c.props["Range"][1],
                               "color": c.props["Color"][1], "angle": c.props.get("Angle", ("", 90))[1],
                               "face": c.props.get("Face", ("", 5))[1]})
        d = meta_dict(inst.props["Name"][1], meta)
        d["lights"] = lights
        out.append(d)
    for c in inst.children:
        collect(c, out)


def pieces_at(cx, cz, out, fen_rows=None):
    top = TABLE_TOP + 0.2
    tmpl = {}
    rows = fen_rows or ["rnbqkbnr", "pppppppp", "8", "8", "8", "8", "PPPPPPPP", "RNBQKBNR"]
    for r, row in enumerate(rows):  # r = 0 is rank 8
        f = 0
        for ch in row:
            if ch.isdigit():
                f += int(ch)
                continue
            color = "White" if ch.isupper() else "Black"
            kind = NAMES[ch.upper()]
            key = color + kind
            if key not in tmpl:
                tmpl[key] = build_piece(kind, color)
            yaw = 0.0 if color == "White" else 3.14159265
            place = CF.angles(0, yaw, 0, v(cx + (f - 3.5) * SQ, top, cz + (r - 3.5) * SQ))
            for c in tmpl[key].children:
                m = getattr(c, "meta", None)
                if m and m["transparency"] < 1:
                    mm = dict(m)
                    mm["cf"] = place * m["cf"]
                    out.append(meta_dict(c.props["Name"][1], mm))
            f += 1


def main():
    room, extras = build_room()
    parts = []
    collect(room, parts)
    for e in extras:
        collect(e, parts)
    # a line-up of every piece in the north-east corner of the room (x 32..46, z -8), for close-ups
    for i, kind in enumerate(["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"]):
        for j, color in enumerate(["White", "Black"]):
            t = build_piece(kind, color)
            place = CF.angles(0, -1.2, 0, v(33 + i * 2.2, 0.06, -9 + j * 2.4))
            for c in t.children:
                m = getattr(c, "meta", None)
                if m and m["transparency"] < 1:
                    mm = dict(m)
                    mm["cf"] = place * m["cf"]
                    parts.append(meta_dict(c.props["Name"][1], mm))
    for i, (_, mode, _, x, z) in enumerate(TABLES):
        if i == 4:  # a game in progress
            pieces_at(x, z, parts, ["r1bqk2r", "pppp1ppp", "2n2n2", "2b1p3", "2B1P3", "5N2", "PPPP1PPP", "RNBQK2R"])
        else:
            pieces_at(x, z, parts)
    src = open(os.path.join(SW, "make_preview.py")).read()
    template = re.search(r'TEMPLATE = r"""(.*?)"""', src, re.S).group(1)
    template = template.replace("<title>Skinwalker Preview</title>", "<title>Chess Preview</title>")
    template = template.replace("applyView((location.hash||'#front').slice(1));",
                                "applyView((location.hash||'#front').slice(1));"
                                "if(QS.get('cam')){const c=QS.get('cam').split(',').map(Number);"
                                "camera.position.set(c[0],c[1],c[2]);camera.lookAt(c[3],c[4],c[5]);}")
    template = template.replace("scene.fog = new THREE.FogExp2(0x1a1e26, location.search.includes('noceil') ? 0.0 : 0.012);",
                                "scene.fog = null;")
    template = template.replace("new THREE.HemisphereLight(0x3a4458, 0x0c0a08, 0.55)",
                                "new THREE.HemisphereLight(0x8a7a68, 0x2a1a10, 0.9)")
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    out = os.path.join(ROOT, "build", "preview.html")
    with open(out, "w") as fh:
        fh.write(template.replace("__DATA__", json.dumps(parts)))
    print(f"wrote {out} ({len(parts)} parts)")


if __name__ == "__main__":
    main()
