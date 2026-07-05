import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import LabelSearchInput from "./LabelSearchInput";
import { filterByNameQuery } from "../utils/filterLabelsByQuery";

interface Props {
  activeCamera: string | null;
  onSelectCamera: (camera: string | null) => void;
}

export default function InboxUsedCamerasBar({ activeCamera, onSelectCamera }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data } = useQuery({
    queryKey: ["inbox-cameras"],
    queryFn: api.inboxCameras,
  });

  const cameras = data?.cameras ?? [];
  const alwaysInclude = useMemo(
    () => (activeCamera != null ? new Set([activeCamera]) : undefined),
    [activeCamera],
  );
  const filteredCameras = useMemo(
    () => filterByNameQuery(cameras, searchQuery, alwaysInclude),
    [cameras, searchQuery, alwaysInclude],
  );

  if (cameras.length === 0) return null;

  const isFiltering = searchQuery.trim().length > 0;

  return (
    <div className="inbox-used-tags">
      <div className="inbox-used-tags-header">
        <label className="inbox-used-tags-label">Used cameras</label>
        <span className="inbox-used-tags-hint">
          {isFiltering
            ? `${filteredCameras.length} of ${cameras.length} cameras`
            : "Filter by camera, then select photos to review"}
        </span>
      </div>
      <LabelSearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search cameras…" />
      {filteredCameras.length === 0 ? (
        <p className="label-search-empty">No cameras match — try another term</p>
      ) : (
        <div className="inbox-used-tags-chips">
          {filteredCameras.map((camera) => {
            const isActive = activeCamera === camera.name;
            return (
              <button
                key={camera.name}
                type="button"
                className={`calendar-event-chip calendar-tag-chip${isActive ? " active" : ""}`}
                onClick={() => onSelectCamera(isActive ? null : camera.name)}
              >
                {camera.name} ({camera.photo_count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
