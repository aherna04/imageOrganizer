import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import INBOX_PATH
from app.db import cleanup_orphan_junction_rows, get_config, file_list_order_clause

INBOX_BATCH_LIMIT = 250


def _parse_capture(file_row: sqlite3.Row) -> datetime:
    if file_row["capture_date"]:
        try:
            return datetime.fromisoformat(file_row["capture_date"])
        except ValueError:
            pass
    return datetime.fromtimestamp(file_row["mtime"])


def _apply_pattern(pattern: str, dt: datetime, original: str, camera: str | None, seq: int) -> str:
    tokens = {
        "{YYYY}": dt.strftime("%Y"),
        "{MM}": dt.strftime("%m"),
        "{DD}": dt.strftime("%d"),
        "{date}": dt.date().isoformat(),
        "{original}": Path(original).stem,
        "{camera}": (camera or "unknown").replace(" ", "_"),
    }
    result = pattern
    for token, value in tokens.items():
        result = result.replace(token, value)

    def seq_repl(match: re.Match) -> str:
        width = int(match.group(1))
        return str(seq).zfill(width)

    result = re.sub(r"\{seq:(\d+)\}", seq_repl, result)
    return result


def _build_preview_item(
    row: sqlite3.Row,
    idx: int,
    archive: Path,
    date_pattern: str,
    rename_pattern: str,
) -> dict:
    from app.filename_dates import dates_mismatch

    dt = _parse_capture(row)
    organize_date = dt.date()
    subdir = _apply_pattern(date_pattern, dt, row["filename"], row["camera"], idx).strip("/")
    new_name = _apply_pattern(rename_pattern, dt, row["filename"], row["camera"], idx)
    if not new_name.endswith(Path(row["filename"]).suffix):
        new_name += Path(row["filename"]).suffix
    target = archive / subdir / new_name

    mismatch, filename_date = dates_mismatch(organize_date, row["filename"])
    suggested_target_path = None
    suggested_filename = None

    if mismatch and filename_date:
        corrected_dt = datetime.combine(filename_date, dt.time())
        corrected_subdir = _apply_pattern(
            date_pattern, corrected_dt, row["filename"], row["camera"], idx
        ).strip("/")
        suggested_filename = _apply_pattern(
            rename_pattern, corrected_dt, row["filename"], row["camera"], idx
        )
        if not suggested_filename.endswith(Path(row["filename"]).suffix):
            suggested_filename += Path(row["filename"]).suffix
        suggested_target_path = str(archive / corrected_subdir / suggested_filename)

    return {
        "file_id": row["id"],
        "source_path": row["path"],
        "target_path": str(target),
        "filename": new_name,
        "organize_date": organize_date.isoformat(),
        "filename_date": filename_date.isoformat() if filename_date else None,
        "date_mismatch": mismatch,
        "suggested_target_path": suggested_target_path,
        "suggested_filename": suggested_filename,
    }


def inbox_file_count(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM files WHERE location = 'inbox'").fetchone()
    return int(row["n"])


def inbox_available_count(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        f"SELECT COUNT(*) AS n FROM files WHERE location = 'inbox' AND {NOT_QUEUED.strip()}",
    ).fetchone()
    return int(row["n"])


NOT_QUEUED = """
id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0
)
"""


def preview_organize(
    conn: sqlite3.Connection,
    file_ids: list[int] | None = None,
    *,
    unqueued_only: bool = False,
) -> list[dict]:
    cfg = get_config(conn)
    archive = Path(cfg["archive_path"])
    date_pattern = cfg["date_pattern"]
    rename_pattern = cfg["rename_pattern"]
    unqueued_clause = f" AND {NOT_QUEUED.strip()}" if unqueued_only else ""
    order = file_list_order_clause(cfg, alias=None)

    if file_ids:
        ids = file_ids[:INBOX_BATCH_LIMIT]
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT * FROM files WHERE id IN ({placeholders}) AND location = 'inbox'{unqueued_clause} {order}",
            ids,
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT * FROM files WHERE location = 'inbox'{unqueued_clause} {order} LIMIT ?",
            (INBOX_BATCH_LIMIT,),
        ).fetchall()

    return [
        _build_preview_item(row, idx, archive, date_pattern, rename_pattern)
        for idx, row in enumerate(rows, start=1)
    ]


