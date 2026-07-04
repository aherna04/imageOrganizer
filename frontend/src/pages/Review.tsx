import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import ApplyPanel from "../components/ApplyPanel";

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

  const { data: operations = [] } = useQuery({
    queryKey: ["operations"],
    queryFn: api.operations,
  });

  return (
    <div>
      <div className="page-header">
        <h2>Review & Apply</h2>
        <button className="btn" onClick={() => previewInbox.mutate()} disabled={previewInbox.isPending}>
          Preview inbox organize
        </button>
      </div>

      <h3>Organize preview</h3>
      {preview && preview.items.length > 0 ? (
        <table className="preview-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Target path</th>
            </tr>
          </thead>
          <tbody>
            {preview.items.map((item) => (
              <tr key={item.file_id}>
                <td>{item.filename}</td>
                <td className="path">{item.target_path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#8891a0" }}>No preview yet. Click "Preview inbox organize" to queue inbox files.</p>
      )}

      <h3 style={{ marginTop: "2rem" }}>Review queue ({queue?.total ?? 0})</h3>
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

      <ApplyPanel
        onApplied={() => {
          qc.invalidateQueries({ queryKey: ["review-queue"] });
          qc.invalidateQueries({ queryKey: ["organize-preview"] });
          qc.invalidateQueries({ queryKey: ["files"] });
          qc.invalidateQueries({ queryKey: ["operations"] });
          refetchPreview();
        }}
      />

      <h3 style={{ marginTop: "2rem" }}>Operations log</h3>
      {operations.slice(0, 20).map((op) => (
        <div key={op.id} className="review-item" style={{ fontSize: "0.875rem" }}>
          <span>{op.operation}</span>
          <span className="path">{op.source_path} → {op.target_path ?? "—"}</span>
          <span style={{ color: "#8891a0" }}>{op.created_at}</span>
        </div>
      ))}
    </div>
  );
}
