import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";

interface Props {
  onApplied: () => void;
}

export default function ApplyPanel({ onApplied }: Props) {
  const apply = useMutation({
    mutationFn: api.apply,
    onSuccess: (result) => {
      alert(`Applied ${result.applied} operations.${result.errors.length ? `\nErrors: ${result.errors.join(", ")}` : ""}`);
      onApplied();
    },
  });

  return (
    <div style={{ marginTop: "1rem" }}>
      <button className="btn" onClick={() => apply.mutate()} disabled={apply.isPending}>
        {apply.isPending ? "Applying..." : "Apply changes"}
      </button>
    </div>
  );
}
