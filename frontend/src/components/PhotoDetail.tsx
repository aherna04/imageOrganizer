import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { MediaFile, api } from "../api/client";
import {
  adjacentFile,
  isEditableTarget,
  nextFileAfterCurrent,
  photoNavDelta,
} from "../utils/photoNavigation";
import CaptureDateEditor from "./CaptureDateEditor";
import EventPicker from "./EventPicker";
import PersonPicker from "./PersonPicker";
import FileTagPicker from "./FileTagPicker";

interface Props {
  file: MediaFile;
  onClose: () => void;
  files?: MediaFile[];
  onChangeFile?: (file: MediaFile) => void;
  onDateChange?: (keepFileId?: number) => void;
  deleteQueueMode?: boolean;
}

export default function PhotoDetail({
  file,
  onClose,
  files,
  onChangeFile,
  onDateChange,
  deleteQueueMode = false,
}: Props) {
  const qc = useQueryClient();
  const currentFile = files?.find((f) => f.id === file.id) ?? file;
  const { data: meta, refetch } = useQuery({
    queryKey: ["metadata", file.id],
    queryFn: () => api.getMetadata(file.id),
  });

  const [caption, setCaption] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setCaption("");
    setRating("");
  }, [file.id]);

  const canNavigate = files != null && files.length > 1 && onChangeFile != null;
  const fileIndex = canNavigate ? files.findIndex((f) => f.id === file.id) : -1;

  const handleLabelsChange = useCallback(
    (keepFileId?: number) => {
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["inbox-tags"] });
      qc.invalidateQueries({ queryKey: ["inbox-people"] });
      qc.invalidateQueries({ queryKey: ["files", "inbox", "delete_queue_count"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      onDateChange?.(keepFileId);
    },
    [qc, onDateChange],
  );

  const handleMarkDelete = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      const next = files && onChangeFile ? nextFileAfterCurrent(files, file.id) : null;
      await api.createDecision({ file_id: file.id, action: "delete" });
      if (next && onChangeFile) {
        onChangeFile(next);
        handleLabelsChange(next.id);
      } else {
        handleLabelsChange();
        onClose();
      }
    } finally {
      setActing(false);
    }
  }, [acting, files, onChangeFile, file.id, handleLabelsChange, onClose]);

  const handleRestore = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      const next = files && onChangeFile ? nextFileAfterCurrent(files, file.id) : null;
      await api.cancelReviewDecisions([file.id]);
      if (next && onChangeFile) {
        onChangeFile(next);
        handleLabelsChange(next.id);
      } else {
        handleLabelsChange();
        onClose();
      }
    } finally {
      setActing(false);
    }
  }, [acting, files, onChangeFile, file.id, handleLabelsChange, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (lightboxOpen) {
          setLightboxOpen(false);
        } else if (!isEditableTarget(e.target)) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "d" || e.key === "D") {
        if (deleteQueueMode || isEditableTarget(e.target) || acting) return;
        e.preventDefault();
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
  }, [canNavigate, files, file.id, onChangeFile, lightboxOpen, acting, deleteQueueMode, handleMarkDelete, onClose]);

  const saveMeta = useMutation({
    mutationFn: () =>
      api.updateMetadata(file.id, {
        caption: caption || meta?.caption || undefined,
        rating: rating !== "" ? Number(rating) : meta?.rating ?? undefined,
      }),
    onSuccess: () => refetch(),
  });

  const closeLightbox = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLightboxOpen(false);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {canNavigate && fileIndex >= 0 && (
            <span style={{ color: "#8891a0", fontSize: "0.875rem" }}>
              {fileIndex + 1} / {files!.length}
            </span>
          )}
        </div>
        {file.media_type === "video" ? (
          <video
            src={api.originalUrl(file.id)}
            controls
            poster={api.thumbUrl(file.id)}
            className="photo-detail-preview"
            onClick={() => setLightboxOpen(true)}
          />
        ) : (
          <img
            src={api.thumbUrl(file.id)}
            alt={file.filename}
            className="photo-detail-preview"
            onClick={() => setLightboxOpen(true)}
          />
        )}
        <div className="photo-detail-title-row">
          <h3>{file.filename}</h3>
          {deleteQueueMode ? (
            <button
              className="btn btn-secondary"
              title="Restore to inbox"
              disabled={acting}
              onClick={() => void handleRestore()}
            >
              Restore
            </button>
          ) : (
            <button
              className="btn btn-danger"
              title="Mark delete (D)"
              disabled={acting}
              onClick={() => void handleMarkDelete()}
            >
              Mark delete
            </button>
          )}
        </div>
        <CaptureDateEditor files={[file]} onChange={handleDateChange} />
        {meta && (
          <>
            <div className="meta-row"><span>Date</span><span>{meta.capture_date ?? "—"}</span></div>
            <div className="meta-row"><span>Camera</span><span>{meta.camera ?? "—"}</span></div>
            <div className="meta-row"><span>Lens</span><span>{meta.lens ?? "—"}</span></div>
            <div className="meta-row"><span>Size</span><span>{meta.width}×{meta.height}</span></div>
            <div className="meta-row"><span>Location</span><span>{currentFile.location}</span></div>
          </>
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
        <div style={{ marginTop: "1rem" }}>
          <EventPicker
            fileId={currentFile.id}
            fileEvents={currentFile.events ?? []}
            onChange={() => handleLabelsChange()}
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <PersonPicker
            fileId={currentFile.id}
            filePeople={currentFile.people ?? []}
            onChange={() => handleLabelsChange()}
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <FileTagPicker
            fileId={currentFile.id}
            fileTags={currentFile.tags ?? []}
            onChange={() => handleLabelsChange()}
          />
        </div>
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
              src={api.originalUrl(file.id)}
              controls
              autoPlay
              className="photo-lightbox-media"
              onClick={closeLightbox}
            />
          ) : (
            <img
              src={api.originalUrl(file.id)}
              alt={file.filename}
              className="photo-lightbox-media"
              onClick={closeLightbox}
            />
          )}
        </div>
      )}
    </>
  );
}
