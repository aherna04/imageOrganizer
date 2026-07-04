import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile } from "../api/client";
import { api } from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import PhotoGrid from "./PhotoGrid";
import PhotoDetail from "./PhotoDetail";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import BulkLabelEditors from "./BulkLabelEditors";

interface Props {
  date: string;
  location: string;
  eventId?: number;
}

export default function CalendarDayPanel({ date, location, eventId }: Props) {
  const qc = useQueryClient();
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, refetch } = useQuery({
    queryKey: ["calendar-day", date, location, eventId],
    queryFn: () => api.calendarDay(date, location, eventId),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
  };

  const selectedFiles = data?.items.filter((f) => selectedIds.includes(f.id)) ?? [];

  return (
    <div className="calendar-day-panel">
      <h3 className="calendar-day-panel-header">{date}</h3>

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
