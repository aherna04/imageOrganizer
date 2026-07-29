import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MediaFile, api } from "../api/client";
import {
  adjacentFile,
  isEditableTarget,
  nextFileAfterCurrent,
  photoNavDelta,
} from "../utils/photoNavigation";
import CaptureDateEditor from "./CaptureDateEditor";
import CollapsibleSection from "./CollapsibleSection";
import EventPicker from "./EventPicker";
import PersonPicker from "./PersonPicker";
import FileTagPicker from "./FileTagPicker";
import PhotoCardLabels from "./PhotoCardLabels";
import { invalidateAfterReviewChange } from "../utils/invalidateAfterReviewChange";
import { invalidateAfterLabelChange } from "../utils/invalidateAfterLabelChange";
import { mosaicSourcePath } from "../utils/mosaicPath";
import { personLabel } from "../utils/personLabel";

interface Props {
  file: MediaFile;
  onClose: () => void;
  files?: MediaFile[];
  onChangeFile?: (file: MediaFile) => void;
  onDateChange?: (keepFileId?: number, options?: { skipInvalidation?: boolean }) => void;
  /** Tag / person / event edits — must not go through onDateChange. */
  onLabelsChange?: (keepFileId?: number) => void;
  deleteQueueMode?: boolean;
  trashMode?: boolean;
}

