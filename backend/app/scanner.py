import threading
from pathlib import Path

from app.config import ARCHIVE_PATH, INBOX_PATH
from app.db import get_config, get_conn
from app.dedupe import rebuild_duplicate_groups
from app.metadata import (
    compute_phash,
    compute_sha256,
    extract_metadata,
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


def _location_for_scope(scope: str) -> str:
    if scope == "inbox":
        return "inbox"
    if scope == "trash":
        return "trash"
    return "archive"


def _scan_root(scope: str, cfg: dict[str, str]) -> Path:
    if scope == "inbox":
        return INBOX_PATH
    if scope == "trash":
        return Path(cfg["trash_path"])
    return ARCHIVE_PATH


def _upsert_file(conn, path: Path, location: str) -> None:
    existing = conn.execute("SELECT id, mtime FROM files WHERE path = ?", (str(path),)).fetchone()
    meta = extract_metadata(path)
    if existing and existing["mtime"] == meta["mtime"]:
        return
    sha = compute_sha256(path)
    phash = compute_phash(path)
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


def upsert_file(conn, path: Path, location: str) -> int:
    """Index a media file and return its files.id."""
    _upsert_file(conn, path, location)
    row = conn.execute("SELECT id FROM files WHERE path = ?", (str(path),)).fetchone()
    if not row:
        raise ValueError(f"Failed to index {path}")
    return int(row["id"])


def _prune_missing(conn, scope: str, seen_paths: set[str]) -> None:
    location = _location_for_scope(scope)
    rows = conn.execute("SELECT id, path FROM files WHERE location = ?", (location,)).fetchall()
    for row in rows:
        if row["path"] not in seen_paths:
            conn.execute("DELETE FROM files WHERE id = ?", (row["id"],))


def run_scan(scope: str) -> None:
    with get_conn() as conn:
        cfg = get_config(conn)
    root = _scan_root(scope, cfg)
    files = iter_media_files(root)
    scan_state.start(scope, len(files))
    seen: set[str] = set()
    location = _location_for_scope(scope)
    try:
        with get_conn() as conn:
            for path in files:
                seen.add(str(path))
                _upsert_file(conn, path, location)
                conn.commit()
                scan_state.tick()
        with get_conn() as conn:
            _prune_missing(conn, scope, seen)
            conn.commit()
        if scope != "trash":
            scan_state.set_message("Building duplicate index...")
            with get_conn() as conn:
                rebuild_duplicate_groups(conn)
                conn.commit()
        scan_state.finish(f"Scan complete: {len(files)} files")
    except Exception as exc:
        scan_state.finish(f"Scan failed: {exc}")


def start_scan_background(scope: str) -> bool:
    from app.blur_analysis import blur_analysis_state

    if scan_state.snapshot()["running"]:
        return False
    if blur_analysis_state.snapshot()["running"]:
        return False
    thread = threading.Thread(target=run_scan, args=(scope,), daemon=True)
    thread.start()
    return True
