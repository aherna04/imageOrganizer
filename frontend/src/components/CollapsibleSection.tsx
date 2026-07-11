import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  persistKey?: string;
  actions?: ReactNode;
  bodyScroll?: boolean;
  children: ReactNode;
}

function readPersistedOpen(persistKey: string): boolean | null {
  try {
    const value = localStorage.getItem(persistKey);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    // ignore quota / private mode
  }
  return null;
}

function writePersistedOpen(persistKey: string, open: boolean): void {
  try {
    localStorage.setItem(persistKey, String(open));
  } catch {
    // ignore quota / private mode
  }
}

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  persistKey,
  actions,
  bodyScroll = false,
  children,
}: Props) {
  const [open, setOpen] = useState(() => {
    if (persistKey) {
      const stored = readPersistedOpen(persistKey);
      if (stored !== null) return stored;
    }
    return defaultOpen;
  });

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (persistKey) writePersistedOpen(persistKey, next);
      return next;
    });
  };

  return (
    <section className="collapsible-section">
      <div className="collapsible-section-header">
        <button
          type="button"
          className="collapsible-section-toggle"
          onClick={toggleOpen}
          aria-expanded={open}
        >
          <span className="collapsible-section-chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="collapsible-section-title">
            {title}
            {count != null && ` (${count})`}
          </span>
        </button>
        {actions && (
          <div className="collapsible-section-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && (
        <div
          className={`collapsible-section-body${bodyScroll ? " collapsible-section-body-scroll" : ""}`}
        >
          {children}
        </div>
      )}
    </section>
  );
}
