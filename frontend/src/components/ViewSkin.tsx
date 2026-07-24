import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useBackgroundTagPhotos } from "../hooks/useBackgroundTagPhotos";

/** Faded hero skin behind chrome-only views; CSS :has() hides it when thumbs appear. */
export default function ViewSkin() {
  const { pathname } = useLocation();
  const { order, itemKey, skinStyle, skinIntervalSec, ready } = useBackgroundTagPhotos();
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
    if (reduceMotion || order.length < 2 || skinIntervalSec <= 0) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % order.length);
    }, skinIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [order, reduceMotion, skinIntervalSec]);

  if (pathname === "/" || !ready || skinStyle === "off" || order.length === 0) {
    return null;
  }

  const currentId = order[index];
  const prevId = order.length > 1 ? order[(index - 1 + order.length) % order.length] : undefined;
  const visibleIds = [prevId, currentId].filter((id): id is number => id != null);

  return (
    <div className="view-skin" aria-hidden="true">
      {visibleIds.map((id) => (
        <img
          key={id}
          className={`view-skin-image${id === currentId ? " is-active" : ""}`}
          src={api.originalUrl(id)}
          alt=""
        />
      ))}
      <div className="view-skin-overlay" />
    </div>
  );
}
