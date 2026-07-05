#!/usr/bin/env python3
"""Build docs/DEVELOPMENT_BOOK.md from Cursor plan files."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PLANS_DIR = Path.home() / ".cursor" / "plans"
OUTPUT_PATH = REPO_ROOT / "docs" / "DEVELOPMENT_BOOK.md"
VERSION = "2026.07.05"

SKIP_PLANS = {
    "calendar_tag_wrapping_a49a3fe3",
    "sidebar_version_badge_1af78eec",
}

SKIP_NOTES = {
    "calendar_tag_wrapping_a49a3fe3": "Superseded by `calendar_tag_wrapping_efb8630a`.",
    "sidebar_version_badge_1af78eec": "Duplicate of `sidebar_version_badge_5858cb14`.",
}

PARTS: list[tuple[str, list[str]]] = [
    (
        "Part I — Foundation",
        [
            "image_organizer_web_app_bc41c7ac",
            "architecture_design_doc_776a0f34",
            "initial_github_push_1b0d0391",
            "finish_github_push_c7f54f8d",
            "video_support_0b82a579",
            "tags_and_people_6addf7d4",
        ],
    ),
    (
        "Part II — Calendar",
        [
            "calendar_browse_vs_focus_8133a850",
            "fix_browse_calendar_stretch_80097ed3",
            "calendar_layout_optimization_18ab786b",
            "fix_calendar_layout_16ad08f7",
            "skip_empty_calendar_months_276cd804",
            "calendar_tag_wrapping_efb8630a",
            "event_calendar_deeplink_1d75d191",
            "edit_event_title_ca9ac782",
            "calendar_media_type_filter_6c5b28cd",
        ],
    ),
    (
        "Part III — Inbox and Review",
        [
            "inbox_multi-select_events_a5836287",
            "inbox_unlabeled_filter_b0d4e889",
            "inbox_used_tags_filter_d2735239",
            "inbox_tag_search_335a335b",
            "advance_after_mark_delete_21495b74",
            "inbox_delete_queue_view_8263774f",
            "remove_apply_alert_popup_f9dab895",
            "inbox_camera_filters_0b922a66",
            "cameras_nav_page_fc237a2c",
            "fix_stale_review_preview_65e13868",
        ],
    ),
    (
        "Part IV — Labels and Photo UX",
        [
            "photo_tags_feature_3e1b8419",
            "removable_grid_labels_facf8ad6",
            "bulk_chip_label_editors_b1f293a0",
            "people_bulk_and_crud_62fcfe97",
            "people_name_browse_links_d3cd5960",
            "detail_multi-tag_select_563c4a38",
            "split_select_vs_detail_7571533e",
            "fix_thumbnail_orientation_7aa5b991",
        ],
    ),
    (
        "Part V — Dates and Alerts",
        [
            "filename_date_mismatch_52b14ac0",
            "browser_date_correction_23b40531",
            "photo_grid_alerts_8cbb2c34",
            "photo_keyboard_navigation_001fe474",
        ],
    ),
    (
        "Part VI — Dedupe and Integrity",
        [
            "duplicate_keeper_defaults_16c17f11",
            "fix_tag_counts_after_dedupe_09aa98e2",
            "fix_orphan_tag_counts_565594c4",
        ],
    ),
    (
        "Part VII — Release and Meta",
        [
            "version_and_changelog_ce4b878b",
            "sidebar_version_badge_5858cb14",
            "save_plans_gitignore_a6a3c2eb",
            "plans_development_book_11a2f88a",
        ],
    ),
]

CHAPTER_ORDER = [stem for _, stems in PARTS for stem in stems]


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text.strip("-")


def parse_frontmatter(content: str) -> tuple[dict[str, str], str]:
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    raw_yaml = parts[1]
    body = parts[2].lstrip("\n")
    meta: dict[str, str] = {}
    for line in raw_yaml.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key in ("name", "overview"):
            meta[key] = value
    return meta, body


def strip_leading_title(body: str, name: str) -> str:
    lines = body.splitlines()
    if not lines:
        return body
    first = lines[0].strip()
    if first.startswith("# ") and name.lower() in first.lower():
        return "\n".join(lines[1:]).lstrip("\n")
    return body


def load_plan(plans_dir: Path, stem: str) -> tuple[dict[str, str], str]:
    path = plans_dir / f"{stem}.plan.md"
    if not path.exists():
        raise FileNotFoundError(path)
    content = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(content)
    name = meta.get("name") or stem.replace("_", " ")
    body = strip_leading_title(body, name)
    return meta, body


def build_book(plans_dir: Path) -> str:
    available = {p.stem.replace(".plan", "") for p in plans_dir.glob("*.plan.md")}
    ordered_set = set(CHAPTER_ORDER)
    missing = [stem for stem in CHAPTER_ORDER if stem not in available]
    if missing:
        print("Warning: missing plan files:", ", ".join(missing), file=sys.stderr)

    appendix = sorted(available - ordered_set - SKIP_PLANS)
    if appendix:
        print("Warning: unlisted plans appended to appendix:", ", ".join(appendix), file=sys.stderr)

    lines: list[str] = [
        "# Image Organizer — Development Book",
        "",
        f"*Release {VERSION} · collected Cursor implementation plans*",
        "",
        "Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [CHANGELOG.md](../CHANGELOG.md)",
        "",
        "## Introduction",
        "",
        "This book collects the Cursor agent implementation plans written while building Image Organizer. "
        "Each chapter records design intent, scope, and verification steps for a feature or fix. "
        "It is a development history — not end-user documentation. For current system design, see "
        "[ARCHITECTURE.md](ARCHITECTURE.md). For shipped changes by release, see [CHANGELOG.md](../CHANGELOG.md).",
        "",
        "## Table of Contents",
        "",
    ]

    chapter_num = 0
    toc_entries: list[tuple[int, str, str]] = []

    for part_title, stems in PARTS:
        lines.append(f"### {part_title}")
        lines.append("")
        for stem in stems:
            if stem in SKIP_PLANS or stem not in available:
                continue
            chapter_num += 1
            meta, _ = load_plan(plans_dir, stem)
            name = meta.get("name") or stem
            anchor = f"chapter-{chapter_num}-{slugify(name)}"
            toc_entries.append((chapter_num, anchor, name))
            lines.append(f"{chapter_num}. [{name}](#{anchor})")
        lines.append("")

    if appendix:
        lines.append("### Appendix — Unlisted Plans")
        lines.append("")
        for stem in appendix:
            chapter_num += 1
            meta, _ = load_plan(plans_dir, stem)
            name = meta.get("name") or stem
            anchor = f"chapter-{chapter_num}-{slugify(name)}"
            toc_entries.append((chapter_num, anchor, name))
            lines.append(f"{chapter_num}. [{name}](#{anchor})")
        lines.append("")

    if SKIP_PLANS & available:
        lines.append("### Skipped Duplicates")
        lines.append("")
        for stem in sorted(SKIP_PLANS & available):
            note = SKIP_NOTES.get(stem, "Duplicate or superseded plan.")
            lines.append(f"- `{stem}` — {note}")
        lines.append("")

    lines.append("---")
    lines.append("")

    chapter_num = 0
    for part_title, stems in PARTS:
        lines.append(f"# {part_title}")
        lines.append("")
        for stem in stems:
            if stem in SKIP_PLANS or stem not in available:
                continue
            chapter_num += 1
            meta, body = load_plan(plans_dir, stem)
            name = meta.get("name") or stem
            overview = meta.get("overview", "")
            anchor = f"chapter-{chapter_num}-{slugify(name)}"
            lines.append(f"<a id=\"{anchor}\"></a>")
            lines.append("")
            lines.append(f"## Chapter {chapter_num}: {name}")
            lines.append("")
            if overview:
                lines.append(f"> **Overview:** {overview}")
                lines.append("")
            lines.append(body.rstrip())
            lines.append("")
            lines.append("---")
            lines.append("")

    for stem in appendix:
        chapter_num += 1
        meta, body = load_plan(plans_dir, stem)
        name = meta.get("name") or stem
        overview = meta.get("overview", "")
        anchor = f"chapter-{chapter_num}-{slugify(name)}"
        lines.append(f"<a id=\"{anchor}\"></a>")
        lines.append("")
        lines.append(f"## Chapter {chapter_num}: {name}")
        lines.append("")
        if overview:
            lines.append(f"> **Overview:** {overview}")
            lines.append("")
        lines.append(body.rstrip())
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build docs/DEVELOPMENT_BOOK.md from Cursor plans.")
    parser.add_argument(
        "--plans-dir",
        type=Path,
        default=DEFAULT_PLANS_DIR,
        help=f"Directory containing *.plan.md files (default: {DEFAULT_PLANS_DIR})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output markdown path (default: {OUTPUT_PATH})",
    )
    args = parser.parse_args()

    if not args.plans_dir.is_dir():
        print(f"Error: plans directory not found: {args.plans_dir}", file=sys.stderr)
        return 1

    available = list(args.plans_dir.glob("*.plan.md"))
    included = sum(1 for stem in CHAPTER_ORDER if (args.plans_dir / f"{stem}.plan.md").exists() and stem not in SKIP_PLANS)
    skipped = sum(1 for stem in SKIP_PLANS if (args.plans_dir / f"{stem}.plan.md").exists())

    book = build_book(args.plans_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(book, encoding="utf-8")

    print(f"Wrote {args.output}")
    print(f"  Plans found: {len(available)}")
    print(f"  Chapters included: {included}")
    print(f"  Skipped duplicates: {skipped}")
    print(f"  Lines: {book.count(chr(10)) + 1}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
