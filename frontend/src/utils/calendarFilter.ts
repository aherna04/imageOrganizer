import { CalendarDayFilter, CalendarMonthFilter } from "../api/client";

export function monthFilterToDayFilter(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number
): CalendarDayFilter | undefined {
  if (!filter || filter.year !== year || filter.month !== month) return undefined;
  if (filter.kind === "event") return { eventId: filter.id };
  if (filter.kind === "person") return { personId: filter.id };
  return { tagId: filter.id };
}

export function isFilterActive(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number,
  kind: CalendarMonthFilter["kind"],
  id: number
): boolean {
  return (
    filter?.year === year &&
    filter?.month === month &&
    filter?.kind === kind &&
    filter?.id === id
  );
}
