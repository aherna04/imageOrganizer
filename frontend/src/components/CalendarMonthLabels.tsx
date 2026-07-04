import {
  CalendarMonthEvent,
  CalendarMonthFilter,
  CalendarMonthLabels as CalendarMonthLabelsData,
  CalendarMonthPerson,
  CalendarMonthTag,
} from "../api/client";

interface Props {
  labels: CalendarMonthLabelsData;
  activeFilter: CalendarMonthFilter | null;
  onSelectFilter: (filter: CalendarMonthFilter | null) => void;
}

function hasLabels(labels: CalendarMonthLabelsData): boolean {
  return labels.events.length > 0 || labels.people.length > 0 || labels.tags.length > 0;
}

function isActive(
  activeFilter: CalendarMonthFilter | null,
  year: number,
  month: number,
  kind: CalendarMonthFilter["kind"],
  id: number
): boolean {
  return (
    activeFilter?.year === year &&
    activeFilter?.month === month &&
    activeFilter?.kind === kind &&
    activeFilter?.id === id
  );
}

export default function CalendarMonthLabels({ labels, activeFilter, onSelectFilter }: Props) {
  const { year, month, events, people, tags } = labels;
  const hasActive =
    activeFilter?.year === year && activeFilter?.month === month && activeFilter !== null;

  if (!hasLabels(labels)) {
    return <div className="calendar-month-labels empty">No labels this month</div>;
  }

  const toggle = (kind: CalendarMonthFilter["kind"], id: number) => {
    if (isActive(activeFilter, year, month, kind, id)) {
      onSelectFilter(null);
    } else {
      onSelectFilter({ year, month, kind, id });
    }
  };

  return (
    <div className="calendar-month-labels">
      <button
        type="button"
        className={`calendar-event-chip ${!hasActive ? "active" : ""}`}
        onClick={() => onSelectFilter(null)}
      >
        All
      </button>

      {events.map((ev: CalendarMonthEvent) => (
        <button
          key={`event-${ev.id}`}
          type="button"
          className={`calendar-event-chip ${isActive(activeFilter, year, month, "event", ev.id) ? "active" : ""}`}
          style={{ borderColor: ev.color }}
          onClick={() => toggle("event", ev.id)}
        >
          <span className="calendar-event-chip-dot" style={{ background: ev.color }} />
          {ev.name} ({ev.photo_count})
        </button>
      ))}

      {people.map((person: CalendarMonthPerson) => (
        <button
          key={`person-${person.id}`}
          type="button"
          className={`calendar-event-chip calendar-person-chip ${isActive(activeFilter, year, month, "person", person.id) ? "active" : ""}`}
          onClick={() => toggle("person", person.id)}
        >
          {person.name} ({person.photo_count})
        </button>
      ))}

      {tags.map((tag: CalendarMonthTag) => (
        <button
          key={`tag-${tag.id}`}
          type="button"
          className={`calendar-event-chip calendar-tag-chip ${isActive(activeFilter, year, month, "tag", tag.id) ? "active" : ""}`}
          onClick={() => toggle("tag", tag.id)}
        >
          {tag.name} ({tag.photo_count})
        </button>
      ))}
    </div>
  );
}
