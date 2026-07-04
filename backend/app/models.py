from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ConfigOut(BaseModel):
    inbox_path: str
    archive_path: str
    trash_path: str
    date_pattern: str
    rename_pattern: str


class ConfigUpdate(BaseModel):
    inbox_path: str | None = None
    archive_path: str | None = None
    trash_path: str | None = None
    date_pattern: str | None = None
    rename_pattern: str | None = None


class FileOut(BaseModel):
    id: int
    path: str
    filename: str
    location: Literal["inbox", "archive"]
    media_type: Literal["image", "video"] = "image"
    size: int
    capture_date: str | None
    capture_day: str | None
    camera: str | None
    width: int | None
    height: int | None
    sha256: str | None
    phash: str | None
    caption: str | None = None
    rating: int | None = None
    events: list["EventOut"] = []
    people: list["PersonOut"] = []
    tags: list["TagOut"] = []


class FileListOut(BaseModel):
    items: list[FileOut]
    total: int
    page: int
    page_size: int


class MetadataOut(BaseModel):
    capture_date: str | None
    camera: str | None
    lens: str | None
    gps: str | None
    width: int | None
    height: int | None
    size: int
    caption: str | None
    rating: int | None


class MetadataUpdate(BaseModel):
    caption: str | None = None
    rating: int | None = Field(default=None, ge=0, le=5)


class ScanStatusOut(BaseModel):
    running: bool
    scope: str | None
    processed: int
    total: int
    message: str | None


class CalendarDaySummary(BaseModel):
    date: str
    count: int
    cover_file_id: int | None


class CalendarSummaryOut(BaseModel):
    year: int
    month: int
    days: list[CalendarDaySummary]


class CalendarMonthSummary(BaseModel):
    year: int
    month: int
    count: int


class CalendarMonthsOut(BaseModel):
    months: list[CalendarMonthSummary]


class CalendarMonthEventOut(BaseModel):
    id: int
    name: str
    slug: str
    color: str
    photo_count: int


class CalendarMonthEventsOut(BaseModel):
    year: int
    month: int
    events: list[CalendarMonthEventOut]


class EventCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class EventUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    tag_ids: list[int] | None = None


class TagOut(BaseModel):
    id: int
    name: str
    slug: str
    photo_count: int = 0


class TagCreate(BaseModel):
    name: str


class TagUpdate(BaseModel):
    name: str


class TagsUnassignByIds(BaseModel):
    tag_ids: list[int]
    file_ids: list[int]


class TagsMerge(BaseModel):
    source_id: int
    target_id: int


class FileTagsUpdate(BaseModel):
    tag_ids: list[int]


class TagsAssignByIds(BaseModel):
    tag_ids: list[int]
    file_ids: list[int]


class PersonOut(BaseModel):
    id: int
    name: str
    slug: str
    photo_count: int = 0


class PersonCreate(BaseModel):
    name: str


class PersonUpdate(BaseModel):
    name: str


class PeopleUnassignByIds(BaseModel):
    person_ids: list[int]
    file_ids: list[int]


class PeopleMerge(BaseModel):
    source_id: int
    target_id: int


class FilePeopleUpdate(BaseModel):
    person_ids: list[int]


class PeopleAssignByIds(BaseModel):
    person_ids: list[int]
    file_ids: list[int]


class EventOut(BaseModel):
    id: int
    name: str
    slug: str
    color: str
    description: str | None
    start_date: str | None
    end_date: str | None
    photo_count: int = 0
    cover_file_id: int | None = None
    date_span_start: str | None = None
    date_span_end: str | None = None
    tags: list[TagOut] = []


class EventAssignByRange(BaseModel):
    start_date: date
    end_date: date
    location: Literal["archive", "all"] = "archive"


class EventAssignByIds(BaseModel):
    file_ids: list[int]


class FileEventsUpdate(BaseModel):
    event_ids: list[int]


class DuplicateGroupOut(BaseModel):
    id: int
    group_type: Literal["exact", "perceptual"]
    files: list[FileOut]
    keeper_id: int | None


class DuplicateKeeperUpdate(BaseModel):
    keeper_id: int


class OrganizePreviewItem(BaseModel):
    file_id: int
    source_path: str
    target_path: str
    filename: str


class OrganizePreviewOut(BaseModel):
    items: list[OrganizePreviewItem]
    total: int


class ReviewDecisionCreate(BaseModel):
    file_id: int
    action: Literal["keep", "delete", "move", "rename", "skip"]
    target_path: str | None = None


class ReviewDecisionOut(BaseModel):
    id: int
    file_id: int
    action: str
    target_path: str | None
    file: FileOut | None = None


class ReviewQueueOut(BaseModel):
    items: list[ReviewDecisionOut]
    total: int


class ApplyResultOut(BaseModel):
    applied: int
    errors: list[str]


class OperationLogOut(BaseModel):
    id: int
    file_id: int | None
    operation: str
    source_path: str
    target_path: str | None
    created_at: str
