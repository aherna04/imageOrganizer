---
name: development-book
description: >-
  Add Cursor implementation plans to docs/DEVELOPMENT_BOOK.md for Image Organizer
  using cursor-book. Use when the user asks to add a plan to the book, regenerate
  the development book, collect plans, or update DEVELOPMENT_BOOK.md after completing a feature plan.
---

# Development Book (Image Organizer)

Consolidates Cursor `.plan.md` files into [`docs/DEVELOPMENT_BOOK.md`](../../docs/DEVELOPMENT_BOOK.md) via [cursor-book](https://github.com/aherna04/cursor-book) (`tools/cursor-book/`). Config: [`book.json`](../../book.json) at repo root.

For generic workflow details, see `tools/cursor-book/skills/development-book/SKILL.md`.

## When to run

- User finished implementing a plan and wants it in the book
- User says "add plan to book", "update development book", or "regenerate the book"

## Workflow

```
- [ ] Identify plan stem (filename without .plan.md)
- [ ] Add stem to parts in book.json
- [ ] Sync plan file to .cursor/plans/ (optional)
- [ ] Regenerate the book
- [ ] Verify chapter appears in TOC
```

### 1. Find the plan stem

Plans live in `~/.cursor/plans/` as `{slug}_{hash}.plan.md`.

### 2. Register in book.json

Edit [`book.json`](../../book.json):

- Add stem to the correct `parts[].plans` list
- Use `skip_plans` for duplicates/superseded plans

| Part | Topics |
|------|--------|
| Part I — Foundation | Scaffold, architecture doc, GitHub, video, tags & people |
| Part II — Calendar | Browse/focus, layout, wrapping, deeplinks, media filter |
| Part III — Inbox and Review | Multi-select, filters, delete queue, cameras, review |
| Part IV — Labels and Photo UX | Photo tags, grid labels, bulk editors, detail |
| Part V — Dates and Alerts | Filename dates, date correction, alerts, keyboard nav |
| Part VI — Dedupe and Integrity | Keeper defaults, tag counts, orphan cleanup |
| Part VII — Release and Meta | Version/changelog, sidebar badge, plans archive |

### 3. Regenerate

From repo root:

```bash
python3 scripts/build_development_book.py
```

Update `version` in `book.json` when cutting a release.

### 4. Verify

```bash
grep -n "Plan Name Here" docs/DEVELOPMENT_BOOK.md | head -3
```

## Do not

- Edit `docs/DEVELOPMENT_BOOK.md` by hand — always regenerate
- Commit `.cursor/plans/` (gitignored)

## Submodule

If `tools/cursor-book` is missing:

```bash
git submodule update --init tools/cursor-book
```
