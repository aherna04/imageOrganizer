import { Link } from "react-router-dom";
import { INBOX_BATCH_LIMIT } from "../api/client";

interface Props {
  availableCount: number;
  queueCount: number;
  selectedCount: number;
  submitting: boolean;
  onSubmitNext: () => void;
  onSubmitSelected: () => void;
  compact?: boolean;
}

export default function InboxReviewBatchBar({
  availableCount,
  queueCount,
  selectedCount,
  submitting,
  onSubmitNext,
  onSubmitSelected,
  compact = false,
}: Props) {
  const nextBatchSize = Math.min(INBOX_BATCH_LIMIT, availableCount);
  const selectedBatchSize = Math.min(INBOX_BATCH_LIMIT, selectedCount);

  if (availableCount === 0 && queueCount === 0) {
    return null;
  }

  const hint =
    availableCount > 0
      ? `${availableCount} ready · batches up to ${INBOX_BATCH_LIMIT}`
      : "No inbox photos left to queue";

  const actions = (
    <>
      {availableCount > 0 && (
        <button
          type="button"
          className="btn"
          disabled={submitting || nextBatchSize === 0}
          onClick={onSubmitNext}
        >
          {submitting ? "Submitting..." : `Submit next ${nextBatchSize}`}
        </button>
      )}
      {selectedCount > 0 && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={onSubmitSelected}
        >
          Submit {selectedBatchSize} selected
        </button>
      )}
      {queueCount > 0 && (
        <Link to="/review" className="btn btn-secondary">
          Review ({queueCount})
        </Link>
      )}
    </>
  );

  if (compact) {
    return (
      <>
        {actions}
        <span className="inbox-toolbar-hint">
          {hint}
          {selectedCount > INBOX_BATCH_LIMIT && (
            <> · first {INBOX_BATCH_LIMIT} selected only</>
          )}
        </span>
      </>
    );
  }

  return (
    <div className="inbox-review-batch-bar">
      <div className="inbox-review-batch-actions">{actions}</div>
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
