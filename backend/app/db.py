import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from app.config import (
    APP_DATA_DIR,
    ARCHIVE_PATH,
    DB_PATH,
    DEFAULT_DATE_PATTERN,
    DEFAULT_RENAME_PATTERN,
    INBOX_PATH,
    TRASH_PATH,
    ensure_app_dirs,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_location ON files(location);
CREATE INDEX IF NOT EXISTS idx_files_capture_day ON files(capture_day);
CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_files_phash ON files(phash);

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

CREATE TABLE IF NOT EXISTS file_events (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_file_events_event ON file_events(event_id);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_tags (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag_id);

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_people (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_file_people_person ON file_people(person_id);

CREATE TABLE IF NOT EXISTS duplicate_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_type TEXT NOT NULL CHECK(group_type IN ('exact', 'perceptual')),
    keeper_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS duplicate_members (
    group_id INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, file_id)
);

CREATE TABLE IF NOT EXISTS review_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_path TEXT,
    applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operations_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER,
    operation TEXT NOT NULL,
    source_path TEXT NOT NULL,
    target_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
"""


def default_config() -> dict[str, str]:
    return {
        "inbox_path": str(INBOX_PATH),
        "archive_path": str(ARCHIVE_PATH),
        "trash_path": str(TRASH_PATH),
        "date_pattern": DEFAULT_DATE_PATTERN,
        "rename_pattern": DEFAULT_RENAME_PATTERN,
    }


def init_db() -> None:
    ensure_app_dirs()
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        for key, value in default_config().items():
            conn.execute(
                "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)",
                (key, value),
            )
        conn.commit()


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def get_config(conn: sqlite3.Connection) -> dict[str, str]:
    rows = conn.execute("SELECT key, value FROM config").fetchall()
    cfg = default_config()
    cfg.update({row["key"]: row["value"] for row in rows})
    return cfg


def update_config(conn: sqlite3.Connection, updates: dict[str, str]) -> dict[str, str]:
    for key, value in updates.items():
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
    conn.commit()
    return get_config(conn)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def get_file_events(conn: sqlite3.Connection, file_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT e.* FROM events e
        JOIN file_events fe ON fe.event_id = e.id
        WHERE fe.file_id = ?
        ORDER BY e.name
        """,
        (file_id,),
    ).fetchall()
    return [dict(r) for r in rows]
