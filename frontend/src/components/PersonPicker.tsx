import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Person, api } from "../api/client";
import { hasDuplicateName, personLabel } from "../utils/personLabel";
import { useRecentPeople } from "../utils/recentPeople";

interface Props {
  fileId: number;
  filePeople: Person[];
  onChange: () => void;
  hideLabel?: boolean;
  excludeSelected?: boolean;
}

function personIds(people: Person[]) {
  return people.map((p) => p.id);
}

export default function PersonPicker({ fileId, filePeople, onChange, hideLabel = false, excludeSelected = false }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const { recentIds, recordRecentPerson } = useRecentPeople();
  const [selectedIds, setSelectedIds] = useState(() => personIds(filePeople));
  const propIdsKey = [...personIds(filePeople)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    setSelectedIds(personIds(filePeople));
  }, [fileId, propIdsKey]);

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const selected = new Set(selectedIds);
  const nameExists = newName.trim() ? hasDuplicateName(newName, allPeople) : false;

  const recentPeople = useMemo(() => {
    const byId = new Map(allPeople.map((p) => [p.id, p]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((p): p is Person => p != null)
      .filter((p) => !excludeSelected || !selected.has(p.id));
  }, [allPeople, recentIds, excludeSelected, selectedIds]);

  const visiblePeople = useMemo(() => {
    const recentSet = new Set(recentPeople.map((p) => p.id));
    return allPeople
      .filter((person) => !recentSet.has(person.id))
      .filter((person) => !excludeSelected || !selected.has(person.id));
  }, [allPeople, recentPeople, excludeSelected, selectedIds]);

  const toggle = async (personId: number) => {
    const prev = selectedIds;
    const adding = !selected.has(personId);
    const next = adding ? [...selectedIds, personId] : selectedIds.filter((id) => id !== personId);
    setSelectedIds(next);
    try {
      await api.updateFilePeople(fileId, next);
      if (adding) recordRecentPerson(personId);
      onChange();
    } catch {
      setSelectedIds(prev);
    }
  };

  const create = useMutation({
    mutationFn: () => api.createPerson(newName.trim()),
    onSuccess: async (person) => {
      qc.invalidateQueries({ queryKey: ["people"] });
      let next: number[] = [];
      setSelectedIds((prev) => {
        next = [...prev, person.id];
        return next;
      });
      try {
        await api.updateFilePeople(fileId, next);
        recordRecentPerson(person.id);
        setNewName("");
        setShowNew(false);
        onChange();
      } catch {
        setSelectedIds((prev) => prev.filter((id) => id !== person.id));
      }
    },
  });

  return (
    <div>
      {!hideLabel && (
        <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>People</label>
      )}
      {recentPeople.length > 0 && (
        <div className="recent-tags">
          <span className="recent-tags-label">Recently used</span>
          <div className="recent-tags-chips">
            {recentPeople.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`badge person-badge ${selected.has(person.id) ? "active" : ""}`}
                onClick={() => toggle(person.id)}
              >
                {personLabel(person, allPeople)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: hideLabel ? 0 : "0.35rem" }}>
        {visiblePeople.map((person) => (
          <button
            key={person.id}
            type="button"
            className={`badge person-badge ${selected.has(person.id) ? "active" : ""}`}
            onClick={() => toggle(person.id)}
          >
            {personLabel(person, allPeople)}
          </button>
        ))}
        {!showNew ? (
          <button type="button" className="badge person-badge person-badge-add" onClick={() => setShowNew(true)}>
            + Add person
          </button>
        ) : (
          <div className="tag-picker-new">
            <input
              type="text"
              placeholder="Person name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="tag-picker-input"
            />
            {nameExists && (
              <span className="person-duplicate-warning">
                {newName.trim()} already exists — use existing or pick a different name.
              </span>
            )}
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
