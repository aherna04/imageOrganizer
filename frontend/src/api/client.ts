export const INBOX_BATCH_LIMIT = 250;

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
  location: "inbox" | "archive" | "trash";
  media_type: "image" | "video";
  size: number;
  mtime: number;
  capture_date: string | null;
  capture_day: string | null;
  camera: string | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  phash: string | null;
  caption: string | null;
  rating: number | null;
  blur_score: number | null;
  is_blurry: boolean;
  events: Event[];
  people: Person[];
  tags: Tag[];
}

export interface FileList {
  items: MediaFile[];
  total: number;
  page: number;
  page_size: number;
}

export interface BrowseVennSet {
  key: string;
  kind: "person" | "tag" | "camera";
  id: number | null;
  name: string;
  slug: string | null;
  size: number;
}

export interface BrowseVennRegion {
  members: string[];
  count: number;
}

export interface BrowseVenn {
  sets: BrowseVennSet[];
  regions: BrowseVennRegion[];
}

export interface Config {
  inbox_path: string;
  archive_path: string;
  trash_path: string;
  date_pattern: string;
  rename_pattern: string;
  photo_sort_order: "asc" | "desc";
  blur_threshold: string;
  home_background_tag: string;
  view_skin_style: "off" | "soft" | "glass" | "vignette";
  view_skin_motion: "scroll" | "fixed";
  view_skin_interval_sec: string;
  media_root?: string | null;
  app_data_dir?: string | null;
  paths_from_env?: boolean;
  backup_media_root?: string | null;
  backup_media_host_path?: string | null;
  backup_media_ready?: boolean;
  media_host_path?: string | null;
  media_disk?: DiskUsage | null;
  backup_disk?: DiskUsage | null;
  container_root_disk?: DiskUsage | null;
  container_disk_low?: boolean;
  disk_free_unreliable?: boolean;
}

export interface DiskUsage {
  path: string;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
}

export interface LibraryMoveStatus {
  running: boolean;
  message: string | null;
  error: string | null;
  done: boolean;
  restart_required: boolean;
  phase?: string | null;
  copied_files?: number | null;
  total_files?: number | null;
  copied_bytes?: number | null;
  total_bytes?: number | null;
}

export interface StorageStats {
  catalog_bytes: number;
  catalog_count: number;
  images_bytes: number;
  image_count: number;
  videos_bytes: number;
  video_count: number;
  database_bytes: number;
}

