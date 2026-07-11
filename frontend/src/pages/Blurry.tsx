import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile, api } from "../api/client";
import BlurAnalysisStatusBanner from "../components/BlurAnalysisStatusBanner";
import PhotoDetail from "../components/PhotoDetail";
import PhotoGrid from "../components/PhotoGrid";
import { invalidateAfterReviewChange } from "../utils/invalidateAfterReviewChange";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { nextFileAfterRemoval } from "../utils/photoNavigation";

type LocationFilter = "all" | "inbox" | "archive";

export default function Blurry() {
  const qc = useQueryClient();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const listParams: Record<string, string | number | boolean | undefined> = {
    blurry: true,
    page_size: 200,
  };
  if (locationFilter !== "all") {
    listParams.location = locationFilter;
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["files", "blurry", locationFilter],
    queryFn: () => api.listFiles(listParams),
  });

  const analyzeInbox = useMutation({
    mutationFn: () => api.analyzeBlurInbox(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blur-analysis-status"] }),
  });

  const analyzeArchive = useMutation({
    mutationFn: () => api.analyzeBlurArchive(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blur-analysis-status"] }),
  });

  const analyzeAll = useMutation({
    mutationFn: () => api.analyzeBlurAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blur-analysis-status"] }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (fileIds: number[]) =>
      Promise.all(fileIds.map((file_id) => api.createDecision({ file_id, action: "delete" }))),
    onSuccess: () => {
      invalidateAfterReviewChange(qc);
      qc.invalidateQueries({ queryKey: ["files", "blurry"] });
      setSelectedIds([]);
      setDetailFile(null);
    },
  });

  const files = data?.items ?? [];
  const total = data?.total ?? 0;
  const analyzing = analyzeInbox.isPending || analyzeArchive.isPending || analyzeAll.isPending || analysisRunning;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDateChange = (keepFileId?: number, options?: { skipInvalidation?: boolean }) => {
    const openId = keepFileId ?? detailFile?.id;
    const prevItems = files;
    if (!options?.skipInvalidation) {
      invalidateAfterDateChange(qc);
      invalidateAfterReviewChange(qc);
      qc.invalidateQueries({ queryKey: ["files", "blurry"] });
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

  return (
    <div className="blurry-page">
      <div className="page-header">
        <h2>Blurry</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <BlurAnalysisStatusBanner onRunningChange={setAnalysisRunning} />
          {total > 0 && (
            <span className="badge" style={{ background: "#6366f1", color: "#fff" }}>
              {total} blurry
            </span>
          )}
          <button
            className="btn btn-secondary"
            disabled={analyzing}
            onClick={() => analyzeInbox.mutate()}
          >
            Analyze inbox
          </button>
          <button
            className="btn btn-secondary"
            disabled={analyzing}
            onClick={() => analyzeArchive.mutate()}
          >
            Analyze archive
          </button>
          <button className="btn" disabled={analyzing} onClick={() => analyzeAll.mutate()}>
            Analyze all
          </button>
        </div>
      </div>

      <p className="page-intro">
        Run sharpness analysis to find out-of-focus photos. Obvious outliers are flagged automatically; adjust
        the absolute threshold in Settings.
      </p>

      <div className="blurry-toolbar">
        <div className="photo-alerts-filter">
          <button
            type="button"
            className={`btn btn-secondary${locationFilter === "all" ? " active" : ""}`}
            onClick={() => setLocationFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn-secondary${locationFilter === "inbox" ? " active" : ""}`}
            onClick={() => setLocationFilter("inbox")}
          >
            Inbox
          </button>
          <button
            type="button"
            className={`btn btn-secondary${locationFilter === "archive" ? " active" : ""}`}
            onClick={() => setLocationFilter("archive")}
          >
            Archive
          </button>
        </div>

        {selectedIds.length > 0 && (
          <button
            className="btn btn-danger"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => bulkDeleteMutation.mutate(selectedIds)}
          >
            Mark {selectedIds.length} for delete
          </button>
        )}
      </div>

      {isLoading && <div className="empty-state">Loading…</div>}

      {!isLoading && files.length === 0 && (
        <div className="empty-state">
          No blurry photos detected. Run Analyze inbox or Analyze all to score sharpness. Obvious outliers are
          flagged automatically; raise the threshold in Settings to flag more.
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
        />
      )}
    </div>
  );
}
