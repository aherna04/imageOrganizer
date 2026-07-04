import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

interface Props {
  selectedIds: number[];
  onAssigned: () => void;
}

export default function BulkTagAssignBar({ selectedIds, onAssigned }: Props) {
  const qc = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [existingTagId, setExistingTagId] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const assignExisting = useMutation({
    mutationFn: (tagId: number) => api.assignTagIds([tagId], selectedIds),
    onSuccess: () => {
      setExistingTagId("");
      onAssigned();
    },
  });

  const unassignExisting = useMutation({
    mutationFn: (tagId: number) => api.unassignTagIds([tagId], selectedIds),
    onSuccess: () => {
      setExistingTagId("");
      onAssigned();
    },
  });

  const createAndAssign = useMutation({
    mutationFn: async () => {
      const tag = await api.createTag(newName.trim());
      await api.assignTagIds([tag.id], selectedIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setNewName("");
      setShowNewForm(false);
      onAssigned();
    },
  });

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="bulk-event-bar bulk-tag-bar">
      <span className="bulk-event-bar-count">{selectedIds.length} selected for tags</span>
      <div className="bulk-event-bar-actions">
        <select
          value={existingTagId}
          onChange={(e) => setExistingTagId(e.target.value)}
          className="bulk-event-select"
        >
          <option value="">Tag...</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!existingTagId || assignExisting.isPending}
          onClick={() => assignExisting.mutate(Number(existingTagId))}
        >
          Tag
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!existingTagId || unassignExisting.isPending}
          onClick={() => unassignExisting.mutate(Number(existingTagId))}
        >
          Untag
        </button>

        {!showNewForm ? (
          <button type="button" className="btn btn-secondary" onClick={() => setShowNewForm(true)}>
            New tag
          </button>
        ) : (
          <div className="bulk-event-new-form">
            <input
              type="text"
              placeholder="Tag name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bulk-event-name-input"
            />
            <button
              type="button"
              className="btn"
              disabled={!newName.trim() || createAndAssign.isPending}
              onClick={() => createAndAssign.mutate()}
            >
              Create & tag
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowNewForm(false);
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
