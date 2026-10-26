import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DRS_LABEL, formatGap, formatLapTime, kmhTo, neutralPeriods, type Snapshot } from "@f1/shared";
import { useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";
import { CarStill } from "../car/CarArt";
import { liveCarSpec } from "./people";
import { LineChart } from "./LineChart";
import { cx, Stat, TyreBadge } from "./ui";

/** Detail drawer for the selected driver: timing, tyres, pit stops and lap times. */
export function DriverPanel({ snap, onClose }: { snap: Snapshot | null; onClose: () => void }) {
  const timeline = useSession((s) => s.timeline);
  const selected = useSession((s) => s.selectedDriver);
  const setCompare = useSession((s) => s.setCompare);
  const units = useSettings((s) => s.units);
  const toggleFav = useSettings((s) => s.toggleFavouriteDriver);
  const favs = useSettings((s) => s.alerts.favouriteDrivers);
  const row = snap?.rows.find((r) => r.driver.number === selected);

  const laps = useMemo(() => (timeline && selected !== null ? timeline.completedLaps(selected, snap?.t ?? 0) : []), [timeline, selected, snap?.t]);
  const lapSeries = useMemo(
    () => [{ id: "lap", label: "Lap time", colour: row?.driver.teamColour ?? "#e10600", points: laps.map((l) => ({ x: l.lap, y: l.pitOutLap ? null : l.duration })) }],
    [laps, row?.driver.teamColour],
  );
  const scBands = useMemo(() => {
    if (!timeline || selected === null) return [];
    const ls = timeline.lapsOf(selected);
    const lapAt = (ts: number) => ls.filter((l) => l.start !== null && l.start <= ts).pop()?.lap ?? 0;
    return neutralPeriods(timeline.raceControl).map((p) => ({ from: lapAt(p.start), to: p.end ? lapAt(p.end) + 1 : lapAt(p.start) + 1, colour: "rgb(var(--warn) / 0.12)", label: p.kind }));
  }, [timeline, selected]);

  if (!timeline || selected === null) return null;
  if (!row) return null;
  const d = row.driver;
  const stints = timeline.stintsOf(d.number);
  const pits = timeline.pitsOf(d.number).filter((p) => p.ts <= (snap?.t ?? 0));
  const speedFresh = row.car && snap && snap.t - row.car.ts < 5000;
  const unit = units === "metric" ? "km/h" : "mph";
  const mates = [...timeline.drivers.values()].filter((x) => x.team === d.team).sort((a, b) => a.number - b.number);
  const car = liveCarSpec(d, timeline.core.session.year, mates.length > 1 && mates[1].number === d.number);

  return (
    <aside className="panel flex max-h-full flex-col overflow-hidden" aria-label={`${d.fullName} details`}>
      <div className="relative overflow-hidden border-b hairline p-4">
        <div className="absolute inset-0 opacity-20" style={{ background: `linear-gradient(120deg, ${d.teamColour ?? "#777"}, transparent 60%)` }} />
        <div className="relative flex items-start justify-between gap-2">
          <div>
            <div className="label">{d.team}</div>
            <div className="font-display text-2xl font-black uppercase leading-tight">
              {d.firstName} <span className="text-accent">{d.lastName}</span>
            </div>
            <div className="num text-sm text-muted">#{d.number} · {d.code}</div>
            <CarStill spec={car.spec} width={400} height={212} className="-ml-1 mt-1 aspect-[400/212] w-44" />
            <div className="text-[10px] text-faint">{car.livery === "team" ? "Illustrative car in team livery colours" : "Plain car in the team colour from timing data"}</div>
          </div>
          <div className="flex items-center gap-1">
            <button className={cx("btn px-2", favs.includes(d.number) && "text-warn")} onClick={() => toggleFav(d.number)} title="Favourite driver" aria-pressed={favs.includes(d.number)}>
              <Icon name="star" size={15} filled={favs.includes(d.number)} />
            </button>
            <button className="btn px-2" onClick={onClose} aria-label="Close driver panel">
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Position" value={row.position ? `P${row.position}` : "—"} sub={row.gained ? `${row.gained > 0 ? "+" : ""}${row.gained} from start` : undefined} />
          <Stat label="Gap ahead" value={row.position === 1 ? "—" : formatGap(row.interval.value)} />
          <Stat label="To leader" value={row.position === 1 ? "LEADER" : formatGap(row.gapToLeader.value)} />
          <Stat label="Last lap" value={formatLapTime(row.lastLap?.duration)} />
          <Stat label="Best lap" value={formatLapTime(row.bestLap?.duration)} sub={row.bestLap ? `Lap ${row.bestLap.lap}` : undefined} />
          <Stat label="Speed" value={speedFresh && row.car?.speed != null ? `${Math.round(kmhTo(row.car.speed, units))}` : "—"} sub={speedFresh ? unit : "no fresh telemetry"} />
          <Stat label="Tyre" value={<TyreBadge compound={row.compound} age={row.tyreAge} />} />
          <Stat label="Pit stops" value={row.pitStops} sub={row.inPitLane ? "In pit lane" : undefined} />
          <Stat label="DRS" value={<span className="text-sm">{DRS_LABEL[row.drs.state]}</span>} sub={row.drs.basis} />
        </div>

        {row.penalties.length > 0 && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 p-2.5 text-xs">
            <div className="label mb-1 text-warn">Penalties</div>
            {row.penalties.map((p) => (
              <div key={p.ts}>{p.message}</div>
            ))}
          </div>
        )}
        {row.statusBasis && <p className="text-xs text-muted">Status: {row.status.toUpperCase()} — {row.statusBasis}</p>}

        <div>
          <div className="label mb-1">Lap times</div>
          <LineChart series={lapSeries} height={150} xFormat={(x) => `L${Math.round(x)}`} yFormat={(y) => formatLapTime(y)} bands={scBands} empty="No completed laps yet" />
          <p className="mt-1 text-[10px] text-muted">Out-laps omitted. Shaded laps were under SC, VSC or red flag.</p>
        </div>

        <div>
          <div className="label mb-1.5">Stints</div>
          {stints.length === 0 ? (
            <p className="text-xs text-muted">No stint data.</p>
          ) : (
            <div className="space-y-1">
              {stints.map((s) => (
                <div key={s.stint} className="flex items-center gap-2 text-xs">
                  <TyreBadge compound={s.compound} size={18} />
                  <span className="num text-muted">
                    Laps {s.lapStart}–{s.lapEnd ?? "…"}
                  </span>
                  {s.tyreAgeAtStart !== null && s.tyreAgeAtStart > 0 && <span className="text-faint">({s.tyreAgeAtStart} laps old at fitting)</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="label mb-1.5">Pit stops</div>
          {pits.length === 0 ? (
            <p className="text-xs text-muted">None yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1 font-medium">Lap</th>
                  <th className="font-medium">Pit lane</th>
                  <th className="font-medium">Stationary</th>
                </tr>
              </thead>
              <tbody className="num">
                {pits.map((p) => (
                  <tr key={p.ts} className="border-t hairline">
                    <td className="py-1">{p.lap ?? "—"}</td>
                    <td>{p.laneDuration !== null ? `${p.laneDuration.toFixed(1)} s` : "—"}</td>
                    <td title={p.stopDuration === null ? "Stationary time is published from the 2024 US GP onward" : undefined}>{p.stopDuration !== null ? `${p.stopDuration.toFixed(1)} s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="label mb-1.5">Recent laps</div>
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="py-1 font-medium">Lap</th>
                <th className="text-right font-medium">S1</th>
                <th className="text-right font-medium">S2</th>
                <th className="text-right font-medium">S3</th>
                <th className="text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="num">
              {[...laps].reverse().slice(0, 8).map((l) => (
                <tr key={l.lap} className={cx("border-t hairline", row.bestLap?.lap === l.lap && "text-best")}>
                  <td className="py-1">{l.lap}{l.pitOutLap && <span className="ml-1 text-[9px] text-info">OUT</span>}</td>
                  <td className="text-right">{l.s1?.toFixed(3) ?? "—"}</td>
                  <td className="text-right">{l.s2?.toFixed(3) ?? "—"}</td>
                  <td className="text-right">{l.s3?.toFixed(3) ?? "—"}</td>
                  <td className="text-right font-semibold">{formatLapTime(l.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link to="/timing" onClick={() => setCompare([d.number])} className="btn w-full justify-center">
          <Icon name="timing" size={15} /> Open telemetry
        </Link>
      </div>
    </aside>
  );
}
