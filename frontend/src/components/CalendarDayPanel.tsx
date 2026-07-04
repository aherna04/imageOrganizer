import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MediaFile, CalendarDayFilter, api } from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import PhotoGrid from "./PhotoGrid";
import PhotoDetail from "./PhotoDetail";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import BulkLabelEditors from "./BulkLabelEditors";

interface Props {
  date: string;
  location: string;
  filter?: CalendarDayFilter;
  onClose: () => void;
}

export default function CalendarDayPanel({ date, location, filter, onClose }: Props) {
  const qc = useQueryClient();
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-day", date, location, filter],
    queryFn: () => api.calendarDay(date, location, filter),
  });

  useEffect(() => {
    setSelectedIds([]);
  }, [date, location, filter]);

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
        <SingleFileLabelEditors file={selectedFiles[0]} onChange={handleLabelsChange} />
      )}
      {selectedIds.length >= 2 && (
        <BulkLabelEditors selectedFiles={selectedFiles} onChange={handleLabelsChange} />
      )}

      <PhotoGrid
        files={data?.items ?? []}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onDoubleClick={setDetailFile}
        multiSelectMode
        size="large"
        editableLabels
        onLabelsChange={handleLabelsChange}
      />
      {detailFile && <PhotoDetail file={detailFile} onClose={() => setDetailFile(null)} />}
    </div>
  );
}
