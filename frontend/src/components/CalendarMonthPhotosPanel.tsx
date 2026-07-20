import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarMediaType,
  CalendarMonthFilter,
  CalendarMonthLabels as CalendarMonthLabelsData,
  MediaFile,
  api,
} from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import BulkLabelEditors from "./BulkLabelEditors";
import CalendarMonthLabels from "./CalendarMonthLabels";
import PhotoDetail from "./PhotoDetail";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { invalidateAfterLabelChange } from "../utils/invalidateAfterLabelChange";
import { monthFilterLabelName, monthFilterToListFilesParams } from "../utils/calendarFilter";
import { togglePhotoSelection } from "../utils/photoSelection";

const PAGE_SIZE = 100;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  year: number;
  month: number;
  filter: CalendarMonthFilter | null;
  location: string;
  mediaType: CalendarMediaType;
  labels: CalendarMonthLabelsData;
  onBack: () => void;
  onSelectFilter: (filter: CalendarMonthFilter | null) => void;
}

export default function CalendarMonthPhotosPanel({
  year,
  month,
  filter,
  location,
  mediaType,
  labels,
  onBack,
  onSelectFilter,
}: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const selectionAnchorRef = useRef<number | null>(null);

  const listParams = monthFilterToListFilesParams(filter, year, month, location, mediaType);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-month-photos", year, month, filter, location, mediaType, page],
    queryFn: () => api.listFiles({ ...listParams, page }),
  });

  const clearSelection = () => {
    setSelectedIds([]);
    setDetailFile(null);
    selectionAnchorRef.current = null;
  };

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [filter, year, month, location, mediaType]);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const showPagination = total > PAGE_SIZE;
  const monthName = `${MONTH_NAMES[month - 1]} ${year}`;
  const title = filter
    ? `${monthFilterLabelName(filter, labels)} · ${total} photos in ${monthName}`
    : `${monthName} · ${total} photos`;

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

  const selectedFiles = useMemo(
    () => data?.items.filter((f) => selectedIds.includes(f.id)) ?? [],
    [data?.items, selectedIds],
  );

  const handleLabelsChange = () => {
    refetch();
    invalidateAfterLabelChange(qc, { calendarFacets: true });
    qc.invalidateQueries({ queryKey: ["calendar-month-photos"] });
  };

  const handleDateChange = () => {
    invalidateAfterDateChange(qc);
    refetch();
    invalidateAfterLabelChange(qc, { calendarFacets: true });
    qc.invalidateQueries({ queryKey: ["calendar-month-photos"] });
  };

  return (
    <div className="calendar-month-photos-panel">
      <div className="page-sticky-controls calendar-photo-grid-sticky">
        <div className="calendar-month-photos-header">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            ← Back to calendar
          </button>
          <h3 className="calendar-month-photos-title">{title}</h3>
        </div>
        <CalendarMonthLabels
          labels={labels}
          activeFilter={filter}
          onSelectFilter={onSelectFilter}
        />
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
          totalCount={total}
          visibleCount={data?.items.length}
          onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
          onClear={() => {
            setSelectedIds([]);
            selectionAnchorRef.current = null;
          }}
        />
        {selectedIds.length === 1 && selectedFiles[0] && (
          <SingleFileLabelEditors
            file={selectedFiles[0]}
            onLabelsChange={handleLabelsChange}
            onDateChange={handleDateChange}
            showTagSearch
          />
        )}
        {selectedIds.length >= 2 && (
          <BulkLabelEditors
            selectedFiles={selectedFiles}
            onLabelsChange={handleLabelsChange}
            onDateChange={handleDateChange}
            showTagSearch
          />
        )}
      </div>

      {total === 0 && <div className="empty-state">No photos match this filter in {monthName}.</div>}

      {total > 0 && (
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
      )}

      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={data?.items ?? []}
          onChangeFile={setDetailFile}
          onDateChange={handleDateChange}
          onLabelsChange={handleLabelsChange}
          onClose={() => setDetailFile(null)}
        />
      )}
    </div>
  );
}
