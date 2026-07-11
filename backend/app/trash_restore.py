import shutil
import sqlite3
from pathlib import Path

from app.db import get_config
from app.organizer import _unique_path


def _restore_destination(cfg: dict[str, str], source_path: str | None, filename: str) -> tuple[Path, str]:
    inbox = Path(cfg["inbox_path"])
    archive = Path(cfg["archive_path"])
    if source_path:
        src = Path(source_path)
        src_str = str(src)
        if src_str.startswith(str(inbox)):
            dest_dir = src.parent if src.parent.exists() else inbox
            return _unique_path(dest_dir / filename), "inbox"
        if src_str.startswith(str(archive)):
            dest_dir = src.parent if src.parent.exists() else archive
            return _unique_path(dest_dir / filename), "archive"
        if src.parent.exists():
            location = "inbox" if str(inbox) in src_str else "archive"
            return _unique_path(src.parent / filename), location
    return _unique_path(inbox / filename), "inbox"


def restore_from_trash(conn: sqlite3.Connection, file_ids: list[int]) -> tuple[int, list[str]]:
    if not file_ids:
        return 0, []
    cfg = get_config(conn)
    restored = 0
    errors: list[str] = []
    placeholders = ",".join("?" * len(file_ids))
    rows = conn.execute(
        f"SELECT * FROM files WHERE id IN ({placeholders}) AND location = 'trash'",
        file_ids,
    ).fetchall()
    for row in rows:
        trash_path = Path(row["path"])
        try:
            log = conn.execute(
                """
                SELECT source_path FROM operations_log
                WHERE operation = 'delete' AND target_path = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(trash_path),),
            ).fetchone()
            source_path = log["source_path"] if log else None
            dest, location = _restore_destination(cfg, source_path, row["filename"])
            dest.parent.mkdir(parents=True, exist_ok=True)
            if trash_path.exists():
                shutil.move(str(trash_path), str(dest))
            conn.execute(
                "UPDATE files SET path=?, filename=?, location=?, updated_at=datetime('now') WHERE id=?",
                (str(dest), dest.name, location, row["id"]),
            )
            conn.execute(
                "INSERT INTO operations_log (file_id, operation, source_path, target_path) VALUES (?, 'restore', ?, ?)",
                (row["id"], str(trash_path), str(dest)),
            )
            restored += 1
        except Exception as exc:
            errors.append(f"{row['filename']}: {exc}")
    conn.commit()
    return restored, errors
