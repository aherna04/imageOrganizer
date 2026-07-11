"""Tests for database backup creation and listing."""

import sqlite3
import time
from pathlib import Path

import pytest

from app.db_backup import BACKUP_FILENAME_RE, create_database_backup, list_database_backups


@pytest.fixture
def temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "index.db"
    backups_dir = tmp_path / "backups"
    monkeypatch.setattr("app.db_backup.BACKUPS_DIR", backups_dir)

    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    conn.execute("INSERT INTO config (key, value) VALUES ('test_key', 'test_value')")
    conn.commit()
    return conn, backups_dir


def test_create_database_backup_writes_timestamped_file(temp_db):
    conn, backups_dir = temp_db

    backup = create_database_backup(conn, backups_dir=backups_dir)

    assert BACKUP_FILENAME_RE.match(backup["filename"])
    assert Path(backup["path"]).is_file()
    assert backup["size_bytes"] > 0
    assert backup["created_at"]

    backup_conn = sqlite3.connect(backup["path"])
    try:
        count = backup_conn.execute("SELECT COUNT(*) FROM config").fetchone()[0]
        value = backup_conn.execute(
            "SELECT value FROM config WHERE key = 'test_key'"
        ).fetchone()[0]
    finally:
        backup_conn.close()

    assert count == 1
    assert value == "test_value"


def test_list_database_backups_newest_first(temp_db):
    conn, backups_dir = temp_db

    first = create_database_backup(conn, backups_dir=backups_dir)
    time.sleep(0.01)
    second = create_database_backup(conn, backups_dir=backups_dir)

    items = list_database_backups(backups_dir=backups_dir)

    assert len(items) == 2
    assert items[0]["filename"] == second["filename"]
    assert items[1]["filename"] == first["filename"]


def test_list_database_backups_empty_dir(tmp_path: Path):
    backups_dir = tmp_path / "backups"
    backups_dir.mkdir()

    assert list_database_backups(backups_dir=backups_dir) == []
