export interface Tag {
  id: number;
  name: string;
  slug: string;
  photo_count: number;
}

export interface Person {
  id: number;
  name: string;
  slug: string;
  photo_count: number;
}

export interface Event {
  id: number;
  name: string;
  slug: string;
  color: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  photo_count: number;
  cover_file_id: number | null;
  date_span_start: string | null;
  date_span_end: string | null;
  tags: Tag[];
}

export interface MediaFile {
  id: number;
  path: string;
  filename: string;
  location: "inbox" | "archive";
  media_type: "image" | "video";
  size: number;
  capture_date: string | null;
  capture_day: string | null;
  camera: string | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  phash: string | null;
  caption: string | null;
  rating: number | null;
  events: Event[];
  people: Person[];
}

export interface FileList {
  items: MediaFile[];
  total: number;
  page: number;
  page_size: number;
}

export interface Config {
  inbox_path: string;
  archive_path: string;
  trash_path: string;
  date_pattern: string;
  rename_pattern: string;
}

export interface Metadata {
  capture_date: string | null;
  camera: string | null;
  lens: string | null;
  gps: string | null;
  width: number | null;
  height: number | null;
  size: number;
  caption: string | null;
  rating: number | null;
}

export interface ScanStatus {
  running: boolean;
  scope: string | null;
  processed: number;
  total: number;
  message: string | null;
}

export interface CalendarDaySummary {
  date: string;
  count: number;
  cover_file_id: number | null;
}

export interface CalendarMonthSummary {
  year: number;
  month: number;
  count: number;
}

export interface CalendarMonthEvent {
  id: number;
  name: string;
  slug: string;
  color: string;
  photo_count: number;
}

export interface DuplicateGroup {
  id: number;
  group_type: "exact" | "perceptual";
  keeper_id: number | null;
  files: MediaFile[];
}

export interface OrganizePreviewItem {
  file_id: number;
  source_path: string;
  target_path: string;
  filename: string;
}

export interface ReviewDecision {
  id: number;
  file_id: number;
  action: string;
  target_path: string | null;
  file: MediaFile | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getConfig: () => request<Config>("/api/config"),
  updateConfig: (data: Partial<Config>) =>
    request<Config>("/api/config", { method: "PATCH", body: JSON.stringify(data) }),

  scanInbox: () => request<{ ok: boolean }>("/api/scan/inbox", { method: "POST" }),
  scanArchive: () => request<{ ok: boolean }>("/api/scan/archive", { method: "POST" }),
  scanStatus: () => request<ScanStatus>("/api/scan/status"),

