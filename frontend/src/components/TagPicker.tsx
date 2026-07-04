import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Tag, api } from "../api/client";

interface Props {
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

export default function TagPicker({ selectedTagIds, onChange }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const create = useMutation({
    mutationFn: () => api.createTag(newName.trim()),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      onChange([...selectedTagIds, tag.id]);
      setNewName("");
      setShowNew(false);
    },
  });

  const selected = new Set(selectedTagIds);

  const toggle = (tagId: number) => {
    const next = selected.has(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onChange(next);
  };

  return (
    <div className="tag-picker">
      <label className="tag-picker-label">Tags</label>
      <div className="tag-picker-chips">
        {tags.map((tag: Tag) => (
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
