import re
import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import BACKUPS_DIR

BACKUP_FILENAME_RE = re.compile(r"^index-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$")


def _backup_info(path: Path) -> dict:
    stat = path.stat()
    return {
        "path": str(path.resolve()),
        "filename": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
    }


def create_database_backup(conn: sqlite3.Connection, backups_dir: Path | None = None) -> dict:
    target_dir = backups_dir or BACKUPS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / f"index-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.db"
    dest_conn = sqlite3.connect(dest)
    try:
        conn.backup(dest_conn)
    finally:
        dest_conn.close()
    return _backup_info(dest)


def list_database_backups(backups_dir: Path | None = None) -> list[dict]:
    target_dir = backups_dir or BACKUPS_DIR
    if not target_dir.is_dir():
        return []
    files = [
        path
        for path in target_dir.glob("index-*.db")
        if path.is_file() and BACKUP_FILENAME_RE.match(path.name)
    ]
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return [_backup_info(path) for path in files]
