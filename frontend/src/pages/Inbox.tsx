import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile, api } from "../api/client";
import BulkEventAssignBar from "../components/BulkEventAssignBar";
import BulkPersonAssignBar from "../components/BulkPersonAssignBar";
import PhotoGrid from "../components/PhotoGrid";
import PhotoDetail from "../components/PhotoDetail";

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

  const { data: status } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
  });

  const { data, refetch } = useQuery({
    queryKey: ["files", "inbox"],
    queryFn: () => api.listFiles({ location: "inbox", page_size: 100 }),
  });

  const scan = useMutation({
    mutationFn: api.scanInbox,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
      setTimeout(() => refetch(), 2000);
    },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAssigned = () => {
    setSelectedIds([]);
    refetch();
    qc.invalidateQueries({ queryKey: ["events"] });
  };

  const handlePeopleAssigned = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["people"] });
  };

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
            {data?.total ?? 0} pending
          </span>
          <button className="btn" onClick={() => scan.mutate()} disabled={scan.isPending || status?.running}>
            Scan inbox
          </button>
        </div>
      </div>
      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Drop new photos into your inbox folder, scan, then review and apply from the Review page.
        Click to select, double-click to view details, then group into a trip/event.
      </p>

      <BulkEventAssignBar
        selectedIds={selectedIds}
        totalCount={data?.total}
        onSelectAll={() => setSelectedIds(data?.items.map((f) => f.id) ?? [])}
        onClear={() => setSelectedIds([])}
        onAssigned={handleAssigned}
      />

      <BulkPersonAssignBar selectedIds={selectedIds} onAssigned={handlePeopleAssigned} />

      <PhotoGrid
        files={data?.items ?? []}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onDoubleClick={setDetailFile}
        multiSelectMode
      />
      {detailFile && <PhotoDetail file={detailFile} onClose={() => setDetailFile(null)} />}
    </div>
  );
}
