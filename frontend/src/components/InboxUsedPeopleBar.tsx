import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface Props {
  activePersonId: number | null;
  onSelectPerson: (personId: number | null) => void;
}

export default function InboxUsedPeopleBar({ activePersonId, onSelectPerson }: Props) {
  const { data } = useQuery({
    queryKey: ["inbox-people"],
    queryFn: api.inboxPeople,
  });

  const people = data?.people ?? [];
  if (people.length === 0) return null;

  return (
    <div className="inbox-quick-filter-row">
      <label className="inbox-quick-filter-label">People</label>
      <div className="inbox-quick-filter-chips">
        {people.map((person) => {
          const isActive = activePersonId === person.id;
          return (
            <button
              key={person.id}
              type="button"
              className={`badge person-badge${isActive ? " active" : ""}`}
              onClick={() => onSelectPerson(isActive ? null : person.id)}
            >
              {person.name} ({person.photo_count})
            </button>
          );
        })}
      </div>
    </div>
  );
}
