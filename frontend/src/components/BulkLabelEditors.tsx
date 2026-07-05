import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile, api } from "../api/client";
import CaptureDateEditor from "./CaptureDateEditor";
import { hasDuplicateName, personLabel } from "../utils/personLabel";

type Coverage = "all" | "some" | "none";

interface Props {
  selectedFiles: MediaFile[];
  onChange: () => void;
}

function coverage(selectedFiles: MediaFile[], hasLabel: (file: MediaFile) => boolean): Coverage {
  const count = selectedFiles.filter(hasLabel).length;
  if (count === 0) return "none";
  if (count === selectedFiles.length) return "all";
  return "some";
}

function chipClass(base: string, cov: Coverage): string {
  if (cov === "all") return `${base} active`;
  if (cov === "some") return `${base} badge-partial`;
  return base;
}

export default function BulkLabelEditors({ selectedFiles, onChange }: Props) {
  const qc = useQueryClient();
  const fileIds = selectedFiles.map((f) => f.id);

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [newEventColor, setNewEventColor] = useState("#6366f1");

  const [showNewPerson, setShowNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");

  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: api.listPeople });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  const nameExists = newPersonName.trim() ? hasDuplicateName(newPersonName, people) : false;

  const toggleEvent = async (eventId: number, cov: Coverage) => {
    if (cov === "all") {
      await Promise.all(
        selectedFiles.map((file) => {
          const next = (file.events ?? []).map((e) => e.id).filter((id) => id !== eventId);
          return api.setFileEvents(file.id, next);
        })
      );
    } else {
      await api.assignEventIds(eventId, fileIds);
    }
    onChange();
  };

  const togglePerson = async (personId: number, cov: Coverage) => {
    if (cov === "all") {
      await api.unassignPeopleIds([personId], fileIds);
    } else {
      await api.assignPeopleIds([personId], fileIds);
    }
    onChange();
  };

  const toggleTag = async (tagId: number, cov: Coverage) => {
    if (cov === "all") {
      await api.unassignTagIds([tagId], fileIds);
    } else {
      await api.assignTagIds([tagId], fileIds);
    }
    onChange();
  };

  const createEvent = useMutation({
    mutationFn: async () => {
      const ev = await api.createEvent({ name: newEventName.trim(), color: newEventColor });
      await api.assignEventIds(ev.id, fileIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      setNewEventName("");
      setShowNewEvent(false);
      onChange();
    },
  });

  const createPerson = useMutation({
    mutationFn: async () => {
      const person = await api.createPerson(newPersonName.trim());
      await api.assignPeopleIds([person.id], fileIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      setNewPersonName("");
      setShowNewPerson(false);
      onChange();
    },
  });

  const createTag = useMutation({
    mutationFn: async () => {
      const tag = await api.createTag(newTagName.trim());
      await api.assignTagIds([tag.id], fileIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setNewTagName("");
      setShowNewTag(false);
      onChange();
    },
  });

  return (
    <div className="single-file-label-editors">
      <CaptureDateEditor files={selectedFiles} onChange={onChange} />
      <div>
        <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>
          Events ({selectedFiles.length} photos)
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
          {events.map((ev) => {
            const cov = coverage(selectedFiles, (f) => (f.events ?? []).some((e) => e.id === ev.id));
            return (
              <button
                key={ev.id}
                type="button"
                className={`badge event-badge ${chipClass("event-badge", cov)}`}
                style={{
                  background: cov === "all" || cov === "some" ? ev.color : "#2a2f3a",
                  color: "#fff",
                  border:
                    cov === "all"
                      ? `2px solid ${ev.color}`
                      : cov === "some"
                        ? `2px dashed ${ev.color}`
                        : "2px solid transparent",
                }}
                onClick={() => toggleEvent(ev.id, cov)}
              >
                {ev.name}
              </button>
            );
          })}
          {!showNewEvent ? (
            <button
              type="button"
              className="badge event-badge tag-badge-add"
              onClick={() => setShowNewEvent(true)}
            >
              + New event
            </button>
          ) : (
            <div className="tag-picker-new">
              <input
                type="text"
                placeholder="Event name"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                className="tag-picker-input"
              />
              <input
                type="color"
                value={newEventColor}
                onChange={(e) => setNewEventColor(e.target.value)}
                title="Event color"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newEventName.trim() || createEvent.isPending}
                onClick={() => createEvent.mutate()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowNewEvent(false);
                  setNewEventName("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>People</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
          {people.map((person) => {
            const cov = coverage(selectedFiles, (f) => (f.people ?? []).some((p) => p.id === person.id));
            return (
              <button
                key={person.id}
                type="button"
                className={chipClass("badge person-badge", cov)}
                onClick={() => togglePerson(person.id, cov)}
              >
                {personLabel(person, people)}
              </button>
            );
          })}
          {!showNewPerson ? (
            <button
              type="button"
              className="badge person-badge person-badge-add"
              onClick={() => setShowNewPerson(true)}
            >
              + Add person
            </button>
          ) : (
            <div className="tag-picker-new">
              <input
                type="text"
                placeholder="Person name"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                className="tag-picker-input"
              />
              {nameExists && (
                <span className="person-duplicate-warning">
                  {newPersonName.trim()} already exists — use existing or pick a different name.
                </span>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newPersonName.trim() || createPerson.isPending}
                onClick={() => createPerson.mutate()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowNewPerson(false);
                  setNewPersonName("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>Tags</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
          {tags.map((tag) => {
            const cov = coverage(selectedFiles, (f) => (f.tags ?? []).some((t) => t.id === tag.id));
            return (
              <button
                key={tag.id}
                type="button"
                className={chipClass("badge tag-badge", cov)}
                onClick={() => toggleTag(tag.id, cov)}
              >
                {tag.name}
              </button>
            );
          })}
          {!showNewTag ? (
            <button type="button" className="badge tag-badge tag-badge-add" onClick={() => setShowNewTag(true)}>
              + Add tag
            </button>
          ) : (
            <div className="tag-picker-new">
              <input
                type="text"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="tag-picker-input"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newTagName.trim() || createTag.isPending}
                onClick={() => createTag.mutate()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowNewTag(false);
                  setNewTagName("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
