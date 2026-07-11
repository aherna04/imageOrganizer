"""Tests for trash location migration preserving junction-table rows."""

import sqlite3
import tempfile
from pathlib import Path

import pytest

# Keep in sync with app.db.SCHEMA (files table omitted — replaced by OLD_FILES_TABLE).
_JUNCTION_SCHEMA = """
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_tags (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE IF NOT EXISTS file_people (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, person_id)
);

CREATE TABLE IF NOT EXISTS file_events (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, event_id)
);
"""

OLD_FILES_TABLE = """
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    location TEXT NOT NULL CHECK(location IN ('inbox', 'archive')),
    size INTEGER NOT NULL,
    mtime REAL NOT NULL,
    sha256 TEXT,
    phash TEXT,
    capture_date TEXT,
    capture_day TEXT,
    camera TEXT,
    width INTEGER,
    height INTEGER,
    caption TEXT,
    rating INTEGER,
    blur_score REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
"""


def _migrate_trash_location(conn: sqlite3.Connection) -> None:
    """Mirror of app.db._migrate_trash_location (fixed version)."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='files'"
    ).fetchone()
    if row and row[0] and "'trash'" in row[0]:
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            CREATE TABLE files_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                location TEXT NOT NULL CHECK(location IN ('inbox', 'archive', 'trash')),
                size INTEGER NOT NULL,
                mtime REAL NOT NULL,
                sha256 TEXT,
                phash TEXT,
                capture_date TEXT,
                capture_day TEXT,
                camera TEXT,
                width INTEGER,
                height INTEGER,
                caption TEXT,
                rating INTEGER,
                blur_score REAL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            INSERT INTO files_new (
                id, path, filename, location, size, mtime, sha256, phash,
                capture_date, capture_day, camera, width, height, caption, rating,
                blur_score, created_at, updated_at
            )
            SELECT
                id, path, filename, location, size, mtime, sha256, phash,
                capture_date, capture_day, camera, width, height, caption, rating,
                blur_score, created_at, updated_at
            FROM files;
            DROP TABLE files;
            ALTER TABLE files_new RENAME TO files;
            """
        )
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _migrate_trash_location_broken(conn: sqlite3.Connection) -> None:
    """Pre-fix migration (FK left ON) — used to document the data-loss bug."""
    conn.executescript(
        """
        CREATE TABLE files_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            location TEXT NOT NULL CHECK(location IN ('inbox', 'archive', 'trash')),
            size INTEGER NOT NULL,
            mtime REAL NOT NULL,
            sha256 TEXT,
            phash TEXT,
            capture_date TEXT,
            capture_day TEXT,
            camera TEXT,
            width INTEGER,
            height INTEGER,
            caption TEXT,
            rating INTEGER,
            blur_score REAL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO files_new (
            id, path, filename, location, size, mtime, sha256, phash,
            capture_date, capture_day, camera, width, height, caption, rating,
            blur_score, created_at, updated_at
        )
        SELECT
            id, path, filename, location, size, mtime, sha256, phash,
            capture_date, capture_day, camera, width, height, caption, rating,
            blur_score, created_at, updated_at
        FROM files;
        DROP TABLE files;
        ALTER TABLE files_new RENAME TO files;
        """
    )


def _seed_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_JUNCTION_SCHEMA)
    conn.executescript(OLD_FILES_TABLE)
    conn.execute(
        """
        INSERT INTO files (path, filename, location, size, mtime)
        VALUES ('/photos/a.jpg', 'a.jpg', 'archive', 100, 1.0)
        """
    )
    file_id = conn.execute("SELECT id FROM files").fetchone()[0]
    conn.execute("INSERT INTO tags (name, slug) VALUES ('Cars', 'cars')")
    tag_id = conn.execute("SELECT id FROM tags").fetchone()[0]
    conn.execute("INSERT INTO people (name, slug) VALUES ('Alex', 'alex')")
    person_id = conn.execute("SELECT id FROM people").fetchone()[0]
    conn.execute(
        """
        INSERT INTO events (name, slug, color, start_date, end_date)
        VALUES ('Trip', 'trip', '#6366f1', '2024-01-01', '2024-01-02')
        """
    )
    event_id = conn.execute("SELECT id FROM events").fetchone()[0]
    conn.execute(
        "INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)",
        (file_id, tag_id),
    )
    conn.execute(
        "INSERT INTO file_people (file_id, person_id) VALUES (?, ?)",
        (file_id, person_id),
    )
    conn.execute(
        "INSERT INTO file_events (file_id, event_id) VALUES (?, ?)",
        (file_id, event_id),
    )
    conn.commit()


def _count(conn: sqlite3.Connection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


@pytest.fixture
def pre_trash_db() -> sqlite3.Connection:
    tmp = tempfile.TemporaryDirectory()
    db_path = Path(tmp.name) / "test.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    _seed_db(conn)
    yield conn
    conn.close()
    tmp.cleanup()


def test_migrate_trash_location_preserves_junction_rows(pre_trash_db: sqlite3.Connection):
    conn = pre_trash_db
    before = {
        "file_tags": _count(conn, "file_tags"),
        "file_people": _count(conn, "file_people"),
        "file_events": _count(conn, "file_events"),
    }
    assert before == {"file_tags": 1, "file_people": 1, "file_events": 1}

    _migrate_trash_location(conn)
    conn.commit()

    after = {
        "file_tags": _count(conn, "file_tags"),
        "file_people": _count(conn, "file_people"),
        "file_events": _count(conn, "file_events"),
    }
    assert after == before

    conn.execute(
        """
        INSERT INTO files (path, filename, location, size, mtime)
        VALUES ('/trash/deleted.jpg', 'deleted.jpg', 'trash', 50, 2.0)
        """
    )
    trash_count = conn.execute(
        "SELECT COUNT(*) FROM files WHERE location = 'trash'"
    ).fetchone()[0]
    assert trash_count == 1


def test_migrate_trash_location_is_idempotent(pre_trash_db: sqlite3.Connection):
    conn = pre_trash_db
    _migrate_trash_location(conn)
    _migrate_trash_location(conn)
    conn.commit()
    assert _count(conn, "file_tags") == 1
    assert _count(conn, "file_people") == 1
    assert _count(conn, "file_events") == 1


def test_broken_migration_wipes_junction_rows():
    """Documents the bug: DROP TABLE files with FK ON cascades junction deletes."""
    tmp = tempfile.TemporaryDirectory()
    db_path = Path(tmp.name) / "test.db"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    _seed_db(conn)
    _migrate_trash_location_broken(conn)
    conn.commit()
    assert _count(conn, "file_tags") == 0
    assert _count(conn, "file_people") == 0
    assert _count(conn, "file_events") == 0
    conn.close()
    tmp.cleanup()
