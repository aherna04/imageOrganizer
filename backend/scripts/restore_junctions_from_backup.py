#!/usr/bin/env python3
"""Restore photo label junction rows from a pre-migration index.db backup.

The trash-location migration (before the FK-OFF fix) could wipe file_tags,
file_people, file_events, and duplicate_members when rebuilding the files table.
This script merges those rows back from a backup database.

Usage:
  python restore_junctions_from_backup.py /path/to/old/index.db
  python restore_junctions_from_backup.py /path/to/old/index.db --db ~/.imageOrganizer/index.db

Stop the Image Organizer backend before running.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

JUNCTION_TABLES = (
    "file_tags",
    "file_people",
    "file_events",
    "duplicate_members",
)


def _count(conn: sqlite3.Connection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def restore_junctions(current_db: Path, backup_db: Path, dry_run: bool) -> int:
    if not current_db.is_file():
        print(f"Current database not found: {current_db}", file=sys.stderr)
        return 1
    if not backup_db.is_file():
        print(f"Backup database not found: {backup_db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(current_db)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    if not _table_exists(conn, "files"):
        print(f"Invalid database (no files table): {current_db}", file=sys.stderr)
        conn.close()
        return 1

    backup_uri = backup_db.resolve().as_uri()
    conn.execute(f"ATTACH DATABASE '{backup_uri}' AS old")

    try:
        for table in JUNCTION_TABLES:
            if not _table_exists(conn, table):
                print(f"Skipping {table} (missing in current DB)")
                continue
            if not _table_exists(conn, f"old.{table}"):
                # ATTACH alias: check via sqlite_master on attached db
                row = conn.execute(
                    "SELECT 1 FROM old.sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not row:
                    print(f"Skipping {table} (missing in backup)")
                    continue

            before = _count(conn, table)
            available = conn.execute(
                f"SELECT COUNT(*) FROM old.{table} WHERE file_id IN (SELECT id FROM files)"
            ).fetchone()[0]

            if dry_run:
                print(f"{table}: {before} rows now, {available} restorable from backup")
                continue

            conn.execute(
                f"""
                INSERT OR IGNORE INTO {table}
                SELECT * FROM old.{table}
                WHERE file_id IN (SELECT id FROM files)
                """
            )
            after = _count(conn, table)
            print(f"{table}: {before} -> {after} (+{after - before} restored)")

        if not dry_run:
            conn.commit()
            print("Done.")
        else:
            print("Dry run — no changes written.")
    finally:
        conn.execute("DETACH old")
        conn.close()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Restore tag/people/event links from a pre-migration index.db backup."
    )
    parser.add_argument(
        "backup_db",
        type=Path,
        help="Path to backup index.db from before the trash migration",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path.home() / ".imageOrganizer" / "index.db",
        help="Current index.db (default: ~/.imageOrganizer/index.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report restorable row counts without writing",
    )
    args = parser.parse_args()
    return restore_junctions(args.db, args.backup_db, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
