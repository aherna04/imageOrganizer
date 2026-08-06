"""Word Silhouette — photo-filled typography (single / mosaic / per-letter)."""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont, ImageOps

from app.config import (
    BUNDLED_FONTS_DIR,
    WORD_SILHOUETTE_FONTS_DIR,
    WORD_SILHOUETTE_PREVIEWS_DIR,
    is_video_path,
)
from app.db import get_config, get_conn
from app.metadata import slugify
from app.mosaic import (
    DEFAULT_TILE_PX,
    _average_color,
    _color_distance,
    _load_tile_entries,
    count_tile_files,
    fetch_tile_files,
)
from app.scanner import upsert_file
from app import tags as tags_svc

FillMode = Literal["single", "mosaic", "per_letter"]
MosaicFilterType = Literal["all", "tag", "person", "event"]
MosaicLocation = Literal["archive", "all"]

OUTPUT_FILENAME_RE = re.compile(
    r"^word-silhouette-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.jpg$"
)
PREVIEW_FILENAME_RE = re.compile(r"^preview-[0-9a-f]{32}\.jpg$")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

TAG_NAME = "word-silhouette"
MAX_TEXT_LEN = 80


def _parse_bg(color: str) -> tuple[int, int, int]:
    if not HEX_COLOR_RE.match(color):
        raise ValueError("background must be a #RRGGBB hex color")
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def resolve_font_path(stored: str) -> Path:
    path = Path(stored)
    if not path.is_absolute():
        candidate = BUNDLED_FONTS_DIR / path.name
        if candidate.is_file():
            path = candidate
        else:
            path = WORD_SILHOUETTE_FONTS_DIR / path.name
    resolved = path.resolve()
    allowed = {BUNDLED_FONTS_DIR.resolve(), WORD_SILHOUETTE_FONTS_DIR.resolve()}
    if not any(
        resolved == root or root in resolved.parents for root in allowed
    ):
        raise ValueError("Font path is not allowed")
    if not resolved.is_file():
        raise ValueError("Font file not found")
    return resolved


def list_designs(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM word_silhouette_designs ORDER BY name"
    ).fetchall()
    return [dict(r) for r in rows]


def get_design(conn: sqlite3.Connection, design_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM word_silhouette_designs WHERE id = ?", (design_id,)
    ).fetchone()
    return dict(row) if row else None


def create_design(conn: sqlite3.Connection, name: str, font_path: Path) -> dict:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Design name is required")
    base = slugify(cleaned)
    slug = base
    n = 1
    while conn.execute(
        "SELECT 1 FROM word_silhouette_designs WHERE slug = ?", (slug,)
    ).fetchone():
        slug = f"{base}-{n}"
        n += 1
    cur = conn.execute(
        "INSERT INTO word_silhouette_designs (name, slug, font_path) VALUES (?, ?, ?)",
        (cleaned, slug, str(font_path.resolve())),
    )
    conn.commit()
    design = get_design(conn, cur.lastrowid)  # type: ignore[arg-type]
    assert design is not None
    return design


def rename_design(conn: sqlite3.Connection, design_id: int, name: str) -> dict:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Design name is required")
    existing = get_design(conn, design_id)
    if not existing:
        raise ValueError("Design not found")
    conn.execute(
        "UPDATE word_silhouette_designs SET name = ? WHERE id = ?",
        (cleaned, design_id),
    )
    conn.commit()
    design = get_design(conn, design_id)
    assert design is not None
    return design


def delete_design(conn: sqlite3.Connection, design_id: int) -> None:
    existing = get_design(conn, design_id)
    if not existing:
        raise ValueError("Design not found")
    font_path = Path(existing["font_path"])
    conn.execute("DELETE FROM word_silhouette_designs WHERE id = ?", (design_id,))
    conn.commit()
    # Only remove uploaded fonts, never bundled
    try:
        resolved = font_path.resolve()
        upload_root = WORD_SILHOUETTE_FONTS_DIR.resolve()
        if resolved.is_file() and upload_root in resolved.parents:
            resolved.unlink(missing_ok=True)
    except OSError:
        pass


