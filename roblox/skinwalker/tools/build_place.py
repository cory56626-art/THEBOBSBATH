"""Build the Roblox place file (and a JSON scene for the browser preview).

    python3 tools/build_place.py          # build/place.rbxl
    python3 tools/build_place.py --test   # build/place-test.rbxl (adds startable copies for the test runner)
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from creature import build_creature  # noqa: E402
from hospital import build_hospital, creature_point, spawn_point  # noqa: E402
from rbx import CF, Inst, part, script, write_place  # noqa: E402
from rbxl_binary import write_rbxl  # noqa: E402

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
BUILD = os.path.join(ROOT, "build")


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8") as fh:
        return fh.read()


def lighting() -> Inst:
    """Night inside an abandoned hospital: dark, dusty, lit by failing fluorescents (bring the flashlight)."""
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "01:00:00")
    L.set("Brightness", "float", 0)
    L.set("Ambient", "Color3", (34, 34, 40))
    L.set("OutdoorAmbient", "Color3", (30, 30, 36))
    L.set("GlobalShadows", "bool", True)
    L.set("EnvironmentDiffuseScale", "float", 0.15)
    L.set("EnvironmentSpecularScale", "float", 0.5)
    L.set("ExposureCompensation", "float", 0.35)
    L.set("FogEnd", "float", 100000)
    L.add(Inst("Atmosphere", "Atmosphere", Density=("float", 0.28), Offset=("float", 0.0),
               Color=("Color3", (40, 42, 44)), Decay=("Color3", (24, 25, 28)),
               Glare=("float", 0), Haze=("float", 1.4)))
    L.add(Inst("ColorCorrectionEffect", "Grade", Brightness=("float", 0.02), Contrast=("float", 0.15),
               Saturation=("float", -0.3), TintColor=("Color3", (225, 235, 228)), Enabled=("bool", True)))
    L.add(Inst("BloomEffect", "Bloom", Intensity=("float", 0.7), Size=("float", 24),
               Threshold=("float", 1.3), Enabled=("bool", True)))
    return L


def shift_model(model: Inst, d):
    """Translate every part of a model (welds/motors store relative offsets, so they stay valid)."""
    for c in model.children:
        meta = getattr(c, "meta", None)
        if meta:
            cf = meta["cf"].translated(d)
            meta["cf"] = cf
            c.set("CFrame", "CoordinateFrame", cf)


def collect_preview(inst: Inst, out: list):
    meta = getattr(inst, "meta", None)
    if meta and not meta.get("hidden") and "cf" in meta:
        lights = []
        for c in inst.children:
            if c.cls in ("SpotLight", "PointLight", "SurfaceLight"):
                lights.append({"type": c.cls, "brightness": c.props["Brightness"][1],
                               "range": c.props["Range"][1], "color": c.props["Color"][1],
                               "angle": c.props.get("Angle", ("", 90))[1],
                               "face": c.props.get("Face", ("", 5))[1]})
        out.append({"name": inst.props["Name"][1], "shape": meta["shape"],
                    "cf": list(meta["cf"].components()), "size": list(meta["size"]),
                    "color": list(meta["color"]), "material": meta["material"],
                    "transparency": meta["transparency"], "lights": lights})
    for c in inst.children:
        collect_preview(c, out)


def wrapped(name, src):
    """A ModuleScript returning the script body as a function: requiring it compiles without running it."""
    return script("ModuleScript", name, "return function()\n" + src.replace("--!strict\n", "") + "\nend\n")


def main():
    test = "--test" in sys.argv
    os.makedirs(BUILD, exist_ok=True)
    creature, rig = build_creature()
    hosp = build_hospital()
    shift_model(creature, creature_point())

    workspace = Inst("Workspace", "Workspace")
    workspace.set("StreamingEnabled", "bool", False)
    sp = spawn_point()
    spawn = Inst("SpawnLocation", "Spawn")
    spawn.props.update(part("Spawn", CF.look((sp[0], -0.45, sp[2]), (0, 0, -1)), (6, 1, 6), (60, 62, 58),
                            "SmoothPlastic", anchored=True, collide=True, transparency=1).props)
    spawn.set("Neutral", "bool", True)
    spawn.set("Duration", "int", 0)
    workspace.add(hosp.root, creature, spawn)

    rs = Inst("ReplicatedStorage", "ReplicatedStorage")
    rs.add(script("ModuleScript", "SkinwalkerConfig", read("ReplicatedStorage/SkinwalkerConfig.luau")),
           script("ModuleScript", "SoundBank", read("ReplicatedStorage/SoundBank.luau")),
           script("ModuleScript", "Sfx", read("ReplicatedStorage/Sfx.luau")))

    sss = Inst("ServerScriptService", "ServerScriptService")
    ai_src = read("ServerScriptService/SkinwalkerAI/init.server.luau")
    ai = script("Script", "SkinwalkerAI", ai_src)
    ai.add(script("ModuleScript", "Memory", read("ServerScriptService/SkinwalkerAI/Memory.luau")),
           script("ModuleScript", "Mover", read("ServerScriptService/SkinwalkerAI/Mover.luau")))
    sss.add(ai,
            script("ModuleScript", "Lockers", read("ServerScriptService/Lockers.luau")),
            script("Script", "PlayerSystems", read("ServerScriptService/PlayerSystems.server.luau")),
            script("Script", "MapSetup", read("ServerScriptService/MapSetup.server.luau")))

    starter_player = Inst("StarterPlayer", "StarterPlayer")
    starter_player.set("GameSettingsAvatar", "token", 1)  # R15 (the procedural animations use R15 joints)
    sps = Inst("StarterPlayerScripts", "StarterPlayerScripts")
    client = ["SkinwalkerAnimator", "SkinwalkerClient", "PlayerControls", "CharacterAnimator", "MapClient"]
    for name in client:
        sps.add(script("LocalScript", name, read(f"StarterPlayerScripts/{name}.client.luau")))
    # replace Roblox's default footstep sounds with ours (matched to the animation)
    sps.add(script("LocalScript", "RbxCharacterSounds", "-- footsteps are played by CharacterAnimator\n"))
    scs = Inst("StarterCharacterScripts", "StarterCharacterScripts")
    # replace the default Animate script: CharacterAnimator drives every character procedurally
    scs.add(script("LocalScript", "Animate", "-- characters are animated by StarterPlayerScripts.CharacterAnimator\n"))
    starter_player.add(sps, scs)

    services = [workspace, lighting(), starter_player, rs, sss]
    if test:
        ss = Inst("ServerStorage", "ServerStorage")
        for name in client:
            ss.add(wrapped(name + "Check", read(f"StarterPlayerScripts/{name}.client.luau")))
        ss.add(wrapped("PlayerSystemsCheck", read("ServerScriptService/PlayerSystems.server.luau")))
        ss.add(wrapped("MapSetupCheck", read("ServerScriptService/MapSetup.server.luau")))
        # the test runner doesn't start place scripts, so ship a startable copy of the AI
        ai_run = wrapped("SkinwalkerAIRun", ai_src)
        ai_run.add(script("ModuleScript", "Memory", read("ServerScriptService/SkinwalkerAI/Memory.luau")),
                   script("ModuleScript", "Mover", read("ServerScriptService/SkinwalkerAI/Mover.luau")))
        ss.add(ai_run)
        services.append(ss)

    write_place(services, os.path.join(BUILD, "place-test.rbxlx" if test else "place.rbxlx"))
    place = os.path.join(BUILD, "place-test.rbxl" if test else "place.rbxl")
    write_rbxl(services, place)

    preview: list = []
    collect_preview(workspace, preview)
    with open(os.path.join(BUILD, "preview.json"), "w") as fh:
        json.dump(preview, fh)

    print(f"creature: {rig.count} visible parts; hospital groups: "
          + ", ".join(f"{k}={len(g.children)}" for k, g in hosp.groups.items()))
    print(f"wrote {place} ({os.path.getsize(place) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