export interface DatabaseBackup {
  path: string;
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface MosaicPreview {
  tile_count: number;
  columns: number;
  rows: number;
  output_width: number;
  output_height: number;
}

export interface MosaicResult {
  filename: string;
  url: string;
  file_id: number;
  width: number;
  height: number;
  tile_count: number;
  columns: number;
  rows: number;
}

export interface MosaicRequest {
  source_file_id: number;
  filter_type?: "all" | "tag" | "person" | "event";
  filter_id?: number;
  location?: "archive" | "all";
  columns?: number;
}

export interface WordSilhouetteDesign {
  id: number;
  name: string;
  slug: string;
  font_path: string;
  created_at?: string | null;
}

export type WordSilhouetteFillMode = "single" | "mosaic" | "per_letter";

export interface LetterFrame {
  pan_x: number;
  pan_y: number;
  zoom: number;
}

export interface WordSilhouetteRequest {
  text: string;
  design_id: number;
  fill_mode: WordSilhouetteFillMode;
  fill_file_id?: number;
  guide_file_id?: number;
  letter_file_ids?: number[];
  letter_frames?: LetterFrame[];
  filter_type?: "all" | "tag" | "person" | "event";
  filter_id?: number;
  location?: "archive" | "all";
  columns?: number;
  canvas_width?: number;
  padding?: number;
  background?: string;
}

export interface WordSilhouettePreview {
  preview_url: string;
  preview_filename: string;
  width: number;
  height: number;
  glyph_count: number;
  fill_mode: WordSilhouetteFillMode;
  tile_count: number;
  columns: number;
  rows: number;
}

export interface WordSilhouetteResult {
  filename: string;
  url: string;
  file_id: number;
  width: number;
  height: number;
  glyph_count: number;
  fill_mode: WordSilhouetteFillMode;
  tile_count: number;
  columns: number;
  rows: number;
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
  phase: "idle" | "scanning" | "pruning" | "building_duplicates";
}

export interface BlurAnalysisStatus {
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

export interface CalendarMonthPerson {
  id: number;
  name: string;
  slug: string;
  photo_count: number;
}

export interface CalendarMonthTag {
  id: number;
  name: string;
  slug: string;
  photo_count: number;
}

export type InboxUsedTag = CalendarMonthTag;
export type InboxUsedPerson = CalendarMonthPerson;

export interface InboxUsedCamera {
  name: string;
  photo_count: number;
}

export interface Camera {
  name: string;
  photo_count: number;
  inbox_count: number;
  archive_count: number;
}

export interface CalendarMonthLabels {
  year: number;
  month: number;
  events: CalendarMonthEvent[];
  people: CalendarMonthPerson[];
  tags: CalendarMonthTag[];
  unlabeled_count: number;
}

export type CalendarMonthFilter =
  | { year: number; month: number; kind: "event"; id: number }
  | { year: number; month: number; kind: "person"; id: number }
  | { year: number; month: number; kind: "tag"; id: number }
  | { year: number; month: number; kind: "unlabeled" };

export interface CalendarYearLabels {
  year: number;
  events: CalendarMonthEvent[];
  people: CalendarMonthPerson[];
  tags: CalendarMonthTag[];
  unlabeled_count: number;
}

export type CalendarYearFilter =
  | { year: number; kind: "event"; id: number }
  | { year: number; kind: "person"; id: number }
  | { year: number; kind: "tag"; id: number }
  | { year: number; kind: "unlabeled" };

export type CalendarMediaType = "all" | "image" | "video";

export interface CalendarDayFilter {
  eventId?: number;
  personId?: number;
  tagId?: number;
  unlabeled?: boolean;
}

function appendCalendarFilter(q: URLSearchParams, filter?: CalendarDayFilter) {
  if (filter?.eventId) q.set("event_id", String(filter.eventId));
  if (filter?.personId) q.set("person_id", String(filter.personId));
  if (filter?.tagId) q.set("tag_id", String(filter.tagId));
  if (filter?.unlabeled) q.set("unlabeled", "true");
}

function appendMediaType(q: URLSearchParams, mediaType?: CalendarMediaType) {
  if (mediaType && mediaType !== "all") q.set("media_type", mediaType);
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
  organize_date: string | null;
  filename_date: string | null;
  date_mismatch: boolean;
  suggested_target_path: string | null;
  suggested_filename: string | null;
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
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed?.detail === "string") message = parsed.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getConfig: () => request<Config>("/api/config"),
  getStorageStats: () => request<StorageStats>("/api/storage/stats"),
  createDatabaseBackup: () =>
    request<DatabaseBackup>("/api/database/backup", { method: "POST" }),
  listDatabaseBackups: () =>
    request<{ items: DatabaseBackup[] }>("/api/database/backups"),

  mosaicPreview: (body: MosaicRequest) =>
    request<MosaicPreview>("/api/mosaic/preview", { method: "POST", body: JSON.stringify(body) }),

  mosaicGenerate: (body: MosaicRequest) =>
    request<MosaicResult>("/api/mosaic/generate", { method: "POST", body: JSON.stringify(body) }),

  listWordSilhouetteDesigns: () =>
    request<WordSilhouetteDesign[]>("/api/word-silhouette/designs"),

