import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type jolpica, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { FIRST_OPENF1_YEAR } from "../components/SessionPicker";
import { ErrorState, Loading } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";
import { PageHead } from "./Teams";

const DAY = 86_400_000;

const sessionRank = (s: SessionInfo) => s.start;

/** Every past weekend of a season with links to each session's replay and results. */
export function Archive() {
  const demo = useSession((s) => s.server?.mode === "demo");
  const current = new Date().getUTCFullYear();
  const [season, setSeason] = useState(current);
  const nav = useNavigate();
  const load = useSession((s) => s.load);
  const seasons = useAsync(demo ? null : "seasons", () => api.seasons(), 24 * 3600_000);
  const schedule = useAsync(demo ? null : `schedule:${season}`, () => api.schedule(season));
  const sessions = useAsync(!demo && season >= FIRST_OPENF1_YEAR ? `sessions:${season}` : null, () => api.sessions(season));
  const now = Date.now();
  const rounds = useMemo(() => (schedule.data ?? []).filter((r) => (r.raceStart ?? Date.parse(r.raceDate)) < now).reverse(), [schedule.data, now]);
  const weekendOf = (r: jolpica.ScheduleRace) => (sessions.data ?? []).filter((s) => Math.abs(s.start - (r.raceStart ?? Date.parse(r.raceDate))) < 4 * DAY && s.provider === "openf1").sort((a, b) => sessionRank(a) - sessionRank(b));

  if (demo) return <div className="mx-auto max-w-[1100px]"><PageHead title="Past weekends" note="Past weekends come from the OpenF1 and Jolpica archives, which are not used in demo mode. Run the app with network access to browse every finished weekend." /></div>;
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <PageHead title="Past weekends" note="Every finished weekend: replay each practice, qualifying, sprint and race on the circuit map, or open the official results and the championship points before and after.">
        <select className="input" value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">
          {(seasons.data ?? Array.from({ length: current - 1949 }, (_, i) => current - i)).map((y) => <option key={y}>{y}</option>)}
        </select>
      </PageHead>
      {schedule.loading && !schedule.data && <Loading label="Loading the season" />}
      {schedule.error && <ErrorState message={schedule.error.message} onRetry={schedule.reload} />}
      {schedule.data && rounds.length === 0 && <p className="text-sm text-muted">No weekends have finished in {season} yet.</p>}
      <ul className="flex flex-col gap-3">
        {rounds.map((r) => {
          const weekend = weekendOf(r);
          const hasSprint = r.sessions.some((x) => x.kind === "Sprint");
          const link = (tab: string) => `/history?season=${r.season}&round=${r.round}&tab=${tab}`;
          return (
            <li key={r.round} className="panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-black uppercase italic"><span className="num mr-2 text-accent">R{r.round}</span>{r.name}</h2>
                <span className="text-xs text-muted">{r.circuit.name} · {r.raceDate}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="btn" to={link("race")}>Race result and points</Link>
                <Link className="btn" to={link("qualifying")}>Qualifying</Link>
                {hasSprint && <Link className="btn" to={link("sprint")}>Sprint</Link>}
                <Link className="btn" to={link("laps")}>Lap chart</Link>
              </div>
              {season >= FIRST_OPENF1_YEAR ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="label">Replay</span>
                  {sessions.loading && !sessions.data && <span className="text-xs text-muted">Finding sessions…</span>}
                  {weekend.map((s) => (
                    <button key={s.sessionKey} className={s.type === "Race" && !/sprint/i.test(s.name) ? "btn btn-accent" : "btn"} onClick={() => { void load(s.sessionKey); nav("/live"); }}>
                      <Icon name="play" size={13} filled /> {s.name}
                    </button>
                  ))}
                  {sessions.data && weekend.length === 0 && <span className="text-xs text-muted">No timing sessions are archived for this weekend.</span>}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">{season >= 1996 ? "Lap-by-lap replay is on the Lap chart view." : "Results only: no timing data was archived before 1996."} Practice sessions are not archived before 2023.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
