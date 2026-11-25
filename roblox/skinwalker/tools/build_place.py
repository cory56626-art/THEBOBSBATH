"""Build the Roblox place file (and a JSON scene for the browser preview).

    python3 roblox/skinwalker/tools/build_place.py
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from creature import build_creature  # noqa: E402
from rbx import Inst, script, write_place  # noqa: E402
from rbxl_binary import write_rbxl  # noqa: E402
from scene import build_scene  # noqa: E402

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
BUILD = os.path.join(ROOT, "build")


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8") as fh:
        return fh.read()


def lighting() -> Inst:
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "00:00:00")
    L.set("Brightness", "float", 0.6)
    L.set("Ambient", "Color3", (8, 8, 12))
    L.set("OutdoorAmbient", "Color3", (38, 42, 54))
    L.set("GlobalShadows", "bool", True)
    L.set("Technology", "token", 4)  # Future
    L.set("EnvironmentDiffuseScale", "float", 0.25)
    L.set("EnvironmentSpecularScale", "float", 1.0)
    L.set("ExposureCompensation", "float", 0.2)
    L.set("FogColor", "Color3", (30, 34, 42))
    L.set("FogStart", "float", 0)
    L.set("FogEnd", "float", 100000)
    L.add(Inst("Atmosphere", "Atmosphere", Density=("float", 0.32), Offset=("float", 0.1),
               Color=("Color3", (52, 60, 74)), Decay=("Color3", (24, 28, 38)),
               Glare=("float", 0), Haze=("float", 1.6)))
    L.add(Inst("ColorCorrectionEffect", "Grade", Brightness=("float", 0.0), Contrast=("float", 0.18),
               Saturation=("float", -0.22), TintColor=("Color3", (225, 232, 255)), Enabled=("bool", True)))
    L.add(Inst("BloomEffect", "Bloom", Intensity=("float", 0.8), Size=("float", 28),
               Threshold=("float", 1.2), Enabled=("bool", True)))
    return L


def collect_preview(inst: Inst, out: list):
    meta = getattr(inst, "meta", None)
    if meta and not meta.get("hidden"):
        lights = []
        for c in inst.children:
            if c.cls in ("SpotLight", "PointLight"):
                lights.append({"type": c.cls, "brightness": c.props["Brightness"][1],
                               "range": c.props["Range"][1], "color": c.props["Color"][1],
                               "angle": c.props.get("Angle", ("", 0))[1],
                               "face": c.props.get("Face", ("", 5))[1]})
        out.append({"name": inst.props["Name"][1], "shape": meta["shape"],
                    "cf": list(meta["cf"].components()), "size": list(meta["size"]),
                    "color": list(meta["color"]), "material": meta["material"],
                    "transparency": meta["transparency"], "lights": lights})
    for c in inst.children:
        collect_preview(c, out)


def main():
    os.makedirs(BUILD, exist_ok=True)
    creature, rig = build_creature()
    scene = build_scene()

    workspace = Inst("Workspace", "Workspace")
    workspace.set("StreamingEnabled", "bool", False)
    workspace.add(scene, creature)

    starter_player = Inst("StarterPlayer", "StarterPlayer")
    sps = Inst("StarterPlayerScripts", "StarterPlayerScripts")
    sps.add(script("LocalScript", "SkinwalkerAnimator", read("StarterPlayerScripts/SkinwalkerAnimator.client.luau")))
    starter_player.add(sps)

    services = [workspace, lighting(), starter_player,
                Inst("ReplicatedStorage", "ReplicatedStorage"), Inst("ServerScriptService", "ServerScriptService")]
    # .rbxl (binary) is what Open Cloud accepts; .rbxlx is kept for reading/diffing
    write_place(services, os.path.join(BUILD, "place.rbxlx"))
    place = os.path.join(BUILD, "place.rbxl")
    write_rbxl(services, place)

    preview: list = []
    collect_preview(workspace, preview)
    with open(os.path.join(BUILD, "preview.json"), "w") as fh:
        json.dump(preview, fh)

    bones = sum(1 for c in creature.children if getattr(c, "meta", {}).get("hidden"))
    print(f"creature: {rig.count} visible parts, {bones} bones")
    print(f"preview parts: {len(preview)}")
    print(f"wrote {place} ({os.path.getsize(place) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
