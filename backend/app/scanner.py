import threading
from pathlib import Path

from app.config import ARCHIVE_PATH, INBOX_PATH
from app.db import get_conn
from app.dedupe import rebuild_duplicate_groups
from app.metadata import (
    compute_phash,
    compute_sha256,
    extract_metadata,
    generate_thumbnail,
    iter_media_files,
)


class ScanState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.scope: str | None = None
        self.processed = 0
        self.total = 0
        self.message: str | None = None

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "running": self.running,
                "scope": self.scope,
                "processed": self.processed,
                "total": self.total,
                "message": self.message,
            }

    def start(self, scope: str, total: int) -> None:
        with self.lock:
            self.running = True
            self.scope = scope
            self.processed = 0
            self.total = total
            self.message = f"Scanning {scope}..."

    def tick(self) -> None:
        with self.lock:
            self.processed += 1

    def set_message(self, message: str) -> None:
        with self.lock:
            self.message = message

    def finish(self, message: str) -> None:
        with self.lock:
            self.running = False
            self.message = message


scan_state = ScanState()


def _location_for_path(path: Path, scope: str) -> str:
    return "inbox" if scope == "inbox" else "archive"


def _upsert_file(conn, path: Path, location: str) -> tuple[Path, int, float] | None:
    """Upsert file row. Returns (path, file_id, mtime) for thumbnail work after commit."""
    meta = extract_metadata(path)
    sha = compute_sha256(path)
    phash = compute_phash(path)
    existing = conn.execute("SELECT id, mtime FROM files WHERE path = ?", (str(path),)).fetchone()
    if existing and existing["mtime"] == meta["mtime"]:
        return None
    conn.execute(
        """
        INSERT INTO files (
            path, filename, location, size, mtime, sha256, phash,
            capture_date, capture_day, camera, width, height, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(path) DO UPDATE SET
            filename=excluded.filename,
            location=excluded.location,
            size=excluded.size,
            mtime=excluded.mtime,
            sha256=excluded.sha256,
            phash=excluded.phash,
            capture_date=excluded.capture_date,
            capture_day=excluded.capture_day,
            camera=excluded.camera,
            width=excluded.width,
            height=excluded.height,
            updated_at=datetime('now')
        """,
        (
            str(path),
            path.name,
            location,
            meta["size"],
            meta["mtime"],
            sha,
            phash,
            meta["capture_date"],
            meta["capture_day"],
            meta["camera"],
            meta["width"],
            meta["height"],
        ),
    )
    row = conn.execute("SELECT id, mtime FROM files WHERE path = ?", (str(path),)).fetchone()
    if row:
        return (path, row["id"], row["mtime"])
    return None


def _prune_missing(conn, scope: str, seen_paths: set[str]) -> None:
    if scope == "inbox":
        rows = conn.execute("SELECT id, path FROM files WHERE location = 'inbox'").fetchall()
    else:
        rows = conn.execute("SELECT id, path FROM files WHERE location = 'archive'").fetchall()
    for row in rows:
        if row["path"] not in seen_paths:
            conn.execute("DELETE FROM files WHERE id = ?", (row["id"],))


def run_scan(scope: str) -> None:
    root = INBOX_PATH if scope == "inbox" else ARCHIVE_PATH
    files = iter_media_files(root)
    scan_state.start(scope, len(files))
    seen: set[str] = set()
    try:
        with get_conn() as conn:
            for path in files:
                seen.add(str(path))
                thumb = _upsert_file(conn, path, _location_for_path(path, scope))
                conn.commit()
                if thumb:
                    thumb_path, file_id, mtime = thumb
                    try:
                        generate_thumbnail(thumb_path, file_id, mtime)
                    except Exception:
                        pass
                scan_state.tick()
        with get_conn() as conn:
            _prune_missing(conn, scope, seen)
            conn.commit()
        scan_state.set_message("Building duplicate index...")
        with get_conn() as conn:
            rebuild_duplicate_groups(conn)
            conn.commit()
        scan_state.finish(f"Scan complete: {len(files)} files")
    except Exception as exc:
        scan_state.finish(f"Scan failed: {exc}")


def start_scan_background(scope: str) -> bool:
    if scan_state.snapshot()["running"]:
        return False
    thread = threading.Thread(target=run_scan, args=(scope,), daemon=True)
    thread.start()
    return True
