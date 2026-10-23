import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { jolpica, type CircuitModel, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";
import { FIRST_OPENF1_YEAR } from "./SessionPicker";
import { cx, Loading, Unavailable } from "./ui";

/** OpenF1 sessions belonging to a Jolpica race weekend (matched by date). */
export function useWeekendSessions(race: jolpica.ScheduleRace | null) {
  const year = race?.season ?? 0;
  const sessions = useAsync(race && year >= FIRST_OPENF1_YEAR ? `sessions:${year}` : null, () => api.sessions(year));
  return useMemo(() => {
    if (!race || !sessions.data) return [];
    const raceDay = race.raceStart ?? Date.parse(race.raceDate);
    return sessions.data.filter((s) => Math.abs(s.start - raceDay) < 4 * 86400_000);
  }, [race, sessions.data]);
}

export function CircuitOutline({ circuit, className }: { circuit: CircuitModel; className?: string }) {
  const b = circuit.bounds;
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const pad = Math.max(w, h) * 0.06;
  const d = circuit.path.map(([x, y], i) => `${i ? "L" : "M"}${(x - b.minX).toFixed(0)},${(b.maxY - y).toFixed(0)}`).join("") + "Z";
  const sw = Math.max(w, h) / 70;
  return (
    <svg viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} className={className} role="img" aria-label="Circuit outline">
      <path d={d} fill="none" stroke="var(--track-edge)" strokeWidth={sw * 1.5} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--track)" strokeWidth={sw} strokeLinejoin="round" />
      {circuit.drsZones.map((z, i) => (
        <path
          key={i}
          d={circuit.path.slice(z.from, z.to + 1).map(([x, y], j) => `${j ? "L" : "M"}${(x - b.minX).toFixed(0)},${(b.maxY - y).toFixed(0)}`).join("")}
          fill="none"
          stroke="rgb(var(--ok))"
          strokeWidth={sw * 0.45}
        />
      ))}
      {circuit.pitLane && (
        <path d={circuit.pitLane.map(([x, y], j) => `${j ? "L" : "M"}${(x - b.minX).toFixed(0)},${(b.maxY - y).toFixed(0)}`).join("")} fill="none" stroke="rgb(var(--muted))" strokeWidth={sw * 0.25} strokeDasharray={`${sw} ${sw}`} />
      )}
      {circuit.startFinish && <circle cx={circuit.startFinish.x - b.minX} cy={b.maxY - circuit.startFinish.y} r={sw * 0.9} fill="rgb(var(--accent))" />}
      {circuit.sectorLines.map((m, i) => (
        <circle key={i} cx={m.x - b.minX} cy={b.maxY - m.y} r={sw * 0.6} fill="rgb(var(--warn))" />
      ))}
    </svg>
  );
}

