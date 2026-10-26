import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatAge, formatGap, formatLapTime, kmhTo, stewardMatters, type DriverInfo, type LeaderboardRow, type SessionTimeline } from "@f1/shared";
import { DataStatus, type StatusTone } from "../components/DataStatus";
import { Icon } from "../components/Icon";
import { CarTelemetry, LapRibbon, SectorBar, Sparkline, TraceChart } from "../components/Telemetry";
import { FlagPill } from "../components/SessionHeader";
import { StateBadge, sessionState } from "../components/RaceHeader";
import { DrsChip } from "../components/Leaderboard";
import { SessionGate } from "../components/SessionGate";
import { cx, QualityBadge, TyreBadge, Roll } from "../components/ui";
import { useRaceCentre } from "../data/raceCentre";
import { useNow, useSnapshot } from "../hooks/live";
import { currentQuality, useSession } from "../store/session";
import { useSettings } from "../store/settings";

type SectorTone = "purple" | "green" | "yellow" | null;
const TONE: Record<Exclude<SectorTone, null>, string> = { purple: "text-best", green: "text-ok", yellow: "text-warn" };

/**
 * Sector colours from completed laps up to `t`: purple is the best in the
 * session, green a personal best, yellow anything slower. Derived from timing.
 */
function sectorTones(timeline: SessionTimeline, drivers: DriverInfo[], t: number) {
  const overall: [number, number, number] = [Infinity, Infinity, Infinity];
  const personal = new Map<number, [number, number, number]>();
  const last = new Map<number, { s: [number | null, number | null, number | null]; tone: SectorTone[] }>();
  for (const d of drivers) {
    const laps = timeline.completedLaps(d.number, t);
    const pb: [number, number, number] = [Infinity, Infinity, Infinity];
    for (const l of laps) [l.s1, l.s2, l.s3].forEach((v, i) => { if (v !== null && v > 0) { pb[i] = Math.min(pb[i], v); overall[i] = Math.min(overall[i], v); } });
    personal.set(d.number, pb);
    const lap = laps[laps.length - 1];
    if (lap) last.set(d.number, { s: [lap.s1, lap.s2, lap.s3], tone: [] });
  }
  for (const [n, e] of last) {
    const pb = personal.get(n)!;
    e.tone = e.s.map((v, i) => (v === null ? null : v <= overall[i] + 1e-9 ? "purple" : v <= pb[i] + 1e-9 ? "green" : "yellow"));
  }
  return last;
}

type Mode = "order" | "gaps" | "sectors" | "tyres" | "speed";
const MODES: { value: Mode; label: string }[] = [
  { value: "order", label: "Race order" },
  { value: "gaps", label: "Gaps" },
  { value: "sectors", label: "Sectors" },
  { value: "tyres", label: "Tyres" },
  { value: "speed", label: "Speed" },
];

const ROW = 52;
const FRESH_MS = 5000;

const Cell = ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={cx("num w-[4.4rem] shrink-0 text-right text-xs", className)}><Roll>{children}</Roll></span>;

function PosBadge({ r, out }: { r: LeaderboardRow; out: boolean }) {
  const p = out && r.position === null ? "—" : r.position ?? "—";
  return (
    <span className={cx("num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold", r.position === 1 ? "bg-fg text-bg" : r.position === 2 || r.position === 3 ? "bg-fg/15" : "text-muted")}>{p}</span>
  );
}

function Trend({ r }: { r: LeaderboardRow }) {
  if (!r.gained) return <span className="w-6 shrink-0 text-center text-[10px] text-faint">{r.gained === 0 ? "–" : ""}</span>;
  return <span className={cx("num w-6 shrink-0 text-center text-[10px] font-semibold", r.gained > 0 ? "text-ok" : "text-danger")} title={`${r.gained > 0 ? "Gained" : "Lost"} ${Math.abs(r.gained)} since the start`}>{r.gained > 0 ? "▲" : "▼"}{Math.abs(r.gained)}</span>;
}

