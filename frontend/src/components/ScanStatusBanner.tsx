import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useRef } from "react";
import { api, type ScanStatus } from "../api/client";

const SCAN_POLL_MS = 2000;

interface Props {
  onRunningChange?: (running: boolean) => void;
}

function phaseLabel(status: ScanStatus): string {
  switch (status.phase) {
    case "scanning":
      return `Scanning ${status.scope}: ${status.processed}/${status.total}`;
    case "pruning":
      return status.message || "Removing missing files...";
    case "building_duplicates":
      return status.message || "Building duplicate index...";
    default:
      return status.message ?? "";
  }
}

function ScanStatusBanner({ onRunningChange }: Props) {
  const qc = useQueryClient();
  const wasScanning = useRef(false);
  const wasIndexingDupes = useRef(false);

  const { data: status } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase && phase !== "idle" ? SCAN_POLL_MS : false;
    },
  });

  useEffect(() => {
    onRunningChange?.(status?.running ?? false);
  }, [status?.running, onRunningChange]);

  useEffect(() => {
    if (wasScanning.current && status && !status.running) {
      qc.invalidateQueries({ queryKey: ["files", "inbox"] });
      qc.invalidateQueries({ queryKey: ["files", "trash"] });
      qc.invalidateQueries({ queryKey: ["duplicates"] });
      qc.invalidateQueries({ queryKey: ["inbox-cameras"] });
      qc.invalidateQueries({ queryKey: ["cameras"] });
    }
    wasScanning.current = status?.running ?? false;
  }, [status?.running, qc]);

  useEffect(() => {
    const indexing = status?.phase === "building_duplicates";
    if (wasIndexingDupes.current && status && !indexing) {
      qc.invalidateQueries({ queryKey: ["duplicates"] });
    }
    wasIndexingDupes.current = indexing;
  }, [status?.phase, qc]);

  if (!status) return null;

  const label = phaseLabel(status);
  if (!label) return null;

  return <span className="scan-status">{label}</span>;
}

export default memo(ScanStatusBanner);
