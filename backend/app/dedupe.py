import re
import sqlite3

import imagehash

from app.config import PHASH_THRESHOLD

_COPY_SUFFIX = re.compile(r"(?:[\s_]\(\d+\)|_\(\d+\))(?=\.[^.]+$)")


def is_copy_filename(filename: str) -> bool:
    return bool(_COPY_SUFFIX.search(filename))


def _keeper_sort_key(row: sqlite3.Row | dict) -> tuple:
    capture = row["capture_date"] or ""
    prefer_original_name = 0 if is_copy_filename(row["filename"]) else 1
    return (row["size"], prefer_original_name, capture, row["id"])


def choose_default_keeper(files: list[sqlite3.Row | dict]) -> int:
    if not files:
        raise ValueError("choose_default_keeper requires at least one file")
    return max(files, key=_keeper_sort_key)["id"]


def _load_group_files(conn: sqlite3.Connection, file_ids: list[int]) -> list[sqlite3.Row]:
    if not file_ids:
        return []
    placeholders = ",".join("?" * len(file_ids))
    return conn.execute(
        f"SELECT * FROM files WHERE id IN ({placeholders}) ORDER BY capture_date",
        file_ids,
    ).fetchall()


def reconcile_default_keepers(conn: sqlite3.Connection) -> None:
    groups = conn.execute("SELECT * FROM duplicate_groups").fetchall()
    for g in groups:
        file_rows = conn.execute(
            """
            SELECT f.* FROM files f
            JOIN duplicate_members dm ON dm.file_id = f.id
            WHERE dm.group_id = ?
            ORDER BY f.capture_date
            """,
            (g["id"],),
        ).fetchall()
        if not file_rows:
            continue
        keeper_id = g["keeper_id"]
        keeper_row = next((f for f in file_rows if f["id"] == keeper_id), None)
        if keeper_row is None:
            keeper_id = choose_default_keeper(file_rows)
            conn.execute(
                "UPDATE duplicate_groups SET keeper_id = ? WHERE id = ?",
                (keeper_id, g["id"]),
            )
            continue
        largest_size = max(f["size"] for f in file_rows)
        if keeper_row["size"] < largest_size:
            conn.execute(
                "UPDATE duplicate_groups SET keeper_id = ? WHERE id = ?",
                (choose_default_keeper(file_rows), g["id"]),
            )
    conn.commit()


def merge_labels_to_keeper(
    conn: sqlite3.Connection, keeper_id: int, source_file_id: int
) -> None:
    from app import events as events_svc
    from app import people as people_svc
    from app import tags as tags_svc
    from app.db import get_file_events

    event_ids = {e["id"] for e in get_file_events(conn, keeper_id)}
    event_ids.update(e["id"] for e in get_file_events(conn, source_file_id))
    events_svc.set_file_events(conn, keeper_id, sorted(event_ids))

    person_ids = {p["id"] for p in people_svc.get_file_people(conn, keeper_id)}
    person_ids.update(p["id"] for p in people_svc.get_file_people(conn, source_file_id))
    people_svc.set_file_people(conn, keeper_id, sorted(person_ids))

    tag_ids = {t["id"] for t in tags_svc.get_file_tags(conn, keeper_id)}
    tag_ids.update(t["id"] for t in tags_svc.get_file_tags(conn, source_file_id))
    tags_svc.set_file_tags(conn, keeper_id, sorted(tag_ids))


