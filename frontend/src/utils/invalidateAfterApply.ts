import { QueryClient } from "@tanstack/react-query";

export function invalidateAfterApply(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["review-queue"] });
  qc.invalidateQueries({ queryKey: ["organize-preview"] });
  qc.invalidateQueries({ queryKey: ["operations"] });
  qc.invalidateQueries({ queryKey: ["files"] });
  qc.invalidateQueries({ queryKey: ["tags"] });
  qc.invalidateQueries({ queryKey: ["people"] });
  qc.invalidateQueries({ queryKey: ["events"] });
  qc.invalidateQueries({ queryKey: ["browse-files"] });
  qc.invalidateQueries({ queryKey: ["duplicates"] });
  qc.invalidateQueries({ queryKey: ["calendar-labels"] });
  qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  qc.invalidateQueries({ queryKey: ["calendar-day"] });
  qc.invalidateQueries({ queryKey: ["calendar-months"] });
  qc.invalidateQueries({ queryKey: ["inbox-tags"] });
  qc.invalidateQueries({ queryKey: ["inbox-people"] });
  qc.invalidateQueries({ queryKey: ["files", "inbox", "delete_queue_count"] });
}

export const invalidateAfterQueueRelease = invalidateAfterApply;
