interface Props {
  selectedIds: number[];
  onClear: () => void;
  totalCount?: number;
  visibleCount?: number;
  onSelectAll?: () => void;
  variant?: "card" | "inline";
}

function selectAllLabel(totalCount: number, visibleCount?: number): string {
  if (visibleCount != null && visibleCount < totalCount) {
    return `Select all visible (${visibleCount})`;
  }
  return `Select all ${totalCount}`;
}

export default function BulkEventAssignBar({
  selectedIds,
  onClear,
  totalCount,
  visibleCount,
  onSelectAll,
  variant = "card",
}: Props) {
  const total = totalCount ?? 0;
  const inline = variant === "inline";

  if (selectedIds.length === 0) {
    if (!onSelectAll || total === 0) {
      return null;
    }
    if (inline) {
      return (
        <span className="inbox-toolbar-selection">
          <button type="button" className="link-btn" onClick={onSelectAll}>
            {selectAllLabel(total, visibleCount)}
          </button>
        </span>
      );
    }
    return (
      <div className="bulk-event-bar">
        <button type="button" className="link-btn" onClick={onSelectAll}>
          {selectAllLabel(total, visibleCount)}
        </button>
      </div>
    );
  }

  if (inline) {
    return (
      <span className="inbox-toolbar-selection">
        <span className="inbox-toolbar-selection-count">{selectedIds.length} selected</span>
        {onSelectAll && totalCount !== undefined && totalCount > selectedIds.length && (
          <>
            <span className="inbox-toolbar-divider" aria-hidden>
              ·
            </span>
            <button type="button" className="link-btn" onClick={onSelectAll}>
              {selectAllLabel(totalCount, visibleCount)}
            </button>
          </>
        )}
        <span className="inbox-toolbar-divider" aria-hidden>
          ·
        </span>
        <button type="button" className="link-btn" onClick={onClear}>
          Clear
        </button>
      </span>
    );
  }

  return (
    <div className="bulk-event-bar">
      <span className="bulk-event-bar-count">{selectedIds.length} selected</span>

      {onSelectAll && totalCount !== undefined && totalCount > selectedIds.length && (
        <button type="button" className="link-btn" onClick={onSelectAll}>
          {selectAllLabel(totalCount, visibleCount)}
        </button>
      )}

      <div className="bulk-event-bar-actions">
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
