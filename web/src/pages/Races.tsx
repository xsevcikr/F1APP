import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type jolpica, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { FIRST_OPENF1_YEAR } from "../components/SessionPicker";
import { ErrorState, Loading, RefreshButton } from "../components/ui";
import { SnapshotNote, SnapshotRaces } from "../components/SnapshotView";
import { SNAPSHOT_SEASONS, snapshotSeason } from "../data/historySnapshot";
import { recapsFor } from "../data/recaps";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";
import { PageHead } from "./Teams";

const DAY = 86_400_000;
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.trim().toLowerCase());

/** Every Grand Prix of a season, searchable by driver, team, circuit or name. */
export function Races() {
  const current = new Date().getUTCFullYear();
  const [season, setSeason] = useState(current);
  const [who, setWho] = useState("");
  const [where, setWhere] = useState("");
  const nav = useNavigate();
  const load = useSession((s) => s.load);
  const seasons = useAsync("seasons", () => api.seasons(), 24 * 3600_000);
  const schedule = useAsync(`schedule:${season}`, () => api.schedule(season));
  const results = useAsync(`seasonResults:${season}`, () => api.seasonResults(season), 30 * 60_000);
  const sessions = useAsync(season >= FIRST_OPENF1_YEAR ? `sessions:${season}` : null, () => api.sessions(season));
  const [shown, setShown] = useState(12);
  const now = Date.now();
  // The archive is unreachable: fall back to the researched copy, but only for seasons it covers.
  const snap = schedule.error ? snapshotSeason(season) : null;

  const winners = useMemo(() => new Map((results.data ?? []).map((r) => [r.race.round, r] as const)), [results.data]);
  const rounds = useMemo(() => {
    const list = (schedule.data ?? []).filter((r) => (!where || has(`${r.name} ${r.circuit.name} ${r.circuit.locality ?? ""} ${r.circuit.country ?? ""}`, where)) && (!who || (winners.get(r.round)?.rows ?? []).some((x) => has(`${x.driver.givenName} ${x.driver.familyName} ${x.constructor.name}`, who))));
    return list.slice().reverse();
  }, [schedule.data, where, who, winners]);
  const weekendOf = (r: jolpica.ScheduleRace): SessionInfo[] => (sessions.data ?? []).filter((s) => s.provider === "openf1" && !s.cancelled && Math.abs(s.start - (r.raceStart ?? Date.parse(r.raceDate))) < 4 * DAY).sort((a, b) => a.start - b.start);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <PageHead title="Historical races" note="Every Grand Prix in the results archive, newest first. Open a race for its classification, qualifying, grid, pit stops, steward decisions and recap links.">
        <div className="flex flex-wrap gap-2">
          <select className="input" value={season} onChange={(e) => { setSeason(Number(e.target.value)); setShown(12); }} aria-label="Season">
            {(snap || (schedule.error && !seasons.data) ? SNAPSHOT_SEASONS : seasons.data ?? Array.from({ length: current - 1949 }, (_, i) => current - i)).map((y) => <option key={y}>{y}</option>)}
          </select>
          <input className="input w-44" placeholder="Driver or team" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Search by driver or team" />
          <RefreshButton reloads={[schedule.reload, results.reload]} loading={schedule.loading || results.loading} />
          <input className="input w-44" placeholder="Circuit or Grand Prix" value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Filter by circuit or Grand Prix name" />
        </div>
      </PageHead>
      {schedule.loading && !schedule.data && <Loading label="Loading the season" />}
      {snap && <SnapshotNote />}
      {snap && <SnapshotRaces season={season} data={snap} who={who} where={where} />}
      {schedule.error && !snap && <ErrorState message={schedule.error.message} onRetry={schedule.reload} />}
      {who && results.loading && <p className="text-xs text-muted">Searching results…</p>}
      {who && results.error && <p className="text-xs text-warn">Driver and team search needs the results archive: {results.error.message}</p>}
      {schedule.data && rounds.length === 0 && <p className="text-sm text-muted">No Grand Prix in {season} matches.</p>}
      <ul className="flex flex-col gap-3">
        {!snap && rounds.slice(0, shown).map((r) => {
          const held = (r.raceStart ?? Date.parse(r.raceDate)) < now;
          const win = winners.get(r.round)?.rows[0];
          const weekend = weekendOf(r);
          const hasRecap = recapsFor(r.season, r.name).length > 0;
          return (
            <li key={r.round} className="panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-black uppercase italic">
                  <Link to={`/races/${r.season}/${r.round}`} className="hover:underline"><span className="num mr-2 text-accent">R{r.round}</span>{r.name}</Link>
                </h2>
                <span className="text-xs text-muted">{r.circuit.name} · {r.raceDate}</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                {held ? (win ? <>Winner: <span className="font-semibold text-fg">{win.driver.givenName} {win.driver.familyName}</span> · {win.constructor.name}</> : results.loading ? "Loading result…" : "Result not published yet") : "Upcoming"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {held && <Link className="btn btn-accent" to={`/races/${r.season}/${r.round}`}>Race page</Link>}
                {held && r.sessions.some((x) => x.kind === "Sprint") && <Link className="btn" to={`/races/${r.season}/${r.round}?tab=sprint`}>Sprint</Link>}
                {held && <Link className="btn" to={`/races/${r.season}/${r.round}?tab=qualifying`}>Qualifying</Link>}
                {hasRecap && <Link className="btn" to={`/races/${r.season}/${r.round}#recap`}>Recap</Link>}
              </div>
              {held && season >= FIRST_OPENF1_YEAR && weekend.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="label">Replay</span>
                  {weekend.map((s) => (
                    <button key={s.sessionKey} className="btn" onClick={() => { void load(s.sessionKey); nav("/live-standings"); }}>
                      <Icon name="play" size={13} filled /> {s.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!snap && rounds.length > shown && (
        <button className="btn mx-auto" onClick={() => setShown((n) => n + 12)}>Show more ({rounds.length - shown} remaining)</button>
      )}
    </div>
  );
}
