import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";
import { AlertFilter, DateAlert, DuplicateAlert } from "../utils/photoAlerts";
import { personLabel } from "../utils/personLabel";
import PhotoCardLabels from "./PhotoCardLabels";

interface Props {
  files: MediaFile[];
  selectedIds?: number[];
  activeDetailId?: number;
  onSelect?: (file: MediaFile) => void;
  onToggleSelect?: (id: number, event: React.MouseEvent) => void;
  onOpenDetail?: (file: MediaFile) => void;
  onDoubleClick?: (file: MediaFile) => void;
  multiSelectMode?: boolean;
  size?: "default" | "large";
  editableLabels?: boolean;
  onLabelsChange?: () => void;
  duplicateIndex?: Map<number, DuplicateAlert>;
  dateAlerts?: Map<number, DateAlert>;
  alertFilter?: AlertFilter;
  subtitleByFileId?: Record<number, string>;
}

export default function PhotoGrid({
  files,
  selectedIds = [],
  activeDetailId,
  onSelect,
  onToggleSelect,
  onOpenDetail,
  onDoubleClick,
  multiSelectMode = false,
  size = "default",
  editableLabels = false,
  onLabelsChange,
  duplicateIndex,
  dateAlerts,
  alertFilter = "all",
  subtitleByFileId,
}: Props) {
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
    enabled: !editableLabels,
  });

  useEffect(() => {
    if (activeDetailId == null) return;
    const el = cardRefs.current.get(activeDetailId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeDetailId]);

  if (files.length === 0) {
    return (
      <div className="empty-state">
        {alertFilter === "alerts" ? "No photos with alerts in this list." : "No media found."}
      </div>
    );
  }

  const showCheckboxes = multiSelectMode || !!onToggleSelect;
  const splitSelectDetail = !!onToggleSelect && !!onOpenDetail;
  const gridClass = size === "large" ? "photo-grid photo-grid-large" : "photo-grid";

  return (
    <div className={gridClass}>
      {files.map((file) => {
        const isSelected = selectedIds.includes(file.id);
        const isDetailActive = activeDetailId === file.id;
        const dateAlert = dateAlerts?.get(file.id);
        const dupAlert = duplicateIndex?.get(file.id);
        const hasDateWarning = !!dateAlert;
        const isDuplicate = !!dupAlert;
        const isBlurry = file.is_blurry;

        return (
          <div
            key={file.id}
            ref={(el) => {
              if (el) cardRefs.current.set(file.id, el);
              else cardRefs.current.delete(file.id);
            }}
            className={`photo-card ${isSelected ? "selected" : ""} ${isDetailActive ? "detail-active" : ""} ${hasDateWarning ? "has-date-warning" : ""} ${isDuplicate ? "is-duplicate" : ""} ${isBlurry ? "is-blurry" : ""} ${splitSelectDetail ? "split-select-detail" : ""}`}
            onClick={
              splitSelectDetail
                ? undefined
                : (e) => {
                    if (onToggleSelect) onToggleSelect(file.id, e);
                    else onSelect?.(file);
                  }
            }
            onDoubleClick={() => onDoubleClick?.(file)}
          >
            {showCheckboxes && (
              <div
                className={`photo-checkbox ${isSelected ? "checked" : ""} ${splitSelectDetail ? "interactive" : ""}`}
                aria-hidden={!splitSelectDetail}
                role={splitSelectDetail ? "checkbox" : undefined}
                aria-checked={splitSelectDetail ? isSelected : undefined}
                onClick={
                  splitSelectDetail
                    ? (e) => {
                        e.stopPropagation();
                        onToggleSelect!(file.id, e);
                      }
                    : undefined
                }
              >
                {isSelected && "✓"}
              </div>
            )}
            <div
              className="photo-thumb"
              onClick={
                splitSelectDetail
                  ? (e) => {
                      e.stopPropagation();
                      onOpenDetail!(file);
                    }
                  : undefined
              }
            >
              <img src={api.thumbUrl(file.id, file.mtime)} alt={file.filename} loading="lazy" />
              {(hasDateWarning || isDuplicate || isBlurry) && (
                <div className="photo-alert-badges">
                  {hasDateWarning && (
                    <span
                      className="photo-alert-badge date"
                      title={`Filename suggests ${dateAlert.suggestedDate}`}
                    >
                      Date
                    </span>
                  )}
                  {isDuplicate && (
                    <span
                      className="photo-alert-badge duplicate"
                      title={`${dupAlert.groupType} duplicate · ${dupAlert.memberCount} files`}
                    >
                      Dup
                    </span>
                  )}
                  {isBlurry && (
                    <span
                      className="photo-alert-badge blur"
                      title={
                        file.blur_score != null
                          ? `Blur score ${file.blur_score.toFixed(1)} (lower = blurrier)`
                          : "Blurry"
                      }
                    >
                      Blur
                    </span>
                  )}
                </div>
              )}
              {file.media_type === "video" && (
                <span className="video-badge" aria-hidden>
                  ▶
                </span>
              )}
            </div>
            <div className="meta">
              <div>{file.filename}</div>
              {subtitleByFileId?.[file.id] && (
                <div className="photo-card-subtitle" title={subtitleByFileId[file.id]}>
                  {subtitleByFileId[file.id]}
                </div>
              )}
              {file.capture_day && <div>{file.capture_day}</div>}
              {hasDateWarning && (
                <div className="capture-date-hint" style={{ marginTop: "0.2rem" }}>
                  Filename suggests {dateAlert.suggestedDate}
                </div>
              )}
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
