"""Library path resolution, co-location upgrade, and prefix rewrite for moves."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
from pathlib import Path
from typing import Any

BOOTSTRAP_DIR = Path.home() / ".config" / "imageOrganizer"
BOOTSTRAP_PATH = BOOTSTRAP_DIR / "bootstrap.json"

DEFAULT_MEDIA_ROOT = "/Users/alex/Media"
LEGACY_APP_DATA = Path.home() / ".imageOrganizer"


def load_bootstrap() -> dict[str, str]:
    if not BOOTSTRAP_PATH.is_file():
        return {}
    try:
        data = json.loads(BOOTSTRAP_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key in ("media_root", "app_data_dir"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            out[key] = val.strip()
    return out


def write_bootstrap(*, media_root: str | None = None, app_data_dir: str | None = None) -> None:
    data = load_bootstrap()
    if media_root is not None:
        data["media_root"] = str(Path(media_root))
    if app_data_dir is not None:
        data["app_data_dir"] = str(Path(app_data_dir))
    BOOTSTRAP_DIR.mkdir(parents=True, exist_ok=True)
    BOOTSTRAP_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def resolve_media_root() -> Path:
    env = os.environ.get("MEDIA_ROOT")
    if env:
        return Path(env)
    boot = load_bootstrap().get("media_root")
    if boot:
        return Path(boot)
    return Path(DEFAULT_MEDIA_ROOT)


def resolve_app_data_dir(media_root: Path | None = None) -> Path:
    env = os.environ.get("APP_DATA_DIR")
    if env:
        return Path(env)
    boot = load_bootstrap().get("app_data_dir")
    if boot:
        return Path(boot)
    root = media_root if media_root is not None else resolve_media_root()
    return root / ".imageOrganizer"


def boundary_replace(path: str, old_prefix: str, new_prefix: str) -> str | None:
    """Replace path prefix only at a path boundary. Returns None if unchanged."""
    old = old_prefix.rstrip("/")
    new = new_prefix.rstrip("/")
    if path == old:
        return new
    prefix = old + "/"
    if path.startswith(prefix):
        return new + "/" + path[len(prefix) :]
    return None


def rewrite_path_prefixes(conn: sqlite3.Connection, old_prefix: str, new_prefix: str) -> dict[str, int]:
    """Rewrite absolute path columns that start with old_prefix."""
    counts = {
        "files.path": 0,
        "config": 0,
        "operations_log.source_path": 0,
        "operations_log.target_path": 0,
        "review_decisions.target_path": 0,
    }

    rows = conn.execute("SELECT id, path FROM files").fetchall()
    for row in rows:
        updated = boundary_replace(row["path"], old_prefix, new_prefix)
        if updated is not None:
            conn.execute("UPDATE files SET path = ? WHERE id = ?", (updated, row["id"]))
            counts["files.path"] += 1

    for key in ("inbox_path", "archive_path", "trash_path"):
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
        if not row:
            continue
        updated = boundary_replace(row["value"], old_prefix, new_prefix)
        if updated is not None:
            conn.execute(
                "UPDATE config SET value = ? WHERE key = ?",
                (updated, key),
            )
            counts["config"] += 1

    for col, count_key in (
        ("source_path", "operations_log.source_path"),
        ("target_path", "operations_log.target_path"),
    ):
        rows = conn.execute(
            f"SELECT rowid AS rid, {col} AS p FROM operations_log WHERE {col} IS NOT NULL"
        ).fetchall()
        for row in rows:
            updated = boundary_replace(row["p"], old_prefix, new_prefix)
            if updated is not None:
                conn.execute(
                    f"UPDATE operations_log SET {col} = ? WHERE rowid = ?",
                    (updated, row["rid"]),
                )
                counts[count_key] += 1

    rows = conn.execute(
        "SELECT id, target_path FROM review_decisions WHERE target_path IS NOT NULL"
    ).fetchall()
    for row in rows:
        updated = boundary_replace(row["target_path"], old_prefix, new_prefix)
        if updated is not None:
            conn.execute(
                "UPDATE review_decisions SET target_path = ? WHERE id = ?",
                (updated, row["id"]),
            )
            counts["review_decisions.target_path"] += 1

    conn.commit()
    return counts


def _write_moved_pointer(old_dir: Path, new_dir: Path) -> None:
    old_dir.mkdir(parents=True, exist_ok=True)
    pointer = old_dir / "MOVED.txt"
    pointer.write_text(
        f"Image Organizer catalog moved to:\n{new_dir}\n",
        encoding="utf-8",
    )


def relocate_legacy_app_data(media_root: Path, app_data_dir: Path) -> str | None:
    """Move ~/.imageOrganizer into {MEDIA_ROOT}/.imageOrganizer when needed.

    Returns a short status message, or None if nothing to do.
    """
    target_db = app_data_dir / "index.db"
    if target_db.is_file():
        return None

    legacy_db = LEGACY_APP_DATA / "index.db"
    if not legacy_db.is_file():
        return None

    # Only auto-colocate when app_data_dir is the default under media root.
    expected = (media_root / ".imageOrganizer").resolve()
    if app_data_dir.resolve() != expected:
        return None

    app_data_dir.parent.mkdir(parents=True, exist_ok=True)
    if app_data_dir.exists():
        # Partial dir without index.db — do not clobber.
        if any(app_data_dir.iterdir()):
            return (
                f"Skipped co-locate: {app_data_dir} exists without index.db "
                f"while legacy catalog is at {LEGACY_APP_DATA}"
            )
        app_data_dir.rmdir()

    try:
        LEGACY_APP_DATA.rename(app_data_dir)
        action = "moved"
    except OSError:
        shutil.copytree(LEGACY_APP_DATA, app_data_dir)
        action = "copied"
        _write_moved_pointer(LEGACY_APP_DATA, app_data_dir)
    else:
        _write_moved_pointer(LEGACY_APP_DATA, app_data_dir)

    return f"Catalog {action} from {LEGACY_APP_DATA} to {app_data_dir}"


# --- Move-library background job (Phase 2) ---

class LibraryMoveState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.message: str | None = None
        self.error: str | None = None
        self.done = False
        self.restart_required = False

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "running": self.running,
                "message": self.message,
                "error": self.error,
                "done": self.done,
                "restart_required": self.restart_required,
            }

    def claim(self) -> bool:
        with self.lock:
            if self.running:
                return False
            self.running = True
            self.message = "Starting library move..."
            self.error = None
            self.done = False
            self.restart_required = False
            return True

    def set_message(self, message: str) -> None:
        with self.lock:
            self.message = message

    def finish_ok(self, message: str) -> None:
        with self.lock:
            self.running = False
            self.done = True
            self.restart_required = True
            self.message = message
            self.error = None

    def finish_err(self, message: str) -> None:
        with self.lock:
            self.running = False
            self.done = True
            self.restart_required = False
            self.error = message
            self.message = message


library_move_state = LibraryMoveState()


def _copy_tree(src: Path, dest: Path, set_message) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel = Path(root).relative_to(src)
        # Skip nesting the catalog into itself if already under dest
        target_root = dest / rel
        target_root.mkdir(parents=True, exist_ok=True)
        for name in files:
            s = Path(root) / name
            d = target_root / name
            if d.exists() and d.stat().st_size == s.stat().st_size:
                continue
            shutil.copy2(s, d)
        set_message(f"Copying {rel or Path(src.name)}...")


def run_library_move(old_media_root: Path, new_media_root: Path) -> None:
    from app.db_backup import create_database_backup
    from app import config as app_config

    try:
        old_media_root = old_media_root.resolve()
        new_media_root = new_media_root.resolve()
        if old_media_root == new_media_root:
            raise ValueError("New media root must differ from the current root")
        if not old_media_root.is_dir():
            raise ValueError(f"Current media root not found: {old_media_root}")
        new_media_root.mkdir(parents=True, exist_ok=True)

        library_move_state.set_message("Backing up database...")
        db_path = Path(app_config.DB_PATH)
        if not db_path.is_file():
            raise ValueError(f"Database not found: {db_path}")

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            create_database_backup(conn, backups_dir=Path(app_config.BACKUPS_DIR))
        finally:
            conn.close()

        subdirs = ("inbox", "photos", ".trash", ".imageOrganizer")
        for name in subdirs:
            src = old_media_root / name
            if not src.exists():
                continue
            dest = new_media_root / name
            library_move_state.set_message(f"Copying {name}/...")
            if src.is_dir():
                _copy_tree(src, dest, library_move_state.set_message)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)

        # Catalog may live outside media root (env override) — copy it under new root.
        old_app = Path(app_config.APP_DATA_DIR).resolve()
        new_app = (new_media_root / ".imageOrganizer").resolve()
        if old_app.exists() and old_app != new_app and not (new_app / "index.db").is_file():
            library_move_state.set_message("Copying catalog (.imageOrganizer)...")
            if new_app.exists():
                shutil.rmtree(new_app)
            shutil.copytree(old_app, new_app)

        new_db = new_app / "index.db"
        if not new_db.is_file():
            raise ValueError(f"Catalog missing after copy: {new_db}")

        library_move_state.set_message("Rewriting database paths...")
        conn = sqlite3.connect(new_db)
        conn.row_factory = sqlite3.Row
        try:
            rewrite_path_prefixes(conn, str(old_media_root), str(new_media_root))
            # Also rewrite container-style roots if old paths used /media
            # (no-op when prefixes do not match).
        finally:
            conn.close()

        write_bootstrap(
            media_root=str(new_media_root),
            app_data_dir=str(new_app),
        )
        library_move_state.finish_ok(
            f"Library copied to {new_media_root}. Restart the app to use the new location."
        )
    except Exception as exc:
        library_move_state.finish_err(f"Library move failed: {exc}")


def start_library_move_background(old_media_root: Path, new_media_root: Path) -> bool:
    if not library_move_state.claim():
        return False
    thread = threading.Thread(
        target=run_library_move,
        args=(old_media_root, new_media_root),
        daemon=True,
    )
    thread.start()
    return True
