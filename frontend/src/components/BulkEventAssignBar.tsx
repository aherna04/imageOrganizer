interface Props {
  selectedIds: number[];
  onClear: () => void;
  totalCount?: number;
  onSelectAll?: () => void;
}

export default function BulkEventAssignBar({
  selectedIds,
  onClear,
  totalCount,
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
          Select all {total}
        </button>
      </div>
    );
  }

  return (
    <div className="bulk-event-bar">
      <span className="bulk-event-bar-count">{selectedIds.length} selected</span>

      {onSelectAll && totalCount !== undefined && totalCount > selectedIds.length && (
        <button type="button" className="link-btn" onClick={onSelectAll}>
          Select all {totalCount}
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
