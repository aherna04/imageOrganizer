---
name: development-book
description: >-
  Add Cursor implementation plans to docs/DEVELOPMENT_BOOK.md for Image Organizer.
  Use when the user asks to add a plan to the book, regenerate the development book,
  collect plans, or update DEVELOPMENT_BOOK.md after completing a feature plan.
---

# Development Book

Consolidates Cursor `.plan.md` files into [`docs/DEVELOPMENT_BOOK.md`](../../docs/DEVELOPMENT_BOOK.md). Raw plans stay gitignored in [`.cursor/plans/`](../../.cursor/plans/).

## When to run

- User finished implementing a plan and wants it in the book
- User says "add plan to book", "update development book", or "regenerate the book"
- After creating a new `.plan.md` in `~/.cursor/plans/`

## Workflow

Copy this checklist and track progress:

```
- [ ] Identify plan stem (filename without .plan.md)
- [ ] Add stem to PARTS in scripts/build_development_book.py
- [ ] Sync plan file to .cursor/plans/
- [ ] Regenerate the book
- [ ] Verify chapter appears in TOC
```

### 1. Find the plan stem

Plans live in `~/.cursor/plans/` as `{slug}_{hash}.plan.md`.

Example: `inbox_tag_search_335a335b.plan.md` → stem `inbox_tag_search_335a335b`

Read the plan frontmatter `name:` field to pick the right Part.

### 2. Register in chapter order

Edit [`scripts/build_development_book.py`](../../scripts/build_development_book.py):

- Add the stem to the correct list inside `PARTS` (chronological within the part)
- Do **not** add stems listed in `SKIP_PLANS` (duplicates only)
- If a plan supersedes an older one, add the new stem and optionally note the old one in `SKIP_PLANS` / `SKIP_NOTES`

| Part | Topics |
|------|--------|
| Part I — Foundation | Scaffold, architecture doc, GitHub, video, tags & people |
| Part II — Calendar | Browse/focus, layout, wrapping, deeplinks, media filter |
| Part III — Inbox and Review | Multi-select, filters, used tags/people, tag search, review |
| Part IV — Labels and Photo UX | Photo tags, grid labels, bulk editors, people, detail |
| Part V — Dates and Alerts | Filename dates, date correction, alerts, keyboard nav |
| Part VI — Dedupe and Integrity | Keeper defaults, tag counts, orphan cleanup |
| Part VII — Release and Meta | Version/changelog, sidebar badge, plans archive, this book |

Unlisted plans are appended automatically to an Appendix — prefer adding to `PARTS` explicitly.

### 3. Sync local plan archive

```bash
cp ~/.cursor/plans/{stem}.plan.md .cursor/plans/
```

This directory is gitignored; it is a local mirror only.

### 4. Regenerate

From repo root:

```bash
python3 scripts/build_development_book.py
```

Expect output like: `Chapters included: N`, `Wrote docs/DEVELOPMENT_BOOK.md`.

Optional: update `VERSION` in the script to match [`frontend/package.json`](../../frontend/package.json) when cutting a release.

### 5. Verify

- Grep the book for the plan `name` from frontmatter
- Confirm TOC link and `## Chapter N:` heading exist
- No YAML frontmatter or `todos:` blocks in chapter body

```bash
grep -n "Plan Name Here" docs/DEVELOPMENT_BOOK.md | head -3
```

## Do not

- Edit the source `.plan.md` in `~/.cursor/plans/` (unless the user asks)
- Commit `.cursor/plans/` (gitignored)
- Edit [`docs/DEVELOPMENT_BOOK.md`](../../docs/DEVELOPMENT_BOOK.md) by hand — always regenerate via the script

## Files touched

| File | Change |
|------|--------|
| `scripts/build_development_book.py` | Add stem to `PARTS` |
| `docs/DEVELOPMENT_BOOK.md` | Generated output (commit this) |
| `.cursor/plans/{stem}.plan.md` | Local sync only (ignored) |

## Related docs

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — live system design (not plan history)
- [`CHANGELOG.md`](../../CHANGELOG.md) — shipped changes by release
