"""Tests for browser-safe video playback helpers."""

from pathlib import Path
from unittest.mock import patch

import pytest

from app.video_play import (
    ensure_playable_path,
    is_browser_friendly,
    probe_video_codec,
)


def test_is_browser_friendly_h264_mov():
    path = Path("/media/clip.MOV")
    assert is_browser_friendly(path, codec="h264")
    assert is_browser_friendly(path, codec="avc1")


def test_is_browser_friendly_rejects_mjpeg_mov():
    path = Path("/media/PICT1315.MOV")
    assert not is_browser_friendly(path, codec="mjpeg")


def test_is_browser_friendly_rejects_mkv_even_h264():
    path = Path("/media/clip.mkv")
    assert not is_browser_friendly(path, codec="h264")


def test_is_browser_friendly_webm_vp9():
    assert is_browser_friendly(Path("/media/a.webm"), codec="vp9")


def test_is_browser_friendly_unknown_codec_allows_common_containers():
    assert is_browser_friendly(Path("/media/a.mov"), codec=None)
    assert is_browser_friendly(Path("/media/a.mp4"), codec=None)
    assert not is_browser_friendly(Path("/media/a.avi"), codec=None)


def test_ensure_playable_returns_original_when_friendly(tmp_path: Path):
    src = tmp_path / "ok.mp4"
    src.write_bytes(b"fake")
    with patch("app.video_play.probe_video_codec", return_value="h264"):
        out = ensure_playable_path(src, file_id=42, mtime=1000.0)
    assert out == src


def test_ensure_playable_transcodes_when_hostile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app import video_play as vp

    src = tmp_path / "PICT.MOV"
    src.write_bytes(b"fake-mov")
    play_dir = tmp_path / "video_play"
    play_dir.mkdir()
    monkeypatch.setattr(vp, "VIDEO_PLAY_DIR", play_dir)

    cached = play_dir / "7_1234.mp4"
    # Redirect cache path into tmp by patching play_cache_path
    def _cache(file_id: int, mtime: float) -> Path:
        return play_dir / f"{file_id}_{int(mtime)}.mp4"

    def fake_transcode(source: Path, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"transcoded-mp4")

    with (
        patch("app.video_play.probe_video_codec", return_value="mjpeg"),
        patch("app.video_play.play_cache_path", side_effect=_cache),
        patch("app.video_play._transcode_to_mp4", side_effect=fake_transcode),
    ):
        out = ensure_playable_path(src, file_id=7, mtime=1234.0)

    assert out == play_dir / "7_1234.mp4"
    assert out.read_bytes() == b"transcoded-mp4"

    # Second call uses cache without re-transcode
    with (
        patch("app.video_play.probe_video_codec", return_value="mjpeg"),
        patch("app.video_play.play_cache_path", side_effect=_cache),
        patch("app.video_play._transcode_to_mp4") as transcode,
    ):
        out2 = ensure_playable_path(src, file_id=7, mtime=1234.0)
    assert out2 == out
    transcode.assert_not_called()


def test_probe_video_codec_parses_ffprobe(monkeypatch: pytest.MonkeyPatch):
    payload = b'{"streams":[{"codec_type":"audio","codec_name":"aac"},{"codec_type":"video","codec_name":"mjpeg"}]}'

    class Result:
        stdout = payload.decode()

    monkeypatch.setattr(
        "app.video_play.subprocess.run",
        lambda *a, **k: Result(),
    )
    assert probe_video_codec(Path("/x.mov")) == "mjpeg"
