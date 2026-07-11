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

  return (
    <div className="inbox-quick-filter-row">
      <label className="inbox-quick-filter-label">Cameras</label>
      <div className="inbox-quick-filter-body">
        <LabelSearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search cameras…" />
        {filteredCameras.length === 0 ? (
          <p className="label-search-empty">No cameras match</p>
        ) : (
          <div className="inbox-quick-filter-chips">
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
    </div>
  );
}
