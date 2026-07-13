# Changelog

Version format: `YYYY.MM.DD`; same-day releases append `a`–`z`.

## [Unreleased]

## [2026.07.12a] - 2026-07-12

### Added

- Calendar **year filter photo grid** — selecting a year-level label chip (tag, person, event, or Untagged) replaces the month grid with a paginated photo grid for that year
- `GET /api/files?capture_year=` — list files by capture year (`capture_day LIKE 'YYYY%'`; mutually exclusive with `capture_day`)
- Calendar **URL query sync** for year filters (`tag_id`, `person_id`, `event_id`, `unlabeled=1`) — bookmarkable; browser Back restores the month grid

### Changed

- Year label bar lives on the Calendar page; browse toggles between month grid and year photo grid via internal `months` / `yearPhotos` view

## [2026.07.12] - 2026-07-12

### Added

- Calendar **year selector** — filter the month grid to one year (defaults to latest year with photos; **All years** restores full browse)
- Calendar **year-level label bar** — when a single year is selected, shows aggregated events, people, and tags for that year as a global filter across all month grids (`GET /api/calendar/year-labels`)

### Changed

- Year label filter and per-month chip filters are mutually exclusive; day panel respects the active year or month filter

## [2026.07.11e] - 2026-07-11

### Added

- **Mosaic** page — build a photomosaic from a source photo and a tile pool filtered by tag, person, event, or all archive/inbox photos (`POST /api/mosaic/preview`, `POST /api/mosaic/generate`)
- **Create mosaic** in photo detail navigates to Mosaic with the current image as source
- Trash **Prev/Next** pagination (100 photos per page) when trash holds more than 100 items

### Fixed

- Browse photo detail no longer bounces back after **Create mosaic**
- Calendar **Untagged** filter — checkbox selection no longer resets on re-render; photos stay in the day panel while tagging a multi-select batch
- Calendar day tag search panel no longer expands the left column when many tags are selected

### Changed

- Shared **sticky controls** (`.page-sticky-controls`) — pagination and action toolbars stay pinned while scrolling on Trash, Blurry, Calendar day panel, and Inbox
- Photo detail header — subtle trash icon for mark delete; **Create mosaic** for images
- Lightbox tag/people overlay — larger chip and search typography

## [2026.07.11d] - 2026-07-11

### Added

- Database backup: datetime-stamped copies in `~/.imageOrganizer/backups/` via Settings or `backend/scripts/backup_database.py`

### Changed

- Calendar day tagging form (date, events, people, tags) moved below month calendars on the left when photos are selected

## [2026.07.11c] - 2026-07-11

### Added

- Calendar global **Untagged** filter in top bar (All / Untagged next to Archive and Media)
- Review queue: Restore button for delete decisions (list, grid bulk, and photo detail)
- Calendar day panel: Prev/Next pagination when a day has more than 100 photos

## [2026.07.11b] - 2026-07-11

### Added

- **Trash** page (`/trash`) — browse photos in `.trash/` after Apply; scan trash to index legacy files; restore to original location (from operations log)
- Blurry image detection — separate sharpness analysis pass (Laplacian variance); dedicated **Blurry** page with inbox/archive/all analyze actions
- Blur score stored per image; configurable threshold in Settings; **Blur** badge on photo grid cards
- Recently used people chips in single and bulk label editors (same behavior as tags)
- Calendar month **Untagged** filter (no tags, people, or events); respects Images/Videos media filter
- Calendar day panel tag search; lightbox **T** overlay for tags and people on full-size preview

### Fixed

- Blur detection missed obvious out-of-focus photos (e.g. motion blur at score 130) when threshold was set too low — add relative outlier rule (below 22% of cohort p10) and raise default threshold to 150
- Settings blur threshold help text was inverted (higher threshold flags more photos, not lower)
- Trash location migration no longer wipes photo tags, people, and event assignments when rebuilding the `files` table (migration now disables FK enforcement during `DROP TABLE files`)
- Lightbox images scale to viewport again (regression from scroll/pan stage wrapper)
- Blurry page photo detail navigation and drawer scroll

### Changed

- Document blur detection workflow in README and ARCHITECTURE
- If you already ran the broken trash migration and Tags/People/Events show 0 photos, restore junction rows from a pre-upgrade `index.db` backup using `backend/scripts/restore_junctions_from_backup.py`
- Photo detail: caption and rating moved below tags, people, and events
- Inbox Untagged filter: tagging in detail advances to next photo without closing the drawer
- Collapsible label sections remember open/closed state (localStorage)

## [2026.07.11a] - 2026-07-11

### Changed

- Inbox compact layout — unified toolbar, inline quick filters, search-first tags, collapsible Events/People sections
- Compact bulk date editor — bulk selection uses the same inline date row as single-select (`Date · N photos · [input] Apply From filename`)
- Inbox sticky controls — toolbar, filters, label editors, and duplicate/date alerts bar stay pinned while scrolling the photo grid; page title and scan header scroll away
- App scroll container — `.main` is the scrollport so sticky positioning works on Inbox and Review

## [2026.07.11] - 2026-07-11

### Fixed

- Inbox scan freezing the UI — mtime fast-path skips re-hashing unchanged files; thumbnails deferred to lazy API generation
- Inbox grid staying stale during scan — incremental refresh every ~2.5s while scan runs

### Changed

- Calendar session cache — month/day/label API responses cached in React Query for the browser session; invalidated on archive scan, apply, and label/date changes
- Scan status isolated in memoized `ScanStatusBanner`; poll interval 1s → 2s (Inbox, Calendar, Cameras)

## [2026.07.10a] - 2026-07-10

### Fixed

- Delete during scan: commit before thumbnail I/O and incremental dedupe commits so **D** returns quickly instead of waiting on SQLite busy timeout
- Double cache invalidation after delete in Inbox (one refetch wave instead of two)
- Duplicate **D** handler when detail drawer open with checkbox selection

### Changed

- Scan status shows **Building duplicate index...** during dedupe phase; **Saving…** hint when delete takes >500ms

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
