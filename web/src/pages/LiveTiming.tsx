import { useEffect, useMemo, useState } from "react";
import { formatDelta, formatLapTime, kmhTo, neutralPeriods, seasonHasDrs, tempTo, type DriverInfo, type LapRecord } from "@f1/shared";
import { api } from "../api";
import { LineChart, type Series } from "../components/LineChart";
import { SessionGate } from "../components/SessionGate";
import { cx, ErrorState, Loading, Panel, ProvenanceTag, TyreBadge, Unavailable } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useDisplayTime } from "../hooks/live";
import { brakingPoints, buildTrace, deltaTrace, sectionTimes, type TracePoint } from "../lib/telemetry";
import { sourceLabel, useSession } from "../store/session";
import { useSettings } from "../store/settings";

const MAX_COMPARE = 4;
const SECTIONS = 24;

export function LiveTiming() {
  return (
    <SessionGate>
      <Inner />
    </SessionGate>
  );
}

function bestLap(laps: readonly LapRecord[]): LapRecord | null {
  let best: LapRecord | null = null;
  for (const l of laps) if (l.duration !== null && l.start !== null && !l.pitOutLap && (!best || l.duration < best.duration!)) best = l;
  return best;
}

function Inner() {
  const timeline = useSession((s) => s.timeline)!;
  const version = useSession((s) => s.version);
  const compare = useSession((s) => s.compare);
  const setCompare = useSession((s) => s.setCompare);
  const t = useDisplayTime(1);
  const drivers = useMemo(() => timeline.driverList(), [timeline, version]);

  // Default comparison: the top two at the moment shown.
  useEffect(() => {
    if (compare.length) return;
    const snap = timeline.snapshotAt(t);
    const top = snap.rows.filter((r) => r.position !== null).slice(0, 2).map((r) => r.driver.number);
    if (top.length) setCompare(top);
  }, [compare.length, timeline, setCompare]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lapChoice, setLapChoice] = useState<Record<number, number>>({});
  const selected = compare.map((n) => timeline.drivers.get(n)).filter(Boolean) as DriverInfo[];
  const lapsFor = (n: number) => timeline.completedLaps(n, t);
  const chosenLap = (n: number): LapRecord | null => {
    const laps = lapsFor(n);
    const pick = lapChoice[n];
    return (pick !== undefined ? laps.find((l) => l.lap === pick) : null) ?? bestLap(laps);
  };

  const toggle = (n: number) => {
    if (compare.includes(n)) setCompare(compare.filter((x) => x !== n));
    else setCompare([...compare, n].slice(-MAX_COMPARE));
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Drivers" subtitle={`Select up to ${MAX_COMPARE} drivers to compare. Laps shown are those completed by the moment selected on the timeline.`}>
        <div className="flex flex-wrap gap-1.5">
          {drivers.map((d) => {
            const on = compare.includes(d.number);
            return (
              <button
                key={d.number}
                onClick={() => toggle(d.number)}
                aria-pressed={on}
                className={cx("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ring-1 transition-colors", on ? "bg-raised text-fg" : "text-muted ring-line/10 hover:text-fg")}
                style={on ? { boxShadow: `inset 0 0 0 1.5px ${d.teamColour ?? "#888"}` } : undefined}
              >
                <span className="h-3 w-1 rounded-full" style={{ background: d.teamColour ?? "#888" }} />
                {d.code}
              </button>
            );
          })}
        </div>
      </Panel>

      {selected.length === 0 ? (
        <Unavailable title="No drivers selected" reason="Pick at least one driver above." />
      ) : (
        <>
          <LapComparison drivers={selected} chosenLap={chosenLap} lapsFor={lapsFor} onPickLap={(n, lap) => setLapChoice((c) => ({ ...c, [n]: lap }))} />
          <div className="grid gap-3 xl:grid-cols-2">
            <LapProgression drivers={selected} t={t} />
            <PositionProgression drivers={selected} t={t} />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <Stints t={t} />
            <Weather t={t} />
          </div>
          <UnavailableChannels />
        </>
      )}
    </div>
  );
}

interface LoadedTrace {
  driver: DriverInfo;
  lap: LapRecord;
  trace: TracePoint[];
}

function useLapTrace(sessionKey: number, driver: DriverInfo, lap: LapRecord | null) {
  const key = lap?.start != null && lap.duration != null ? `trace:${sessionKey}:${driver.number}:${lap.lap}` : null;
  return useAsync(key, async () => {
    const start = lap!.start!;
    const end = start + lap!.duration! * 1000;
    const car = await api.carData(sessionKey, start, end + 300, driver.number);
    return car.samples;
  }, 60 * 60_000);
}

