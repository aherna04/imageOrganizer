# Image Organizer

**Version:** 2026.08.06a — see [CHANGELOG.md](CHANGELOG.md)

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Local web app for organizing photos and videos: inbox landing folder, calendar browse, event labels, people and tags, browse by person/tag/camera (AND intersection), deduplication, blur detection, and safe apply.

## Prerequisites

- **Docker Desktop** (recommended)
- Optional native dev: Python 3.12+, Node 20+

## Quick start

```bash
cd ~/Documents/github/imageOrganizer
cp .env.example .env
docker compose up --build
```

Open **http://localhost:5173**

## Media paths

| Role | Default path |
|------|--------------|
| Inbox | `{MEDIA_ROOT}/inbox/` |
| Archive | `{MEDIA_ROOT}/photos/` |
| Trash | `{MEDIA_ROOT}/.trash/` |
| Catalog | `{MEDIA_ROOT}/.imageOrganizer/` (`index.db`, thumbs, backups) |

Default `MEDIA_ROOT` is `/Users/alex/Media` (Docker: `/media` via `MEDIA_HOST_PATH`).

Override catalog location with `APP_DATA_DIR` (e.g. fast SSD) while keeping media on a large disk. Settings shows the resolved library/catalog paths.

### Migrate to a larger drive

**Native (non-Docker):**

1. **Settings → Copy library to new drive** — enter the new media root, click **Copy and switch**.
2. Wait for copy + verify (progress shown). The original root is left in place as a backup (`LIBRARY_COPIED_TO.txt` marks it).
3. Restart the backend.
4. If you already copied with Finder/`cp -a`, check **Paths already copied — only rewrite catalog and switch**, or run:
   `python backend/scripts/migrate_library.py --from OLD --to NEW --write-bootstrap`

**Docker (two-mount cutover):** the container cannot write to a host path unless it is bind-mounted.

1. Set `BACKUP_MEDIA_HOST_PATH` in `.env` to the new drive folder (see `.env.example`).
2. `docker compose up -d --force-recreate backend` — mounts it at `/media-backup`.
3. Settings shows your **host** destination (`BACKUP_MEDIA_HOST_PATH`) and copies via the container mount **`/media-backup`**. Leave path rewrite unchecked so catalog paths stay `/media/...`.
4. Set `MEDIA_HOST_PATH` to that same host path; keep or set `BACKUP_MEDIA_HOST_PATH` to the old disk if you want an ongoing second copy, then recreate. The new disk is now `/media`.

**Update backup (after cutover):** Settings → **Update backup** incrementally copies new/changed files (and catalog) from live `/media` → `/media-backup`. Skips unchanged files; does not delete extras on the backup; no restart.

Settings shows free space on media/backup mounts and Docker root, warns when Docker disk is low, and blocks copy if the backup mount is missing or too small. Preflight rejects non-mounted destinations (they would fill the container overlay and Docker Desktop disk). Do not enter a host `/Volumes/...` path as the copy target inside Docker — that path is only for `.env`.

Cold migrate CLI alone does not copy files — only rewrites paths in the new catalog. On first start, a legacy `~/.imageOrganizer` catalog is relocated into `{MEDIA_ROOT}/.imageOrganizer` when the co-located path is empty.

## Workflow

1. Drop photos into the **inbox** folder
2. Open **Inbox** → **Scan inbox**
3. Review duplicates, metadata, and events
4. **Review** → **Preview inbox organize** → **Apply changes**
5. Browse organized photos in **Calendar** (year selector, year/month label filters, paginated photo grids when a year chip or month title is selected) or by **Events** (calendar day panel paginates days with 100+ photos)
6. **Browse** — select tags, people, and cameras to narrow with AND intersection; sidebars show co-occurring labels and cameras in the current selection

### Trash and restore

After **Apply**, deleted files move to `.trash/` (not permanent). Open **Trash** in the sidebar to browse them (paginated at 100 per page when trash is large), run **Scan trash** to index files already on disk, and **Restore** single or bulk selections back to their original inbox/archive path.

The Inbox **Delete queue** filter is different: it shows photos *marked* for delete before Apply. On **Review**, use **Restore** to undo delete decisions before Apply without clearing organize/keep items in the queue.

### Find blurry photos (optional)

1. Open **Blurry** in the sidebar
2. Click **Analyze inbox** (or **Analyze archive** / **Analyze all**) — runs separately from scan; progress shows in the header
3. Review flagged photos (purple **Blur** badge on thumbnails)
4. Filter by **All**, **Inbox**, or **Archive**
5. Select photos → **Mark for delete** to queue them on Review (same as Inbox delete flow)
6. Tune sensitivity in **Settings → Quality → Blur detection threshold** (higher = more photos flagged; default 150). Obvious outliers are flagged automatically even when the threshold is low.

### Photomosaic (optional)

1. Open any photo in detail → **Create mosaic**, or go to **Mosaic** in the sidebar
2. On Mosaic, choose tile pool filters (tag, person, event, or all) and grid size
3. **Generate** — output is saved under `{archive}/mosaics/` (e.g. `photos/mosaics/`), indexed as an archive photo, and tagged **mosaic**

### Word Silhouette (optional)

1. Open any photo in detail → **Use in Word Silhouette**, or go to **Word Silhouette** in the sidebar
2. Enter a phrase, pick a font design (or upload a `.ttf`/`.otf`), and choose fill mode: single image, mosaic tiles, or per letter
3. **Generate** — output is saved under `{archive}/word-silhouettes/`, indexed as an archive photo, and tagged **word-silhouette**

## Safety

- No file changes until you click **Apply**
- Deletes move files to `.trash/` (not permanent)
- All operations logged

## Rename / date patterns

Configure in **Settings**:

- Date folders: `/{YYYY}/{MM}/{DD}/`
- Rename: `{YYYY}-{MM}-{DD}_{seq:4}_{original}`
- Blur threshold: **Settings → Quality** (see [Architecture](docs/ARCHITECTURE.md) for how scoring works)

## Native dev (optional)

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
MEDIA_ROOT=/Users/alex/Media APP_DATA_DIR=/Users/alex/Media/.imageOrganizer uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```
