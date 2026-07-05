import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { isCopyFilename } from "../utils/copyFilename";
import { formatFileSize } from "../utils/formatFileSize";

export default function Duplicates() {
  const qc = useQueryClient();
  const [markedForDelete, setMarkedForDelete] = useState<Record<number, Set<number>>>({});

  const { data: groups = [], refetch } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.duplicates,
  });

  const { data: reviewQueue } = useQuery({
    queryKey: ["review-queue"],
    queryFn: api.reviewQueue,
  });

  const queuedDeleteIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of reviewQueue?.items ?? []) {
      if (item.action === "delete") ids.add(item.file_id);
    }
    return ids;
  }, [reviewQueue]);

  const setKeeper = useMutation({
    mutationFn: ({ groupId, keeperId }: { groupId: number; keeperId: number }) =>
      api.setKeeper(groupId, keeperId),
    onSuccess: () => refetch(),
  });

  const dismissDuplicate = useMutation({
    mutationFn: ({ groupId, fileId }: { groupId: number; fileId: number }) =>
      api.dismissDuplicate(groupId, fileId),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["browse-files"] });
      qc.invalidateQueries({ queryKey: ["duplicates"] });
    },
  });

  const toggleMarkDelete = useCallback((groupId: number, fileId: number) => {
    setMarkedForDelete((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupId] ?? []);
      if (set.has(fileId)) set.delete(fileId);
      else set.add(fileId);
      if (set.size === 0) delete next[groupId];
      else next[groupId] = set;
      return next;
    });
  }, []);

  const clearGroupMarks = useCallback((groupId: number) => {
    setMarkedForDelete((prev) => {
      if (!prev[groupId]) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  }, []);

  const confirmGroupDeletes = async (groupId: number) => {
    const ids = markedForDelete[groupId];
    if (!ids?.size) return;
    for (const fileId of ids) {
      await dismissDuplicate.mutateAsync({ groupId, fileId });
    }
    clearGroupMarks(groupId);
  };

  return (
    <div className="duplicates-page">
      <div className="page-header">
        <h2>Duplicates</h2>
        <button className="btn btn-secondary" onClick={() => api.scanInbox().then(() => refetch())}>
          Re-scan inbox
        </button>
        <button className="btn btn-secondary" onClick={() => api.scanArchive().then(() => refetch())}>
          Re-scan archive
        </button>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">No duplicate groups found. Scan inbox or archive to detect duplicates.</div>
      )}

      <div className="duplicates-list">
      {groups.map((group) => {
        const keeper = group.files.find((f) => f.id === group.keeper_id);
        const largestSize = Math.max(...group.files.map((f) => f.size));
        const keeperIsLargest = keeper && keeper.size === largestSize && group.files.length > 1;
        const groupMarks = markedForDelete[group.id];
        const markedCount = groupMarks?.size ?? 0;

        return (
          <div key={group.id} className="duplicate-group">
            <div className="duplicate-group-header">
              <div className="duplicate-group-labels">
                <span className="badge" style={{ background: "#2a2f3a" }}>
                  {group.group_type}
                </span>
                <span className="duplicate-group-count">{group.files.length} files</span>
                {keeperIsLargest && (
                  <span className="duplicate-group-hint">Keeping largest file</span>
                )}
              </div>
              {markedCount > 0 && (
                <div className="duplicate-group-actions">
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                    onClick={() => clearGroupMarks(group.id)}
                  >
                    Clear
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                    disabled={dismissDuplicate.isPending}
                    onClick={() => confirmGroupDeletes(group.id)}
                  >
                    Delete {markedCount} selected
                  </button>
                </div>
              )}
            </div>
            <div className="duplicate-compare-grid">
              {group.files.map((file) => {
                const isKeeper = group.keeper_id === file.id;
                const isMarked = groupMarks?.has(file.id) ?? false;
                const isQueued = queuedDeleteIds.has(file.id);
                const isLargest = group.files.length > 1 && file.size === largestSize;
                const cardClass = [
                  "photo-card",
                  isKeeper && "duplicate-keeper",
                  isMarked && "duplicate-delete-marked",
                  isQueued && "duplicate-delete-queued",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                <div key={file.id} className={cardClass}>
                  {(isMarked || isQueued) && (
                    <div className="duplicate-delete-banner">
                      {isQueued ? "Queued for delete" : "Marked for delete"}
                    </div>
                  )}
                  <div className="photo-thumb">
                    <img src={api.thumbUrl(file.id)} alt={file.filename} />
                    {isCopyFilename(file.filename) && (
                      <span className="photo-alert-badge duplicate copy-filename-badge">copy</span>
                    )}
                  </div>
                  <div className="meta">
                    <div className="duplicate-filename">{file.filename}</div>
                    <div>
                      {file.location} · {file.capture_day}
                    </div>
                    <div className={`duplicate-file-size${isLargest ? " duplicate-file-size-largest" : ""}`}>
                      {formatFileSize(file.size)}
                      {isLargest && " · largest"}
                    </div>
                    <div className="duplicate-card-actions">
                      <button
                        className={`btn btn-secondary${isKeeper ? " duplicate-keeper-btn" : ""}`}
                        disabled={isQueued}
                        onClick={() => {
                          if (isMarked) toggleMarkDelete(group.id, file.id);
                          setKeeper.mutate({ groupId: group.id, keeperId: file.id });
                        }}
                      >
                        Keep
                      </button>
                      {!isKeeper && (
                        <button
                          className={`btn btn-danger${isMarked ? " duplicate-delete-btn-active" : ""}`}
                          disabled={isQueued || dismissDuplicate.isPending}
                          onClick={() => toggleMarkDelete(group.id, file.id)}
                        >
                          {isMarked ? "Selected" : isQueued ? "Queued" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
