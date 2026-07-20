import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { formatFileSize } from "../utils/formatFileSize";

function formatCount(count: number, label: string): string {
  return `${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`;
}

function formatBackupTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function Settings() {
  const qc = useQueryClient();
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [moveRoot, setMoveRoot] = useState("");
  const [moveMessage, setMoveMessage] = useState<string | null>(null);

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  const { data: storage } = useQuery({
    queryKey: ["storage-stats"],
    queryFn: api.getStorageStats,
  });

  const { data: backupsData } = useQuery({
    queryKey: ["database-backups"],
    queryFn: api.listDatabaseBackups,
  });

  const { data: moveStatus } = useQuery({
    queryKey: ["library-move-status"],
    queryFn: api.moveLibraryStatus,
    refetchInterval: (q) => (q.state.data?.running ? 1500 : false),
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

  const backup = useMutation({
    mutationFn: api.createDatabaseBackup,
    onSuccess: (result) => {
      setBackupMessage(`Created ${result.filename} (${formatFileSize(result.size_bytes)})`);
      qc.invalidateQueries({ queryKey: ["database-backups"] });
      qc.invalidateQueries({ queryKey: ["storage-stats"] });
    },
    onError: (err: Error) => {
      setBackupMessage(err.message || "Backup failed");
    },
  });

  const moveLibrary = useMutation({
    mutationFn: () => api.moveLibrary(moveRoot.trim()),
    onSuccess: () => {
      setMoveMessage(null);
      qc.invalidateQueries({ queryKey: ["library-move-status"] });
    },
    onError: (err: Error) => {
      setMoveMessage(err.message || "Library move failed");
    },
  });

  if (!config) return <div>Loading...</div>;

  const val = (key: keyof typeof config) =>
    (form[key as string] as string | undefined) ?? String(config[key] ?? "");
  const backups = (backupsData?.items ?? []).slice(0, 10);
  const moveBusy = moveLibrary.isPending || !!moveStatus?.running;

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

        <div className="database-backup-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={backup.isPending}
            onClick={() => {
              setBackupMessage(null);
              backup.mutate();
            }}
          >
            {backup.isPending ? "Backing up..." : "Backup database"}
          </button>
          {backupMessage && <p className="database-backup-message">{backupMessage}</p>}
        </div>

        {backups.length > 0 && (
          <div className="database-backup-list">
            <h4 className="database-backup-list-title">Recent backups</h4>
            <ul>
              {backups.map((item) => (
                <li key={item.path} className="database-backup-item">
                  <span className="database-backup-filename">{item.filename}</span>
                  <span className="database-backup-meta">
                    {formatFileSize(item.size_bytes)} · {formatBackupTime(item.created_at)}
                  </span>
                  <span className="database-backup-path path">{item.path}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Quality</h3>
        <p className="settings-section-desc">
          Blur detection uses Laplacian variance on downscaled images. Higher threshold flags more photos;
          lower threshold flags only the very blurriest.
        </p>
        <div className="settings-grid">
          <div className="form-group">
            <label>Blur detection threshold</label>
            <input
              type="number"
              min={1}
              step={1}
              value={val("blur_threshold")}
              onChange={(e) => setForm({ ...form, blur_threshold: e.target.value })}
            />
            <small style={{ color: "#8891a0" }}>
              Default 150. Scores below this are blurry. Obvious outliers are also flagged automatically.
            </small>
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
        <p className="settings-section-desc">
          Library root: <code className="path">{config.media_root ?? "—"}</code>
          <br />
          Catalog (DB + thumbs): <code className="path">{config.app_data_dir ?? "—"}</code>
        </p>
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

      <section className="settings-section">
        <h3 className="settings-section-title">Move library</h3>
        <p className="settings-section-desc">
          Copy the library (inbox, photos, trash, and catalog) to a new folder or drive, rewrite paths, then
          restart the app. Prefer stopping other scans first. Large libraries take time.
        </p>
        <div className="settings-grid">
          <div className="form-group">
            <label>New media root</label>
            <input
              value={moveRoot}
              onChange={(e) => setMoveRoot(e.target.value)}
              placeholder="/Volumes/BigDisk/Media"
              disabled={moveBusy}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={moveBusy || !moveRoot.trim()}
            onClick={() => {
              setMoveMessage(null);
              moveLibrary.mutate();
            }}
          >
            {moveBusy ? "Moving…" : "Move library"}
          </button>
          {(moveStatus?.message || moveMessage) && (
            <p className="database-backup-message" style={{ color: moveStatus?.error ? "#f87171" : undefined }}>
              {moveStatus?.error || moveStatus?.message || moveMessage}
            </p>
          )}
          {moveStatus?.restart_required && (
            <p className="settings-section-desc">Restart the backend (or Docker Compose) to use the new location.</p>
          )}
        </div>
      </section>
    </div>
  );
}

