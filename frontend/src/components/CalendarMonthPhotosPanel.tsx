import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CalendarMediaType,
  CalendarMonthFilter,
  CalendarMonthLabels as CalendarMonthLabelsData,
  MediaFile,
  api,
} from "../api/client";
import CalendarMonthLabels from "./CalendarMonthLabels";
import PhotoDetail from "./PhotoDetail";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { monthFilterLabelName, monthFilterToListFilesParams } from "../utils/calendarFilter";

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
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

  const listParams = monthFilterToListFilesParams(filter, year, month, location, mediaType);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-month-photos", year, month, filter, location, mediaType, page],
    queryFn: () => api.listFiles({ ...listParams, page }),
  });

  useEffect(() => {
    setPage(1);
    setDetailFile(null);
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

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["calendar-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-summary"] });
    qc.invalidateQueries({ queryKey: ["calendar-year-labels"] });
  };

  const handleDateChange = () => {
    invalidateAfterDateChange(qc);
    refetch();
    handleLabelsChange();
  };

  return (
    <div className="calendar-month-photos-panel">
      <div className="page-sticky-controls">
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

      {total === 0 && <div className="empty-state">No photos match this filter in {monthName}.</div>}

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
