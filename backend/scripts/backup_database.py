#!/usr/bin/env python3
"""Create a datetime-stamped backup of the Image Organizer index.db.

Usage:
  python backup_database.py
  python backup_database.py --db ~/.imageOrganizer/index.db
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db_backup import create_database_backup


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup Image Organizer index.db with a timestamped copy.")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path.home() / "Media" / ".imageOrganizer" / "index.db",
        help="Path to index.db (default: ~/Media/.imageOrganizer/index.db)",
    )
    args = parser.parse_args()

    if not args.db.is_file():
        print(f"Database not found: {args.db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(args.db)
    try:
        backup = create_database_backup(conn, backups_dir=args.db.parent / "backups")
    finally:
        conn.close()

    size_kb = backup["size_bytes"] / 1024
    print(f"Backup created: {backup['path']}")
    print(f"Size: {size_kb:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
