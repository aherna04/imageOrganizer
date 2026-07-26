from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import events as events_svc
from app import people as people_svc
from app import tags as tags_svc
from app.config import (
    APP_DATA_DIR,
    MEDIA_ROOT,
    ensure_media_dirs,
    media_type_for_suffix,
    mime_type_for_path,
)
from app.library_migrate import library_move_state, start_library_move_background
from app.db import get_config, get_conn, get_file_events, init_db, row_to_dict, update_config, file_list_order_clause
from app.dedupe import dismiss_duplicate_member, get_duplicate_groups
from app.inbox_filters import (
    NOT_QUEUED_F,
    append_inbox_pending_delete_filter,
    append_inbox_visible_filter,
)
from app.media_filter import append_media_type_filter, filename_media_type_condition_literal
from app.metadata import thumb_cache_path
from app.storage_stats import get_storage_stats
from app.db_backup import create_database_backup, list_database_backups
from app.mosaic import generate_mosaic, preview_mosaic, resolve_mosaic_output_path
from app.models import (
    ApplyResultOut,
    CalendarMonthEventOut,
    CalendarMonthEventsOut,
    CalendarMonthLabelsOut,
    CalendarYearLabelsOut,
    CalendarMonthPersonOut,
    CalendarMonthTagOut,
    CalendarMonthSummary,
    CalendarMonthsOut,
    CalendarSummaryOut,
    CameraOut,
    CamerasOut,
    ConfigOut,
    ConfigUpdate,
    CaptureDatesUpdate,
    CaptureDatesUpdateOut,
    DuplicateGroupOut,
    DuplicateKeeperUpdate,
    EventAssignByIds,
    EventAssignByRange,
    EventCreate,
    EventOut,
    EventUpdate,
    FileEventsUpdate,
    FileListOut,
    FileOut,
    FilePeopleUpdate,
    FileTagsUpdate,
    FixDatesFromFilenameIn,
    FixDatesFromFilenameOut,
    InboxPeopleOut,
    BrowseCooccurringOut,
    InboxCameraOut,
    InboxCamerasOut,
    InboxTagsOut,
    MetadataOut,
    MetadataUpdate,
    OperationLogOut,
    OrganizeFixDatesIn,
    OrganizeFixDatesOut,
    OrganizePreviewOut,
    PreviewInboxIn,
    PeopleAssignByIds,
    PeopleMerge,
    PeopleUnassignByIds,
    PersonCreate,
    PersonOut,
    PersonUpdate,
    LibraryMoveRequest,
    LibraryMoveStatusOut,
    ReviewDecisionCreate,
    ReviewDecisionOut,
    ReviewDecisionsCancel,
    ReviewDecisionsCancelOut,
    ReviewQueueOut,
    ReviewQueueReleaseIn,
    RotateRequest,
    ScanStatusOut,
    BlurAnalysisStatusOut,
    StorageStatsOut,
    DatabaseBackupOut,
    DatabaseBackupListOut,
    MosaicRequest,
    MosaicPreviewOut,
    MosaicGenerateOut,
    TagCreate,
    TagOut,
    TagUpdate,
    TagsAssignByIds,
    TagsMerge,
    TagsUnassignByIds,
    TrashRestoreIn,
    TrashRestoreOut,
)
from app.blur_detect import (
    blurry_sql_clause,
    is_blurry_score,
    location_p10_blur_score,
    parse_blur_threshold,
)
from app.organizer import apply_operations, fix_dates_from_filename, inbox_available_count, preview_organize, queue_inbox_batch
from app.scanner import combined_scan_status, scan_state, start_scan_background
from app.blur_analysis import blur_analysis_state, start_blur_analysis_background
from app.trash_restore import restore_from_trash

app = FastAPI(title="Image Organizer", version="2026.07.26a")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    from app.library_migrate import relocate_legacy_app_data

    msg = relocate_legacy_app_data(MEDIA_ROOT, APP_DATA_DIR)
    if msg:
        print(f"[imageOrganizer] {msg}")
    ensure_media_dirs()
    init_db()


def _tag_out(t: dict) -> TagOut:
    return TagOut(
        id=t["id"],
        name=t["name"],
        slug=t["slug"],
        photo_count=t.get("photo_count", 0),
    )


def _person_out(p: dict) -> PersonOut:
    return PersonOut(
        id=p["id"],
        name=p["name"],
        slug=p["slug"],
        photo_count=p.get("photo_count", 0),
    )


def _event_out(conn, e: dict) -> EventOut:
    tags = tags_svc.get_event_tags(conn, e["id"])
    return EventOut(
        id=e["id"],
        name=e["name"],
        slug=e["slug"],
        color=e["color"],
        description=e.get("description"),
        start_date=e.get("start_date"),
        end_date=e.get("end_date"),
        photo_count=e.get("photo_count", 0),
        cover_file_id=e.get("cover_file_id"),
        date_span_start=e.get("date_span_start"),
        date_span_end=e.get("date_span_end"),
        tags=[_tag_out(t) for t in tags],
    )


def _file_out(conn, row, cfg: dict | None = None) -> FileOut:
    d = dict(row)
    cfg = cfg or get_config(conn)
    evts = get_file_events(conn, d["id"])
    people = people_svc.get_file_people(conn, d["id"])
    tags = tags_svc.get_file_tags(conn, d["id"])
    blur_score = d.get("blur_score")
    threshold = parse_blur_threshold(cfg)
    p10 = location_p10_blur_score(conn, d.get("location"))
    is_blurry = is_blurry_score(blur_score, threshold, p10)
    skip = ("events", "people", "tags", "media_type", "blur_score", "is_blurry")
    fields = {k: d.get(k) for k in FileOut.model_fields if k not in skip}
    return FileOut(
        **fields,
        blur_score=blur_score,
        is_blurry=is_blurry,
        media_type=media_type_for_suffix(Path(d["path"]).suffix),
        events=[_event_out(conn, e) for e in evts],
        people=[_person_out(p) for p in people],
        tags=[_tag_out(t) for t in tags],
    )


@app.get("/api/config", response_model=ConfigOut)
def api_get_config():
    with get_conn() as conn:
        cfg = get_config(conn)
    return ConfigOut(
        **cfg,
        media_root=str(MEDIA_ROOT),
        app_data_dir=str(APP_DATA_DIR),
    )


