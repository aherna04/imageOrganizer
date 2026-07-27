import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [rewriteOnly, setRewriteOnly] = useState(false);
  const [forceRewritePaths, setForceRewritePaths] = useState(false);
  const [libraryJob, setLibraryJob] = useState<"move" | "sync" | null>(null);

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  useEffect(() => {
    if (!config?.paths_from_env || !config.backup_media_root) return;
    setMoveRoot(config.backup_media_root);
  }, [config?.paths_from_env, config?.backup_media_root]);

  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
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
      qc.invalidateQueries({ queryKey: ["background-tag-photos"] });
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
    mutationFn: () => {
      const dockerCutover =
        !!config?.paths_from_env &&
        !!config.backup_media_root &&
        moveRoot.trim() === config.backup_media_root;
      const rewritePaths = dockerCutover ? forceRewritePaths : true;
      return api.moveLibrary(moveRoot.trim(), rewriteOnly, rewritePaths);
    },
    onSuccess: () => {
      setMoveMessage(null);
      qc.invalidateQueries({ queryKey: ["library-move-status"] });
    },
    onError: (err: Error) => {
      setMoveMessage(err.message || "Library copy failed");
    },
  });

  const updateBackup = useMutation({
    mutationFn: () => api.updateBackup(),
    onSuccess: () => {
      setMoveMessage(null);
      qc.invalidateQueries({ queryKey: ["library-move-status"] });
    },
    onError: (err: Error) => {
      setMoveMessage(err.message || "Backup update failed");
    },
  });

  if (!config) return <div>Loading...</div>;

  const val = (key: keyof typeof config) =>
    (form[key as string] as string | undefined) ?? String(config[key] ?? "");
  const backups = (backupsData?.items ?? []).slice(0, 10);
  const moveBusy =
    moveLibrary.isPending || updateBackup.isPending || !!moveStatus?.running;
  const movePct =
    moveStatus?.total_bytes && moveStatus.total_bytes > 0 && moveStatus.copied_bytes != null
      ? Math.min(100, Math.round((100 * moveStatus.copied_bytes) / moveStatus.total_bytes))
      : null;
  const dockerBackupCutover =
    !!config.paths_from_env &&
    !!config.backup_media_root &&
    moveRoot.trim() === config.backup_media_root;
  const backupMountMissing =
    !!config.paths_from_env && !config.backup_media_ready;
  const catalogEstimate =
    (storage?.catalog_bytes ?? 0) + (storage?.database_bytes ?? 0);
  const backupFree = config.backup_disk?.free_bytes;
  const backupSpaceLow =
    !!config.paths_from_env &&
    !!config.backup_media_ready &&
    !rewriteOnly &&
    backupFree != null &&
    catalogEstimate > 0 &&
    backupFree < catalogEstimate;
  const canStartMove =
    !!moveRoot.trim() && !moveBusy && !backupMountMissing && !backupSpaceLow;
  const canUpdateBackup = !!config.backup_media_ready && !moveBusy;
  const showSyncStatus = libraryJob === "sync";
  const showMoveStatus = libraryJob === "move";
  const jobStatusBlock = (kind: "move" | "sync") => {
    const active = kind === "sync" ? showSyncStatus : showMoveStatus;
    if (!active) return null;
    return (
      <>
        {moveBusy && movePct != null && (
          <p className="settings-job-status">
            Progress: {movePct}%
            {moveStatus?.copied_files != null && moveStatus.total_files != null
              ? ` · ${moveStatus.copied_files.toLocaleString()} / ${moveStatus.total_files.toLocaleString()} files`
              : ""}
          </p>
        )}
        {(moveStatus?.message || moveMessage) && (
          <p
            className="settings-job-status"
            style={{ color: moveStatus?.error ? "#f87171" : undefined }}
          >
            {moveStatus?.error || moveStatus?.message || moveMessage}
          </p>
        )}
        {kind === "move" && moveStatus?.restart_required && (
          <p className="settings-section-desc">
            {dockerBackupCutover && !forceRewritePaths
              ? "Update .env: set MEDIA_HOST_PATH to the new host path; keep BACKUP_MEDIA_HOST_PATH on the old disk for Update backup, then recreate Docker."
              : "Restart the backend (or Docker Compose) to use the new location. Original library remains as backup."}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="settings-page">
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
          <div className="form-group">
            <label>Home / skin background tag</label>
            <select
              value={val("home_background_tag")}
              onChange={(e) => setForm({ ...form, home_background_tag: e.target.value })}
            >
              {!tags?.some((t) => t.slug === val("home_background_tag")) && (
                <option value={val("home_background_tag")}>{val("home_background_tag")}</option>
              )}
              {(tags ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name} ({t.photo_count})
                  </option>
                ))}
            </select>
            <small style={{ color: "#8891a0" }}>
              Used for the Home hero and experimental view skins. Default: landscapes.
            </small>
          </div>
          <div className="form-group">
            <label>View skin style</label>
            <select
              value={val("view_skin_style")}
              onChange={(e) => setForm({ ...form, view_skin_style: e.target.value })}
            >
              <option value="off">Off</option>
              <option value="soft">Soft fade</option>
              <option value="glass">Glass panels</option>
              <option value="vignette">Vignette</option>
            </select>
            <small style={{ color: "#8891a0" }}>
              Faded hero behind chrome-only views; hides automatically when photo thumbnails appear.
            </small>
          </div>
          <div className="form-group">
            <label>Background motion</label>
            <select
              value={val("view_skin_motion")}
              onChange={(e) => setForm({ ...form, view_skin_motion: e.target.value })}
              disabled={val("view_skin_style") === "off"}
            >
              <option value="scroll">Scroll with page</option>
              <option value="fixed">Stay fixed</option>
            </select>
            <small style={{ color: "#8891a0" }}>
              Scroll fades the hero into the solid background; Stay fixed pins it in the main pane.
            </small>
          </div>
          <div className="form-group">
            <label>Background image interval</label>
            <select
              value={val("view_skin_interval_sec")}
              onChange={(e) => setForm({ ...form, view_skin_interval_sec: e.target.value })}
              disabled={val("view_skin_style") === "off"}
            >
              <option value="15">15 seconds</option>
              <option value="28">28 seconds (default)</option>
              <option value="45">45 seconds</option>
              <option value="60">60 seconds</option>
              <option value="0">Don't rotate</option>
            </select>
            <small style={{ color: "#8891a0" }}>
              How often the view-skin background image changes. Does not affect the Home page.
            </small>
          </div>
        </div>
      </section>

      <section className="settings-section settings-disk-mgmt">
        <h3 className="settings-section-title">Disk and library management</h3>
        <div
          className={
            config.paths_from_env
              ? "settings-disk-row settings-disk-row--three"
              : "settings-disk-row settings-disk-row--two"
          }
        >
          <div className="settings-disk-col">
            <h4 className="settings-subsection-title">Paths & patterns</h4>
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
          </div>

          {config.paths_from_env ? (
            <>
              <div className="settings-disk-col">
                <h4 className="settings-subsection-title">Library disks</h4>
                <p className="settings-section-desc">
                  Live library and optional second disk for backups. Prefer stopping scans before
                  large copies.
                </p>
                {(config.media_disk || config.backup_disk || config.container_root_disk) && (
                  <div className="settings-disk-free">
                    <p className="settings-section-desc" style={{ marginBottom: "0.35rem" }}>
                      Disk free (from inside Docker)
                    </p>
                    <ul className="settings-disk-free-list">
                      {config.media_disk && (
                        <li>
                          <span className="settings-disk-free-label">media</span>
                          <code className="path">
                            {config.media_host_path || config.media_root || "/media"}
                          </code>
                          <span>{formatFileSize(config.media_disk.free_bytes)} free</span>
                        </li>
                      )}
                      {config.backup_disk && (
                        <li>
                          <span className="settings-disk-free-label">backup</span>
                          <code className="path">
                            {config.backup_media_host_path ||
                              config.backup_media_root ||
                              "/media-backup"}
                          </code>
                          <span>{formatFileSize(config.backup_disk.free_bytes)} free</span>
                        </li>
                      )}
                      {config.container_root_disk && (
                        <li>
                          <span className="settings-disk-free-label">Docker root</span>
                          <span>{formatFileSize(config.container_root_disk.free_bytes)} free</span>
                        </li>
                      )}
                    </ul>
                    {config.disk_free_unreliable && (
                      <p className="settings-section-desc" style={{ marginTop: "0.5rem" }}>
                        Free space inside Docker often reflects the Mac Data volume for every bind
                        mount. Check Finder for external drives (e.g. your 2TB).
                      </p>
                    )}
                  </div>
                )}
                {config.container_disk_low && (
                  <p className="database-backup-message" style={{ color: "#f87171" }}>
                    Docker disk space is low. Free space in Docker Desktop → Settings → Resources, or
                    recreate the backend if a prior copy filled the container overlay.
                  </p>
                )}
                {backupMountMissing && (
                  <p className="database-backup-message" style={{ color: "#f87171" }}>
                    Backup mount is not ready. Set BACKUP_MEDIA_HOST_PATH and recreate the backend
                    container.
                  </p>
                )}
                <h4 className="settings-subsection-title">Update backup</h4>
                <p className="settings-section-desc">
                  Copies only new or changed files (and catalog) from the live library to the backup
                  mount. Does not delete extras on the backup disk. No restart.
                </p>
                <p className="settings-section-desc">
                  <strong>From:</strong>{" "}
                  <code className="path">
                    {config.media_host_path || config.media_root || "/media"}
                  </code>
                  {" → "}
                  <strong>To:</strong>{" "}
                  <code className="path">
                    {config.backup_media_host_path || "(set BACKUP_MEDIA_HOST_PATH)"}
                  </code>
                </p>
                <div className="settings-grid">
                  <button
                    type="button"
                    className="btn"
                    disabled={!canUpdateBackup}
                    onClick={() => {
                      setLibraryJob("sync");
                      setMoveMessage(null);
                      updateBackup.mutate();
                    }}
                  >
                    {libraryJob === "sync" && moveBusy ? "Updating…" : "Update backup"}
                  </button>
                  {jobStatusBlock("sync")}
                </div>
              </div>

              <div className="settings-disk-col">
                <details
                  className="settings-advanced-panel"
                  open={backupMountMissing || undefined}
                >
                  <summary>One-time full copy / cutover (advanced)</summary>
                  <p className="settings-section-desc">
                    Full copy of media and catalog to the backup mount, then cut over by swapping{" "}
                    <code className="path">MEDIA_HOST_PATH</code>. Prefer Update backup for routine
                    refreshes.
                  </p>
                  <p className="settings-section-desc" style={{ color: "#fbbf24" }}>
                    Docker steps: (1) set <code className="path">BACKUP_MEDIA_HOST_PATH</code> to the
                    new host folder and recreate backend; (2) Copy and switch here; (3) set{" "}
                    <code className="path">MEDIA_HOST_PATH</code> to that host path; keep{" "}
                    <code className="path">BACKUP_MEDIA_HOST_PATH</code> on the old disk for Update
                    backup, recreate. Catalog paths stay <code className="path">/media/...</code>.
                  </p>
                  {backupSpaceLow && (
                    <p className="database-backup-message" style={{ color: "#f87171" }}>
                      Backup mount may not have enough free space for the catalog (
                      {formatFileSize(catalogEstimate)} indexed;{" "}
                      {formatFileSize(backupFree ?? 0)} free).
                    </p>
                  )}
                  <div className="settings-grid">
                    <div className="form-group">
                      <label>Destination</label>
                      <p className="settings-section-desc" style={{ margin: 0 }}>
                        <strong>Copy to:</strong>{" "}
                        <code className="path">
                          {config.backup_media_host_path || "(set BACKUP_MEDIA_HOST_PATH in .env)"}
                        </code>
                        {config.backup_media_ready ? " — ready" : " — not ready"}
                      </p>
                      <p className="settings-section-desc" style={{ margin: "0.35rem 0 0" }}>
                        <strong>From:</strong> current library{" "}
                        <code className="path">{config.media_root || "/media"}</code>
                        {" · "}
                        <strong>Inside Docker:</strong>{" "}
                        <code className="path">{config.backup_media_root || "/media-backup"}</code>
                      </p>
                    </div>
                    <label className="settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={rewriteOnly}
                        disabled={moveBusy}
                        onChange={(e) => setRewriteOnly(e.target.checked)}
                      />
                      <span>Paths already copied — only rewrite catalog and switch</span>
                    </label>
                    {dockerBackupCutover && (
                      <label className="settings-checkbox-row">
                        <input
                          type="checkbox"
                          checked={forceRewritePaths}
                          disabled={moveBusy}
                          onChange={(e) => setForceRewritePaths(e.target.checked)}
                        />
                        <span>
                          Rewrite DB paths to /media-backup (advanced — leave unchecked for normal
                          Docker cutover)
                        </span>
                      </label>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canStartMove}
                      onClick={() => {
                        setLibraryJob("move");
                        setMoveMessage(null);
                        moveLibrary.mutate();
                      }}
                    >
                      {libraryJob === "move" && moveBusy
                        ? rewriteOnly
                          ? "Switching…"
                          : "Copying…"
                        : rewriteOnly
                          ? "Switch only"
                          : "Copy and switch"}
                    </button>
                    {jobStatusBlock("move")}
                  </div>
                </details>
              </div>
            </>
          ) : (
            <div className="settings-disk-col">
              <h4 className="settings-subsection-title">Migrate to a new drive</h4>
              <p className="settings-section-desc">
                Full copy of media (inbox, photos, trash) and catalog to a new folder or drive. The
                original root is left untouched as a backup. Prefer stopping scans first — large
                libraries take time.
              </p>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Destination folder</label>
                  <input
                    value={moveRoot}
                    onChange={(e) => setMoveRoot(e.target.value)}
                    placeholder="/Volumes/BigDisk/Media"
                    disabled={moveBusy}
                  />
                </div>
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={rewriteOnly}
                    disabled={moveBusy}
                    onChange={(e) => setRewriteOnly(e.target.checked)}
                  />
                  <span>Paths already copied — only rewrite catalog and switch</span>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canStartMove}
                  onClick={() => {
                    setLibraryJob("move");
                    setMoveMessage(null);
                    moveLibrary.mutate();
                  }}
                >
                  {libraryJob === "move" && moveBusy
                    ? rewriteOnly
                      ? "Switching…"
                      : "Copying…"
                    : rewriteOnly
                      ? "Switch only"
                      : "Copy and switch"}
                </button>
                {jobStatusBlock("move")}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

