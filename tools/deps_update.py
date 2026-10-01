#!/usr/bin/env python3
"""Grouped local patch/minor lock updates; major upgrades need separate PRs."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "package-lock.json"


def versions() -> dict[str, str]:
    packages = json.loads(LOCK.read_text())["packages"]
    return {
        name: pkg["version"]
        for name, pkg in packages.items()
        if name and "version" in pkg
    }


def main() -> int:
    if not LOCK.is_file():
        print("deps-update: package-lock.json missing", file=sys.stderr)
        return 2
    before = versions()
    result = subprocess.run(
        ["npm", "update", "--package-lock-only", "--ignore-scripts"], cwd=ROOT
    )
    if result.returncode:
        return result.returncode
    after = versions()
    majors = [
        f"{name}: {old} -> {after[name]}"
        for name, old in before.items()
        if name in after and old.split(".", 1)[0] != after[name].split(".", 1)[0]
    ]
    if majors:
        print(
            "Major upgrades need separate PRs; do not commit this grouped lockfile:",
            file=sys.stderr,
        )
        print("\n".join(majors), file=sys.stderr)
        return 2
    print(
        "Grouped lockfile updated; run make check, review changelogs, and open one PR."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
