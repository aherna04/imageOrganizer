import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Event, api } from "../api/client";

interface Props {
  fileId: number;
  fileEvents: Event[];
  onChange: () => void;
}

function eventIds(events: Event[]) {
  return events.map((e) => e.id);
}

export default function EventPicker({ fileId, fileEvents, onChange }: Props) {
  const [selectedIds, setSelectedIds] = useState(() => eventIds(fileEvents));
  const propIdsKey = [...eventIds(fileEvents)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    setSelectedIds(eventIds(fileEvents));
  }, [fileId, propIdsKey]);

  const { data: allEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
  });

  const selected = new Set(selectedIds);

  const toggle = async (eventId: number) => {
    const prev = selectedIds;
    const next = selected.has(eventId)
      ? selectedIds.filter((id) => id !== eventId)
      : [...selectedIds, eventId];
    setSelectedIds(next);
    try {
      await api.setFileEvents(fileId, next);
      onChange();
    } catch {
      setSelectedIds(prev);
    }
  };

  return (
    <div>
      <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>Events</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
        {allEvents.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className="badge event-badge"
            style={{
              background: selected.has(ev.id) ? ev.color : "#2a2f3a",
              color: "#fff",
              border: selected.has(ev.id) ? `2px solid ${ev.color}` : "2px solid transparent",
            }}
            onClick={() => toggle(ev.id)}
          >
            {ev.name}
          </button>
        ))}
      </div>
    </div>
  );
}
