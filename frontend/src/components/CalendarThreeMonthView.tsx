import { CalendarMonthFilter, CalendarMediaType, CalendarMonthSummary, CalendarYearFilter } from "../api/client";
import CalendarMonthColumn from "./CalendarMonthColumn";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  visibleMonths: CalendarMonthSummary[];
  windowStartIndex: number;
  totalMonths: number;
  yearLabel?: number | "all";
  location: string;
  mediaType: CalendarMediaType;
  globalUnlabeled: boolean;
  selectedDay?: { year: number; month: number; day: number } | null;
  monthFilter: CalendarMonthFilter | null;
  yearLabelFilter: CalendarYearFilter | null;
  filterYear: number | "all";
  mode: "browse" | "focus";
  showWindowNav: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (year: number, month: number, day: number) => void;
  onSelectFilter: (year: number, month: number, filter: CalendarMonthFilter | null) => void;
  onSelectMonth?: (year: number, month: number) => void;
}

function monthLabel(m: CalendarMonthSummary) {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}

export default function CalendarThreeMonthView({
  visibleMonths,
  windowStartIndex,
  totalMonths,
  yearLabel,
  location,
  mediaType,
  globalUnlabeled,
  selectedDay,
  monthFilter,
  yearLabelFilter,
  filterYear,
  mode,
  showWindowNav,
  onPrev,
  onNext,
  onSelectDay,
  onSelectFilter,
  onSelectMonth,
}: Props) {
  const hasPrev = windowStartIndex > 0;
  const hasNext = windowStartIndex + 3 < totalMonths;

  return (
    <div className={`calendar-three-month calendar-month-grid ${mode}`}>
      {showWindowNav ? (
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
      ) : (
        yearLabel === "all" && (
          <p className="calendar-browse-summary">{totalMonths} months with photos</p>
        )
      )}
      <div className="calendar-three-month-columns">
        {visibleMonths.map((m) => (
          <CalendarMonthColumn
            key={`${m.year}-${m.month}`}
            year={m.year}
            month={m.month}
            location={location}
            mediaType={mediaType}
            globalUnlabeled={globalUnlabeled}
            selectedDay={selectedDay}
            monthFilter={monthFilter}
            yearLabelFilter={yearLabelFilter}
            filterYear={filterYear}
            onSelectDay={onSelectDay}
            onSelectFilter={onSelectFilter}
            onSelectMonth={onSelectMonth}
          />
        ))}
      </div>
    </div>
  );
}
