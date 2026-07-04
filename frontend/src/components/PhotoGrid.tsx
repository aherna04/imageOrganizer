import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";
import { personLabel } from "../utils/personLabel";
import PhotoCardLabels from "./PhotoCardLabels";

interface Props {
  files: MediaFile[];
  selectedIds?: number[];
  onSelect?: (file: MediaFile) => void;
  onToggleSelect?: (id: number) => void;
  onDoubleClick?: (file: MediaFile) => void;
  multiSelectMode?: boolean;
  size?: "default" | "large";
  editableLabels?: boolean;
  onLabelsChange?: () => void;
}

export default function PhotoGrid({
  files,
  selectedIds = [],
  onSelect,
  onToggleSelect,
  onDoubleClick,
  multiSelectMode = false,
  size = "default",
  editableLabels = false,
  onLabelsChange,
}: Props) {
  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
    enabled: !editableLabels,
  });

  if (files.length === 0) {
    return <div className="empty-state">No media found.</div>;
  }

  const showCheckboxes = multiSelectMode || !!onToggleSelect;
  const gridClass = size === "large" ? "photo-grid photo-grid-large" : "photo-grid";

  return (
    <div className={gridClass}>
      {files.map((file) => {
        const isSelected = selectedIds.includes(file.id);
        return (
          <div
            key={file.id}
            className={`photo-card ${isSelected ? "selected" : ""}`}
            onClick={() => {
              if (onToggleSelect) onToggleSelect(file.id);
              else onSelect?.(file);
            }}
            onDoubleClick={() => onDoubleClick?.(file)}
          >
            {showCheckboxes && (
              <div className={`photo-checkbox ${isSelected ? "checked" : ""}`} aria-hidden>
                {isSelected && "✓"}
              </div>
            )}
            <img src={api.thumbUrl(file.id)} alt={file.filename} loading="lazy" />
            {file.media_type === "video" && (
              <span className="video-badge" aria-hidden>
                ▶
              </span>
            )}
            <div className="meta">
              <div>{file.filename}</div>
              {file.capture_day && <div>{file.capture_day}</div>}
              {editableLabels ? (
                <PhotoCardLabels file={file} onChange={onLabelsChange} />
              ) : (
                <>
                  {file.events?.map((e) => (
                    <span
                      key={e.id}
                      className="badge event-badge"
                      style={{ background: e.color, color: "#fff" }}
                    >
                      {e.name}
                    </span>
                  ))}
                  {file.people?.map((p) => (
                    <span key={p.id} className="badge person-badge">
                      {personLabel(p, allPeople)}
                    </span>
                  ))}
                  {file.tags?.map((t) => (
                    <span key={t.id} className="badge tag-badge">
                      {t.name}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
