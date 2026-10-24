import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatAge, formatCountdown, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { FlagPill } from "../components/SessionHeader";
import { DataStatus, type StatusTone } from "../components/DataStatus";
import { Leaderboard } from "../components/Leaderboard";
import { RaceHeader, StateBadge, sessionState } from "../components/RaceHeader";
import { TrackMap } from "../components/TrackMap";
import { Collapsible, cx, Loading, Panel, QualityBadge, Unavailable } from "../components/ui";
import { PRACTICE_MEETING, PRACTICE_READ_ON, PRACTICE_SESSIONS, PRACTICE_SOURCE } from "../data/practiceSnapshot";
import { useRaceCentre } from "../data/raceCentre";
import { useAsync } from "../hooks/useAsync";
import { useSnapshot } from "../hooks/live";
import { currentQuality, useSession } from "../store/session";
import { PageHead } from "./Teams";

const local = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function circuitTime(ms: number, offset: string) {
  const sign = offset.startsWith("-") ? -1 : 1;
  const mins = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  return new Date(ms + mins * 60_000).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function SessionLine({ s }: { s: SessionInfo }) {
  return (
    <div>
      <div className="font-display text-lg font-bold uppercase">{s.name}</div>
      <div className="num text-xs text-muted" title={`${circuitTime(s.start, s.gmtOffset)} track time`}>{local(s.start)}</div>
    </div>
  );
}

/** Whether the archive has an official classification for this session's race. */
function useOfficialResult(s: SessionInfo | null) {
  const year = s?.year ?? 0;
  const schedule = useAsync(s ? `schedule:${year}` : null, () => api.schedule(year), 60 * 60_000);
  const round = schedule.data?.find((r) => Math.abs((r.raceStart ?? Date.parse(r.raceDate)) - (s?.start ?? 0)) < 4 * 86_400_000)?.round ?? null;
  const isRace = s?.type === "Race" && !/sprint/i.test(s.name);
  const result = useAsync(isRace && round ? `race:${year}:${round}` : null, () => api.results(year, round!), 10 * 60_000);
  return { round, isRace, result: result.data ?? null, loading: schedule.loading || result.loading, error: result.error };
}

/** Free-tier mode: the app asks OpenF1 once a minute and loads the session as soon as it is released. */
function DelayedPanel({ now }: { now: number }) {
  const server = useSession((st) => st.server);
  const loaded = useSession((st) => st.timeline?.core.session.sessionKey);
  const phase = useSession((st) => st.phase);
  const load = useSession((st) => st.load);
  const nav = useNavigate();
  const w = server?.live.delayed ?? null;
  const key = w?.state === "released" ? w.sessionKey : null;
  // Open the released session once, unless the person is already looking at something.
  const opened = useRef<number | null>(null);
  useEffect(() => {
    if (key !== null && phase === "idle" && opened.current !== key) { opened.current = key; void load(key); }
  }, [key, phase, load]);
  if (!w) return null;
  const released = w.state === "released";
  return (
    <Panel title={released ? "Delayed data is ready" : "Waiting for OpenF1 to release this session"} right={<QualityBadge quality="DELAYED" />}>
      <p className="text-sm text-muted">
        {released
          ? `OpenF1 started serving this session at ${new Date(w.releasedAt!).toLocaleTimeString()}${w.releasedEarly ? ", before the end of its 30-minute live window" : ""}. What you see is archived data, not live: it is behind the real session and was last updated when it was fetched.`
          : "Without Sponsor credentials OpenF1 serves a session only after it releases it. The app asks once a minute (inside the free limits of 3 per second and 30 per minute) and opens the session here when it arrives."}
      </p>
      <p className="mt-1 text-[11px] text-muted">
        Last asked OpenF1: {w.checkedAt ? formatAge(now - w.checkedAt) : "not yet"}{w.lastReply && !released ? ` · ${w.lastReply}` : ""}
      </p>
      {released && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-accent" onClick={() => { void load(w.sessionKey); nav("/live-standings"); }}>Open in Live Standings</button>
          <button className="btn" onClick={() => { void load(w.sessionKey); nav("/live"); }}>Circuit map replay</button>
          {loaded === w.sessionKey && <span className="chip bg-raised text-fg">LOADED</span>}
        </div>
      )}
    </Panel>
  );
}

