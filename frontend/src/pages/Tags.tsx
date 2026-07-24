import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import LabelSearchInput from "../components/LabelSearchInput";
import { filterByNameQuery } from "../utils/filterLabelsByQuery";

export default function TagsPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");

  const { data: tags = [], refetch } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const create = useMutation({
    mutationFn: () => api.createTag(name.trim()),
    onSuccess: () => {
      setShowForm(false);
      setName("");
      refetch();
    },
  });

  const filteredTags = useMemo(() => filterByNameQuery(tags, search), [tags, search]);

  return (
    <div>
      <div className="page-header">
        <h2>Tags</h2>
        <button className="btn" onClick={() => setShowForm(true)}>
          New tag
        </button>
      </div>

      <p className="page-intro">
        Browse tags on photos. Open a tag to edit, merge, or delete from the label view.
      </p>

      {showForm && (
        <div className="people-form-card">
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cars" />
          </div>
          <div className="people-form-actions">
            <button className="btn" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Create
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setName(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginBottom: "1rem", maxWidth: "24rem" }}>
          <LabelSearchInput value={search} onChange={setSearch} placeholder="Search tags…" />
        </div>
      )}

      {tags.length === 0 ? (
        <div className="empty-state">No tags yet. Create one or tag photos from Inbox or Calendar.</div>
      ) : filteredTags.length === 0 ? (
        <p className="label-search-empty">No tags match — try another term</p>
      ) : (
        <div className="label-cards">
          {filteredTags.map((tag) => (
            <Link key={tag.id} to={`/browse/tag/${tag.slug}`} className="label-card">
              <h3 className="label-card-title">{tag.name}</h3>
              <div className="label-card-meta">{tag.photo_count} photos</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
