import { useMemo } from "react";
import { classifyRaceControl, formatClock, localTimeAt, neutralPeriods, stewardMatters } from "@f1/shared";
import { FlagPill } from "../components/SessionHeader";
import { PlaybackBar } from "../components/PlaybackBar";
import { RaceControlFeed } from "../components/RaceControlFeed";
import { SessionGate } from "../components/SessionGate";
import { Panel, Stat } from "../components/ui";
import { useSnapshot } from "../hooks/live";
import { sourceLabel, useSession } from "../store/session";

export function RaceControlPage() {
  return (
    <SessionGate>
      <Inner />
    </SessionGate>
  );
}

function Inner() {
  const snap = useSnapshot(2);
  const timeline = useSession((s) => s.timeline)!;
  const version = useSession((s) => s.version);
  const t = snap?.t ?? 0;
  const periods = useMemo(() => neutralPeriods(timeline.raceControl).filter((p) => p.start <= t), [timeline, version, t]);
  const counts = useMemo(() => {
    const c = { penalty: 0, investigation: 0, "track-limits": 0, yellow: 0 };
    for (const r of timeline.raceControl) {
      if (r.ts > t) break;
      const k = classifyRaceControl(r).kind;
      if (k === "double-yellow") c.yellow++;
      else if (k in c) c[k as keyof typeof c]++;
    }
    return c;
  }, [timeline, version, t]);
  const matters = useMemo(() => stewardMatters(timeline.raceControl, t), [timeline, version, t]);
  const offset = timeline.core.session.gmtOffset;
  const first = timeline.lapStartTime(1) ?? timeline.core.session.start;

  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Race control messages" subtitle={`Sourced from the official race-control feed via ${sourceLabel()}. Explanations are general guidance.`} bodyClass="p-0 flex flex-col max-h-[calc(100vh-240px)] min-h-[400px]">
          <RaceControlFeed t={t} />
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Current status">
            {snap && (
              <div className="space-y-3">
                <FlagPill track={snap.track} className="text-sm" />
                {snap.track.since && <p className="text-xs text-muted">Since {localTimeAt(snap.track.since.ts, offset)} · “{snap.track.since.message}”</p>}
                {snap.track.yellowSectors.length > 0 && (
                  <div className="text-xs">
                    <span className="label">Local cautions</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {snap.track.yellowSectors.map((s) => (
                        <span key={s.sector} className="chip bg-warn text-black">
                          {s.double ? "DOUBLE " : ""}YELLOW S{s.sector}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted">Sector numbers are race control's marshalling sectors, not timing sectors.</p>
                  </div>
                )}
                <div className="text-xs text-muted">DRS: {snap.track.drsEnabled === null ? "no DRS message seen" : snap.track.drsEnabled ? "enabled by race control" : "disabled by race control"}</div>
              </div>
            )}
          </Panel>
          <Panel title="Neutralizations">
            {periods.length === 0 ? (
              <p className="text-sm text-muted">No Safety Car, VSC or red flag so far.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {periods.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className={p.kind === "red" ? "chip bg-danger text-white" : "chip bg-warn text-black"}>{p.kind === "safety-car" ? "SAFETY CAR" : p.kind === "vsc" ? "VSC" : "RED FLAG"}</span>
                    <span className="num text-xs text-muted">
                      {p.startLap ? `Lap ${p.startLap} · ` : ""}
                      {formatClock(p.start - first)} → {p.end && p.end <= t ? formatClock(p.end - first) : "ongoing"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Stewards' matters" subtitle="Status follows the latest official message on each matter">
            {matters.length === 0 ? (
              <p className="text-sm text-muted">No stewarding messages so far.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {[...matters].reverse().map((m) => (
                  <li key={m.id} className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="chip bg-raised text-fg">{m.status}</span>
                      {m.penalty && <span className="chip bg-warn/25 text-warn">{m.penalty}</span>}
                      {m.drivers.map((d) => (
                        <span key={d} className="chip bg-raised text-fg">{timeline.drivers.get(d)?.code ?? `#${d}`}</span>
                      ))}
                      {m.location && <span className="text-[11px] text-muted">{m.location}</span>}
                    </div>
                    <p className="text-[12px] text-fg/90">{m.reason || m.messages[m.messages.length - 1].message}</p>
                    <p className="text-[10px] text-faint">Updated {localTimeAt(m.updated, offset)} · {m.messages.length} official message{m.messages.length === 1 ? "" : "s"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Stewarding so far">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Penalties" value={counts.penalty} />
              <Stat label="Investigations" value={counts.investigation} />
              <Stat label="Track limits" value={counts["track-limits"]} />
              <Stat label="Yellow flags" value={counts.yellow} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
