interface Props {
  selectedIds: number[];
  onClear: () => void;
  totalCount?: number;
  visibleCount?: number;
  onSelectAll?: () => void;
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
}: Props) {
  const total = totalCount ?? 0;

  if (selectedIds.length === 0) {
    if (!onSelectAll || total === 0) {
      return null;
    }
    return (
      <div className="bulk-event-bar">
        <button type="button" className="link-btn" onClick={onSelectAll}>
          {selectAllLabel(total, visibleCount)}
        </button>
      </div>
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