function LapComparison({ drivers, chosenLap, lapsFor, onPickLap }: { drivers: DriverInfo[]; chosenLap: (n: number) => LapRecord | null; lapsFor: (n: number) => LapRecord[]; onPickLap: (n: number, lap: number) => void }) {
  const timeline = useSession((s) => s.timeline)!;
  const key = timeline.core.session.sessionKey;
  const units = useSettings((s) => s.units);
  const [hover, setHover] = useState<number | null>(null);
  const loads = drivers.map((d) => ({ d, lap: chosenLap(d.number) }));
  // Hooks need a stable count; MAX_COMPARE slots.
  const slots = Array.from({ length: MAX_COMPARE }, (_, i) => loads[i]);
  const r0 = useLapTrace(key, slots[0]?.d ?? drivers[0], slots[0]?.lap ?? null);
  const r1 = useLapTrace(key, slots[1]?.d ?? drivers[0], slots[1]?.lap ?? null);
  const r2 = useLapTrace(key, slots[2]?.d ?? drivers[0], slots[2]?.lap ?? null);
  const r3 = useLapTrace(key, slots[3]?.d ?? drivers[0], slots[3]?.lap ?? null);
  const results = [r0, r1, r2, r3].slice(0, loads.length);

  const traces: LoadedTrace[] = useMemo(
    () => loads.flatMap((l, i) => (l.lap && results[i].data ? [{ driver: l.d, lap: l.lap, trace: buildTrace(results[i].data!, l.lap.start!) }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((r) => r.data).join("|"), loads.map((l) => `${l.d.number}:${l.lap?.lap}`).join(",")],
  );
  const loading = results.some((r) => r.loading);
  const errors = results.filter((r) => r.error);
  const hasDrs = seasonHasDrs(timeline.year);
  const unit = units === "metric" ? "km/h" : "mph";

  const series = (pick: (p: TracePoint) => number | null, step = false): Series[] =>
    traces.map((tr, i) => ({ id: `${tr.driver.number}`, label: tr.driver.code, colour: colourFor(tr.driver, i, traces), dashed: i > 0 && sameTeam(tr.driver, traces), step, points: tr.trace.map((p) => ({ x: p.d, y: pick(p) })) }));

  const ref = traces[0];
  const deltas: Series[] = ref ? traces.slice(1).map((tr, i) => ({ id: `d${tr.driver.number}`, label: `${tr.driver.code} vs ${ref.driver.code}`, colour: colourFor(tr.driver, i + 1, traces), points: deltaTrace(ref.trace, tr.trace) })) : [];
  const lapLength = traces.length ? Math.min(...traces.map((x) => x.trace[x.trace.length - 1]?.d ?? 0)) : 0;
  const sections = traces.map((tr) => sectionTimes(tr.trace, SECTIONS, lapLength));
  const xf = (x: number) => `${(x / 1000).toFixed(1)} km`;

  return (
    <Panel
      title="Lap comparison"
      subtitle={`Car telemetry from ${sourceLabel()} at about 3.7 samples per second. Distance is integrated from speed.`}
      right={<ProvenanceTag kind="measured" title="Speed, throttle, brake, gear, RPM and DRS are measured channels. Distance and deltas are derived." />}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {loads.map(({ d, lap }, i) => (
          <label key={d.number} className="flex items-center gap-1.5 rounded-lg bg-raised px-2 py-1 text-xs">
            <span className="h-3 w-1 rounded-full" style={{ background: colourFor(d, i, traces) }} />
            <span className="font-semibold">{d.code}</span>
            <select className="input py-0 text-xs" value={lap?.lap ?? ""} onChange={(e) => onPickLap(d.number, Number(e.target.value))} aria-label={`Lap for ${d.code}`}>
              {lapsFor(d.number)
                .filter((l) => l.duration !== null)
                .map((l) => (
                  <option key={l.lap} value={l.lap}>
                    Lap {l.lap} · {formatLapTime(l.duration)}
                    {l.pitOutLap ? " (out)" : ""}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>

      {loading && !traces.length && <Loading label="Loading telemetry" />}
      {errors.map((e, i) => (
        <ErrorState key={i} title="Telemetry unavailable" message={e.error!.message} onRetry={e.reload} />
      ))}
      {!loading && !traces.length && !errors.length && <Unavailable reason="No completed timed laps for the selected drivers at this moment." />}

      {traces.length > 0 && (
        <div className="space-y-4">
          <SectorTable traces={traces} />
          <div>
            <div className="label mb-1">Fastest driver per section ({SECTIONS} equal-distance sections, derived)</div>
            <div className="flex h-5 overflow-hidden rounded">
              {Array.from({ length: SECTIONS }, (_, s) => {
                let best = -1;
                sections.forEach((sec, i) => {
                  if (sec[s] !== null && (best < 0 || sec[s]! < sections[best][s]!)) best = i;
                });
                const tr = traces[best];
                return <div key={s} className="flex-1 border-r border-bg/50" style={{ background: tr ? colourFor(tr.driver, best, traces) : "rgb(var(--raised))" }} title={tr ? `Section ${s + 1}: ${tr.driver.code} fastest` : "No data"} />;
              })}
            </div>
          </div>
          <LineChart series={series((p) => (p.speed === null ? null : kmhTo(p.speed, units)))} height={200} yLabel={`Speed ${unit}`} xFormat={xf} hoverX={hover} onHover={setHover} />
          {deltas.length > 0 && (
            <LineChart series={deltas} height={130} yLabel={`Delta to ${ref.driver.code} (s)`} xFormat={xf} yFormat={(y) => y.toFixed(2)} zeroLine hoverX={hover} onHover={setHover} />
          )}
          <LineChart series={series((p) => p.throttle)} height={110} yLabel="Throttle %" xFormat={xf} yDomain={[0, 105]} hoverX={hover} onHover={setHover} />
          <LineChart series={series((p) => (p.brake === null ? null : p.brake > 0 ? 1 : 0), true)} height={80} yLabel="Brake" xFormat={xf} yDomain={[-0.1, 1.1]} yTicks={[0, 1]} yFormat={(y) => (y > 0.5 ? "ON" : "OFF")} hoverX={hover} onHover={setHover} />
          <p className="-mt-3 text-[10px] text-muted">
            The brake channel is on/off only. First brake application (derived): {traces.map((tr) => `${tr.driver.code} ${brakingPoints(tr.trace).length} points`).join(" · ")}. At this sample rate a braking point is accurate to roughly ±20 m.
          </p>
          <LineChart series={series((p) => p.gear, true)} height={110} yLabel="Gear" xFormat={xf} yDomain={[0, 8.5]} yTicks={[1, 2, 3, 4, 5, 6, 7, 8]} hoverX={hover} onHover={setHover} />
          <LineChart series={series((p) => p.rpm)} height={110} yLabel="RPM" xFormat={xf} hoverX={hover} onHover={setHover} />
          {hasDrs ? (
            <LineChart
              series={series((p) => (p.drs === null ? null : [10, 12, 14].includes(p.drs) ? 1 : 0), true)}
              height={70}
              yLabel="DRS open"
              xFormat={xf}
              yDomain={[-0.1, 1.1]}
              yTicks={[0, 1]}
              yFormat={(y) => (y > 0.5 ? "OPEN" : "")}
              hoverX={hover}
              onHover={setHover}
            />
          ) : (
            <Unavailable title="DRS not applicable" reason={`DRS is not part of the ${timeline.year} regulations.`} />
          )}
        </div>
      )}
    </Panel>
  );
}

function sameTeam(d: DriverInfo, traces: LoadedTrace[]) {
  return traces.filter((t) => t.driver.team === d.team).length > 1 && traces.findIndex((t) => t.driver.team === d.team) !== traces.findIndex((t) => t.driver.number === d.number);
}

const FALLBACK = ["#e10600", "#3b82f6", "#f5f5f5", "#22c55e"];
function colourFor(d: DriverInfo, i: number, traces: { driver: DriverInfo }[]) {
  // Teammates share a colour; the second one is drawn dashed.
  return d.teamColour ?? FALLBACK[i % FALLBACK.length] ?? (traces[0] ? "#888" : "#888");
}

function SectorTable({ traces }: { traces: LoadedTrace[] }) {
  const fields: { k: string; get: (l: LapRecord) => number | null; time: boolean; higherBetter?: boolean }[] = [
    { k: "S1", get: (l) => l.s1, time: true },
    { k: "S2", get: (l) => l.s2, time: true },
    { k: "S3", get: (l) => l.s3, time: true },
    { k: "Lap", get: (l) => l.duration, time: true },
    { k: "I1 km/h", get: (l) => l.i1Speed, time: false, higherBetter: true },
    { k: "I2 km/h", get: (l) => l.i2Speed, time: false, higherBetter: true },
    { k: "Trap km/h", get: (l) => l.stSpeed, time: false, higherBetter: true },
  ];
  const ref = traces[0].lap;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
          <tr>
            <th className="py-1 font-medium">Driver</th>
            {fields.map((f) => (
              <th key={f.k} className="text-right font-medium">
                {f.k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {traces.map((tr) => (
            <tr key={tr.driver.number} className="border-t hairline">
              <td className="py-1.5 font-display font-bold">
                {tr.driver.code} <span className="font-sans text-[10px] font-normal text-muted">L{tr.lap.lap}</span>
              </td>
              {fields.map((f) => {
                const v = f.get(tr.lap);
                const all = traces.map((x) => f.get(x.lap)).filter((x): x is number => x !== null);
                const best = all.length ? (f.higherBetter ? Math.max(...all) : Math.min(...all)) : null;
                const r = f.get(ref);
                return (
                  <td key={f.k} className={cx("text-right", v !== null && v === best && traces.length > 1 && "font-semibold text-best")}>
                    {v === null ? "—" : f.time ? (f.k === "Lap" ? formatLapTime(v) : v.toFixed(3)) : v}
                    {f.time && tr !== traces[0] && v !== null && r !== null && <div className={cx("text-[10px]", v - r > 0 ? "text-danger" : "text-ok")}>{formatDelta(v - r)}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {traces.some((tr) => tr.lap.segments.some((s) => s)) ? (
        <MiniSectors traces={traces} />
      ) : (
        <p className="mt-2 text-[10px] text-muted">Mini-sector colours are not published for races.</p>
      )}
    </div>
  );
}

const SEG: Record<number, string> = { 2048: "rgb(var(--warn))", 2049: "rgb(var(--ok))", 2051: "rgb(var(--best))", 2064: "rgb(var(--info))" };
function MiniSectors({ traces }: { traces: LoadedTrace[] }) {
  return (
    <div className="mt-3 space-y-1">
      <div className="label">Mini-sectors (official status: yellow = slower, green = personal best, purple = overall best)</div>
      {traces.map((tr) => (
        <div key={tr.driver.number} className="flex items-center gap-2">
          <span className="w-9 font-display text-xs font-bold">{tr.driver.code}</span>
          <div className="flex flex-1 gap-px">
            {tr.lap.segments.flatMap((s, si) => (s ?? []).map((c, i) => <span key={`${si}-${i}`} className="h-2 flex-1 rounded-sm" style={{ background: SEG[c] ?? "rgb(var(--raised))" }} />))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LapProgression({ drivers, t }: { drivers: DriverInfo[]; t: number }) {
  const timeline = useSession((s) => s.timeline)!;
  const bands = useMemo(() => {
    const ref = timeline.lapsOf(drivers[0].number);
    const lapAt = (ts: number) => ref.filter((l) => l.start !== null && l.start <= ts).pop()?.lap ?? 0;
    return neutralPeriods(timeline.raceControl).map((p) => ({ from: lapAt(p.start), to: p.end ? lapAt(p.end) + 0.99 : lapAt(p.start) + 1, colour: "rgb(var(--warn) / 0.1)", label: p.kind }));
  }, [timeline, drivers]);
  const series: Series[] = drivers.map((d) => ({ id: String(d.number), label: d.code, colour: d.teamColour ?? "#888", points: timeline.completedLaps(d.number, t).map((l) => ({ x: l.lap, y: l.pitOutLap ? null : l.duration })) }));
  return (
    <Panel title="Lap-time progression" subtitle="Out-laps omitted. Shaded: SC, VSC or red flag.">
      <LineChart series={series} height={220} xFormat={(x) => `L${Math.round(x)}`} yFormat={(y) => formatLapTime(y)} bands={bands} empty="No completed laps" />
    </Panel>
  );
}

function PositionProgression({ drivers, t }: { drivers: DriverInfo[]; t: number }) {
  const timeline = useSession((s) => s.timeline)!;
  const lp = useMemo(() => timeline.lapPositions(), [timeline, timeline.version]);
  const series: Series[] = drivers.map((d) => ({
    id: String(d.number),
    label: d.code,
    colour: d.teamColour ?? "#888",
    step: true,
    points: (lp.get(d.number) ?? []).filter((p) => (timeline.lapsOf(d.number).find((l) => l.lap === p.lap)?.start ?? Infinity) <= t).map((p) => ({ x: p.lap, y: p.position })),
  }));
  return (
    <Panel title="Position progression" subtitle="Position at the end of each lap, from timing positions (derived).">
      <LineChart series={series} height={220} invertY xFormat={(x) => `L${Math.round(x)}`} yFormat={(y) => `P${Math.round(y)}`} empty="No position data" />
    </Panel>
  );
}

function Stints({ t }: { t: number }) {
  const timeline = useSession((s) => s.timeline)!;
  const snap = timeline.snapshotAt(t);
  const maxLap = Math.max(1, ...snap.rows.map((r) => r.lap ?? 0));
  const colour: Record<string, string> = { SOFT: "#ff2d2d", MEDIUM: "#ffd400", HARD: "#e8e8e8", INTERMEDIATE: "#2fbf3a", WET: "#2f7cff", UNKNOWN: "#6b7280" };
  return (
    <Panel title="Tyre stints" subtitle="Compound and laps per stint, as reported by timing.">
      {timeline.core.channels.stints.available ? (
        <div className="space-y-1">
          {snap.rows.map((r) => (
            <div key={r.driver.number} className="flex items-center gap-2">
              <span className="w-9 font-display text-xs font-bold">{r.driver.code}</span>
              <div className="relative h-3.5 flex-1 rounded bg-raised">
                {timeline.stintsOf(r.driver.number).filter((s) => s.lapStart <= (r.lap ?? 0)).map((s) => {
                  const end = Math.min(s.lapEnd ?? r.lap ?? s.lapStart, r.lap ?? s.lapStart);
                  return (
                    <div
                      key={s.stint}
                      className="absolute top-0 h-full rounded-sm border-r-2 border-bg"
                      style={{ left: `${((s.lapStart - 1) / maxLap) * 100}%`, width: `${(Math.max(1, end - s.lapStart + 1) / maxLap) * 100}%`, background: colour[s.compound] }}
                      title={`${s.compound} laps ${s.lapStart}–${s.lapEnd ?? "…"}`}
                    />
                  );
                })}
              </div>
              <TyreBadge compound={r.compound} age={r.tyreAge} size={16} />
            </div>
          ))}
        </div>
      ) : (
        <Unavailable reason={timeline.core.channels.stints.reason} />
      )}
    </Panel>
  );
}

function Weather({ t }: { t: number }) {
  const timeline = useSession((s) => s.timeline)!;
  const units = useSettings((s) => s.units);
  const w = timeline.weather.filter((x) => x.ts <= t);
  const start = timeline.core.session.start;
  const series: Series[] = [
    { id: "air", label: "Air", colour: "rgb(var(--info))", points: w.map((x) => ({ x: (x.ts - start) / 60000, y: x.airTemp === null ? null : tempTo(x.airTemp, units) })) },
    { id: "track", label: "Track", colour: "rgb(var(--accent))", points: w.map((x) => ({ x: (x.ts - start) / 60000, y: x.trackTemp === null ? null : tempTo(x.trackTemp, units) })) },
  ];
  const last = w[w.length - 1];
  return (
    <Panel title="Weather and track" subtitle="Session weather station, about one reading per minute." right={last && <span className="text-xs text-muted">{last.rainfall ? "Rain reported" : "No rain reported"} · wind {last.windSpeed ?? "—"} m/s · humidity {last.humidity ?? "—"}%</span>}>
      {w.length ? <LineChart series={series} height={200} yLabel={units === "metric" ? "°C" : "°F"} xFormat={(x) => `${Math.round(x)} min`} yFormat={(y) => y.toFixed(1)} /> : <Unavailable reason={timeline.core.channels.weather.reason ?? "No weather readings yet."} />}
    </Panel>
  );
}

function UnavailableChannels() {
  const timeline = useSession((s) => s.timeline)!;
  const ch = timeline.core.channels;
  return (
    <Panel title="Channels not available from the data source">
      <div className="grid gap-2 md:grid-cols-2">
        <Unavailable title="Energy / ERS" reason={ch.energy.reason} />
        <Unavailable title="Overtake mode" reason={ch.overtakeMode.reason} />
        <Unavailable title="Tyre temperatures and pressures" reason="Team-only telemetry; not published." />
        <Unavailable title="Fuel load, engine modes, steering" reason="Team-only telemetry; not published." />
      </div>
    </Panel>
  );
}
