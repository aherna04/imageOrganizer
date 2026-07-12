"""Photomosaic generation from catalog thumbnails."""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps

from app.config import MOSAICS_DIR, is_video_path
from app.media_filter import append_media_type_filter
from app.metadata import generate_thumbnail, thumb_cache_path

MAX_TILES = 2000
DEFAULT_TILE_PX = 24
MosaicFilterType = Literal["all", "tag", "person", "event"]
MosaicLocation = Literal["archive", "all"]

MOSAIC_FILENAME_RE = re.compile(r"^mosaic-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.jpg$")


@dataclass
class TileEntry:
    file_id: int
    image: Image.Image
    color: tuple[float, float, float]


def _build_tile_clauses(
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
) -> tuple[list[str], list]:
    clauses: list[str] = []
    params: list = []

    if location == "archive":
        clauses.append("f.location = ?")
        params.append("archive")
    else:
        clauses.append("f.location IN ('inbox', 'archive')")

    append_media_type_filter(clauses, params, "f.filename", "image")

    if filter_type == "tag":
        if filter_id is None:
            raise ValueError("filter_id required for tag filter")
        clauses.append("f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)")
        params.append(filter_id)
    elif filter_type == "person":
        if filter_id is None:
            raise ValueError("filter_id required for person filter")
        clauses.append("f.id IN (SELECT file_id FROM file_people WHERE person_id = ?)")
        params.append(filter_id)
    elif filter_type == "event":
        if filter_id is None:
            raise ValueError("filter_id required for event filter")
        clauses.append("f.id IN (SELECT file_id FROM file_events WHERE event_id = ?)")
        params.append(filter_id)

    return clauses, params


def count_tile_files(
    conn: sqlite3.Connection,
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
) -> int:
    clauses, params = _build_tile_clauses(filter_type, filter_id, location)
    where = "WHERE " + " AND ".join(clauses)
    return conn.execute(f"SELECT COUNT(*) FROM files f {where}", params).fetchone()[0]


def fetch_tile_files(
    conn: sqlite3.Connection,
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
) -> list[sqlite3.Row]:
    clauses, params = _build_tile_clauses(filter_type, filter_id, location)
    where = "WHERE " + " AND ".join(clauses)
    return conn.execute(
        f"SELECT f.id, f.path, f.mtime, f.filename FROM files f {where} ORDER BY f.id LIMIT ?",
        [*params, MAX_TILES],
    ).fetchall()


def _average_color(img: Image.Image) -> tuple[float, float, float]:
    sample = img.resize((16, 16), Image.Resampling.BILINEAR)
    pixels = list(sample.getdata())
    count = len(pixels)
    if count == 0:
        return (0.0, 0.0, 0.0)
    return (
        sum(p[0] for p in pixels) / count,
        sum(p[1] for p in pixels) / count,
        sum(p[2] for p in pixels) / count,
    )


def _color_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def _load_source_image(path: Path) -> Image.Image:
    if is_video_path(path):
        raise ValueError("Source must be an image, not a video")
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def _load_tile_entries(rows: list[sqlite3.Row]) -> list[TileEntry]:
    tiles: list[TileEntry] = []
    for row in rows:
        path = Path(row["path"])
        if is_video_path(path):
            continue
        file_id = row["id"]
        mtime = row["mtime"]
        thumb = thumb_cache_path(file_id, mtime)
        if not thumb.exists():
            generate_thumbnail(path, file_id, mtime)
        if not thumb.exists():
            continue
        with Image.open(thumb) as img:
            rgb = img.convert("RGB")
            tiles.append(TileEntry(file_id=file_id, image=rgb.copy(), color=_average_color(rgb)))
    return tiles


def mosaic_dimensions(source: Image.Image, columns: int, tile_px: int = DEFAULT_TILE_PX) -> tuple[int, int, int, int]:
    src_w, src_h = source.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("Invalid source image dimensions")
    rows = max(1, round(columns * src_h / src_w))
    return columns, rows, columns * tile_px, rows * tile_px


def preview_mosaic(
    conn: sqlite3.Connection,
    source_path: Path,
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
    columns: int,
    tile_px: int = DEFAULT_TILE_PX,
) -> dict:
    tile_count = count_tile_files(conn, filter_type, filter_id, location)
    source = _load_source_image(source_path)
    cols, rows, out_w, out_h = mosaic_dimensions(source, columns, tile_px)
    return {
        "tile_count": tile_count,
        "columns": cols,
        "rows": rows,
        "output_width": out_w,
        "output_height": out_h,
    }


def generate_mosaic(
    conn: sqlite3.Connection,
    source_path: Path,
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
    columns: int,
    tile_px: int = DEFAULT_TILE_PX,
) -> dict:
    tile_rows = fetch_tile_files(conn, filter_type, filter_id, location)
    tiles = _load_tile_entries(tile_rows)
    if len(tiles) < 5:
        raise ValueError(f"Need at least 5 tile images; found {len(tiles)}")

    source = _load_source_image(source_path)
    cols, rows, out_w, out_h = mosaic_dimensions(source, columns, tile_px)
    source_grid = source.resize((cols, rows), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (out_w, out_h))
    for row in range(rows):
        for col in range(cols):
            cell = source_grid.crop((col, row, col + 1, row + 1))
            target_color = _average_color(cell)
            best = min(tiles, key=lambda t: _color_distance(target_color, t.color))
            tile_img = best.image.resize((tile_px, tile_px), Image.Resampling.LANCZOS)
            canvas.paste(tile_img, (col * tile_px, row * tile_px))

    MOSAICS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"mosaic-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.jpg"
    out_path = MOSAICS_DIR / filename
    canvas.save(out_path, "JPEG", quality=92, optimize=True)

    return {
        "filename": filename,
        "url": f"/api/mosaic/output/{filename}",
        "width": out_w,
        "height": out_h,
        "tile_count": len(tiles),
        "columns": cols,
        "rows": rows,
    }


def resolve_mosaic_output_path(filename: str) -> Path:
    if not MOSAIC_FILENAME_RE.match(filename):
        raise ValueError("Invalid mosaic filename")
    path = (MOSAICS_DIR / filename).resolve()
    if MOSAICS_DIR.resolve() not in path.parents:
        raise ValueError("Invalid mosaic path")
    return path
