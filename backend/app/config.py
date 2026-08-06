from pathlib import Path
from typing import Literal

from app.library_migrate import resolve_app_data_dir, resolve_media_root

MEDIA_ROOT = resolve_media_root()
APP_DATA_DIR = resolve_app_data_dir(MEDIA_ROOT)

INBOX_PATH = MEDIA_ROOT / "inbox"
ARCHIVE_PATH = MEDIA_ROOT / "photos"
TRASH_PATH = MEDIA_ROOT / ".trash"

DB_PATH = APP_DATA_DIR / "index.db"
BACKUPS_DIR = APP_DATA_DIR / "backups"
MOSAICS_DIR = APP_DATA_DIR / "mosaics"
THUMBS_DIR = APP_DATA_DIR / "thumbs"
VIDEO_PLAY_DIR = APP_DATA_DIR / "video_play"
WORD_SILHOUETTE_FONTS_DIR = APP_DATA_DIR / "word_silhouette_fonts"
WORD_SILHOUETTE_PREVIEWS_DIR = APP_DATA_DIR / "word_silhouette_previews"
BUNDLED_FONTS_DIR = Path(__file__).resolve().parent / "fonts"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

VIDEO_MIME_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/mp4",
    ".m4v": "video/mp4",
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
    VIDEO_PLAY_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    WORD_SILHOUETTE_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    WORD_SILHOUETTE_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
