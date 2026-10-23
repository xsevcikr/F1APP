import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatAge, formatGap, formatLapTime, kmhTo, stewardMatters, type DriverInfo, type LeaderboardRow, type SessionTimeline } from "@f1/shared";
import { FlagPill } from "../components/SessionHeader";
import { DrsChip } from "../components/Leaderboard";
import { SessionGate } from "../components/SessionGate";
import { cx, Panel, QualityBadge, TyreBadge } from "../components/ui";
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

const GRID = "grid-cols-[34px_28px_minmax(150px,1.3fr)_48px_74px_64px_74px_74px_150px_70px_64px_90px_72px]";

function Tower({ rows, timeline, t }: { rows: LeaderboardRow[]; timeline: SessionTimeline; t: number }) {
  const units = useSettings((s) => s.units);
  const selected = useSession((s) => s.selectedDriver);
  const selectDriver = useSession((s) => s.selectDriver);
  const sectors = useMemo(() => sectorTones(timeline, rows.map((r) => r.driver), t), [timeline, rows, t]);
  const matters = useMemo(() => stewardMatters(timeline.raceControl, t), [timeline, t]);
  const open = (n: number) => matters.filter((m) => m.drivers.includes(n) && (m.status === "under investigation" || m.status === "noted" || m.status === "investigation after session"));
  const ROW = 38;
  const unit = units === "metric" ? "km/h" : "mph";
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1120px]">
        <div className={cx("grid items-center gap-x-2 border-b hairline px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint", GRID)}>
          <span>Pos</span><span /><span>Driver</span><span className="text-right">Laps</span><span className="text-right">Leader</span><span className="text-right">Ahead</span><span className="text-right">Last</span><span className="text-right">Best</span><span className="text-center">Sectors</span><span className="text-center">Tyre</span><span className="text-center">Pit</span><span className="text-center">Status</span><span className="text-right">Speed</span>
        </div>
        <div className="relative" style={{ height: rows.length * ROW }} role="table" aria-label="Live standings">
          {rows.map((r, i) => {
            const sec = sectors.get(r.driver.number);
            const inv = open(r.driver.number);
            const out = r.status === "retired" || r.status === "dsq" || r.status === "dns";
            const speed = r.car && r.car.speed != null && t - r.car.ts < 5000 ? Math.round(kmhTo(r.car.speed, units)) : null;
            return (
              <div
                key={r.driver.number}
                role="row"
                onClick={() => selectDriver(r.driver.number)}
                className={cx("absolute inset-x-0 grid cursor-pointer items-center gap-x-2 px-3 transition-[transform,background-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] hover:bg-raised/70", GRID, selected === r.driver.number && "bg-accent/10", out && "opacity-55")}
                style={{ transform: `translateY(${i * ROW}px)`, height: ROW }}
              >
                <span className="num text-center font-display text-base font-bold">{out && r.position === null ? "—" : r.position ?? "—"}</span>
                <span className={cx("num text-center text-[10px] font-semibold", (r.gained ?? 0) > 0 ? "text-ok" : "text-danger")}>{r.gained ? `${r.gained > 0 ? "▲" : "▼"}${Math.abs(r.gained)}` : ""}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: r.driver.teamColour ?? "#777" }} />
                  <span className="font-display text-[15px] font-bold">{r.driver.code}</span>
                  <span className="truncate text-xs text-muted">{r.driver.lastName} <span className="num text-faint">#{r.driver.number}</span> · {r.driver.team}</span>
                </span>
                <span className="num text-right text-xs">{r.lap ?? "—"}</span>
                <span className="num text-right text-xs">{r.position === 1 ? "LEADER" : formatGap(r.gapToLeader.value)}</span>
                <span className="num text-right text-xs">{r.position === 1 ? "" : formatGap(r.interval.value)}</span>
                <span className={cx("num rounded px-1 text-right text-xs", r.newPersonalBest && "animate-flash text-best")} key={r.lastLap?.lap}>{formatLapTime(r.lastLap?.duration)}</span>
                <span className="num text-right text-xs text-muted">{formatLapTime(r.bestLap?.duration)}</span>
                <span className="num flex justify-center gap-2 text-[11px]">
                  {[0, 1, 2].map((k) => <span key={k} className={sec?.tone[k] ? TONE[sec.tone[k]!] : "text-faint"}>{sec?.s[k] != null ? sec.s[k]!.toFixed(3) : "—"}</span>)}
                </span>
                <span className="flex justify-center"><TyreBadge compound={r.compound} age={r.tyreAge} size={20} /></span>
                <span className="num text-center text-xs">{r.inPitLane ? <span className="chip bg-info/20 text-info">IN PIT</span> : r.pitStops}</span>
                <span className="flex flex-wrap justify-center gap-1">
                  {r.status === "retired" && <span className="chip bg-danger/20 text-danger" title={r.statusBasis ?? undefined}>RETIRED</span>}
                  {r.status === "dsq" && <span className="chip bg-danger/20 text-danger">DSQ</span>}
                  {r.status === "dns" && <span className="chip bg-faint/20 text-muted">DNS</span>}
                  {r.status === "finished" && <span className="chip bg-fg/10 text-fg">FINISHED</span>}
                  {r.penalties.length > 0 && <span className="chip bg-warn/20 text-warn" title={r.penalties.map((p) => p.message).join("\n")}>PEN{r.penalties.reduce((n, p) => n + (p.seconds ?? 0), 0) > 0 ? ` +${r.penalties.reduce((n, p) => n + (p.seconds ?? 0), 0)}s` : ""}</span>}
                  {inv.length > 0 && <span className="chip bg-info/20 text-info" title={inv.map((m) => `${m.reason || "Incident"}: ${m.status}`).join("\n")}>INVEST.</span>}
                  <DrsChip row={r} />
                </span>
                <span className="num text-right text-xs">{speed ? `${speed} ${unit}` : <span className="text-faint" title="Car telemetry is not available for this moment">—</span>}</span>
              </div>
            );
          })}
        </div>
      </div>
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
  const session = timeline.core.session;
  const quality = currentQuality(now);
  const live = !!server?.live.session && server.live.session.sessionKey === session.sessionKey;
  const classified = timeline.core.results.length > 0;
  const raceLike = session.type === "Race";
  const updated = live ? lastLiveAt : timeline.latestTs;

  return (
    <div className="flex flex-col gap-3">
      <Panel title={`${session.location} · ${session.name}`} subtitle={`${session.countryName} · ${session.year}`} right={<QualityBadge quality={quality} />}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {snap && <FlagPill track={snap.track} />}
          {snap?.leaderLap != null && <span className="chip bg-raised text-fg">LAP {snap.leaderLap}{snap.totalLaps ? `/${snap.totalLaps}` : ""}</span>}
          <span className={cx("chip", classified ? "bg-ok/15 text-ok" : "bg-warn/20 text-warn")} title={classified ? "The source has published this session's final classification." : "This order comes from the timing feed. It is not the official classification until the session is classified."}>
            {classified ? "CLASSIFIED RESULT PUBLISHED" : live ? "PROVISIONAL · LIVE ORDER" : "PROVISIONAL ORDER"}
          </span>
          <span className="text-muted">Last update: {updated ? `${formatAge(now - updated)} (${new Date(updated).toLocaleTimeString()})` : "no data received yet"}</span>
          <button className="btn ml-auto px-2 py-1 text-xs" onClick={() => void load(session.sessionKey)}>Refresh</button>
        </div>
        {centre.live && !live && <p className="mt-2 text-xs text-warn">A different session is live now. <button className="underline" onClick={() => void load(centre.live!.sessionKey)}>Switch to it</button></p>}
        <p className="mt-2 text-[11px] text-muted">
          {raceLike ? "Race order" : session.name + " order"} for this session only. Championship points are a separate dataset: see <Link className="underline" to="/championship">Championship Standings</Link>. Gaps, sector colours and tyre data come from OpenF1 timing; sector colours are derived from completed laps. Speed and DRS show only when car telemetry exists for this moment.
        </p>
      </Panel>
      <Panel bodyClass="p-0">
        {snap ? <Tower rows={snap.rows} timeline={timeline} t={snap.t} /> : null}
        {snap && snap.rows.length === 0 && <div className="p-6 text-center text-sm text-muted">No drivers reported for this session.</div>}
      </Panel>
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
