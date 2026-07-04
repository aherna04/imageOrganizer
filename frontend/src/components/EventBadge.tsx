import { Event } from "../api/client";

interface Props {
  event: Pick<Event, "name" | "color">;
}

export default function EventBadge({ event }: Props) {
  return (
    <span className="badge event-badge" style={{ background: event.color, color: "#fff" }}>
      {event.name}
    </span>
  );
}
