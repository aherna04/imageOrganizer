import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Person, api } from "../api/client";
import { hasDuplicateName, personLabel } from "../utils/personLabel";

interface Props {
  fileId: number;
  filePeople: Person[];
  onChange: () => void;
}

export default function PersonPicker({ fileId, filePeople, onChange }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const selected = new Set(filePeople.map((p) => p.id));
  const nameExists = newName.trim() ? hasDuplicateName(newName, allPeople) : false;

  const toggle = async (personId: number) => {
    const next = selected.has(personId)
      ? [...selected].filter((id) => id !== personId)
      : [...selected, personId];
    await api.updateFilePeople(fileId, next);
    onChange();
  };

  const create = useMutation({
    mutationFn: () => api.createPerson(newName.trim()),
    onSuccess: async (person) => {
      qc.invalidateQueries({ queryKey: ["people"] });
      await api.updateFilePeople(fileId, [...selected, person.id]);
      setNewName("");
      setShowNew(false);
      onChange();
    },
  });

  return (
    <div>
      <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>People</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
        {allPeople.map((person) => (
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
