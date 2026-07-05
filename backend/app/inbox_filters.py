"""SQL helpers for inbox file visibility."""

PENDING_DELETE_EXCLUSION = """
id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0 AND action = 'delete'
)
"""

PENDING_DELETE_EXCLUSION_F = """
f.id NOT IN (
    SELECT file_id FROM review_decisions
    WHERE applied = 0 AND action = 'delete'
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
    sql = PENDING_DELETE_EXCLUSION_F if alias == "f" else PENDING_DELETE_EXCLUSION
    clauses.append(sql.strip())


def append_inbox_pending_delete_filter(clauses: list[str], *, alias: str = "f") -> None:
    sql = PENDING_DELETE_INCLUSION_F if alias == "f" else PENDING_DELETE_INCLUSION
    clauses.append(sql.strip())
