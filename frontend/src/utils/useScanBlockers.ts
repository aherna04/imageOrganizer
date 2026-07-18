import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/** Shared blockers that prevent starting a new scan. */
export function useScanBlockers() {
  const { data: blurStatus } = useQuery({
    queryKey: ["blur-analysis-status"],
    queryFn: api.blurAnalysisStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 8000),
  });

  const blurRunning = blurStatus?.running ?? false;
  const blockedReason = blurRunning ? "Sharpness analysis running…" : null;

  return { blurRunning, blockedReason };
}
