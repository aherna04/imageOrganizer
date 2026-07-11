import os
from pathlib import Path
from typing import Literal

MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", "/Users/alex/Media"))
APP_DATA_DIR = Path(os.environ.get("APP_DATA_DIR", str(Path.home() / ".imageOrganizer")))

INBOX_PATH = MEDIA_ROOT / "inbox"
ARCHIVE_PATH = MEDIA_ROOT / "photos"
TRASH_PATH = MEDIA_ROOT / ".trash"

DB_PATH = APP_DATA_DIR / "index.db"
THUMBS_DIR = APP_DATA_DIR / "thumbs"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

VIDEO_MIME_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
}

THUMB_SIZE = 400
DEFAULT_DATE_PATTERN = "/{YYYY}/{MM}/{DD}/"
DEFAULT_RENAME_PATTERN = "{YYYY}-{MM}-{DD}_{seq:4}_{original}"
PHASH_THRESHOLD = 5
BLUR_THRESHOLD_DEFAULT = 150


def media_type_for_suffix(suffix: str) -> Literal["image", "video"]:
    return "video" if suffix.lower() in VIDEO_EXTENSIONS else "image"


def is_video_path(path: Path | str) -> bool:
    return Path(path).suffix.lower() in VIDEO_EXTENSIONS


def mime_type_for_path(path: Path | str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in VIDEO_MIME_TYPES:
        return VIDEO_MIME_TYPES[suffix]
    return "application/octet-stream"


def ensure_media_dirs() -> None:
    for path in (INBOX_PATH, ARCHIVE_PATH, TRASH_PATH):
        path.mkdir(parents=True, exist_ok=True)


def ensure_app_dirs() -> None:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
