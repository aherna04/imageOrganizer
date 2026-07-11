import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaFile, CalendarDayFilter, CalendarMediaType, api } from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import PhotoDetail from "./PhotoDetail";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { calendarQueryOptions } from "../utils/calendarQueryOptions";
import { togglePhotoSelection } from "../utils/photoSelection";

const PAGE_SIZE = 100;

export interface CalendarDayLabelContext {
  selectedFiles: MediaFile[];
  onDateChange: (keepFileId?: number) => void;
}

interface Props {
  date: string;
  location: string;
  mediaType: CalendarMediaType;
  filter?: CalendarDayFilter;
  onClose: () => void;
  onLabelContextChange?: (ctx: CalendarDayLabelContext | null) => void;
}

export default function CalendarDayPanel({
  date,
  location,
  mediaType,
  filter,
  onClose,
  onLabelContextChange,
}: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const selectionAnchorRef = useRef<number | null>(null);

  const { data, refetch } = useQuery(
    calendarQueryOptions({
      queryKey: ["calendar-day", date, location, filter, mediaType, page],
      queryFn: () => api.calendarDay(date, location, filter, mediaType, page, PAGE_SIZE),
    }),
  );

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
    setDetailFile(null);
    selectionAnchorRef.current = null;
  }, [date, location, filter, mediaType]);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const showPagination = total > PAGE_SIZE;

  const clearSelection = () => {
    setSelectedIds([]);
    setDetailFile(null);
    selectionAnchorRef.current = null;
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    clearSelection();
  };

  const toggleSelect = (id: number, event: React.MouseEvent) => {
    const files = data?.items ?? [];
    const result = togglePhotoSelection(
      files,
      selectedIds,
      id,
      event.shiftKey,
      selectionAnchorRef.current,
    );
    selectionAnchorRef.current = result.anchorIndex;
    setSelectedIds(result.selectedIds);
  };

  const handleLabelsChange = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["calendar-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  }, [qc, refetch]);

  const handleDateChange = useCallback(
    (keepFileId?: number) => {
      const openId = keepFileId ?? detailFile?.id;
      invalidateAfterDateChange(qc);
      refetch().then(({ data: dayData }) => {
        if (!openId) return;
        const still = dayData?.items.find((f) => f.id === openId);
        setDetailFile(still ?? null);
      });
      handleLabelsChange();
    },
    [detailFile?.id, qc, refetch, handleLabelsChange],
  );

  const selectedFiles = useMemo(
    () => data?.items.filter((f) => selectedIds.includes(f.id)) ?? [],
    [data?.items, selectedIds],
  );

  useEffect(() => {
    if (!onLabelContextChange) return;
    if (selectedFiles.length === 0) {
      onLabelContextChange(null);
      return;
    }
    onLabelContextChange({ selectedFiles, onDateChange: handleDateChange });
  }, [selectedFiles, handleDateChange, onLabelContextChange]);

  useEffect(() => {
    return () => onLabelContextChange?.(null);
  }, [onLabelContextChange]);

  return (
    <div className="calendar-day-panel">
      <div className="calendar-day-panel-header-row">
        <h3 className="calendar-day-panel-header">{date}</h3>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {showPagination && (
        <div className="calendar-day-pagination">
          <span className="calendar-day-pagination-label">
            {total} photos · {rangeStart}–{rangeEnd}
          </span>
          <div className="calendar-day-pagination-controls">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Prev
            </button>
            <span className="calendar-day-pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        visibleCount={data?.items.length}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => {
          setSelectedIds([]);
          selectionAnchorRef.current = null;
        }}
      />

      <PhotoGridWithAlerts
        files={data?.items ?? []}
        selectedIds={selectedIds}
        activeDetailId={detailFile?.id}
        onToggleSelect={toggleSelect}
        onOpenDetail={setDetailFile}
        multiSelectMode
        size="large"
        editableLabels
        onLabelsChange={handleLabelsChange}
        onAlertsChange={handleDateChange}
      />
      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={data?.items ?? []}
          onChangeFile={setDetailFile}
          onDateChange={handleDateChange}
          onClose={() => setDetailFile(null)}
        />
      )}
    </div>
  );
}