@app.patch("/api/config", response_model=ConfigOut)
def api_update_config(body: ConfigUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    with get_conn() as conn:
        cfg = update_config(conn, updates)
    ensure_media_dirs()
    return ConfigOut(
        **cfg,
        media_root=str(MEDIA_ROOT),
        app_data_dir=str(APP_DATA_DIR),
    )


@app.post("/api/library/move", response_model=LibraryMoveStatusOut)
def api_library_move(body: LibraryMoveRequest):
    from app.blur_analysis import blur_analysis_state
    from app.dedupe import dedupe_state
    from app.scanner import scan_state

    if scan_state.snapshot()["running"]:
        raise HTTPException(409, "Scan already running")
    if blur_analysis_state.snapshot()["running"]:
        raise HTTPException(409, "Sharpness analysis already running")
    if dedupe_state.snapshot()["running"]:
        raise HTTPException(409, "Duplicate index rebuild already running")
    if library_move_state.snapshot()["running"]:
        raise HTTPException(409, "Library move already running")

    new_root = Path(body.new_media_root).expanduser()
    if not start_library_move_background(MEDIA_ROOT, new_root):
        raise HTTPException(409, "Library move already running")
    return LibraryMoveStatusOut(**library_move_state.snapshot())


@app.get("/api/library/move/status", response_model=LibraryMoveStatusOut)
def api_library_move_status():
    return LibraryMoveStatusOut(**library_move_state.snapshot())


@app.get("/api/storage/stats", response_model=StorageStatsOut)
def api_storage_stats():
    with get_conn() as conn:
        return StorageStatsOut(**get_storage_stats(conn))


@app.post("/api/database/backup", response_model=DatabaseBackupOut)
def api_create_database_backup():
    with get_conn() as conn:
        return DatabaseBackupOut(**create_database_backup(conn))


@app.get("/api/database/backups", response_model=DatabaseBackupListOut)
def api_list_database_backups():
    return DatabaseBackupListOut(items=[DatabaseBackupOut(**item) for item in list_database_backups()])


def _validate_mosaic_request(body: MosaicRequest) -> None:
    if body.filter_type != "all" and body.filter_id is None:
        raise HTTPException(400, f"filter_id required when filter_type is {body.filter_type}")


def _mosaic_source_path(conn, source_file_id: int) -> Path:
    row = conn.execute("SELECT path, filename FROM files WHERE id = ?", (source_file_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Source file not found")
    path = Path(row["path"])
    if not path.exists():
        raise HTTPException(404, "Source file not found on disk")
    from app.config import is_video_path

    if is_video_path(path):
        raise HTTPException(400, "Source must be an image")
    return path


@app.post("/api/mosaic/preview", response_model=MosaicPreviewOut)
def api_mosaic_preview(body: MosaicRequest):
    _validate_mosaic_request(body)
    with get_conn() as conn:
        source_path = _mosaic_source_path(conn, body.source_file_id)
        try:
            result = preview_mosaic(
                conn,
                source_path,
                body.filter_type,
                body.filter_id,
                body.location,
                body.columns,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return MosaicPreviewOut(**result)


@app.post("/api/mosaic/generate", response_model=MosaicGenerateOut)
def api_mosaic_generate(body: MosaicRequest):
    _validate_mosaic_request(body)
    with get_conn() as conn:
        source_path = _mosaic_source_path(conn, body.source_file_id)
        try:
            result = generate_mosaic(
                conn,
                source_path,
                body.filter_type,
                body.filter_id,
                body.location,
                body.columns,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return MosaicGenerateOut(**result)


@app.get("/api/mosaic/output/{filename}")
def api_mosaic_output(filename: str):
    try:
        path = resolve_mosaic_output_path(filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not path.is_file():
        raise HTTPException(404, "Mosaic not found")
    return FileResponse(path, media_type="image/jpeg", filename=filename)


@app.post("/api/scan/inbox")
def api_scan_inbox():
    if blur_analysis_state.snapshot()["running"]:
        raise HTTPException(409, "Sharpness analysis already running")
    if not start_scan_background("inbox"):
        raise HTTPException(409, "Scan already running")
    return {"ok": True}


@app.post("/api/scan/archive")
def api_scan_archive():
    if blur_analysis_state.snapshot()["running"]:
        raise HTTPException(409, "Sharpness analysis already running")
    if not start_scan_background("archive"):
        raise HTTPException(409, "Scan already running")
    return {"ok": True}


@app.post("/api/scan/trash")
def api_scan_trash():
    if blur_analysis_state.snapshot()["running"]:
        raise HTTPException(409, "Sharpness analysis already running")
    if not start_scan_background("trash"):
        raise HTTPException(409, "Scan already running")
    return {"ok": True}


@app.get("/api/scan/status", response_model=ScanStatusOut)
def api_scan_status():
    return ScanStatusOut(**combined_scan_status())


@app.post("/api/blur-analysis/inbox")
def api_blur_analysis_inbox():
    if scan_state.snapshot()["running"]:
        raise HTTPException(409, "Scan already running")
    if not start_blur_analysis_background("inbox"):
        raise HTTPException(409, "Sharpness analysis already running")
    return {"ok": True}


@app.post("/api/blur-analysis/archive")
def api_blur_analysis_archive():
    if scan_state.snapshot()["running"]:
        raise HTTPException(409, "Scan already running")
    if not start_blur_analysis_background("archive"):
        raise HTTPException(409, "Sharpness analysis already running")
    return {"ok": True}


@app.post("/api/blur-analysis/all")
def api_blur_analysis_all():
    if scan_state.snapshot()["running"]:
        raise HTTPException(409, "Scan already running")
    if not start_blur_analysis_background("all"):
        raise HTTPException(409, "Sharpness analysis already running")
    return {"ok": True}


@app.get("/api/blur-analysis/status", response_model=BlurAnalysisStatusOut)
def api_blur_analysis_status():
    return BlurAnalysisStatusOut(**blur_analysis_state.snapshot())


@app.get("/api/inbox/tags", response_model=InboxTagsOut)
def api_inbox_tags():
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT t.id, t.name, t.slug, COUNT(DISTINCT f.id) AS photo_count
            FROM tags t
            JOIN file_tags ft ON ft.tag_id = t.id
            JOIN files f ON f.id = ft.file_id
            WHERE f.location = 'inbox'
              AND {NOT_QUEUED_F.strip()}
            GROUP BY t.id
            ORDER BY t.name
            """
        ).fetchall()
    return InboxTagsOut(
        tags=[
            CalendarMonthTagOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in rows
        ]
    )


@app.get("/api/inbox/people", response_model=InboxPeopleOut)
def api_inbox_people():
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT p.id, p.name, p.slug, COUNT(DISTINCT f.id) AS photo_count
            FROM people p
            JOIN file_people fp ON fp.person_id = p.id
            JOIN files f ON f.id = fp.file_id
            WHERE f.location = 'inbox'
              AND {NOT_QUEUED_F.strip()}
            GROUP BY p.id
            ORDER BY p.name
            """
        ).fetchall()
    return InboxPeopleOut(
        people=[
            CalendarMonthPersonOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in rows
        ]
    )


@app.get("/api/cameras", response_model=CamerasOut)
def api_list_cameras():
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT f.camera AS name,
                   COUNT(*) AS photo_count,
                   SUM(CASE WHEN f.location = 'inbox' THEN 1 ELSE 0 END) AS inbox_count,
                   SUM(CASE WHEN f.location = 'archive' THEN 1 ELSE 0 END) AS archive_count
            FROM files f
            WHERE f.camera IS NOT NULL AND f.camera != ''
              AND (f.location = 'archive'
                   OR (f.location = 'inbox' AND {NOT_QUEUED_F.strip()}))
            GROUP BY f.camera
            ORDER BY f.camera
            """
        ).fetchall()
    return CamerasOut(
        cameras=[
            CameraOut(
                name=r["name"],
                photo_count=r["photo_count"],
                inbox_count=r["inbox_count"],
                archive_count=r["archive_count"],
            )
            for r in rows
        ]
    )


@app.get("/api/inbox/cameras", response_model=InboxCamerasOut)
def api_inbox_cameras():
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT f.camera AS name, COUNT(*) AS photo_count
            FROM files f
            WHERE f.location = 'inbox'
              AND f.camera IS NOT NULL AND f.camera != ''
              AND {NOT_QUEUED_F.strip()}
            GROUP BY f.camera
            ORDER BY f.camera
            """
        ).fetchall()
    return InboxCamerasOut(
        cameras=[
            InboxCameraOut(name=r["name"], photo_count=r["photo_count"])
            for r in rows
        ]
    )


@app.get("/api/files", response_model=FileListOut)
def api_list_files(
    location: str | None = None,
    capture_day: str | None = None,
    capture_year: int | None = None,
    capture_month: str | None = None,
    event_id: int | None = None,
    person_id: list[int] = Query(default=[]),
    tag_id: list[int] = Query(default=[]),
    unlabeled: bool = False,
    pending_delete: bool = False,
    blurry: bool = False,
    camera: list[str] = Query(default=[]),
    media_type: Literal["image", "video"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    if pending_delete and location != "inbox":
        raise HTTPException(status_code=400, detail="pending_delete requires location=inbox")
    if sum(bool(x) for x in (capture_day, capture_year, capture_month)) > 1:
        raise HTTPException(
            status_code=400,
            detail="capture_day, capture_year, and capture_month are mutually exclusive",
        )
    # Direct Python callers (e.g. api_calendar_day) skip FastAPI injection; Query defaults
    # remain Query objects unless coerced.
    if not isinstance(person_id, list):
        person_id = []
    if not isinstance(tag_id, list):
        tag_id = []
    if not isinstance(camera, list):
        camera = []
    tag_ids = list(dict.fromkeys(tag_id))
    person_ids = list(dict.fromkeys(person_id))
    cameras = list(dict.fromkeys(c for c in camera if c))
    clauses: list[str] = []
    params: list = []
    if location:
        clauses.append("f.location = ?")
        params.append(location)
        if pending_delete:
            append_inbox_pending_delete_filter(clauses)
        else:
            append_inbox_visible_filter(clauses, location)
    else:
        # Browse / unscoped lists: active library only, hide queued review decisions
        clauses.append("f.location IN ('inbox', 'archive')")
        clauses.append(NOT_QUEUED_F.strip())
    if capture_day:
        clauses.append("f.capture_day = ?")
        params.append(capture_day)
    if capture_year:
        clauses.append("f.capture_day LIKE ?")
        params.append(f"{capture_year:04d}%")
    if capture_month:
        clauses.append("f.capture_day LIKE ?")
        params.append(f"{capture_month}%")
    if event_id:
        clauses.append("f.id IN (SELECT file_id FROM file_events WHERE event_id = ?)")
        params.append(event_id)
    for pid in person_ids:
        clauses.append("f.id IN (SELECT file_id FROM file_people WHERE person_id = ?)")
        params.append(pid)
    for tid in tag_ids:
        clauses.append("f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)")
        params.append(tid)
    for cam in cameras:
        clauses.append("f.camera = ?")
        params.append(cam)
    if unlabeled:
        clauses.append(_unlabeled_clause("f"))
    with get_conn() as conn:
        cfg = get_config(conn)
        if blurry:
            threshold = parse_blur_threshold(cfg)
            p10 = location_p10_blur_score(
                conn,
                location if location in ("inbox", "archive") else None,
            )
            append_media_type_filter(clauses, params, "f.filename", "image")
            blurry_clause, blurry_params = blurry_sql_clause(threshold, p10)
            clauses.append(blurry_clause)
            params.extend(blurry_params)
        else:
            append_media_type_filter(clauses, params, "f.filename", media_type)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        total = conn.execute(f"SELECT COUNT(*) FROM files f {where}", params).fetchone()[0]
        offset = (page - 1) * page_size
        order = file_list_order_clause(cfg)
        rows = conn.execute(
            f"SELECT f.* FROM files f {where} {order} LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
        items = [_file_out(conn, r, cfg) for r in rows]
    return FileListOut(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/files/{file_id}", response_model=FileOut)
def api_get_file(file_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        cfg = get_config(conn)
        return _file_out(conn, row, cfg)


@app.get("/api/files/{file_id}/thumbnail")
def api_thumbnail(file_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        thumb = thumb_cache_path(file_id, row["mtime"])
        if not thumb.exists():
            from app.metadata import generate_thumbnail

            generate_thumbnail(Path(row["path"]), file_id, row["mtime"])
        if not thumb.exists():
            raise HTTPException(404, "Thumbnail not available")
        return FileResponse(thumb, media_type="image/jpeg")


@app.get("/api/files/{file_id}/original")
def api_file_original(file_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        path = Path(row["path"])
        if not path.exists():
            raise HTTPException(404, "File not found on disk")
        return FileResponse(path, media_type=mime_type_for_path(path), filename=row["filename"])


@app.post("/api/files/{file_id}/rotate", response_model=FileOut)
def api_rotate_file(file_id: int, body: RotateRequest):
    from app.image_rotate import RotateError, rotate_image_file
    from app.metadata import compute_blur_score, compute_phash, compute_sha256

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        path = Path(row["path"])
        if media_type_for_suffix(path.suffix) != "image":
            raise HTTPException(400, "Only images can be rotated")
        if not path.exists():
            raise HTTPException(404, "File not found on disk")
        try:
            width, height = rotate_image_file(path, body.direction)
        except RotateError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Rotate failed: {exc}") from exc

        stat = path.stat()
        sha256 = compute_sha256(path)
        phash = compute_phash(path)
        blur_score = compute_blur_score(path)
        conn.execute(
            """
            UPDATE files SET
                mtime = ?,
                size = ?,
                width = ?,
                height = ?,
                sha256 = ?,
                phash = ?,
                blur_score = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                stat.st_mtime,
                stat.st_size,
                width,
                height,
                sha256,
                phash,
                blur_score,
                file_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        cfg = get_config(conn)
        return _file_out(conn, row, cfg)


@app.get("/api/files/{file_id}/metadata", response_model=MetadataOut)
def api_get_metadata(file_id: int):
    from app.metadata import extract_metadata

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        meta = extract_metadata(Path(row["path"]))
        return MetadataOut(
            capture_date=row["capture_date"],
            camera=row["camera"],
            lens=meta.get("lens"),
            gps=meta.get("gps"),
            width=row["width"],
            height=row["height"],
            size=row["size"],
            caption=row["caption"],
            rating=row["rating"],
        )


@app.patch("/api/files/{file_id}/metadata", response_model=MetadataOut)
def api_update_metadata(file_id: int, body: MetadataUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        updates = body.model_dump(exclude_unset=True)
        if "caption" in updates:
            conn.execute("UPDATE files SET caption = ? WHERE id = ?", (updates["caption"], file_id))
        if "rating" in updates:
            conn.execute("UPDATE files SET rating = ? WHERE id = ?", (updates["rating"], file_id))
        conn.commit()
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        from app.metadata import extract_metadata

        meta = extract_metadata(Path(row["path"]))
        return MetadataOut(
            capture_date=row["capture_date"],
            camera=row["camera"],
            lens=meta.get("lens"),
            gps=meta.get("gps"),
            width=row["width"],
            height=row["height"],
            size=row["size"],
            caption=row["caption"],
            rating=row["rating"],
        )


@app.patch("/api/files/capture-dates", response_model=CaptureDatesUpdateOut)
def api_set_capture_dates(body: CaptureDatesUpdate):
    from datetime import date as date_type

    from app.file_dates import set_capture_dates_bulk

    try:
        parsed = date_type.fromisoformat(body.capture_date)
    except ValueError as exc:
        raise HTTPException(400, "Invalid capture_date; use YYYY-MM-DD") from exc
    if not body.file_ids:
        return CaptureDatesUpdateOut(updated=0)
    with get_conn() as conn:
        updated = set_capture_dates_bulk(conn, body.file_ids, parsed)
    return CaptureDatesUpdateOut(updated=updated)


@app.post("/api/files/fix-dates-from-filename", response_model=FixDatesFromFilenameOut)
def api_fix_dates_from_filename(body: FixDatesFromFilenameIn):
    from app.file_dates import fix_dates_from_filename

    if not body.file_ids:
        return FixDatesFromFilenameOut(fixed=0, skipped=0)
    with get_conn() as conn:
        fixed, skipped, _ = fix_dates_from_filename(conn, body.file_ids)
    return FixDatesFromFilenameOut(fixed=fixed, skipped=skipped)


@app.get("/api/calendar/months", response_model=CalendarMonthsOut)
def api_calendar_months(
    location: str = Query("archive"),
    media_type: Literal["image", "video"] | None = None,
    unlabeled: bool = Query(False),
):
    with get_conn() as conn:
        clauses = ["capture_day IS NOT NULL"]
        params: list = []
        if location == "archive":
            clauses.append("location = 'archive'")
        elif location == "inbox":
            clauses.append("location = 'inbox'")
        if unlabeled:
            clauses.append(_unlabeled_clause(""))
        append_media_type_filter(clauses, params, "filename", media_type)
        where = " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT CAST(substr(capture_day, 1, 4) AS INTEGER) AS year,
                   CAST(substr(capture_day, 6, 2) AS INTEGER) AS month,
                   COUNT(*) AS count
            FROM files
            WHERE {where}
            GROUP BY year, month
            ORDER BY year, month
            """,
            params,
        ).fetchall()
    return CalendarMonthsOut(
        months=[
            CalendarMonthSummary(year=r["year"], month=r["month"], count=r["count"])
            for r in rows
        ]
    )


@app.get("/api/calendar/events", response_model=CalendarMonthEventsOut)
def api_calendar_events(
    year: int,
    month: int = Query(..., ge=1, le=12),
    location: str = Query("archive"),
):
    month_str = f"{year:04d}-{month:02d}"
    with get_conn() as conn:
        clauses = ["f.capture_day LIKE ?"]
        params: list = [f"{month_str}%"]
        if location == "archive":
            clauses.append("f.location = 'archive'")
        elif location == "inbox":
            clauses.append("f.location = 'inbox'")
        where = " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT e.id, e.name, e.slug, e.color, COUNT(fe.file_id) AS photo_count
            FROM events e
            JOIN file_events fe ON fe.event_id = e.id
            JOIN files f ON f.id = fe.file_id
            WHERE {where}
            GROUP BY e.id
            ORDER BY e.name
            """,
            params,
        ).fetchall()
    return CalendarMonthEventsOut(
        year=year,
        month=month,
        events=[
            CalendarMonthEventOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                color=r["color"],
                photo_count=r["photo_count"],
            )
            for r in rows
        ],
    )


def _unlabeled_clause(alias: str = "f") -> str:
    col = f"{alias}.id" if alias else "id"
    return f"""{col} NOT IN (SELECT file_id FROM file_tags)
    AND {col} NOT IN (SELECT file_id FROM file_people)
    AND {col} NOT IN (SELECT file_id FROM file_events)"""


def _month_location_clauses(
    month_str: str,
    location: str,
    media_type: Literal["image", "video"] | None = None,
) -> tuple[list[str], list]:
    clauses = ["f.capture_day LIKE ?"]
    params: list = [f"{month_str}%"]
    if location == "archive":
        clauses.append("f.location = 'archive'")
    elif location == "inbox":
        clauses.append("f.location = 'inbox'")
    append_media_type_filter(clauses, params, "f.filename", media_type)
    return clauses, params


def _year_location_clauses(
    year: int,
    location: str,
    media_type: Literal["image", "video"] | None = None,
) -> tuple[list[str], list]:
    clauses = ["f.capture_day LIKE ?"]
    params: list = [f"{year:04d}%"]
    if location == "archive":
        clauses.append("f.location = 'archive'")
    elif location == "inbox":
        clauses.append("f.location = 'inbox'")
    append_media_type_filter(clauses, params, "f.filename", media_type)
    return clauses, params


def _fetch_calendar_label_rows(
    conn,
    where: str,
    params: list,
) -> tuple[list, list, list, int]:
    event_rows = conn.execute(
        f"""
        SELECT e.id, e.name, e.slug, e.color, COUNT(fe.file_id) AS photo_count
        FROM events e
        JOIN file_events fe ON fe.event_id = e.id
        JOIN files f ON f.id = fe.file_id
        WHERE {where}
        GROUP BY e.id
        ORDER BY e.name
        """,
        params,
    ).fetchall()
    people_rows = conn.execute(
        f"""
        SELECT p.id, p.name, p.slug, COUNT(fp.file_id) AS photo_count
        FROM people p
        JOIN file_people fp ON fp.person_id = p.id
        JOIN files f ON f.id = fp.file_id
        WHERE {where}
        GROUP BY p.id
        ORDER BY p.name
        """,
        params,
    ).fetchall()
    tag_rows = conn.execute(
        f"""
        SELECT t.id, t.name, t.slug, COUNT(ft.file_id) AS photo_count
        FROM tags t
        JOIN file_tags ft ON ft.tag_id = t.id
        JOIN files f ON f.id = ft.file_id
        WHERE {where}
        GROUP BY t.id
        ORDER BY t.name
        """,
        params,
    ).fetchall()
    unlabeled_count = conn.execute(
        f"SELECT COUNT(*) FROM files f WHERE {where} AND {_unlabeled_clause('f')}",
        params,
    ).fetchone()[0]
    return event_rows, people_rows, tag_rows, unlabeled_count


@app.get("/api/calendar/labels", response_model=CalendarMonthLabelsOut)
def api_calendar_labels(
    year: int,
    month: int = Query(..., ge=1, le=12),
    location: str = Query("archive"),
    media_type: Literal["image", "video"] | None = None,
):
    month_str = f"{year:04d}-{month:02d}"
    with get_conn() as conn:
        clauses, params = _month_location_clauses(month_str, location, media_type)
        where = " AND ".join(clauses)
        event_rows, people_rows, tag_rows, unlabeled_count = _fetch_calendar_label_rows(
            conn, where, params
        )
    return CalendarMonthLabelsOut(
        year=year,
        month=month,
        unlabeled_count=unlabeled_count,
        events=[
            CalendarMonthEventOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                color=r["color"],
                photo_count=r["photo_count"],
            )
            for r in event_rows
        ],
        people=[
            CalendarMonthPersonOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in people_rows
        ],
        tags=[
            CalendarMonthTagOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in tag_rows
        ],
    )


@app.get("/api/calendar/year-labels", response_model=CalendarYearLabelsOut)
def api_calendar_year_labels(
    year: int,
    location: str = Query("archive"),
    media_type: Literal["image", "video"] | None = None,
):
    with get_conn() as conn:
        clauses, params = _year_location_clauses(year, location, media_type)
        where = " AND ".join(clauses)
        event_rows, people_rows, tag_rows, unlabeled_count = _fetch_calendar_label_rows(
            conn, where, params
        )
    return CalendarYearLabelsOut(
        year=year,
        unlabeled_count=unlabeled_count,
        events=[
            CalendarMonthEventOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                color=r["color"],
                photo_count=r["photo_count"],
            )
            for r in event_rows
        ],
        people=[
            CalendarMonthPersonOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in people_rows
        ],
        tags=[
            CalendarMonthTagOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in tag_rows
        ],
    )


@app.get("/api/calendar/summary", response_model=CalendarSummaryOut)
def api_calendar_summary(
    year: int,
    month: int = Query(..., ge=1, le=12),
    location: str = Query("archive"),
    event_id: int | None = None,
    person_id: int | None = None,
    tag_id: int | None = None,
    unlabeled: bool = False,
    media_type: Literal["image", "video"] | None = None,
):
    month_str = f"{year:04d}-{month:02d}"
    with get_conn() as conn:
        clauses = ["capture_day LIKE ?"]
        params: list = [f"{month_str}%"]
        if location == "archive":
            clauses.append("location = 'archive'")
        elif location == "inbox":
            clauses.append("location = 'inbox'")
        if event_id:
            clauses.append("id IN (SELECT file_id FROM file_events WHERE event_id = ?)")
            params.append(event_id)
        if person_id:
            clauses.append("id IN (SELECT file_id FROM file_people WHERE person_id = ?)")
            params.append(person_id)
        if tag_id:
            clauses.append("id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)")
            params.append(tag_id)
        if unlabeled:
            clauses.append(_unlabeled_clause(""))
        append_media_type_filter(clauses, params, "filename", media_type)
        cover_media = (
            f" AND {filename_media_type_condition_literal('f2.filename', media_type)}"
            if media_type
            else ""
        )
        where = " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT capture_day AS date,
                   COUNT(*) AS count,
                   (SELECT id FROM files f2
                    WHERE f2.capture_day = files.capture_day
                    {"AND f2.location = 'archive'" if location == "archive" else ""}
                    {"AND f2.location = 'inbox'" if location == "inbox" else ""}
                    {cover_media}
                    ORDER BY f2.capture_date LIMIT 1) AS cover_file_id
            FROM files
            WHERE {where}
            GROUP BY capture_day
            ORDER BY capture_day
            """,
            params,
        ).fetchall()
    from app.models import CalendarDaySummary

    return CalendarSummaryOut(
        year=year,
        month=month,
        days=[CalendarDaySummary(date=r["date"], count=r["count"], cover_file_id=r["cover_file_id"]) for r in rows],
    )


@app.get("/api/calendar/day", response_model=FileListOut)
def api_calendar_day(
    date: str,
    location: str = Query("archive"),
    event_id: int | None = None,
    person_id: int | None = None,
    tag_id: int | None = None,
    unlabeled: bool = False,
    media_type: Literal["image", "video"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    loc = None if location == "all" else location
    return api_list_files(
        location=loc,
        capture_day=date,
        event_id=event_id,
        person_id=[person_id] if person_id is not None else [],
        tag_id=[tag_id] if tag_id is not None else [],
        unlabeled=unlabeled,
        media_type=media_type,
        page=page,
        page_size=page_size,
    )


@app.get("/api/tags", response_model=list[TagOut])
def api_list_tags():
    with get_conn() as conn:
        return [_tag_out(t) for t in tags_svc.list_tags(conn)]


@app.get("/api/tags/cooccurring", response_model=InboxTagsOut)
def api_tags_cooccurring(
    tag_id: list[int] = Query(default=[]),
    location: str | None = None,
    media_type: Literal["image", "video"] | None = None,
):
    """Tags that co-occur on files matching all selected tag_ids (AND), with counts in that set."""
    result = _browse_cooccurring(
        tag_ids=tag_id,
        person_ids=[],
        cameras=[],
        location=location,
        media_type=media_type,
    )
    return InboxTagsOut(tags=result.tags)


@app.get("/api/browse/cooccurring", response_model=BrowseCooccurringOut)
def api_browse_cooccurring(
    tag_id: list[int] = Query(default=[]),
    person_id: list[int] = Query(default=[]),
    camera: list[str] = Query(default=[]),
    location: str | None = None,
    media_type: Literal["image", "video"] | None = None,
):
    """Tags, people, and cameras that co-occur on files matching the current Browse AND filters."""
    return _browse_cooccurring(
        tag_ids=tag_id,
        person_ids=person_id,
        cameras=camera,
        location=location,
        media_type=media_type,
    )


def _browse_cooccurring(
    *,
    tag_ids: list[int],
    person_ids: list[int],
    cameras: list[str],
    location: str | None,
    media_type: Literal["image", "video"] | None,
) -> BrowseCooccurringOut:
    tag_ids = list(dict.fromkeys(tag_ids))
    person_ids = list(dict.fromkeys(person_ids))
    cameras = list(dict.fromkeys(c for c in cameras if c))
    if not tag_ids and not person_ids and not cameras:
        raise HTTPException(
            status_code=400,
            detail="at least one tag_id, person_id, or camera is required",
        )

    clauses: list[str] = []
    params: list = []
    if location:
        clauses.append("f.location = ?")
        params.append(location)
    else:
        clauses.append("f.location IN ('inbox', 'archive')")
        clauses.append(NOT_QUEUED_F.strip())
    for pid in person_ids:
        clauses.append("f.id IN (SELECT file_id FROM file_people WHERE person_id = ?)")
        params.append(pid)
    for tid in tag_ids:
        clauses.append("f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)")
        params.append(tid)
    for cam in cameras:
        clauses.append("f.camera = ?")
        params.append(cam)
    append_media_type_filter(clauses, params, "f.filename", media_type)
    where = ("AND " + " AND ".join(clauses)) if clauses else ""

    with get_conn() as conn:
        if tag_ids:
            tag_placeholders = ",".join("?" * len(tag_ids))
            tag_rows = conn.execute(
                f"""
                SELECT t.id, t.name, t.slug, COUNT(DISTINCT f.id) AS photo_count
                FROM tags t
                JOIN file_tags ft ON ft.tag_id = t.id
                JOIN files f ON f.id = ft.file_id
                WHERE t.id NOT IN ({tag_placeholders})
                  {where}
                GROUP BY t.id
                HAVING photo_count > 0
                ORDER BY photo_count DESC, t.name
                """,
                [*tag_ids, *params],
            ).fetchall()
        else:
            tag_rows = conn.execute(
                f"""
                SELECT t.id, t.name, t.slug, COUNT(DISTINCT f.id) AS photo_count
                FROM tags t
                JOIN file_tags ft ON ft.tag_id = t.id
                JOIN files f ON f.id = ft.file_id
                WHERE 1=1
                  {where}
                GROUP BY t.id
                HAVING photo_count > 0
                ORDER BY photo_count DESC, t.name
                """,
                params,
            ).fetchall()

        if person_ids:
            person_placeholders = ",".join("?" * len(person_ids))
            person_rows = conn.execute(
                f"""
                SELECT p.id, p.name, p.slug, COUNT(DISTINCT f.id) AS photo_count
                FROM people p
                JOIN file_people fp ON fp.person_id = p.id
                JOIN files f ON f.id = fp.file_id
                WHERE p.id NOT IN ({person_placeholders})
                  {where}
                GROUP BY p.id
                HAVING photo_count > 0
                ORDER BY photo_count DESC, p.name
                """,
                [*person_ids, *params],
            ).fetchall()
        else:
            person_rows = conn.execute(
                f"""
                SELECT p.id, p.name, p.slug, COUNT(DISTINCT f.id) AS photo_count
                FROM people p
                JOIN file_people fp ON fp.person_id = p.id
                JOIN files f ON f.id = fp.file_id
                WHERE 1=1
                  {where}
                GROUP BY p.id
                HAVING photo_count > 0
                ORDER BY photo_count DESC, p.name
                """,
                params,
            ).fetchall()

        if cameras:
            camera_placeholders = ",".join("?" * len(cameras))
            camera_rows = conn.execute(
                f"""
                SELECT f.camera AS name, COUNT(*) AS photo_count
                FROM files f
                WHERE f.camera IS NOT NULL AND f.camera != ''
                  AND f.camera NOT IN ({camera_placeholders})
                  {where}
                GROUP BY f.camera
                HAVING photo_count > 0
                ORDER BY photo_count DESC, f.camera
                """,
                [*cameras, *params],
            ).fetchall()
        else:
            camera_rows = conn.execute(
                f"""
                SELECT f.camera AS name, COUNT(*) AS photo_count
                FROM files f
                WHERE f.camera IS NOT NULL AND f.camera != ''
                  {where}
                GROUP BY f.camera
                HAVING photo_count > 0
                ORDER BY photo_count DESC, f.camera
                """,
                params,
            ).fetchall()

    return BrowseCooccurringOut(
        tags=[
            CalendarMonthTagOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in tag_rows
        ],
        people=[
            CalendarMonthPersonOut(
                id=r["id"],
                name=r["name"],
                slug=r["slug"],
                photo_count=r["photo_count"],
            )
            for r in person_rows
        ],
        cameras=[
            InboxCameraOut(name=r["name"], photo_count=r["photo_count"])
            for r in camera_rows
        ],
    )


@app.post("/api/tags", response_model=TagOut)
def api_create_tag(body: TagCreate):
    with get_conn() as conn:
        tag = tags_svc.create_tag(conn, body.name)
        return _tag_out(tag)


@app.patch("/api/files/{file_id}/tags")
def api_set_file_tags(file_id: int, body: FileTagsUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        tags_svc.set_file_tags(conn, file_id, body.tag_ids)
    return {"ok": True}


@app.post("/api/tags/assign-ids")
def api_assign_tag_ids(body: TagsAssignByIds):
    with get_conn() as conn:
        count = tags_svc.assign_tags_by_ids(conn, body.tag_ids, body.file_ids)
    return {"assigned": count}


@app.post("/api/tags/unassign-ids")
def api_unassign_tag_ids(body: TagsUnassignByIds):
    with get_conn() as conn:
        count = tags_svc.remove_tags_by_ids(conn, body.tag_ids, body.file_ids)
    return {"removed": count}


@app.patch("/api/tags/{tag_id}", response_model=TagOut)
def api_update_tag(tag_id: int, body: TagUpdate):
    with get_conn() as conn:
        tag = tags_svc.update_tag(conn, tag_id, body.name)
    if not tag:
        raise HTTPException(404, "Tag not found")
    return _tag_out(tag)


@app.delete("/api/tags/{tag_id}")
def api_delete_tag(tag_id: int):
    with get_conn() as conn:
        if not tags_svc.delete_tag(conn, tag_id):
            raise HTTPException(404, "Tag not found")
    return {"ok": True}


@app.post("/api/tags/merge", response_model=TagOut)
def api_merge_tags(body: TagsMerge):
    with get_conn() as conn:
        tag = tags_svc.merge_tags(conn, body.source_id, body.target_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    return _tag_out(tag)


@app.get("/api/people", response_model=list[PersonOut])
def api_list_people():
    with get_conn() as conn:
        return [_person_out(p) for p in people_svc.list_people(conn)]


@app.post("/api/people", response_model=PersonOut)
def api_create_person(body: PersonCreate):
    with get_conn() as conn:
        person = people_svc.create_person(conn, body.name)
        return _person_out(person)


@app.patch("/api/files/{file_id}/people")
def api_set_file_people(file_id: int, body: FilePeopleUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        people_svc.set_file_people(conn, file_id, body.person_ids)
    return {"ok": True}


@app.post("/api/people/assign-ids")
def api_assign_people_ids(body: PeopleAssignByIds):
    with get_conn() as conn:
        count = people_svc.assign_people_by_ids(conn, body.person_ids, body.file_ids)
    return {"assigned": count}


@app.post("/api/people/unassign-ids")
def api_unassign_people_ids(body: PeopleUnassignByIds):
    with get_conn() as conn:
        count = people_svc.remove_people_by_ids(conn, body.person_ids, body.file_ids)
    return {"removed": count}


@app.patch("/api/people/{person_id}", response_model=PersonOut)
def api_update_person(person_id: int, body: PersonUpdate):
    with get_conn() as conn:
        person = people_svc.update_person(conn, person_id, body.name)
    if not person:
        raise HTTPException(404, "Person not found")
    return _person_out(person)


@app.delete("/api/people/{person_id}")
def api_delete_person(person_id: int):
    with get_conn() as conn:
        if not people_svc.delete_person(conn, person_id):
            raise HTTPException(404, "Person not found")
    return {"ok": True}


@app.post("/api/people/merge", response_model=PersonOut)
def api_merge_people(body: PeopleMerge):
    with get_conn() as conn:
        person = people_svc.merge_people(conn, body.source_id, body.target_id)
    if not person:
        raise HTTPException(404, "Person not found")
    return _person_out(person)


@app.get("/api/events", response_model=list[EventOut])
def api_list_events():
    with get_conn() as conn:
        return [_event_out(conn, e) for e in events_svc.list_events(conn)]


@app.post("/api/events", response_model=EventOut)
def api_create_event(body: EventCreate):
    with get_conn() as conn:
        ev = events_svc.create_event(conn, body.model_dump())
        return _event_out(conn, ev)


@app.get("/api/events/{event_id}", response_model=EventOut)
def api_get_event(event_id: int):
    with get_conn() as conn:
        ev = events_svc.get_event(conn, event_id)
        if not ev:
            raise HTTPException(404, "Event not found")
        return _event_out(conn, ev)


@app.patch("/api/events/{event_id}", response_model=EventOut)
def api_update_event(event_id: int, body: EventUpdate):
    data = body.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    with get_conn() as conn:
        ev = events_svc.update_event(conn, event_id, data)
        if not ev:
            raise HTTPException(404, "Event not found")
        if tag_ids is not None:
            tags_svc.set_event_tags(conn, event_id, tag_ids)
        return _event_out(conn, ev)


@app.delete("/api/events/{event_id}")
def api_delete_event(event_id: int):
    with get_conn() as conn:
        if not events_svc.delete_event(conn, event_id):
            raise HTTPException(404, "Event not found")
    return {"ok": True}


@app.get("/api/events/{event_id}/files", response_model=FileListOut)
def api_event_files(event_id: int, page: int = 1, page_size: int = 50):
    return api_list_files(event_id=event_id, page=page, page_size=page_size)


@app.post("/api/events/{event_id}/files")
def api_assign_event(event_id: int, body: EventAssignByIds | None = None, by_range: EventAssignByRange | None = None):
    with get_conn() as conn:
        if not events_svc.get_event(conn, event_id):
            raise HTTPException(404, "Event not found")
    # Accept either JSON body type via separate endpoints logic
    raise HTTPException(400, "Use /assign-ids or /assign-range")


@app.post("/api/events/{event_id}/assign-ids")
def api_assign_ids(event_id: int, body: EventAssignByIds):
    with get_conn() as conn:
        if not events_svc.get_event(conn, event_id):
            raise HTTPException(404, "Event not found")
        count = events_svc.assign_files_by_ids(conn, event_id, body.file_ids)
    return {"assigned": count}


@app.post("/api/events/{event_id}/assign-range")
def api_assign_range(event_id: int, body: EventAssignByRange):
    with get_conn() as conn:
        if not events_svc.get_event(conn, event_id):
            raise HTTPException(404, "Event not found")
        count = events_svc.assign_files_by_range(
            conn, event_id, body.start_date, body.end_date, body.location
        )
    return {"assigned": count}


@app.delete("/api/events/{event_id}/files/{file_id}")
def api_remove_file_event(event_id: int, file_id: int):
    with get_conn() as conn:
        events_svc.remove_file_from_event(conn, event_id, file_id)
    return {"ok": True}


@app.patch("/api/files/{file_id}/events")
def api_set_file_events(file_id: int, body: FileEventsUpdate):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        events_svc.set_file_events(conn, file_id, body.event_ids)
    return {"ok": True}


@app.get("/api/duplicates", response_model=list[DuplicateGroupOut])
def api_duplicates():
    with get_conn() as conn:
        groups = get_duplicate_groups(conn)
        result = []
        for g in groups:
            files = [_file_out(conn, f) for f in g["files"]]
            result.append(
                DuplicateGroupOut(
                    id=g["id"],
                    group_type=g["group_type"],
                    keeper_id=g["keeper_id"],
                    files=files,
                )
            )
        return result


@app.patch("/api/duplicates/{group_id}/keeper")
def api_set_keeper(group_id: int, body: DuplicateKeeperUpdate):
    with get_conn() as conn:
        conn.execute(
            "UPDATE duplicate_groups SET keeper_id = ? WHERE id = ?",
            (body.keeper_id, group_id),
        )
        conn.commit()
    return {"ok": True}


@app.post("/api/duplicates/{group_id}/dismiss/{file_id}")
def api_dismiss_duplicate(group_id: int, file_id: int):
    with get_conn() as conn:
        try:
            dismiss_duplicate_member(conn, group_id, file_id)
        except ValueError as exc:
            msg = str(exc)
            if msg == "Group not found":
                raise HTTPException(404, msg) from exc
            raise HTTPException(400, msg) from exc
    return {"ok": True, "merged": True}


@app.post("/api/organize/preview", response_model=OrganizePreviewOut)
def api_organize_preview(file_ids: list[int] | None = None):
    with get_conn() as conn:
        inbox_total = inbox_available_count(conn) if not file_ids else None
        items = preview_organize(conn, file_ids, unqueued_only=not file_ids)
    from app.models import OrganizePreviewItem

    return OrganizePreviewOut(
        items=[OrganizePreviewItem(**i) for i in items],
        total=len(items),
        inbox_total=inbox_total,
    )


@app.post("/api/organize/fix-dates", response_model=OrganizeFixDatesOut)
def api_organize_fix_dates(body: OrganizeFixDatesIn):
    with get_conn() as conn:
        file_ids = body.file_ids or None
        fixed, items = fix_dates_from_filename(conn, file_ids)
    from app.models import OrganizePreviewItem

    return OrganizeFixDatesOut(
        fixed=fixed,
        items=[OrganizePreviewItem(**i) for i in items],
        total=len(items),
    )


@app.post("/api/review/decisions", response_model=ReviewDecisionOut)
def api_create_decision(body: ReviewDecisionCreate):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO review_decisions (file_id, action, target_path) VALUES (?, ?, ?)",
            (body.file_id, body.action, body.target_path),
        )
        conn.commit()
        rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM review_decisions WHERE id = ?", (rid,)).fetchone()
    return ReviewDecisionOut(id=row["id"], file_id=row["file_id"], action=row["action"], target_path=row["target_path"])


@app.post("/api/review/decisions/cancel", response_model=ReviewDecisionsCancelOut)
def api_cancel_decisions(body: ReviewDecisionsCancel):
    if not body.file_ids:
        return ReviewDecisionsCancelOut(removed=0)
    placeholders = ",".join("?" * len(body.file_ids))
    with get_conn() as conn:
        cur = conn.execute(
            f"""
            DELETE FROM review_decisions
            WHERE file_id IN ({placeholders})
              AND applied = 0
              AND action = ?
            """,
            (*body.file_ids, body.action),
        )
        conn.commit()
        removed = cur.rowcount
    return ReviewDecisionsCancelOut(removed=removed)


@app.post("/api/review/queue/release", response_model=ReviewDecisionsCancelOut)
def api_release_review_queue(body: ReviewQueueReleaseIn):
    with get_conn() as conn:
        if body.file_ids:
            placeholders = ",".join("?" * len(body.file_ids))
            cur = conn.execute(
                f"""
                DELETE FROM review_decisions
                WHERE applied = 0 AND file_id IN ({placeholders})
                """,
                body.file_ids,
            )
        else:
            cur = conn.execute("DELETE FROM review_decisions WHERE applied = 0")
        conn.commit()
        removed = cur.rowcount
    return ReviewDecisionsCancelOut(removed=removed)


@app.get("/api/review/queue", response_model=ReviewQueueOut)
def api_review_queue():
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT rd.* FROM review_decisions rd
            WHERE rd.applied = 0
            ORDER BY rd.created_at
            """
        ).fetchall()
        items = []
        for row in rows:
            frow = conn.execute("SELECT * FROM files WHERE id = ?", (row["file_id"],)).fetchone()
            file_out = _file_out(conn, frow) if frow else None
            items.append(
                ReviewDecisionOut(
                    id=row["id"],
                    file_id=row["file_id"],
                    action=row["action"],
                    target_path=row["target_path"],
                    file=file_out,
                )
            )
    return ReviewQueueOut(items=items, total=len(items))


@app.post("/api/review/preview-inbox", response_model=OrganizePreviewOut)
def api_preview_inbox_for_review(body: PreviewInboxIn = PreviewInboxIn()):
    with get_conn() as conn:
        file_ids = body.file_ids or None
        items, available = queue_inbox_batch(conn, file_ids, append=body.append)
    from app.models import OrganizePreviewItem

    return OrganizePreviewOut(
        items=[OrganizePreviewItem(**i) for i in items],
        total=len(items),
        inbox_total=available,
    )


@app.post("/api/apply", response_model=ApplyResultOut)
def api_apply():
    with get_conn() as conn:
        applied, errors = apply_operations(conn)
    return ApplyResultOut(applied=applied, errors=errors)


@app.post("/api/trash/restore", response_model=TrashRestoreOut)
def api_trash_restore(body: TrashRestoreIn):
    if not body.file_ids:
        return TrashRestoreOut(restored=0, errors=[])
    with get_conn() as conn:
        restored, errors = restore_from_trash(conn, body.file_ids)
    return TrashRestoreOut(restored=restored, errors=errors)


@app.get("/api/operations", response_model=list[OperationLogOut])
def api_operations(limit: int = 100):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM operations_log ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [OperationLogOut(**dict(r)) for r in rows]


@app.get("/api/health")
def health():
    return {"status": "ok"}
