"""Tests for filesystem capture-date fallback (birthtime vs today mtime)."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from app.metadata import filesystem_fallback_datetime
from app.scanner import _upsert_file


class _Stat:
    def __init__(self, mtime: float, birthtime: float | None):
        self.st_mtime = mtime
        self.st_size = 10
        if birthtime is not None:
            self.st_birthtime = birthtime


def test_filesystem_fallback_prefers_older_birthtime_when_mtime_is_today(tmp_path: Path):
    path = tmp_path / "doc.jpg"
    path.write_bytes(b"x")
    today = date(2026, 7, 31)
    mtime = datetime(2026, 7, 31, 13, 28, 0).timestamp()
    birth = datetime(2020, 1, 24, 23, 10, 0).timestamp()

    with patch.object(Path, "stat", return_value=_Stat(mtime, birth)):
        got = filesystem_fallback_datetime(path, today=today)

    assert got.date() == date(2020, 1, 24)


def test_filesystem_fallback_keeps_mtime_when_not_today(tmp_path: Path):
    path = tmp_path / "doc.jpg"
    path.write_bytes(b"x")
    today = date(2026, 7, 31)
    mtime = datetime(2024, 6, 1, 12, 0, 0).timestamp()
    birth = datetime(2020, 1, 24, 23, 10, 0).timestamp()

    with patch.object(Path, "stat", return_value=_Stat(mtime, birth)):
        got = filesystem_fallback_datetime(path, today=today)

    assert got.date() == date(2024, 6, 1)


def test_filesystem_fallback_keeps_mtime_without_birthtime(tmp_path: Path):
    path = tmp_path / "doc.jpg"
    path.write_bytes(b"x")
    today = date(2026, 7, 31)
    mtime = datetime(2026, 7, 31, 13, 28, 0).timestamp()

    with patch.object(Path, "stat", return_value=_Stat(mtime, None)):
        got = filesystem_fallback_datetime(path, today=today)

    assert got.date() == today


def test_scanner_repairs_today_capture_when_mtime_unchanged(tmp_path: Path, monkeypatch):
    path = tmp_path / "hardtop.jpg"
    path.write_bytes(b"jpeg")
    today = date.today()
    mtime = datetime.combine(today, datetime.min.time().replace(hour=12)).timestamp()
    birth = datetime(2020, 1, 24, 23, 10, 0).timestamp()

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
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
            capture_date TEXT,
            capture_day TEXT,
            camera TEXT,
            width INTEGER,
            height INTEGER,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO files (path, filename, location, size, mtime, capture_date, capture_day)
        VALUES (?, ?, 'inbox', 4, ?, ?, ?)
        """,
        (
            str(path),
            path.name,
            mtime,
            datetime.combine(today, datetime.min.time()).isoformat(),
            today.isoformat(),
        ),
    )
    conn.commit()

    meta = {
        "capture_date": datetime.combine(today, datetime.min.time()).isoformat(),
        "capture_day": today.isoformat(),
        "camera": None,
        "width": 1,
        "height": 1,
        "size": 4,
        "mtime": mtime,
    }

    monkeypatch.setattr("app.scanner.extract_metadata", lambda p: meta)
    monkeypatch.setattr(
        "app.scanner.filesystem_fallback_datetime",
        lambda p: datetime.fromtimestamp(birth),
    )

    _upsert_file(conn, path, "inbox")

    row = conn.execute("SELECT capture_day, capture_date, mtime FROM files WHERE path = ?", (str(path),)).fetchone()
    assert row["mtime"] == mtime
    assert row["capture_day"] == "2020-01-24"
    assert row["capture_date"].startswith("2020-01-24")
