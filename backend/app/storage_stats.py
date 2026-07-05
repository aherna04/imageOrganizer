import sqlite3
from pathlib import Path

from app.config import DB_PATH, media_type_for_suffix


def _database_size() -> int:
    total = 0
    for suffix in ("", "-wal", "-shm"):
        path = DB_PATH.parent / f"{DB_PATH.name}{suffix}"
        if path.is_file():
            total += path.stat().st_size
    return total


def get_storage_stats(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        "SELECT filename, size FROM files WHERE location = 'archive'"
    ).fetchall()

    catalog_bytes = 0
    images_bytes = 0
    videos_bytes = 0
    image_count = 0
    video_count = 0

    for row in rows:
        size = row["size"]
        catalog_bytes += size
        suffix = Path(row["filename"]).suffix
        if media_type_for_suffix(suffix) == "video":
            videos_bytes += size
            video_count += 1
        else:
            images_bytes += size
            image_count += 1

    return {
        "catalog_bytes": catalog_bytes,
        "catalog_count": len(rows),
        "images_bytes": images_bytes,
        "image_count": image_count,
        "videos_bytes": videos_bytes,
        "video_count": video_count,
        "database_bytes": _database_size(),
    }
