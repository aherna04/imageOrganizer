import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MediaFile, api } from "../api/client";
import CaptureDateEditor from "./CaptureDateEditor";
import CollapsibleSection from "./CollapsibleSection";
import LabelSearchInput from "./LabelSearchInput";
import { hasDuplicateName, personLabel } from "../utils/personLabel";
import { filterTagsByQuery } from "../utils/filterLabelsByQuery";
import { useRecentPeople } from "../utils/recentPeople";
import { useRecentTags } from "../utils/recentTags";

type Coverage = "all" | "some" | "none";

interface Props {
  selectedFiles: MediaFile[];
  /** Tag / person / event assignment changed. */
  onLabelsChange: () => void;
  /** Capture date changed (calendar path invalidation). */
  onDateChange: () => void;
  showTagSearch?: boolean;
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

export default function BulkLabelEditors({
  selectedFiles,
  onLabelsChange,
  onDateChange,
  showTagSearch = false,
}: Props) {
  const qc = useQueryClient();
  const fileIds = selectedFiles.map((f) => f.id);

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [newEventColor, setNewEventColor] = useState("#6366f1");

  const [showNewPerson, setShowNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");

  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const { recentIds, recordRecentTag } = useRecentTags();
  const { recentIds: recentPeopleIds, recordRecentPerson } = useRecentPeople();

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: api.listPeople });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });

  const nameExists = newPersonName.trim() ? hasDuplicateName(newPersonName, people) : false;

  const tagCoverage = (tagId: number) =>
    coverage(selectedFiles, (f) => (f.tags ?? []).some((t) => t.id === tagId));

  const alwaysIncludeTagIds = useMemo(() => {
    const ids = new Set<number>();
    for (const tag of tags) {
      const cov = tagCoverage(tag.id);
      if (cov === "all" || cov === "some") ids.add(tag.id);
    }
    return ids;
  }, [tags, selectedFiles]);

  const tagSearchActive = tagSearchQuery.trim().length > 0;
  const searchFirst = showTagSearch && !tagSearchActive;

  const recentTags = useMemo(() => {
    const byId = new Map(tags.map((t) => [t.id, t]));
    return recentIds.map((id) => byId.get(id)).filter((t): t is (typeof tags)[number] => t != null);
  }, [tags, recentIds]);

  const recentPeople = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return recentPeopleIds.map((id) => byId.get(id)).filter((p): p is (typeof people)[number] => p != null);
  }, [people, recentPeopleIds]);

  const visiblePeople = useMemo(() => {
    const recentSet = new Set(recentPeople.map((p) => p.id));
    return people.filter((p) => !recentSet.has(p.id));
  }, [people, recentPeople]);

  const assignedTags = useMemo(
    () => tags.filter((t) => alwaysIncludeTagIds.has(t.id)),
    [tags, alwaysIncludeTagIds],
  );

  const visibleTags = useMemo(() => {
    if (searchFirst) {
      const recentSet = new Set(recentTags.map((t) => t.id));
      return assignedTags.filter((t) => !recentSet.has(t.id));
    }
    let list = showTagSearch
      ? filterTagsByQuery(tags, tagSearchQuery, alwaysIncludeTagIds)
      : tags;
    if (!tagSearchActive && recentTags.length > 0) {
      const recentSet = new Set(recentTags.map((t) => t.id));
      list = list.filter((t) => !recentSet.has(t.id));
    }
    return list;
  }, [tags, tagSearchQuery, alwaysIncludeTagIds, showTagSearch, tagSearchActive, recentTags, searchFirst, assignedTags]);

  const assignedEventCount = useMemo(() => {
    const ids = new Set<number>();
    for (const file of selectedFiles) {
      for (const ev of file.events ?? []) {
        ids.add(ev.id);
      }
    }
    return ids.size;
  }, [selectedFiles]);

  const assignedPeopleCount = useMemo(() => {
    const ids = new Set<number>();
    for (const file of selectedFiles) {
      for (const p of file.people ?? []) {
        ids.add(p.id);
      }
    }
    return ids.size;
  }, [selectedFiles]);

  const toggleEvent = async (eventId: number, cov: Coverage) => {
    if (cov === "all") {
      await Promise.all(
        selectedFiles.map((file) => {
          const next = (file.events ?? []).map((e) => e.id).filter((id) => id !== eventId);
          return api.setFileEvents(file.id, next);
        }),
      );
    } else {
      await api.assignEventIds(eventId, fileIds);
    }
    onLabelsChange();
  };

  const togglePerson = async (personId: number, cov: Coverage) => {
    if (cov === "all") {
      await api.unassignPeopleIds([personId], fileIds);
    } else {
      await api.assignPeopleIds([personId], fileIds);
      recordRecentPerson(personId);
    }
    onLabelsChange();
  };

  const toggleTag = async (tagId: number, cov: Coverage) => {
    if (cov === "all") {
      await api.unassignTagIds([tagId], fileIds);
    } else {
      await api.assignTagIds([tagId], fileIds);
      recordRecentTag(tagId);
    }
    onLabelsChange();
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
      onLabelsChange();
    },
  });

  const createPerson = useMutation({
    mutationFn: async () => {
      const person = await api.createPerson(newPersonName.trim());
      await api.assignPeopleIds([person.id], fileIds);
      return person;
    },
    onSuccess: (person) => {
      recordRecentPerson(person.id);
      qc.invalidateQueries({ queryKey: ["people"] });
      setNewPersonName("");
      setShowNewPerson(false);
      onLabelsChange();
    },
  });

  const createTag = useMutation({
    mutationFn: async () => {
      const tag = await api.createTag(newTagName.trim());
      await api.assignTagIds([tag.id], fileIds);
      return tag;
    },
    onSuccess: (tag) => {
      recordRecentTag(tag.id);
      qc.invalidateQueries({ queryKey: ["tags"] });
      setNewTagName("");
      setShowNewTag(false);
      onLabelsChange();
    },
  });

  const eventsSection = (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
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
    </>
  );

  const peopleSection = (
    <>
      {recentPeople.length > 0 && (
        <div className="recent-tags">
          <span className="recent-tags-label">Recently used</span>
          <div className="recent-tags-chips">
            {recentPeople.map((person) => {
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
          </div>
        </div>
      )}
      <div className="tag-picker-chips" style={{ marginTop: recentPeople.length > 0 ? "0.35rem" : 0 }}>
        {visiblePeople.map((person) => {
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
    </>
  );

  return (
    <div className="single-file-label-editors">
      <CaptureDateEditor files={selectedFiles} onChange={onDateChange} compact />
      <div className="label-editor-columns">
        <CollapsibleSection
          title="Events"
          count={assignedEventCount || undefined}
          defaultOpen={false}
          persistKey="imageOrganizer.collapsible.inbox.events"
        >
          {eventsSection}
        </CollapsibleSection>
        <CollapsibleSection
          title="People"
          count={assignedPeopleCount || undefined}
          defaultOpen={false}
          persistKey="imageOrganizer.collapsible.inbox.people"
        >
          {peopleSection}
        </CollapsibleSection>
        <div className="label-editor-tags">
          <label style={{ fontSize: "0.875rem", color: "#aab0bc" }}>Tags</label>
          {showTagSearch && <LabelSearchInput value={tagSearchQuery} onChange={setTagSearchQuery} />}
          {searchFirst && <p className="label-search-hint">Search to add more tags</p>}
          {!tagSearchActive && recentTags.length > 0 && (
            <div className="recent-tags">
              <span className="recent-tags-label">Recently used</span>
              <div className="recent-tags-chips">
                {recentTags.map((tag) => {
                  const cov = tagCoverage(tag.id);
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
              </div>
            </div>
          )}
          {showTagSearch && tagSearchActive && visibleTags.length === 0 ? (
            <p className="label-search-empty">No tags match — try another term</p>
          ) : (
            <div className="tag-picker-chips" style={{ marginTop: "0.35rem" }}>
              {visibleTags.map((tag) => {
                const cov = tagCoverage(tag.id);
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
          )}
        </div>
      </div>
    </div>
  );
}
