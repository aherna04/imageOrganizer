"""Tests for 90° image rotate with EXIF preservation."""

import sqlite3
from pathlib import Path

import piexif
import pytest
from PIL import Image

from app.image_rotate import RotateError, rotate_image_file


def _make_jpeg_with_exif(path: Path, size: tuple[int, int] = (40, 20), orientation: int = 1) -> None:
    img = Image.new("RGB", size, color=(200, 40, 40))
    # Solid corner markers survive JPEG chroma (avoid single-pixel asserts).
    for x in range(6):
        for y in range(6):
            img.putpixel((x, y), (0, 255, 0))
            img.putpixel((size[0] - 1 - x, y), (0, 0, 255))

    zeroth = {
        piexif.ImageIFD.Orientation: orientation,
        piexif.ImageIFD.ImageWidth: size[0],
        piexif.ImageIFD.ImageLength: size[1],
        piexif.ImageIFD.Make: b"TestCam",
        piexif.ImageIFD.Model: b"Model X",
    }
    exif_ifd = {
        piexif.ExifIFD.DateTimeOriginal: b"2008:09:19 19:28:44",
        piexif.ExifIFD.PixelXDimension: size[0],
        piexif.ExifIFD.PixelYDimension: size[1],
    }
    gps_ifd = {
        piexif.GPSIFD.GPSLatitudeRef: b"N",
        piexif.GPSIFD.GPSLatitude: ((37, 1), (0, 1), (0, 1)),
        piexif.GPSIFD.GPSLongitudeRef: b"W",
        piexif.GPSIFD.GPSLongitude: ((122, 1), (0, 1), (0, 1)),
    }
    exif_bytes = piexif.dump({"0th": zeroth, "Exif": exif_ifd, "GPS": gps_ifd})
    img.save(path, "JPEG", quality=95, subsampling=0, exif=exif_bytes)


def _approx_rgb(pixel: tuple[int, ...], expected: tuple[int, int, int], tol: int = 30) -> bool:
    return all(abs(int(a) - b) <= tol for a, b in zip(pixel[:3], expected))


def test_rotate_left_swaps_dimensions_and_preserves_exif(tmp_path: Path):
    path = tmp_path / "photo.jpg"
    _make_jpeg_with_exif(path, size=(40, 20), orientation=1)

    width, height = rotate_image_file(path, "left")
    assert (width, height) == (20, 40)

    with Image.open(path) as img:
        assert img.size == (20, 40)
        # Left (CCW): former top-left green moves toward bottom-left.
        assert _approx_rgb(img.getpixel((2, height - 3)), (0, 255, 0))

    exif = piexif.load(str(path))
    assert exif["0th"][piexif.ImageIFD.Orientation] == 1
    assert exif["Exif"][piexif.ExifIFD.DateTimeOriginal] == b"2008:09:19 19:28:44"
    assert exif["0th"][piexif.ImageIFD.Make] == b"TestCam"
    assert piexif.GPSIFD.GPSLatitudeRef in exif["GPS"]
    assert exif["0th"][piexif.ImageIFD.ImageWidth] == 20
    assert exif["0th"][piexif.ImageIFD.ImageLength] == 40


def test_rotate_right_swaps_dimensions(tmp_path: Path):
    path = tmp_path / "photo.jpg"
    _make_jpeg_with_exif(path, size=(40, 20))

    width, height = rotate_image_file(path, "right")
    assert (width, height) == (20, 40)

    with Image.open(path) as img:
        assert img.size == (20, 40)
        # Right (CW): former top-left green moves toward top-right.
        assert _approx_rgb(img.getpixel((width - 3, 2)), (0, 255, 0))


def test_rotate_rejects_video(tmp_path: Path):
    path = tmp_path / "clip.mp4"
    path.write_bytes(b"not-a-real-video")
    with pytest.raises(RotateError, match="Videos"):
        rotate_image_file(path, "left")


def test_rotate_catalog_fields_match_api_update(tmp_path: Path):
    """Mirror the API's post-rotate DB refresh (hashes + swapped dimensions)."""
    from app.metadata import compute_blur_score, compute_phash, compute_sha256

    path = tmp_path / "shot.jpg"
    _make_jpeg_with_exif(path, size=(40, 20))
    old_mtime = path.stat().st_mtime

    db_path = tmp_path / "index.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL,
            filename TEXT NOT NULL,
            location TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime REAL NOT NULL,
            sha256 TEXT,
            phash TEXT,
            capture_date TEXT,
            capture_day TEXT,
            camera TEXT,
            width INTEGER,
            height INTEGER,
            blur_score REAL,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO files (
            id, path, filename, location, size, mtime, width, height,
            capture_date, capture_day, camera
        ) VALUES (1, ?, 'shot.jpg', 'inbox', ?, ?, 40, 20,
                  '2008-09-19T19:28:44', '2008-09-19', 'TestCam Model X')
        """,
        (str(path), path.stat().st_size, old_mtime),
    )
    conn.commit()

    width, height = rotate_image_file(path, "left")
    stat = path.stat()
    sha256 = compute_sha256(path)
    phash = compute_phash(path)
    blur_score = compute_blur_score(path)
    conn.execute(
        """
        UPDATE files SET
            mtime = ?, size = ?, width = ?, height = ?,
            sha256 = ?, phash = ?, blur_score = ?,
            updated_at = datetime('now')
        WHERE id = 1
        """,
        (stat.st_mtime, stat.st_size, width, height, sha256, phash, blur_score),
    )
    conn.commit()
    row = conn.execute(
        "SELECT width, height, capture_date, camera, mtime, sha256 FROM files WHERE id = 1"
    ).fetchone()
    conn.close()

    assert row[0] == 20
    assert row[1] == 40
    assert row[2] == "2008-09-19T19:28:44"
    assert row[3] == "TestCam Model X"
    assert row[4] >= old_mtime
    assert row[5] == sha256

    exif = piexif.load(str(path))
    assert exif["0th"][piexif.ImageIFD.Orientation] == 1
    assert exif["Exif"][piexif.ExifIFD.DateTimeOriginal] == b"2008:09:19 19:28:44"
