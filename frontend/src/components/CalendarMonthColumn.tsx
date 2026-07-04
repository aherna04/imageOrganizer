import { useQuery } from "@tanstack/react-query";
import { api, CalendarMonthSummary } from "../api/client";
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
  selectedDay?: { year: number; month: number; day: number } | null;
  activeEventId?: number;
  onSelectDay: (year: number, month: number, day: number) => void;
  onSelectEvent: (year: number, month: number, eventId: number | undefined) => void;
}

export default function CalendarMonthColumn({
  year,
  month,
  location,
  selectedDay,
  activeEventId,
  onSelectDay,
  onSelectEvent,
}: Props) {
  const { data: summary } = useQuery({
    queryKey: ["calendar-summary", year, month, location, activeEventId],
    queryFn: () => api.calendarSummary(year, month, location, activeEventId),
  });

  const { data: eventsData } = useQuery({
    queryKey: ["calendar-events", year, month, location],
    queryFn: () => api.calendarEvents(year, month, location),
  });

  const selectedDate =
    selectedDay?.year === year && selectedDay?.month === month
      ? new Date(year, month - 1, selectedDay.day, 12, 0, 0)
      : undefined;

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
      <CalendarMonthLabels
        events={eventsData?.events ?? []}
        activeEventId={activeEventId}
        onSelectEvent={(eventId) => onSelectEvent(year, month, eventId)}
      />
    </div>
  );
}

export type { CalendarMonthSummary };
