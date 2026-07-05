#!/usr/bin/env python3
"""Build docs/DEVELOPMENT_BOOK.md using cursor-book and book.json."""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / "tools/cursor-book/build_development_book.py"

if __name__ == "__main__":
    if not SCRIPT.is_file():
        print(f"Error: cursor-book not found at {SCRIPT}", file=sys.stderr)
        print("Run: git submodule update --init tools/cursor-book", file=sys.stderr)
        sys.exit(1)
    sys.exit(
        subprocess.call(
            [
                sys.executable,
                str(SCRIPT),
                "--config",
                str(REPO_ROOT / "book.json"),
                "--repo-root",
                str(REPO_ROOT),
            ]
        )
    )
