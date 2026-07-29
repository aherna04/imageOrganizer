"""Browser-safe video playback: probe codecs and cache H.264/AAC MP4 when needed."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

from app.config import VIDEO_PLAY_DIR

logger = logging.getLogger(__name__)

BROWSER_FRIENDLY_SUFFIXES = {".mp4", ".webm", ".mov", ".m4v"}
BROWSER_FRIENDLY_CODECS = {"h264", "avc1", "vp8", "vp9", "av1"}


def play_cache_path(file_id: int, mtime: float) -> Path:
    return VIDEO_PLAY_DIR / f"{file_id}_{int(mtime)}.mp4"


def probe_video_codec(path: Path) -> str | None:
    """Return lowercase video codec name from ffprobe, or None if unavailable."""
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        data = json.loads(proc.stdout)
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                codec = stream.get("codec_name")
                return str(codec).lower() if codec else None
    except Exception:
        logger.debug("ffprobe failed for %s", path, exc_info=True)
    return None


def is_browser_friendly(path: Path, codec: str | None = None) -> bool:
    """True when the container + codec are likely playable in Chromium/Safari."""
    suffix = path.suffix.lower()
    if suffix not in BROWSER_FRIENDLY_SUFFIXES:
        return False
    resolved = codec if codec is not None else probe_video_codec(path)
    if resolved is None:
        # No probe: allow remapped MIME attempt for mov/mp4/webm/m4v only
        return suffix in {".mp4", ".webm", ".mov", ".m4v"}
    return resolved in BROWSER_FRIENDLY_CODECS


def _transcode_to_mp4(src: Path, dest: Path) -> None:
    VIDEO_PLAY_DIR.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.mp4")
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(src),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(tmp),
            ],
            capture_output=True,
            check=False,
            timeout=600,
        )
        if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
            err = (proc.stderr or b"").decode("utf-8", errors="ignore")[-500:]
            raise RuntimeError(f"ffmpeg transcode failed (code {proc.returncode}): {err}")
        tmp.replace(dest)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def ensure_playable_path(source: Path, file_id: int, mtime: float) -> Path:
    """
    Return a path suitable for HTML5 <video> playback.

    Uses the original when codecs look browser-friendly; otherwise returns a
    cached H.264/AAC MP4 (creating it on first request).
    """
    if is_browser_friendly(source):
        return source

    cached = play_cache_path(file_id, mtime)
    if cached.exists() and cached.stat().st_size > 0:
        return cached

    _transcode_to_mp4(source, cached)
    return cached
