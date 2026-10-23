import { Link, useNavigate } from "react-router-dom";
import { formatAge, formatCountdown, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { FlagPill } from "../components/SessionHeader";
import { Leaderboard } from "../components/Leaderboard";
import { cx, Loading, Panel, QualityBadge, Unavailable } from "../components/ui";
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
          {showLive ? (
            <div className="-mx-4 -mb-4 mt-3 border-t hairline"><Leaderboard snap={snap} compact /></div>
          ) : (
            <button className="btn mt-3" onClick={() => void load(c.live!.sessionKey)}>Load this session</button>
          )}
        </Panel>
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
                {official.round && <Link className="btn" to={`/races/${c.last.year}/${official.round}`}>Race page</Link>}
              </div>
            </div>
          ) : (
            <Unavailable title="Nothing to show" reason="No finished session was found in the calendar." />
          )}
        </Panel>
      </div>

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
