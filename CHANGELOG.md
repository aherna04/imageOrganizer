# Changelog

Version format: `YYYY.MM.DD`; same-day releases append `a`–`z`.

## [2026.07.10] - 2026-07-10

### Fixed

- SQLite **database is locked** when marking delete (**D**) during an inbox/archive scan — WAL mode, busy timeout, and per-file scan commits release locks between files

## [2026.07.07] - 2026-07-07

### Added

- Inbox **Submit to review** bar: next 250 / selected batch, link to Review queue; queued files hidden from default Inbox view
- Inbox **D** bulk-delete for checkbox-selected photos
- Review queue **List/Grid** toggle with thumbnail preview; **Return to inbox** releases queue (`POST /api/review/queue/release`)
- Settings **Photo sort order** (newest / oldest first); applies to all file grids and inbox batch order
- `photo_sort_order` config; `file_list_order_clause()` shared sort helper

### Changed

- Inbox batch limit 250; append-safe `preview-inbox` (no longer wipes delete marks)
- Photo detail zoom: arrow keys and **D** stay in zoom; image scales to fit viewport

### Fixed

- Single video playback in detail + zoom (no double audio)
- Zoom overlay scroll/pan and scale-to-fit regressions

## [2026.07.05b] - 2026-07-05

### Added

- Review page: **Review queue** and **Apply changes** pinned at top in a sticky panel
- Review page: collapsible **Organize preview** and **Operations log** sections with scrollable bodies
- Tags page: **Search tags** filter to narrow the tag list

### Changed

- Review **Apply changes** disabled when queue is empty; organize preview collapsed by default when queue has items

## [2026.07.05a] - 2026-07-05

### Added

- **Recently used** tag row in bulk and single-file tag pickers (localStorage MRU, up to 12 tags)
- Browse **Label photos** mode: multi-select with bulk event/tag/people editors (same as Inbox)

### Changed

- Inbox and Calendar: **Shift-click** range selection in photo grid
- Photo detail: **Esc** closes drawer when lightbox is closed (skipped when focus is in caption/rating inputs)

## [2026.07.05] - 2026-07-05

### Added

- Inbox **Delete queue** filter: view photos marked for delete, bulk **Restore**, restore from detail
- `POST /api/review/decisions/cancel`, `GET /api/files?pending_delete=true` for delete queue
- Inbox **Used cameras** filter bar with search; `GET /api/inbox/cameras`
- **Cameras** page in sidebar: all cameras from inbox + archive, search, **Scan archive** to backfill EXIF
- `GET /api/cameras`; browse photos by camera in **Browse** (`/browse/camera/...`)
- Inbox tag search in Used tags bar, tag pickers, and bulk label editors
- Development book at `docs/DEVELOPMENT_BOOK.md` and `scripts/build_development_book.py`

### Changed

- Review **Apply**: inline status instead of blocking alert popup
- Photo detail: **Mark delete** next to filename; **D** marks delete (including full-size lightbox); advances to next photo
- Duplicate detection runs after inbox scan as well as archive scan
- Duplicates page: **Re-scan inbox** button

### Fixed

- Thumbnails respect EXIF orientation (`exif_transpose`); cache version bump regenerates thumbs

## [2026.07.04c] - 2026-07-04

### Added

- Inbox **Used tags** and **Used people** filter bars (no selection): click to filter grid, then select all for bulk labeling
- Inbox **All / Untagged** filter; mark-for-delete hides photos from inbox until Review apply
- Photo date warnings bar: alert count, alerts-only view, bulk fix dates from filename
- Capture date editor on single/bulk selection and in photo detail; keyboard prev/next in detail drawer
- Calendar media filter: all / images / videos on month grid and day panel
- Settings storage stats (catalog, images, videos, database sizes)
- Duplicates: mark-then-confirm delete, file size on cards, default keeper = largest file
- `GET /api/inbox/tags`, `GET /api/inbox/people`, `GET /api/storage/stats`

### Changed

- Photo detail: multi-tag/people/event selection with optimistic picker state; full-size lightbox preview
- Duplicates layout widened; two-column groups on wide screens
- Tags and People pages: names link to browse (Browse buttons removed)
- Tag/person/event counts count only existing files; orphan junction cleanup after dedupe apply
- Review apply refreshes tags, people, browse, and calendar queries

### Fixed

- Tag counts wrong after duplicate merge (source tags cleared; orphan rows cleaned up)
- Thumbnail 500 when `thumb_cache_path` import was missing from `main.py`

## [2026.07.04b] - 2026-07-04

### Added

- Calendar browse mode: all months with photos in a full-width grid; focus mode (day selected) keeps 3-month sidebar + thumbnails
- Calendar month footers show events, people, and tags; filter month grid and day panel by selection
- Event detail date span links to calendar day view
- Select all visible in calendar day panel before any photos are selected
- `GET /api/calendar/labels` endpoint for per-month event/person/tag counts

### Changed

- Calendar day panel Close button returns to browse mode
- Fixed browse calendar last-row month stretch causing oversized day cells

## [2026.07.04a] - 2026-07-04

### Added

- Photo-level tags (separate from event tags): `file_tags` table, Tags page, browse filter, bulk assign
- Removable label chips on photo cards (events, people, tags) with inline editors when one photo is selected
- Bulk chip label editors when 2+ photos are selected (partial/active/inactive toggle states)
- Architecture doc at `docs/ARCHITECTURE.md` and Cursor rule for keeping it updated
- Sidebar version badge from `package.json`

### Changed

- Bulk selection bar slimmed to count / select all / clear; event/people/tag assignment moved to chip panels
- Review apply now refreshes organize preview immediately

## [2026.07.04] - 2026-07-04

### Added

- Inbox scan, duplicate detection, review queue, and safe apply (preview before write; deletes to `.trash/`)
- Calendar browse with multi-month view and expandable day panel
- Events: create, assign by date range or selection, inline title/color edit, generic tags
- People: CRUD, merge, bulk tag/untag on photos, dedicated People page
- Browse page: filter photos by person or tag
- Video support (MP4 and common formats via ffmpeg/ffprobe); playback in detail view
- Settings for date-folder and rename patterns
- Docker Compose stack (FastAPI + React/Vite)
