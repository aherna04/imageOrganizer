import threading
from pathlib import Path

from app.config import is_video_path
from app.db import get_conn
from app.media_filter import filename_media_type_condition
from app.metadata import compute_blur_score


class BlurAnalysisState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.scope: str | None = None
        self.processed = 0
        self.total = 0
        self.message: str | None = None

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "running": self.running,
                "scope": self.scope,
                "processed": self.processed,
                "total": self.total,
                "message": self.message,
            }

    def start(self, scope: str, total: int) -> None:
        with self.lock:
            self.running = True
            self.scope = scope
            self.processed = 0
            self.total = total
            self.message = f"Analyzing sharpness ({scope})..."

    def tick(self) -> None:
        with self.lock:
            self.processed += 1

    def finish(self, message: str) -> None:
        with self.lock:
            self.running = False
            self.message = message


blur_analysis_state = BlurAnalysisState()


def _image_files_query(scope: str) -> tuple[str, list]:
    clauses: list[str] = ["f.blur_score IS NULL"]
    params: list = []
    image_sql, image_params = filename_media_type_condition("f.filename", "image")
    clauses.append(image_sql)
    params.extend(image_params)
    if scope in ("inbox", "archive"):
        clauses.append("f.location = ?")
        params.append(scope)
    where = "WHERE " + " AND ".join(clauses)
    return where, params


def run_blur_analysis(scope: str) -> None:
    with get_conn() as conn:
        where, params = _image_files_query(scope)
        rows = conn.execute(
            f"SELECT f.id, f.path FROM files f {where} ORDER BY f.id",
            params,
        ).fetchall()

    blur_analysis_state.start(scope, len(rows))
    try:
        for row in rows:
            path = Path(row["path"])
            score = None if is_video_path(path) else compute_blur_score(path)
            with get_conn() as conn:
                conn.execute(
                    "UPDATE files SET blur_score = ?, updated_at = datetime('now') WHERE id = ?",
                    (score, row["id"]),
                )
                conn.commit()
            blur_analysis_state.tick()
        blur_analysis_state.finish(f"Sharpness analysis complete: {len(rows)} images")
    except Exception as exc:
        blur_analysis_state.finish(f"Sharpness analysis failed: {exc}")


def start_blur_analysis_background(scope: str) -> bool:
    from app.scanner import scan_state

    if scan_state.snapshot()["running"]:
        return False
    if blur_analysis_state.snapshot()["running"]:
        return False
    thread = threading.Thread(target=run_blur_analysis, args=(scope,), daemon=True)
    thread.start()
    return True
