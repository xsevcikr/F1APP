import { useMemo, useState } from "react";
import { classifyRaceControl, localTimeAt, type ClassifiedMessage, type RaceControlRecord, type RcKind } from "@f1/shared";
import { useSession } from "../store/session";
import { cx } from "./ui";

export type RcFilter = "all" | "flags" | "neutral" | "stewards" | "limits" | "other";

const FILTERS: Record<RcFilter, RcKind[] | null> = {
  all: null,
  flags: ["green", "yellow", "double-yellow", "blue", "red", "chequered", "track-clear"],
  neutral: ["safety-car", "safety-car-ending", "vsc", "vsc-ending", "red", "restart"],
  stewards: ["penalty", "investigation", "incident", "unsafe-release"],
  limits: ["track-limits"],
  other: ["debris", "car-stopped", "pit-lane", "track-condition", "drs", "session", "other"],
};

const SEV_BAR: Record<ClassifiedMessage["severity"], string> = {
  danger: "bg-danger",
  caution: "bg-warn",
  notice: "bg-info",
  info: "bg-faint",
};

function KindIcon({ kind }: { kind: RcKind }) {
  const flag = (fill: string, extra?: string) => (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M4 18V2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 3h11l-2.5 4L16 11H5z" fill={fill} stroke={extra ?? "none"} />
    </svg>
  );
  switch (kind) {
    case "green":
    case "track-clear":
      return flag("rgb(var(--ok))");
    case "yellow":
      return flag("rgb(var(--warn))");
    case "double-yellow":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 18V2M10 18V2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 3h5v6H4zM11 3h5v6h-5z" fill="rgb(var(--warn))" />
        </svg>
      );
    case "red":
      return flag("rgb(var(--danger))");
    case "blue":
      return flag("rgb(var(--info))");
    case "chequered":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M4 18V2" stroke="currentColor" strokeWidth="1.6" />
          <rect x="5" y="3" width="11" height="8" fill="#fff" />
          <path d="M5 3h2.75v2H5zM10.5 3h2.75v2H10.5zM7.75 5h2.75v2H7.75zM13.25 5H16v2h-2.75zM5 7h2.75v2H5zM10.5 7h2.75v2H10.5zM7.75 9h2.75v2H7.75zM13.25 9H16v2h-2.75z" fill="#000" />
        </svg>
      );
    case "safety-car":
    case "safety-car-ending":
      return <span className="chip bg-warn px-1 text-black">SC</span>;
    case "vsc":
    case "vsc-ending":
      return <span className="chip bg-warn px-1 text-black">VSC</span>;
    case "penalty":
      return <span className="chip bg-warn/20 px-1 text-warn">PEN</span>;
    case "investigation":
    case "incident":
    case "unsafe-release":
      return <span className="chip bg-info/20 px-1 text-info">FIA</span>;
    case "track-limits":
      return <span className="chip bg-raised px-1 text-muted">TL</span>;
    case "drs":
      return <span className="chip bg-ok/15 px-1 text-ok">DRS</span>;
    default:
      return <span className="chip bg-raised px-1 text-muted">RC</span>;
  }
}

export function RaceControlFeed({ t, compact = false, limit }: { t: number; compact?: boolean; limit?: number }) {
  const timeline = useSession((s) => s.timeline);
  const version = useSession((s) => s.version);
  const [filter, setFilter] = useState<RcFilter>("all");
  const [query, setQuery] = useState("");

  const all = useMemo(() => (timeline ? timeline.raceControl.map((r) => ({ r, c: classifyRaceControl(r) })) : []), [timeline, version]);
  const visible = useMemo(() => {
    const kinds = FILTERS[filter];
    const q = query.trim().toUpperCase();
    // Newest first, only messages issued by the time being shown.
    const list = all.filter(({ r, c }) => r.ts <= t && (!kinds || kinds.includes(c.kind)) && (!q || r.message.includes(q)));
    list.reverse();
    return limit ? list.slice(0, limit) : list;
  }, [all, filter, query, t, limit]);

  if (!timeline) return null;
  const offset = timeline.core.session.gmtOffset;
  const drivers = timeline.drivers;

  return (
    <div className="flex min-h-0 flex-col">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-2">
          <div className="inline-flex flex-wrap rounded-lg bg-raised p-0.5 text-xs">
            {(Object.keys(FILTERS) as RcFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cx("rounded-md px-2.5 py-1 capitalize", filter === f ? "bg-panel text-fg ring-1 ring-line/10" : "text-muted hover:text-fg")}>
                {f === "neutral" ? "SC / VSC / Red" : f}
              </button>
            ))}
          </div>
          <input className="input ml-auto w-40 py-1 text-xs" placeholder="Search messages" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search race control messages" />
        </div>
      )}
      <ol className="divide-hairline min-h-0 flex-1 overflow-y-auto" aria-live={compact ? "polite" : "off"}>
        {visible.map(({ r, c }) => (
          <RcItem key={r.id} r={r} c={c} offset={offset} compact={compact} driverCode={r.driver ? drivers.get(r.driver)?.code : undefined} />
        ))}
        {visible.length === 0 && (
          <li className="p-6 text-center text-sm text-muted">
            {timeline.core.channels.raceControl.available ? "No race-control messages yet for this moment." : timeline.core.channels.raceControl.reason ?? "Race-control messages are unavailable."}
          </li>
        )}
      </ol>
    </div>
  );
}

function RcItem({ r, c, offset, compact, driverCode }: { r: RaceControlRecord; c: ClassifiedMessage; offset: string; compact: boolean; driverCode?: string }) {
  return (
    <li className="relative flex gap-3 px-3 py-2.5 pl-4">
      <span className={cx("absolute bottom-2 left-0 top-2 w-[3px] rounded-r", SEV_BAR[c.severity])} />
      <div className="mt-0.5 shrink-0 text-muted">
        <KindIcon kind={c.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[13px] font-bold uppercase tracking-wide">{c.title}</span>
          {r.lap && <span className="text-[10px] text-muted">LAP {r.lap}</span>}
          {driverCode && <span className="chip bg-raised text-fg">{driverCode}</span>}
          <span className="num ml-auto text-[10px] text-faint" title={new Date(r.ts).toISOString()}>
            {localTimeAt(r.ts, offset)}:{String(new Date(r.ts).getUTCSeconds()).padStart(2, "0")}
          </span>
        </div>
        <p className={cx("mt-0.5 text-[12px] leading-snug text-fg/90", compact && "line-clamp-2")}>{r.message}</p>
        {!compact && <p className="mt-0.5 text-[11px] text-muted">{c.explanation}</p>}
      </div>
    </li>
  );
}
