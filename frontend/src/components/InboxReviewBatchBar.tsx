import { Link } from "react-router-dom";
import { INBOX_BATCH_LIMIT } from "../api/client";

interface Props {
  availableCount: number;
  queueCount: number;
  selectedCount: number;
  submitting: boolean;
  onSubmitNext: () => void;
  onSubmitSelected: () => void;
}

export default function InboxReviewBatchBar({
  availableCount,
  queueCount,
  selectedCount,
  submitting,
  onSubmitNext,
  onSubmitSelected,
}: Props) {
  const nextBatchSize = Math.min(INBOX_BATCH_LIMIT, availableCount);
  const selectedBatchSize = Math.min(INBOX_BATCH_LIMIT, selectedCount);

  if (availableCount === 0 && queueCount === 0) {
    return null;
  }

  return (
    <div className="inbox-review-batch-bar">
      <div className="inbox-review-batch-actions">
        {availableCount > 0 && (
          <button
            type="button"
            className="btn"
            disabled={submitting || nextBatchSize === 0}
            onClick={onSubmitNext}
          >
            {submitting
              ? "Submitting..."
              : `Submit next ${nextBatchSize} to review`}
          </button>
        )}
        {selectedCount > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={submitting}
            onClick={onSubmitSelected}
          >
            Submit {selectedBatchSize} selected to review
          </button>
        )}
        {queueCount > 0 && (
          <Link to="/review" className="btn btn-secondary">
            Review queue ({queueCount})
          </Link>
        )}
      </div>
      <p className="inbox-review-batch-hint">
        {availableCount > 0
          ? `${availableCount} ready in inbox · batches up to ${INBOX_BATCH_LIMIT}`
          : "No inbox photos left to queue — apply on Review to finish this batch"}
        {selectedCount > INBOX_BATCH_LIMIT && (
          <> · Only the first {INBOX_BATCH_LIMIT} selected will be submitted</>
        )}
      </p>
    </div>
  );
}
