import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MediaFile, api } from "../api/client";
import BulkEventAssignBar from "../components/BulkEventAssignBar";
import InboxUsedPeopleBar from "../components/InboxUsedPeopleBar";
import InboxUsedTagsBar from "../components/InboxUsedTagsBar";
import PhotoGridWithAlerts from "../components/PhotoGridWithAlerts";
import PhotoDetail from "../components/PhotoDetail";
import SingleFileLabelEditors from "../components/SingleFileLabelEditors";
import BulkLabelEditors from "../components/BulkLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";

type InboxFilter = "all" | "unlabeled";

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [tagFilterId, setTagFilterId] = useState<number | null>(null);
  const [personFilterId, setPersonFilterId] = useState<number | null>(null);

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

  const { data, refetch } = useQuery({
    queryKey: ["files", "inbox", inboxFilter, tagFilterId, personFilterId],
    queryFn: () =>
      api.listFiles({
        location: "inbox",
        page_size: 200,
        ...(inboxFilter === "unlabeled" ? { unlabeled: true } : {}),
        ...(tagFilterId ? { tag_id: tagFilterId } : {}),
        ...(personFilterId ? { person_id: personFilterId } : {}),
      }),
  });

  const scan = useMutation({
    mutationFn: api.scanInbox,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
      setTimeout(() => refetch(), 2000);
    },
  });

  const clearSelection = () => {
    setSelectedIds([]);
    setDetailFile(null);
  };

  const clearLabelFilters = () => {
    setTagFilterId(null);
    setPersonFilterId(null);
  };

  const changeInboxFilter = (filter: InboxFilter) => {
    setInboxFilter(filter);
    clearLabelFilters();
    clearSelection();
  };

  const changeTagFilter = (tagId: number | null) => {
    setTagFilterId(tagId);
    if (tagId !== null) {
      setInboxFilter("all");
      setPersonFilterId(null);
    }
    clearSelection();
  };

  const changePersonFilter = (personId: number | null) => {
    setPersonFilterId(personId);
    if (personId !== null) {
      setInboxFilter("all");
      setTagFilterId(null);
    }
    clearSelection();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleLabelsChange = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["inbox-tags"] });
    qc.invalidateQueries({ queryKey: ["inbox-people"] });
  };

  const handleDateChange = () => {
    const openId = detailFile?.id;
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

  const activeTagName = useMemo(() => {
    if (!tagFilterId) return null;
    return usedTagsData?.tags.find((t) => t.id === tagFilterId)?.name ?? null;
  }, [tagFilterId, usedTagsData]);

  const activePersonName = useMemo(() => {
    if (!personFilterId) return null;
    return usedPeopleData?.people.find((p) => p.id === personFilterId)?.name ?? null;
  }, [personFilterId, usedPeopleData]);

  const hasLabelFilter = tagFilterId !== null || personFilterId !== null;

  const headerBadge = useMemo(() => {
    if (tagFilterId && activeTagName) return `${total} · ${activeTagName}`;
    if (personFilterId && activePersonName) return `${total} · ${activePersonName}`;
    if (inboxFilter === "unlabeled") return `${total} untagged`;
    return `${total} pending`;
  }, [total, tagFilterId, activeTagName, personFilterId, activePersonName, inboxFilter]);

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
        Drop new photos into your inbox folder, scan, then review and apply from the Review page.
        Use checkboxes to select photos for bulk labeling; click a thumbnail to view metadata.
      </p>

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
        </div>
        {inboxFilter === "unlabeled" && total > 0 && (
          <span className="photo-alerts-chip date">{total} untagged</span>
        )}
        {tagFilterId && activeTagName && (
          <span className="photo-alerts-chip duplicate">{activeTagName}</span>
        )}
        {personFilterId && activePersonName && (
          <span className="photo-alerts-chip duplicate">{activePersonName}</span>
        )}
      </div>

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => setSelectedIds([])}
      />

      {selectedIds.length === 0 && (
        <>
          <InboxUsedPeopleBar activePersonId={personFilterId} onSelectPerson={changePersonFilter} />
          <InboxUsedTagsBar activeTagId={tagFilterId} onSelectTag={changeTagFilter} />
        </>
      )}

      {selectedIds.length === 1 && selectedFiles[0] && (
        <SingleFileLabelEditors file={selectedFiles[0]} onChange={handleDateChange} />
      )}
      {selectedIds.length >= 2 && (
        <BulkLabelEditors selectedFiles={selectedFiles} onChange={handleDateChange} />
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
        />
      )}
    </div>
  );
}
