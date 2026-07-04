import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import INBOX_PATH
from app.db import get_config


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


def preview_organize(conn: sqlite3.Connection, file_ids: list[int] | None = None) -> list[dict]:
    cfg = get_config(conn)
    archive = Path(cfg["archive_path"])
    date_pattern = cfg["date_pattern"]
    rename_pattern = cfg["rename_pattern"]

    if file_ids:
        placeholders = ",".join("?" * len(file_ids))
        rows = conn.execute(
            f"SELECT * FROM files WHERE id IN ({placeholders}) AND location = 'inbox'",
            file_ids,
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM files WHERE location = 'inbox'").fetchall()

    items = []
    for idx, row in enumerate(rows, start=1):
        dt = _parse_capture(row)
        subdir = _apply_pattern(date_pattern, dt, row["filename"], row["camera"], idx).strip("/")
        new_name = _apply_pattern(rename_pattern, dt, row["filename"], row["camera"], idx)
        if not new_name.endswith(Path(row["filename"]).suffix):
            new_name += Path(row["filename"]).suffix
        target = archive / subdir / new_name
        items.append(
            {
                "file_id": row["id"],
                "source_path": row["path"],
                "target_path": str(target),
                "filename": new_name,
            }
        )
    return items


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

    preview_map = {p["file_id"]: p for p in preview_organize(conn)}

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

    conn.commit()
    return applied, errors
