import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { personLabel } from "../utils/personLabel";

interface Props {
  selectedIds: number[];
  onAssigned: () => void;
}

export default function BulkPersonAssignBar({ selectedIds, onAssigned }: Props) {
  const qc = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [existingPersonId, setExistingPersonId] = useState("");

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const assignExisting = useMutation({
    mutationFn: (personId: number) => api.assignPeopleIds([personId], selectedIds),
    onSuccess: () => {
      setExistingPersonId("");
      onAssigned();
    },
  });

  const unassignExisting = useMutation({
    mutationFn: (personId: number) => api.unassignPeopleIds([personId], selectedIds),
    onSuccess: () => {
      setExistingPersonId("");
      onAssigned();
    },
  });

  const createAndAssign = useMutation({
    mutationFn: async () => {
      const person = await api.createPerson(newName.trim());
      await api.assignPeopleIds([person.id], selectedIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      setNewName("");
      setShowNewForm(false);
      onAssigned();
    },
  });

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="bulk-event-bar bulk-person-bar">
      <span className="bulk-event-bar-count">{selectedIds.length} selected for people</span>
      <div className="bulk-event-bar-actions">
        <select
          value={existingPersonId}
          onChange={(e) => setExistingPersonId(e.target.value)}
          className="bulk-event-select"
        >
          <option value="">Tag person...</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p, people)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!existingPersonId || assignExisting.isPending}
          onClick={() => assignExisting.mutate(Number(existingPersonId))}
        >
          Tag
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!existingPersonId || unassignExisting.isPending}
          onClick={() => unassignExisting.mutate(Number(existingPersonId))}
        >
          Untag
        </button>

        {!showNewForm ? (
          <button type="button" className="btn btn-secondary" onClick={() => setShowNewForm(true)}>
            New person
          </button>
        ) : (
          <div className="bulk-event-new-form">
            <input
              type="text"
              placeholder="Person name"
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
