import { requestArchiveRefresh } from "../api";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { QUALITY_HELP, type Compound, type DriverInfo, type Provenance, type Quality } from "@f1/shared";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Panel({ title, right, children, className, bodyClass, subtitle }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  const [open, setOpen] = useState(false);
  // Long explanations sit behind an info button so panels stay clean.
  const long = typeof subtitle === "string" && subtitle.length > 44;
  return (
    <section className={cx("panel flex min-w-0 flex-col", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 pb-0.5 pt-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate font-display text-[13px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>}
            {subtitle && !long && <div className="truncate text-[11px] text-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {long && (
              <button className="rounded-full p-1 text-muted hover:text-fg" aria-label="About this panel" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <Icon name="info" size={15} />
              </button>
            )}
          </div>
        </header>
      )}
      {long && open && <p className="px-4 pt-1 text-[11px] leading-relaxed text-muted">{subtitle}</p>}
      <div className={cx("min-h-0 flex-1", bodyClass ?? "p-4")}>{children}</div>
    </section>
  );
}

const QUALITY_STYLE: Record<Quality, string> = {
  LIVE: "bg-ok/15 text-ok ring-ok/40",
  DELAYED: "bg-warn/15 text-warn ring-warn/40",
  HISTORICAL: "bg-info/15 text-info ring-info/40",
  UNAVAILABLE: "bg-faint/15 text-muted ring-faint/40",
};

export function QualityBadge({ quality, className }: { quality: Quality; className?: string }) {
  return (
    <span title={QUALITY_HELP[quality]} className={cx("chip ring-1", QUALITY_STYLE[quality], className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full bg-current", quality === "LIVE" && "animate-pulse2")} />
      {quality}
    </span>
  );
}

const PROV_STYLE: Record<Provenance, string> = {
  measured: "text-ok",
  derived: "text-info",
  estimated: "text-warn",
  unavailable: "text-faint",
};

export function ProvenanceTag({ kind, title }: { kind: Provenance; title?: string }) {
  return (
    <span title={title} className={cx("chip bg-raised", PROV_STYLE[kind])}>
      {kind}
    </span>
  );
}

export function Unavailable({ title = "Unavailable", reason, className }: { title?: string; reason?: string | null; className?: string }) {
  return (
    <div className={cx("flex flex-col items-start gap-1 rounded-lg border border-dashed hairline bg-panel/90 p-3 text-sm", className)}>
      <span className="chip bg-faint/15 text-muted ring-1 ring-faint/30">{title}</span>
      {reason && <p className="text-[13px] leading-snug text-muted">{reason}</p>}
    </div>
  );
}

/** Re-keys its text when the value changes so it slides in, instead of snapping. */
export function Roll({ children }: { children: ReactNode }) {
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;
  if (text === null) return <>{children}</>;
  return <span key={text} className="roll-in inline-block">{text}</span>;
}

export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2.5 p-4", className)} role="status" aria-label={label}>
      <div className="skeleton h-3 w-1/3" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-2.5 w-2/3" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-danger/40 bg-panel/90 p-4 text-sm" role="alert">
      <div className="font-semibold text-danger">{title}</div>
      {message && <p className="text-muted">{message}</p>}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-sm text-muted">{children}</div>;
}

const TYRE: Record<Compound, { c: string; l: string }> = {
  SOFT: { c: "#ff2d2d", l: "S" },
  MEDIUM: { c: "#ffd400", l: "M" },
  // White in F1; uses the foreground colour so it stays visible on a light theme.
  HARD: { c: "rgb(var(--fg) / 0.85)", l: "H" },
  INTERMEDIATE: { c: "#2fbf3a", l: "I" },
  WET: { c: "#2f7cff", l: "W" },
  UNKNOWN: { c: "#6b7280", l: "?" },
};

export function TyreBadge({ compound, age, size = 22 }: { compound: Compound | null; age?: number | null; size?: number }) {
  if (!compound) return <span className="text-faint">—</span>;
  const t = TYRE[compound];
  return (
    <span className="inline-flex items-center gap-1.5" title={`${compound}${age != null ? `, ${age} laps old` : ""}`}>
      <span
        className="inline-flex items-center justify-center rounded-full font-display font-black"
        style={{ width: size, height: size, border: `2.5px solid ${t.c}`, color: t.c, fontSize: size * 0.5, background: "rgb(var(--surface))" }}
      >
        {t.l}
      </span>
      {age != null && <span className="num text-[11px] text-muted">{age}</span>}
    </span>
  );
}

export function teamColour(d: Pick<DriverInfo, "teamColour"> | undefined | null) {
  return d?.teamColour ?? "#7a808a";
}

export function DriverTag({ driver, showTeam }: { driver: DriverInfo; showTeam?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: teamColour(driver) }} />
      <span className="font-display text-[15px] font-bold tracking-wide">{driver.code}</span>
      {showTeam && <span className="truncate text-xs text-muted">{driver.team}</span>}
    </span>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = "sm" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "xs" }) {
  return (
    <div className="inline-flex rounded-lg bg-raised p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
            o.value === value ? "bg-panel text-fg shadow-sm ring-1 ring-line/10" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="label">{label}</div>
      <div className="num mt-0.5 truncate text-lg font-semibold text-fg">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** Asks the server to reload archive data older than a minute, then reloads the given views. */
export function RefreshButton({ reloads, loading }: { reloads: (() => void)[]; loading?: boolean }) {
  return (
    <button
      className="btn px-2.5 py-1 text-xs"
      disabled={loading}
      title="Reload from the results archive. Data newer than a minute is kept, to respect the archive's rate limit."
      onClick={() => {
        requestArchiveRefresh();
        for (const r of reloads) r();
      }}
    >
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  );
}

/** Section that can fold away; for secondary information so the main race view stays in front. */
export function Collapsible({ title, right, defaultOpen = false, children }: { title: ReactNode; right?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel overflow-hidden">
      <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="font-display text-sm font-bold uppercase tracking-wider">{title}</span>
        <span className="flex items-center gap-2 text-muted">
          {right}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cx("transition-transform", open && "rotate-180")} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {open && <div className="border-t hairline px-4 py-3">{children}</div>}
    </section>
  );
}
