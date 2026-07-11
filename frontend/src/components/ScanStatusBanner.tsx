import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useRef } from "react";
import { api } from "../api/client";

const SCAN_POLL_MS = 2000;
const INBOX_REFETCH_EVERY = 5;
const INBOX_REFETCH_INTERVAL_MS = 2500;

interface Props {
  onRunningChange?: (running: boolean) => void;
}

function ScanStatusBanner({ onRunningChange }: Props) {
  const qc = useQueryClient();
  const wasScanning = useRef(false);
  const lastInboxRefetchProcessed = useRef(0);

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
      lastInboxRefetchProcessed.current = 0;
    }
    wasScanning.current = status?.running ?? false;
  }, [status?.running, qc]);

  useEffect(() => {
    if (!status?.running || status.scope !== "inbox") return;

    const interval = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["files", "inbox"] });
    }, INBOX_REFETCH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status?.running, status?.scope, qc]);

  useEffect(() => {
    if (!status?.running || status.scope !== "trash") return;

    const interval = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["files", "trash"] });
    }, INBOX_REFETCH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status?.running, status?.scope, qc]);

  useEffect(() => {
    if (!status?.running || status.scope !== "inbox") return;
    const delta = status.processed - lastInboxRefetchProcessed.current;
    if (delta < INBOX_REFETCH_EVERY && status.processed !== status.total) return;

    const timer = window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["files", "inbox"] });
      lastInboxRefetchProcessed.current = status.processed;
    }, 500);

    return () => window.clearTimeout(timer);
  }, [status?.processed, status?.running, status?.scope, status?.total, qc]);

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
