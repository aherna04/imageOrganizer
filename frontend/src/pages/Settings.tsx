import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { formatFileSize } from "../utils/formatFileSize";

function formatCount(count: number, label: string): string {
  return `${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`;
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  const { data: storage } = useQuery({
    queryKey: ["storage-stats"],
    queryFn: api.getStorageStats,
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api.updateConfig({ ...config, ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["calendar-day"] });
    },
  });

  if (!config) return <div>Loading...</div>;

  const val = (key: keyof typeof config) => form[key] ?? config[key];

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Storage</h3>
        <p className="settings-section-desc">
          Indexed archive catalog sizes from the database. Scan the archive to refresh totals.
        </p>
        <div className="storage-stats-grid">
          <div className="storage-stat-card">
            <span className="storage-stat-label">Catalog</span>
            <span className="storage-stat-value">
              {storage ? formatFileSize(storage.catalog_bytes) : "—"}
            </span>
            <span className="storage-stat-meta">
              {storage ? formatCount(storage.catalog_count, "file") : ""}
            </span>
          </div>
          <div className="storage-stat-card">
            <span className="storage-stat-label">Images</span>
            <span className="storage-stat-value">
              {storage ? formatFileSize(storage.images_bytes) : "—"}
            </span>
            <span className="storage-stat-meta">
              {storage ? formatCount(storage.image_count, "image") : ""}
            </span>
          </div>
          <div className="storage-stat-card">
            <span className="storage-stat-label">Videos</span>
            <span className="storage-stat-value">
              {storage ? formatFileSize(storage.videos_bytes) : "—"}
            </span>
            <span className="storage-stat-meta">
              {storage ? formatCount(storage.video_count, "video") : ""}
            </span>
          </div>
          <div className="storage-stat-card">
            <span className="storage-stat-label">Database</span>
            <span className="storage-stat-value">
              {storage ? formatFileSize(storage.database_bytes) : "—"}
            </span>
            <span className="storage-stat-meta">index + WAL</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Display</h3>
        <div className="settings-grid">
          <div className="form-group">
            <label>Photo sort order</label>
            <select
              value={val("photo_sort_order")}
              onChange={(e) => setForm({ ...form, photo_sort_order: e.target.value })}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Paths & patterns</h3>
      <div className="settings-grid">
        <div className="form-group">
          <label>Inbox path</label>
          <input
            value={val("inbox_path")}
            onChange={(e) => setForm({ ...form, inbox_path: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Archive path</label>
          <input
            value={val("archive_path")}
            onChange={(e) => setForm({ ...form, archive_path: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Trash path</label>
          <input
            value={val("trash_path")}
            onChange={(e) => setForm({ ...form, trash_path: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Date folder pattern</label>
          <input
            value={val("date_pattern")}
            onChange={(e) => setForm({ ...form, date_pattern: e.target.value })}
          />
          <small style={{ color: "#8891a0" }}>Tokens: {"{YYYY}"} {"{MM}"} {"{DD}"}</small>
        </div>
        <div className="form-group">
          <label>Rename pattern</label>
          <input
            value={val("rename_pattern")}
            onChange={(e) => setForm({ ...form, rename_pattern: e.target.value })}
          />
          <small style={{ color: "#8891a0" }}>
            Tokens: {"{YYYY}"} {"{MM}"} {"{DD}"} {"{original}"} {"{camera}"} {"{seq:4}"}
          </small>
        </div>
        <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
          Save settings
        </button>
      </div>
      </section>
    </div>
  );
}