/** Results of finished practice sessions, copied from OpenF1 on a stated date. Shown as historical, never as live data. */
function PracticeResults() {
  return (
    <Collapsible title={`${PRACTICE_MEETING}: practice results`} right={<span className="rounded-full bg-fg/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Historical</span>}>
      <p className="mb-3 text-[11px] text-muted" role="note">Research snapshot read on {PRACTICE_READ_ON}. {PRACTICE_SOURCE} Best lap and gap per driver; later sessions appear once they are read.</p>
      <div className="grid gap-5 md:grid-cols-2">
        {PRACTICE_SESSIONS.map((s) => (
          <div key={s.sessionKey}>
            <div className="label mb-1">{s.name} · {new Date(s.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <ol className="text-sm">
              {s.rows.map((r) => (
                <li key={r.number} className={cx("flex items-center gap-2 border-b border-line/5 py-1.5 last:border-0", r.pos === 1 && "font-semibold")}>
                  <span className="num w-5 text-right font-display font-bold">{r.pos}</span>
                  <span className="num w-9 text-xs">{r.acronym}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">{r.team}</span>
                  <span className="flex-1 sm:hidden" />
                  <span className="num text-xs">{r.best}</span>
                  <span className="num w-14 text-right text-[11px] text-muted">{r.gap}</span>
                  <span className="num w-6 text-right text-[11px] text-faint" title="Laps run">{r.laps}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

export function RaceCentre() {
  const c = useRaceCentre();
  const server = useSession((s) => s.server);
  const serverError = useSession((s) => s.serverError);
  const loadedKey = useSession((s) => s.timeline?.core.session.sessionKey ?? null);
  const load = useSession((s) => s.load);
  const nav = useNavigate();
  const snap = useSnapshot(2);
  const year = new Date(c.now).getUTCFullYear();
  const list = useAsync(`sessions:${year}`, () => api.sessions(year), 60_000);
  const [pick, setPick] = useState<number | null>(null);

  // The session shown: the one chosen, the live one, the loaded one, else whatever is closest in time.
  const focus = useMemo<SessionInfo | null>(() => {
    const byKey = (k: number | null) => (k === null ? null : c.sessions.find((s) => s.sessionKey === k) ?? null);
    const soon = c.next && c.next.start - c.now < 36 * 3_600_000 ? c.next : null;
    return byKey(pick) ?? c.live ?? byKey(loadedKey) ?? soon ?? c.last ?? c.next;
  }, [pick, c.live, c.sessions, c.next, c.last, c.now, loadedKey]);
  const weekend = useMemo(() => (focus ? c.sessions.filter((s) => s.meetingKey === focus.meetingKey) : []), [focus, c.sessions]);
  const official = useOfficialResult(focus && sessionState(focus, c.now, false) !== "UPCOMING" ? focus : null);

  const feedConnected = !!focus && !!server?.live.connected && server.live.session?.sessionKey === focus.sessionKey;
  const delayed = server?.live.delayed ?? null;
  const openf1 = server?.providers.find((p) => p.id === "openf1");
  const tone: StatusTone = feedConnected ? "active" : serverError ? "error" : delayed ? "delayed" : "historical";
  const label = feedConnected ? "Live feed" : serverError ? "Server unreachable" : delayed ? (delayed.state === "released" ? "Delayed data ready" : "Waiting for data") : c.basis === "snapshot" ? "Calendar snapshot" : "Archive";
  const source = feedConnected ? "OpenF1 live" : delayed ? "OpenF1 free tier, delayed" : "OpenF1 schedule · Jolpica results";
  const updatedAt = server?.live.lastMessageAt ?? delayed?.checkedAt ?? (server ? server.now : null);
  const showArena = loadedKey !== null && !!snap && focus?.sessionKey === loadedKey;

  return (
    <div className="stagger mx-auto flex max-w-[1200px] flex-col gap-4">
      {serverError && <Unavailable title="App server unreachable" reason={`${serverError} Live status and schedules need the server.`} />}
      {c.loading && !focus && <Loading label="Finding the current session" />}

      {focus ? (
        <RaceHeader session={focus} weekend={weekend} now={c.now} feedConnected={feedConnected} onPick={setPick} onLoad={(k) => void load(k)} />
      ) : (
        !c.loading && <Unavailable title="No session found" reason={c.error ?? "The session calendar could not be reached."} />
      )}

      <DataStatus tone={tone} label={label} source={source} updatedAt={updatedAt} now={c.now} onRefresh={list.reload} refreshing={list.loading}>
        <ul className="list-disc space-y-1 pl-4">
          <li>{server?.live.reason ?? "No session is inside its live window."}</li>
          <li>Nothing here is shown as live unless the server is receiving that session. A refresh reloads the schedule; it does not make data live.</li>
          {!openf1?.authenticated && <li>Without OpenF1 Sponsor credentials a session appears after OpenF1 releases it, about 30 minutes after it ends, and is marked delayed.</li>}
          <li>Schedule: OpenF1{c.basis === "snapshot" ? " (the feed was unreachable, so a dated calendar snapshot is shown)" : ""}. Official results: Jolpica F1. Last server contact: {server ? formatAge(c.now - server.now) : "never"}.</li>
          {openf1?.lastError && <li className="text-warn">OpenF1: {openf1.lastError}</li>}
        </ul>
      </DataStatus>

      {delayed && <DelayedPanel now={c.now} />}

      {showArena && focus && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="panel overflow-hidden p-2">
            <TrackMap compact className="h-[320px] sm:h-[400px] lg:h-[460px]" />
          </section>
          <section className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">Running order</h2>
              <div className="flex gap-1.5">
                <Link className="btn text-xs" to="/live-standings">Full standings</Link>
                <Link className="btn text-xs" to="/live">Map</Link>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto"><Leaderboard snap={snap} compact /></div>
          </section>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {!c.next && (
          <Panel title="Next session">
            <Unavailable title="No upcoming session found" reason={c.basis === "none" ? "The session calendar could not be reached." : "No further sessions are listed for this season yet."} />
          </Panel>
        )}
        <Panel title="Most recent session" right={c.last && official.isRace ? <span className={cx("chip", official.result ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn")}>{official.result ? "Official" : "Provisional"}</span> : undefined}>
          {c.last ? (
            <div className="flex flex-col gap-2">
              <SessionLine s={c.last} />
              <p className="text-xs text-muted">Ended {formatAge(c.now - c.last.end)}.</p>
              {official.result && (
                <ol className="num text-sm">
                  {official.result.rows.slice(0, 3).map((r) => (
                    <li key={r.driver.id}>{r.positionText}. {r.driver.givenName} {r.driver.familyName} <span className="text-muted">{r.constructor.name}</span></li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => { void load(c.last!.sessionKey); nav("/live-standings"); }}>Standings</button>
                <button className="btn" onClick={() => { void load(c.last!.sessionKey); nav("/live"); }}><Icon name="play" size={13} filled /> Replay on map</button>
                {official.round && <Link className="btn" to={`/races/${c.last.year}/${official.round}`}>Race page</Link>}
              </div>
            </div>
          ) : (
            <Unavailable title="Nothing to show" reason="No finished session was found in the calendar." />
          )}
        </Panel>
      </div>

      <PracticeResults />

      <nav aria-label="More" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["/races", "Historical races", "history"], ["/recaps", "Race recaps", "play"], ["/championship", "Championship", "trophy"], ["/calendar", "Calendar", "calendar"]].map(([to, text, icon]) => (
          <Link key={to} to={to} className="flex items-center gap-2.5 rounded-xl bg-fg/[0.04] px-3 py-3 text-sm text-muted ring-1 ring-line/10 transition-colors hover:bg-fg/[0.08] hover:text-fg">
            <Icon name={icon} size={17} className="text-accent" /> {text}
          </Link>
        ))}
      </nav>
    </div>
  );
}
