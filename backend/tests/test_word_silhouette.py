"""Tests for Word Silhouette generation."""

import sqlite3
from pathlib import Path

import pytest
from PIL import Image

from app.config import BUNDLED_FONTS_DIR
from app.word_silhouette import (
    OUTPUT_FILENAME_RE,
    _cover_crop,
    _fit_font,
    _visible_glyphs,
    create_design,
    generate_word_silhouette,
    preview_stats_only,
    resolve_font_path,
    resolve_output_path,
    save_uploaded_font,
)


def _font_file() -> Path:
    candidates = [
        BUNDLED_FONTS_DIR / "UnifrakturMaguntia-Book.ttf",
        BUNDLED_FONTS_DIR / "Cinzel-Variable.ttf",
        BUNDLED_FONTS_DIR / "PlayfairDisplay-Bold.ttf",
    ]
    for path in candidates:
        if path.is_file():
            return path
    pytest.skip("No bundled font available")


def _make_conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "index.db")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            location TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            mtime REAL NOT NULL DEFAULT 1.0,
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
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE file_tags (
            file_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_id, tag_id)
        );
        CREATE TABLE review_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_path TEXT,
            applied INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE word_silhouette_designs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            font_path TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        """
    )
    archive = tmp_path / "photos"
    archive.mkdir()
    conn.execute(
        "INSERT INTO config (key, value) VALUES ('archive_path', ?)",
        (str(archive),),
    )
    conn.commit()
    return conn, archive


def _insert_image(conn: sqlite3.Connection, path: Path, file_id: int | None = None) -> int:
    Image.new("RGB", (60, 40), color=(80, 120, 160)).save(path)
    if file_id is None:
        cur = conn.execute(
            """
            INSERT INTO files (path, filename, location, size, mtime, width, height)
            VALUES (?, ?, 'archive', 100, 1.0, 60, 40)
            """,
            (str(path), path.name),
        )
        conn.commit()
        return int(cur.lastrowid)
    conn.execute(
        """
        INSERT INTO files (id, path, filename, location, size, mtime, width, height)
        VALUES (?, ?, ?, 'archive', 100, 1.0, 60, 40)
        """,
        (file_id, str(path), path.name),
    )
    conn.commit()
    return file_id


def test_visible_glyphs():
    assert _visible_glyphs("a b") == ["a", "b"]
    assert _visible_glyphs("  hi  ") == ["h", "i"]


def test_cover_crop():
    img = Image.new("RGB", (100, 50), color=(10, 20, 30))
    cropped = _cover_crop(img, 40, 40)
    assert cropped.size == (40, 40)


def test_cover_crop_pan_changes_pixels():
    # Horizontal gradient so left vs right pan differs
    img = Image.new("RGB", (200, 100))
    for x in range(200):
        for y in range(100):
            img.putpixel((x, y), (x, 0, 255 - x))
    left = _cover_crop(img, 40, 40, pan_x=-1.0, pan_y=0.0, zoom=2.0)
    right = _cover_crop(img, 40, 40, pan_x=1.0, pan_y=0.0, zoom=2.0)
    assert left.size == (40, 40)
    assert right.size == (40, 40)
    assert left.getpixel((20, 20)) != right.getpixel((20, 20))


def test_cover_crop_vertical_pan_at_zoom_one():
    """Landscape into tall target: pan_y must differ after 2D slack bump."""
    img = Image.new("RGB", (200, 80))
    for y in range(80):
        for x in range(200):
            img.putpixel((x, y), (0, y * 3, 0))
    top = _cover_crop(img, 40, 100, pan_x=0.0, pan_y=-1.0, zoom=1.0)
    bottom = _cover_crop(img, 40, 100, pan_x=0.0, pan_y=1.0, zoom=1.0)
    assert top.size == (40, 100)
    assert bottom.size == (40, 100)
    assert top.getpixel((20, 50)) != bottom.getpixel((20, 50))


def test_fit_font_and_resolve():
    font_path = _font_file()
    resolved = resolve_font_path(str(font_path))
    assert resolved.is_file()
    font = _fit_font(resolved, "Hi", 400, 200)
    bbox = font.getbbox("Hi")
    assert bbox[2] - bbox[0] <= 400


def test_preview_stats_single(tmp_path: Path):
    conn, _archive = _make_conn(tmp_path)
    design = create_design(conn, "Test", _font_file())
    stats = preview_stats_only(
        conn,
        text="elliott",
        design_id=design["id"],
        fill_mode="single",
        canvas_width=800,
        padding=24,
    )
    assert stats["glyph_count"] == 7
    assert stats["width"] == 800
    assert stats["height"] > 0
    conn.close()


def test_generate_single_creates_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    conn, archive = _make_conn(tmp_path)
    design = create_design(conn, "Gothic", _font_file())
    fill_path = tmp_path / "fill.jpg"
    fill_id = _insert_image(conn, fill_path)

    from app import word_silhouette as ws

    def fake_upsert(c, path, location):
        cur = c.execute(
            """
            INSERT INTO files (path, filename, location, size, mtime)
            VALUES (?, ?, ?, 1, 1.0)
            """,
            (str(path), Path(path).name, location),
        )
        c.commit()
        return int(cur.lastrowid)

    monkeypatch.setattr(ws, "upsert_file", fake_upsert)

    result = generate_word_silhouette(
        conn,
        text="Hi",
        design_id=design["id"],
        fill_mode="single",
        fill_file_id=fill_id,
        canvas_width=600,
        padding=20,
    )
    assert OUTPUT_FILENAME_RE.match(result["filename"])
    assert result["glyph_count"] == 2
    assert result["fill_mode"] == "single"
    out = archive / "word-silhouettes" / result["filename"]
    assert out.is_file()
    with Image.open(out) as img:
        assert img.size == (result["width"], result["height"])

    tag = conn.execute(
        "SELECT t.name FROM tags t JOIN file_tags ft ON ft.tag_id = t.id WHERE ft.file_id = ?",
        (result["file_id"],),
    ).fetchone()
    assert tag is not None
    assert tag["name"] == "word-silhouette"
    conn.close()


def test_generate_per_letter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    conn, archive = _make_conn(tmp_path)
    design = create_design(conn, "Serif", _font_file())
    ids = []
    for i in range(3):
        ids.append(_insert_image(conn, tmp_path / f"letter{i}.jpg"))

    from app import word_silhouette as ws

    def fake_upsert(c, path, location):
        cur = c.execute(
            """
            INSERT INTO files (path, filename, location, size, mtime)
            VALUES (?, ?, ?, 1, 1.0)
            """,
            (str(path), Path(path).name, location),
        )
        c.commit()
        return int(cur.lastrowid)

    monkeypatch.setattr(ws, "upsert_file", fake_upsert)

    result = generate_word_silhouette(
        conn,
        text="abc",
        design_id=design["id"],
        fill_mode="per_letter",
        letter_file_ids=ids,
        letter_frames=[
            {"pan_x": -0.5, "pan_y": 0.0, "zoom": 1.2},
            {"pan_x": 0.5, "pan_y": 0.3, "zoom": 1.5},
            {"pan_x": 0.0, "pan_y": -0.4, "zoom": 1.0},
        ],
        canvas_width=700,
    )
    assert result["glyph_count"] == 3
    assert (archive / "word-silhouettes" / result["filename"]).is_file()
    conn.close()


def test_save_uploaded_font_rejects_bad(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.word_silhouette.WORD_SILHOUETTE_FONTS_DIR", tmp_path / "fonts"
    )
    with pytest.raises(ValueError, match="Font must"):
        save_uploaded_font("bad.txt", b"not a font")


def test_resolve_output_path_rejects_bad():
    with pytest.raises(ValueError, match="Invalid"):
        resolve_output_path("../evil.jpg")