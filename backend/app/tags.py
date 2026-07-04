import sqlite3

from app.metadata import slugify


def _unique_slug(conn: sqlite3.Connection, table: str, base_slug: str) -> str:
    slug = base_slug
    n = 1
    while conn.execute(f"SELECT 1 FROM {table} WHERE slug = ?", (slug,)).fetchone():
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def list_tags(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.*,
            COUNT(DISTINCT fe.file_id) AS photo_count
        FROM tags t
        LEFT JOIN event_tags et ON et.tag_id = t.id
        LEFT JOIN file_events fe ON fe.event_id = et.event_id
        GROUP BY t.id
        ORDER BY t.name
        """
    ).fetchall()
    return [dict(r) for r in rows]


def get_tag(conn: sqlite3.Connection, tag_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT t.*,
            COUNT(DISTINCT fe.file_id) AS photo_count
        FROM tags t
        LEFT JOIN event_tags et ON et.tag_id = t.id
        LEFT JOIN file_events fe ON fe.event_id = et.event_id
        WHERE t.id = ?
        GROUP BY t.id
        """,
        (tag_id,),
    ).fetchone()
    return dict(row) if row else None


def create_tag(conn: sqlite3.Connection, name: str) -> dict:
    slug = _unique_slug(conn, "tags", slugify(name))
    cur = conn.execute(
        "INSERT INTO tags (name, slug) VALUES (?, ?)",
        (name.strip(), slug),
    )
    conn.commit()
    return get_tag(conn, cur.lastrowid)  # type: ignore[arg-type]


def get_event_tags(conn: sqlite3.Connection, event_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.* FROM tags t
        JOIN event_tags et ON et.tag_id = t.id
        WHERE et.event_id = ?
        ORDER BY t.name
        """,
        (event_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def set_event_tags(conn: sqlite3.Connection, event_id: int, tag_ids: list[int]) -> None:
    conn.execute("DELETE FROM event_tags WHERE event_id = ?", (event_id,))
    for tid in tag_ids:
        conn.execute(
            "INSERT OR IGNORE INTO event_tags (event_id, tag_id) VALUES (?, ?)",
            (event_id, tid),
        )
    conn.commit()