def queue_inbox_batch(
    conn: sqlite3.Connection,
    file_ids: list[int] | None = None,
    *,
    append: bool = True,
) -> tuple[list[dict], int]:
    if not append:
        conn.execute("DELETE FROM review_decisions WHERE applied = 0")

    if file_ids:
        ids = file_ids[:INBOX_BATCH_LIMIT]
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT id FROM files WHERE id IN ({placeholders}) AND location = 'inbox' AND {NOT_QUEUED.strip()}",
            ids,
        ).fetchall()
        batch_ids = [row["id"] for row in rows]
        items = preview_organize(conn, batch_ids, unqueued_only=True) if batch_ids else []
    else:
        items = preview_organize(conn, unqueued_only=True)

    for item in items:
        conn.execute(
            "INSERT INTO review_decisions (file_id, action, target_path) VALUES (?, 'keep', ?)",
            (item["file_id"], item["target_path"]),
        )

    conn.commit()
    return items, inbox_available_count(conn)


def fix_dates_from_filename(
    conn: sqlite3.Connection, file_ids: list[int] | None = None
) -> tuple[int, list[dict]]:
    from app.file_dates import fix_dates_from_filename as fix_file_dates

    if file_ids:
        ids_to_fix = list(file_ids)
    else:
        preview = preview_organize(conn)
        ids_to_fix = [p["file_id"] for p in preview if p["date_mismatch"]]

    fixed, _skipped, updated_ids = fix_file_dates(conn, ids_to_fix)
    items = preview_organize(conn, updated_ids if updated_ids else None)
    return fixed, items


def _unique_path(target: Path) -> Path:
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    n = 1
    while True:
        candidate = parent / f"{stem}_({n}){suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def apply_operations(conn: sqlite3.Connection) -> tuple[int, list[str]]:
    cfg = get_config(conn)
    trash = Path(cfg["trash_path"])
    trash.mkdir(parents=True, exist_ok=True)
    applied = 0
    errors: list[str] = []

    decisions = conn.execute(
        "SELECT rd.*, f.path, f.filename, f.location FROM review_decisions rd JOIN files f ON f.id = rd.file_id WHERE rd.applied = 0"
    ).fetchall()

    keep_ids = [d["file_id"] for d in decisions if d["action"] == "keep"]
    preview_map = {
        p["file_id"]: p
        for p in preview_organize(conn, keep_ids if keep_ids else None)
    }

    for d in decisions:
        src = Path(d["path"])
        try:
            if d["action"] == "delete":
                dest = _unique_path(trash / src.name)
                if src.exists():
                    shutil.move(str(src), str(dest))
                conn.execute("DELETE FROM files WHERE id = ?", (d["file_id"],))
                conn.execute(
                    "INSERT INTO operations_log (file_id, operation, source_path, target_path) VALUES (?, 'delete', ?, ?)",
                    (d["file_id"], str(src), str(dest)),
                )
            elif d["action"] == "keep":
                preview = preview_map.get(d["file_id"])
                if preview:
                    target = _unique_path(Path(preview["target_path"]))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if src.exists():
                        shutil.move(str(src), str(target))
                    conn.execute(
                        "UPDATE files SET path=?, filename=?, location='archive', updated_at=datetime('now') WHERE id=?",
                        (str(target), target.name, d["file_id"]),
                    )
                    conn.execute(
                        "INSERT INTO operations_log (file_id, operation, source_path, target_path) VALUES (?, 'move', ?, ?)",
                        (d["file_id"], str(src), str(target)),
                    )
            elif d["action"] == "move" and d["target_path"]:
                target = _unique_path(Path(d["target_path"]))
                target.parent.mkdir(parents=True, exist_ok=True)
                if src.exists():
                    shutil.move(str(src), str(target))
                loc = "archive" if str(INBOX_PATH) not in str(target) else "inbox"
                conn.execute(
                    "UPDATE files SET path=?, filename=?, location=?, updated_at=datetime('now') WHERE id=?",
                    (str(target), target.name, loc, d["file_id"]),
                )
                conn.execute(
                    "INSERT INTO operations_log (file_id, operation, source_path, target_path) VALUES (?, 'move', ?, ?)",
                    (d["file_id"], str(src), str(target)),
                )
            elif d["action"] == "skip":
                pass
            conn.execute("UPDATE review_decisions SET applied = 1 WHERE id = ?", (d["id"],))
            applied += 1
        except Exception as exc:
            errors.append(f"{src.name}: {exc}")

    cleanup_orphan_junction_rows(conn)
    conn.commit()
    return applied, errors
