import { useMemo } from "react";
import { formatClock, formatCountdown, inLiveWindow, localTimeAt, tempTo, type SessionInfo } from "@f1/shared";
import { useDisplayTime, useSnapshot } from "../hooks/live";
import { flagEmoji } from "../lib/flags";
import { useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";
import { cx } from "./ui";

export type SessionState = "LIVE" | "IN PROGRESS" | "UPCOMING" | "FINISHED" | "HISTORICAL";

/**
 * LIVE only when the schedule says the session is running AND the server is
 * receiving it. A running session without a feed is IN PROGRESS, never LIVE.
 */
export function sessionState(s: SessionInfo, now: number, feedConnected: boolean): SessionState {
  if (now < s.start) return "UPCOMING";
  if (now <= s.end) return feedConnected ? "LIVE" : "IN PROGRESS";
  return now - s.end < 3 * 3_600_000 || inLiveWindow(s, now) ? "FINISHED" : "HISTORICAL";
}

const STATE_STYLE: Record<SessionState, string> = {
  LIVE: "bg-ok/15 text-ok",
  "IN PROGRESS": "bg-warn/15 text-warn",
  UPCOMING: "bg-info/12 text-info",
  FINISHED: "bg-fg/10 text-fg",
  HISTORICAL: "bg-fg/8 text-muted",
};
const STATE_DOT: Record<SessionState, string> = { LIVE: "bg-ok", "IN PROGRESS": "bg-warn", UPCOMING: "bg-info", FINISHED: "bg-fg/60", HISTORICAL: "bg-faint" };

export function StateBadge({ state }: { state: SessionState }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider", STATE_STYLE[state])}>
      <span className={cx("h-1.5 w-1.5 rounded-full", STATE_DOT[state], state === "LIVE" && "animate-pulse2")} aria-hidden="true" />
      {state}
    </span>
  );
}

export function shortName(name: string): string {
  const p = /^Practice (\d)/i.exec(name);
  if (p) return `FP${p[1]}`;
  if (/sprint (qualifying|shootout)/i.test(name)) return "Sprint Q";
  return name;
}

function Metric({ icon, label, value, unit, tone }: { icon: string; label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="flex min-w-[5.5rem] flex-1 items-center gap-2 rounded-xl bg-fg/[0.04] px-3 py-2">
      <Icon name={icon} size={16} className={tone ?? "text-muted"} />
      <div className="min-w-0 leading-tight">
        <div className="num text-base font-semibold">
          {value}
          {unit && <span className="ml-0.5 text-[11px] font-normal text-muted">{unit}</span>}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      </div>
    </div>
  );
}

