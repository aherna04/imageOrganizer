import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { MediaFile, api } from "../api/client";
import PhotoDetail from "../components/PhotoDetail";
import PhotoGrid from "../components/PhotoGrid";
import ScanStatusBanner from "../components/ScanStatusBanner";
import { invalidateAfterReviewChange } from "../utils/invalidateAfterReviewChange";
import { nextFileAfterRemoval } from "../utils/photoNavigation";

export default function Trash() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [scanRunning, setScanRunning] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["files", "trash"],
    queryFn: () => api.listFiles({ location: "trash", page_size: 200 }),
  });

  const scan = useMutation({
    mutationFn: api.scanTrash,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
      setTimeout(() => refetch(), 2000);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (fileIds: number[]) => api.restoreFromTrash(fileIds),
    onSuccess: () => {
      invalidateAfterReviewChange(qc);
      qc.invalidateQueries({ queryKey: ["files", "trash"] });
    },
  });

  const files = data?.items ?? [];
  const total = data?.total ?? 0;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDateChange = (keepFileId?: number, options?: { skipInvalidation?: boolean }) => {
    const openId = keepFileId ?? detailFile?.id;
    const prevItems = files;
    if (!options?.skipInvalidation) {
      invalidateAfterReviewChange(qc);
      qc.invalidateQueries({ queryKey: ["files", "trash"] });
    }
    refetch().then(({ data: listData }) => {
      if (!openId) return;
      const still = listData?.items.find((f) => f.id === openId);
      if (still) {
        setDetailFile(still);
        return;
      }
      setDetailFile(nextFileAfterRemoval(prevItems, openId, listData?.items ?? []));
    });
  };

  const handleBulkRestore = () => {
    if (selectedIds.length === 0) return;
    restoreMutation.mutate(selectedIds, {
      onSuccess: () => {
        setSelectedIds([]);
        setDetailFile(null);
      },
    });
  };

  const handleScanRunningChange = useCallback((running: boolean) => {
    setScanRunning(running);
  }, []);

  return (
    <div className="trash-page">
      <div className="page-header">
        <h2>Trash</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <ScanStatusBanner onRunningChange={handleScanRunningChange} />
          {total > 0 && (
            <span className="badge" style={{ background: "#6366f1", color: "#fff" }}>
              {total} in trash
            </span>
          )}
          <button className="btn" onClick={() => scan.mutate()} disabled={scan.isPending || scanRunning}>
            Scan trash
          </button>
        </div>
      </div>

      <p className="page-intro">
        Photos moved to <code>.trash/</code> after Apply. Restore returns them to their original location. This is
        different from the Inbox <strong>Delete queue</strong>, which shows photos marked for delete before Apply.
      </p>

      {selectedIds.length > 0 && (
        <div className="trash-toolbar">
          <button
            className="btn btn-secondary"
            disabled={restoreMutation.isPending}
            onClick={handleBulkRestore}
          >
            Restore {selectedIds.length}
          </button>
        </div>
      )}

      {isLoading && <div className="empty-state">Loading…</div>}

      {!isLoading && files.length === 0 && (
        <div className="empty-state">
          Trash is empty. Deleted photos appear here after Apply, or run Scan trash to index files already in{" "}
          <code>.trash/</code>.
        </div>
      )}

      {!isLoading && files.length > 0 && (
        <PhotoGrid
          files={files}
          selectedIds={selectedIds}
          activeDetailId={detailFile?.id}
          multiSelectMode
          onToggleSelect={(id) => toggleSelect(id)}
          onOpenDetail={setDetailFile}
        />
      )}

      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={files}
          onChangeFile={setDetailFile}
          onDateChange={handleDateChange}
          onClose={() => setDetailFile(null)}
          trashMode
        />
      )}
    </div>
  );
}