export default function PhotoDetail({
  file,
  onClose,
  files,
  onChangeFile,
  onDateChange,
  onLabelsChange,
  deleteQueueMode = false,
  trashMode = false,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentFile = files?.find((f) => f.id === file.id) ?? file;
  const { data: meta, refetch } = useQuery({
    queryKey: ["metadata", file.id],
    queryFn: () => api.getMetadata(file.id),
  });
  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const [caption, setCaption] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxTagsOpen, setLightboxTagsOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [actingSlow, setActingSlow] = useState(false);
  const [mediaEpoch, setMediaEpoch] = useState<number | null>(null);
  const drawerVideoRef = useRef<HTMLVideoElement>(null);
  const actingRef = useRef(false);

  const openLightbox = () => {
    drawerVideoRef.current?.pause();
    setLightboxOpen(true);
  };

  useEffect(() => {
    setCaption("");
    setRating("");
    setMediaEpoch(null);
  }, [file.id]);

  const thumbMtime = mediaEpoch ?? currentFile.mtime;

  const canNavigate = files != null && files.length > 1 && onChangeFile != null;
  const fileIndex = canNavigate ? files.findIndex((f) => f.id === file.id) : -1;

  const handleLabelsChange = useCallback(
    (keepFileId?: number) => {
      // Parent owns file-list refetch; only refresh global label caches if no parent handler.
      if (onLabelsChange) {
        onLabelsChange(keepFileId);
      } else {
        invalidateAfterLabelChange(qc);
      }
    },
    [qc, onLabelsChange],
  );

  const removeLightboxTag = useCallback(
    async (tagId: number) => {
      const next = (currentFile.tags ?? []).map((t) => t.id).filter((id) => id !== tagId);
      await api.updateFileTags(currentFile.id, next);
      handleLabelsChange(currentFile.id);
    },
    [currentFile.id, currentFile.tags, handleLabelsChange],
  );

  const removeLightboxPerson = useCallback(
    async (personId: number) => {
      const next = (currentFile.people ?? []).map((p) => p.id).filter((id) => id !== personId);
      await api.updateFilePeople(currentFile.id, next);
      handleLabelsChange(currentFile.id);
    },
    [currentFile.id, currentFile.people, handleLabelsChange],
  );

  const handleMarkDelete = useCallback(async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    const slowTimer = window.setTimeout(() => setActingSlow(true), 500);
    try {
      const next = files && onChangeFile ? nextFileAfterCurrent(files, file.id) : null;
      await api.createDecision({ file_id: file.id, action: "delete" });
      invalidateAfterReviewChange(qc);
      if (next && onChangeFile) {
        onChangeFile(next);
        onDateChange?.(next.id, { skipInvalidation: true });
      } else {
        onClose();
      }
    } finally {
      window.clearTimeout(slowTimer);
      actingRef.current = false;
      setActing(false);
      setActingSlow(false);
    }
  }, [files, onChangeFile, file.id, qc, onDateChange, onClose]);

  const handleRestore = useCallback(async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    const slowTimer = window.setTimeout(() => setActingSlow(true), 500);
    try {
      const next = files && onChangeFile ? nextFileAfterCurrent(files, file.id) : null;
      await api.cancelReviewDecisions([file.id]);
      invalidateAfterReviewChange(qc);
      if (next && onChangeFile) {
        onChangeFile(next);
        onDateChange?.(next.id, { skipInvalidation: true });
      } else {
        onClose();
      }
    } finally {
      window.clearTimeout(slowTimer);
      actingRef.current = false;
      setActing(false);
      setActingSlow(false);
    }
  }, [files, onChangeFile, file.id, qc, onDateChange, onClose]);

  const handleTrashRestore = useCallback(async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    const slowTimer = window.setTimeout(() => setActingSlow(true), 500);
    try {
      const next = files && onChangeFile ? nextFileAfterCurrent(files, file.id) : null;
      await api.restoreFromTrash([file.id]);
      invalidateAfterReviewChange(qc);
      if (next && onChangeFile) {
        onChangeFile(next);
        onDateChange?.(next.id, { skipInvalidation: true });
      } else {
        onClose();
      }
    } finally {
      window.clearTimeout(slowTimer);
      actingRef.current = false;
      setActing(false);
      setActingSlow(false);
    }
  }, [files, onChangeFile, file.id, qc, onDateChange, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (lightboxOpen) {
          if (lightboxTagsOpen) {
            setLightboxTagsOpen(false);
          } else {
            setLightboxOpen(false);
            setLightboxTagsOpen(false);
          }
        } else if (!isEditableTarget(e.target)) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (lightboxOpen && (e.key === "t" || e.key === "T") && !isEditableTarget(e.target)) {
        e.preventDefault();
        setLightboxTagsOpen((v) => !v);
        return;
      }

      if (e.key === "d" || e.key === "D") {
        if (deleteQueueMode || trashMode || isEditableTarget(e.target) || acting) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void handleMarkDelete();
        return;
      }

      if (!canNavigate || isEditableTarget(e.target)) return;

      const delta = photoNavDelta(e.key);
      if (delta == null) return;

      const next = adjacentFile(files!, file.id, delta);
      if (!next) return;

      e.preventDefault();
      onChangeFile!(next);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canNavigate, files, file.id, onChangeFile, lightboxOpen, lightboxTagsOpen, acting, deleteQueueMode, trashMode, handleMarkDelete, onClose]);

  const saveMeta = useMutation({
    mutationFn: () =>
      api.updateMetadata(file.id, {
        caption: caption || meta?.caption || undefined,
        rating: rating !== "" ? Number(rating) : meta?.rating ?? undefined,
      }),
    onSuccess: () => refetch(),
  });

  const rotateFile = useMutation({
    mutationFn: (direction: "left" | "right") => api.rotateFile(file.id, direction),
    onSuccess: (updated) => {
      setMediaEpoch(updated.mtime);
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["metadata", file.id] });
      void refetch();
      onChangeFile?.(updated);
      onDateChange?.(updated.id);
    },
  });

  const closeLightbox = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLightboxOpen(false);
    setLightboxTagsOpen(false);
  };

  const handleDateChange = () => {
    qc.invalidateQueries({ queryKey: ["files"] });
    qc.invalidateQueries({ queryKey: ["metadata", file.id] });
    refetch();
    onDateChange?.();
  };

  return (
    <>
      <div className="drawer-overlay" onClick={lightboxOpen ? undefined : onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="photo-detail-header">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <div className="photo-detail-header-right">
            {canNavigate && fileIndex >= 0 && (
              <span className="photo-detail-index">
                {fileIndex + 1} / {files!.length}
              </span>
            )}
            {!trashMode && !deleteQueueMode && (
              <button
                type="button"
                className="photo-detail-delete-btn"
                title="Mark delete (D)"
                aria-label="Mark delete"
                disabled={acting}
                onClick={() => void handleMarkDelete()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {file.media_type === "video" ? (
          lightboxOpen ? (
            <img
              src={api.thumbUrl(file.id, thumbMtime)}
              alt={file.filename}
              className="photo-detail-preview"
            />
          ) : (
            <video
              ref={drawerVideoRef}
              src={api.playUrl(file.id, thumbMtime)}
              controls
              poster={api.thumbUrl(file.id, thumbMtime)}
              className="photo-detail-preview"
              onClick={openLightbox}
            />
          )
        ) : (
          <img
            src={api.thumbUrl(file.id, thumbMtime)}
            alt={file.filename}
            className="photo-detail-preview"
            onClick={openLightbox}
          />
        )}
        <div className="photo-detail-title-row">
          <div className="photo-detail-title-actions">
            {!trashMode && !deleteQueueMode && file.media_type === "image" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Rotate 90° left"
                  disabled={rotateFile.isPending}
                  onClick={() => rotateFile.mutate("left")}
                >
                  Rotate left
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Rotate 90° right"
                  disabled={rotateFile.isPending}
                  onClick={() => rotateFile.mutate("right")}
                >
                  Rotate right
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Build a photomosaic from this photo"
                  onClick={() => navigate(mosaicSourcePath(file.id))}
                >
                  Create mosaic
                </button>
              </>
            )}
            {trashMode ? (
              <button
                className="btn btn-secondary"
                title="Restore to original location"
                disabled={acting}
                onClick={() => void handleTrashRestore()}
              >
                Restore
              </button>
            ) : deleteQueueMode ? (
              <button
                className="btn btn-secondary"
                title="Restore to inbox"
                disabled={acting}
                onClick={() => void handleRestore()}
              >
                Restore
              </button>
            ) : null}
            {actingSlow && (
              <span style={{ color: "#8891a0", fontSize: "0.875rem" }}>Saving…</span>
            )}
          </div>
          <h3>{file.filename}</h3>
        </div>
        {(currentFile.events?.length || currentFile.people?.length || currentFile.tags?.length) ? (
          <div className="photo-detail-applied-labels">
            <label className="photo-detail-applied-label">Applied</label>
            <PhotoCardLabels file={currentFile} onChange={() => handleLabelsChange(currentFile.id)} />
          </div>
        ) : null}
        <CaptureDateEditor files={[file]} onChange={handleDateChange} />
        {meta && (
          <>
            <div className="meta-row"><span>Date</span><span>{meta.capture_date ?? "—"}</span></div>
            <div className="meta-row"><span>Camera</span><span>{meta.camera ?? "—"}</span></div>
            <div className="meta-row"><span>Lens</span><span>{meta.lens ?? "—"}</span></div>
            <div className="meta-row"><span>Size</span><span>{meta.width}×{meta.height}</span></div>
            <div className="meta-row"><span>Location</span><span>{currentFile.location}</span></div>
            {currentFile.blur_score != null && (
              <div className="meta-row">
                <span>Sharpness</span>
                <span style={{ color: "#8891a0" }}>
                  {currentFile.blur_score.toFixed(1)} (lower = blurrier)
                  {currentFile.is_blurry ? " · blurry" : ""}
                </span>
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: "1rem" }}>
          <FileTagPicker
            fileId={currentFile.id}
            fileTags={currentFile.tags ?? []}
            onChange={() => handleLabelsChange(currentFile.id)}
            excludeSelected
            showTagSearch
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <PersonPicker
            fileId={currentFile.id}
            filePeople={currentFile.people ?? []}
            onChange={() => handleLabelsChange(currentFile.id)}
            excludeSelected
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <CollapsibleSection
            title="Events"
            count={(currentFile.events?.length ?? 0) || undefined}
            defaultOpen={false}
            persistKey="imageOrganizer.collapsible.photoDetail.events"
          >
            <EventPicker
              fileId={currentFile.id}
              fileEvents={currentFile.events ?? []}
              onChange={() => handleLabelsChange(currentFile.id)}
              hideLabel
              excludeSelected
            />
          </CollapsibleSection>
        </div>
        {!trashMode && !deleteQueueMode && (
        <div style={{ marginTop: "1rem" }}>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await api.createDecision({ file_id: file.id, action: "skip" });
              onClose();
            }}
          >
            Skip
          </button>
        </div>
        )}
        <div className="form-group" style={{ marginTop: "1rem" }}>
          <label>Caption</label>
          <textarea
            key={file.id}
            rows={2}
            defaultValue={meta?.caption ?? ""}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Rating (0-5)</label>
          <input
            key={file.id}
            type="number"
            min={0}
            max={5}
            defaultValue={meta?.rating ?? ""}
            onChange={(e) => setRating(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <button className="btn" onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
          Save metadata
        </button>
        </div>
      </div>
      {lightboxOpen && (
        <div
          className="photo-lightbox"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Full size preview"
        >
          {file.media_type === "video" ? (
            <video
              src={api.playUrl(file.id, thumbMtime)}
              controls
              autoPlay
              className="photo-lightbox-media"
              onClick={closeLightbox}
            />
          ) : (
            <img
              src={api.originalUrl(file.id, thumbMtime)}
              alt={file.filename}
              className="photo-lightbox-media"
              onClick={closeLightbox}
            />
          )}
          {lightboxTagsOpen && (
            <div className="photo-lightbox-tags" onClick={(e) => e.stopPropagation()}>
              <div className="photo-lightbox-tags-header">
                <span>Tags &amp; people</span>
                <span className="photo-lightbox-tags-hint">T to hide</span>
              </div>
              <div className="photo-lightbox-tags-body">
                <div className="photo-lightbox-tags-section">
                  <label className="photo-lightbox-tags-section-label">Tags</label>
                  {currentFile.tags && currentFile.tags.length > 0 && (
                    <div className="photo-lightbox-tags-applied">
                      {currentFile.tags.map((tag) => (
                        <span key={tag.id} className="badge badge-removable tag-badge">
                          {tag.name}
                          <button
                            type="button"
                            className="badge-remove"
                            aria-label={`Remove tag ${tag.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeLightboxTag(tag.id);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <FileTagPicker
                    fileId={currentFile.id}
                    fileTags={currentFile.tags ?? []}
                    onChange={() => handleLabelsChange(currentFile.id)}
                    excludeSelected
                    showTagSearch
                    hideLabel
                  />
                </div>
                <div className="photo-lightbox-tags-section">
                  <label className="photo-lightbox-tags-section-label">People</label>
                  {currentFile.people && currentFile.people.length > 0 && (
                    <div className="photo-lightbox-tags-applied">
                      {currentFile.people.map((person) => (
                        <span key={person.id} className="badge badge-removable person-badge">
                          {personLabel(person, allPeople)}
                          <button
                            type="button"
                            className="badge-remove"
                            aria-label={`Remove ${personLabel(person, allPeople)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeLightboxPerson(person.id);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <PersonPicker
                    fileId={currentFile.id}
                    filePeople={currentFile.people ?? []}
                    onChange={() => handleLabelsChange(currentFile.id)}
                    excludeSelected
                    hideLabel
                  />
                </div>
              </div>
            </div>
          )}
          {!lightboxTagsOpen && (
            <span className="photo-lightbox-tags-hint-corner">T — tags &amp; people</span>
          )}
        </div>
      )}
    </>
  );
}
