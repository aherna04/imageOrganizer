import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useRef } from "react";
import { api } from "../api/client";

const POLL_MS = 2000;
const REFETCH_EVERY = 5;
const REFETCH_INTERVAL_MS = 2500;

interface Props {
  onRunningChange?: (running: boolean) => void;
}

function BlurAnalysisStatusBanner({ onRunningChange }: Props) {
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  const lastRefetchProcessed = useRef(0);

  const { data: status } = useQuery({
    queryKey: ["blur-analysis-status"],
    queryFn: api.blurAnalysisStatus,
    refetchInterval: (q) => (q.state.data?.running ? POLL_MS : false),
  });

  useEffect(() => {
    onRunningChange?.(status?.running ?? false);
  }, [status?.running, onRunningChange]);

  useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      qc.invalidateQueries({ queryKey: ["files", "blurry"] });
      qc.invalidateQueries({ queryKey: ["files"] });
      lastRefetchProcessed.current = 0;
    }
    wasRunning.current = status?.running ?? false;
  }, [status?.running, qc]);

  useEffect(() => {
    if (!status?.running) return;

    const interval = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["files", "blurry"] });
    }, REFETCH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status?.running, qc]);

  useEffect(() => {
    if (!status?.running) return;
    const delta = status.processed - lastRefetchProcessed.current;
    if (delta < REFETCH_EVERY && status.processed !== status.total) return;

    const timer = window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["files", "blurry"] });
      lastRefetchProcessed.current = status.processed;
    }, 500);

    return () => window.clearTimeout(timer);
  }, [status?.processed, status?.running, status?.total, qc]);

  if (!status) return null;

  const label = status.running
    ? `Analyzing sharpness (${status.scope}): ${status.processed}/${status.total}`
    : status.message ?? "";

  if (!label) return null;

  return <span className="scan-status">{label}</span>;
}

export default memo(BlurAnalysisStatusBanner);
