import sqlite3

from app.inbox_filters import ACTIVE_LIBRARY_FILE_ON
from app.metadata import slugify


def _unique_slug(conn: sqlite3.Connection, table: str, base_slug: str) -> str:
    slug = base_slug
    n = 1
    while conn.execute(f"SELECT 1 FROM {table} WHERE slug = ?", (slug,)).fetchone():
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def _photo_count_sql() -> str:
    return f"""
        SELECT t.*,
            COUNT(DISTINCT f.id) AS photo_count
        FROM tags t
        LEFT JOIN file_tags ft ON ft.tag_id = t.id
        LEFT JOIN files f ON f.id = ft.file_id
          AND {ACTIVE_LIBRARY_FILE_ON.strip()}
    """


def list_tags(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        f"""
        {_photo_count_sql()}
        GROUP BY t.id
        ORDER BY t.name
        """
    ).fetchall()
    return [dict(r) for r in rows]


def get_tag(conn: sqlite3.Connection, tag_id: int) -> dict | None:
    row = conn.execute(
        f"""
        {_photo_count_sql()}
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


def get_or_create_tag(conn: sqlite3.Connection, name: str) -> dict:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Tag name is required")
    base_slug = slugify(cleaned)
    row = conn.execute(
        "SELECT id FROM tags WHERE lower(name) = lower(?) OR slug = ?",
        (cleaned, base_slug),
    ).fetchone()
    if row:
        tag = get_tag(conn, row["id"])
        if tag:
            return tag
    return create_tag(conn, cleaned)


def get_file_tags(conn: sqlite3.Connection, file_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.* FROM tags t
        JOIN file_tags ft ON ft.tag_id = t.id
        WHERE ft.file_id = ?
        ORDER BY t.name
        """,
        (file_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def set_file_tags(conn: sqlite3.Connection, file_id: int, tag_ids: list[int]) -> None:
    conn.execute("DELETE FROM file_tags WHERE file_id = ?", (file_id,))
    for tid in tag_ids:
        conn.execute(
            "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
            (file_id, tid),
        )
    conn.commit()


def assign_tags_by_ids(
    conn: sqlite3.Connection, tag_ids: list[int], file_ids: list[int]
) -> int:
    count = 0
    for fid in file_ids:
        for tid in tag_ids:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
                    (fid, tid),
                )
                count += 1
            except sqlite3.Error:
                pass
    conn.commit()
    return count


def remove_tags_by_ids(
    conn: sqlite3.Connection, tag_ids: list[int], file_ids: list[int]
) -> int:
    if not tag_ids or not file_ids:
        return 0
    tag_placeholders = ",".join("?" * len(tag_ids))
    file_placeholders = ",".join("?" * len(file_ids))
    cur = conn.execute(
        f"""
        DELETE FROM file_tags
        WHERE tag_id IN ({tag_placeholders})
          AND file_id IN ({file_placeholders})
        """,
        [*tag_ids, *file_ids],
    )
    conn.commit()
    return cur.rowcount


def update_tag(conn: sqlite3.Connection, tag_id: int, name: str) -> dict | None:
    existing = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not existing:
        return None
    slug = existing["slug"]
    if name.strip() != existing["name"]:
        base_slug = slugify(name)
        slug = base_slug
        n = 1
        while conn.execute(
            "SELECT 1 FROM tags WHERE slug = ? AND id != ?", (slug, tag_id)
        ).fetchone():
            slug = f"{base_slug}-{n}"
            n += 1
    conn.execute(
        "UPDATE tags SET name = ?, slug = ? WHERE id = ?",
        (name.strip(), slug, tag_id),
    )
    conn.commit()
    return get_tag(conn, tag_id)


def delete_tag(conn: sqlite3.Connection, tag_id: int) -> bool:
    cur = conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()
    return cur.rowcount > 0


def merge_tags(conn: sqlite3.Connection, source_id: int, target_id: int) -> dict | None:
    if source_id == target_id:
        return get_tag(conn, target_id)
    source = conn.execute("SELECT id FROM tags WHERE id = ?", (source_id,)).fetchone()
    target = conn.execute("SELECT id FROM tags WHERE id = ?", (target_id,)).fetchone()
    if not source or not target:
        return None
    file_rows = conn.execute(
        "SELECT file_id FROM file_tags WHERE tag_id = ?", (source_id,)
    ).fetchall()
    for row in file_rows:
        conn.execute(
            "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
            (row["file_id"], target_id),
        )
    event_rows = conn.execute(
        "SELECT event_id FROM event_tags WHERE tag_id = ?", (source_id,)
    ).fetchall()
    for row in event_rows:
        conn.execute(
            "INSERT OR IGNORE INTO event_tags (event_id, tag_id) VALUES (?, ?)",
            (row["event_id"], target_id),
        )
    conn.execute("DELETE FROM file_tags WHERE tag_id = ?", (source_id,))
    conn.execute("DELETE FROM event_tags WHERE tag_id = ?", (source_id,))
    conn.execute("DELETE FROM tags WHERE id = ?", (source_id,))
    conn.commit()
    return get_tag(conn, target_id)


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
