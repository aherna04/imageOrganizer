from typing import Literal

from app.config import VIDEO_EXTENSIONS


def _video_extension_match(column: str) -> tuple[str, list]:
    parts = [f"lower({column}) LIKE ?" for _ in VIDEO_EXTENSIONS]
    params = [f"%{ext}" for ext in VIDEO_EXTENSIONS]
    return f"({' OR '.join(parts)})", params


def filename_media_type_condition(
    column: str, media_type: Literal["image", "video"]
) -> tuple[str, list]:
    video_sql, video_params = _video_extension_match(column)
    if media_type == "video":
        return video_sql, video_params
    return f"NOT ({video_sql})", video_params


def filename_media_type_condition_literal(
    column: str, media_type: Literal["image", "video"]
) -> str:
    parts = [f"lower({column}) LIKE '%{ext}'" for ext in VIDEO_EXTENSIONS]
    video_sql = f"({' OR '.join(parts)})"
    if media_type == "video":
        return video_sql
    return f"NOT ({video_sql})"


def append_media_type_filter(
    clauses: list[str],
    params: list,
    column: str,
    media_type: Literal["image", "video"] | None,
) -> None:
    if not media_type:
        return
    sql, media_params = filename_media_type_condition(column, media_type)
    clauses.append(sql)
    params.extend(media_params)
