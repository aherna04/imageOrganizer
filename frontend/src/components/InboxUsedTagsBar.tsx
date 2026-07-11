import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import LabelSearchInput from "./LabelSearchInput";
import { filterTagsByQuery } from "../utils/filterLabelsByQuery";

interface Props {
  activeTagId: number | null;
  onSelectTag: (tagId: number | null) => void;
}

export default function InboxUsedTagsBar({ activeTagId, onSelectTag }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data } = useQuery({
    queryKey: ["inbox-tags"],
    queryFn: api.inboxTags,
  });

  const tags = data?.tags ?? [];
  const alwaysInclude = useMemo(
    () => (activeTagId != null ? new Set([activeTagId]) : undefined),
    [activeTagId],
  );
  const filteredTags = useMemo(
    () => filterTagsByQuery(tags, searchQuery, alwaysInclude),
    [tags, searchQuery, alwaysInclude],
  );

  if (tags.length === 0) return null;

  return (
    <div className="inbox-quick-filter-row">
      <label className="inbox-quick-filter-label">Tags</label>
      <div className="inbox-quick-filter-body">
        <LabelSearchInput value={searchQuery} onChange={setSearchQuery} />
        {filteredTags.length === 0 ? (
          <p className="label-search-empty">No tags match</p>
        ) : (
          <div className="inbox-quick-filter-chips">
            {filteredTags.map((tag) => {
              const isActive = activeTagId === tag.id;
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`calendar-event-chip calendar-tag-chip${isActive ? " active" : ""}`}
                  onClick={() => onSelectTag(isActive ? null : tag.id)}
                >
                  {tag.name} ({tag.photo_count})
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
