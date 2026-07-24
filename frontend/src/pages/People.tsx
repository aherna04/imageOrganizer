import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { personLabel } from "../utils/personLabel";

export default function PeoplePage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const { data: people = [], refetch } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const create = useMutation({
    mutationFn: () => api.createPerson(name.trim()),
    onSuccess: () => {
      setShowForm(false);
      setName("");
      refetch();
    },
  });

  return (
    <div>
      <div className="page-header">
        <h2>People</h2>
        <button className="btn" onClick={() => setShowForm(true)}>
          New person
        </button>
      </div>

      <p className="page-intro">
        Browse people tagged on photos. Open a person to edit, merge, or delete from the label view.
      </p>

      {showForm && (
        <div className="people-form-card">
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Elliott" />
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

      {people.length === 0 ? (
        <div className="empty-state">No people yet. Create one or tag people on photos from Inbox or Calendar.</div>
      ) : (
        <div className="label-cards">
          {people.map((person) => (
            <Link key={person.id} to={`/browse/person/${person.slug}`} className="label-card">
              <h3 className="label-card-title">{personLabel(person, people)}</h3>
              <div className="label-card-meta">{person.photo_count} photos</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
