"""Tests for safe duplicate index rebuild."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.dedupe import _load_exact_id_groups, _replace_duplicate_index, _run_dedupe_rebuild, dedupe_state


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            location TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime REAL NOT NULL,
            sha256 TEXT,
            phash TEXT,
            capture_date TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE duplicate_groups (
            id INTEGER PRIMARY KEY,
            group_type TEXT NOT NULL,
            keeper_id INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE duplicate_members (
            group_id INTEGER NOT NULL,
            file_id INTEGER NOT NULL,
            PRIMARY KEY (group_id, file_id)
        )
        """
    )
    conn.execute(
        """
        INSERT INTO files (id, path, filename, location, size, mtime, sha256, phash, capture_date)
        VALUES
          (1, '/a.jpg', 'a.jpg', 'archive', 100, 1.0, 'same', 'aaaaaaaaaaaaaaaa', '2020-01-01'),
          (2, '/b.jpg', 'b.jpg', 'archive', 90, 1.0, 'same', 'bbbbbbbbbbbbbbbb', '2020-01-01'),
          (3, '/c.jpg', 'c.jpg', 'archive', 80, 1.0, 'other', NULL, '2020-01-01')
        """
    )
    conn.execute(
        "INSERT INTO duplicate_groups (id, group_type, keeper_id) VALUES (99, 'exact', 1)"
    )
    conn.execute(
        "INSERT INTO duplicate_members (group_id, file_id) VALUES (99, 1), (99, 2)"
    )
    conn.commit()


def test_load_exact_id_groups(tmp_path: Path):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    groups = _load_exact_id_groups(conn)
    assert groups == [[1, 2]]
    # Existing index untouched by load
    assert conn.execute("SELECT COUNT(*) FROM duplicate_groups").fetchone()[0] == 1


def test_replace_writes_new_index(tmp_path: Path):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    _replace_duplicate_index(conn, [[1, 2]], [])
    rows = conn.execute(
        "SELECT group_type, keeper_id FROM duplicate_groups"
    ).fetchall()
    assert len(rows) == 1
    assert rows[0]["group_type"] == "exact"
    assert rows[0]["keeper_id"] == 1  # larger size
    members = {
        r[0]
        for r in conn.execute("SELECT file_id FROM duplicate_members").fetchall()
    }
    assert members == {1, 2}


def test_failed_replace_leaves_previous_groups(monkeypatch):
    """Simulate compute success then write failure: prior groups must remain."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _init_db(conn)

    class Ctx:
        def __enter__(self):
            return conn

        def __exit__(self, *args):
            return False

    calls = {"n": 0}

    def fake_get_conn():
        calls["n"] += 1
        if calls["n"] == 1:
            return Ctx()

        class FailCtx:
            def __enter__(self):
                raise RuntimeError("write boom")

            def __exit__(self, *args):
                return False

        return FailCtx()

    monkeypatch.setattr("app.dedupe.get_conn", fake_get_conn)
    monkeypatch.setattr(
        "app.dedupe._compute_perceptual_groups",
        lambda pairs: [],
    )
    # Claim slot like start_dedupe_rebuild_background
    assert dedupe_state.request()
    _run_dedupe_rebuild()
    assert conn.execute("SELECT COUNT(*) FROM duplicate_groups").fetchone()[0] == 1
    assert conn.execute("SELECT id FROM duplicate_groups").fetchone()[0] == 99
