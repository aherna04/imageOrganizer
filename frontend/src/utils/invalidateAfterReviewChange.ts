import { QueryClient } from "@tanstack/react-query";

/** Invalidate caches after a review decision (delete, skip, restore). Labels are unchanged. */
export function invalidateAfterReviewChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["files"] });
  qc.invalidateQueries({ queryKey: ["files", "inbox", "delete_queue_count"] });
  qc.invalidateQueries({ queryKey: ["review-queue"] });
  qc.invalidateQueries({ queryKey: ["browse-files"] });
  qc.invalidateQueries({ queryKey: ["browse-cooccurring"] });
  qc.invalidateQueries({ queryKey: ["tags"] });
  qc.invalidateQueries({ queryKey: ["people"] });
}