/** Subtle outline behind the header: the real traced circuit when it is loaded, else plain technical lines. */
function Backdrop({ session }: { session: SessionInfo }) {
  const circuit = useSession((s) => s.circuit);
  const real = circuit && circuit.fromSession.circuitKey === session.circuitKey ? circuit.circuit : null;
  const d = useMemo(() => {
    if (!real) return null;
    const { minX, minY, maxX, maxY } = real.bounds;
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const k = Math.min(300 / w, 150 / h);
    return real.path.map((p, i) => `${i ? "L" : "M"}${(10 + (p[0] - minX) * k).toFixed(1)} ${(10 + (maxY - p[1]) * k).toFixed(1)}`).join("") + "Z";
  }, [real]);
  return (
    <svg aria-hidden="true" viewBox="0 0 320 170" className="pointer-events-none absolute -right-4 top-0 h-full w-auto max-w-[70%] text-fg opacity-[0.1]" preserveAspectRatio="xMaxYMid meet">
      {d ? <path d={d} fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" /> : <path d="M20 120 C60 40 120 150 170 80 S270 20 300 90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 5" />}
    </svg>
  );
}

/**
 * Compact race-centre header: where, which session, what state, the clock, and
 * weather and lap data only when the loaded session actually has them.
 */
export function RaceHeader({ session, weekend, now, feedConnected, onPick, onLoad }: { session: SessionInfo; weekend: SessionInfo[]; now: number; feedConnected: boolean; onPick: (key: number) => void; onLoad: (key: number) => void }) {
  const units = useSettings((s) => s.units);
  const loadedKey = useSession((s) => s.timeline?.core.session.sessionKey ?? null);
  const timeline = useSession((s) => s.timeline);
  const snap = useSnapshot(2);
  const t = useDisplayTime(2);
  const loaded = loadedKey === session.sessionKey;
  const state = sessionState(session, now, feedConnected);
  const flag = flagEmoji(session.countryCode);
  const firstLap = useMemo(() => (loaded ? timeline?.lapStartTime(1) ?? null : null), [loaded, timeline]);
  const w = loaded ? snap?.weather ?? null : null;
  const lap = loaded && snap?.leaderLap != null ? `${snap.leaderLap}${snap.totalLaps ? ` / ${snap.totalLaps}` : ""}` : null;
  const clock = loaded ? formatClock(Math.max(0, t - (firstLap && t >= firstLap ? firstLap : session.start))) : null;

  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-panel via-surface to-[#241017] p-4 ring-1 ring-line/10 sm:p-5">
      <Backdrop session={session} />
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent via-accent/60 to-transparent" aria-hidden="true" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="text-base leading-none" aria-label={session.countryName}>{flag ?? ""}</span>
            <span>{session.countryName}</span>
            <span className="text-faint">·</span>
            <span>{session.year}</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-none tracking-wide sm:text-4xl">{session.location} Grand Prix</h1>
          <p className="mt-1 text-sm text-muted">{session.circuitShortName} · {session.name}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StateBadge state={state} />
          <div className="num text-xs text-muted sm:text-right">
            <span className="text-faint">Circuit time </span>
            <span className="text-sm text-fg">{localTimeAt(now, session.gmtOffset)}</span>
            <span className="text-faint"> UTC{session.gmtOffset.slice(0, 6)}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Sessions this weekend">
        {weekend.map((s) => {
          const st = sessionState(s, now, feedConnected && s.sessionKey === session.sessionKey);
          const on = s.sessionKey === session.sessionKey;
          return (
            <button key={s.sessionKey} role="tab" aria-selected={on} onClick={() => onPick(s.sessionKey)} className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", on ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:bg-fg/10 hover:text-fg")} title={`${s.name}: ${st}`}>
              <span className={cx("h-1.5 w-1.5 rounded-full", STATE_DOT[st])} aria-hidden="true" />
              {shortName(s.name)}
            </button>
          );
        })}
      </div>

      <div className="relative mt-3 flex flex-wrap gap-2">
        {state === "UPCOMING" && <Metric icon="clock" label="Starts in" value={formatCountdown(session.start - now)} tone="text-info" />}
        {clock && <Metric icon="clock" label="Session clock" value={clock} />}
        {lap && <Metric icon="lap" label="Lap" value={lap} />}
        {w && w.airTemp !== null && <Metric icon="thermo" label="Air" value={tempTo(w.airTemp, units).toFixed(1)} unit={units === "metric" ? "°C" : "°F"} />}
        {w && w.trackTemp !== null && <Metric icon="thermo" label="Track" value={tempTo(w.trackTemp, units).toFixed(1)} unit={units === "metric" ? "°C" : "°F"} tone="text-warn" />}
        {w && w.rainfall !== null && <Metric icon="drop" label="Conditions" value={w.rainfall ? "Wet" : "Dry"} tone={w.rainfall ? "text-info" : "text-muted"} />}
        {w && w.windSpeed !== null && <Metric icon="wind" label="Wind" value={w.windSpeed.toFixed(1)} unit="m/s" />}
        {!loaded && state !== "UPCOMING" && (
          <button className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.97]" onClick={() => onLoad(session.sessionKey)}>
            <Icon name="play" size={13} filled /> Load this session
          </button>
        )}
        {!loaded && state !== "UPCOMING" && <span className="self-center text-[11px] text-faint">Weather, laps and clock appear once a session is loaded.</span>}
      </div>
    </header>
  );
}
