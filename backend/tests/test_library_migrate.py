"""Tests for library copy / path rewrite / verify."""

import json
import sqlite3
from pathlib import Path

import pytest

from app.library_migrate import (
    BOOTSTRAP_PATH,
    boundary_replace,
    rewrite_path_prefixes,
    run_library_move,
    tree_stats,
    verify_library_copy,
    write_library_copied_marker,
)


def _clear_docker_migrate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Native migrate tests must not inherit Compose MEDIA_ROOT / backup mounts."""
    for key in (
        "MEDIA_ROOT",
        "APP_DATA_DIR",
        "BACKUP_MEDIA_ROOT",
        "BACKUP_MEDIA_HOST_PATH",
    ):
        monkeypatch.delenv(key, raising=False)


def test_boundary_replace():
    assert boundary_replace("/media/photos/a.jpg", "/media", "/Volumes/Big/Media") == (
        "/Volumes/Big/Media/photos/a.jpg"
    )
    assert boundary_replace("/media", "/media", "/Volumes/Big/Media") == "/Volumes/Big/Media"
    assert boundary_replace("/media2/x", "/media", "/new") is None
    assert boundary_replace("/other", "/media", "/new") is None


def _make_catalog_db(db_path: Path, media_root: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL
        );
        CREATE TABLE config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE operations_log (
            source_path TEXT,
            target_path TEXT
        );
        CREATE TABLE review_decisions (
            id INTEGER PRIMARY KEY,
            target_path TEXT
        );
        """
    )
    photo = media_root / "photos" / "a.jpg"
    conn.execute("INSERT INTO files (id, path) VALUES (1, ?)", (str(photo),))
    conn.execute(
        "INSERT INTO config (key, value) VALUES ('archive_path', ?)",
        (str(media_root / "photos"),),
    )
    conn.execute(
        "INSERT INTO operations_log (source_path, target_path) VALUES (?, ?)",
        (str(media_root / "inbox" / "x.jpg"), str(photo)),
    )
    conn.execute(
        "INSERT INTO review_decisions (id, target_path) VALUES (1, ?)",
        (str(media_root / "photos" / "b.jpg"),),
    )
    conn.commit()
    conn.close()


