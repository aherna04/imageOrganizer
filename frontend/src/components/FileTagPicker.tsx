import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Tag, api } from "../api/client";

interface Props {
  fileId: number;
  fileTags: Tag[];
  onChange: () => void;
}

function tagIds(tags: Tag[]) {
  return tags.map((t) => t.id);
}

export default function FileTagPicker({ fileId, fileTags, onChange }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
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

  const toggle = async (tagId: number) => {
    const prev = selectedIds;
    const next = selected.has(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    setSelectedIds(next);
    try {
      await api.updateFileTags(fileId, next);
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
      <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>Tags</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
        {allTags.map((tag) => (
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
    </div>
  );
}
