import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatAge, formatCountdown, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { FlagPill } from "../components/SessionHeader";
import { Leaderboard } from "../components/Leaderboard";
import { cx, Loading, Panel, QualityBadge, Unavailable } from "../components/ui";
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
      <div className="font-display text-xl font-bold uppercase italic">{s.location} · {s.name}</div>
      <div className="num text-xs text-muted">{local(s.start)} your time · {circuitTime(s.start, s.gmtOffset)} track time</div>
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

/** Results of finished practice sessions, copied from OpenF1 on a stated date. Shown beside the live panel, never as live data. */
function PracticeResults() {
  return (
    <Panel title={`${PRACTICE_MEETING}: practice results`} right={<span className="chip bg-info/15 text-info ring-1 ring-info/40">HISTORICAL</span>}>
      <p className="mb-3 text-[11px] text-muted" role="note">Research snapshot read on {PRACTICE_READ_ON}. {PRACTICE_SOURCE} Best lap and gap per driver; later sessions appear once they are read.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {PRACTICE_SESSIONS.map((s) => (
          <div key={s.sessionKey}>
            <div className="label mb-1">{s.name} · {new Date(s.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <ol className="divide-hairline text-sm">
              {s.rows.map((r) => (
                <li key={r.number} className="flex items-center gap-2 py-1">
                  <span className="num w-5 text-right font-display font-bold">{r.pos}</span>
                  <span className="num w-9 text-xs text-muted">{r.acronym}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{r.team}</span>
                  <span className="num text-xs">{r.best}</span>
                  <span className="num w-14 text-right text-[11px] text-muted">{r.gap}</span>
                  <span className="num w-7 text-right text-[11px] text-faint" title="Laps run">{r.laps}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RaceCentre() {
  const c = useRaceCentre();
  const server = useSession((s) => s.server);
  const serverError = useSession((s) => s.serverError);
  const snap = useSnapshot(2);
  const loaded = useSession((s) => s.timeline?.core.session.sessionKey);
  const load = useSession((s) => s.load);
  const nav = useNavigate();
  const quality = currentQuality(c.now);
  const official = useOfficialResult(c.last);

  const showLive = c.live && loaded === c.live.sessionKey;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <PageHead title="Race Centre" note="The session running now, or the next event and the most recent result. Session times come from the OpenF1 calendar; nothing here is shown as live unless the server is receiving that session." />
      {serverError && <Unavailable title="App server unreachable" reason={`${serverError} Live status and schedules need the server.`} />}
      {c.loading && <Loading label="Finding the current session" />}

      {c.live ? (
        <Panel title={c.running ? "Session in progress" : "Live window"} right={<QualityBadge quality={quality} />}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SessionLine s={c.live} />
            <div className="flex flex-wrap items-center gap-2">
              {snap && showLive && <FlagPill track={snap.track} />}
              {snap?.leaderLap && <span className="chip bg-raised text-fg">LAP {snap.leaderLap}{snap.totalLaps ? `/${snap.totalLaps}` : ""}</span>}
              <Link className="btn btn-accent" to="/live-standings">Live Standings</Link>
              <Link className="btn" to="/live">Circuit map</Link>
            </div>
          </div>
          {!c.running && <p className="mt-2 text-xs text-muted">The session is outside its scheduled hours but inside the feed's live window (30 minutes either side).</p>}
          {server?.live.reason && <p className="mt-2 text-xs text-warn">{server.live.reason}</p>}
          {server?.live.delayed && <div className="mt-3"><DelayedPanel now={c.now} /></div>}
          {showLive ? (
            <div className="-mx-4 -mb-4 mt-3 border-t hairline"><Leaderboard snap={snap} compact /></div>
          ) : (
            <button className="btn mt-3" onClick={() => void load(c.live!.sessionKey)}>Load this session</button>
          )}
        </Panel>
      ) : server?.live.delayed ? (
        <DelayedPanel now={c.now} />
      ) : (
        <Panel title="No session is live right now">
          <p className="text-sm text-muted">
            {server?.live.reason ?? "No session is inside its live window."} Live timing is not shown, and nothing on this page is simulated.
            {server && !server.providers.find((p) => p.id === "openf1")?.authenticated && " Live timing also needs OpenF1 Sponsor credentials on the server; without them a session appears only after it ends."}
          </p>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Next session">
          {c.next ? (
            <div className="flex flex-col gap-2">
              <SessionLine s={c.next} />
              <div className="num font-display text-3xl font-black italic text-accent">{formatCountdown(c.next.start - c.now)}</div>
              <p className="text-[11px] text-muted">{c.basis === "snapshot" ? "From a calendar snapshot dated 23 Oct 2026, because the sessions feed could not be reached. Schedule changes are not reflected." : "From the OpenF1 session calendar. Cancelled sessions are left out."}</p>
            </div>
          ) : (
            <Unavailable title="No upcoming session found" reason={c.basis === "none" ? "The session calendar could not be reached." : "No further sessions are listed for this season yet."} />
          )}
        </Panel>
        <Panel title="Most recent session" right={c.last && official.isRace ? <span className={cx("chip", official.result ? "bg-ok/15 text-ok" : "bg-warn/20 text-warn")}>{official.result ? "OFFICIAL CLASSIFICATION" : "PROVISIONAL"}</span> : undefined}>
          {c.last ? (
            <div className="flex flex-col gap-2">
              <SessionLine s={c.last} />
              <p className="text-xs text-muted">Ended {formatAge(c.now - c.last.end)}.{official.isRace ? (official.result ? " The results archive has the official classification." : " The results archive has not published the classification yet, so any order seen from timing is provisional.") : " Practice and qualifying results are viewed in the replay."}</p>
              {official.result && (
                <ol className="num text-sm">
                  {official.result.rows.slice(0, 3).map((r) => (
                    <li key={r.driver.id}>{r.positionText}. {r.driver.givenName} {r.driver.familyName} <span className="text-muted">{r.constructor.name}</span></li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => { void load(c.last!.sessionKey); nav("/live-standings"); }}>Open in Live Standings</button>
                <button className="btn" onClick={() => { void load(c.last!.sessionKey); nav("/live"); }}><Icon name="play" size={13} filled /> Replay on the map</button>
                {official.round && <Link className="btn" to={`/races/${c.last.year}/${official.round}`}>Race page</Link>}
              </div>
            </div>
          ) : (
            <Unavailable title="Nothing to show" reason="No finished session was found in the calendar." />
          )}
        </Panel>
      </div>

      <PracticeResults />

      <div className="flex flex-wrap gap-2">
        <Link className="btn" to="/races">Historical races</Link>
        <Link className="btn" to="/recaps">Race recaps</Link>
        <Link className="btn" to="/championship">Championship standings</Link>
        <Link className="btn" to="/calendar">Calendar</Link>
      </div>
      <p className="text-[11px] text-muted">
        Sources: OpenF1 (sessions and timing), Jolpica F1 (results archive). Last server contact: {server ? formatAge(c.now - server.now) : "never"}.
      </p>
    </div>
  );
}
