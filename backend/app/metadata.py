import hashlib
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

import imagehash
import piexif
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

from app.config import SUPPORTED_EXTENSIONS, THUMB_SIZE, THUMBS_DIR, is_video_path

THUMB_CACHE_VERSION = "exif1"


def slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug.strip("-") or "event"


def parse_exif_date(value: bytes | str | None) -> datetime | None:
    if not value:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _base_metadata(path: Path) -> dict:
    stat = path.stat()
    return {
        "capture_date": None,
        "capture_day": None,
        "camera": None,
        "lens": None,
        "gps": None,
        "width": None,
        "height": None,
        "size": stat.st_size,
        "mtime": stat.st_mtime,
    }


def _apply_mtime_fallback(result: dict, path: Path) -> dict:
    if not result["capture_date"]:
        fallback = datetime.fromtimestamp(path.stat().st_mtime)
        result["capture_date"] = fallback.isoformat()
        result["capture_day"] = fallback.date().isoformat()
    return result


def extract_video_metadata(path: Path) -> dict:
    result = _base_metadata(path)
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        data = json.loads(proc.stdout)
        fmt = data.get("format", {})
        creation = fmt.get("tags", {}).get("creation_time") or fmt.get("creation_time")
        parsed = _parse_iso_datetime(creation)
        if parsed:
            result["capture_date"] = parsed.isoformat()
            result["capture_day"] = parsed.date().isoformat()
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                width = stream.get("width")
                height = stream.get("height")
                if width and height:
                    result["width"] = int(width)
                    result["height"] = int(height)
                break
    except Exception:
        pass
    return _apply_mtime_fallback(result, path)


def extract_image_metadata(path: Path) -> dict:
    result = _base_metadata(path)
    try:
        with Image.open(path) as img:
            result["width"], result["height"] = img.size
            exif_data = img.info.get("exif") or img.getexif()
            if exif_data:
                if hasattr(exif_data, "tobytes"):
                    exif_dict = piexif.load(exif_data.tobytes())
                else:
                    exif_dict = piexif.load(exif_data)
                dt = (
                    exif_dict.get("Exif", {}).get(piexif.ExifIFD.DateTimeOriginal)
                    or exif_dict.get("Exif", {}).get(piexif.ExifIFD.DateTime)
                    or exif_dict.get("0th", {}).get(piexif.ImageIFD.DateTime)
                )
                parsed = parse_exif_date(dt)
                if parsed:
                    result["capture_date"] = parsed.isoformat()
                    result["capture_day"] = parsed.date().isoformat()
                make = exif_dict.get("0th", {}).get(piexif.ImageIFD.Make)
                model = exif_dict.get("0th", {}).get(piexif.ImageIFD.Model)
                if make or model:
                    parts = []
                    if make:
                        parts.append(
                            make.decode("utf-8", errors="ignore")
                            if isinstance(make, bytes)
                            else str(make)
                        )
                    if model:
                        parts.append(
                            model.decode("utf-8", errors="ignore")
                            if isinstance(model, bytes)
                            else str(model)
                        )
                    result["camera"] = " ".join(parts).strip()
                lens = exif_dict.get("Exif", {}).get(piexif.ExifIFD.LensModel)
                if lens:
                    result["lens"] = (
                        lens.decode("utf-8", errors="ignore")
                        if isinstance(lens, bytes)
                        else str(lens)
                    )
                gps_ifd = exif_dict.get("GPS")
                if gps_ifd:
                    result["gps"] = "present"
    except Exception:
        pass
    return _apply_mtime_fallback(result, path)


def extract_metadata(path: Path) -> dict:
    if is_video_path(path):
        return extract_video_metadata(path)
    return extract_image_metadata(path)


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_phash(path: Path) -> str | None:
    if is_video_path(path):
        return None
    try:
        with Image.open(path) as img:
            img = ImageOps.exif_transpose(img)
            return str(imagehash.phash(img))
    except Exception:
        return None


def thumb_cache_path(file_id: int, mtime: float) -> Path:
    return THUMBS_DIR / f"{file_id}_{int(mtime)}_{THUMB_CACHE_VERSION}.jpg"


def generate_video_thumbnail(path: Path, file_id: int, mtime: float) -> Path:
    out = thumb_cache_path(file_id, mtime)
    if out.exists():
        return out
    subprocess.run(
        [
            "ffmpeg",
            "-ss",
            "1",
            "-i",
            str(path),
            "-vframes",
            "1",
            "-q:v",
            "2",
            "-y",
            str(out),
        ],
        capture_output=True,
        check=False,
        timeout=60,
    )
    if out.exists():
        with Image.open(out) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE))
            img.save(out, "JPEG", quality=85)
    return out


def generate_image_thumbnail(path: Path, file_id: int, mtime: float) -> Path:
    out = thumb_cache_path(file_id, mtime)
    if out.exists():
        return out
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((THUMB_SIZE, THUMB_SIZE))
        img.save(out, "JPEG", quality=85)
    return out


def generate_thumbnail(path: Path, file_id: int, mtime: float) -> Path:
    if is_video_path(path):
        return generate_video_thumbnail(path, file_id, mtime)
    return generate_image_thumbnail(path, file_id, mtime)


def iter_media_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(p)
    return files