/** What the right-hand columns show for the chosen view. The third column appears from the sm breakpoint up. */
function Columns({ mode, r, sec, speed, unit }: { mode: Mode; r: LeaderboardRow; sec: ReturnType<typeof sectorTones> extends Map<number, infer V> ? V | undefined : never; speed: number | null; unit: string }) {
  const leader = r.position === 1 ? <span className="text-faint">LEADER</span> : formatGap(r.gapToLeader.value);
  const ahead = r.position === 1 ? "" : formatGap(r.interval.value);
  const tight = r.interval.value?.kind === "time" && r.interval.value.seconds < 1;
  if (mode === "gaps")
    return (<><Cell>{leader}</Cell><Cell className={tight ? "text-ok" : ""}>{ahead}</Cell><Cell className="hidden text-muted sm:block">{formatLapTime(r.lastLap?.duration)}</Cell></>);
  if (mode === "sectors")
    return (<>{[0, 1, 2].map((k) => <Cell key={k} className={cx("w-[3.9rem]", sec?.tone[k] ? TONE[sec.tone[k]!] : "text-faint")}>{sec?.s[k] != null ? sec.s[k]!.toFixed(3) : "—"}</Cell>)}</>);
  if (mode === "tyres")
    return (<><span className="flex w-[4.4rem] shrink-0 justify-end"><TyreBadge compound={r.compound} age={r.tyreAge} size={20} /></span><Cell className="text-muted">{r.inPitLane ? <span className="text-info">IN PIT</span> : `${r.pitStops} stop${r.pitStops === 1 ? "" : "s"}`}</Cell></>);
  if (mode === "speed")
    return (<><Cell>{speed ? `${speed} ${unit}` : <span className="text-faint" title="Car telemetry is not available for this moment">—</span>}</Cell><span className="flex w-[4.4rem] shrink-0 justify-end"><DrsChip row={r} /></span></>);
  return (<><Cell>{leader}</Cell><Cell className={cx("hidden sm:block", tight && "text-ok")}>{ahead}</Cell><span className="flex w-7 shrink-0 justify-end"><TyreBadge compound={r.compound} size={18} /></span></>);
}

function Detail({ r, timeline, t, sec, matters, units }: { r: LeaderboardRow; timeline: SessionTimeline; t: number; sec: ReturnType<typeof sectorTones> extends Map<number, infer V> ? V | undefined : never; matters: string[]; units: "metric" | "imperial" }) {
  const fresh = !!r.car && t - r.car.ts < FRESH_MS;
  const trend = useMemo(() => {
    const vals: number[] = [];
    for (const i of timeline.intervalsOf(r.driver.number)) {
      if (i.ts > t) break;
      if (i.interval?.kind === "time") vals.push(i.interval.seconds);
    }
    return vals.slice(-24);
  }, [timeline, r.driver.number, t]);
  const ribbon = useMemo(() => {
    const overall: [number, number, number] = [Infinity, Infinity, Infinity];
    for (const d of timeline.drivers.values())
      for (const l of timeline.completedLaps(d.number, t)) [l.s1, l.s2, l.s3].forEach((v, i) => { if (v !== null && v > 0) overall[i] = Math.min(overall[i], v); });
    const mine = timeline.completedLaps(r.driver.number, t);
    const pb: [number, number, number] = [Infinity, Infinity, Infinity];
    const out = mine.map((l) => {
      const secs = [l.s1, l.s2, l.s3];
      secs.forEach((v, i) => { if (v !== null && v > 0) pb[i] = Math.min(pb[i], v); });
      const tones = secs.map((v, i) => (v === null ? null : v <= overall[i] + 1e-9 ? "purple" : v <= pb[i] + 1e-9 ? "green" : "yellow")) as SectorTone[];
      return { lap: l.lap, tones };
    });
    return out.slice(-10);
  }, [timeline, r.driver.number, t]);
  return (
    <div className="grid gap-4 border-t border-line/5 bg-fg/[0.02] px-3 py-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]">
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs sm:col-span-2 lg:col-span-1 lg:grid-cols-2">
        {([["Last lap", formatLapTime(r.lastLap?.duration)], ["Best lap", formatLapTime(r.bestLap?.duration)], ["Laps", r.lap ?? "—"], ["Pit stops", r.pitStops], ["Tyre", <TyreBadge key="t" compound={r.compound} age={r.tyreAge} size={18} />], ["Team", r.driver.team]] as [string, React.ReactNode][]).map(([k, v]) => (
          <div key={k} className="min-w-0"><dt className="text-[10px] uppercase tracking-wider text-faint">{k}</dt><dd className="num mt-0.5 truncate text-sm">{v}</dd></div>
        ))}
        <div className="col-span-3 flex flex-wrap gap-1 lg:col-span-2">
          {r.status === "retired" && <span className="chip bg-danger/20 text-danger" title={r.statusBasis ?? undefined}>RETIRED</span>}
          {r.status === "dsq" && <span className="chip bg-danger/20 text-danger">DSQ</span>}
          {r.status === "dns" && <span className="chip bg-faint/20 text-muted">DNS</span>}
          {r.status === "finished" && <span className="chip bg-fg/10 text-fg">FINISHED</span>}
          {r.penalties.length > 0 && <span className="chip bg-warn/20 text-warn" title={r.penalties.map((p) => p.message).join("\n")}>PEN{r.penalties.reduce((n, p) => n + (p.seconds ?? 0), 0) > 0 ? ` +${r.penalties.reduce((n, p) => n + (p.seconds ?? 0), 0)}s` : ""}</span>}
          {matters.length > 0 && <span className="chip bg-info/20 text-info" title={matters.join("\n")}>INVESTIGATION</span>}
          <DrsChip row={r} />
        </div>
      </dl>
      <div className="space-y-3">
        <div><div className="mb-1 text-[10px] uppercase tracking-wider text-faint">Last lap sectors</div><SectorBar times={sec?.s ?? [null, null, null]} tones={sec?.tone ?? []} /></div>
        <div><div className="mb-1 text-[10px] uppercase tracking-wider text-faint">Gap to car ahead, recent</div><Sparkline values={trend} /></div>
        <div><div className="mb-1 text-[10px] uppercase tracking-wider text-faint">Sector colours, last laps</div><LapRibbon laps={ribbon} /></div>
      </div>
      <div className="space-y-3">
        <CarTelemetry car={r.car} fresh={fresh} units={units} />
        <TraceChart samples={timeline.carDataOf(r.driver.number)} t={t} />
      </div>
    </div>
  );
}

