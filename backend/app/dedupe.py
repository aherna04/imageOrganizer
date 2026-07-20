import re
import sqlite3
import threading
import time

import imagehash

from app.config import PHASH_THRESHOLD
from app.db import get_conn

_COPY_SUFFIX = re.compile(r"(?:[\s_]\(\d+\)|_\(\d+\))(?=\.[^.]+$)")
_ACTIVE_LOCATIONS_SQL = "location IN ('inbox', 'archive')"
_PHASH_YIELD_EVERY = 200


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
    """Load non-trash files for the given ids (inbox/archive only)."""
    if not file_ids:
        return []
    placeholders = ",".join("?" * len(file_ids))
    return conn.execute(
        f"""
        SELECT * FROM files
        WHERE id IN ({placeholders})
          AND {_ACTIVE_LOCATIONS_SQL}
        ORDER BY capture_date
        """,
        file_ids,
    ).fetchall()


def reconcile_default_keepers(conn: sqlite3.Connection) -> None:
    groups = conn.execute("SELECT * FROM duplicate_groups").fetchall()
    for g in groups:
        file_rows = conn.execute(
            f"""
            SELECT f.* FROM files f
            JOIN duplicate_members dm ON dm.file_id = f.id
            WHERE dm.group_id = ?
              AND f.{_ACTIVE_LOCATIONS_SQL}
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


def _compute_perceptual_groups(phash_rows: list[tuple[int, str]]) -> list[list[int]]:
    """Build perceptual duplicate id-groups without holding a DB write lock."""
    assigned: set[int] = set()
    groups: list[list[int]] = []
    comparisons = 0
    for i, (id_a, phash_a) in enumerate(phash_rows):
        if id_a in assigned:
            continue
        try:
            hash_a = imagehash.hex_to_hash(phash_a)
        except Exception:
            continue
        group_ids = [id_a]
        for id_b, phash_b in phash_rows[i + 1 :]:
            if id_b in assigned:
                continue
            try:
                hash_b = imagehash.hex_to_hash(phash_b)
            except Exception:
                continue
            comparisons += 1
            if comparisons % _PHASH_YIELD_EVERY == 0:
                time.sleep(0)
            if hash_a - hash_b <= PHASH_THRESHOLD:
                group_ids.append(id_b)
        if len(group_ids) > 1:
            for fid in group_ids:
                assigned.add(fid)
            groups.append(group_ids)
    return groups


def _rebuild_exact_groups(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    """Clear groups, write exact SHA clusters; return phash pairs for offline compute."""
    conn.execute("DELETE FROM duplicate_members")
    conn.execute("DELETE FROM duplicate_groups")
    conn.commit()

    sha_rows = conn.execute(
        f"""
        SELECT sha256, GROUP_CONCAT(id) AS ids
        FROM files
        WHERE sha256 IS NOT NULL
          AND {_ACTIVE_LOCATIONS_SQL}
        GROUP BY sha256
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for row in sha_rows:
        ids = [int(x) for x in row["ids"].split(",")]
        file_rows = _load_group_files(conn, ids)
        if len(file_rows) < 2:
            continue
        keeper_id = choose_default_keeper(file_rows)
        cur = conn.execute(
            "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('exact', ?)",
            (keeper_id,),
        )
        gid = cur.lastrowid
        for f in file_rows:
            conn.execute(
                "INSERT INTO duplicate_members (group_id, file_id) VALUES (?, ?)",
                (gid, f["id"]),
            )
        conn.commit()
        time.sleep(0)

    phash_rows = conn.execute(
        f"""
        SELECT id, phash FROM files
        WHERE phash IS NOT NULL
          AND {_ACTIVE_LOCATIONS_SQL}
        """
    ).fetchall()
    conn.commit()
    return [(int(r["id"]), r["phash"]) for r in phash_rows]


def _write_perceptual_groups(
    conn: sqlite3.Connection, perceptual_groups: list[list[int]]
) -> None:
    for group_ids in perceptual_groups:
        file_rows = _load_group_files(conn, group_ids)
        if len(file_rows) < 2:
            continue
        keeper_id = choose_default_keeper(file_rows)
        cur = conn.execute(
            "INSERT INTO duplicate_groups (group_type, keeper_id) VALUES ('perceptual', ?)",
            (keeper_id,),
        )
        gid = cur.lastrowid
        for f in file_rows:
            conn.execute(
                "INSERT INTO duplicate_members (group_id, file_id) VALUES (?, ?)",
                (gid, f["id"]),
            )
        conn.commit()
        time.sleep(0)
    reconcile_default_keepers(conn)


def rebuild_duplicate_groups(conn: sqlite3.Connection) -> None:
    """Rebuild duplicate index on an open connection (exact + perceptual).

    Prefer `_run_dedupe_rebuild` in production so the O(n²) pHash pass runs
    with no open DB connection.
    """
    phash_pairs = _rebuild_exact_groups(conn)
    perceptual_groups = _compute_perceptual_groups(phash_pairs)
    _write_perceptual_groups(conn, perceptual_groups)


def get_duplicate_groups(conn: sqlite3.Connection) -> list[dict]:
    reconcile_default_keepers(conn)
    groups = conn.execute(
        "SELECT * FROM duplicate_groups ORDER BY id DESC"
    ).fetchall()
    result = []
    for g in groups:
        file_rows = conn.execute(
            f"""
            SELECT f.* FROM files f
            JOIN duplicate_members dm ON dm.file_id = f.id
            WHERE dm.group_id = ?
              AND f.{_ACTIVE_LOCATIONS_SQL}
            ORDER BY f.capture_date
            """,
            (g["id"],),
        ).fetchall()
        if len(file_rows) < 2:
            continue
        file_dicts = [dict(f) for f in file_rows]
        keeper_id = g["keeper_id"]
        if keeper_id not in {f["id"] for f in file_dicts}:
            keeper_id = choose_default_keeper(file_dicts)
        result.append(
            {
                "id": g["id"],
                "group_type": g["group_type"],
                "keeper_id": keeper_id,
                "files": file_dicts,
            }
        )
    return result


class DedupeState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.message: str | None = None
        self.dirty = False

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "running": self.running,
                "message": self.message,
            }

    def request(self) -> bool:
        """Claim a rebuild slot. If already running, coalesce and return False."""
        with self.lock:
            if self.running:
                self.dirty = True
                return False
            self.running = True
            self.dirty = False
            self.message = "Building duplicate index..."
            return True

    def finish_or_rerun(self) -> bool:
        """End rebuild, or return True to run again after a coalesced request."""
        with self.lock:
            if self.dirty:
                self.dirty = False
                self.message = "Building duplicate index..."
                return True
            self.running = False
            self.message = None
            return False


dedupe_state = DedupeState()


def _run_dedupe_rebuild() -> None:
    while True:
        try:
            with get_conn() as conn:
                phash_pairs = _rebuild_exact_groups(conn)
            # CPU-bound; no DB connection held so Calendar can use WAL freely.
            perceptual_groups = _compute_perceptual_groups(phash_pairs)
            with get_conn() as conn:
                _write_perceptual_groups(conn, perceptual_groups)
        except Exception:
            pass
        if not dedupe_state.finish_or_rerun():
            break


def start_dedupe_rebuild_background() -> None:
    if not dedupe_state.request():
        return
    threading.Thread(target=_run_dedupe_rebuild, daemon=True).start()
