import sqlite3
from datetime import date

from app.filename_dates import parse_date_from_filename


def set_capture_date(conn: sqlite3.Connection, file_id: int, d: date) -> bool:
    row = conn.execute("SELECT id FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        return False
    iso = d.isoformat()
    conn.execute(
        """
        UPDATE files
        SET capture_date = ?, capture_day = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (iso, iso, file_id),
    )
    return True


def set_capture_dates_bulk(conn: sqlite3.Connection, file_ids: list[int], d: date) -> int:
    updated = 0
    for fid in file_ids:
        if set_capture_date(conn, fid, d):
            updated += 1
    conn.commit()
    return updated


def fix_dates_from_filename(conn: sqlite3.Connection, file_ids: list[int]) -> tuple[int, int, list[int]]:
    """Update each file from its filename date. Returns (fixed, skipped, fixed_ids)."""
    fixed = 0
    skipped = 0
    fixed_ids: list[int] = []
    for fid in file_ids:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (fid,)).fetchone()
        if not row:
            skipped += 1
            continue
        filename_date = parse_date_from_filename(row["filename"])
        if not filename_date:
            skipped += 1
            continue
        if set_capture_date(conn, fid, filename_date):
            fixed += 1
            fixed_ids.append(fid)
        else:
            skipped += 1
    conn.commit()
    return fixed, skipped, fixed_ids
