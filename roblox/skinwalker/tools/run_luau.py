"""Run a Luau file inside the game via Open Cloud Luau Execution and print the result.

    python3 tools/run_luau.py tools/verify.luau [version]
The API key is injected by the session proxy; nothing secret is stored here.
"""
import json
import subprocess
import sys
import time

UNIVERSE, PLACE = "4143610457", "11697807657"
BASE = "https://apis.roblox.com/cloud/v2"


def curl(*args):
    out = subprocess.run(["curl", "-sS", *args], capture_output=True, text=True, check=True).stdout
    return json.loads(out) if out.strip() else {}


def main():
    src = open(sys.argv[1], encoding="utf-8").read()
    version = sys.argv[2] if len(sys.argv) > 2 else None
    path = f"{BASE}/universes/{UNIVERSE}/places/{PLACE}"
    if version:
        path += f"/versions/{version}"
    task = curl("-X", "POST", f"{path}/luau-execution-session-tasks", "-H", "Content-Type: application/json",
                "--data-binary", json.dumps({"script": src, "timeout": "60s"}))
    if "path" not in task:
        print(json.dumps(task, indent=2))
        sys.exit(1)
    for _ in range(60):
        time.sleep(3)
        t = curl(f"{BASE}/{task['path']}")
        if t.get("state") in ("COMPLETE", "FAILED", "CANCELLED"):
            print("state:", t["state"])
            if t.get("error"):
                print("error:", json.dumps(t["error"], indent=2))
            for r in (t.get("output") or {}).get("results", []):
                print(r)
            logs = curl(f"{BASE}/{task['path']}/logs")
            for page in logs.get("luauExecutionSessionTaskLogs", []):
                for m in page.get("messages", []):
                    print("log:", m)
            sys.exit(0 if t["state"] == "COMPLETE" else 1)
    print("timed out waiting for task")
    sys.exit(1)


if __name__ == "__main__":
    main()
