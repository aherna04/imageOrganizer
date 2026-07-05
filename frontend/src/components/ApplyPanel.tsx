import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

interface Props {
  onApplied: () => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function ApplyPanel({ onApplied, disabled = false, compact = false }: Props) {
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
    <div className={compact ? "apply-panel apply-panel-compact" : "apply-panel"}>
      <div className="apply-panel-row">
        <button
          className="btn"
          onClick={() => apply.mutate()}
          disabled={disabled || apply.isPending}
        >
          {apply.isPending ? "Applying..." : "Apply changes"}
        </button>
        {lastResult && (
          <span className="scan-status">
            Applied {lastResult.applied} operation{lastResult.applied === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {lastResult && lastResult.errors.length > 0 && (
        <div className="apply-panel-errors">
          Errors: {lastResult.errors.join(", ")}
        </div>
      )}
    </div>
  );
}
