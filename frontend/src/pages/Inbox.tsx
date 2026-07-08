import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { INBOX_BATCH_LIMIT, MediaFile, api } from "../api/client";
import BulkEventAssignBar from "../components/BulkEventAssignBar";
import InboxReviewBatchBar from "../components/InboxReviewBatchBar";
import InboxUsedCamerasBar from "../components/InboxUsedCamerasBar";
import InboxUsedPeopleBar from "../components/InboxUsedPeopleBar";
import InboxUsedTagsBar from "../components/InboxUsedTagsBar";
import PhotoGridWithAlerts from "../components/PhotoGridWithAlerts";
import PhotoDetail from "../components/PhotoDetail";
import SingleFileLabelEditors from "../components/SingleFileLabelEditors";
import BulkLabelEditors from "../components/BulkLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { isEditableTarget } from "../utils/photoNavigation";
import { togglePhotoSelection } from "../utils/photoSelection";

type InboxFilter = "all" | "unlabeled" | "delete_queue";

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [tagFilterId, setTagFilterId] = useState<number | null>(null);
  const [personFilterId, setPersonFilterId] = useState<number | null>(null);
  const [cameraFilter, setCameraFilter] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
  });

  const { data: usedTagsData } = useQuery({
    queryKey: ["inbox-tags"],
    queryFn: api.inboxTags,
  });

  const { data: usedPeopleData } = useQuery({
    queryKey: ["inbox-people"],
    queryFn: api.inboxPeople,
  });

  const { data: deleteQueueCountData } = useQuery({
    queryKey: ["files", "inbox", "delete_queue_count"],
    queryFn: () => api.listFiles({ location: "inbox", pending_delete: true, page_size: 1 }),
  });

  const { data: reviewQueue } = useQuery({
    queryKey: ["review-queue"],
    queryFn: api.reviewQueue,
  });

  const deleteQueueCount = deleteQueueCountData?.total ?? 0;

  const { data, refetch } = useQuery({
    queryKey: ["files", "inbox", inboxFilter, tagFilterId, personFilterId, cameraFilter],
    queryFn: () =>
      api.listFiles({
        location: "inbox",
        page_size: 200,
        ...(inboxFilter === "unlabeled" ? { unlabeled: true } : {}),
        ...(inboxFilter === "delete_queue" ? { pending_delete: true } : {}),
        ...(tagFilterId ? { tag_id: tagFilterId } : {}),
        ...(personFilterId ? { person_id: personFilterId } : {}),
        ...(cameraFilter ? { camera: cameraFilter } : {}),
      }),
  });

  const wasScanning = useRef(false);
  const selectionAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    if (wasScanning.current && status && !status.running) {
      refetch();
      qc.invalidateQueries({ queryKey: ["duplicates"] });
      qc.invalidateQueries({ queryKey: ["inbox-cameras"] });
      qc.invalidateQueries({ queryKey: ["cameras"] });
    }
    wasScanning.current = status?.running ?? false;
  }, [status?.running, refetch, qc]);

  const scan = useMutation({
    mutationFn: api.scanInbox,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
      setTimeout(() => refetch(), 2000);
    },
  });

  const submitBatch = useMutation({
    mutationFn: (fileIds?: number[]) =>
      api.previewInbox({
        append: true,
        ...(fileIds && fileIds.length > 0 ? { file_ids: fileIds.slice(0, INBOX_BATCH_LIMIT) } : {}),
      }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["organize-preview"] });
      setSelectedIds([]);
      selectionAnchorRef.current = null;
    },
  });

  const clearSelection = () => {
    setSelectedIds([]);
    setDetailFile(null);
    selectionAnchorRef.current = null;
  };

  const clearFilters = () => {
    setTagFilterId(null);
    setPersonFilterId(null);
    setCameraFilter(null);
  };

  const changeInboxFilter = (filter: InboxFilter) => {
    setInboxFilter(filter);
    clearFilters();
    clearSelection();
  };

  const changeTagFilter = (tagId: number | null) => {
    setTagFilterId(tagId);
    if (tagId !== null) {
      setInboxFilter("all");
      setPersonFilterId(null);
      setCameraFilter(null);
    }
    clearSelection();
  };

  const changePersonFilter = (personId: number | null) => {
    setPersonFilterId(personId);
    if (personId !== null) {
      setInboxFilter("all");
      setTagFilterId(null);
      setCameraFilter(null);
    }
    clearSelection();
  };

  const changeCameraFilter = (camera: string | null) => {
    setCameraFilter(camera);
    if (camera !== null) {
      setInboxFilter("all");
      setTagFilterId(null);
      setPersonFilterId(null);
    }
    clearSelection();
  };

  const toggleSelect = (id: number, event: React.MouseEvent) => {
    const files = data?.items ?? [];
    const result = togglePhotoSelection(
      files,
      selectedIds,
      id,
      event.shiftKey,
      selectionAnchorRef.current,
    );
    selectionAnchorRef.current = result.anchorIndex;
    setSelectedIds(result.selectedIds);
  };

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["inbox-tags"] });
    qc.invalidateQueries({ queryKey: ["inbox-people"] });
    qc.invalidateQueries({ queryKey: ["inbox-cameras"] });
    qc.invalidateQueries({ queryKey: ["files", "inbox", "delete_queue_count"] });
    qc.invalidateQueries({ queryKey: ["review-queue"] });
  };

  const restoreMutation = useMutation({
    mutationFn: (fileIds: number[]) => api.cancelReviewDecisions(fileIds),
    onSuccess: () => {
      handleLabelsChange();
    },
  });

  const handleBulkRestore = () => {
    if (selectedIds.length === 0) return;
    restoreMutation.mutate(selectedIds, {
      onSuccess: () => setSelectedIds([]),
    });
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: (fileIds: number[]) =>
      Promise.all(fileIds.map((file_id) => api.createDecision({ file_id, action: "delete" }))),
    onSuccess: () => {
      handleLabelsChange();
      setSelectedIds([]);
      selectionAnchorRef.current = null;
      setDetailFile(null);
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "d" && e.key !== "D") return;
      if (inboxFilter === "delete_queue" || selectedIds.length === 0) return;
      if (isEditableTarget(e.target)) return;
      if (bulkDeleteMutation.isPending) return;
      e.preventDefault();
      e.stopPropagation();
      bulkDeleteMutation.mutate(selectedIds);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inboxFilter, selectedIds, bulkDeleteMutation]);

  const handleDateChange = (keepFileId?: number) => {
    const openId = keepFileId ?? detailFile?.id;
    invalidateAfterDateChange(qc);
    refetch().then(({ data: listData }) => {
      if (!openId) return;
      const still = listData?.items.find((f) => f.id === openId);
      setDetailFile(still ?? null);
    });
    handleLabelsChange();
  };

  const selectedFiles = data?.items.filter((f) => selectedIds.includes(f.id)) ?? [];
  const total = data?.total ?? 0;
  const visibleCount = data?.items.length ?? 0;
  const queueCount = reviewQueue?.total ?? 0;

  const activeTagName = useMemo(() => {
    if (!tagFilterId) return null;
    return usedTagsData?.tags.find((t) => t.id === tagFilterId)?.name ?? null;
  }, [tagFilterId, usedTagsData]);

  const activePersonName = useMemo(() => {
    if (!personFilterId) return null;
    return usedPeopleData?.people.find((p) => p.id === personFilterId)?.name ?? null;
  }, [personFilterId, usedPeopleData]);

  const hasLabelFilter = tagFilterId !== null || personFilterId !== null || cameraFilter !== null;

  const headerBadge = useMemo(() => {
    if (inboxFilter === "delete_queue") return `${total} queued for delete`;
    if (tagFilterId && activeTagName) return `${total} · ${activeTagName}`;
    if (personFilterId && activePersonName) return `${total} · ${activePersonName}`;
    if (cameraFilter) return `${total} · ${cameraFilter}`;
    if (inboxFilter === "unlabeled") return `${total} untagged`;
    return `${total} pending`;
  }, [total, tagFilterId, activeTagName, personFilterId, activePersonName, cameraFilter, inboxFilter]);

  return (
    <div>
      <div className="page-header">
        <h2>Inbox</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {status && (
            <span className="scan-status">
              {status.running
                ? `Scanning ${status.scope}: ${status.processed}/${status.total}`
                : status.message ?? ""}
            </span>
          )}
          <span className="badge" style={{ background: "#6366f1", color: "#fff" }}>
            {headerBadge}
          </span>
          <button className="btn" onClick={() => scan.mutate()} disabled={scan.isPending || status?.running}>
            Scan inbox
          </button>
        </div>
      </div>
      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Drop new photos into your inbox folder, scan, then submit batches (up to {INBOX_BATCH_LIMIT}) to
        Review when ready. Use checkboxes for bulk labeling; click a thumbnail to view metadata.
      </p>

      {inboxFilter !== "delete_queue" && (
        <InboxReviewBatchBar
          availableCount={total}
          queueCount={queueCount}
          selectedCount={selectedIds.length}
          submitting={submitBatch.isPending}
          onSubmitNext={() => submitBatch.mutate(undefined)}
          onSubmitSelected={() => submitBatch.mutate(selectedIds)}
        />
      )}

      <div className="inbox-filter-bar">
        <div className="photo-alerts-filter">
          <button
            type="button"
            className={`btn btn-secondary${inboxFilter === "all" && !hasLabelFilter ? " active" : ""}`}
            onClick={() => changeInboxFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn-secondary${inboxFilter === "unlabeled" ? " active" : ""}`}
            onClick={() => changeInboxFilter("unlabeled")}
          >
            Untagged
          </button>
          <button
            type="button"
            className={`btn btn-secondary${inboxFilter === "delete_queue" ? " active" : ""}`}
            onClick={() => changeInboxFilter("delete_queue")}
          >
            Delete queue
            {deleteQueueCount > 0 && ` (${deleteQueueCount})`}
          </button>
        </div>
        {inboxFilter === "unlabeled" && total > 0 && (
          <span className="photo-alerts-chip date">{total} untagged</span>
        )}
        {inboxFilter === "delete_queue" && total > 0 && (
          <span className="photo-alerts-chip duplicate">{total} queued</span>
        )}
        {tagFilterId && activeTagName && (
          <span className="photo-alerts-chip duplicate">{activeTagName}</span>
        )}
        {personFilterId && activePersonName && (
          <span className="photo-alerts-chip duplicate">{activePersonName}</span>
        )}
        {cameraFilter && (
          <span className="photo-alerts-chip duplicate">{cameraFilter}</span>
        )}
      </div>

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        visibleCount={visibleCount}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => {
          setSelectedIds([]);
          selectionAnchorRef.current = null;
        }}
      />

      {inboxFilter === "delete_queue" && selectedIds.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
          <button
            className="btn btn-secondary"
            disabled={restoreMutation.isPending}
            onClick={handleBulkRestore}
          >
            Restore {selectedIds.length}
          </button>
        </div>
      )}

      {selectedIds.length === 0 && inboxFilter !== "delete_queue" && (
        <>
          <InboxUsedPeopleBar activePersonId={personFilterId} onSelectPerson={changePersonFilter} />
          <InboxUsedTagsBar activeTagId={tagFilterId} onSelectTag={changeTagFilter} />
          <InboxUsedCamerasBar activeCamera={cameraFilter} onSelectCamera={changeCameraFilter} />
        </>
      )}

      {inboxFilter !== "delete_queue" && selectedIds.length === 1 && selectedFiles[0] && (
        <SingleFileLabelEditors file={selectedFiles[0]} onChange={handleDateChange} showTagSearch />
      )}
      {inboxFilter !== "delete_queue" && selectedIds.length >= 2 && (
        <BulkLabelEditors selectedFiles={selectedFiles} onChange={handleDateChange} showTagSearch />
      )}

      <PhotoGridWithAlerts
        files={data?.items ?? []}
        selectedIds={selectedIds}
        activeDetailId={detailFile?.id}
        onToggleSelect={toggleSelect}
        onOpenDetail={setDetailFile}
        multiSelectMode
        editableLabels
        onLabelsChange={handleLabelsChange}
        onAlertsChange={handleDateChange}
      />
      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={data?.items ?? []}
          onChangeFile={setDetailFile}
          onDateChange={handleDateChange}
          onClose={() => setDetailFile(null)}
          deleteQueueMode={inboxFilter === "delete_queue"}
        />
      )}
    </div>
  );
}
