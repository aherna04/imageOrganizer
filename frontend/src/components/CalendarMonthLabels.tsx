import { CalendarMonthEvent } from "../api/client";

interface Props {
  events: CalendarMonthEvent[];
  activeEventId?: number;
  onSelectEvent: (eventId: number | undefined) => void;
}

export default function CalendarMonthLabels({ events, activeEventId, onSelectEvent }: Props) {
  if (events.length === 0) {
    return <div className="calendar-month-labels empty">No events this month</div>;
  }

  return (
    <div className="calendar-month-labels">
      <button
        type="button"
        className={`calendar-event-chip ${activeEventId === undefined ? "active" : ""}`}
        onClick={() => onSelectEvent(undefined)}
      >
        All
      </button>
      {events.map((ev) => (
        <button
          key={ev.id}
          type="button"
          className={`calendar-event-chip ${activeEventId === ev.id ? "active" : ""}`}
          style={{ borderColor: ev.color }}
          onClick={() => onSelectEvent(activeEventId === ev.id ? undefined : ev.id)}
        >
          <span className="calendar-event-chip-dot" style={{ background: ev.color }} />
          {ev.name} ({ev.photo_count})
        </button>
      ))}
    </div>
  );
}
