import sqlite3

import imagehash

from app.config import PHASH_THRESHOLD


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
        cur = conn.execute(
            "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('exact', ?)",
            (ids[0],),
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
            cur = conn.execute(
                "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('perceptual', ?)",
                (group_ids[0],),
            )
            gid = cur.lastrowid
            for fid in group_ids:
                conn.execute(
                    "INSERT INTO duplicate_members (group_id, file_id) VALUES (?, ?)",
                    (gid, fid),
                )
                assigned.add(fid)


def get_duplicate_groups(conn: sqlite3.Connection) -> list[dict]:
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
