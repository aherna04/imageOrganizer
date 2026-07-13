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

export type CalendarBrowseView = "months" | "yearPhotos" | "monthPhotos";

export function parseMonthFilterFromSearchParams(
  searchParams: URLSearchParams,
  year: number,
  month: number,
): CalendarMonthFilter | null {
  if (searchParams.get("unlabeled") === "1") {
    return { year, month, kind: "unlabeled" };
  }
  const tagId = searchParams.get("tag_id");
  if (tagId) return { year, month, kind: "tag", id: Number(tagId) };
  const personId = searchParams.get("person_id");
  if (personId) return { year, month, kind: "person", id: Number(personId) };
  const eventId = searchParams.get("event_id");
  if (eventId) return { year, month, kind: "event", id: Number(eventId) };
  return null;
}

export function monthFilterToSearchParams(filter: CalendarMonthFilter | null): string {
  if (!filter) return "";
  const q = new URLSearchParams();
  if (filter.kind === "unlabeled") {
    q.set("unlabeled", "1");
  } else if (filter.kind === "tag") {
    q.set("tag_id", String(filter.id));
  } else if (filter.kind === "person") {
    q.set("person_id", String(filter.id));
  } else if (filter.kind === "event") {
    q.set("event_id", String(filter.id));
  }
  return q.toString();
}

export function monthPhotosSearchParams(filter: CalendarMonthFilter | null): string {
  const q = new URLSearchParams();
  q.set("view", "month");
  const filterParams = monthFilterToSearchParams(filter);
  if (filterParams) {
    for (const [key, value] of new URLSearchParams(filterParams)) {
      q.set(key, value);
    }
  }
  return q.toString();
}

export function monthFilterLabelName(
  filter: CalendarMonthFilter,
  labels: {
    events: { id: number; name: string }[];
    people: { id: number; name: string }[];
    tags: { id: number; name: string }[];
  },
): string {
  if (filter.kind === "unlabeled") return "Untagged";
  if (filter.kind === "event") {
    return labels.events.find((e) => e.id === filter.id)?.name ?? "Event";
  }
  if (filter.kind === "person") {
    return labels.people.find((p) => p.id === filter.id)?.name ?? "Person";
  }
  return labels.tags.find((t) => t.id === filter.id)?.name ?? "Tag";
}

export function monthFilterToListFilesParams(
  filter: CalendarMonthFilter | null,
  year: number,
  month: number,
  location: string,
  mediaType: string,
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    capture_month: `${year}-${String(month).padStart(2, "0")}`,
    page_size: 100,
  };
  if (location !== "all") params.location = location;
  if (mediaType !== "all") params.media_type = mediaType;
  if (filter?.kind === "tag") params.tag_id = filter.id;
  else if (filter?.kind === "person") params.person_id = filter.id;
  else if (filter?.kind === "event") params.event_id = filter.id;
  else if (filter?.kind === "unlabeled") params.unlabeled = true;
  return params;
}

export function parseYearFilterFromSearchParams(
  searchParams: URLSearchParams,
  year: number,
): CalendarYearFilter | null {
  if (searchParams.get("unlabeled") === "1") {
    return { year, kind: "unlabeled" };
  }
  const tagId = searchParams.get("tag_id");
  if (tagId) return { year, kind: "tag", id: Number(tagId) };
  const personId = searchParams.get("person_id");
  if (personId) return { year, kind: "person", id: Number(personId) };
  const eventId = searchParams.get("event_id");
  if (eventId) return { year, kind: "event", id: Number(eventId) };
  return null;
}

export function yearFilterToSearchParams(filter: CalendarYearFilter | null): string {
  if (!filter) return "";
  const q = new URLSearchParams();
  if (filter.kind === "unlabeled") {
    q.set("unlabeled", "1");
  } else if (filter.kind === "tag") {
    q.set("tag_id", String(filter.id));
  } else if (filter.kind === "person") {
    q.set("person_id", String(filter.id));
  } else if (filter.kind === "event") {
    q.set("event_id", String(filter.id));
  }
  return q.toString();
}

export function yearFilterLabelName(
  filter: CalendarYearFilter,
  labels: {
    events: { id: number; name: string }[];
    people: { id: number; name: string }[];
    tags: { id: number; name: string }[];
  },
): string {
  if (filter.kind === "unlabeled") return "Untagged";
  if (filter.kind === "event") {
    return labels.events.find((e) => e.id === filter.id)?.name ?? "Event";
  }
  if (filter.kind === "person") {
    return labels.people.find((p) => p.id === filter.id)?.name ?? "Person";
  }
  return labels.tags.find((t) => t.id === filter.id)?.name ?? "Tag";
}

export function yearFilterToListFilesParams(
  filter: CalendarYearFilter,
  year: number,
  location: string,
  mediaType: string,
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    capture_year: year,
    page_size: 100,
  };
  if (location !== "all") params.location = location;
  if (mediaType !== "all") params.media_type = mediaType;
  if (filter.kind === "tag") params.tag_id = filter.id;
  else if (filter.kind === "person") params.person_id = filter.id;
  else if (filter.kind === "event") params.event_id = filter.id;
  else if (filter.kind === "unlabeled") params.unlabeled = true;
  return params;
}
