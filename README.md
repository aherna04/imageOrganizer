# Image Organizer

**Version:** 2026.07.05 — see [CHANGELOG.md](CHANGELOG.md)

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Local web app for organizing photos and videos: inbox landing folder, calendar browse, event labels, people and tags, browse by person/tag, deduplication, and safe apply.

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
| Inbox | `/Users/alex/Media/inbox/` |
| Archive | `/Users/alex/Media/photos/` |
| Trash | `/Users/alex/Media/.trash/` |

App data (SQLite, thumbnails): `~/.imageOrganizer/`

## Workflow

1. Drop photos into the **inbox** folder
2. Open **Inbox** → **Scan inbox**
3. Review duplicates, metadata, and events
4. **Review** → **Preview inbox organize** → **Apply changes**
5. Browse organized photos in **Calendar** or by **Events**

## Safety

- No file changes until you click **Apply**
- Deletes move files to `.trash/` (not permanent)
- All operations logged

## Rename / date patterns

Configure in **Settings**:

- Date folders: `/{YYYY}/{MM}/{DD}/`
- Rename: `{YYYY}-{MM}-{DD}_{seq:4}_{original}`

## Native dev (optional)

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
MEDIA_ROOT=/Users/alex/Media APP_DATA_DIR=~/.imageOrganizer uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```