export function CircuitInfo({ race }: { race: jolpica.ScheduleRace }) {
  const nav = useNavigate();
  const load = useSession((s) => s.load);
  const weekend = useWeekendSessions(race);
  const ref: SessionInfo | undefined = weekend.find((s) => s.type === "Race") ?? weekend[weekend.length - 1];
  const circuit = useAsync(ref ? `circuit:${ref.sessionKey}` : null, () => api.circuit(ref!.sessionKey), 60 * 60_000);
  const winners = useAsync(`winners:${race.circuit.id}`, () => api.circuitWinners(race.circuit.id), 60 * 60_000);
  const fastest = useAsync(`fastest:${race.circuit.id}`, () => api.circuitFastest(race.circuit.id), 60 * 60_000);

  const record = useMemo(() => {
    let best: { time: number; text: string; who: string; season: number } | null = null;
    for (const r of fastest.data ?? []) {
      const row = r.rows[0];
      const s = jolpica.lapTimeToSeconds(row?.fastestLap?.time);
      if (row && s !== null && (!best || s < best.time)) best = { time: s, text: row.fastestLap!.time!, who: `${row.driver.givenName} ${row.driver.familyName}`, season: r.race.season };
    }
    return best;
  }, [fastest.data]);
  const lastHeld = winners.data?.find((w) => w.race.season <= race.season && w.rows[0]?.laps);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <div className="aspect-square rounded-xl bg-surface p-3">
          {circuit.data ? (
            <CircuitOutline circuit={circuit.data.circuit} className="h-full w-full" />
          ) : circuit.loading ? (
            <Loading label="Tracing circuit" />
          ) : (
            <Unavailable title="Map unavailable" reason={race.season < FIRST_OPENF1_YEAR ? "Circuit maps are traced from OpenF1 position data, which starts in 2023." : circuit.error?.message ?? "No position data for this weekend yet."} />
          )}
        </div>
        {circuit.data && <p className="text-[10px] text-muted">{circuit.data.circuit.basis[0]} Red dot: start/finish. Yellow: sector boundaries. Green: DRS activation (derived).</p>}
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-display text-lg font-bold">{race.circuit.name}</div>
          <div className="text-muted">
            {race.circuit.locality}, {race.circuit.country}
            {race.circuit.lat !== null && race.circuit.long !== null && <span className="num text-xs"> · {race.circuit.lat.toFixed(3)}, {race.circuit.long.toFixed(3)}</span>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact k="Circuit length" v="—" note="Not published by the connected sources" />
          <Fact k="Laps" v={lastHeld ? String(lastHeld.rows[0].laps) : "—"} note={lastHeld ? `Completed by the winner in ${lastHeld.race.season} (historical)` : "Unknown"} />
          <Fact k="Race distance" v="—" note="Needs circuit length, which is not published" />
          <Fact
            k="Fastest race lap in archive"
            v={record ? record.text : fastest.loading ? "…" : "—"}
            note={record ? `${record.who}, ${record.season}. Race laps only, since 2004; layouts may have changed. Not the official lap record.` : "No archived fastest laps"}
          />
          <Fact k="Weather forecast" v="—" note="No forecast source is connected" />
          <Fact k="DRS zones" v={circuit.data ? String(circuit.data.circuit.drsZones.length || "—") : "—"} note={circuit.data?.circuit.drsZones.length ? "Where cars opened DRS (derived)" : race.season >= 2026 ? "No DRS from 2026" : "Not derivable"} />
        </dl>
        <div>
          <div className="label mb-1">Weekend schedule</div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {race.sessions.map((s) => {
              // Match the OpenF1 session that starts at the same time (within two hours).
              const of1 = s.start ? weekend.find((w) => Math.abs(w.start - s.start!) < 2 * 3600_000) : undefined;
              const done = (s.start ?? Date.parse(s.date)) < Date.now();
              return (
                <li key={s.kind} className="flex items-center justify-between gap-2 rounded-lg bg-raised/60 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">{s.kind}</span>
                  <span className="num text-muted">{s.start ? new Date(s.start).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : s.date}</span>
                  {of1 && done && (
                    <button
                      className="text-accent hover:underline"
                      onClick={() => {
                        void load(of1.sessionKey);
                        nav("/live");
                      }}
                    >
                      Open
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[10px] text-muted">Times in your time zone.</p>
        </div>
        <div>
          <div className="label mb-1">Previous winners here</div>
          {winners.loading && !winners.data && <Loading />}
          <ul className="flex flex-wrap gap-1.5">
            {winners.data?.slice(0, 12).map((w) => (
              <li key={w.race.season} className={cx("rounded-md bg-raised/60 px-2 py-1 text-xs", w.race.season === race.season && "ring-1 ring-accent/50")}>
                <span className="num text-muted">{w.race.season}</span> {w.rows[0]?.driver.familyName} <span className="text-faint">{w.rows[0]?.constructor.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="num text-base font-semibold">{v}</dd>
      <dd className="text-[10px] leading-tight text-muted">{note}</dd>
    </div>
  );
}
