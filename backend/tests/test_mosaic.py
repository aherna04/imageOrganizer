"""Tests for photomosaic generation."""

import sqlite3
from pathlib import Path

import pytest
from PIL import Image

from app.mosaic import (
    MOSAIC_FILENAME_RE,
    _average_color,
    _build_tile_clauses,
    generate_mosaic,
    mosaic_dimensions,
    resolve_mosaic_output_path,
)


def test_mosaic_dimensions():
    source = Image.new("RGB", (400, 300), color=(100, 120, 140))
    cols, rows, out_w, out_h = mosaic_dimensions(source, columns=40, tile_px=10)
    assert cols == 40
    assert rows == 30
    assert out_w == 400
    assert out_h == 300


def test_average_color():
    img = Image.new("RGB", (20, 20), color=(200, 40, 40))
    r, g, b = _average_color(img)
    assert r == pytest.approx(200, abs=2)
    assert g == pytest.approx(40, abs=2)
    assert b == pytest.approx(40, abs=2)


def test_build_tile_clauses_requires_filter_id():
    with pytest.raises(ValueError, match="filter_id required"):
        _build_tile_clauses("tag", None, "archive")


def test_generate_mosaic_creates_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mosaics_dir = tmp_path / "mosaics"
    thumbs_dir = tmp_path / "thumbs"
    monkeypatch.setattr("app.mosaic.MOSAICS_DIR", mosaics_dir)
    monkeypatch.setattr("app.mosaic.thumb_cache_path", lambda fid, mtime: thumbs_dir / f"{fid}.jpg")

    db_path = tmp_path / "index.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL,
            filename TEXT NOT NULL,
            location TEXT NOT NULL,
            mtime REAL NOT NULL
        )"""
    )

    source_path = tmp_path / "source.jpg"
    Image.new("RGB", (80, 60), color=(30, 60, 90)).save(source_path)

    tile_colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255)]
    for idx, color in enumerate(tile_colors, start=1):
        path = tmp_path / f"tile{idx}.jpg"
        Image.new("RGB", (40, 40), color=color).save(path)
        thumbs_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (40, 40), color=color).save(thumbs_dir / f"{idx}.jpg")
        conn.execute(
            "INSERT INTO files (id, path, filename, location, mtime) VALUES (?, ?, ?, 'archive', 1.0)",
            (idx, str(path), path.name),
        )
    conn.commit()

    source = Image.open(source_path)
    cols, rows, out_w, out_h = mosaic_dimensions(source, columns=10, tile_px=8)
    source.close()

    result = generate_mosaic(
        conn,
        source_path,
        filter_type="all",
        filter_id=None,
        location="archive",
        columns=10,
        tile_px=8,
    )

    assert MOSAIC_FILENAME_RE.match(result["filename"])
    out_path = resolve_mosaic_output_path(result["filename"])
    assert out_path.is_file()
    assert result["width"] == out_w
    assert result["height"] == out_h
    assert result["tile_count"] == 5

    with Image.open(out_path) as mosaic:
        assert mosaic.size == (out_w, out_h)

    conn.close()
