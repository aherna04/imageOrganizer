import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarMediaType,
  CalendarYearFilter,
  CalendarYearLabels as CalendarYearLabelsData,
  MediaFile,
  api,
} from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import BulkLabelEditors from "./BulkLabelEditors";
import PhotoDetail from "./PhotoDetail";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { invalidateAfterLabelChange } from "../utils/invalidateAfterLabelChange";
import { yearFilterLabelName, yearFilterToListFilesParams } from "../utils/calendarFilter";
import { togglePhotoSelection } from "../utils/photoSelection";

const PAGE_SIZE = 100;

interface Props {
  year: number;
  filter: CalendarYearFilter;
  location: string;
  mediaType: CalendarMediaType;
  labels: CalendarYearLabelsData;
}

export default function CalendarYearPhotosPanel({ year, filter, location, mediaType, labels }: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const selectionAnchorRef = useRef<number | null>(null);

  const listParams = yearFilterToListFilesParams(filter, year, location, mediaType);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-year-photos", year, filter, location, mediaType, page],
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
  }, [filter, year, location, mediaType]);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const showPagination = total > PAGE_SIZE;
  const labelName = yearFilterLabelName(filter, labels);

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
    qc.invalidateQueries({ queryKey: ["calendar-year-photos"] });
  };

  const handleDateChange = () => {
    invalidateAfterDateChange(qc);
    refetch();
    invalidateAfterLabelChange(qc, { calendarFacets: true });
    qc.invalidateQueries({ queryKey: ["calendar-year-photos"] });
  };

  return (
    <div className="calendar-year-photos-panel">
      <div className="page-sticky-controls calendar-photo-grid-sticky">
        <h3 className="calendar-year-photos-title">
          {labelName} · {total} photos in {year}
        </h3>
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

      {total === 0 && <div className="empty-state">No photos match this filter in {year}.</div>}

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
