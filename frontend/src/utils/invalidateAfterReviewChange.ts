import { QueryClient } from "@tanstack/react-query";

/** Invalidate caches after a review decision (delete, skip, restore). */
export function invalidateAfterReviewChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["files"] });
  qc.invalidateQueries({ queryKey: ["tags"] });
  qc.invalidateQueries({ queryKey: ["people"] });
  qc.invalidateQueries({ queryKey: ["events"] });
  qc.invalidateQueries({ queryKey: ["inbox-tags"] });
  qc.invalidateQueries({ queryKey: ["inbox-people"] });
  qc.invalidateQueries({ queryKey: ["files", "inbox", "delete_queue_count"] });
  qc.invalidateQueries({ queryKey: ["review-queue"] });
}
