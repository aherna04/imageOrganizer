import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile } from "../api/client";
import { api } from "../api/client";
import BulkEventAssignBar from "./BulkEventAssignBar";
import BulkPersonAssignBar from "./BulkPersonAssignBar";
import PhotoGrid from "./PhotoGrid";
import PhotoDetail from "./PhotoDetail";

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

  const handleAssigned = () => {
    setSelectedIds([]);
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
  };

  const handlePeopleAssigned = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["people"] });
  };

  return (
    <div className="calendar-day-panel">
      <h3 className="calendar-day-panel-header">{date}</h3>

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => setSelectedIds([])}
        onAssigned={handleAssigned}
      />

      <BulkPersonAssignBar selectedIds={selectedIds} onAssigned={handlePeopleAssigned} />

      <PhotoGrid
        files={data?.items ?? []}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onDoubleClick={setDetailFile}
        multiSelectMode
        size="large"
      />
      {detailFile && <PhotoDetail file={detailFile} onClose={() => setDetailFile(null)} />}
    </div>
  );
}
