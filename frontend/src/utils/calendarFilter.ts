import { CalendarDayFilter, CalendarMonthFilter } from "../api/client";

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

export function resolveDayFilter(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number,
  globalUnlabeled: boolean
): CalendarDayFilter | undefined {
  if (globalUnlabeled) return { unlabeled: true };
  return monthFilterToDayFilter(filter, year, month);
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
