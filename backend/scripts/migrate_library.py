#!/usr/bin/env python3
"""Rewrite absolute paths after copying a media library to a new root.

Usage:
  # Dry run
  python migrate_library.py --from /Users/alex/Media --to /Volumes/Big/Media --db /Volumes/Big/Media/.imageOrganizer/index.db --dry-run

  # Apply rewrite (DB already at --to catalog)
  python migrate_library.py --from /Users/alex/Media --to /Volumes/Big/Media

  # Docker container paths after renaming .trash only:
  python migrate_library.py --old-prefix /media --new-prefix /media --db /path/to/index.db
  # (no-op) or for trash rename use matching host DB after mount:
  python migrate_library.py --old-prefix /media/.trash --new-prefix /media/.trash ...

Typical cold migrate:
  1. Stop the app
  2. Copy the whole media root (includes .imageOrganizer/ when co-located)
  3. Run this script against the *new* copy's index.db
  4. Point MEDIA_ROOT (or bootstrap) at the new root and start the app

Docker tip: if paths inside the DB are /media/..., remount MEDIA_HOST_PATH
to the new host folder and skip rewriting — only rewrite when the prefix changes.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.library_migrate import boundary_replace, rewrite_path_prefixes, write_bootstrap


def main() -> int:
    parser = argparse.ArgumentParser(description="Rewrite Image Organizer library path prefixes.")
    parser.add_argument("--from", dest="old_root", type=Path, help="Old media root prefix")
    parser.add_argument("--to", dest="new_root", type=Path, help="New media root prefix")
    parser.add_argument(
        "--old-prefix",
        type=str,
        help="Explicit old path prefix (overrides --from)",
    )
    parser.add_argument(
        "--new-prefix",
        type=str,
        help="Explicit new path prefix (overrides --to)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        help="Path to index.db (default: {to}/.imageOrganizer/index.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count matching rows without writing",
    )
    parser.add_argument(
        "--write-bootstrap",
        action="store_true",
        help="Write ~/.config/imageOrganizer/bootstrap.json to the new media root",
    )
    args = parser.parse_args()

    old_prefix = args.old_prefix or (str(args.old_root.resolve()) if args.old_root else None)
    new_prefix = args.new_prefix or (str(args.new_root.resolve()) if args.new_root else None)
    if not old_prefix or not new_prefix:
        print("Provide --from/--to or --old-prefix/--new-prefix", file=sys.stderr)
        return 2

    if args.db:
        db_path = args.db
    elif args.new_root:
        db_path = args.new_root / ".imageOrganizer" / "index.db"
    else:
        print("--db is required when not using --to", file=sys.stderr)
        return 2

    if not db_path.is_file():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        if args.dry_run:
            sample = conn.execute("SELECT path FROM files LIMIT 5").fetchall()
            would = 0
            for row in conn.execute("SELECT path FROM files"):
                if boundary_replace(row["path"], old_prefix, new_prefix) is not None:
                    would += 1
            print(f"Would rewrite ~{would} files.path rows")
            print(f"old_prefix={old_prefix}")
            print(f"new_prefix={new_prefix}")
            print("Sample paths:")
            for row in sample:
                print(f"  {row['path']}")
            return 0

        counts = rewrite_path_prefixes(conn, old_prefix, new_prefix)
    finally:
        conn.close()

    print("Rewrite complete:")
    for key, n in counts.items():
        print(f"  {key}: {n}")

    if args.write_bootstrap and args.new_root:
        app_data = args.new_root / ".imageOrganizer"
        write_bootstrap(media_root=str(args.new_root.resolve()), app_data_dir=str(app_data.resolve()))
        print(f"Wrote bootstrap for media_root={args.new_root}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
