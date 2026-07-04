import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MediaFile, api } from "../api/client";
import EventPicker from "./EventPicker";
import PersonPicker from "./PersonPicker";
import FileTagPicker from "./FileTagPicker";

interface Props {
  file: MediaFile;
  onClose: () => void;
}

export default function PhotoDetail({ file, onClose }: Props) {
  const qc = useQueryClient();
  const { data: meta, refetch } = useQuery({
    queryKey: ["metadata", file.id],
    queryFn: () => api.getMetadata(file.id),
  });

  const [caption, setCaption] = useState("");
  const [rating, setRating] = useState<number | "">("");

  const saveMeta = useMutation({
    mutationFn: () =>
      api.updateMetadata(file.id, {
        caption: caption || meta?.caption || undefined,
        rating: rating !== "" ? Number(rating) : meta?.rating ?? undefined,
      }),
    onSuccess: () => refetch(),
  });

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-secondary" onClick={onClose} style={{ marginBottom: "1rem" }}>
          Close
        </button>
        {file.media_type === "video" ? (
          <video
            src={api.originalUrl(file.id)}
            controls
            poster={api.thumbUrl(file.id)}
            style={{ width: "100%", borderRadius: "8px", marginBottom: "0.75rem" }}
          />
        ) : (
          <img src={api.thumbUrl(file.id)} alt={file.filename} />
        )}
        <h3>{file.filename}</h3>
        {meta && (
          <>
            <div className="meta-row"><span>Date</span><span>{meta.capture_date ?? "—"}</span></div>
            <div className="meta-row"><span>Camera</span><span>{meta.camera ?? "—"}</span></div>
            <div className="meta-row"><span>Lens</span><span>{meta.lens ?? "—"}</span></div>
            <div className="meta-row"><span>Size</span><span>{meta.width}×{meta.height}</span></div>
            <div className="meta-row"><span>Location</span><span>{file.location}</span></div>
          </>
        )}
        <div className="form-group" style={{ marginTop: "1rem" }}>
          <label>Caption</label>
          <textarea
            rows={2}
            defaultValue={meta?.caption ?? ""}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Rating (0-5)</label>
          <input
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
            fileId={file.id}
            fileEvents={file.events ?? []}
            onChange={() => qc.invalidateQueries({ queryKey: ["files"] })}
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <PersonPicker
            fileId={file.id}
            filePeople={file.people ?? []}
            onChange={() => {
              qc.invalidateQueries({ queryKey: ["files"] });
              qc.invalidateQueries({ queryKey: ["people"] });
            }}
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <FileTagPicker
            fileId={file.id}
            fileTags={file.tags ?? []}
            onChange={() => {
              qc.invalidateQueries({ queryKey: ["files"] });
              qc.invalidateQueries({ queryKey: ["tags"] });
            }}
          />
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await api.createDecision({ file_id: file.id, action: "delete" });
              onClose();
            }}
          >
            Mark delete
          </button>
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
  );
}
