import sqlite3

from app.config import BLUR_THRESHOLD_DEFAULT

OUTLIER_P10_RATIO = 0.22
MIN_SCORED_FOR_OUTLIER = 10


def parse_blur_threshold(cfg: dict[str, str]) -> float:
    try:
        return float(cfg.get("blur_threshold", str(BLUR_THRESHOLD_DEFAULT)))
    except (TypeError, ValueError):
        return float(BLUR_THRESHOLD_DEFAULT)


def location_p10_blur_score(conn: sqlite3.Connection, location: str | None) -> float | None:
    clauses = ["blur_score IS NOT NULL"]
    params: list = []
    if location in ("inbox", "archive"):
        clauses.append("location = ?")
        params.append(location)
    rows = conn.execute(
        f"SELECT blur_score FROM files WHERE {' AND '.join(clauses)} ORDER BY blur_score",
        params,
    ).fetchall()
    if len(rows) < MIN_SCORED_FOR_OUTLIER:
        return None
    index = max(0, int(len(rows) * 0.1) - 1)
    return float(rows[index][0])


def outlier_cutoff(p10: float | None) -> float | None:
    if p10 is None:
        return None
    return p10 * OUTLIER_P10_RATIO


def is_blurry_score(
    score: float | None,
    threshold: float,
    p10: float | None,
) -> bool:
    if score is None:
        return False
    if score < threshold:
        return True
    cutoff = outlier_cutoff(p10)
    return cutoff is not None and score < cutoff


def blurry_sql_clause(threshold: float, p10: float | None) -> tuple[str, list]:
    cutoff = outlier_cutoff(p10)
    if cutoff is not None:
        return (
            "f.blur_score IS NOT NULL AND (f.blur_score < ? OR f.blur_score < ?)",
            [threshold, cutoff],
        )
    return ("f.blur_score IS NOT NULL AND f.blur_score < ?", [threshold])
