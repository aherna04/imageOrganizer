import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

export default function Settings() {
  const qc = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api.updateConfig({ ...config, ...form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["config"] }),
  });

  if (!config) return <div>Loading...</div>;

  const val = (key: keyof typeof config) => form[key] ?? config[key];

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

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
  );
}
