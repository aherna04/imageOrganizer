import { CalendarDayFilter, CalendarMonthFilter, CalendarYearFilter } from "../api/client";

export function monthFilterToDayFilter(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number
): CalendarDayFilter | undefined {
  if (!filter || filter.year !== year || filter.month !== month) return undefined;
  if (filter.kind === "event") return { eventId: filter.id };
  if (filter.kind === "person") return { personId: filter.id };
  if (filter.kind === "tag") return { tagId: filter.id };
  return { unlabeled: true };
}

export function yearFilterToDayFilter(
  filter: CalendarYearFilter | null,
  year: number,
): CalendarDayFilter | undefined {
  if (!filter || filter.year !== year) return undefined;
  if (filter.kind === "event") return { eventId: filter.id };
  if (filter.kind === "person") return { personId: filter.id };
  if (filter.kind === "tag") return { tagId: filter.id };
  return { unlabeled: true };
}

export function resolveDayFilter(
  monthFilter: CalendarMonthFilter | null,
  yearFilter: CalendarYearFilter | null,
  year: number,
  month: number,
  globalUnlabeled: boolean,
): CalendarDayFilter | undefined {
  if (globalUnlabeled) return { unlabeled: true };
  const monthDay = monthFilterToDayFilter(monthFilter, year, month);
  if (monthDay) return monthDay;
  return yearFilterToDayFilter(yearFilter, year);
}

export function isFilterActive(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number,
  kind: CalendarMonthFilter["kind"],
  id?: number
): boolean {
  if (filter?.year !== year || filter?.month !== month || filter.kind !== kind) {
    return false;
  }
  if (kind === "unlabeled") return true;
  return filter.kind !== "unlabeled" && filter.id === id;
}

export function isYearFilterActive(
  filter: CalendarYearFilter | null,
  year: number,
  kind: CalendarYearFilter["kind"],
  id?: number,
): boolean {
  if (filter?.year !== year || filter.kind !== kind) {
    return false;
  }
  if (kind === "unlabeled") return true;
  return filter.kind !== "unlabeled" && filter.id === id;
}

export function isUnlabeledFilterActive(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number
): boolean {
  return (
    filter?.year === year &&
    filter?.month === month &&
    filter.kind === "unlabeled"
  );
}

export function isYearUnlabeledFilterActive(
  filter: CalendarYearFilter | null,
  year: number,
): boolean {
  return filter?.year === year && filter.kind === "unlabeled";
}
