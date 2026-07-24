"""SQL helpers for inbox file visibility."""

NOT_QUEUED = """
id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0
)
"""

NOT_QUEUED_F = """
f.id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0
)
"""

# Join predicate so catalog photo_counts match Browse (inbox+archive, not queued).
ACTIVE_LIBRARY_FILE_ON = """
f.location IN ('inbox', 'archive')
AND f.id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0
)
"""

PENDING_DELETE_INCLUSION = """
id IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0 AND action = 'delete'
)
"""

PENDING_DELETE_INCLUSION_F = """
f.id IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0 AND action = 'delete'
)
"""


def append_inbox_visible_filter(clauses: list[str], location: str | None, *, alias: str = "f") -> None:
    if location != "inbox":
        return
    sql = NOT_QUEUED_F if alias == "f" else NOT_QUEUED
    clauses.append(sql.strip())


def append_inbox_pending_delete_filter(clauses: list[str], *, alias: str = "f") -> None:
    sql = PENDING_DELETE_INCLUSION_F if alias == "f" else PENDING_DELETE_INCLUSION
    clauses.append(sql.strip())
