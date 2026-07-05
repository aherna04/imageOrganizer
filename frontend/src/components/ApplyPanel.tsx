import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

interface Props {
  onApplied: () => void;
}

export default function ApplyPanel({ onApplied }: Props) {
  const [lastResult, setLastResult] = useState<{ applied: number; errors: string[] } | null>(null);

  const apply = useMutation({
    mutationFn: api.apply,
    onMutate: () => setLastResult(null),
    onSuccess: (result) => {
      setLastResult(result);
      onApplied();
    },
  });

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={() => apply.mutate()} disabled={apply.isPending}>
          {apply.isPending ? "Applying..." : "Apply changes"}
        </button>
        {lastResult && (
          <span className="scan-status">
            Applied {lastResult.applied} operation{lastResult.applied === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {lastResult && lastResult.errors.length > 0 && (
        <div style={{ color: "#f87171", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Errors: {lastResult.errors.join(", ")}
        </div>
      )}
    </div>
  );
}
