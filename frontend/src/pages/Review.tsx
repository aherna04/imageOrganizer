import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import ApplyPanel from "../components/ApplyPanel";
import CollapsibleSection from "../components/CollapsibleSection";
import { invalidateAfterApply } from "../utils/invalidateAfterApply";

export default function Review() {
  const qc = useQueryClient();

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["review-queue"],
    queryFn: api.reviewQueue,
  });

  const { data: preview, refetch: refetchPreview } = useQuery({
    queryKey: ["organize-preview"],
    queryFn: api.organizePreview,
  });

  const previewInbox = useMutation({
    mutationFn: api.previewInbox,
    onSuccess: () => {
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

  const mismatchedIds =
    preview?.items.filter((item) => item.date_mismatch).map((item) => item.file_id) ?? [];

  const queueCount = queue?.total ?? 0;
  const previewCount = preview?.items.length ?? 0;
  const previewDefaultOpen = previewCount > 0 && queueCount === 0;

  const handleApplied = () => {
    invalidateAfterApply(qc);
    refetchPreview();
    refetchQueue();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Review & Apply</h2>
      </div>

      <div className="review-queue-panel">
        <div className="review-queue-panel-header">
          <h3 className="review-queue-panel-title">Review queue ({queueCount})</h3>
          <ApplyPanel onApplied={handleApplied} disabled={queueCount === 0} compact />
        </div>
        {queueCount === 0 ? (
          <p className="review-queue-empty">No queued decisions. Preview inbox organize below to queue files.</p>
        ) : (
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
              </div>
            ))}
          </div>
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
    </div>
  );
}
