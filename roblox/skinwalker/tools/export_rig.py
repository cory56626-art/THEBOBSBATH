"""Export the creature rig (bones + welded pieces) to build/rig.json for the pose previewer."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from creature import build_creature  # noqa: E402

model, rig = build_creature()
bones, parts = {}, []
for c in model.children:
    m = getattr(c, "meta", None)
    if not m:
        continue
    if m.get("hidden"):
        bones[c.props["Name"][1]] = {"parent": m["parent"], "joint": list(m["joint"])}
    else:
        bone = m["bone"]
        bp = bones_pos = None
        parts.append({"bone": bone, "cf": list(m["cf"].components()), "size": list(m["size"]),
                      "shape": m["shape"], "color": list(m["color"]), "material": m["material"]})
out = os.path.join(os.path.dirname(HERE), "build", "rig.json")
with open(out, "w") as fh:
    json.dump({"bones": bones, "parts": parts}, fh)
print(f"{len(bones)} bones, {len(parts)} parts -> {out}")
