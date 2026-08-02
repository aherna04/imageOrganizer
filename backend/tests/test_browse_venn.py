"""Tests for Browse exclusive Venn region counts."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager

import pytest
from fastapi import HTTPException

from app.main import _browse_venn


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            location TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime REAL NOT NULL,
            camera TEXT
        );
        CREATE TABLE people (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE
        );
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE
        );
        CREATE TABLE file_people (
            file_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            PRIMARY KEY (file_id, person_id)
        );
        CREATE TABLE file_tags (
            file_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_id, tag_id)
        );
        CREATE TABLE review_decisions (
            file_id INTEGER NOT NULL,
            applied INTEGER NOT NULL DEFAULT 0,
            action TEXT
        );
        """
    )
    # Lou only: 1,2  Cars only: 3  both: 4,5,6  neither: 7  trash: 8 (ignored)
    conn.executemany(
        "INSERT INTO files (id, path, filename, location, size, mtime, camera) VALUES (?,?,?,?,?,?,?)",
        [
            (1, "/1.jpg", "1.jpg", "archive", 10, 1.0, None),
            (2, "/2.jpg", "2.jpg", "inbox", 10, 1.0, None),
            (3, "/3.jpg", "3.jpg", "archive", 10, 1.0, None),
            (4, "/4.jpg", "4.jpg", "archive", 10, 1.0, None),
            (5, "/5.jpg", "5.jpg", "archive", 10, 1.0, None),
            (6, "/6.jpg", "6.jpg", "inbox", 10, 1.0, None),
            (7, "/7.jpg", "7.jpg", "archive", 10, 1.0, None),
            (8, "/8.jpg", "8.jpg", "trash", 10, 1.0, None),
        ],
    )
    conn.execute("INSERT INTO people (id, name, slug) VALUES (1, 'Lou', 'lou')")
    conn.execute("INSERT INTO tags (id, name, slug) VALUES (1, 'Cars', 'cars')")
    conn.execute("INSERT INTO tags (id, name, slug) VALUES (2, 'Trip', 'trip')")
    for fid in (1, 2, 4, 5, 6, 8):
        conn.execute("INSERT INTO file_people (file_id, person_id) VALUES (?, 1)", (fid,))
    for fid in (3, 4, 5, 6, 8):
        conn.execute("INSERT INTO file_tags (file_id, tag_id) VALUES (?, 1)", (fid,))
    # Trip on 5,6 only (subset of Lou∩Cars) and on 9 would be unused
    for fid in (5, 6):
        conn.execute("INSERT INTO file_tags (file_id, tag_id) VALUES (?, 2)", (fid,))
    conn.commit()


@pytest.fixture
def venn_conn(monkeypatch: pytest.MonkeyPatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _init_db(conn)

    @contextmanager
    def fake_get_conn():
        yield conn

    monkeypatch.setattr("app.main.get_conn", fake_get_conn)
    yield conn
    conn.close()


def test_venn_two_sets_exclusive_regions(venn_conn):
    out = _browse_venn(
        tag_ids=[1],
        person_ids=[1],
        cameras=[],
        location=None,
        media_type=None,
    )
    by_key = {s.key: s for s in out.sets}
    assert by_key["person:1"].size == 5  # 1,2,4,5,6 (not trash)
    assert by_key["tag:1"].size == 4  # 3,4,5,6

    regions = {tuple(r.members): r.count for r in out.regions}
    assert regions[("person:1",)] == 2  # only Lou
    assert regions[("tag:1",)] == 1  # only Cars
    assert regions[("person:1", "tag:1")] == 3  # both


def test_venn_three_sets(venn_conn):
    out = _browse_venn(
        tag_ids=[1, 2],
        person_ids=[1],
        cameras=[],
        location=None,
        media_type=None,
    )
    assert len(out.sets) == 3
    assert len(out.regions) == 7
    regions = {tuple(sorted(r.members)): r.count for r in out.regions}
    # Lou∩Cars∩Trip = 5,6
    assert regions[tuple(sorted(["person:1", "tag:1", "tag:2"]))] == 2
    # Lou∩Cars not Trip = 4
    assert regions[tuple(sorted(["person:1", "tag:1"]))] == 1
    # Trip alone / Trip without Lou or Cars should be 0
    assert regions[("tag:2",)] == 0


def test_venn_one_set(venn_conn):
    out = _browse_venn(
        tag_ids=[],
        person_ids=[1],
        cameras=[],
        location=None,
        media_type=None,
    )
    assert len(out.sets) == 1
    assert out.sets[0].key == "person:1"
    assert out.sets[0].size == 5
    assert len(out.regions) == 1
    assert out.regions[0].members == ["person:1"]
    assert out.regions[0].count == 5


def test_venn_rejects_wrong_label_count(venn_conn):
    with pytest.raises(HTTPException) as exc:
        _browse_venn(
            tag_ids=[],
            person_ids=[],
            cameras=[],
            location=None,
            media_type=None,
        )
    assert exc.value.status_code == 400


def test_venn_four_sets(venn_conn):
    conn = venn_conn
    conn.execute("INSERT INTO tags (id, name, slug) VALUES (3, 'Austin', 'austin')")
    # Austin on files 4 and 5 only
    for fid in (4, 5):
        conn.execute("INSERT INTO file_tags (file_id, tag_id) VALUES (?, 3)", (fid,))
    conn.commit()

    out = _browse_venn(
        tag_ids=[1, 2, 3],
        person_ids=[1],
        cameras=[],
        location=None,
        media_type=None,
    )
    assert len(out.sets) == 4
    assert len(out.regions) == 15
    regions = {tuple(sorted(r.members)): r.count for r in out.regions}
    # Lou∩Cars∩Trip∩Austin = file 5 only
    assert regions[tuple(sorted(["person:1", "tag:1", "tag:2", "tag:3"]))] == 1
    # Lou∩Cars∩Austin not Trip = file 4
    assert regions[tuple(sorted(["person:1", "tag:1", "tag:3"]))] == 1


def test_venn_rejects_six_labels(venn_conn):
    conn = venn_conn
    for i, name in enumerate(["A", "B", "C"], start=3):
        conn.execute(
            "INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)",
            (i, name, name.lower()),
        )
    conn.commit()
    with pytest.raises(HTTPException) as exc:
        _browse_venn(
            tag_ids=[1, 2, 3, 4, 5],
            person_ids=[1],
            cameras=[],
            location=None,
            media_type=None,
        )
    assert exc.value.status_code == 400
    assert "1 to 5" in str(exc.value.detail)