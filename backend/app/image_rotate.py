"""Rotate image pixels on disk while preserving EXIF (dates, camera, GPS)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import piexif
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from app.config import is_video_path

RotateDirection = Literal["left", "right"]

_JPEG_SUFFIXES = {".jpg", ".jpeg"}
_TIFF_SUFFIXES = {".tif", ".tiff"}
_EXIF_SUFFIXES = _JPEG_SUFFIXES | _TIFF_SUFFIXES
_HEIF_SUFFIXES = {".heic", ".heif"}


class RotateError(Exception):
    """User-facing rotate failure."""


def _load_exif_dict(path: Path) -> dict | None:
    try:
        return piexif.load(str(path))
    except Exception:
        return None


def _prepare_exif_bytes(exif_dict: dict | None, width: int, height: int) -> bytes | None:
    if not exif_dict:
        return None
    try:
        zeroth = exif_dict.setdefault("0th", {})
        zeroth[piexif.ImageIFD.Orientation] = 1
        zeroth[piexif.ImageIFD.ImageWidth] = width
        zeroth[piexif.ImageIFD.ImageLength] = height
        exif_ifd = exif_dict.setdefault("Exif", {})
        exif_ifd[piexif.ExifIFD.PixelXDimension] = width
        exif_ifd[piexif.ExifIFD.PixelYDimension] = height
        # Drop embedded thumbnail — it would be wrong after rotate.
        exif_dict["1st"] = {}
        exif_dict["thumbnail"] = None
        return piexif.dump(exif_dict)
    except Exception:
        return None


def _save_format(path: Path, img: Image.Image) -> str:
    suffix = path.suffix.lower()
    if suffix in _JPEG_SUFFIXES:
        return "JPEG"
    if suffix in _TIFF_SUFFIXES:
        return "TIFF"
    if suffix == ".png":
        return "PNG"
    if suffix == ".webp":
        return "WEBP"
    if suffix in _HEIF_SUFFIXES:
        return "HEIF"
    if img.format:
        return img.format
    raise RotateError(f"Unsupported image format: {suffix or 'unknown'}")


def rotate_image_file(path: Path, direction: RotateDirection) -> tuple[int, int]:
    """Bake a 90° rotation into the file. Returns new (width, height)."""
    if is_video_path(path):
        raise RotateError("Videos cannot be rotated")
    if not path.is_file():
        raise RotateError("File not found on disk")
    if direction not in ("left", "right"):
        raise RotateError("direction must be left or right")

    degrees = 90 if direction == "left" else -90
    suffix = path.suffix.lower()
    exif_dict = _load_exif_dict(path) if suffix in _EXIF_SUFFIXES else None

    tmp = path.with_name(path.name + ".tmp-rotate")
    try:
        with Image.open(path) as opened:
            fmt = _save_format(path, opened)
            img = ImageOps.exif_transpose(opened)
            # Transpose returns a new image; ensure we own a mutable copy.
            if img is opened:
                img = opened.copy()
            img = img.rotate(degrees, expand=True)
            width, height = img.size

            save_kwargs: dict = {}
            exif_bytes = _prepare_exif_bytes(exif_dict, width, height)
            if exif_bytes and fmt in ("JPEG", "TIFF"):
                save_kwargs["exif"] = exif_bytes

            to_save = img
            if fmt == "JPEG":
                if to_save.mode not in ("RGB", "L"):
                    to_save = to_save.convert("RGB")
                save_kwargs.setdefault("quality", 95)
                save_kwargs.setdefault("subsampling", 0)

            try:
                to_save.save(tmp, format=fmt, **save_kwargs)
            except Exception as exc:
                if suffix in _HEIF_SUFFIXES:
                    raise RotateError(
                        "Could not save rotated HEIC/HEIF — try converting to JPEG first"
                    ) from exc
                raise RotateError(f"Could not save rotated image: {exc}") from exc

        os.replace(tmp, path)
        return width, height
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
