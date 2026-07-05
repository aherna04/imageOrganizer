# Changelog

Version format: `YYYY.MM.DD`; same-day releases append `a`–`z`.

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
