from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import events as events_svc
from app import people as people_svc
from app import tags as tags_svc
from app.config import ensure_media_dirs, media_type_for_suffix, mime_type_for_path
from app.db import get_config, get_conn, get_file_events, init_db, row_to_dict, update_config
from app.dedupe import get_duplicate_groups
from app.metadata import thumb_cache_path
from app.models import (
    ApplyResultOut,
    CalendarMonthEventOut,
    CalendarMonthEventsOut,
    CalendarMonthSummary,
    CalendarMonthsOut,
    CalendarSummaryOut,
    ConfigOut,
    ConfigUpdate,
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
    MetadataOut,
    MetadataUpdate,
    OperationLogOut,
    OrganizePreviewOut,
    PeopleAssignByIds,
    PeopleMerge,
    PeopleUnassignByIds,
    PersonCreate,
    PersonOut,
    PersonUpdate,
    ReviewDecisionCreate,
    ReviewDecisionOut,
    ReviewQueueOut,
    ScanStatusOut,
    TagCreate,
    TagOut,
)
from app.organizer import apply_operations, preview_organize
from app.scanner import scan_state, start_scan_background

app = FastAPI(title="Image Organizer", version="2026.07.04")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
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


def _file_out(conn, row) -> FileOut:
    d = dict(row)
    evts = get_file_events(conn, d["id"])
    people = people_svc.get_file_people(conn, d["id"])
    return FileOut(
        **{k: d[k] for k in FileOut.model_fields if k not in ("events", "people", "media_type")},
        media_type=media_type_for_suffix(Path(d["path"]).suffix),
        events=[_event_out(conn, e) for e in evts],
        people=[_person_out(p) for p in people],
    )


@app.get("/api/config", response_model=ConfigOut)
def api_get_config():
    with get_conn() as conn:
        cfg = get_config(conn)
    return ConfigOut(**cfg)


@app.patch("/api/config", response_model=ConfigOut)
def api_update_config(body: ConfigUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    with get_conn() as conn:
        cfg = update_config(conn, updates)
    ensure_media_dirs()
    return ConfigOut(**cfg)


@app.post("/api/scan/inbox")
def api_scan_inbox():
    if not start_scan_background("inbox"):
        raise HTTPException(409, "Scan already running")
    return {"ok": True}


@app.post("/api/scan/archive")
def api_scan_archive():
    if not start_scan_background("archive"):
        raise HTTPException(409, "Scan already running")
    return {"ok": True}


@app.get("/api/scan/status", response_model=ScanStatusOut)
def api_scan_status():
    return ScanStatusOut(**scan_state.snapshot())


@app.get("/api/files", response_model=FileListOut)
def api_list_files(
    location: str | None = None,
    capture_day: str | None = None,
    event_id: int | None = None,
    person_id: int | None = None,
    tag_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    clauses: list[str] = []
    params: list = []
    if location:
        clauses.append("f.location = ?")
        params.append(location)
    if capture_day:
        clauses.append("f.capture_day = ?")
        params.append(capture_day)
    if event_id:
        clauses.append("f.id IN (SELECT file_id FROM file_events WHERE event_id = ?)")
        params.append(event_id)
    if person_id:
        clauses.append("f.id IN (SELECT file_id FROM file_people WHERE person_id = ?)")
        params.append(person_id)
    if tag_id:
        clauses.append(
            """
            f.id IN (
                SELECT fe.file_id FROM file_events fe
                JOIN event_tags et ON et.event_id = fe.event_id
                WHERE et.tag_id = ?
            )
            """
        )
        params.append(tag_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM files f {where}", params).fetchone()[0]
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"SELECT f.* FROM files f {where} ORDER BY f.capture_date DESC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
        items = [_file_out(conn, r) for r in rows]
    return FileListOut(items=items, total=total, page=page, page_size=page_size)


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


@app.get("/api/calendar/months", response_model=CalendarMonthsOut)
def api_calendar_months(location: str = Query("archive")):
    with get_conn() as conn:
        clauses = ["capture_day IS NOT NULL"]
        params: list = []
        if location == "archive":
            clauses.append("location = 'archive'")
        elif location == "inbox":
            clauses.append("location = 'inbox'")
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


@app.get("/api/calendar/summary", response_model=CalendarSummaryOut)
def api_calendar_summary(
    year: int,
    month: int = Query(..., ge=1, le=12),
    location: str = Query("archive"),
    event_id: int | None = None,
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
        where = " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT capture_day AS date,
                   COUNT(*) AS count,
                   (SELECT id FROM files f2
                    WHERE f2.capture_day = files.capture_day
                    {"AND f2.location = 'archive'" if location == "archive" else ""}
                    {"AND f2.location = 'inbox'" if location == "inbox" else ""}
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
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    loc = None if location == "all" else location
    return api_list_files(location=loc, capture_day=date, event_id=event_id, page=page, page_size=page_size)


@app.get("/api/tags", response_model=list[TagOut])
def api_list_tags():
    with get_conn() as conn:
        return [_tag_out(t) for t in tags_svc.list_tags(conn)]


@app.post("/api/tags", response_model=TagOut)
def api_create_tag(body: TagCreate):
    with get_conn() as conn:
        tag = tags_svc.create_tag(conn, body.name)
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
        files = [
            FileOut(**{k: f[k] for k in FileOut.model_fields if k != "events"}, events=[])
            for f in g["files"]
        ]
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


@app.post("/api/organize/preview", response_model=OrganizePreviewOut)
def api_organize_preview(file_ids: list[int] | None = None):
    with get_conn() as conn:
        items = preview_organize(conn, file_ids)
    from app.models import OrganizePreviewItem

    return OrganizePreviewOut(
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
def api_preview_inbox_for_review():
    with get_conn() as conn:
        conn.execute("DELETE FROM review_decisions WHERE applied = 0")
        items = preview_organize(conn)
        for item in items:
            conn.execute(
                "INSERT INTO review_decisions (file_id, action, target_path) VALUES (?, 'keep', ?)",
                (item["file_id"], item["target_path"]),
            )
        conn.commit()
    from app.models import OrganizePreviewItem

    return OrganizePreviewOut(
        items=[OrganizePreviewItem(**i) for i in items],
        total=len(items),
    )


@app.post("/api/apply", response_model=ApplyResultOut)
def api_apply():
    with get_conn() as conn:
        applied, errors = apply_operations(conn)
    return ApplyResultOut(applied=applied, errors=errors)


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