function Tower({ rows, timeline, t, mode }: { rows: LeaderboardRow[]; timeline: SessionTimeline; t: number; mode: Mode }) {
  const units = useSettings((s) => s.units);
  const selected = useSession((s) => s.selectedDriver);
  const selectDriver = useSession((s) => s.selectDriver);
  const sectors = useMemo(() => sectorTones(timeline, rows.map((r) => r.driver), t), [timeline, rows, t]);
  const matters = useMemo(() => stewardMatters(timeline.raceControl, t), [timeline, t]);
  const open = (n: number) => matters.filter((m) => m.drivers.includes(n) && (m.status === "under investigation" || m.status === "noted" || m.status === "investigation after session")).map((m) => `${m.reason || "Incident"}: ${m.status}`);
  const unit = units === "metric" ? "km/h" : "mph";

  // The open detail's height is measured, so rows below it can slide without overlapping.
  const [detailH, setDetailH] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const detailRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return setDetailH(0);
    setDetailH(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    roRef.current = new ResizeObserver(() => setDetailH(el.offsetHeight));
    roRef.current.observe(el);
  }, []);
  useLayoutEffect(() => () => roRef.current?.disconnect(), []);

  const openIndex = rows.findIndex((r) => r.driver.number === selected);
  const offset = (i: number) => i * ROW + (openIndex >= 0 && i > openIndex ? detailH : 0);
  const total = rows.length * ROW + (openIndex >= 0 ? detailH : 0);

  return (
    <div className="relative" style={{ height: total, transition: "height 0.3s ease" }} role="table" aria-label="Standings">
      {rows.map((r, i) => {
        const out = r.status === "retired" || r.status === "dsq" || r.status === "dns";
        const isSel = r.driver.number === selected;
        const speed = r.car && r.car.speed != null && t - r.car.ts < FRESH_MS ? Math.round(kmhTo(r.car.speed, units)) : null;
        const sec = sectors.get(r.driver.number);
        return (
          <div key={r.driver.number} role="row" className={cx("absolute inset-x-0 overflow-hidden transition-[transform,background-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]", isSel && "bg-fg/[0.05] shadow-[inset_3px_0_0_rgb(var(--accent))]", out && "opacity-55")} style={{ transform: `translateY(${offset(i)}px)` }}>
            <button className="flex w-full items-center gap-2 px-3 text-left hover:bg-fg/[0.03]" style={{ height: ROW }} onClick={() => selectDriver(isSel ? null : r.driver.number)} aria-expanded={isSel} aria-label={`${r.driver.fullName}, position ${r.position ?? "unknown"}`}>
              <PosBadge r={r} out={out} />
              <Trend r={r} />
              <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: r.driver.teamColour ?? "#777" }} aria-hidden="true" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="font-display text-base font-bold tracking-wide">{r.driver.code}</span>
                <span className="num ml-1.5 text-[11px] text-faint">#{r.driver.number}</span>
                <span className="block truncate text-[11px] text-muted">{r.driver.lastName} · {r.driver.team}</span>
              </span>
              <span className="flex items-center gap-2 sm:gap-3"><Columns mode={mode} r={r} sec={sec} speed={speed} unit={unit} /></span>
              <Icon name="chevronDown" size={14} className={cx("shrink-0 text-faint transition-transform", isSel && "rotate-180")} />
            </button>
            {isSel && (
              <div ref={detailRef}>
                <Detail r={r} timeline={timeline} t={t} sec={sec} matters={open(r.driver.number)} units={units} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Standings() {
  const timeline = useSession((s) => s.timeline)!;
  const server = useSession((s) => s.server);
  const lastLiveAt = useSession((s) => s.lastLiveAt);
  const load = useSession((s) => s.load);
  const snap = useSnapshot(4);
  const now = useNow(1000);
  const centre = useRaceCentre();
  const [mode, setMode] = useState<Mode>("order");
  const session = timeline.core.session;
  const quality = currentQuality(now);
  const live = !!server?.live.session && server.live.session.sessionKey === session.sessionKey;
  const classified = timeline.core.results.length > 0;
  const raceLike = session.type === "Race";
  const updated = live ? lastLiveAt : timeline.latestTs;
  const state = sessionState(session, now, live && !!server?.live.connected);

  const hasSectors = !!snap && snap.rows.some((r) => r.lastLap && (r.lastLap.s1 !== null || r.lastLap.s2 !== null || r.lastLap.s3 !== null));
  const hasSpeed = !!snap && snap.rows.some((r) => r.car && r.car.speed != null && snap.t - r.car.ts < FRESH_MS);
  const enabled = (m: Mode) => (m === "sectors" ? hasSectors : m === "speed" ? hasSpeed : true);
  const tone: StatusTone = quality === "LIVE" ? "active" : quality === "DELAYED" ? "delayed" : "historical";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">{session.countryName} · {session.year}</div>
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-wide">{session.location} · {session.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snap && <FlagPill track={snap.track} />}
          {snap?.leaderLap != null && <span className="num rounded-full bg-fg/[0.06] px-2.5 py-1 text-xs">Lap {snap.leaderLap}{snap.totalLaps ? ` / ${snap.totalLaps}` : ""}</span>}
          <StateBadge state={state} />
        </div>
      </div>

      <DataStatus tone={tone} label={quality === "LIVE" ? "Live" : quality === "DELAYED" ? "Delayed" : quality === "HISTORICAL" ? "Historical" : "Unavailable"} source={classified ? "Official classification published" : live ? "Provisional live order" : "Provisional order from timing"} updatedAt={updated} now={now} onRefresh={() => void load(session.sessionKey)}>
        <ul className="list-disc space-y-1 pl-4">
          <li>{raceLike ? "Race order" : `${session.name} order`} for this session only. Championship points are a separate dataset: see <Link className="underline" to="/championship">Championship standings</Link>.</li>
          <li>{classified ? "The source has published this session's final classification." : "This order comes from the timing feed. It is not the official classification until the session is classified."}</li>
          <li>Gaps, sector colours and tyre data come from OpenF1 timing; sector colours are derived from completed laps. Speed and DRS show only when car telemetry exists for this moment.</li>
          <li>Last data: {updated ? `${formatAge(now - updated)} (${new Date(updated).toLocaleTimeString()})` : "none received yet"}.</li>
        </ul>
      </DataStatus>
      {centre.live && !live && <p className="text-xs text-warn">A different session is live now. <button className="underline" onClick={() => void load(centre.live!.sessionKey)}>Switch to it</button></p>}

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="Standings view">
        {MODES.map((m) => (
          <button key={m.value} role="tab" aria-selected={mode === m.value} disabled={!enabled(m.value)} title={enabled(m.value) ? undefined : m.value === "sectors" ? "No sector times for this moment" : "No fresh car telemetry for this moment"} onClick={() => setMode(m.value)} className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", mode === m.value ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:text-fg", !enabled(m.value) && "cursor-not-allowed opacity-40 hover:text-muted")}>{m.label}</button>
        ))}
      </div>

      <section className="panel overflow-hidden">
        {snap ? <Tower rows={snap.rows} timeline={timeline} t={snap.t} mode={enabled(mode) ? mode : "order"} /> : null}
        {snap && snap.rows.length === 0 && <div className="p-6 text-center text-sm text-muted">No drivers reported for this session.</div>}
      </section>
    </div>
  );
}

export function LiveStandings() {
  return (
    <SessionGate>
      <Standings />
    </SessionGate>
  );
}
