import {
  CalendarMonthEvent,
  CalendarMonthPerson,
  CalendarMonthTag,
  CalendarYearFilter,
  CalendarYearLabels as CalendarYearLabelsData,
} from "../api/client";
import { isYearFilterActive, isYearUnlabeledFilterActive } from "../utils/calendarFilter";

interface Props {
  labels: CalendarYearLabelsData;
  activeFilter: CalendarYearFilter | null;
  globalUnlabeled?: boolean;
  onSelectFilter: (filter: CalendarYearFilter | null) => void;
}

function hasLabels(labels: CalendarYearLabelsData): boolean {
  return (
    labels.events.length > 0 ||
    labels.people.length > 0 ||
    labels.tags.length > 0 ||
    labels.unlabeled_count > 0
  );
}

export default function CalendarYearLabels({
  labels,
  activeFilter,
  globalUnlabeled = false,
  onSelectFilter,
}: Props) {
  const { year, events, people, tags, unlabeled_count } = labels;
  const hasActive = !globalUnlabeled && activeFilter !== null;
  const untaggedActive = globalUnlabeled || isYearUnlabeledFilterActive(activeFilter, year);

  if (!hasLabels(labels)) {
    return <div className="calendar-month-labels calendar-year-labels empty">No labels this year</div>;
  }

  const toggle = (kind: "event" | "person" | "tag", id: number) => {
    if (isYearFilterActive(activeFilter, year, kind, id)) {
      onSelectFilter(null);
    } else {
      onSelectFilter({ year, kind, id });
    }
  };

  const toggleUnlabeled = () => {
    if (globalUnlabeled) {
      onSelectFilter({ year, kind: "unlabeled" });
      return;
    }
    if (isYearUnlabeledFilterActive(activeFilter, year)) {
      onSelectFilter(null);
    } else {
      onSelectFilter({ year, kind: "unlabeled" });
    }
  };

  return (
    <div className="calendar-month-labels calendar-year-labels">
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
          className={`calendar-event-chip calendar-unlabeled-chip ${untaggedActive ? "active" : ""}`}
          onClick={toggleUnlabeled}
        >
          Untagged ({unlabeled_count})
        </button>
      )}

      {events.map((ev: CalendarMonthEvent) => (
        <button
          key={`event-${ev.id}`}
          type="button"
          className={`calendar-event-chip ${isYearFilterActive(activeFilter, year, "event", ev.id) ? "active" : ""}`}
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
          className={`calendar-event-chip calendar-person-chip ${isYearFilterActive(activeFilter, year, "person", person.id) ? "active" : ""}`}
          onClick={() => toggle("person", person.id)}
        >
          {person.name} ({person.photo_count})
        </button>
      ))}

      {tags.map((tag: CalendarMonthTag) => (
        <button
          key={`tag-${tag.id}`}
          type="button"
          className={`calendar-event-chip calendar-tag-chip ${isYearFilterActive(activeFilter, year, "tag", tag.id) ? "active" : ""}`}
          onClick={() => toggle("tag", tag.id)}
        >
          {tag.name} ({tag.photo_count})
        </button>
      ))}
    </div>
  );
}
