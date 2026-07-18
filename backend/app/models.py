from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class ConfigOut(BaseModel):
    inbox_path: str
    archive_path: str
    trash_path: str
    date_pattern: str
    rename_pattern: str
    photo_sort_order: Literal["asc", "desc"] = "desc"
    blur_threshold: str = "150"


class ConfigUpdate(BaseModel):
    inbox_path: str | None = None
    archive_path: str | None = None
    trash_path: str | None = None
    date_pattern: str | None = None
    rename_pattern: str | None = None
    photo_sort_order: Literal["asc", "desc"] | None = None
    blur_threshold: str | None = None


class StorageStatsOut(BaseModel):
    catalog_bytes: int
    catalog_count: int
    images_bytes: int
    image_count: int
    videos_bytes: int
    video_count: int
    database_bytes: int


class DatabaseBackupOut(BaseModel):
    path: str
    filename: str
    size_bytes: int
    created_at: str


class DatabaseBackupListOut(BaseModel):
    items: list[DatabaseBackupOut]


class MosaicRequest(BaseModel):
    source_file_id: int
    filter_type: Literal["all", "tag", "person", "event"] = "all"
    filter_id: int | None = None
    location: Literal["archive", "all"] = "archive"
    columns: int = Field(default=60, ge=10, le=120)


class MosaicPreviewOut(BaseModel):
    tile_count: int
    columns: int
    rows: int
    output_width: int
    output_height: int


class MosaicGenerateOut(BaseModel):
    filename: str
    url: str
    file_id: int
    width: int
    height: int
    tile_count: int
    columns: int
    rows: int


class FileOut(BaseModel):
    id: int
    path: str
    filename: str
    location: Literal["inbox", "archive", "trash"]
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
    blur_score: float | None = None
    is_blurry: bool = False
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


class BlurAnalysisStatusOut(BaseModel):
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


class CalendarMonthPersonOut(BaseModel):
    id: int
    name: str
    slug: str
    photo_count: int


class CalendarMonthTagOut(BaseModel):
    id: int
    name: str
    slug: str
    photo_count: int


class InboxTagsOut(BaseModel):
    tags: list[CalendarMonthTagOut]


class InboxCameraOut(BaseModel):
    name: str
    photo_count: int


class InboxCamerasOut(BaseModel):
    cameras: list[InboxCameraOut]


class BrowseCooccurringOut(BaseModel):
    tags: list[CalendarMonthTagOut]
    people: list[CalendarMonthPersonOut]
    cameras: list[InboxCameraOut]


class InboxPeopleOut(BaseModel):
    people: list[CalendarMonthPersonOut]


class CameraOut(BaseModel):
    name: str
    photo_count: int
    inbox_count: int
    archive_count: int


class CamerasOut(BaseModel):
    cameras: list[CameraOut]


class CalendarMonthLabelsOut(BaseModel):
    year: int
    month: int
    events: list[CalendarMonthEventOut]
    people: list[CalendarMonthPersonOut]
    tags: list[CalendarMonthTagOut]
    unlabeled_count: int = 0


class CalendarYearLabelsOut(BaseModel):
    year: int
    events: list[CalendarMonthEventOut]
    people: list[CalendarMonthPersonOut]
    tags: list[CalendarMonthTagOut]
    unlabeled_count: int = 0


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


class CaptureDatesUpdate(BaseModel):
    file_ids: list[int]
    capture_date: str


class CaptureDatesUpdateOut(BaseModel):
    updated: int


class FixDatesFromFilenameIn(BaseModel):
    file_ids: list[int]


class FixDatesFromFilenameOut(BaseModel):
    fixed: int
    skipped: int


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
    organize_date: str | None = None
    filename_date: str | None = None
    date_mismatch: bool = False
    suggested_target_path: str | None = None
    suggested_filename: str | None = None


class OrganizeFixDatesIn(BaseModel):
    file_ids: list[int] = []


class OrganizeFixDatesOut(BaseModel):
    fixed: int
    items: list[OrganizePreviewItem]
    total: int


class OrganizePreviewOut(BaseModel):
    items: list[OrganizePreviewItem]
    total: int
    inbox_total: int | None = None


class PreviewInboxIn(BaseModel):
    file_ids: list[int] = []
    append: bool = True


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


class ReviewDecisionsCancel(BaseModel):
    file_ids: list[int]
    action: Literal["delete"] = "delete"


class ReviewDecisionsCancelOut(BaseModel):
    removed: int


class ReviewQueueReleaseIn(BaseModel):
    file_ids: list[int] = Field(default_factory=list)


class ApplyResultOut(BaseModel):
    applied: int
    errors: list[str]


class TrashRestoreIn(BaseModel):
    file_ids: list[int] = Field(default_factory=list)


class TrashRestoreOut(BaseModel):
    restored: int
    errors: list[str]


class OperationLogOut(BaseModel):
    id: int
    file_id: int | None
    operation: str
    source_path: str
    target_path: str | None
    created_at: str
