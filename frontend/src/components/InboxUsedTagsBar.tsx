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

  const isFiltering = searchQuery.trim().length > 0;

  return (
    <div className="inbox-used-tags">
      <div className="inbox-used-tags-header">
        <label className="inbox-used-tags-label">Used tags</label>
        <span className="inbox-used-tags-hint">
          {isFiltering
            ? `${filteredTags.length} of ${tags.length} tags`
            : "Filter by tag, then select photos to add more tags"}
        </span>
      </div>
      <LabelSearchInput value={searchQuery} onChange={setSearchQuery} />
      {filteredTags.length === 0 ? (
        <p className="label-search-empty">No tags match — try another term</p>
      ) : (
        <div className="inbox-used-tags-chips">
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
  );
}