  createWordSilhouetteDesign: async (name: string, font: File) => {
    const form = new FormData();
    form.append("name", name);
    form.append("font", font);
    const res = await fetch("/api/word-silhouette/designs", { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text();
      let message = text || res.statusText;
      try {
        const parsed = JSON.parse(text) as { detail?: unknown };
        if (typeof parsed?.detail === "string") message = parsed.detail;
      } catch {
        /* not JSON */
      }
      throw new Error(message);
    }
    return res.json() as Promise<WordSilhouetteDesign>;
  },

  renameWordSilhouetteDesign: (id: number, name: string) =>
    request<WordSilhouetteDesign>(`/api/word-silhouette/designs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteWordSilhouetteDesign: (id: number) =>
    request<{ ok: boolean }>(`/api/word-silhouette/designs/${id}`, { method: "DELETE" }),

  wordSilhouettePreview: (body: WordSilhouetteRequest) =>
    request<WordSilhouettePreview>("/api/word-silhouette/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  wordSilhouetteGenerate: (body: WordSilhouetteRequest) =>
    request<WordSilhouetteResult>("/api/word-silhouette/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateConfig: (data: Partial<Config>) =>
    request<Config>("/api/config", { method: "PATCH", body: JSON.stringify(data) }),

  moveLibrary: (new_media_root: string, rewrite_only = false, rewrite_paths = true) =>
    request<LibraryMoveStatus>("/api/library/move", {
      method: "POST",
      body: JSON.stringify({ new_media_root, rewrite_only, rewrite_paths }),
    }),
  moveLibraryStatus: () => request<LibraryMoveStatus>("/api/library/move/status"),
  updateBackup: () =>
    request<LibraryMoveStatus>("/api/library/backup-sync", { method: "POST" }),

  scanInbox: () => request<{ ok: boolean }>("/api/scan/inbox", { method: "POST" }),
  scanArchive: () => request<{ ok: boolean }>("/api/scan/archive", { method: "POST" }),
  scanTrash: () => request<{ ok: boolean }>("/api/scan/trash", { method: "POST" }),
  scanStatus: () => request<ScanStatus>("/api/scan/status"),

  analyzeBlurInbox: () => request<{ ok: boolean }>("/api/blur-analysis/inbox", { method: "POST" }),
  analyzeBlurArchive: () => request<{ ok: boolean }>("/api/blur-analysis/archive", { method: "POST" }),
  analyzeBlurAll: () => request<{ ok: boolean }>("/api/blur-analysis/all", { method: "POST" }),
  blurAnalysisStatus: () => request<BlurAnalysisStatus>("/api/blur-analysis/status"),

  inboxTags: () => request<{ tags: InboxUsedTag[] }>("/api/inbox/tags"),

  inboxPeople: () => request<{ people: InboxUsedPerson[] }>("/api/inbox/people"),

  inboxCameras: () => request<{ cameras: InboxUsedCamera[] }>("/api/inbox/cameras"),

  listCameras: () => request<{ cameras: Camera[] }>("/api/cameras"),

  listFiles: (params: Record<string, string | number | boolean | (string | number)[] | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === "") return;
      if (Array.isArray(v)) {
        v.forEach((item) => q.append(k, String(item)));
      } else {
        q.set(k, String(v));
      }
    });
    return request<FileList>(`/api/files?${q}`);
  },

  getFile: (id: number) => request<MediaFile>(`/api/files/${id}`),

  thumbUrl: (id: number, mtime?: number) =>
    mtime != null ? `/api/files/${id}/thumbnail?v=${encodeURIComponent(String(mtime))}` : `/api/files/${id}/thumbnail`,
  originalUrl: (id: number, mtime?: number) =>
    mtime != null ? `/api/files/${id}/original?v=${encodeURIComponent(String(mtime))}` : `/api/files/${id}/original`,
  playUrl: (id: number, mtime?: number) =>
    mtime != null ? `/api/files/${id}/play?v=${encodeURIComponent(String(mtime))}` : `/api/files/${id}/play`,

  rotateFile: (id: number, direction: "left" | "right") =>
    request<MediaFile>(`/api/files/${id}/rotate`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    }),

  getMetadata: (id: number) => request<Metadata>(`/api/files/${id}/metadata`),
  updateMetadata: (id: number, data: Partial<Metadata>) =>
    request<Metadata>(`/api/files/${id}/metadata`, { method: "PATCH", body: JSON.stringify(data) }),

  setCaptureDates: (fileIds: number[], captureDate: string) =>
    request<{ updated: number }>("/api/files/capture-dates", {
      method: "PATCH",
      body: JSON.stringify({ file_ids: fileIds, capture_date: captureDate }),
    }),

  fixDatesFromFilename: (fileIds: number[]) =>
    request<{ fixed: number; skipped: number }>("/api/files/fix-dates-from-filename", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  calendarSummary: (
    year: number,
    month: number,
    location = "archive",
    filter?: CalendarDayFilter,
    mediaType: CalendarMediaType = "all"
  ) => {
    const q = new URLSearchParams({ year: String(year), month: String(month), location });
    appendCalendarFilter(q, filter);
    appendMediaType(q, mediaType);
    return request<{ year: number; month: number; days: CalendarDaySummary[] }>(
      `/api/calendar/summary?${q}`
    );
  },

  calendarMonths: (
    location = "archive",
    mediaType: CalendarMediaType = "all",
    unlabeled = false,
  ) => {
    const q = new URLSearchParams({ location });
    appendMediaType(q, mediaType);
    if (unlabeled) q.set("unlabeled", "true");
    return request<{ months: CalendarMonthSummary[] }>(`/api/calendar/months?${q}`);
  },

  calendarLabels: (
    year: number,
    month: number,
    location = "archive",
    mediaType: CalendarMediaType = "all"
  ) => {
    const q = new URLSearchParams({ year: String(year), month: String(month), location });
    appendMediaType(q, mediaType);
    return request<CalendarMonthLabels>(`/api/calendar/labels?${q}`);
  },

  calendarYearLabels: (year: number, location = "archive", mediaType: CalendarMediaType = "all") => {
    const q = new URLSearchParams({ year: String(year), location });
    appendMediaType(q, mediaType);
    return request<CalendarYearLabels>(`/api/calendar/year-labels?${q}`);
  },

  calendarEvents: (year: number, month: number, location = "archive") => {
    const q = new URLSearchParams({ year: String(year), month: String(month), location });
    return request<{ year: number; month: number; events: CalendarMonthEvent[] }>(
      `/api/calendar/events?${q}`
    );
  },

  calendarDay: (
    date: string,
    location = "archive",
    filter?: CalendarDayFilter,
    mediaType: CalendarMediaType = "all",
    page = 1,
    pageSize = 100
  ) => {
    const q = new URLSearchParams({ date, location, page: String(page), page_size: String(pageSize) });
    appendCalendarFilter(q, filter);
    appendMediaType(q, mediaType);
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

  listCooccurringTags: (tagIds: number[], location?: string) => {
    const q = new URLSearchParams();
    tagIds.forEach((id) => q.append("tag_id", String(id)));
    if (location) q.set("location", location);
    return request<{ tags: Tag[] }>(`/api/tags/cooccurring?${q}`);
  },

  listBrowseCooccurring: (opts: {
    tagIds?: number[];
    personIds?: number[];
    cameraNames?: string[];
    location?: string;
  }) => {
    const q = new URLSearchParams();
    (opts.tagIds ?? []).forEach((id) => q.append("tag_id", String(id)));
    (opts.personIds ?? []).forEach((id) => q.append("person_id", String(id)));
    (opts.cameraNames ?? []).forEach((name) => q.append("camera", name));
    if (opts.location) q.set("location", opts.location);
    return request<{ tags: Tag[]; people: Person[]; cameras: InboxUsedCamera[] }>(
      `/api/browse/cooccurring?${q}`,
    );
  },
  listBrowseVenn: (opts: {
    tagIds?: number[];
    personIds?: number[];
    cameraNames?: string[];
    location?: string;
  }) => {
    const q = new URLSearchParams();
    (opts.tagIds ?? []).forEach((id) => q.append("tag_id", String(id)));
    (opts.personIds ?? []).forEach((id) => q.append("person_id", String(id)));
    (opts.cameraNames ?? []).forEach((name) => q.append("camera", name));
    if (opts.location) q.set("location", opts.location);
    return request<BrowseVenn>(`/api/browse/venn?${q}`);
  },
  createTag: (name: string) =>
    request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name }) }),
  updateTag: (id: number, data: { name: string }) =>
    request<Tag>(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTag: (id: number) => request<{ ok: boolean }>(`/api/tags/${id}`, { method: "DELETE" }),
  mergeTags: (sourceId: number, targetId: number) =>
    request<Tag>("/api/tags/merge", {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    }),
  updateFileTags: (fileId: number, tagIds: number[]) =>
    request<{ ok: boolean }>(`/api/files/${fileId}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tag_ids: tagIds }),
    }),
  assignTagIds: (tagIds: number[], fileIds: number[]) =>
    request<{ assigned: number }>("/api/tags/assign-ids", {
      method: "POST",
      body: JSON.stringify({ tag_ids: tagIds, file_ids: fileIds }),
    }),
  unassignTagIds: (tagIds: number[], fileIds: number[]) =>
    request<{ removed: number }>("/api/tags/unassign-ids", {
      method: "POST",
      body: JSON.stringify({ tag_ids: tagIds, file_ids: fileIds }),
    }),

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
  rebuildDuplicates: () =>
    request<{ ok: boolean; running: boolean; message: string | null }>("/api/duplicates/rebuild", {
      method: "POST",
    }),
  setKeeper: (groupId: number, keeperId: number) =>
    request<{ ok: boolean }>(`/api/duplicates/${groupId}/keeper`, {
      method: "PATCH",
      body: JSON.stringify({ keeper_id: keeperId }),
    }),

  dismissDuplicate: (groupId: number, fileId: number) =>
    request<{ ok: boolean; merged: boolean }>(`/api/duplicates/${groupId}/dismiss/${fileId}`, {
      method: "POST",
    }),

  organizePreview: () =>
    request<{ items: OrganizePreviewItem[]; total: number; inbox_total?: number }>(
      "/api/organize/preview",
      { method: "POST" },
    ),

  fixOrganizeDates: (fileIds: number[] = []) =>
    request<{ fixed: number; items: OrganizePreviewItem[]; total: number }>("/api/organize/fix-dates", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  previewInbox: (body?: { file_ids?: number[]; append?: boolean }) =>
    request<{ items: OrganizePreviewItem[]; total: number; inbox_total?: number }>(
      "/api/review/preview-inbox",
      { method: "POST", body: JSON.stringify(body ?? { append: true }) },
    ),

  reviewQueue: () => request<{ items: ReviewDecision[]; total: number }>("/api/review/queue"),

  releaseReviewQueue: (fileIds?: number[]) =>
    request<{ removed: number }>("/api/review/queue/release", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds ?? [] }),
    }),

  createDecision: (data: { file_id: number; action: string; target_path?: string }) =>
    request<ReviewDecision>("/api/review/decisions", { method: "POST", body: JSON.stringify(data) }),

  cancelReviewDecisions: (fileIds: number[], action: "delete" = "delete") =>
    request<{ removed: number }>("/api/review/decisions/cancel", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds, action }),
    }),

  apply: () => request<{ applied: number; errors: string[] }>("/api/apply", { method: "POST" }),

  restoreFromTrash: (fileIds: number[]) =>
    request<{ restored: number; errors: string[] }>("/api/trash/restore", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  operations: () =>
    request<
      { id: number; operation: string; source_path: string; target_path: string | null; created_at: string }[]
    >("/api/operations"),
};
