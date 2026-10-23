import { useMemo, useState } from "react";
import { battlesAt, detectPositionChanges, DRS_LABEL, kmhTo, localTimeAt, positionAt, seasonHasDrs, type PositionChange, type PositionChangeKind } from "@f1/shared";
import { DrsChip } from "../components/Leaderboard";
import { PlaybackBar } from "../components/PlaybackBar";
import { SessionGate } from "../components/SessionGate";
import { cx, Panel, ProvenanceTag, Unavailable } from "../components/ui";
import { useSnapshot } from "../hooks/live";
import { useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { currentSector } from "../components/TrackMap";

export function Battles() {
  return (
    <SessionGate>
      <Inner />
    </SessionGate>
  );
}

const KIND_LABEL: Record<PositionChangeKind, string> = {
  confirmed: "Confirmed overtake",
  "likely-on-track": "Likely on-track",
  "pit-cycle": "Pit cycle",
  neutralized: "Under neutralization",
  other: "Other",
};
const KIND_STYLE: Record<PositionChangeKind, string> = {
  confirmed: "bg-ok/15 text-ok",
  "likely-on-track": "bg-info/15 text-info",
  "pit-cycle": "bg-faint/20 text-muted",
  neutralized: "bg-warn/15 text-warn",
  other: "bg-raised text-muted",
};

function Inner() {
  const snap = useSnapshot(4);
  const timeline = useSession((s) => s.timeline)!;
  const version = useSession((s) => s.version);
  const selectDriver = useSession((s) => s.selectDriver);
  const units = useSettings((s) => s.units);
  const t = snap?.t ?? 0;
  const year = timeline.year;
  const hasDrs = seasonHasDrs(year);
  const isRace = timeline.core.session.type === "Race" || timeline.core.session.type === "Sprint";

  const battles = useMemo(() => {
    if (!snap) return [];
    return battlesAt({ t, order: snap.rows.map((r) => ({ driver: r.driver.number, position: r.position, interval: r.interval, inPitLane: r.inPitLane })), carData: (n) => timeline.carDataOf(n) });
  }, [snap, timeline, t]);

  const firstLap = timeline.lapStartTime(1) ?? undefined;
  const changes = useMemo(() => {
    const all = timeline.driverList().map((d) => d.number);
    return detectPositionChanges({
      positions: all.flatMap((n) => timeline.positionsOf(n)),
      pits: all.flatMap((n) => timeline.pitsOf(n)),
      raceControl: timeline.raceControl,
      sourceOvertakes: timeline.core.overtakes,
      from: firstLap,
    });
  }, [timeline, version, firstLap]);

  const [filters, setFilters] = useState<Record<PositionChangeKind, boolean>>({ confirmed: true, "likely-on-track": true, "pit-cycle": true, neutralized: true, other: true });
  const visible = changes.filter((c) => c.ts <= t && filters[c.kind]).reverse();
  const code = (n: number) => timeline.drivers.get(n)?.code ?? String(n);
  const colour = (n: number) => timeline.drivers.get(n)?.teamColour ?? "#888";
  const unit = units === "metric" ? "km/h" : "mph";

  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          title="Close battles"
          subtitle="Cars within 1.5 s of the car ahead, from timing intervals."
          right={<ProvenanceTag kind="measured" title="Gaps from official timing intervals; relative speed from car telemetry" />}
          bodyClass="p-0"
        >
          {!isRace ? (
            <div className="p-4">
              <Unavailable reason="Intervals between cars are published for races only." />
            </div>
          ) : battles.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No cars within 1.5 s of each other at this moment.</p>
          ) : (
            <ul className="divide-hairline">
              {battles.map((b) => {
                const f = snap!.rows.find((r) => r.driver.number === b.follower)!;
                const tgt = snap!.rows.find((r) => r.driver.number === b.target)!;
                return (
                  <li key={`${b.follower}-${b.target}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="num w-8 font-display text-lg font-black">P{b.followerPosition}</span>
                      <button className="flex items-center gap-1.5 font-display font-bold" onClick={() => selectDriver(b.follower)}>
                        <span className="h-4 w-1 rounded-full" style={{ background: colour(b.follower) }} />
                        {code(b.follower)}
                      </button>
                      <span className="text-xs text-muted">chasing</span>
                      <button className="flex items-center gap-1.5 font-display font-bold" onClick={() => selectDriver(b.target)}>
                        <span className="h-4 w-1 rounded-full" style={{ background: colour(b.target) }} />
                        {code(b.target)}
                      </button>
                      <span className={cx("num ml-auto text-lg font-semibold", b.gap < 1 ? "text-ok" : "text-fg")}>{b.gap.toFixed(3)} s</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <div className="label">Relative speed</div>
                        <div className="num">{b.relativeSpeed === null ? "—" : `${b.relativeSpeed > 0 ? "+" : ""}${Math.round(kmhTo(b.relativeSpeed, units))} ${unit}`}</div>
                      </div>
                      <div>
                        <div className="label">{code(b.follower)} DRS</div>
                        <DrsChip row={f} />
                      </div>
                      <div>
                        <div className="label">{code(b.target)} DRS</div>
                        <DrsChip row={tgt} />
                      </div>
                      <div>
                        <div className="label">Slipstream</div>
                        <span className={cx("chip", b.slipstream.likely ? "bg-warn/15 text-warn" : "bg-raised text-muted")} title={b.slipstream.basis}>
                          {b.slipstream.likely ? "Possible tow" : "Unlikely"} · estimate
                        </span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted">{b.slipstream.basis}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="DRS monitor" subtitle={hasDrs ? "Per-car state from car telemetry. Being close to another car is never treated as activation." : undefined} bodyClass="p-0">
          {!hasDrs ? (
            <div className="space-y-2 p-4">
              <Unavailable title="No DRS" reason={`DRS is not part of the ${year} regulations. The 2026 rules use active aerodynamics and a driver-triggered overtake mode instead.`} />
              <Unavailable title="Overtake mode" reason={timeline.core.channels.overtakeMode.reason} />
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-3 border-b hairline px-4 py-2 text-[11px] text-muted">
                <span>Race control: {snap?.track.drsEnabled === null ? "no DRS message yet" : snap?.track.drsEnabled ? "DRS enabled" : "DRS disabled"}</span>
                {snap && snap.track.neutralization !== "none" && <span className="text-warn">Neutralized: DRS not allowed</span>}
              </div>
              <div className="grid grid-cols-2 gap-px bg-line/5 sm:grid-cols-3 md:grid-cols-4">
                {snap?.rows.map((r) => (
                  <div key={r.driver.number} className="flex items-center justify-between gap-2 bg-panel px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className="num w-5 text-xs text-muted">{r.position}</span>
                      <span className="font-display text-sm font-bold">{r.driver.code}</span>
                    </span>
                    <DrsChip row={r} />
                  </div>
                ))}
              </div>
              <p className="px-4 py-2 text-[10px] text-muted">
                {DRS_LABEL.ACTIVE}: flap open per telemetry. {DRS_LABEL.AVAILABLE}: car reports it is eligible. {DRS_LABEL.OFF}: closed and not eligible. {DRS_LABEL.DISABLED}: race control disabled DRS or the session is neutralized. {DRS_LABEL.UNKNOWN}: no fresh telemetry. Detection points are not published.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Position changes"
        subtitle="Detected from changes in the official running order. Only changes the source lists as overtakes are marked confirmed."
        right={<span className="text-xs text-muted">{visible.length} shown</span>}
        bodyClass="p-0"
      >
        <div className="flex flex-wrap gap-1.5 border-b hairline px-4 py-2">
          {(Object.keys(KIND_LABEL) as PositionChangeKind[]).map((k) => (
            <button key={k} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))} aria-pressed={filters[k]} className={cx("chip px-2 py-1 ring-1", filters[k] ? KIND_STYLE[k] + " ring-transparent" : "bg-transparent text-faint ring-line/10")}>
              {KIND_LABEL[k]} · {changes.filter((c) => c.kind === k && c.ts <= t).length}
            </button>
          ))}
        </div>
        {!timeline.core.channels.positions.available ? (
          <div className="p-4">
            <Unavailable reason={timeline.core.channels.positions.reason} />
          </div>
        ) : (
          <ol className="divide-hairline max-h-[520px] overflow-y-auto">
            {visible.slice(0, 200).map((c) => (
              <ChangeRow key={c.id} c={c} code={code} colour={colour} offset={timeline.core.session.gmtOffset} />
            ))}
            {visible.length === 0 && <li className="p-6 text-center text-sm text-muted">No position changes match these filters yet.</li>}
          </ol>
        )}
      </Panel>

      <Panel title="Energy deployment and hybrid systems">
        <Unavailable title="Unavailable" reason={timeline.core.channels.energy.reason + " Battery state of charge, deployment and harvesting are never estimated or invented here."} />
      </Panel>
    </div>
  );
}

function ChangeRow({ c, code, colour, offset }: { c: PositionChange; code: (n: number) => string; colour: (n: number) => string; offset: string }) {
  const timeline = useSession((s) => s.timeline)!;
  const lap = timeline.lapAt(c.gainer, c.ts);
  // Circuit location only when a real position sample exists near that time.
  const pos = positionAt(timeline.locationsOf(c.gainer), c.ts, { maxGapMs: 1500, staleMs: 1500 });
  const sector = currentSector(timeline.lapsOf(c.gainer), c.ts);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <span className="num w-14 text-[11px] text-faint">{localTimeAt(c.ts, offset)}:{String(new Date(c.ts).getUTCSeconds()).padStart(2, "0")}</span>
      <span className={cx("chip", KIND_STYLE[c.kind])}>{KIND_LABEL[c.kind]}</span>
      <span className="flex items-center gap-1.5 font-display font-bold">
        <span className="h-3.5 w-1 rounded-full" style={{ background: colour(c.gainer) }} />
        {code(c.gainer)}
      </span>
      <span className="num text-xs text-ok">P{c.gainerFrom}→P{c.gainerTo}</span>
      <span className="text-xs text-muted">past</span>
      <span className="flex items-center gap-1.5 font-display font-bold">
        <span className="h-3.5 w-1 rounded-full" style={{ background: colour(c.loser) }} />
        {code(c.loser)}
      </span>
      <span className="num text-xs text-danger">P{c.loserFrom}→P{c.loserTo}</span>
      <span className="ml-auto text-[11px] text-muted" title={c.basis}>
        {lap ? `Lap ${lap}` : ""}
        {pos && !pos.stale && sector ? ` · sector ${sector} (derived)` : " · location unknown"}
      </span>
    </li>
  );
}
