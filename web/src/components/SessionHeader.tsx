import { useMemo, useState } from "react";
import { formatAge, formatClock, localTimeAt, tempTo, type Snapshot, type TrackStatus } from "@f1/shared";
import { useDisplayTime, useNow, useSnapshot } from "../hooks/live";
import { currentQuality, isLiveSession, useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";
import { SessionPicker } from "./SessionPicker";
import { cx, QualityBadge } from "./ui";

export type SessionStatusLabel = "LIVE" | "SCHEDULED" | "RED FLAG" | "FINISHED" | "SUSPENDED" | "—";

export function sessionStatusLabel(snap: Snapshot | null, start: number, end: number, now: number, live: boolean): SessionStatusLabel {
  if (!snap) return "—";
  if (snap.track.headline === "RED FLAG" && !snap.track.chequered) return "RED FLAG";
  if (snap.track.chequered || now > end) return "FINISHED";
  if (now < start) return "SCHEDULED";
  return live ? "LIVE" : "FINISHED";
}

export const FLAG_STYLE: Record<TrackStatus["headline"], string> = {
  "RED FLAG": "bg-danger text-white",
  "SAFETY CAR": "bg-warn text-black",
  VSC: "bg-warn text-black",
  "VSC ENDING": "bg-warn/70 text-black",
  "SC IN THIS LAP": "bg-warn/70 text-black",
  YELLOW: "bg-warn text-black",
  GREEN: "bg-ok text-black",
  CHEQUERED: "bg-fg text-bg",
  UNKNOWN: "bg-raised text-muted",
};

export function FlagPill({ track, className }: { track: TrackStatus; className?: string }) {
  const sectors = track.headline === "YELLOW" && track.yellowSectors.length ? ` S${track.yellowSectors.map((s) => s.sector).join(",")}` : "";
  return (
    <span
      className={cx("chip px-2 py-1 text-[11px]", FLAG_STYLE[track.headline], className)}
      title={track.since ? `Official race-control message: ${track.since.message}` : "No flag messages received yet"}
    >
      {track.headline === "CHEQUERED" && <span className="h-2.5 w-2.5 bg-[conic-gradient(#000_25%,#fff_0_50%,#000_0_75%,#fff_0)] bg-[length:5px_5px]" />}
      {track.headline === "UNKNOWN" ? "FLAG UNKNOWN" : track.headline}
      {sectors}
    </span>
  );
}

export function SessionHeader() {
  const timeline = useSession((s) => s.timeline);
  const phase = useSession((s) => s.phase);
  const server = useSession((s) => s.server);
  const serverError = useSession((s) => s.serverError);
  const streamOpen = useSession((s) => s.streamOpen);
  const lastLiveAt = useSession((s) => s.lastLiveAt);
  const units = useSettings((s) => s.units);
  const snap = useSnapshot(2);
  const t = useDisplayTime(2);
  const now = useNow(1000);
  const [pickerOpen, setPickerOpen] = useState(false);

  const session = timeline?.core.session;
  const meeting = timeline?.core.meeting;
  const live = !!session && isLiveSession(server, session.sessionKey);
  const quality = currentQuality(now);
  const firstLap = useMemo(() => timeline?.lapStartTime(1) ?? null, [timeline]);
  const status = session ? sessionStatusLabel(snap, session.start, session.end, now, live) : "—";
  const w = snap?.weather;

  return (
    <header className="border-b hairline bg-surface/70 px-3 py-2.5 backdrop-blur md:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button onClick={() => setPickerOpen(true)} className="group flex min-w-0 items-center gap-3 text-left" aria-haspopup="dialog">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-lg font-black uppercase tracking-wide md:text-xl">
                {meeting?.name ?? (phase === "loading" ? "Loading session…" : session ? session.location : "Select a session")}
              </span>
              <Icon name="chevronDown" size={16} className="text-muted group-hover:text-fg" />
            </div>
            <div className="truncate text-xs text-muted">
              {session ? `${session.name} · ${session.circuitShortName} · ${session.year}` : "Choose a Grand Prix and session"}
            </div>
          </div>
        </button>

        {session && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "chip px-2 py-1 text-[11px] ring-1",
                status === "LIVE" ? "bg-accent text-white ring-accent" : status === "RED FLAG" ? "bg-danger text-white ring-danger" : "bg-raised text-muted ring-line/10",
              )}
            >
              {status === "LIVE" && <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-white" />}
              {status}
            </span>
            {snap && <FlagPill track={snap.track} />}
            <QualityBadge quality={quality} />
          </div>
        )}

        {session && snap && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <HeaderStat label="Lap" value={snap.leaderLap !== null ? `${snap.leaderLap}${snap.totalLaps ? ` / ${snap.totalLaps}` : ""}` : "—"} title={snap.totalLaps ? "Total from the official classification" : "The scheduled lap count is not published by the data source"} />
            <HeaderStat label="Clock" value={firstLap && t >= firstLap ? formatClock(t - firstLap) : formatClock(t - session.start)} title={firstLap ? "Elapsed since the start of lap 1" : "Elapsed since the scheduled session start"} />
            <HeaderStat label="Local" value={localTimeAt(t, session.gmtOffset)} title={`Circuit time (UTC${session.gmtOffset})`} />
            {w ? (
              <>
                <HeaderStat label="Air" value={w.airTemp !== null ? `${tempTo(w.airTemp, units).toFixed(1)}°` : "—"} />
                <HeaderStat label="Track" value={w.trackTemp !== null ? `${tempTo(w.trackTemp, units).toFixed(1)}°` : "—"} />
                <HeaderStat label="Cond." value={w.rainfall === null ? "—" : w.rainfall ? "WET" : "DRY"} title="Rainfall indicator from the weather feed" />
              </>
            ) : (
              <HeaderStat label="Weather" value="—" title="No weather data for this moment" />
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          <ConnectionIndicator live={live} streamOpen={streamOpen} lastLiveAt={lastLiveAt} now={now} serverError={serverError} reason={server?.live.reason ?? null} />
        </div>
      </div>
      {pickerOpen && <SessionPicker onClose={() => setPickerOpen(false)} />}
    </header>
  );
}

function HeaderStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <span className="label">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}

function ConnectionIndicator({ live, streamOpen, lastLiveAt, now, serverError, reason }: { live: boolean; streamOpen: boolean; lastLiveAt: number | null; now: number; serverError: string | null; reason: string | null }) {
  if (serverError) {
    return (
      <span className="flex items-center gap-1.5 text-danger" title={serverError}>
        <Icon name="wifiOff" size={14} /> Server unreachable
      </span>
    );
  }
  if (!live) {
    return (
      <span className="flex items-center gap-1.5" title={reason ?? undefined}>
        <span className={cx("h-2 w-2 rounded-full", streamOpen ? "bg-faint" : "bg-danger")} />
        {reason && reason.includes("Sponsor") ? "Live data needs OpenF1 Sponsor access" : "No live session"}
      </span>
    );
  }
  const age = lastLiveAt ? now - lastLiveAt : null;
  const fresh = age !== null && age < 15_000;
  return (
    <span className="flex items-center gap-1.5" title={reason ?? undefined}>
      <span className={cx("h-2 w-2 rounded-full", streamOpen && fresh ? "animate-pulse2 bg-ok" : streamOpen ? "bg-warn" : "bg-danger")} />
      {streamOpen ? "Connected" : "Reconnecting"} · last update {age !== null ? formatAge(age) : "never"}
    </span>
  );
}