def dismiss_duplicate_member(
    conn: sqlite3.Connection, group_id: int, file_id: int
) -> None:
    from app import events as events_svc
    from app import people as people_svc
    from app import tags as tags_svc

    group = conn.execute(
        "SELECT * FROM duplicate_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if not group:
        raise ValueError("Group not found")
    member = conn.execute(
        "SELECT 1 FROM duplicate_members WHERE group_id = ? AND file_id = ?",
        (group_id, file_id),
    ).fetchone()
    if not member:
        raise ValueError("File not in group")
    keeper_id = group["keeper_id"]
    if keeper_id is None:
        raise ValueError("No keeper set")
    if file_id == keeper_id:
        raise ValueError("Cannot dismiss keeper")
    merge_labels_to_keeper(conn, keeper_id, file_id)
    tags_svc.set_file_tags(conn, file_id, [])
    people_svc.set_file_people(conn, file_id, [])
    events_svc.set_file_events(conn, file_id, [])
    conn.execute(
        "DELETE FROM duplicate_members WHERE group_id = ? AND file_id = ?",
        (group_id, file_id),
    )
    remaining = conn.execute(
        "SELECT COUNT(*) FROM duplicate_members WHERE group_id = ?",
        (group_id,),
    ).fetchone()[0]
    if remaining < 2:
        conn.execute("DELETE FROM duplicate_members WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM duplicate_groups WHERE id = ?", (group_id,))
    conn.execute(
        "INSERT INTO review_decisions (file_id, action, target_path) VALUES (?, 'delete', NULL)",
        (file_id,),
    )
    conn.commit()


def rebuild_duplicate_groups(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM duplicate_members")
    conn.execute("DELETE FROM duplicate_groups")

    sha_rows = conn.execute(
        """
        SELECT sha256, GROUP_CONCAT(id) AS ids
        FROM files
        WHERE sha256 IS NOT NULL
        GROUP BY sha256
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for row in sha_rows:
        ids = [int(x) for x in row["ids"].split(",")]
        file_rows = _load_group_files(conn, ids)
        keeper_id = choose_default_keeper(file_rows)
        cur = conn.execute(
            "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('exact', ?)",
            (keeper_id,),
        )
        gid = cur.lastrowid
        for fid in ids:
            conn.execute(
                "INSERT INTO duplicate_members (group_id, file_id) VALUES (?, ?)",
                (gid, fid),
            )

    phash_rows = conn.execute(
        "SELECT id, phash FROM files WHERE phash IS NOT NULL"
    ).fetchall()
    assigned: set[int] = set()
    for i, row_a in enumerate(phash_rows):
        if row_a["id"] in assigned:
            continue
        try:
            hash_a = imagehash.hex_to_hash(row_a["phash"])
        except Exception:
            continue
        group_ids = [row_a["id"]]
        for row_b in phash_rows[i + 1 :]:
            if row_b["id"] in assigned:
                continue
            try:
                hash_b = imagehash.hex_to_hash(row_b["phash"])
            except Exception:
                continue
            if hash_a - hash_b <= PHASH_THRESHOLD:
                group_ids.append(row_b["id"])
        if len(group_ids) > 1:
            file_rows = _load_group_files(conn, group_ids)
            keeper_id = choose_default_keeper(file_rows)
            cur = conn.execute(
                "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('perceptual', ?)",
                (keeper_id,),
            )
            gid = cur.lastrowid
            for fid in group_ids:
                conn.execute(
                    "INSERT INTO duplicate_members (group_id, file_id) VALUES (?, ?)",
                    (gid, fid),
                )
                assigned.add(fid)

    conn.commit()
    reconcile_default_keepers(conn)


def get_duplicate_groups(conn: sqlite3.Connection) -> list[dict]:
    reconcile_default_keepers(conn)
    groups = conn.execute(
        "SELECT * FROM duplicate_groups ORDER BY id DESC"
    ).fetchall()
    result = []
    for g in groups:
        file_rows = conn.execute(
            """
            SELECT f.* FROM files f
            JOIN duplicate_members dm ON dm.file_id = f.id
            WHERE dm.group_id = ?
            ORDER BY f.capture_date
            """,
            (g["id"],),
        ).fetchall()
        result.append(
            {
                "id": g["id"],
                "group_type": g["group_type"],
                "keeper_id": g["keeper_id"],
                "files": [dict(f) for f in file_rows],
            }
        )
    return result
