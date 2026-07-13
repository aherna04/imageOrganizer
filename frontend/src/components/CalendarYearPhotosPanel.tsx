import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CalendarMediaType,
  CalendarYearFilter,
  CalendarYearLabels as CalendarYearLabelsData,
  MediaFile,
  api,
} from "../api/client";
import PhotoDetail from "./PhotoDetail";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { yearFilterLabelName, yearFilterToListFilesParams } from "../utils/calendarFilter";

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
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

  const listParams = yearFilterToListFilesParams(filter, year, location, mediaType);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-year-photos", year, filter, location, mediaType, page],
    queryFn: () => api.listFiles({ ...listParams, page }),
  });

  useEffect(() => {
    setPage(1);
    setDetailFile(null);
  }, [filter, year, location, mediaType]);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const showPagination = total > PAGE_SIZE;
  const labelName = yearFilterLabelName(filter, labels);

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["calendar-year-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  };

  const handleDateChange = () => {
    invalidateAfterDateChange(qc);
    refetch();
    handleLabelsChange();
  };

  return (
    <div className="calendar-year-photos-panel">
      <div className="page-sticky-controls">
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
                onClick={() => setPage((p) => p - 1)}
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
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {total === 0 && <div className="empty-state">No photos match this filter in {year}.</div>}

      {total > 0 && (
        <PhotoGridWithAlerts
          files={data?.items ?? []}
          selectedIds={[]}
          activeDetailId={detailFile?.id}
          onToggleSelect={() => {}}
          onOpenDetail={setDetailFile}
          multiSelectMode={false}
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
          onClose={() => setDetailFile(null)}
        />
      )}
    </div>
  );
}
