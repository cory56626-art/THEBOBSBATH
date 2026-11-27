"""Write build/preview.html: a three.js render of the map (offline look check).  ?cam=x,y,z,tx,ty,tz"""
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

from room import build_room  # noqa: E402


def collect(inst, out):
    meta = getattr(inst, "meta", None)
    if meta and not meta.get("hidden") and "cf" in meta:
        lights = []
        for c in inst.children:
            if c.cls in ("SpotLight", "PointLight"):
                lights.append({"type": c.cls, "brightness": c.props["Brightness"][1], "range": c.props["Range"][1],
                               "color": c.props["Color"][1], "angle": c.props.get("Angle", ("", 90))[1],
                               "face": c.props.get("Face", ("", 5))[1]})
        out.append({"name": inst.props["Name"][1], "shape": meta["shape"], "cf": list(meta["cf"].components()),
                    "size": list(meta["size"]), "color": list(meta["color"]), "material": meta["material"],
                    "transparency": meta["transparency"], "lights": lights})
    for c in inst.children:
        collect(c, out)


def main():
    world, extras = build_room()
    parts = []
    collect(world, parts)
    for e in extras:
        collect(e, parts)
    src = open(os.path.join(SW, "make_preview.py")).read()
    t = re.search(r'TEMPLATE = r"""(.*?)"""', src, re.S).group(1)
    t = t.replace("applyView((location.hash||'#front').slice(1));",
                  "applyView((location.hash||'#front').slice(1));"
                  "if(QS.get('cam')){const c=QS.get('cam').split(',').map(Number);"
                  "camera.position.set(c[0],c[1],c[2]);camera.lookAt(c[3],c[4],c[5]);}")
    t = t.replace("scene.fog = new THREE.FogExp2(0x1a1e26, location.search.includes('noceil') ? 0.0 : 0.012);",
                  "scene.fog = new THREE.FogExp2(0xb8c8e0, 0.0012);")
    t = t.replace("scene.background = new THREE.Color(0x0b0d12);", "scene.background = new THREE.Color(0x9cc4ec);")
    t = t.replace("new THREE.HemisphereLight(0x3a4458, 0x0c0a08, 0.55)",
                  "new THREE.HemisphereLight(0xdde8ff, 0x405030, 1.1)")
    t = t.replace("const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 600);",
                  "const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 1200);"
                  "{const sun=new THREE.DirectionalLight(0xfff2dd,1.6);sun.position.set(120,200,-60);"
                  "sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);const s=sun.shadow.camera;"
                  "s.left=-260;s.right=260;s.top=260;s.bottom=-260;s.far=800;scene.add(sun);}")
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    out = os.path.join(ROOT, "build", "preview.html")
    with open(out, "w") as fh:
        fh.write(t.replace("__DATA__", json.dumps(parts)))
    print(f"wrote {out} ({len(parts)} parts)")


if __name__ == "__main__":
    main()