def save_uploaded_font(filename: str, data: bytes) -> Path:
    suffix = Path(filename).suffix.lower()
    if suffix not in {".ttf", ".otf"}:
        raise ValueError("Font must be a .ttf or .otf file")
    if not data:
        raise ValueError("Empty font upload")
    WORD_SILHOUETTE_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    safe = f"{uuid.uuid4().hex}{suffix}"
    dest = WORD_SILHOUETTE_FONTS_DIR / safe
    dest.write_bytes(data)
    # Validate Pillow can open it
    try:
        ImageFont.truetype(str(dest), 32)
    except OSError as exc:
        dest.unlink(missing_ok=True)
        raise ValueError("Invalid font file") from exc
    return dest


def _load_rgb_image(path: Path) -> Image.Image:
    if is_video_path(path):
        raise ValueError("Fill source must be an image, not a video")
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def _file_path(conn: sqlite3.Connection, file_id: int) -> Path:
    row = conn.execute(
        "SELECT path, filename FROM files WHERE id = ?", (file_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"File {file_id} not found")
    path = Path(row["path"])
    if not path.is_file():
        raise ValueError(f"File {file_id} not found on disk")
    if is_video_path(path):
        raise ValueError("Fill source must be an image, not a video")
    return path


def _cover_crop(
    img: Image.Image,
    target_w: int,
    target_h: int,
    *,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
    zoom: float = 1.0,
) -> Image.Image:
    """Cover-crop into target size. pan in [-1,1] (0=center); zoom >= 1 tightens crop."""
    target_w = max(1, target_w)
    target_h = max(1, target_h)
    pan_x = max(-1.0, min(1.0, float(pan_x)))
    pan_y = max(-1.0, min(1.0, float(pan_y)))
    zoom = max(1.0, min(3.0, float(zoom)))

    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h) * zoom
    nw = max(1, int(round(src_w * scale)))
    nh = max(1, int(round(src_h * scale)))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)

    max_left = max(0, nw - target_w)
    max_top = max(0, nh - target_h)
    # pan 0 → center; -1 → left/top edge; +1 → right/bottom edge
    left = int(round((max_left / 2) * (1 + pan_x)))
    top = int(round((max_top / 2) * (1 + pan_y)))
    left = max(0, min(max_left, left))
    top = max(0, min(max_top, top))
    return resized.crop((left, top, left + target_w, top + target_h))


def _fit_font(font_path: Path, text: str, max_w: int, max_h: int) -> ImageFont.FreeTypeFont:
    lo, hi = 12, 900
    best = 12
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(str(font_path), mid)
        bbox = font.getbbox(text)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        if w <= max_w and h <= max_h:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(str(font_path), best)


def _visible_glyphs(text: str) -> list[str]:
    return [ch for ch in text if not ch.isspace()]


def _layout_text(
    text: str,
    font: ImageFont.FreeTypeFont,
    canvas_w: int,
    canvas_h: int,
    padding: int,
) -> tuple[Image.Image, list[tuple[str, int, int, int, int]]]:
    """Return L mask and list of (char, x, y, w, h) for non-space glyphs."""
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    origin_x = (canvas_w - text_w) // 2 - bbox[0]
    origin_y = (canvas_h - text_h) // 2 - bbox[1]

    mask = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(mask)
    draw.text((origin_x, origin_y), text, font=font, fill=255)

    glyphs: list[tuple[str, int, int, int, int]] = []
    x_cursor = 0.0
    for ch in text:
        advance = font.getlength(ch)
        if not ch.isspace():
            gb = font.getbbox(ch)
            gw = max(1, gb[2] - gb[0])
            gh = max(1, gb[3] - gb[1])
            gx = int(round(origin_x + x_cursor + gb[0]))
            gy = int(round(origin_y + gb[1]))
            glyphs.append((ch, gx, gy, gw, gh))
        x_cursor += advance

    return mask, glyphs


