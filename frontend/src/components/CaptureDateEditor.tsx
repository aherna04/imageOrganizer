import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MediaFile, api } from "../api/client";
import { filenameDateDiffers, parseDateFromFilename } from "../utils/filenameDates";

interface Props {
  files: MediaFile[];
  onChange: () => void;
  compact?: boolean;
}

function defaultDateInput(files: MediaFile[]): string {
  if (files.length === 1) {
    const f = files[0];
    return filenameDateDiffers(f.capture_day, f.filename) ?? f.capture_day ?? "";
  }
  const days = new Set(files.map((f) => f.capture_day).filter(Boolean));
  if (days.size === 1) return [...days][0] as string;
  return "";
}

function bulkCurrentLabel(uniqueDays: Set<string | null | undefined>): string {
  const days = [...uniqueDays].filter(Boolean) as string[];
  if (days.length === 0) return "No dates";
  if (days.length === 1) return days[0];
  return "Mixed dates";
}

export default function CaptureDateEditor({ files, onChange, compact = false }: Props) {
  const [dateInput, setDateInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const fileIds = useMemo(() => files.map((f) => f.id), [files]);

  useEffect(() => {
    setDateInput(defaultDateInput(files));
    setMessage(null);
  }, [files]);

  const parseableCount = files.filter((f) => parseDateFromFilename(f.filename)).length;
  const isBulk = files.length > 1;

  const uniqueDays = useMemo(() => {
    const days = new Set(files.map((f) => f.capture_day).filter(Boolean));
    return days;
  }, [files]);

  const applyDate = useMutation({
    mutationFn: () => api.setCaptureDates(fileIds, dateInput),
    onSuccess: (res) => {
      setMessage(`Updated ${res.updated} photo${res.updated === 1 ? "" : "s"}`);
      onChange();
    },
  });

  const fixFromFilename = useMutation({
    mutationFn: () => api.fixDatesFromFilename(fileIds),
    onSuccess: (res) => {
      const parts = [`Fixed ${res.fixed}`];
      if (res.skipped > 0) {
        parts.push(`skipped ${res.skipped} (no date in filename)`);
      }
      setMessage(parts.join(", "));
      onChange();
    },
  });

  if (files.length === 0) return null;

  const filenameHint =
    !isBulk && filenameDateDiffers(files[0].capture_day, files[0].filename)
      ? filenameDateDiffers(files[0].capture_day, files[0].filename)
      : null;

  const bulkPartialParseableHint =
    isBulk && parseableCount > 0 && parseableCount < files.length
      ? `${parseableCount} of ${files.length} parseable from filename`
      : null;

  const applyLabel = compact
    ? isBulk
      ? `Apply (${files.length})`
      : "Apply"
    : isBulk
      ? `Apply to ${files.length}`
      : "Apply";

  const filenameButtonLabel = compact ? "From filename" : "Use filename date";

  const controls = (
    <div className="capture-date-controls">
      <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!dateInput || applyDate.isPending}
        onClick={() => applyDate.mutate()}
      >
        {applyLabel}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={parseableCount === 0 || fixFromFilename.isPending}
        onClick={() => fixFromFilename.mutate()}
      >
        {filenameButtonLabel}
      </button>
      {message && <span className="capture-date-message">{message}</span>}
    </div>
  );

  if (compact) {
    const currentLabel = isBulk
      ? bulkCurrentLabel(uniqueDays)
      : (files[0].capture_day ?? "Unknown");

    return (
      <div className="capture-date-editor capture-date-editor-compact">
        <span className="capture-date-compact-label">Date</span>
        {isBulk && (
          <span className="capture-date-compact-count">
            {files.length} photo{files.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="capture-date-compact-current">{currentLabel}</span>
        {filenameHint && (
          <span className="capture-date-hint capture-date-hint-inline">Filename: {filenameHint}</span>
        )}
        {bulkPartialParseableHint && (
          <span className="capture-date-hint capture-date-hint-inline">{bulkPartialParseableHint}</span>
        )}
        {controls}
      </div>
    );
  }

  return (
    <div className="capture-date-editor">
      <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>
        Date{isBulk ? ` (${files.length} photos)` : ""}
      </label>

      {!isBulk && (
        <div style={{ fontSize: "0.8rem", color: "#8891a0", marginTop: "0.25rem" }}>
          Current: {files[0].capture_day ?? "Unknown"}
        </div>
      )}

      {isBulk && (
        <div style={{ fontSize: "0.8rem", color: "#8891a0", marginTop: "0.25rem" }}>
          {uniqueDays.size === 0
            ? "No dates set"
            : uniqueDays.size === 1
              ? `Current: ${[...uniqueDays][0]}`
              : "Multiple dates"}
        </div>
      )}

      {filenameHint && <div className="capture-date-hint">Filename suggests {filenameHint}</div>}

      {bulkPartialParseableHint && (
        <div className="capture-date-hint">{bulkPartialParseableHint}</div>
      )}

      {controls}
    </div>
  );
}
