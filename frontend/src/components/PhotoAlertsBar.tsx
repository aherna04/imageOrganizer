import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DuplicateGroup, MediaFile, api } from "../api/client";
import {
  AlertFilter,
  buildDateAlertMap,
  buildDuplicateIndex,
  dateWarningFileIds,
  summarizeAlerts,
} from "../utils/photoAlerts";

interface Props {
  files: MediaFile[];
  duplicateGroups: DuplicateGroup[];
  filter: AlertFilter;
  onFilterChange: (filter: AlertFilter) => void;
  onFixDates?: () => void;
}

export default function PhotoAlertsBar({
  files,
  duplicateGroups,
  filter,
  onFilterChange,
  onFixDates,
}: Props) {
  const dateAlerts = buildDateAlertMap(files);
  const duplicateIndex = buildDuplicateIndex(duplicateGroups);
  const summary = summarizeAlerts(files, dateAlerts, duplicateIndex);

  const fixDates = useMutation({
    mutationFn: () => api.fixDatesFromFilename(dateWarningFileIds(files)),
    onSuccess: () => onFixDates?.(),
  });

  if (!summary.hasAny) return null;

  return (
    <div className="photo-alerts-bar">
      <div className="photo-alerts-summary">
        {summary.dateCount > 0 && (
          <span className="photo-alerts-chip date">
            {summary.dateCount} date warning{summary.dateCount === 1 ? "" : "s"}
          </span>
        )}
        {summary.duplicateCount > 0 && (
          <span className="photo-alerts-chip duplicate">
            {summary.groupCount} duplicate group{summary.groupCount === 1 ? "" : "s"} ({summary.duplicateCount}{" "}
            photo{summary.duplicateCount === 1 ? "" : "s"})
          </span>
        )}
      </div>

      <div className="photo-alerts-actions">
        <div className="photo-alerts-filter">
          <button
            type="button"
            className={`btn btn-secondary ${filter === "all" ? "active" : ""}`}
            onClick={() => onFilterChange("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${filter === "alerts" ? "active" : ""}`}
            onClick={() => onFilterChange("alerts")}
          >
            Alerts only
          </button>
        </div>

        {summary.dateCount > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={fixDates.isPending}
            onClick={() => fixDates.mutate()}
          >
            Fix dates from filename
          </button>
        )}

        {summary.duplicateCount > 0 && (
          <Link to="/duplicates" className="btn btn-secondary">
            Review all duplicates
          </Link>
        )}
      </div>
    </div>
  );
}
