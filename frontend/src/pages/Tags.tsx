import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tag, api } from "../api/client";
import LabelSearchInput from "../components/LabelSearchInput";
import { filterByNameQuery } from "../utils/filterLabelsByQuery";

export default function TagsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [search, setSearch] = useState("");

  const { data: tags = [], refetch } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const create = useMutation({
    mutationFn: () => api.createTag(name.trim()),
    onSuccess: () => {
      setShowForm(false);
      setName("");
      refetch();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, newName }: { id: number; newName: string }) =>
      api.updateTag(id, { name: newName }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const merge = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.mergeTags(sourceId, targetId),
    onSuccess: () => {
      setMergingId(null);
      setMergeTargetId("");
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setMergingId(null);
  };

  const startMerge = (tag: Tag) => {
    setMergingId(tag.id);
    setMergeTargetId("");
    setEditingId(null);
  };

  const handleDelete = (tag: Tag) => {
    const msg =
      tag.photo_count > 0
        ? `Delete "${tag.name}"? This removes it from ${tag.photo_count} photo(s).`
        : `Delete "${tag.name}"?`;
    if (window.confirm(msg)) {
      remove.mutate(tag.id);
    }
  };

  const handleMerge = (source: Tag) => {
    const target = tags.find((t) => t.id === Number(mergeTargetId));
    if (!target) return;
    const msg = `Merge "${source.name}" into "${target.name}"? All photo tags move to the target.`;
    if (window.confirm(msg)) {
      merge.mutate({ sourceId: source.id, targetId: target.id });
    }
  };

  const alwaysInclude = useMemo(() => {
    const names = new Set<string>();
    const editing = editingId != null ? tags.find((t) => t.id === editingId) : null;
    const merging = mergingId != null ? tags.find((t) => t.id === mergingId) : null;
    if (editing) names.add(editing.name);
    if (merging) names.add(merging.name);
    return names.size > 0 ? names : undefined;
  }, [tags, editingId, mergingId]);

  const filteredTags = useMemo(
    () => filterByNameQuery(tags, search, alwaysInclude),
    [tags, search, alwaysInclude],
  );

  return (
    <div>
      <div className="page-header">
        <h2>Tags</h2>
        <button className="btn" onClick={() => setShowForm(true)}>
          New tag
        </button>
      </div>

      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Manage tags on photos (Cars, house project, etc.). Merge duplicates or delete unused entries.
      </p>

      {showForm && (
        <div className="people-form-card">
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cars" />
          </div>
          <div className="people-form-actions">
            <button className="btn" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Create
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setName(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginBottom: "1rem", maxWidth: "24rem" }}>
          <LabelSearchInput value={search} onChange={setSearch} placeholder="Search tags…" />
        </div>
      )}

      {tags.length === 0 ? (
        <div className="empty-state">
          No tags yet. Create one or tag photos from Inbox or Calendar.
        </div>
      ) : filteredTags.length === 0 ? (
        <p className="label-search-empty">No tags match — try another term</p>
      ) : (
      <div className="people-list">
        {filteredTags.map((tag) => (
          <div key={tag.id} className="people-list-row">
            {editingId === tag.id ? (
              <div className="people-edit-inline">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="people-edit-input"
                />
                <button
                  className="btn"
                  disabled={!editName.trim() || update.isPending}
                  onClick={() => update.mutate({ id: tag.id, newName: editName.trim() })}
                >
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            ) : mergingId === tag.id ? (
              <div className="people-merge-inline">
                <span>Merge into:</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="bulk-event-select"
                >
                  <option value="">Select tag...</option>
                  {tags
                    .filter((t) => t.id !== tag.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <button
                  className="btn"
                  disabled={!mergeTargetId || merge.isPending}
                  onClick={() => handleMerge(tag)}
                >
                  Merge
                </button>
                <button className="btn btn-secondary" onClick={() => setMergingId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="people-list-info">
                  <Link to={`/browse/tag/${tag.slug}`} className="people-list-name-link">
                    <strong>{tag.name}</strong>
                  </Link>
                  <span className="people-list-count">{tag.photo_count} photos</span>
                </div>
                <div className="people-list-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => startEdit(tag)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => startMerge(tag)}>
                    Merge
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(tag)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
