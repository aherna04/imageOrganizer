import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { MediaFile, api } from "../api/client";
import ApplyPanel from "../components/ApplyPanel";
import CollapsibleSection from "../components/CollapsibleSection";
import PhotoDetail from "../components/PhotoDetail";
import PhotoGrid from "../components/PhotoGrid";
import { invalidateAfterApply, invalidateAfterQueueRelease } from "../utils/invalidateAfterApply";
import { invalidateAfterReviewChange } from "../utils/invalidateAfterReviewChange";
import { togglePhotoSelection } from "../utils/photoSelection";

type QueueView = "list" | "grid";

export default function Review() {
  const qc = useQueryClient();
  const [queueView, setQueueView] = useState<QueueView>("list");
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectionAnchorRef = useRef<number | null>(null);

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["review-queue"],
    queryFn: api.reviewQueue,
  });

  const { data: preview, refetch: refetchPreview } = useQuery({
    queryKey: ["organize-preview"],
    queryFn: api.organizePreview,
  });

  const previewInbox = useMutation({
    mutationFn: () => api.previewInbox({ append: true }),
    onSuccess: () => {
      refetchQueue();
      refetchPreview();
    },
  });

  const releaseQueue = useMutation({
    mutationFn: () => api.releaseReviewQueue(),
    onSuccess: () => {
      invalidateAfterQueueRelease(qc);
      setDetailFile(null);
      setSelectedIds([]);
      selectionAnchorRef.current = null;
      refetchQueue();
      refetchPreview();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (fileIds: number[]) => api.cancelReviewDecisions(fileIds),
    onSuccess: () => {
      invalidateAfterReviewChange(qc);
      refetchQueue();
      refetchPreview();
    },
  });

  const fixDates = useMutation({
    mutationFn: (fileIds: number[]) => api.fixOrganizeDates(fileIds),
    onSuccess: () => {
      refetchPreview();
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const { data: operations = [] } = useQuery({
    queryKey: ["operations"],
    queryFn: api.operations,
  });

  const queueFiles = useMemo(
    () =>
      (queue?.items ?? [])
        .map((item) => item.file)
        .filter((file): file is MediaFile => file != null),
    [queue?.items],
  );

  const deleteFileIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of queue?.items ?? []) {
      if (item.action === "delete") {
        ids.add(item.file_id);
      }
    }
    return ids;
  }, [queue?.items]);

  const deleteCount = deleteFileIds.size;

  const targetPathByFileId = useMemo(() => {
    const map: Record<number, string> = {};
    for (const item of queue?.items ?? []) {
      if (item.target_path) {
        map[item.file_id] = item.target_path;
      }
    }
    return map;
  }, [queue?.items]);

  const mismatchedIds =
    preview?.items.filter((item) => item.date_mismatch).map((item) => item.file_id) ?? [];

  const queueCount = queue?.total ?? 0;
  const previewCount = preview?.items.length ?? 0;
  const previewDefaultOpen = previewCount > 0 && queueCount === 0;
  const previewBatchLimited =
    preview?.inbox_total != null && preview.inbox_total > preview.total;

  const selectedDeleteIds = selectedIds.filter((id) => deleteFileIds.has(id));

  const handleApplied = () => {
    invalidateAfterApply(qc);
    setDetailFile(null);
    setSelectedIds([]);
    selectionAnchorRef.current = null;
    refetchPreview();
    refetchQueue();
  };

  const handleRestore = (fileIds: number[]) => {
    const ids = fileIds.filter((id) => deleteFileIds.has(id));
    if (ids.length === 0) return;
    restoreMutation.mutate(ids, {
      onSuccess: () => {
        if (detailFile && ids.includes(detailFile.id)) {
          setDetailFile(null);
        }
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      },
    });
  };

  const handleReturnToInbox = () => {
    if (queueCount === 0 || releaseQueue.isPending) return;
    const message =
      queueCount > 10
        ? `Return all ${queueCount} queued photos to Inbox? They will be available for review there again.`
        : `Return ${queueCount} queued photo${queueCount === 1 ? "" : "s"} to Inbox?`;
    if (!window.confirm(message)) return;
    releaseQueue.mutate();
  };

  const toggleSelect = (id: number, event: React.MouseEvent) => {
    const result = togglePhotoSelection(
      queueFiles,
      selectedIds,
      id,
      event.shiftKey,
      selectionAnchorRef.current,
    );
    selectionAnchorRef.current = result.anchorIndex;
    setSelectedIds(result.selectedIds);
  };

  const handleDetailChange = () => {
    refetchQueue();
    refetchPreview();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Review & Apply</h2>
      </div>

      <div className="review-queue-panel">
        <div className="review-queue-panel-header">
          <h3 className="review-queue-panel-title">Review queue ({queueCount})</h3>
          <div className="review-queue-actions">
            {queueCount > 0 && (
              <>
                <div className="review-queue-view-toggle">
                  <button
                    type="button"
                    className={`btn btn-secondary${queueView === "list" ? " active" : ""}`}
                    onClick={() => setQueueView("list")}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary${queueView === "grid" ? " active" : ""}`}
                    onClick={() => setQueueView("grid")}
                  >
                    Grid
                  </button>
                </div>
                {deleteCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={restoreMutation.isPending}
                    onClick={() => handleRestore([...deleteFileIds])}
                  >
                    {restoreMutation.isPending ? "Restoring..." : `Restore all deletes (${deleteCount})`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={releaseQueue.isPending}
                  onClick={handleReturnToInbox}
                >
                  {releaseQueue.isPending ? "Returning..." : "Return to inbox"}
                </button>
              </>
            )}
            <ApplyPanel onApplied={handleApplied} disabled={queueCount === 0} compact />
          </div>
        </div>
        {queueCount === 0 ? (
          <p className="review-queue-empty">
            No queued decisions. Submit a batch from Inbox or preview inbox organize below.
          </p>
        ) : (
          <>
            {previewBatchLimited && (
              <p className="review-batch-hint">
                Batch limit: {preview!.total} of {preview!.inbox_total} inbox photos queued (oldest first).
                Apply this batch, then submit the next from Inbox or preview again.
              </p>
            )}
            {queueView === "list" ? (
              <div className="review-queue-list">
                {queue?.items.map((item) => (
                  <div key={item.id} className="review-item">
                    <div>
                      <strong>{item.file?.filename ?? `File #${item.file_id}`}</strong>
                      <div style={{ color: "#8891a0", fontSize: "0.875rem" }}>
                        {item.action}
                        {item.target_path && ` → ${item.target_path}`}
                      </div>
                    </div>
                    {item.action === "delete" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={restoreMutation.isPending}
                        onClick={() => handleRestore([item.file_id])}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="review-queue-grid">
                {selectedDeleteIds.length > 0 && (
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={restoreMutation.isPending}
                      onClick={() => handleRestore(selectedDeleteIds)}
                    >
                      Restore {selectedDeleteIds.length}
                    </button>
                  </div>
                )}
                <PhotoGrid
                  files={queueFiles}
                  selectedIds={selectedIds}
                  activeDetailId={detailFile?.id}
                  onToggleSelect={toggleSelect}
                  onOpenDetail={setDetailFile}
                  multiSelectMode
                  subtitleByFileId={targetPathByFileId}
                />
              </div>
            )}
          </>
        )}
      </div>

      <CollapsibleSection
        title="Organize preview"
        count={previewCount}
        defaultOpen={previewDefaultOpen}
        bodyScroll
        actions={
          <button
            className="btn btn-secondary"
            onClick={() => previewInbox.mutate()}
            disabled={previewInbox.isPending}
          >
            {previewInbox.isPending ? "Previewing..." : "Preview inbox organize"}
          </button>
        }
      >
        {preview && preview.items.length > 0 ? (
          <>
            {previewBatchLimited && (
              <p className="review-batch-hint">
                Batch limit: {preview.total} of {preview.inbox_total} inbox photos (oldest first).
                Apply this batch, then submit the next from Inbox or preview again.
              </p>
            )}
            {mismatchedIds.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <button
                  className="btn btn-secondary"
                  disabled={fixDates.isPending}
                  onClick={() => fixDates.mutate([])}
                >
                  Fix all date mismatches ({mismatchedIds.length})
                </button>
              </div>
            )}
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Target path</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <tr
                      key={item.file_id}
                      className={item.date_mismatch ? "preview-row-mismatch" : undefined}
                    >
                      <td>{item.filename}</td>
                      <td className="path">
                        {item.target_path}
                        {item.date_mismatch && item.suggested_target_path && (
                          <div className="preview-suggested-path">
                            Suggested: {item.suggested_target_path}
                          </div>
                        )}
                      </td>
                      <td>
                        {item.date_mismatch ? (
                          <span className="preview-date-warning">
                            Mismatch: prefix {item.organize_date}, filename {item.filename_date}
                          </span>
                        ) : (
                          item.organize_date ?? "—"
                        )}
                      </td>
                      <td>
                        {item.date_mismatch && (
                          <button
                            className="btn btn-secondary"
                            disabled={fixDates.isPending}
                            onClick={() => fixDates.mutate([item.file_id])}
                          >
                            Use filename date
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ color: "#8891a0", margin: 0 }}>
            No preview yet. Click &quot;Preview inbox organize&quot; to queue inbox files.
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Operations log" count={operations.length} defaultOpen={false} bodyScroll>
        {operations.length === 0 ? (
          <p style={{ color: "#8891a0", margin: 0 }}>No operations yet.</p>
        ) : (
          operations.slice(0, 20).map((op) => (
            <div key={op.id} className="review-item" style={{ fontSize: "0.875rem" }}>
              <span>{op.operation}</span>
              <span className="path">
                {op.source_path} → {op.target_path ?? "—"}
              </span>
              <span style={{ color: "#8891a0" }}>{op.created_at}</span>
            </div>
          ))
        )}
      </CollapsibleSection>

      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={queueFiles}
          onChangeFile={setDetailFile}
          onClose={() => setDetailFile(null)}
          deleteQueueMode={deleteFileIds.has(detailFile.id)}
          onDateChange={handleDetailChange}
        />
      )}
    </div>
  );
}
