import sqlite3
from datetime import date

from app.metadata import slugify


def list_events(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT e.*,
            COUNT(fe.file_id) AS photo_count,
            MIN(f.capture_day) AS date_span_start,
            MAX(f.capture_day) AS date_span_end
        FROM events e
        LEFT JOIN file_events fe ON fe.event_id = e.id
        LEFT JOIN files f ON f.id = fe.file_id
        GROUP BY e.id
        ORDER BY e.name
        """
    ).fetchall()
    return [dict(r) for r in rows]


def get_event(conn: sqlite3.Connection, event_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT e.*,
            COUNT(fe.file_id) AS photo_count,
            MIN(f.capture_day) AS date_span_start,
            MAX(f.capture_day) AS date_span_end
        FROM events e
        LEFT JOIN file_events fe ON fe.event_id = e.id
        LEFT JOIN files f ON f.id = fe.file_id
        WHERE e.id = ?
        GROUP BY e.id
        """,
        (event_id,),
    ).fetchone()
    return dict(row) if row else None


def create_event(conn: sqlite3.Connection, data: dict) -> dict:
    slug = slugify(data["name"])
    base_slug = slug
    n = 1
    while conn.execute("SELECT 1 FROM events WHERE slug = ?", (slug,)).fetchone():
        slug = f"{base_slug}-{n}"
        n += 1
    cur = conn.execute(
        """
        INSERT INTO events (name, slug, color, description, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data["name"],
            slug,
            data.get("color", "#6366f1"),
            data.get("description"),
            data["start_date"].isoformat() if data.get("start_date") else None,
            data["end_date"].isoformat() if data.get("end_date") else None,
        ),
    )
    conn.commit()
    return get_event(conn, cur.lastrowid)  # type: ignore[arg-type]


def update_event(conn: sqlite3.Connection, event_id: int, data: dict) -> dict | None:
    existing = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not existing:
        return None
    name = data.get("name", existing["name"])
    slug = existing["slug"]
    if data.get("name") and data["name"] != existing["name"]:
        slug = slugify(data["name"])
    conn.execute(
        """
        UPDATE events SET
            name = ?, slug = ?, color = ?, description = ?,
            start_date = ?, end_date = ?
        WHERE id = ?
        """,
        (
            name,
            slug,
            data.get("color", existing["color"]),
            data.get("description", existing["description"]),
            data["start_date"].isoformat() if data.get("start_date") else existing["start_date"],
            data["end_date"].isoformat() if data.get("end_date") else existing["end_date"],
            event_id,
        ),
    )
    conn.commit()
    return get_event(conn, event_id)


def delete_event(conn: sqlite3.Connection, event_id: int) -> bool:
    cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    return cur.rowcount > 0


def assign_files_by_ids(conn: sqlite3.Connection, event_id: int, file_ids: list[int]) -> int:
    count = 0
    for fid in file_ids:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO file_events (file_id, event_id) VALUES (?, ?)",
                (fid, event_id),
            )
            count += 1
        except sqlite3.Error:
            pass
    conn.commit()
    return count


def assign_files_by_range(
    conn: sqlite3.Connection,
    event_id: int,
    start: date,
    end: date,
    location: str = "archive",
) -> int:
    if location == "archive":
        rows = conn.execute(
            """
            SELECT id FROM files
            WHERE location = 'archive' AND capture_day >= ? AND capture_day <= ?
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id FROM files
            WHERE capture_day >= ? AND capture_day <= ?
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()
    ids = [r["id"] for r in rows]
    return assign_files_by_ids(conn, event_id, ids)


def set_file_events(conn: sqlite3.Connection, file_id: int, event_ids: list[int]) -> None:
    conn.execute("DELETE FROM file_events WHERE file_id = ?", (file_id,))
    for eid in event_ids:
        conn.execute(
            "INSERT OR IGNORE INTO file_events (file_id, event_id) VALUES (?, ?)",
            (file_id, eid),
        )
    conn.commit()


def remove_file_from_event(conn: sqlite3.Connection, event_id: int, file_id: int) -> None:
    conn.execute(
        "DELETE FROM file_events WHERE event_id = ? AND file_id = ?",
        (event_id, file_id),
    )
    conn.commit()
