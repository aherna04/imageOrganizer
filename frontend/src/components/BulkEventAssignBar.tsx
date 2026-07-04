import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

interface Props {
  selectedIds: number[];
  onClear: () => void;
  onAssigned: () => void;
  totalCount?: number;
  onSelectAll?: () => void;
}

export default function BulkEventAssignBar({
  selectedIds,
  onClear,
  onAssigned,
  totalCount,
  onSelectAll,
}: Props) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [existingEventId, setExistingEventId] = useState("");

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
  });

  const assignExisting = useMutation({
    mutationFn: (eventId: number) => api.assignEventIds(eventId, selectedIds),
    onSuccess: () => {
      setExistingEventId("");
      onAssigned();
    },
  });

  const createAndAssign = useMutation({
    mutationFn: async () => {
      const ev = await api.createEvent({ name: newName.trim(), color: newColor });
      await api.assignEventIds(ev.id, selectedIds);
    },
    onSuccess: () => {
      setNewName("");
      setShowNewForm(false);
      onAssigned();
    },
  });

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="bulk-event-bar">
      <span className="bulk-event-bar-count">{selectedIds.length} selected</span>

      {onSelectAll && totalCount !== undefined && totalCount > selectedIds.length && (
        <button type="button" className="link-btn" onClick={onSelectAll}>
          Select all {totalCount}
        </button>
      )}

      <div className="bulk-event-bar-actions">
        <select
          value={existingEventId}
          onChange={(e) => setExistingEventId(e.target.value)}
          className="bulk-event-select"
        >
          <option value="">Add to event...</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!existingEventId || assignExisting.isPending}
          onClick={() => assignExisting.mutate(Number(existingEventId))}
        >
          Assign
        </button>

        {!showNewForm ? (
          <button type="button" className="btn" onClick={() => setShowNewForm(true)}>
            New trip/event
          </button>
        ) : (
          <div className="bulk-event-new-form">
            <input
              type="text"
              placeholder="Event name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bulk-event-name-input"
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              title="Event color"
              className="bulk-event-color-input"
            />
            <button
              type="button"
              className="btn"
              disabled={!newName.trim() || createAndAssign.isPending}
              onClick={() => createAndAssign.mutate()}
            >
              Create & assign
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

        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
