# Changelog

Version format: `YYYY.MM.DD`; same-day releases append `a`–`z`.

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
