import { type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";
import { personLabel } from "../utils/personLabel";

interface Props {
  file: MediaFile;
  onChange?: () => void;
}

export default function PhotoCardLabels({ file, onChange }: Props) {
  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const stop = (e: MouseEvent) => e.stopPropagation();

  const removeEvent = async (eventId: number) => {
    const next = (file.events ?? []).map((e) => e.id).filter((id) => id !== eventId);
    await api.setFileEvents(file.id, next);
    onChange?.();
  };

  const removePerson = async (personId: number) => {
    const next = (file.people ?? []).map((p) => p.id).filter((id) => id !== personId);
    await api.updateFilePeople(file.id, next);
    onChange?.();
  };

  const removeTag = async (tagId: number) => {
    const next = (file.tags ?? []).map((t) => t.id).filter((id) => id !== tagId);
    await api.updateFileTags(file.id, next);
    onChange?.();
  };

  return (
    <div className="photo-card-labels" onClick={stop}>
      {file.events?.map((e) => (
        <span
          key={e.id}
          className="badge badge-removable event-badge"
          style={{ background: e.color, color: "#fff" }}
        >
          {e.name}
          <button
            type="button"
            className="badge-remove"
            aria-label={`Remove event ${e.name}`}
            onClick={(ev) => {
              ev.stopPropagation();
              removeEvent(e.id);
            }}
          >
            ×
          </button>
        </span>
      ))}
      {file.people?.map((p) => (
        <span key={p.id} className="badge badge-removable person-badge">
          {personLabel(p, allPeople)}
          <button
            type="button"
            className="badge-remove"
            aria-label={`Remove ${personLabel(p, allPeople)}`}
            onClick={(ev) => {
              ev.stopPropagation();
              removePerson(p.id);
            }}
          >
            ×
          </button>
        </span>
      ))}
      {file.tags?.map((t) => (
        <span key={t.id} className="badge badge-removable tag-badge">
          {t.name}
          <button
            type="button"
            className="badge-remove"
            aria-label={`Remove tag ${t.name}`}
            onClick={(ev) => {
              ev.stopPropagation();
              removeTag(t.id);
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
