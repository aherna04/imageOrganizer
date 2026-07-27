"""Library path resolution, co-location upgrade, and prefix rewrite for moves."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

BOOTSTRAP_DIR = Path.home() / ".config" / "imageOrganizer"
BOOTSTRAP_PATH = BOOTSTRAP_DIR / "bootstrap.json"

DEFAULT_MEDIA_ROOT = "/Users/alex/Media"
LEGACY_APP_DATA = Path.home() / ".imageOrganizer"

LIBRARY_SUBDIRS = ("inbox", "photos", ".trash", ".imageOrganizer")
MovePhase = Literal["backup", "counting", "copying", "rewrite", "verify", "done", "error"]


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


def paths_from_env() -> bool:
    """True when MEDIA_ROOT or APP_DATA_DIR env overrides bootstrap (e.g. Docker)."""
    return bool(os.environ.get("MEDIA_ROOT") or os.environ.get("APP_DATA_DIR"))


def backup_media_root() -> Path | None:
    """Container path for optional migrate destination (BACKUP_MEDIA_ROOT)."""
    env = os.environ.get("BACKUP_MEDIA_ROOT", "").strip()
    if env:
        return Path(env)
    # Compose always mounts /media-backup; treat as candidate when host path is set.
    if os.environ.get("BACKUP_MEDIA_HOST_PATH", "").strip():
        return Path("/media-backup")
    return None


def backup_media_host_path() -> str | None:
    host = os.environ.get("BACKUP_MEDIA_HOST_PATH", "").strip()
    return host or None


def media_host_path() -> str | None:
    host = os.environ.get("MEDIA_HOST_PATH", "").strip()
    return host or None


def backup_media_ready(root: Path | None = None) -> bool:
    """True when backup mount exists, is writable, and is not the unused placeholder."""
    target = root if root is not None else backup_media_root()
    if target is None:
        return False
    host = backup_media_host_path()
    if not host:
        return False
    # Placeholder default from compose when unset
    if "docker-unused-backup" in host.replace("\\", "/"):
        return False
    try:
        path = target.resolve()
        if not path.is_dir():
            path.mkdir(parents=True, exist_ok=True)
        probe = path / ".imageOrganizer-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


# Warn when Docker VM/rootfs free space is critically low (overlay fill risk).
CONTAINER_DISK_LOW_FREE_BYTES = 2 * 1024 * 1024 * 1024
CONTAINER_DISK_LOW_RATIO = 0.05
LIBRARY_COPY_SPACE_MARGIN = 1.05


def disk_usage(path: Path | str) -> dict[str, Any] | None:
    """Return total/free/used bytes for the filesystem containing path."""
    try:
        probe = Path(path)
        if not probe.exists():
            probe = probe.parent if probe.parent.exists() else Path("/")
        st = os.statvfs(probe)
        total = int(st.f_frsize * st.f_blocks)
        free = int(st.f_frsize * st.f_bavail)
        used = max(0, total - free)
        return {
            "path": str(Path(path)),
            "total_bytes": total,
            "free_bytes": free,
            "used_bytes": used,
        }
    except OSError:
        return None


def is_container_disk_low(usage: dict[str, Any] | None) -> bool:
    if not usage:
        return False
    free = int(usage["free_bytes"])
    total = int(usage["total_bytes"])
    if free < CONTAINER_DISK_LOW_FREE_BYTES:
        return True
    if total > 0 and (free / total) < CONTAINER_DISK_LOW_RATIO:
        return True
    return False


def migrate_disk_status(media_root: Path | None = None) -> dict[str, Any]:
    """Disk probes for Settings / config (media, backup mount, container root)."""
    root = media_root if media_root is not None else resolve_media_root()
    media = disk_usage(root)
    backup_root = backup_media_root()
    backup = disk_usage(backup_root) if backup_root is not None else None
    from_env = paths_from_env()
    container = disk_usage("/") if from_env else None
    host_media = media_host_path()
    host_backup = backup_media_host_path()
    # Docker Desktop often reports the same Mac Data volume stats for every bind mount.
    unreliable = bool(
        from_env
        and media
        and backup
        and host_media
        and host_backup
        and host_media != host_backup
        and int(media["total_bytes"]) == int(backup["total_bytes"])
        and int(media["free_bytes"]) == int(backup["free_bytes"])
    )
    return {
        "media_disk": media,
        "backup_disk": backup,
        "container_root_disk": container,
        "container_disk_low": is_container_disk_low(container) if from_env else False,
        "disk_free_unreliable": unreliable,
    }


def docker_migrate_dest_allowed(new_media_root: Path) -> bool:
    """True when dest is the backup bind mount (or under it)."""
    backup = backup_media_root()
    if backup is None:
        return False
    try:
        dest = new_media_root.resolve()
        allowed = backup.resolve()
    except OSError:
        return False
    if dest == allowed:
        return True
    return _is_nested(dest, allowed)


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


def write_library_copied_marker(old_media_root: Path, new_media_root: Path) -> Path:
    """Leave a note on the old root that it is now a backup after copy+switch."""
    marker = old_media_root / "LIBRARY_COPIED_TO.txt"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    marker.write_text(
        "Image Organizer library was copied to a new location.\n"
        f"Timestamp (UTC): {stamp}\n"
        f"New media root: {new_media_root}\n"
        "This folder is a backup. Prefer the new root for day-to-day use.\n",
        encoding="utf-8",
    )
    return marker


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


def _is_nested(path: Path, other: Path) -> bool:
    try:
        path.resolve().relative_to(other.resolve())
        return True
    except ValueError:
        return False


def tree_stats(root: Path) -> tuple[int, int]:
    """Return (file_count, total_bytes) for a directory tree."""
    if not root.exists():
        return 0, 0
    if root.is_file():
        return 1, root.stat().st_size
    files = 0
    total = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            p = Path(dirpath) / name
            try:
                total += p.stat().st_size
            except OSError:
                continue
            files += 1
    return files, total


def verify_library_copy(old_media_root: Path, new_media_root: Path) -> str:
    """Compare per-subdir file counts and bytes. Raises ValueError on mismatch."""
    lines: list[str] = []
    for name in LIBRARY_SUBDIRS:
        src = old_media_root / name
        if not src.exists():
            continue
        dest = new_media_root / name
        src_files, src_bytes = tree_stats(src)
        dest_files, dest_bytes = tree_stats(dest)
        if src_files != dest_files or src_bytes != dest_bytes:
            raise ValueError(
                f"Verify failed for {name}/: "
                f"source {src_files} files / {src_bytes} bytes, "
                f"dest {dest_files} files / {dest_bytes} bytes"
            )
        lines.append(f"{name}/: {src_files} files, {src_bytes} bytes")
    return "; ".join(lines) if lines else "nothing to verify"


# --- Copy-library background job ---

class LibraryMoveState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.message: str | None = None
        self.error: str | None = None
        self.done = False
        self.restart_required = False
        self.phase: MovePhase | None = None
        self.copied_files: int | None = None
        self.total_files: int | None = None
        self.copied_bytes: int | None = None
        self.total_bytes: int | None = None

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "running": self.running,
                "message": self.message,
                "error": self.error,
                "done": self.done,
                "restart_required": self.restart_required,
                "phase": self.phase,
                "copied_files": self.copied_files,
                "total_files": self.total_files,
                "copied_bytes": self.copied_bytes,
                "total_bytes": self.total_bytes,
            }

    def claim(self) -> bool:
        with self.lock:
            if self.running:
                return False
            self.running = True
            self.message = "Starting library copy..."
            self.error = None
            self.done = False
            self.restart_required = False
            self.phase = None
            self.copied_files = None
            self.total_files = None
            self.copied_bytes = None
            self.total_bytes = None
            return True

    def set_message(self, message: str) -> None:
        with self.lock:
            self.message = message

    def set_phase(self, phase: MovePhase) -> None:
        with self.lock:
            self.phase = phase

    def set_progress(
        self,
        *,
        copied_files: int | None = None,
        total_files: int | None = None,
        copied_bytes: int | None = None,
        total_bytes: int | None = None,
        message: str | None = None,
        phase: MovePhase | None = None,
    ) -> None:
        with self.lock:
            if copied_files is not None:
                self.copied_files = copied_files
            if total_files is not None:
                self.total_files = total_files
            if copied_bytes is not None:
                self.copied_bytes = copied_bytes
            if total_bytes is not None:
                self.total_bytes = total_bytes
            if message is not None:
                self.message = message
            if phase is not None:
                self.phase = phase

    def finish_ok(self, message: str, *, restart_required: bool = True) -> None:
        with self.lock:
            self.running = False
            self.done = True
            self.restart_required = restart_required
            self.message = message
            self.error = None
            self.phase = "done"

    def finish_err(self, message: str) -> None:
        with self.lock:
            self.running = False
            self.done = True
            self.restart_required = False
            self.error = message
            self.message = message
            self.phase = "error"


library_move_state = LibraryMoveState()


def _preflight(
    old_media_root: Path,
    new_media_root: Path,
    *,
    rewrite_only: bool,
    old_app: Path | None = None,
) -> None:
    if old_media_root == new_media_root:
        raise ValueError("New media root must differ from the current root")
    if not old_media_root.is_dir():
        raise ValueError(f"Current media root not found: {old_media_root}")
    if _is_nested(new_media_root, old_media_root):
        raise ValueError("New media root cannot be inside the current library")
    if _is_nested(old_media_root, new_media_root):
        raise ValueError("Current library cannot be inside the new media root")

    # Docker: only allow the bind-mounted backup path — mkdir elsewhere fills overlayfs.
    if paths_from_env():
        backup = backup_media_root()
        if backup is None or not backup_media_ready(backup):
            raise ValueError(
                "Docker backup mount is not ready. Set BACKUP_MEDIA_HOST_PATH in .env "
                "and recreate the backend container, then copy to /media-backup."
            )
        if not docker_migrate_dest_allowed(new_media_root):
            raise ValueError(
                f"Docker migrate destination must be {backup.resolve()} "
                f"(bind-mounted backup). Got {new_media_root}. "
                "Host paths like /Volumes/... are not visible inside the container and "
                "would fill Docker’s disk."
            )

    new_media_root.mkdir(parents=True, exist_ok=True)
    probe = new_media_root / ".imageOrganizer-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        raise ValueError(f"New media root is not writable: {new_media_root}") from exc

    new_db = new_media_root / ".imageOrganizer" / "index.db"
    if rewrite_only and not new_db.is_file():
        raise ValueError(
            f"Rewrite-only requires an existing catalog at {new_db}. "
            "Copy the library first, or uncheck rewrite-only."
        )

    if not rewrite_only:
        app = old_app if old_app is not None else (old_media_root / ".imageOrganizer")
        _files, needed = _count_library_files(old_media_root, app)
        required = int(needed * LIBRARY_COPY_SPACE_MARGIN)
        usage = disk_usage(new_media_root)
        if usage is not None and required > 0 and int(usage["free_bytes"]) < required:
            free = int(usage["free_bytes"])
            raise ValueError(
                f"Not enough free space on destination: need about {required} bytes "
                f"({needed} library + 5% margin), have {free} free at {new_media_root}."
            )


def _count_library_files(old_media_root: Path, old_app: Path) -> tuple[int, int]:
    total_files = 0
    total_bytes = 0
    counted_app = False
    for name in LIBRARY_SUBDIRS:
        src = old_media_root / name
        if not src.exists():
            continue
        if name == ".imageOrganizer":
            counted_app = True
        files, nbytes = tree_stats(src)
        total_files += files
        total_bytes += nbytes
    # External catalog (env override) not under media root .imageOrganizer
    if old_app.exists() and not counted_app:
        files, nbytes = tree_stats(old_app)
        total_files += files
        total_bytes += nbytes
    return total_files, total_bytes


def _copy_tree_with_progress(
    src: Path,
    dest: Path,
    *,
    copied_files: int,
    copied_bytes: int,
    total_files: int,
    total_bytes: int,
) -> tuple[int, int]:
    dest.mkdir(parents=True, exist_ok=True)
    last_msg = 0.0
    for root, _dirs, files in os.walk(src):
        rel = Path(root).relative_to(src)
        target_root = dest / rel
        target_root.mkdir(parents=True, exist_ok=True)
        for name in files:
            s = Path(root) / name
            d = target_root / name
            try:
                size = s.stat().st_size
            except OSError:
                continue
            if not (d.exists() and d.stat().st_size == size):
                shutil.copy2(s, d)
            copied_files += 1
            copied_bytes += size
            now = time.monotonic()
            if now - last_msg >= 0.4 or copied_files == total_files:
                last_msg = now
                pct = int(100 * copied_bytes / total_bytes) if total_bytes else 100
                library_move_state.set_progress(
                    copied_files=copied_files,
                    total_files=total_files,
                    copied_bytes=copied_bytes,
                    total_bytes=total_bytes,
                    message=f"Copying {rel or src.name}… {pct}%",
                    phase="copying",
                )
    return copied_files, copied_bytes


def run_library_move(
    old_media_root: Path,
    new_media_root: Path,
    *,
    rewrite_only: bool = False,
    rewrite_paths: bool = True,
) -> None:
    from app.db_backup import create_database_backup
    from app import config as app_config

    try:
        old_media_root = old_media_root.resolve()
        new_media_root = new_media_root.resolve()
        old_app = Path(app_config.APP_DATA_DIR).resolve()
        _preflight(
            old_media_root,
            new_media_root,
            rewrite_only=rewrite_only,
            old_app=old_app,
        )

        library_move_state.set_progress(phase="backup", message="Backing up database...")
        db_path = Path(app_config.DB_PATH)
        if not db_path.is_file():
            raise ValueError(f"Database not found: {db_path}")

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            create_database_backup(conn, backups_dir=Path(app_config.BACKUPS_DIR))
        finally:
            conn.close()

        new_app = (new_media_root / ".imageOrganizer").resolve()

        if not rewrite_only:
            library_move_state.set_progress(phase="counting", message="Counting files...")
            total_files, total_bytes = _count_library_files(old_media_root, old_app)
            library_move_state.set_progress(
                copied_files=0,
                total_files=total_files,
                copied_bytes=0,
                total_bytes=total_bytes,
                phase="copying",
                message="Copying library...",
            )

            copied_files = 0
            copied_bytes = 0
            for name in LIBRARY_SUBDIRS:
                src = old_media_root / name
                if not src.exists():
                    continue
                dest = new_media_root / name
                library_move_state.set_message(f"Copying {name}/...")
                if src.is_dir():
                    copied_files, copied_bytes = _copy_tree_with_progress(
                        src,
                        dest,
                        copied_files=copied_files,
                        copied_bytes=copied_bytes,
                        total_files=total_files,
                        total_bytes=total_bytes,
                    )
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dest)
                    size = src.stat().st_size
                    copied_files += 1
                    copied_bytes += size
                    library_move_state.set_progress(
                        copied_files=copied_files,
                        copied_bytes=copied_bytes,
                    )

            # Catalog may live outside media root (env override) — copy under new root.
            if old_app.exists() and old_app != new_app and not (new_app / "index.db").is_file():
                library_move_state.set_message("Copying catalog (.imageOrganizer)...")
                if new_app.exists():
                    shutil.rmtree(new_app)
                shutil.copytree(old_app, new_app)
                # Progress already counted external catalog in totals when applicable.

            library_move_state.set_progress(phase="verify", message="Verifying copy...")
            verify_summary = verify_library_copy(old_media_root, new_media_root)
            # If catalog was external, also verify new_app vs old_app when not under .imageOrganizer walk.
            if old_app.exists() and old_app != (old_media_root / ".imageOrganizer").resolve():
                src_files, src_bytes = tree_stats(old_app)
                dest_files, dest_bytes = tree_stats(new_app)
                if src_files != dest_files or src_bytes != dest_bytes:
                    raise ValueError(
                        f"Verify failed for external catalog: "
                        f"source {src_files}/{src_bytes}, dest {dest_files}/{dest_bytes}"
                    )
        else:
            verify_summary = "rewrite-only (copy not verified)"

        new_db = new_app / "index.db"
        if not new_db.is_file():
            raise ValueError(f"Catalog missing after copy: {new_db}")

        if rewrite_paths:
            library_move_state.set_progress(phase="rewrite", message="Rewriting database paths...")
            conn = sqlite3.connect(new_db)
            conn.row_factory = sqlite3.Row
            try:
                rewrite_path_prefixes(conn, str(old_media_root), str(new_media_root))
            finally:
                conn.close()
            path_note = f"Paths rewritten to {new_media_root}."
        else:
            library_move_state.set_progress(
                phase="rewrite",
                message="Preserving /media paths for Docker cutover...",
            )
            path_note = (
                "Catalog paths left as /media/... — set MEDIA_HOST_PATH to the backup host "
                "path, clear BACKUP_MEDIA_HOST_PATH, and recreate the container."
            )

        # Bootstrap helps native runs; Docker env still overrides.
        write_bootstrap(
            media_root=str(new_media_root if rewrite_paths else old_media_root),
            app_data_dir=str(
                new_app if rewrite_paths else (old_media_root / ".imageOrganizer")
            ),
        )
        marker = write_library_copied_marker(old_media_root, new_media_root)
        host = backup_media_host_path()
        host_note = f" Host backup path: {host}." if host and not rewrite_paths else ""
        library_move_state.finish_ok(
            f"Library copied to {new_media_root}. "
            f"Verified: {verify_summary}. "
            f"{path_note} "
            f"Backup marker: {marker}.{host_note} "
            "The original root was left in place as a backup."
        )
    except Exception as exc:
        library_move_state.finish_err(f"Library copy failed: {exc}")


def start_library_move_background(
    old_media_root: Path,
    new_media_root: Path,
    *,
    rewrite_only: bool = False,
    rewrite_paths: bool = True,
) -> bool:
    if not library_move_state.claim():
        return False
    thread = threading.Thread(
        target=run_library_move,
        args=(old_media_root, new_media_root),
        kwargs={"rewrite_only": rewrite_only, "rewrite_paths": rewrite_paths},
        daemon=True,
    )
    thread.start()
    return True


def _file_needs_copy(src: Path, dest: Path) -> bool:
    """True when dest is missing or size/mtime differs from src."""
    try:
        s = src.stat()
    except OSError:
        return False
    if not dest.exists():
        return True
    try:
        d = dest.stat()
    except OSError:
        return True
    if s.st_size != d.st_size:
        return True
    if int(s.st_mtime) != int(d.st_mtime):
        return True
    return False


def _estimate_incremental_need(src_root: Path, dest_root: Path) -> tuple[int, int, int]:
    """Return (files_needing_copy, bytes_needing_copy, total_source_files)."""
    need_files = 0
    need_bytes = 0
    total_files = 0
    if not src_root.exists():
        return 0, 0, 0
    for root, _dirs, files in os.walk(src_root):
        rel = Path(root).relative_to(src_root)
        for name in files:
            s = Path(root) / name
            d = dest_root / rel / name
            try:
                size = s.stat().st_size
            except OSError:
                continue
            total_files += 1
            if _file_needs_copy(s, d):
                need_files += 1
                need_bytes += size
    return need_files, need_bytes, total_files


def _copy_tree_incremental(
    src: Path,
    dest: Path,
    *,
    scanned_files: int,
    updated_files: int,
    skipped_files: int,
    updated_bytes: int,
    total_need_files: int,
    total_need_bytes: int,
) -> tuple[int, int, int, int]:
    """Copy only new/changed files. Returns scanned, updated, skipped, updated_bytes."""
    dest.mkdir(parents=True, exist_ok=True)
    last_msg = 0.0
    for root, _dirs, files in os.walk(src):
        rel = Path(root).relative_to(src)
        target_root = dest / rel
        target_root.mkdir(parents=True, exist_ok=True)
        for name in files:
            s = Path(root) / name
            d = target_root / name
            try:
                size = s.stat().st_size
            except OSError:
                continue
            scanned_files += 1
            if _file_needs_copy(s, d):
                shutil.copy2(s, d)
                updated_files += 1
                updated_bytes += size
            else:
                skipped_files += 1
            now = time.monotonic()
            if now - last_msg >= 0.4 or (
                total_need_files > 0 and updated_files == total_need_files
            ):
                last_msg = now
                pct = (
                    int(100 * updated_bytes / total_need_bytes)
                    if total_need_bytes
                    else 100
                )
                library_move_state.set_progress(
                    copied_files=updated_files,
                    total_files=total_need_files,
                    copied_bytes=updated_bytes,
                    total_bytes=total_need_bytes,
                    message=(
                        f"Updating {rel or src.name}… {pct}% "
                        f"({updated_files} updated, {skipped_files} unchanged)"
                    ),
                    phase="copying",
                )
    return scanned_files, updated_files, skipped_files, updated_bytes


def _preflight_backup_sync(
    media_root: Path, backup_root: Path, *, need_bytes: int | None = None
) -> None:
    """Validate backup sync destination and free space for need_bytes."""
    if media_root == backup_root:
        raise ValueError("Backup root must differ from the live media root")
    if not media_root.is_dir():
        raise ValueError(f"Media root not found: {media_root}")
    if not backup_media_ready(backup_root):
        raise ValueError(
            "Backup mount is not ready. Set BACKUP_MEDIA_HOST_PATH in .env "
            "and recreate the backend container."
        )
    if paths_from_env() and not docker_migrate_dest_allowed(backup_root):
        raise ValueError(
            f"Backup sync destination must be {backup_media_root()}. Got {backup_root}."
        )

    backup_root.mkdir(parents=True, exist_ok=True)
    probe = backup_root / ".imageOrganizer-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        raise ValueError(f"Backup root is not writable: {backup_root}") from exc

    if need_bytes is None:
        need_bytes = 0
        for name in LIBRARY_SUBDIRS:
            src = media_root / name
            if not src.exists():
                continue
            _nf, nb, _tf = _estimate_incremental_need(src, backup_root / name)
            need_bytes += nb

    required = int(need_bytes * LIBRARY_COPY_SPACE_MARGIN) if need_bytes else 0
    usage = disk_usage(backup_root)
    if usage is not None and required > 0 and int(usage["free_bytes"]) < required:
        free = int(usage["free_bytes"])
        raise ValueError(
            f"Not enough free space on backup: need about {required} bytes "
            f"for changed files, have {free} free at {backup_root}."
        )


def run_backup_sync(media_root: Path, backup_root: Path) -> None:
    """Incrementally copy new/changed library files to the backup mount."""
    from app.db_backup import create_database_backup
    from app import config as app_config

    try:
        media_root = media_root.resolve()
        backup_root = backup_root.resolve()

        library_move_state.set_progress(
            phase="counting", message="Checking backup mount..."
        )
        # Writable / allowlist first (cheap), then one incremental scan.
        _preflight_backup_sync(media_root, backup_root, need_bytes=0)

        library_move_state.set_progress(
            phase="backup", message="Creating database snapshot before sync..."
        )
        db_path = Path(app_config.DB_PATH)
        if db_path.is_file():
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            try:
                create_database_backup(conn, backups_dir=Path(app_config.BACKUPS_DIR))
            finally:
                conn.close()

        library_move_state.set_progress(
            phase="counting", message="Scanning for new or changed files..."
        )
        total_need_files = 0
        total_need_bytes = 0
        for name in LIBRARY_SUBDIRS:
            src = media_root / name
            if not src.exists():
                continue
            nf, nb, _tf = _estimate_incremental_need(src, backup_root / name)
            total_need_files += nf
            total_need_bytes += nb

        _preflight_backup_sync(media_root, backup_root, need_bytes=total_need_bytes)

        library_move_state.set_progress(
            copied_files=0,
            total_files=total_need_files,
            copied_bytes=0,
            total_bytes=total_need_bytes,
            phase="copying",
            message=(
                "Nothing to update — backup already matches."
                if total_need_files == 0
                else f"Updating {total_need_files} changed files..."
            ),
        )

        scanned = 0
        updated = 0
        skipped = 0
        updated_bytes = 0
        for name in LIBRARY_SUBDIRS:
            src = media_root / name
            if not src.exists() or not src.is_dir():
                continue
            library_move_state.set_message(f"Updating {name}/...")
            scanned, updated, skipped, updated_bytes = _copy_tree_incremental(
                src,
                backup_root / name,
                scanned_files=scanned,
                updated_files=updated,
                skipped_files=skipped,
                updated_bytes=updated_bytes,
                total_need_files=total_need_files,
                total_need_bytes=total_need_bytes,
            )

        host = backup_media_host_path()
        host_note = f" Backup host: {host}." if host else ""
        library_move_state.finish_ok(
            f"Backup updated: {updated} files copied, {skipped} unchanged."
            f"{host_note} Extras already on the backup disk were left alone. No restart needed.",
            restart_required=False,
        )
    except Exception as exc:
        library_move_state.finish_err(f"Backup update failed: {exc}")


def start_backup_sync_background(media_root: Path, backup_root: Path) -> bool:
    if not library_move_state.claim():
        return False
    with library_move_state.lock:
        library_move_state.message = "Starting backup update..."
    thread = threading.Thread(
        target=run_backup_sync,
        args=(media_root, backup_root),
        daemon=True,
    )
    thread.start()
    return True
