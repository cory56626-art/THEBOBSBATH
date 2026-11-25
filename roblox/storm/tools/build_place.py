"""Build the Steal a Storm place (build/place.rbxl). Reuses the place-file writers from ../skinwalker/tools.

    python3 tools/build_place.py [--test]
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(os.path.dirname(ROOT), "skinwalker", "tools"))
sys.path.insert(0, HERE)

from rbx import Inst, script, write_place  # noqa: E402
from rbxl_binary import write_rbxl  # noqa: E402

SRC = os.path.join(ROOT, "src")
BUILD = os.path.join(ROOT, "build")


def read(rel):
    with open(os.path.join(SRC, rel), encoding="utf-8") as fh:
        return fh.read()


def wrapped(name, src):
    return script("ModuleScript", name, "return function()\n" + src.replace("--!strict\n", "") + "\nend\n")


def main():
    test = "--test" in sys.argv
    os.makedirs(BUILD, exist_ok=True)
    services = []
    workspace = Inst("Workspace", "Workspace")
    workspace.set("StreamingEnabled", "bool", False)
    try:
        from room import build_room  # noqa: E402
        room, extras = build_room()
        workspace.add(room, *extras)
    except ImportError:
        pass
    rs = Inst("ReplicatedStorage", "ReplicatedStorage")
    for name in sorted(os.listdir(os.path.join(SRC, "ReplicatedStorage"))):
        if name.endswith(".luau"):
            rs.add(script("ModuleScript", name[:-5], read(f"ReplicatedStorage/{name}")))
    tmpl = os.path.join(HERE, "templates.py")
    if os.path.exists(tmpl):
        from templates import build_templates  # noqa: E402
        rs.add(build_templates())
    sss = Inst("ServerScriptService", "ServerScriptService")
    for name in sorted(os.listdir(os.path.join(SRC, "ServerScriptService"))):
        if name.endswith(".server.luau"):
            sss.add(script("Script", name[:-12], read(f"ServerScriptService/{name}")))
        elif name.endswith(".luau"):
            sss.add(script("ModuleScript", name[:-5], read(f"ServerScriptService/{name}")))
    sp = Inst("StarterPlayer", "StarterPlayer")
    sps = Inst("StarterPlayerScripts", "StarterPlayerScripts")
    for name in sorted(os.listdir(os.path.join(SRC, "StarterPlayerScripts"))):
        if name.endswith(".client.luau"):
            sps.add(script("LocalScript", name[:-12], read(f"StarterPlayerScripts/{name}")))
    sp.add(sps)
    sp.set("CharacterWalkSpeed", "float", 16)
    services = [workspace, rs, sss, sp]
    lighting = os.path.join(HERE, "lighting.py")
    if os.path.exists(lighting):
        from lighting import build_lighting  # noqa: E402
        services.append(build_lighting())
    if test:
        ss = Inst("ServerStorage", "ServerStorage")
        for name in sorted(os.listdir(os.path.join(SRC, "StarterPlayerScripts"))):
            if name.endswith(".client.luau"):
                ss.add(wrapped(name[:-12] + "Check", read(f"StarterPlayerScripts/{name}")))
        for name in sorted(os.listdir(os.path.join(SRC, "ServerScriptService"))):
            if name.endswith(".server.luau"):
                ss.add(wrapped(name[:-12] + "Check", read(f"ServerScriptService/{name}")))
        services.append(ss)
    out = os.path.join(BUILD, "place-test.rbxl" if test else "place.rbxl")
    write_place(services, out[:-5] + ".rbxlx")
    write_rbxl(services, out)
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
