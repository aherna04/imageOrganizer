import { useQuery } from "@tanstack/react-query";
import { Event, api } from "../api/client";

interface Props {
  fileId: number;
  fileEvents: Event[];
  onChange: () => void;
}

export default function EventPicker({ fileId, fileEvents, onChange }: Props) {
  const { data: allEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
  });

  const selected = new Set(fileEvents.map((e) => e.id));

  const toggle = async (eventId: number) => {
    const next = selected.has(eventId)
      ? [...selected].filter((id) => id !== eventId)
      : [...selected, eventId];
    await api.setFileEvents(fileId, next);
    onChange();
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
