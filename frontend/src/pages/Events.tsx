import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MediaFile, api } from "../api/client";
import PhotoGrid from "../components/PhotoGrid";
import PhotoDetail from "../components/PhotoDetail";
import TagPicker from "../components/TagPicker";

export default function EventsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<MediaFile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");
  const [editTagIds, setEditTagIds] = useState<number[]>([]);

  const { data: events = [], refetch } = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
  });

  const activeEvent = slug ? events.find((e) => e.slug === slug) : null;

  const { data: eventFiles } = useQuery({
    queryKey: ["event-files", activeEvent?.id],
    queryFn: () => api.eventFiles(activeEvent!.id),
    enabled: !!activeEvent,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        name,
        color,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    onSuccess: (ev) => {
      setShowForm(false);
      setName("");
      refetch();
      if (startDate && endDate) {
        api.assignEventRange(ev.id, startDate, endDate).then(() => qc.invalidateQueries({ queryKey: ["event-files"] }));
      }
      navigate(`/events/${ev.slug}`);
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.updateEvent(activeEvent!.id, { name: editName, color: editColor, tag_ids: editTagIds }),
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["event-files"] });
      setEditing(false);
      if (ev.slug !== slug) {
        navigate(`/events/${ev.slug}`, { replace: true });
      }
    },
  });

  const startEditing = () => {
    if (!activeEvent) return;
    setEditName(activeEvent.name);
    setEditColor(activeEvent.color);
    setEditTagIds(activeEvent.tags?.map((t) => t.id) ?? []);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  if (activeEvent) {
    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn-secondary" onClick={() => navigate("/events")} style={{ marginRight: "0.75rem" }}>
              ← Back
            </button>
            {editing ? (
              <div className="event-edit-form">
                <div className="form-group">
                  <label>Name</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                </div>
                <TagPicker selectedTagIds={editTagIds} onChange={setEditTagIds} />
                <div className="event-edit-actions">
                  <button className="btn" onClick={() => update.mutate()} disabled={!editName || update.isPending}>
                    Save
                  </button>
                  <button className="btn btn-secondary" onClick={cancelEditing} disabled={update.isPending}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ display: "inline" }}>{activeEvent.name}</h2>
                <button className="btn btn-secondary" onClick={startEditing} style={{ marginLeft: "0.75rem" }}>
                  Edit
                </button>
              </>
            )}
          </div>
          <span className="badge" style={{ background: editing ? editColor : activeEvent.color, color: "#fff" }}>
            {eventFiles?.total ?? 0} photos
          </span>
        </div>
        {activeEvent.date_span_start && (
          <p style={{ color: "#8891a0" }}>
            {activeEvent.date_span_start} — {activeEvent.date_span_end}
          </p>
        )}
        {!editing && activeEvent.tags && activeEvent.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "1rem" }}>
            {activeEvent.tags.map((tag) => (
              <span key={tag.id} className="badge tag-badge active">
                {tag.name}
              </span>
            ))}
          </div>
        )}
        <PhotoGrid
          files={eventFiles?.items ?? []}
          onSelect={setSelected}
          editableLabels
          onLabelsChange={() => qc.invalidateQueries({ queryKey: ["event-files", activeEvent.id] })}
        />
        {selected && <PhotoDetail file={selected} onClose={() => setSelected(null)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Events</h2>
        <button className="btn" onClick={() => setShowForm(true)}>
          New event
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#161922", padding: "1rem", borderRadius: "12px", marginBottom: "1rem", maxWidth: 400 }}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip to Spain" />
          </div>
          <div className="form-group">
            <label>Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Start date (optional, for bulk assign)</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End date (optional)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn" onClick={() => create.mutate()} disabled={!name || create.isPending}>
            Create
          </button>
        </div>
      )}

      <div className="event-cards">
        {events.map((ev) => (
          <Link key={ev.id} to={`/events/${ev.slug}`} className="event-card">
            <div className="color-bar" style={{ background: ev.color }} />
            <h3 style={{ margin: "0 0 0.5rem" }}>{ev.name}</h3>
            <div style={{ color: "#8891a0", fontSize: "0.875rem" }}>
              {ev.photo_count} photos
              {ev.date_span_start && ` · ${ev.date_span_start} — ${ev.date_span_end}`}
            </div>
            {ev.cover_file_id && (
              <img
                src={api.thumbUrl(ev.cover_file_id)}
                alt=""
                style={{ width: "100%", marginTop: "0.75rem", borderRadius: "8px", aspectRatio: "16/9", objectFit: "cover" }}
              />
            )}
          </Link>
        ))}
      </div>
      {events.length === 0 && <div className="empty-state">No events yet. Create one to group trips and occasions.</div>}
    </div>
  );
}
