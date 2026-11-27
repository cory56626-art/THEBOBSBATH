"""Write build/cars.html: the car templates lined up (offline look check)."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SW = os.path.join(os.path.dirname(ROOT), "skinwalker", "tools")
sys.path.insert(0, SW)
sys.path.insert(0, HERE)
from rbx import CF, v  # noqa
from cars import build_cars  # noqa
from preview import collect  # noqa

def main():
    folder = build_cars()
    parts = []
    for i, car in enumerate(folder.children):
        off = CF.angles(0, 0.6, 0, v(-40 + i * 16, 0, 0))
        tmp = []
        collect(car, tmp)
        for d in tmp:
            c = d["cf"]
            local = CF((c[0], c[1], c[2]), ((c[3], c[4], c[5]), (c[6], c[7], c[8]), (c[9], c[10], c[11])))
            w = off * local
            d["cf"] = list(w.components())
            parts.append(d)
    parts.append({"name": "Ground", "shape": "Block", "cf": [0, -0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], "size": [200, 1, 80],
                  "color": [60, 62, 66], "material": "Concrete", "transparency": 0, "lights": []})
    src = open(os.path.join(SW, "make_preview.py")).read()
    t = re.search(r'TEMPLATE = r"""(.*?)"""', src, re.S).group(1)
    t = t.replace("applyView((location.hash||'#front').slice(1));", "applyView((location.hash||'#front').slice(1));"
                  "if(QS.get('cam')){const c=QS.get('cam').split(',').map(Number);camera.position.set(c[0],c[1],c[2]);camera.lookAt(c[3],c[4],c[5]);}")
    t = t.replace("scene.fog = new THREE.FogExp2(0x1a1e26, location.search.includes('noceil') ? 0.0 : 0.012);", "scene.fog=null;")
    t = t.replace("scene.background = new THREE.Color(0x0b0d12);", "scene.background = new THREE.Color(0x9cc4ec);")
    t = t.replace("new THREE.HemisphereLight(0x3a4458, 0x0c0a08, 0.55)", "new THREE.HemisphereLight(0xffffff, 0x404040, 1.3)")
    open(os.path.join(ROOT, "build", "cars.html"), "w").write(t.replace("__DATA__", json.dumps(parts)))
    print(len(parts))

main()
