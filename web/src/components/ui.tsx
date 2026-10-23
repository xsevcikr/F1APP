import type { ReactNode } from "react";
import { QUALITY_HELP, type Compound, type DriverInfo, type Provenance, type Quality } from "@f1/shared";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Panel({ title, right, children, className, bodyClass, subtitle }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx("panel flex min-w-0 flex-col", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b hairline px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="truncate font-display text-[13px] font-bold uppercase tracking-[0.12em] text-fg">{title}</h2>}
            {subtitle && <div className="truncate text-[11px] text-muted">{subtitle}</div>}
          </div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cx("min-h-0 flex-1", bodyClass ?? "p-4")}>{children}</div>
    </section>
  );
}

const QUALITY_STYLE: Record<Quality, string> = {
  LIVE: "bg-ok/15 text-ok ring-ok/40",
  DELAYED: "bg-warn/15 text-warn ring-warn/40",
  HISTORICAL: "bg-info/15 text-info ring-info/40",
  SIMULATED: "bg-best/15 text-best ring-best/50",
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
    <div className={cx("flex flex-col items-start gap-1 rounded-lg border border-dashed hairline p-3 text-sm", className)}>
      <span className="chip bg-faint/15 text-muted ring-1 ring-faint/30">{title}</span>
      {reason && <p className="text-[13px] leading-snug text-muted">{reason}</p>}
    </div>
  );
}

export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 p-4 text-sm text-muted", className)} role="status">
      <span className="relative h-1 w-16 overflow-hidden rounded bg-raised">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-[loadbar_1.1s_ease-in-out_infinite] rounded bg-accent" />
      </span>
      {label}…
      <style>{"@keyframes loadbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}"}</style>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm" role="alert">
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
