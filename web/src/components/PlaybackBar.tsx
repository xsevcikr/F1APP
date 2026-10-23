import { useMemo, useRef } from "react";
import { classifyRaceControl, formatClock, neutralPeriods, PLAYBACK_SPEEDS, type PlaybackSpeed } from "@f1/shared";
import { useDisplayTime } from "../hooks/live";
import { isLiveSession, useSession } from "../store/session";
import { Icon } from "./Icon";
import { cx } from "./ui";

/** Replay transport: play/pause, speeds, draggable timeline, lap and event navigation, and a live-edge button. */
export function PlaybackBar() {
  const clock = useSession((s) => s.clock);
  const timeline = useSession((s) => s.timeline);
  const server = useSession((s) => s.server);
  const bump = useSession((s) => s.bump);
  const ensure = useSession((s) => s.ensureWindows);
  const t = useDisplayTime(8);
  const barRef = useRef<HTMLDivElement>(null);

  const markers = useMemo(() => {
    if (!timeline) return [];
    return timeline.raceControl
      .map((r) => ({ r, c: classifyRaceControl(r) }))
      .filter(({ c }) => ["safety-car", "vsc", "red", "chequered", "penalty", "yellow", "double-yellow", "incident", "car-stopped"].includes(c.kind));
  }, [timeline, timeline?.raceControl.length]);
  const periods = useMemo(() => (timeline ? neutralPeriods(timeline.raceControl) : []), [timeline, timeline?.raceControl.length]);
  const maxLap = useMemo(() => {
    if (!timeline) return 0;
    let m = 0;
    for (const d of timeline.drivers.keys()) m = Math.max(m, timeline.lapsOf(d).length);
    return m;
  }, [timeline, timeline?.version]);

  if (!clock || !timeline) return null;
  const st = clock.tick(Date.now());
  const live = isLiveSession(server, timeline.core.session.sessionKey);
  const start = clock.start, end = Math.max(clock.end, start + 1);
  const pct = (x: number) => `${(((x - start) / (end - start)) * 100).toFixed(3)}%`;
  const first = timeline.lapStartTime(1);
  const act = (fn: () => void) => {
    fn();
    bump();
    const s = clock.tick(Date.now());
    ensure(s.t, s.playing, s.speed);
  };

  const seekFromPointer = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    act(() => clock.seek(start + f * (end - start), Date.now()));
  };

  const currentLap = timeline.snapshotAt(t).leaderLap;

  return (
    <div className="panel flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn px-2" onClick={() => act(() => clock.jumpToMarker(markers.map((m) => m.r.ts), -1, Date.now()))} title="Previous event" aria-label="Previous event">
          <Icon name="prev" size={15} />
        </button>
        <button className="btn btn-accent px-3" onClick={() => act(() => clock.toggle(Date.now()))} aria-label={st.playing ? "Pause" : "Play"} title={st.playing ? "Pause (space)" : "Play (space)"}>
          <Icon name={st.playing ? "pause" : "play"} size={15} filled />
        </button>
        <button className="btn px-2" onClick={() => act(() => clock.jumpToMarker(markers.map((m) => m.r.ts), 1, Date.now()))} title="Next event" aria-label="Next event">
          <Icon name="next" size={15} />
        </button>
        <div className="inline-flex rounded-lg bg-raised p-0.5" role="radiogroup" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={st.speed === s}
              onClick={() => act(() => clock.setSpeed(s as PlaybackSpeed, Date.now()))}
              className={cx("num rounded-md px-2 py-0.5 text-[11px]", st.speed === s ? "bg-panel text-fg ring-1 ring-line/10" : "text-muted hover:text-fg")}
            >
              {s}×
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Lap
          <select
            className="input py-0.5 text-xs"
            value={currentLap ?? ""}
            onChange={(e) => {
              const ts = timeline.lapStartTime(Number(e.target.value));
              if (ts !== null) act(() => clock.seek(ts, Date.now()));
            }}
          >
            <option value="" disabled>
              —
            </option>
            {Array.from({ length: maxLap }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="num ml-auto text-xs text-muted">
          {first ? formatClock(t - first) : formatClock(t - start)} <span className="text-faint">/ {first ? formatClock(end - first) : formatClock(end - start)}</span>
        </div>
        {live && (
          <button className={cx("btn py-1 text-xs", st.followLive ? "text-accent ring-1 ring-accent/60" : "")} onClick={() => act(() => clock.goLive(Date.now()))} title="Jump to the live edge">
            <span className={cx("h-1.5 w-1.5 rounded-full", st.followLive ? "animate-pulse2 bg-accent" : "bg-faint")} />
            {st.followLive ? "LIVE" : "Go live"}
          </button>
        )}
      </div>

      <div
        ref={barRef}
        className="relative h-7 cursor-pointer select-none touch-none"
        role="slider"
        tabIndex={0}
        aria-label="Session timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round((end - start) / 1000)}
        aria-valuenow={Math.round((t - start) / 1000)}
        aria-valuetext={formatClock(t - start)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") act(() => clock.step(e.shiftKey ? 60_000 : 10_000, Date.now()));
          if (e.key === "ArrowLeft") act(() => clock.step(e.shiftKey ? -60_000 : -10_000, Date.now()));
          if (e.key === " ") {
            e.preventDefault();
            act(() => clock.toggle(Date.now()));
          }
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-raised" />
        {periods.map((p, i) => (
          <div
            key={i}
            className={cx("absolute top-1/2 h-1.5 -translate-y-1/2", p.kind === "red" ? "bg-danger/70" : "bg-warn/60")}
            style={{ left: pct(p.start), width: `calc(${pct(p.end ?? end)} - ${pct(p.start)})` }}
            title={`${p.kind === "vsc" ? "VSC" : p.kind === "red" ? "Red flag" : "Safety Car"}${p.startLap ? ` from lap ${p.startLap}` : ""}`}
          />
        ))}
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/70" style={{ width: pct(t) }} />
        {markers.map(({ r, c }) => (
          <div
            key={r.id}
            className={cx("absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded", c.severity === "danger" ? "bg-danger" : c.severity === "caution" ? "bg-warn" : "bg-muted")}
            style={{ left: pct(r.ts) }}
            title={`${c.title}: ${r.message}`}
          />
        ))}
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-panel shadow-glow" style={{ left: pct(t) }} />
      </div>
    </div>
  );
}
