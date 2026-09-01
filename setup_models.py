from __future__ import annotations

import argparse
import shutil
import subprocess
import json
import re
import time
from urllib.request import Request, urlopen


def run_foundry(args: list[str], timeout: int = 900) -> tuple[int, str]:
    exe = shutil.which("foundry")
    if not exe:
        return 1, "Foundry CLI was not found on PATH."

    proc = subprocess.run(
        [exe, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    output = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    return proc.returncode, output


def _endpoint_from_status() -> str | None:
    code, output = run_foundry(["server", "status"], timeout=15)
    if code != 0:
        return None
    m = re.search(r"https?://(?:127\.0\.0\.1|localhost):\d+", output, re.I)
    return (m.group(0).rstrip("/") + "/v1") if m else None


def _loaded_ids() -> list[str]:
    endpoint = _endpoint_from_status()
    if not endpoint:
        return []
    try:
        req = Request(endpoint + "/models", headers={"Accept": "application/json"})
        with urlopen(req, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return [str(x.get("id") or "") for x in payload.get("data", []) if x.get("id")]
    except Exception:
        return []


def _wait_loaded(alias: str, timeout: float = 45.0) -> str | None:
    wanted = alias.lower().split(":", 1)[0]
    deadline = time.time() + timeout
    while time.time() < deadline:
        for model_id in _loaded_ids():
            low = model_id.lower()
            if low == alias.lower() or low.split(":", 1)[0] == wanted or low.startswith(wanted + "-"):
                return model_id
        time.sleep(0.5)
    return None


def prepare(alias: str, fallbacks: list[str] | None = None) -> bool:
    candidates = [alias] + list(fallbacks or [])
    for candidate in candidates:
        print(f"\nPreparing {candidate} through Foundry Local server...")
        code, output = run_foundry(["model", "download", candidate])
        if code != 0:
            print(f"  DOWNLOAD ERROR: {output}")
            continue
        print("  Cached/download ready.")
        code, output = run_foundry(["model", "load", candidate])
        if code != 0:
            print(f"  LOAD ERROR: {output}")
            continue
        loaded = _wait_loaded(candidate)
        if loaded:
            print(f"  Ready: {loaded}")
            return True
        print("  LOAD ERROR: command returned, but model never appeared in /v1/models.")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--advanced",
        action="store_true",
        help="Also prepare phi-4-mini.",
    )
    args = parser.parse_args()

    code, output = run_foundry(["server", "start"])
    if code != 0 and "already" not in output.lower():
        print(output)

    if not prepare("qwen2.5-1.5b"):
        return 1

    if not prepare("qwen3-embedding-0.6b", ["qwen3-embedding-0.6b-generic-cpu"]):
        return 1

    if args.advanced and not prepare("phi-4-mini"):
        return 1

    print("\nSetup complete.")
    print("The app can now use the local Foundry server.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
