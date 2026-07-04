import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Person, api } from "../api/client";
import { personLabel } from "../utils/personLabel";

export default function PeoplePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const { data: people = [], refetch } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const create = useMutation({
    mutationFn: () => api.createPerson(name.trim()),
    onSuccess: () => {
      setShowForm(false);
      setName("");
      refetch();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, newName }: { id: number; newName: string }) =>
      api.updatePerson(id, { name: newName }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deletePerson(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const merge = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.mergePeople(sourceId, targetId),
    onSuccess: () => {
      setMergingId(null);
      setMergeTargetId("");
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setEditName(person.name);
    setMergingId(null);
  };

  const startMerge = (person: Person) => {
    setMergingId(person.id);
    setMergeTargetId("");
    setEditingId(null);
  };

  const handleDelete = (person: Person) => {
    const msg =
      person.photo_count > 0
        ? `Delete ${personLabel(person, people)}? This removes them from ${person.photo_count} photo(s).`
        : `Delete ${person.name}?`;
    if (window.confirm(msg)) {
      remove.mutate(person.id);
    }
  };

  const handleMerge = (source: Person) => {
    const target = people.find((p) => p.id === Number(mergeTargetId));
    if (!target) return;
    const msg = `Merge ${personLabel(source, people)} into ${personLabel(target, people)}? All tags move to the target person.`;
    if (window.confirm(msg)) {
      merge.mutate({ sourceId: source.id, targetId: target.id });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>People</h2>
        <button className="btn" onClick={() => setShowForm(true)}>
          New person
        </button>
      </div>

      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Manage people tagged on photos. Merge duplicates or delete unused entries.
      </p>

      {showForm && (
        <div className="people-form-card">
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Elliott" />
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

      <div className="people-list">
        {people.map((person) => (
          <div key={person.id} className="people-list-row">
            {editingId === person.id ? (
              <div className="people-edit-inline">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="people-edit-input"
                />
                <button
                  className="btn"
                  disabled={!editName.trim() || update.isPending}
                  onClick={() => update.mutate({ id: person.id, newName: editName.trim() })}
                >
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            ) : mergingId === person.id ? (
              <div className="people-merge-inline">
                <span>Merge into:</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="bulk-event-select"
                >
                  <option value="">Select person...</option>
                  {people
                    .filter((p) => p.id !== person.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {personLabel(p, people)}
                      </option>
                    ))}
                </select>
                <button
                  className="btn"
                  disabled={!mergeTargetId || merge.isPending}
                  onClick={() => handleMerge(person)}
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
                  <strong>{personLabel(person, people)}</strong>
                  <span className="people-list-count">{person.photo_count} photos</span>
                </div>
                <div className="people-list-actions">
                  <Link to={`/browse/person/${person.slug}`} className="btn btn-secondary">
                    Browse
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => startEdit(person)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => startMerge(person)}>
                    Merge
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(person)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {people.length === 0 && (
          <div className="empty-state">No people yet. Create one or tag people on photos from Inbox or Calendar.</div>
        )}
      </div>
    </div>
  );
}
