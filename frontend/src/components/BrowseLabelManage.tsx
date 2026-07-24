import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Person, Tag, api } from "../api/client";
import { personLabel } from "../utils/personLabel";

type ManageKind = "person" | "tag";

export default function BrowseLabelManage({
  kind,
  entity,
  people,
  tags,
}: {
  kind: ManageKind;
  entity: Person | Tag;
  people: Person[];
  tags: Tag[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "edit" | "merge">("idle");
  const [editName, setEditName] = useState(entity.name);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const peers = kind === "person" ? people : tags;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["files"] });
    qc.invalidateQueries({ queryKey: ["browse-files"] });
    qc.invalidateQueries({ queryKey: ["browse-cooccur"] });
  };

  const update = useMutation({
    mutationFn: (newName: string) =>
      kind === "person"
        ? api.updatePerson(entity.id, { name: newName })
        : api.updateTag(entity.id, { name: newName }),
    onSuccess: (updated) => {
      setMode("idle");
      invalidate();
      if (kind === "person") {
        navigate(`/browse/person/${(updated as Person).slug}`, { replace: true });
      } else {
        navigate(`/browse/tag/${(updated as Tag).slug}`, { replace: true });
      }
    },
  });

  const merge = useMutation({
    mutationFn: (targetId: number) =>
      kind === "person"
        ? api.mergePeople(entity.id, targetId)
        : api.mergeTags(entity.id, targetId),
    onSuccess: (_data, targetId) => {
      setMode("idle");
      setMergeTargetId("");
      invalidate();
      const target = peers.find((p) => p.id === targetId);
      if (target && "slug" in target) {
        navigate(
          kind === "person" ? `/browse/person/${target.slug}` : `/browse/tag/${target.slug}`,
          { replace: true },
        );
      } else {
        navigate("/browse", { replace: true });
      }
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      kind === "person" ? api.deletePerson(entity.id) : api.deleteTag(entity.id),
    onSuccess: () => {
      invalidate();
      navigate("/browse", { replace: true });
    },
  });

  const label =
    kind === "person" ? personLabel(entity as Person, people) : entity.name;

  const startEdit = () => {
    setEditName(entity.name);
    setMode("edit");
  };

  const startMerge = () => {
    setMergeTargetId("");
    setMode("merge");
  };

  const handleDelete = () => {
    const msg =
      entity.photo_count > 0
        ? `Delete ${kind === "person" ? label : `"${label}"`}? This removes ${kind === "person" ? "them" : "it"} from ${entity.photo_count} photo(s).`
        : `Delete ${kind === "person" ? label : `"${label}"`}?`;
    if (window.confirm(msg)) {
      remove.mutate();
    }
  };

  const handleMerge = () => {
    const target = peers.find((p) => p.id === Number(mergeTargetId));
    if (!target) return;
    const targetLabel =
      kind === "person" ? personLabel(target as Person, people) : target.name;
    const msg =
      kind === "person"
        ? `Merge ${label} into ${targetLabel}? All tags move to the target person.`
        : `Merge "${label}" into "${targetLabel}"? All photo tags move to the target.`;
    if (window.confirm(msg)) {
      merge.mutate(target.id);
    }
  };

  if (mode === "edit") {
    return (
      <div className="browse-label-manage browse-label-manage-form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="people-edit-input"
          aria-label="New name"
        />
        <button
          type="button"
          className="btn"
          disabled={!editName.trim() || update.isPending}
          onClick={() => update.mutate(editName.trim())}
        >
          Save
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setMode("idle")}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "merge") {
    return (
      <div className="browse-label-manage browse-label-manage-form">
        <span className="browse-label-manage-hint">Merge into:</span>
        <select
          value={mergeTargetId}
          onChange={(e) => setMergeTargetId(e.target.value)}
          className="bulk-event-select"
        >
          <option value="">{kind === "person" ? "Select person…" : "Select tag…"}</option>
          {peers
            .filter((p) => p.id !== entity.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {kind === "person" ? personLabel(p as Person, people) : p.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!mergeTargetId || merge.isPending}
          onClick={handleMerge}
        >
          Merge
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setMode("idle")}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="browse-label-manage">
      <button type="button" className="btn btn-secondary" onClick={startEdit}>
        Edit
      </button>
      <button type="button" className="btn btn-secondary" onClick={startMerge}>
        Merge
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={handleDelete}
        disabled={remove.isPending}
      >
        Delete
      </button>
    </div>
  );
}