def test_rewrite_path_prefixes(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    old.mkdir()
    db = tmp_path / "index.db"
    _make_catalog_db(db, old)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    counts = rewrite_path_prefixes(conn, str(old), str(new))
    conn.close()
    assert counts["files.path"] == 1
    assert counts["config"] == 1
    assert counts["operations_log.source_path"] == 1
    assert counts["operations_log.target_path"] == 1
    assert counts["review_decisions.target_path"] == 1

    conn = sqlite3.connect(db)
    path = conn.execute("SELECT path FROM files WHERE id = 1").fetchone()[0]
    conn.close()
    assert path == str(new / "photos" / "a.jpg")


def _seed_library(root: Path) -> None:
    (root / "inbox").mkdir(parents=True)
    (root / "photos").mkdir(parents=True)
    (root / ".trash").mkdir(parents=True)
    catalog = root / ".imageOrganizer"
    catalog.mkdir(parents=True)
    (root / "inbox" / "one.jpg").write_bytes(b"inbox-bytes")
    (root / "photos" / "two.jpg").write_bytes(b"photo-bytes-here")
    (catalog / "thumbs").mkdir()
    (catalog / "thumbs" / "1.jpg").write_bytes(b"thumb")
    _make_catalog_db(catalog / "index.db", root)


def test_verify_library_copy_ok_and_fail(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    # Manual copy
    import shutil

    shutil.copytree(old, new)
    summary = verify_library_copy(old, new)
    assert "photos/" in summary

    (new / "photos" / "two.jpg").unlink()
    with pytest.raises(ValueError, match="Verify failed"):
        verify_library_copy(old, new)


def test_run_library_move_copy_and_verify(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    _clear_docker_migrate_env(monkeypatch)

    monkeypatch.setattr("app.config.DB_PATH", old / ".imageOrganizer" / "index.db")
    monkeypatch.setattr("app.config.APP_DATA_DIR", old / ".imageOrganizer")
    monkeypatch.setattr("app.config.BACKUPS_DIR", old / ".imageOrganizer" / "backups")
    boot = tmp_path / "bootstrap.json"
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_PATH", boot)
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_DIR", tmp_path)

    # Avoid online backup requiring full schema — stub it
    monkeypatch.setattr(
        "app.db_backup.create_database_backup",
        lambda conn, backups_dir=None: {
            "path": str(tmp_path / "bak.db"),
            "filename": "bak.db",
            "size_bytes": 1,
            "created_at": "2026-01-01T00:00:00",
        },
    )

    run_library_move(old, new, rewrite_only=False)

    assert (new / "photos" / "two.jpg").is_file()
    assert (new / ".imageOrganizer" / "index.db").is_file()
    assert (old / "LIBRARY_COPIED_TO.txt").is_file()
    assert old.exists()  # original left as backup
    assert boot.is_file()
    data = json.loads(boot.read_text())
    assert data["media_root"] == str(new.resolve())

    conn = sqlite3.connect(new / ".imageOrganizer" / "index.db")
    path = conn.execute("SELECT path FROM files WHERE id = 1").fetchone()[0]
    conn.close()
    assert path.startswith(str(new.resolve()))


def test_run_library_move_verify_failure_skips_bootstrap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    _clear_docker_migrate_env(monkeypatch)

    monkeypatch.setattr("app.config.DB_PATH", old / ".imageOrganizer" / "index.db")
    monkeypatch.setattr("app.config.APP_DATA_DIR", old / ".imageOrganizer")
    monkeypatch.setattr("app.config.BACKUPS_DIR", old / ".imageOrganizer" / "backups")
    boot = tmp_path / "bootstrap.json"
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_PATH", boot)
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_DIR", tmp_path)
    monkeypatch.setattr(
        "app.db_backup.create_database_backup",
        lambda conn, backups_dir=None: {
            "path": str(tmp_path / "bak.db"),
            "filename": "bak.db",
            "size_bytes": 1,
            "created_at": "2026-01-01T00:00:00",
        },
    )

    # Corrupt verify by making copy drop a file mid-flight via stub after first copy
    real_verify = verify_library_copy

    def bad_verify(o, n):
        (n / "photos" / "two.jpg").unlink()
        return real_verify(o, n)

    monkeypatch.setattr("app.library_migrate.verify_library_copy", bad_verify)

    from app.library_migrate import library_move_state

    library_move_state.claim()
    run_library_move(old, new, rewrite_only=False)
    assert library_move_state.error
    assert "Verify failed" in (library_move_state.error or "")
    assert not boot.exists()
    assert not (old / "LIBRARY_COPIED_TO.txt").exists()


def test_rewrite_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    _clear_docker_migrate_env(monkeypatch)
    import shutil

    shutil.copytree(old, new)

    monkeypatch.setattr("app.config.DB_PATH", old / ".imageOrganizer" / "index.db")
    monkeypatch.setattr("app.config.APP_DATA_DIR", old / ".imageOrganizer")
    monkeypatch.setattr("app.config.BACKUPS_DIR", old / ".imageOrganizer" / "backups")
    boot = tmp_path / "bootstrap.json"
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_PATH", boot)
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_DIR", tmp_path)
    monkeypatch.setattr(
        "app.db_backup.create_database_backup",
        lambda conn, backups_dir=None: {
            "path": str(tmp_path / "bak.db"),
            "filename": "bak.db",
            "size_bytes": 1,
            "created_at": "2026-01-01T00:00:00",
        },
    )

    # Touch source photo so we can detect rewrite-only didn't re-copy from a changed source
    (old / "photos" / "two.jpg").write_bytes(b"changed-source-not-copied")

    run_library_move(old, new, rewrite_only=True)
    assert (new / "photos" / "two.jpg").read_bytes() == b"photo-bytes-here"
    assert boot.is_file()
    conn = sqlite3.connect(new / ".imageOrganizer" / "index.db")
    path = conn.execute("SELECT path FROM files WHERE id = 1").fetchone()[0]
    conn.close()
    assert str(new.resolve()) in path


def test_tree_stats(tmp_path: Path):
    d = tmp_path / "d"
    d.mkdir()
    (d / "a").write_bytes(b"123")
    (d / "b").write_bytes(b"45")
    files, nbytes = tree_stats(d)
    assert files == 2
    assert nbytes == 5


def test_write_library_copied_marker(tmp_path: Path):
    old = tmp_path / "old"
    old.mkdir()
    marker = write_library_copied_marker(old, tmp_path / "new")
    text = marker.read_text()
    assert "backup" in text.lower()
    assert str(tmp_path / "new") in text


def test_backup_media_ready_requires_host(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.library_migrate import backup_media_ready, backup_media_root

    monkeypatch.delenv("BACKUP_MEDIA_ROOT", raising=False)
    monkeypatch.delenv("BACKUP_MEDIA_HOST_PATH", raising=False)
    assert backup_media_root() is None
    assert backup_media_ready() is False

    dest = tmp_path / "media-backup"
    dest.mkdir()
    monkeypatch.setenv("BACKUP_MEDIA_ROOT", str(dest))
    monkeypatch.setenv("BACKUP_MEDIA_HOST_PATH", str(tmp_path / "host-media"))
    assert backup_media_ready() is True

    monkeypatch.setenv("BACKUP_MEDIA_HOST_PATH", "./.docker-unused-backup")
    assert backup_media_ready() is False


def test_run_library_move_preserve_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    _clear_docker_migrate_env(monkeypatch)

    monkeypatch.setattr("app.config.DB_PATH", old / ".imageOrganizer" / "index.db")
    monkeypatch.setattr("app.config.APP_DATA_DIR", old / ".imageOrganizer")
    monkeypatch.setattr("app.config.BACKUPS_DIR", old / ".imageOrganizer" / "backups")
    boot = tmp_path / "bootstrap.json"
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_PATH", boot)
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_DIR", tmp_path)
    monkeypatch.setattr(
        "app.db_backup.create_database_backup",
        lambda conn, backups_dir=None: {
            "path": str(tmp_path / "bak.db"),
            "filename": "bak.db",
            "size_bytes": 1,
            "created_at": "2026-01-01T00:00:00",
        },
    )

    run_library_move(old, new, rewrite_only=False, rewrite_paths=False)

    conn = sqlite3.connect(new / ".imageOrganizer" / "index.db")
    path = conn.execute("SELECT path FROM files WHERE id = 1").fetchone()[0]
    conn.close()
    assert path.startswith(str(old.resolve()))
    data = json.loads(boot.read_text())
    assert data["media_root"] == str(old.resolve())


def test_disk_usage_smoke(tmp_path: Path):
    from app.library_migrate import disk_usage, is_container_disk_low

    usage = disk_usage(tmp_path)
    assert usage is not None
    assert usage["total_bytes"] > 0
    assert usage["free_bytes"] >= 0
    assert usage["used_bytes"] >= 0
    assert is_container_disk_low(
        {"total_bytes": 100, "free_bytes": 1, "used_bytes": 99, "path": "/"}
    )
    assert not is_container_disk_low(
        {
            "total_bytes": 100 * 1024**3,
            "free_bytes": 50 * 1024**3,
            "used_bytes": 50 * 1024**3,
            "path": "/",
        }
    )


def test_preflight_docker_allowlist(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.library_migrate import _preflight, library_move_state

    old = tmp_path / "old"
    backup = tmp_path / "media-backup"
    bad = tmp_path / "Volumes" / "2TB" / "media"
    _seed_library(old)
    backup.mkdir()
    bad.mkdir(parents=True)

    monkeypatch.setenv("MEDIA_ROOT", str(old))
    monkeypatch.setenv("BACKUP_MEDIA_ROOT", str(backup))
    monkeypatch.setenv("BACKUP_MEDIA_HOST_PATH", str(tmp_path / "host-backup"))

    with pytest.raises(ValueError, match="bind-mounted backup"):
        _preflight(old.resolve(), bad.resolve(), rewrite_only=True)

    # rewrite_only needs catalog on dest
    import shutil

    shutil.copytree(old / ".imageOrganizer", backup / ".imageOrganizer")
    _preflight(old.resolve(), backup.resolve(), rewrite_only=True)


def test_preflight_free_space_check(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.library_migrate import _preflight

    old = tmp_path / "old"
    new = tmp_path / "new"
    _seed_library(old)
    new.mkdir()

    monkeypatch.delenv("MEDIA_ROOT", raising=False)
    monkeypatch.delenv("APP_DATA_DIR", raising=False)
    monkeypatch.setattr(
        "app.library_migrate.disk_usage",
        lambda path: {
            "path": str(path),
            "total_bytes": 1000,
            "free_bytes": 10,
            "used_bytes": 990,
        },
    )
    with pytest.raises(ValueError, match="Not enough free space"):
        _preflight(
            old.resolve(),
            new.resolve(),
            rewrite_only=False,
            old_app=old / ".imageOrganizer",
        )


def test_file_needs_copy_size_and_mtime(tmp_path: Path):
    from app.library_migrate import _file_needs_copy
    import os

    src = tmp_path / "src.bin"
    dest = tmp_path / "dest.bin"
    src.write_bytes(b"abc")
    assert _file_needs_copy(src, dest) is True

    dest.write_bytes(b"abc")
    os.utime(dest, (src.stat().st_atime, src.stat().st_mtime))
    assert _file_needs_copy(src, dest) is False

    dest.write_bytes(b"abcd")
    assert _file_needs_copy(src, dest) is True

    dest.write_bytes(b"abc")
    os.utime(src, (1000, 1000))
    os.utime(dest, (2000, 2000))
    assert _file_needs_copy(src, dest) is True


def test_run_backup_sync_incremental(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.library_migrate import library_move_state, run_backup_sync
    import shutil

    media = tmp_path / "media"
    backup = tmp_path / "backup"
    _seed_library(media)
    shutil.copytree(media, backup)

    # Unchanged photo should stay; add a new file; change an existing one
    (media / "photos" / "new.jpg").write_bytes(b"brand-new")
    (media / "photos" / "two.jpg").write_bytes(b"changed-photo-bytes!!")
    old_backup_two = (backup / "photos" / "two.jpg").read_bytes()

    monkeypatch.setenv("BACKUP_MEDIA_ROOT", str(backup))
    monkeypatch.setenv("BACKUP_MEDIA_HOST_PATH", str(tmp_path / "host-backup"))
    monkeypatch.setattr("app.config.DB_PATH", media / ".imageOrganizer" / "index.db")
    monkeypatch.setattr("app.config.APP_DATA_DIR", media / ".imageOrganizer")
    monkeypatch.setattr("app.config.BACKUPS_DIR", media / ".imageOrganizer" / "backups")
    monkeypatch.setattr(
        "app.db_backup.create_database_backup",
        lambda conn, backups_dir=None: {
            "path": str(tmp_path / "bak.db"),
            "filename": "bak.db",
            "size_bytes": 1,
            "created_at": "2026-01-01T00:00:00",
        },
    )
    boot = tmp_path / "bootstrap.json"
    monkeypatch.setattr("app.library_migrate.BOOTSTRAP_PATH", boot)

    library_move_state.claim()
    run_backup_sync(media, backup)

    assert (backup / "photos" / "new.jpg").read_bytes() == b"brand-new"
    assert (backup / "photos" / "two.jpg").read_bytes() == b"changed-photo-bytes!!"
    assert old_backup_two != b"changed-photo-bytes!!"
    assert not boot.exists()
    assert library_move_state.done
    assert not library_move_state.restart_required
    assert library_move_state.error is None
    assert "updated" in (library_move_state.message or "").lower() or "copied" in (
        library_move_state.message or ""
    ).lower()
