import {
  CalendarMonthEvent,
  CalendarMonthFilter,
  CalendarMonthLabels as CalendarMonthLabelsData,
  CalendarMonthPerson,
  CalendarMonthTag,
} from "../api/client";
import { isFilterActive, isUnlabeledFilterActive } from "../utils/calendarFilter";

interface Props {
  labels: CalendarMonthLabelsData;
  activeFilter: CalendarMonthFilter | null;
  onSelectFilter: (filter: CalendarMonthFilter | null) => void;
}

function hasLabels(labels: CalendarMonthLabelsData): boolean {
  return (
    labels.events.length > 0 ||
    labels.people.length > 0 ||
    labels.tags.length > 0 ||
    labels.unlabeled_count > 0
  );
}

export default function CalendarMonthLabels({ labels, activeFilter, onSelectFilter }: Props) {
  const { year, month, events, people, tags, unlabeled_count } = labels;
  const hasActive =
    activeFilter?.year === year && activeFilter?.month === month && activeFilter !== null;

  if (!hasLabels(labels)) {
    return <div className="calendar-month-labels empty">No labels this month</div>;
  }

  const toggle = (kind: "event" | "person" | "tag", id: number) => {
    if (isFilterActive(activeFilter, year, month, kind, id)) {
      onSelectFilter(null);
    } else {
      onSelectFilter({ year, month, kind, id });
    }
  };

  const toggleUnlabeled = () => {
    if (isUnlabeledFilterActive(activeFilter, year, month)) {
      onSelectFilter(null);
    } else {
      onSelectFilter({ year, month, kind: "unlabeled" });
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

      {unlabeled_count > 0 && (
        <button
          type="button"
          className={`calendar-event-chip calendar-unlabeled-chip ${isUnlabeledFilterActive(activeFilter, year, month) ? "active" : ""}`}
          onClick={toggleUnlabeled}
        >
          Untagged ({unlabeled_count})
        </button>
      )}

      {events.map((ev: CalendarMonthEvent) => (
        <button
          key={`event-${ev.id}`}
          type="button"
          className={`calendar-event-chip ${isFilterActive(activeFilter, year, month, "event", ev.id) ? "active" : ""}`}
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
          className={`calendar-event-chip calendar-person-chip ${isFilterActive(activeFilter, year, month, "person", person.id) ? "active" : ""}`}
          onClick={() => toggle("person", person.id)}
        >
          {person.name} ({person.photo_count})
        </button>
      ))}

      {tags.map((tag: CalendarMonthTag) => (
        <button
          key={`tag-${tag.id}`}
          type="button"
          className={`calendar-event-chip calendar-tag-chip ${isFilterActive(activeFilter, year, month, "tag", tag.id) ? "active" : ""}`}
          onClick={() => toggle("tag", tag.id)}
        >
          {tag.name} ({tag.photo_count})
        </button>
      ))}
    </div>
  );
}
