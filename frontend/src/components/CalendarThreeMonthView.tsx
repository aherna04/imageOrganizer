import { CalendarMonthSummary } from "../api/client";
import CalendarMonthColumn from "./CalendarMonthColumn";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  visibleMonths: CalendarMonthSummary[];
  windowStartIndex: number;
  totalMonths: number;
  location: string;
  selectedDay?: { year: number; month: number; day: number } | null;
  monthEventFilter: { year: number; month: number; eventId: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (year: number, month: number, day: number) => void;
  onSelectEvent: (year: number, month: number, eventId: number | undefined) => void;
}

function monthLabel(m: CalendarMonthSummary) {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}

export default function CalendarThreeMonthView({
  visibleMonths,
  windowStartIndex,
  totalMonths,
  location,
  selectedDay,
  monthEventFilter,
  onPrev,
  onNext,
  onSelectDay,
  onSelectEvent,
}: Props) {
  const hasPrev = windowStartIndex > 0;
  const hasNext = windowStartIndex + 3 < totalMonths;

  return (
    <div className="calendar-three-month">
      <div className="calendar-window-nav">
        <button type="button" className="btn btn-secondary" onClick={onPrev} disabled={!hasPrev}>
          ← Prev
        </button>
        <span className="calendar-window-title">
          {visibleMonths.map(monthLabel).join(" · ") || "No photos"}
        </span>
        <button type="button" className="btn btn-secondary" onClick={onNext} disabled={!hasNext}>
          Next →
        </button>
      </div>
      <div className="calendar-three-month-columns">
        {visibleMonths.map((m) => {
          const filterForMonth =
            monthEventFilter?.year === m.year && monthEventFilter?.month === m.month
              ? monthEventFilter.eventId
              : undefined;
          return (
            <CalendarMonthColumn
              key={`${m.year}-${m.month}`}
              year={m.year}
              month={m.month}
              location={location}
              selectedDay={selectedDay}
              activeEventId={filterForMonth}
              onSelectDay={onSelectDay}
              onSelectEvent={onSelectEvent}
            />
          );
        })}
      </div>
    </div>
  );
}
