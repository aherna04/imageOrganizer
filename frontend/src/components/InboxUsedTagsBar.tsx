import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface Props {
  activeTagId: number | null;
  onSelectTag: (tagId: number | null) => void;
}

export default function InboxUsedTagsBar({ activeTagId, onSelectTag }: Props) {
  const { data } = useQuery({
    queryKey: ["inbox-tags"],
    queryFn: api.inboxTags,
  });

  const tags = data?.tags ?? [];
  if (tags.length === 0) return null;

  return (
    <div className="inbox-used-tags">
      <div className="inbox-used-tags-header">
        <label className="inbox-used-tags-label">Used tags</label>
        <span className="inbox-used-tags-hint">Filter by tag, then select photos to add more tags</span>
      </div>
      <div className="inbox-used-tags-chips">
        {tags.map((tag) => {
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
    </div>
  );
}
