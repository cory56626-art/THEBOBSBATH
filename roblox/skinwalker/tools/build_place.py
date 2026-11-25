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
from scene import build_arena  # noqa: E402
from rbx import CF  # noqa: E402

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
BUILD = os.path.join(ROOT, "build")


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8") as fh:
        return fh.read()


def lighting() -> Inst:
    """Plain, bright daytime lighting so everything is easy to see while testing."""
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "14:30:00")
    L.set("Brightness", "float", 2.5)
    L.set("Ambient", "Color3", (90, 90, 90))
    L.set("OutdoorAmbient", "Color3", (140, 140, 140))
    L.set("GlobalShadows", "bool", True)
    L.set("FogEnd", "float", 100000)
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


def shift_model(model: Inst, d):
    """Translate every part of a model (welds/motors store relative offsets, so they stay valid)."""
    for c in model.children:
        meta = getattr(c, "meta", None)
        if meta:
            cf = meta["cf"].translated(d)
            meta["cf"] = cf
            c.set("CFrame", "CoordinateFrame", cf)


def main():
    os.makedirs(BUILD, exist_ok=True)
    creature, rig = build_creature()
    arena = build_arena()
    # move the creature away from the spawn (rig bones are world-aligned, so shift every part)
    shift_model(creature, (0.0, 0.0, 90.0))

    workspace = Inst("Workspace", "Workspace")
    workspace.set("StreamingEnabled", "bool", False)
    workspace.add(arena, creature)

    rs = Inst("ReplicatedStorage", "ReplicatedStorage")
    rs.add(script("ModuleScript", "SkinwalkerConfig", read("ReplicatedStorage/SkinwalkerConfig.luau")))

    sss = Inst("ServerScriptService", "ServerScriptService")
    ai = script("Script", "SkinwalkerAI", read("ServerScriptService/SkinwalkerAI/init.server.luau"))
    ai.add(script("ModuleScript", "Memory", read("ServerScriptService/SkinwalkerAI/Memory.luau")),
           script("ModuleScript", "Mover", read("ServerScriptService/SkinwalkerAI/Mover.luau")))
    sss.add(ai)

    starter_player = Inst("StarterPlayer", "StarterPlayer")
    sps = Inst("StarterPlayerScripts", "StarterPlayerScripts")
    sps.add(script("LocalScript", "SkinwalkerAnimator", read("StarterPlayerScripts/SkinwalkerAnimator.client.luau")),
            script("LocalScript", "SkinwalkerClient", read("StarterPlayerScripts/SkinwalkerClient.client.luau")))
    starter_player.add(sps)

    services = [workspace, lighting(), starter_player, rs, sss]
    if "--test" in sys.argv:
        # compile-check copies of the client scripts, wrapped so requiring them doesn't run them
        ss = Inst("ServerStorage", "ServerStorage")
        for name in ("SkinwalkerAnimator", "SkinwalkerClient"):
            src = read(f"StarterPlayerScripts/{name}.client.luau").replace("--!strict\n", "")
            ss.add(script("ModuleScript", name + "Check", "return function()\n" + src + "\nend\n"))
        # the test runner doesn't start place scripts, so ship a startable copy of the AI
        ai_run = script("ModuleScript", "SkinwalkerAIRun",
                        "return function()\n" + read("ServerScriptService/SkinwalkerAI/init.server.luau") + "\nend\n")
        ai_run.add(script("ModuleScript", "Memory", read("ServerScriptService/SkinwalkerAI/Memory.luau")),
                   script("ModuleScript", "Mover", read("ServerScriptService/SkinwalkerAI/Mover.luau")))
        ss.add(ai_run)
        services.append(ss)
    # .rbxl (binary) is what Open Cloud accepts; .rbxlx is kept for reading/diffing
    write_place(services, os.path.join(BUILD, "place.rbxlx"))
    place = os.path.join(BUILD, "place-test.rbxl" if "--test" in sys.argv else "place.rbxl")
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
