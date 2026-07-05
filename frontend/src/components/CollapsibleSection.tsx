import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: ReactNode;
  bodyScroll?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  actions,
  bodyScroll = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="collapsible-section">
      <div className="collapsible-section-header">
        <button
          type="button"
          className="collapsible-section-toggle"
          onClick={() => setOpen((v) => !v)}
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
