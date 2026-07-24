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


def list_people(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        f"""
        SELECT p.*,
            COUNT(DISTINCT f.id) AS photo_count
        FROM people p
        LEFT JOIN file_people fp ON fp.person_id = p.id
        LEFT JOIN files f ON f.id = fp.file_id
          AND {ACTIVE_LIBRARY_FILE_ON.strip()}
        GROUP BY p.id
        ORDER BY p.name
        """
    ).fetchall()
    return [dict(r) for r in rows]


def get_person(conn: sqlite3.Connection, person_id: int) -> dict | None:
    row = conn.execute(
        f"""
        SELECT p.*,
            COUNT(DISTINCT f.id) AS photo_count
        FROM people p
        LEFT JOIN file_people fp ON fp.person_id = p.id
        LEFT JOIN files f ON f.id = fp.file_id
          AND {ACTIVE_LIBRARY_FILE_ON.strip()}
        WHERE p.id = ?
        GROUP BY p.id
        """,
        (person_id,),
    ).fetchone()
    return dict(row) if row else None


def create_person(conn: sqlite3.Connection, name: str) -> dict:
    slug = _unique_slug(conn, "people", slugify(name))
    cur = conn.execute(
        "INSERT INTO people (name, slug) VALUES (?, ?)",
        (name.strip(), slug),
    )
    conn.commit()
    return get_person(conn, cur.lastrowid)  # type: ignore[arg-type]


def get_file_people(conn: sqlite3.Connection, file_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.* FROM people p
        JOIN file_people fp ON fp.person_id = p.id
        WHERE fp.file_id = ?
        ORDER BY p.name
        """,
        (file_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def set_file_people(conn: sqlite3.Connection, file_id: int, person_ids: list[int]) -> None:
    conn.execute("DELETE FROM file_people WHERE file_id = ?", (file_id,))
    for pid in person_ids:
        conn.execute(
            "INSERT OR IGNORE INTO file_people (file_id, person_id) VALUES (?, ?)",
            (file_id, pid),
        )
    conn.commit()


def assign_people_by_ids(
    conn: sqlite3.Connection, person_ids: list[int], file_ids: list[int]
) -> int:
    count = 0
    for fid in file_ids:
        for pid in person_ids:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO file_people (file_id, person_id) VALUES (?, ?)",
                    (fid, pid),
                )
                count += 1
            except sqlite3.Error:
                pass
    conn.commit()
    return count


def remove_people_by_ids(
    conn: sqlite3.Connection, person_ids: list[int], file_ids: list[int]
) -> int:
    if not person_ids or not file_ids:
        return 0
    person_placeholders = ",".join("?" * len(person_ids))
    file_placeholders = ",".join("?" * len(file_ids))
    cur = conn.execute(
        f"""
        DELETE FROM file_people
        WHERE person_id IN ({person_placeholders})
          AND file_id IN ({file_placeholders})
        """,
        [*person_ids, *file_ids],
    )
    conn.commit()
    return cur.rowcount


def update_person(conn: sqlite3.Connection, person_id: int, name: str) -> dict | None:
    existing = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
    if not existing:
        return None
    slug = existing["slug"]
    if name.strip() != existing["name"]:
        base_slug = slugify(name)
        slug = base_slug
        n = 1
        while conn.execute(
            "SELECT 1 FROM people WHERE slug = ? AND id != ?", (slug, person_id)
        ).fetchone():
            slug = f"{base_slug}-{n}"
            n += 1
    conn.execute(
        "UPDATE people SET name = ?, slug = ? WHERE id = ?",
        (name.strip(), slug, person_id),
    )
    conn.commit()
    return get_person(conn, person_id)


def delete_person(conn: sqlite3.Connection, person_id: int) -> bool:
    cur = conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
    conn.commit()
    return cur.rowcount > 0


def merge_people(conn: sqlite3.Connection, source_id: int, target_id: int) -> dict | None:
    if source_id == target_id:
        return get_person(conn, target_id)
    source = conn.execute("SELECT id FROM people WHERE id = ?", (source_id,)).fetchone()
    target = conn.execute("SELECT id FROM people WHERE id = ?", (target_id,)).fetchone()
    if not source or not target:
        return None
    file_rows = conn.execute(
        "SELECT file_id FROM file_people WHERE person_id = ?", (source_id,)
    ).fetchall()
    for row in file_rows:
        conn.execute(
            "INSERT OR IGNORE INTO file_people (file_id, person_id) VALUES (?, ?)",
            (row["file_id"], target_id),
        )
    conn.execute("DELETE FROM file_people WHERE person_id = ?", (source_id,))
    conn.execute("DELETE FROM people WHERE id = ?", (source_id,))
    conn.commit()
    return get_person(conn, target_id)
