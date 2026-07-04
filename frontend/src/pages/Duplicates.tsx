import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Duplicates() {
  const qc = useQueryClient();

  const { data: groups = [], refetch } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.duplicates,
  });

  const setKeeper = useMutation({
    mutationFn: ({ groupId, keeperId }: { groupId: number; keeperId: number }) =>
      api.setKeeper(groupId, keeperId),
    onSuccess: () => refetch(),
  });

  const markDelete = useMutation({
    mutationFn: (fileId: number) => api.createDecision({ file_id: fileId, action: "delete" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue"] }),
  });

  return (
    <div>
      <div className="page-header">
        <h2>Duplicates</h2>
        <button className="btn btn-secondary" onClick={() => api.scanArchive().then(() => refetch())}>
          Re-scan archive
        </button>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">No duplicate groups found. Scan the archive to detect duplicates.</div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="duplicate-group">
          <div style={{ marginBottom: "0.75rem" }}>
            <span className="badge" style={{ background: "#2a2f3a" }}>
              {group.group_type}
            </span>
            <span style={{ marginLeft: "0.5rem", color: "#8891a0" }}>
              {group.files.length} files
            </span>
          </div>
          <div className="photo-grid">
            {group.files.map((file) => (
              <div key={file.id} className="photo-card" style={{ borderColor: group.keeper_id === file.id ? "#22c55e" : undefined }}>
                <img src={api.thumbUrl(file.id)} alt={file.filename} />
                <div className="meta">
                  <div>{file.filename}</div>
                  <div>{file.location} · {file.capture_day}</div>
                  <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                      onClick={() => setKeeper.mutate({ groupId: group.id, keeperId: file.id })}
                    >
                      Keep
                    </button>
                    {group.keeper_id !== file.id && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
                        onClick={() => markDelete.mutate(file.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
