import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MediaFile, CalendarDayFilter, CalendarMediaType, api } from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import PhotoGridWithAlerts from "./PhotoGridWithAlerts";
import PhotoDetail from "./PhotoDetail";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import BulkLabelEditors from "./BulkLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";

interface Props {
  date: string;
  location: string;
  mediaType: CalendarMediaType;
  filter?: CalendarDayFilter;
  onClose: () => void;
}

export default function CalendarDayPanel({ date, location, mediaType, filter, onClose }: Props) {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-day", date, location, filter, mediaType],
    queryFn: () => api.calendarDay(date, location, filter, mediaType),
  });

  useEffect(() => {
    setSelectedIds([]);
    setDetailFile(null);
  }, [date, location, filter, mediaType]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["calendar-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  };

  const handleDateChange = (keepFileId?: number) => {
    const openId = keepFileId ?? detailFile?.id;
    invalidateAfterDateChange(qc);
    refetch().then(({ data: dayData }) => {
      if (!openId) return;
      const still = dayData?.items.find((f) => f.id === openId);
      setDetailFile(still ?? null);
    });
    handleLabelsChange();
  };

  const selectedFiles = data?.items.filter((f) => selectedIds.includes(f.id)) ?? [];

  return (
    <div className="calendar-day-panel">
      <div className="calendar-day-panel-header-row">
        <h3 className="calendar-day-panel-header">{date}</h3>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => setSelectedIds([])}
      />

      {selectedIds.length === 1 && selectedFiles[0] && (
        <SingleFileLabelEditors file={selectedFiles[0]} onChange={handleDateChange} />
      )}
      {selectedIds.length >= 2 && (
        <BulkLabelEditors selectedFiles={selectedFiles} onChange={handleDateChange} />
      )}

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