  listFiles: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") q.set(k, String(v));
    });
    return request<FileList>(`/api/files?${q}`);
  },

  thumbUrl: (id: number) => `/api/files/${id}/thumbnail`,
  originalUrl: (id: number) => `/api/files/${id}/original`,

  getMetadata: (id: number) => request<Metadata>(`/api/files/${id}/metadata`),
  updateMetadata: (id: number, data: Partial<Metadata>) =>
    request<Metadata>(`/api/files/${id}/metadata`, { method: "PATCH", body: JSON.stringify(data) }),

  calendarSummary: (year: number, month: number, location = "archive", eventId?: number) => {
    const q = new URLSearchParams({ year: String(year), month: String(month), location });
    if (eventId) q.set("event_id", String(eventId));
    return request<{ year: number; month: number; days: CalendarDaySummary[] }>(
      `/api/calendar/summary?${q}`
    );
  },

  calendarMonths: (location = "archive") => {
    const q = new URLSearchParams({ location });
    return request<{ months: CalendarMonthSummary[] }>(`/api/calendar/months?${q}`);
  },

  calendarEvents: (year: number, month: number, location = "archive") => {
    const q = new URLSearchParams({ year: String(year), month: String(month), location });
    return request<{ year: number; month: number; events: CalendarMonthEvent[] }>(
      `/api/calendar/events?${q}`
    );
  },

  calendarDay: (date: string, location = "archive", eventId?: number) => {
    const q = new URLSearchParams({ date, location });
    if (eventId) q.set("event_id", String(eventId));
    return request<FileList>(`/api/calendar/day?${q}`);
  },

  listEvents: () => request<Event[]>("/api/events"),
  createEvent: (data: { name: string; color?: string; description?: string; start_date?: string; end_date?: string }) =>
    request<Event>("/api/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (id: number, data: Partial<Event> & { tag_ids?: number[] }) =>
    request<Event>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEvent: (id: number) => request<{ ok: boolean }>(`/api/events/${id}`, { method: "DELETE" }),
  eventFiles: (id: number, page = 1) => request<FileList>(`/api/events/${id}/files?page=${page}`),
  assignEventIds: (id: number, fileIds: number[]) =>
    request<{ assigned: number }>(`/api/events/${id}/assign-ids`, {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds }),
    }),
  assignEventRange: (id: number, start_date: string, end_date: string, location = "archive") =>
    request<{ assigned: number }>(`/api/events/${id}/assign-range`, {
      method: "POST",
      body: JSON.stringify({ start_date, end_date, location }),
    }),
  setFileEvents: (fileId: number, eventIds: number[]) =>
    request<{ ok: boolean }>(`/api/files/${fileId}/events`, {
      method: "PATCH",
      body: JSON.stringify({ event_ids: eventIds }),
    }),

  listTags: () => request<Tag[]>("/api/tags"),
  createTag: (name: string) =>
    request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name }) }),

  listPeople: () => request<Person[]>("/api/people"),
  createPerson: (name: string) =>
    request<Person>("/api/people", { method: "POST", body: JSON.stringify({ name }) }),
  updatePerson: (id: number, data: { name: string }) =>
    request<Person>(`/api/people/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePerson: (id: number) => request<{ ok: boolean }>(`/api/people/${id}`, { method: "DELETE" }),
  mergePeople: (sourceId: number, targetId: number) =>
    request<Person>("/api/people/merge", {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    }),
  updateFilePeople: (fileId: number, personIds: number[]) =>
    request<{ ok: boolean }>(`/api/files/${fileId}/people`, {
      method: "PATCH",
      body: JSON.stringify({ person_ids: personIds }),
    }),
  assignPeopleIds: (personIds: number[], fileIds: number[]) =>
    request<{ assigned: number }>("/api/people/assign-ids", {
      method: "POST",
      body: JSON.stringify({ person_ids: personIds, file_ids: fileIds }),
    }),
  unassignPeopleIds: (personIds: number[], fileIds: number[]) =>
    request<{ removed: number }>("/api/people/unassign-ids", {
      method: "POST",
      body: JSON.stringify({ person_ids: personIds, file_ids: fileIds }),
    }),

  duplicates: () => request<DuplicateGroup[]>("/api/duplicates"),
  setKeeper: (groupId: number, keeperId: number) =>
    request<{ ok: boolean }>(`/api/duplicates/${groupId}/keeper`, {
      method: "PATCH",
      body: JSON.stringify({ keeper_id: keeperId }),
    }),

  organizePreview: () =>
    request<{ items: OrganizePreviewItem[]; total: number }>("/api/organize/preview", { method: "POST" }),

  previewInbox: () =>
    request<{ items: OrganizePreviewItem[]; total: number }>("/api/review/preview-inbox", { method: "POST" }),

  reviewQueue: () => request<{ items: ReviewDecision[]; total: number }>("/api/review/queue"),

  createDecision: (data: { file_id: number; action: string; target_path?: string }) =>
    request<ReviewDecision>("/api/review/decisions", { method: "POST", body: JSON.stringify(data) }),

  apply: () => request<{ applied: number; errors: string[] }>("/api/apply", { method: "POST" }),

  operations: () =>
    request<
      { id: number; operation: string; source_path: string; target_path: string | null; created_at: string }[]
    >("/api/operations"),
};
