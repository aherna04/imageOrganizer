import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";

const NAV_LINKS = [
  { to: "/calendar", label: "Calendar" },
  { to: "/inbox", label: "Inbox" },
  { to: "/tags", label: "Tags" },
  { to: "/people", label: "People" },
  { to: "/events", label: "Events" },
] as const;

const ROTATE_MS = 10000;

function shuffleIds(items: MediaFile[]): number[] {
  const ids = items.map((f) => f.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export default function Home() {
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const landscapesId = tags?.find((t) => t.slug === "landscapes")?.id;

  const { data: photoPage } = useQuery({
    queryKey: ["home-landscapes", landscapesId],
    queryFn: () => api.listFiles({ tag_id: landscapesId!, page_size: 24 }),
    enabled: landscapesId != null,
  });

  const items = photoPage?.items ?? [];
  const itemKey = items.map((f) => f.id).join(",");

  const order = useMemo(() => {
    if (items.length === 0) return [] as number[];
    return shuffleIds(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshuffle only when the id set changes
  }, [itemKey]);

  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [itemKey]);

  useEffect(() => {
    if (reduceMotion || order.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % order.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [order, reduceMotion]);

  const currentId = order[index];
  const prevId = order.length > 1 ? order[(index - 1 + order.length) % order.length] : undefined;
  const visibleIds = [prevId, currentId].filter((id): id is number => id != null);

  return (
    <div className="home">
      <div className="home-bg" aria-hidden="true">
        {visibleIds.map((id) => {
          const isActive = id === currentId;
          return (
            <img
              key={id}
              className={[
                "home-bg-image",
                isActive ? "is-active" : "",
                !reduceMotion && isActive ? "home-bg-image--kenburns" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              src={api.originalUrl(id)}
              alt=""
            />
          );
        })}
        {order.length === 0 && <div className="home-bg-fallback" />}
        <div className="home-overlay" />
      </div>

      <div className="home-content">
        <header className="home-hero">
          <p className="home-eyebrow">Your photo library</p>
          <h1 className="home-brand">Image Organizer</h1>
          <p className="home-tagline">Browse by day, tag, and people — start wherever you left off.</p>
        </header>

        <nav className="home-nav" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="home-nav-btn">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
