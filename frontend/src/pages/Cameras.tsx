import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { filterByNameQuery } from "../utils/filterLabelsByQuery";
import { invalidateCalendarQueries } from "../utils/invalidateCalendarQueries";
import { useScanBlockers } from "../utils/useScanBlockers";

function cameraCountLabel(camera: { photo_count: number; inbox_count: number; archive_count: number }) {
  if (camera.inbox_count > 0 && camera.archive_count > 0) {
    return `${camera.photo_count} photos (${camera.inbox_count} inbox · ${camera.archive_count} archive)`;
  }
  return `${camera.photo_count} photos`;
}

export default function CamerasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: status } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase && phase !== "idle" ? 2000 : false;
    },
  });

  const { blurRunning, blockedReason } = useScanBlockers();

  const { data, refetch } = useQuery({
    queryKey: ["cameras"],
    queryFn: async () => (await api.listCameras()).cameras,
  });

  const cameras = data ?? [];

  const wasScanning = useRef(false);
  useEffect(() => {
    if (wasScanning.current && status && !status.running) {
      refetch();
      qc.invalidateQueries({ queryKey: ["inbox-cameras"] });
      if (status.scope === "archive") {
        invalidateCalendarQueries(qc);
      }
    }
    wasScanning.current = status?.running ?? false;
  }, [status?.running, refetch, qc]);

  const scanArchive = useMutation({
    mutationFn: api.scanArchive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
    },
  });

  const filteredCameras = useMemo(
    () => filterByNameQuery(cameras, search),
    [cameras, search],
  );

  const scanning = status?.running ?? false;

  return (
    <div>
      <div className="page-header">
        <h2>Cameras</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {status && (
            <span className="scan-status">
              {status.running
                ? `Scanning ${status.scope}: ${status.processed}/${status.total}`
                : status.message ?? ""}
            </span>
          )}
          {blockedReason && !scanning && (
            <span className="scan-status">{blockedReason}</span>
          )}
          {scanArchive.isError && (
            <span className="scan-status" style={{ color: "#f87171" }}>
              {scanArchive.error instanceof Error ? scanArchive.error.message : "Scan failed"}
            </span>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => scanArchive.mutate()}
            disabled={scanArchive.isPending || scanning || blurRunning}
          >
            Scan archive
          </button>
        </div>
      </div>

      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Cameras detected from photo EXIF during scan. Scan archive to backfill camera data for existing
        photos, or scan inbox for new imports.
      </p>

      <input
        type="search"
        placeholder="Search cameras…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="browse-search"
        style={{ marginBottom: "1rem", maxWidth: "24rem" }}
      />

      {cameras.length === 0 ? (
        <div className="empty-state">
          No cameras found yet. Scan archive or inbox to read camera info from EXIF metadata.
        </div>
      ) : filteredCameras.length === 0 ? (
        <p className="label-search-empty">No cameras match — try another term</p>
      ) : (
        <div className="people-list">
          {filteredCameras.map((camera) => (
            <div key={camera.name} className="people-list-row">
              <div className="people-list-info">
                <Link
                  to={`/browse/camera/${encodeURIComponent(camera.name)}`}
                  className="people-list-name-link"
                >
                  <strong>{camera.name}</strong>
                </Link>
                <span className="people-list-count">{cameraCountLabel(camera)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
