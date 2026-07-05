import { useQuery } from "@tanstack/react-query";
import { api, CalendarMonthFilter, CalendarMediaType, CalendarMonthSummary } from "../api/client";
import { monthFilterToDayFilter } from "../utils/calendarFilter";
import CalendarMonth from "./CalendarMonth";
import CalendarMonthLabels from "./CalendarMonthLabels";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  year: number;
  month: number;
  location: string;
  mediaType: CalendarMediaType;
  selectedDay?: { year: number; month: number; day: number } | null;
  monthFilter: CalendarMonthFilter | null;
  onSelectDay: (year: number, month: number, day: number) => void;
  onSelectFilter: (year: number, month: number, filter: CalendarMonthFilter | null) => void;
}

export default function CalendarMonthColumn({
  year,
  month,
  location,
  mediaType,
  selectedDay,
  monthFilter,
  onSelectDay,
  onSelectFilter,
}: Props) {
  const dayFilter = monthFilterToDayFilter(monthFilter, year, month);

  const { data: summary } = useQuery({
    queryKey: ["calendar-summary", year, month, location, dayFilter, mediaType],
    queryFn: () => api.calendarSummary(year, month, location, dayFilter, mediaType),
  });

  const { data: labelsData } = useQuery({
    queryKey: ["calendar-labels", year, month, location, mediaType],
    queryFn: () => api.calendarLabels(year, month, location, mediaType),
  });

  const selectedDate =
    selectedDay?.year === year && selectedDay?.month === month
      ? new Date(year, month - 1, selectedDay.day, 12, 0, 0)
      : undefined;

  const activeFilterForMonth =
    monthFilter?.year === year && monthFilter?.month === month ? monthFilter : null;

  return (
    <div className="calendar-month-column">
      <h4 className="calendar-month-column-title">
        {MONTH_NAMES[month - 1]} {year}
      </h4>
      <CalendarMonth
        year={year}
        month={month}
        days={summary?.days ?? []}
        selected={selectedDate}
        compact
        onSelect={(d) => {
          if (!d) return;
          onSelectDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
        }}
      />
      {labelsData && (
        <CalendarMonthLabels
          labels={labelsData}
          activeFilter={activeFilterForMonth}
          onSelectFilter={(filter) => onSelectFilter(year, month, filter)}
        />
      )}
    </div>
  );
}

export type { CalendarMonthSummary };
