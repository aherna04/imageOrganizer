import re
from datetime import date

# IMG_20150717_102502, IMG-20150717, etc.
_IMG_DATE = re.compile(r"IMG[_-]?(\d{4})(\d{2})(\d{2})", re.IGNORECASE)

# 20150829_151105 or embedded YYYYMMDD_HHMMSS
_YYYYMMDD_TIME = re.compile(r"(?<![0-9])(\d{4})(\d{2})(\d{2})[_-]\d{6}")

# Screenshot_2014-11-27-10-00-23
_SCREENSHOT_DATE = re.compile(
    r"Screenshot[_-](\d{4})-(\d{2})-(\d{2})",
    re.IGNORECASE,
)

# Embedded YYYY-MM-DD (not at stem prefix — skip organize prefix like 2016-11-18_0006_)
_ISO_DATE = re.compile(r"(?<![0-9])(\d{4})-(\d{2})-(\d{2})(?![0-9])")

_ORGANIZE_PREFIX = re.compile(r"^(\d{4})-(\d{2})-(\d{2})_")


def _valid_date(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _parse_iso_groups(m: re.Match) -> date | None:
    return _valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def parse_date_from_filename(name: str) -> date | None:
    """Best-effort date from embedded filename patterns."""
    stem = name.rsplit(".", 1)[0] if "." in name else name

    m = _IMG_DATE.search(stem)
    if m:
        parsed = _parse_iso_groups(m)
        if parsed:
            return parsed

    m = _SCREENSHOT_DATE.search(stem)
    if m:
        parsed = _parse_iso_groups(m)
        if parsed:
            return parsed

    for m in _YYYYMMDD_TIME.finditer(stem):
        parsed = _parse_iso_groups(m)
        if parsed:
            return parsed

    prefix_end = 0
    prefix_match = _ORGANIZE_PREFIX.match(stem)
    if prefix_match:
        prefix_end = prefix_match.end()

    for m in _ISO_DATE.finditer(stem):
        if m.start() < prefix_end:
            continue
        parsed = _parse_iso_groups(m)
        if parsed:
            return parsed

    return None


def dates_mismatch(organize_date: date, filename: str) -> tuple[bool, date | None]:
    filename_date = parse_date_from_filename(filename)
    if filename_date is None:
        return False, None
    return filename_date != organize_date, filename_date