def _build_mosaic_fill(
    conn: sqlite3.Connection,
    guide: Image.Image,
    width: int,
    height: int,
    filter_type: MosaicFilterType,
    filter_id: int | None,
    location: MosaicLocation,
    columns: int,
    tile_px: int = DEFAULT_TILE_PX,
) -> tuple[Image.Image, int, int, int]:
    tile_rows = fetch_tile_files(conn, filter_type, filter_id, location)
    tiles = _load_tile_entries(tile_rows)
    if len(tiles) < 5:
        raise ValueError(f"Need at least 5 tile images; found {len(tiles)}")

    cols = max(1, columns)
    rows = max(1, round(cols * height / width))
    guide_grid = guide.resize((cols, rows), Image.Resampling.LANCZOS)
    out_w, out_h = cols * tile_px, rows * tile_px
    canvas = Image.new("RGB", (out_w, out_h))
    for row in range(rows):
        for col in range(cols):
            cell = guide_grid.crop((col, row, col + 1, row + 1))
            target_color = _average_color(cell)
            best = min(tiles, key=lambda t: _color_distance(target_color, t.color))
            tile_img = best.image.resize((tile_px, tile_px), Image.Resampling.LANCZOS)
            canvas.paste(tile_img, (col * tile_px, row * tile_px))
    if (out_w, out_h) != (width, height):
        canvas = canvas.resize((width, height), Image.Resampling.LANCZOS)
    return canvas, len(tiles), cols, rows


def _composite_mask(
    fill: Image.Image, mask: Image.Image, background: tuple[int, int, int]
) -> Image.Image:
    bg = Image.new("RGB", mask.size, background)
    if fill.size != mask.size:
        fill = fill.resize(mask.size, Image.Resampling.LANCZOS)
    return Image.composite(fill, bg, mask)


