import { useState, type ReactNode } from "react";
import { formatAge } from "@f1/shared";
import { Icon } from "./Icon";
import { cx } from "./ui";

/** One rule for every source indicator: green active, amber delayed or partial, red error, grey historical or unavailable. */
export type StatusTone = "active" | "delayed" | "error" | "historical";

const TONE: Record<StatusTone, { dot: string; chip: string }> = {
  active: { dot: "bg-ok", chip: "bg-ok/12 text-ok" },
  delayed: { dot: "bg-warn", chip: "bg-warn/12 text-warn" },
  error: { dot: "bg-danger", chip: "bg-danger/12 text-danger" },
  historical: { dot: "bg-faint", chip: "bg-fg/8 text-muted" },
};

/**
 * Compact data-source line: a status badge, when the data last changed, a
 * refresh control and an expandable section for the full explanation.
 */
export function DataStatus({ tone, label, source, updatedAt, now, onRefresh, refreshing, children }: { tone: StatusTone; label: string; source: string; updatedAt: number | null; now: number; onRefresh?: () => void; refreshing?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = TONE[tone];
  return (
    <section aria-label="Data source status" className="rounded-xl bg-fg/[0.03] ring-1 ring-line/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-xs">
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider", t.chip)}>
          <span className={cx("h-1.5 w-1.5 rounded-full", t.dot, tone === "active" && "animate-pulse2")} aria-hidden="true" />
          {label}
        </span>
        <span className="text-muted">{source}</span>
        <span className="num text-faint">{updatedAt ? `Updated ${formatAge(Math.max(0, now - updatedAt))}` : "No data received yet"}</span>
        <span className="ml-auto flex items-center gap-1">
          {onRefresh && (
            <button className="rounded-lg p-1.5 text-muted transition-colors hover:bg-fg/8 hover:text-fg" onClick={onRefresh} aria-label="Refresh data" title="Refresh data" disabled={refreshing}>
              <Icon name="refresh" size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
          {children && (
            <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted transition-colors hover:bg-fg/8 hover:text-fg" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              Data and session details
              <Icon name="chevronDown" size={14} className={cx("transition-transform", open && "rotate-180")} />
            </button>
          )}
        </span>
      </div>
      {open && children && <div className="border-t hairline px-3 py-2.5 text-xs leading-relaxed text-muted">{children}</div>}
    </section>
  );
}
