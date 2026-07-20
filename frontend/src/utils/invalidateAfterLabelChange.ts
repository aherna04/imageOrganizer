import { QueryClient } from "@tanstack/react-query";

export type LabelKind = "tags" | "people" | "events";

export interface InvalidateAfterLabelChangeOptions {
  /** Which label types changed. Defaults to all three. */
  kinds?: LabelKind[];
  /** Inbox facet bars (`inbox-tags` / `inbox-people`). */
  inboxFacets?: boolean;
  /** Calendar label/summary caches used by day/month/year panels. */
  calendarFacets?: boolean;
}

/**
 * Invalidate caches affected by tag/person/event assignment.
 * Does not wipe calendar date grids or review/delete queues — use
 * invalidateAfterDateChange / invalidateAfterReviewChange for those.
 * Callers own their current file-list refetch.
 */
export function invalidateAfterLabelChange(
  qc: QueryClient,
  options: InvalidateAfterLabelChangeOptions = {},
) {
  const kinds = options.kinds ?? (["tags", "people", "events"] as LabelKind[]);

  if (kinds.includes("tags")) {
    qc.invalidateQueries({ queryKey: ["tags"] });
    if (options.inboxFacets) {
      qc.invalidateQueries({ queryKey: ["inbox-tags"] });
    }
  }
  if (kinds.includes("people")) {
    qc.invalidateQueries({ queryKey: ["people"] });
    if (options.inboxFacets) {
      qc.invalidateQueries({ queryKey: ["inbox-people"] });
    }
  }
  if (kinds.includes("events")) {
    qc.invalidateQueries({ queryKey: ["events"] });
  }
  if (options.calendarFacets) {
    qc.invalidateQueries({ queryKey: ["calendar-labels"] });
    qc.invalidateQueries({ queryKey: ["calendar-summary"] });
    qc.invalidateQueries({ queryKey: ["calendar-year-labels"] });
  }
}
