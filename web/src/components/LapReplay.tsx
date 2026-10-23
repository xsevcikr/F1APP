// Simplified replay for races without archived car positions: the running
// order lap by lap, from the Jolpica lap-time archive. It says so on screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { PLAYBACK_SPEEDS, type jolpica } from "@f1/shared";
import { Icon } from "./Icon";
import { cx, Unavailable } from "./ui";

const ROW = 26;
const BASE_MS_PER_LAP = 1500;

export function LapReplay({ laps, results }: { laps: jolpica.LapPositionRow[]; results: jolpica.ClassificationRow[] }) {
  const [lap, setLap] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const max = laps.length;
  const raf = useRef(0);
  const acc = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      acc.current += (now - last) * speed;
      last = now;
      if (acc.current >= BASE_MS_PER_LAP) {
        acc.current = 0;
        setLap((l) => {
          if (l >= max) {
            setPlaying(false);
            return l;
          }
          return l + 1;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, max]);

  const byId = useMemo(() => new Map(results.map((r) => [r.driver.id, r])), [results]);
  const cur = laps.find((l) => l.lap === lap);
  const prev = laps.find((l) => l.lap === lap - 1);
  const drivers = results.map((r) => r.driver.id);
  // Running cars by position, then cars that no longer set lap times.
  const slot = useMemo(() => {
    const running = (cur?.timings ?? []).filter((x) => x.position !== null).sort((a, b) => a.position! - b.position!).map((x) => x.driverId);
    const stopped = drivers.filter((d) => !running.includes(d));
    return new Map([...running, ...stopped].map((d, i) => [d, i]));
  }, [cur, drivers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!max) return <Unavailable reason="The archive has no lap-by-lap positions for this race (they are recorded from 1996)." />;

  return (
    <div>
      <div className="mb-3 rounded-lg border border-info/30 bg-info/5 p-2.5 text-xs text-muted">
        Position-progression replay. No car positions were archived for this race, so this shows the official running order at the end of each lap, not cars on the circuit.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-accent px-3" onClick={() => (lap >= max ? (setLap(1), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={14} filled />
        </button>
        <div className="inline-flex rounded-lg bg-raised p-0.5">
          {PLAYBACK_SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={cx("num rounded-md px-2 py-0.5 text-[11px]", speed === s ? "bg-panel text-fg" : "text-muted")}>
              {s}×
            </button>
          ))}
        </div>
        <input type="range" min={1} max={max} value={lap} onChange={(e) => setLap(Number(e.target.value))} className="min-w-[160px] flex-1 accent-[rgb(var(--accent))]" aria-label="Lap" />
        <span className="num text-sm font-semibold">
          Lap {lap} / {max}
        </span>
      </div>
      <div className="relative" style={{ height: drivers.length * ROW }}>
        {drivers.map((id) => {
          const t = cur?.timings.find((x) => x.driverId === id);
          const p0 = prev?.timings.find((x) => x.driverId === id)?.position ?? null;
          const r = byId.get(id)!;
          const running = !!t;
          const pos = t?.position ?? null;
          const delta = p0 !== null && t?.position ? p0 - t.position : 0;
          return (
            <div key={id} className={cx("absolute inset-x-0 flex items-center gap-3 px-2 text-sm transition-transform duration-500", !running && "opacity-40")} style={{ transform: `translateY(${(slot.get(id) ?? 0) * ROW}px)`, height: ROW }}>
              <span className="num w-6 text-right font-display font-bold">{pos ?? "—"}</span>
              <span className={cx("num w-6 text-[10px]", delta > 0 ? "text-ok" : delta < 0 ? "text-danger" : "text-faint")}>{delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : ""}</span>
              <span className="w-40 truncate font-semibold">
                {r.driver.givenName[0]}. {r.driver.familyName}
              </span>
              <span className="hidden truncate text-xs text-muted sm:block">{r.constructor.name}</span>
              <span className="num ml-auto text-xs text-muted">{t?.time ?? (running ? "" : r.status)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
