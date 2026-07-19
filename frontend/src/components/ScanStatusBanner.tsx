import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useRef } from "react";
import { api } from "../api/client";

const SCAN_POLL_MS = 2000;

interface Props {
  onRunningChange?: (running: boolean) => void;
}

function ScanStatusBanner({ onRunningChange }: Props) {
  const qc = useQueryClient();
  const wasScanning = useRef(false);

  const { data: status } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => (q.state.data?.running ? SCAN_POLL_MS : false),
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

  if (!status) return null;

  const label = status.running
    ? status.message?.startsWith("Building")
      ? status.message
      : `Scanning ${status.scope}: ${status.processed}/${status.total}`
    : status.message ?? "";

  if (!label) return null;

  return <span className="scan-status">{label}</span>;
}

export default memo(ScanStatusBanner);