def render_word_silhouette(
    conn: sqlite3.Connection,
    *,
    text: str,
    design_id: int,
    fill_mode: FillMode,
    fill_file_id: int | None = None,
    guide_file_id: int | None = None,
    letter_file_ids: list[int] | None = None,
    letter_frames: list[dict] | None = None,
    filter_type: MosaicFilterType = "all",
    filter_id: int | None = None,
    location: MosaicLocation = "archive",
    columns: int = 40,
    canvas_width: int = 1600,
    padding: int = 48,
    background: str = "#ffffff",
) -> dict:
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Text is required")
    if len(cleaned) > MAX_TEXT_LEN:
        raise ValueError(f"Text must be at most {MAX_TEXT_LEN} characters")

    design = get_design(conn, design_id)
    if not design:
        raise ValueError("Design not found")
    font_path = resolve_font_path(design["font_path"])
    bg = _parse_bg(background)

    canvas_w = canvas_width
    # Height from aspect of fitted text with padding
    probe_font = _fit_font(
        font_path, cleaned, canvas_w - 2 * padding, max(200, canvas_w)
    )
    pb = probe_font.getbbox(cleaned)
    text_h = pb[3] - pb[1]
    canvas_h = max(padding * 2 + text_h + 8, int(canvas_w * 0.35))
    font = _fit_font(font_path, cleaned, canvas_w - 2 * padding, canvas_h - 2 * padding)
    mask, glyphs = _layout_text(cleaned, font, canvas_w, canvas_h, padding)
    glyph_count = len(glyphs)

    tile_count = 0
    mosaic_cols = 0
    mosaic_rows = 0

    if fill_mode == "single":
        if fill_file_id is None:
            raise ValueError("fill_file_id required for single fill mode")
        fill_img = _cover_crop(_load_rgb_image(_file_path(conn, fill_file_id)), canvas_w, canvas_h)
        result = _composite_mask(fill_img, mask, bg)

    elif fill_mode == "mosaic":
        if filter_type != "all" and filter_id is None:
            raise ValueError(f"filter_id required when filter_type is {filter_type}")
        guide_id = guide_file_id or fill_file_id
        if guide_id is None:
            raise ValueError("guide_file_id (or fill_file_id) required for mosaic fill mode")
        guide = _cover_crop(_load_rgb_image(_file_path(conn, guide_id)), canvas_w, canvas_h)
        mosaic_fill, tile_count, mosaic_cols, mosaic_rows = _build_mosaic_fill(
            conn,
            guide,
            canvas_w,
            canvas_h,
            filter_type,
            filter_id,
            location,
            columns,
        )
        result = _composite_mask(mosaic_fill, mask, bg)

    elif fill_mode == "per_letter":
        ids = list(letter_file_ids or [])
        if not ids and fill_file_id is not None:
            ids = [fill_file_id]
        if not ids:
            if filter_type != "all" and filter_id is None:
                raise ValueError(f"filter_id required when filter_type is {filter_type}")
            tile_rows = fetch_tile_files(conn, filter_type, filter_id, location)
            ids = [int(r["id"]) for r in tile_rows]
            tile_count = len(ids)
        if not ids:
            raise ValueError("Need letter images or a tile pool for per_letter mode")
        if glyph_count == 0:
            raise ValueError("Text has no visible letters")

        result = Image.new("RGB", (canvas_w, canvas_h), bg)
        bbox = font.getbbox(cleaned)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        origin_x = (canvas_w - text_w) // 2 - bbox[0]
        origin_y = (canvas_h - text_h) // 2 - bbox[1]
        x_cursor = 0.0
        glyph_i = 0
        for ch in cleaned:
            advance = font.getlength(ch)
            if not ch.isspace():
                frame_idx = glyph_i
                fid = ids[glyph_i % len(ids)]
                glyph_i += 1
                cb = font.getbbox(ch)
                gw = max(1, cb[2] - cb[0])
                gh = max(1, cb[3] - cb[1])
                gx = int(round(origin_x + x_cursor + cb[0]))
                gy = int(round(origin_y + cb[1]))
                pad_g = max(2, min(gw, gh) // 8)
                photo = _load_rgb_image(_file_path(conn, fid))
                frame: dict = {}
                if letter_frames and frame_idx < len(letter_frames):
                    raw = letter_frames[frame_idx]
                    frame = raw if isinstance(raw, dict) else {}
                cover = _cover_crop(
                    photo,
                    gw + pad_g * 2,
                    gh + pad_g * 2,
                    pan_x=float(frame.get("pan_x", 0) or 0),
                    pan_y=float(frame.get("pan_y", 0) or 0),
                    zoom=float(frame.get("zoom", 1) or 1),
                )

                glyph_mask = Image.new("L", (canvas_w, canvas_h), 0)
                ImageDraw.Draw(glyph_mask).text(
                    (origin_x + x_cursor, origin_y), ch, font=font, fill=255
                )
                layer = Image.new("RGB", (canvas_w, canvas_h), bg)
                layer.paste(cover, (max(0, gx - pad_g), max(0, gy - pad_g)))
                result = Image.composite(layer, result, glyph_mask)
            x_cursor += advance

    else:
        raise ValueError(f"Unknown fill_mode: {fill_mode}")

    return {
        "image": result,
        "width": canvas_w,
        "height": canvas_h,
        "glyph_count": glyph_count,
        "fill_mode": fill_mode,
        "tile_count": tile_count,
        "columns": mosaic_cols,
        "rows": mosaic_rows,
        "text": cleaned,
        "design_id": design_id,
    }


def preview_word_silhouette(conn: sqlite3.Connection, **kwargs) -> dict:
    """Render and write an ephemeral preview JPEG; not archived or tagged."""
    rendered = render_word_silhouette(conn, **kwargs)
    image: Image.Image = rendered["image"]
    # Downscale preview for speed
    max_side = 1200
    w, h = image.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        image = image.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)

    WORD_SILHOUETTE_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"preview-{uuid.uuid4().hex}.jpg"
    path = WORD_SILHOUETTE_PREVIEWS_DIR / name
    image.save(path, "JPEG", quality=85, optimize=True)

    # Prune old previews (keep last 40)
    previews = sorted(
        WORD_SILHOUETTE_PREVIEWS_DIR.glob("preview-*.jpg"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in previews[40:]:
        old.unlink(missing_ok=True)

    return {
        "preview_url": f"/api/word-silhouette/preview-file/{name}",
        "preview_filename": name,
        "width": rendered["width"],
        "height": rendered["height"],
        "glyph_count": rendered["glyph_count"],
        "fill_mode": rendered["fill_mode"],
        "tile_count": rendered["tile_count"],
        "columns": rendered["columns"],
        "rows": rendered["rows"],
    }


def generate_word_silhouette(conn: sqlite3.Connection, **kwargs) -> dict:
    rendered = render_word_silhouette(conn, **kwargs)
    image: Image.Image = rendered["image"]

    cfg = get_config(conn)
    out_dir = Path(cfg["archive_path"]) / "word-silhouettes"
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"word-silhouette-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.jpg"
    out_path = out_dir / filename
    image.save(out_path, "JPEG", quality=92, optimize=True)

    file_id = upsert_file(conn, out_path, "archive")
    conn.commit()
    tag = tags_svc.get_or_create_tag(conn, TAG_NAME)
    tags_svc.assign_tags_by_ids(conn, [tag["id"]], [file_id])

    return {
        "filename": filename,
        "url": f"/api/word-silhouette/output/{filename}",
        "file_id": file_id,
        "width": rendered["width"],
        "height": rendered["height"],
        "glyph_count": rendered["glyph_count"],
        "fill_mode": rendered["fill_mode"],
        "tile_count": rendered["tile_count"],
        "columns": rendered["columns"],
        "rows": rendered["rows"],
    }


def resolve_output_path(filename: str) -> Path:
    if not OUTPUT_FILENAME_RE.match(filename):
        raise ValueError("Invalid word silhouette filename")
    with get_conn() as conn:
        lib_dir = (Path(get_config(conn)["archive_path"]) / "word-silhouettes").resolve()
    lib_path = (lib_dir / filename).resolve()
    if lib_path.parent != lib_dir:
        raise ValueError("Invalid word silhouette path")
    return lib_path


def resolve_preview_path(filename: str) -> Path:
    if not PREVIEW_FILENAME_RE.match(filename):
        raise ValueError("Invalid preview filename")
    root = WORD_SILHOUETTE_PREVIEWS_DIR.resolve()
    path = (root / filename).resolve()
    if path.parent != root:
        raise ValueError("Invalid preview path")
    return path


def preview_stats_only(
    conn: sqlite3.Connection,
    *,
    text: str,
    design_id: int,
    fill_mode: FillMode,
    filter_type: MosaicFilterType = "all",
    filter_id: int | None = None,
    location: MosaicLocation = "archive",
    columns: int = 40,
    canvas_width: int = 1600,
    padding: int = 48,
) -> dict:
    """Lightweight layout stats without rendering pixels (tests / fast checks)."""
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Text is required")
    design = get_design(conn, design_id)
    if not design:
        raise ValueError("Design not found")
    font_path = resolve_font_path(design["font_path"])
    probe = _fit_font(font_path, cleaned, canvas_width - 2 * padding, max(200, canvas_width))
    pb = probe.getbbox(cleaned)
    text_h = pb[3] - pb[1]
    canvas_h = max(padding * 2 + text_h + 8, int(canvas_width * 0.35))
    glyph_count = len(_visible_glyphs(cleaned))
    tile_count = 0
    if fill_mode in ("mosaic", "per_letter"):
        if filter_type != "all" and filter_id is None:
            raise ValueError(f"filter_id required when filter_type is {filter_type}")
        tile_count = count_tile_files(conn, filter_type, filter_id, location)
    cols = columns if fill_mode == "mosaic" else 0
    rows = max(1, round(cols * canvas_h / canvas_width)) if cols else 0
    return {
        "width": canvas_width,
        "height": canvas_h,
        "glyph_count": glyph_count,
        "fill_mode": fill_mode,
        "tile_count": tile_count,
        "columns": cols,
        "rows": rows,
    }
