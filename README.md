# Image Organizer

**Version:** 2026.07.24 — see [CHANGELOG.md](CHANGELOG.md)

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

Override catalog location with `APP_DATA_DIR` (e.g. fast SSD) while keeping media on a large disk. Settings shows the resolved library/catalog paths and can **Move library** to a new root (copy + path rewrite; restart required).

Cold migrate CLI: `python backend/scripts/migrate_library.py --from OLD --to NEW` (see script help). On first start, a legacy `~/.imageOrganizer` catalog is relocated into `{MEDIA_ROOT}/.imageOrganizer` when the co-located path is empty.

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
