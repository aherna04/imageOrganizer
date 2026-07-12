import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Tag, api } from "../api/client";
import LabelSearchInput from "./LabelSearchInput";
import { filterTagsByQuery } from "../utils/filterLabelsByQuery";
import { useRecentTags } from "../utils/recentTags";

interface Props {
  fileId: number;
  fileTags: Tag[];
  onChange: () => void;
  showTagSearch?: boolean;
  excludeSelected?: boolean;
  hideLabel?: boolean;
}

function tagIds(tags: Tag[]) {
  return tags.map((t) => t.id);
}

export default function FileTagPicker({
  fileId,
  fileTags,
  onChange,
  showTagSearch = false,
  excludeSelected = false,
  hideLabel = false,
}: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { recentIds, recordRecentTag } = useRecentTags();
  const [selectedIds, setSelectedIds] = useState(() => tagIds(fileTags));
  const propIdsKey = [...tagIds(fileTags)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    setSelectedIds(tagIds(fileTags));
  }, [fileId, propIdsKey]);

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const selected = new Set(selectedIds);
  const alwaysInclude = useMemo(() => new Set(selectedIds), [selectedIds]);
  const searchActive = searchQuery.trim().length > 0;
  const searchFirst = showTagSearch && !searchActive;

  const recentTags = useMemo(() => {
    const byId = new Map(allTags.map((t) => [t.id, t]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((t): t is Tag => t != null)
      .filter((t) => !excludeSelected || !selected.has(t.id));
  }, [allTags, recentIds, excludeSelected, selectedIds]);

  const assignedTags = useMemo(
    () => allTags.filter((t) => selected.has(t.id)),
    [allTags, selectedIds],
  );

  const visibleTags = useMemo(() => {
    if (searchFirst) {
      const recentSet = new Set(recentTags.map((t) => t.id));
      return assignedTags
        .filter((t) => !recentSet.has(t.id))
        .filter((t) => !excludeSelected || !selected.has(t.id));
    }
    let list = showTagSearch ? filterTagsByQuery(allTags, searchQuery, alwaysInclude) : allTags;
    if (!searchActive && recentTags.length > 0) {
      const recentSet = new Set(recentTags.map((t) => t.id));
      list = list.filter((t) => !recentSet.has(t.id));
    }
    return list.filter((t) => !excludeSelected || !selected.has(t.id));
  }, [allTags, searchQuery, alwaysInclude, showTagSearch, searchActive, recentTags, searchFirst, assignedTags, excludeSelected, selectedIds]);

  const toggle = async (tagId: number) => {
    const prev = selectedIds;
    const adding = !selected.has(tagId);
    const next = adding ? [...selectedIds, tagId] : selectedIds.filter((id) => id !== tagId);
    setSelectedIds(next);
    try {
      await api.updateFileTags(fileId, next);
      if (adding) recordRecentTag(tagId);
      onChange();
    } catch {
      setSelectedIds(prev);
    }
  };

  const create = useMutation({
    mutationFn: () => api.createTag(newName.trim()),
    onSuccess: async (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      let next: number[] = [];
      setSelectedIds((prev) => {
        next = [...prev, tag.id];
        return next;
      });
      try {
        await api.updateFileTags(fileId, next);
        recordRecentTag(tag.id);
        setNewName("");
        setShowNew(false);
        onChange();
      } catch {
        setSelectedIds((prev) => prev.filter((id) => id !== tag.id));
      }
    },
  });

  return (
    <div>
      {!hideLabel && (
        <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>Tags</label>
      )}
      {showTagSearch && <LabelSearchInput value={searchQuery} onChange={setSearchQuery} />}
      {searchFirst && <p className="label-search-hint">Search to add more tags</p>}
      {!searchActive && recentTags.length > 0 && (
        <div className="recent-tags">
          <span className="recent-tags-label">Recently used</span>
          <div className="recent-tags-chips">
            {recentTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`badge tag-badge ${selected.has(tag.id) ? "active" : ""}`}
                onClick={() => toggle(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {showTagSearch && searchActive && visibleTags.length === 0 ? (
        <p className="label-search-empty">No tags match — try another term</p>
      ) : (
        <div className="tag-picker-chips" style={{ marginTop: hideLabel ? 0 : "0.35rem" }}>
          {visibleTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`badge tag-badge ${selected.has(tag.id) ? "active" : ""}`}
              onClick={() => toggle(tag.id)}
            >
              {tag.name}
            </button>
          ))}
          {!showNew ? (
            <button type="button" className="badge tag-badge tag-badge-add" onClick={() => setShowNew(true)}>
              + Add tag
            </button>
          ) : (
            <div className="tag-picker-new">
              <input
                type="text"
                placeholder="Tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="tag-picker-input"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newName.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowNew(false);
                  setNewName("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
