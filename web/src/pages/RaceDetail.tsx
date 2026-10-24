import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { RaceRecaps } from "../components/Recaps";
import { PodiumList, SnapshotNote } from "../components/SnapshotView";
import { snapshotRace } from "../data/historySnapshot";
import { ErrorState, Loading, Panel, RefreshButton, Unavailable } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { RaceTabs, type Tab } from "./History";

/** One Grand Prix: header, recap links and every session result the archive has. */
export function RaceDetail() {
  const { season: s, round: r } = useParams();
  const season = Number(s), round = Number(r);
  const [params] = useSearchParams();
  const schedule = useAsync(Number.isInteger(season) ? `schedule:${season}` : null, () => api.schedule(season));
  const race = schedule.data?.find((x) => x.round === round) ?? null;
  const result = useAsync(race ? `race:${season}:${round}` : null, () => api.results(season, round));
  const held = race ? (race.raceStart ?? Date.parse(race.raceDate)) < Date.now() : false;

  if (!Number.isInteger(season) || !Number.isInteger(round)) return <Panel title="Race not found"><Link to="/races" className="btn">Historical races</Link></Panel>;
  if (schedule.loading && !schedule.data) return <Loading label="Loading the race" />;
  const snap = schedule.error ? snapshotRace(season, round) : null;
  if (snap) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col gap-4">
        <Link to="/races" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><Icon name="back" size={14} /> Historical races</Link>
        <section className="panel p-5">
          <div className="label">{season} · Round {round}</div>
          <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">{snap.name}</h1>
          <p className="text-sm text-muted">{snap.date}</p>
          <div className="mt-4"><div className="label mb-1">Podium</div><PodiumList race={snap} /></div>
          <p className="mt-3 text-xs text-muted">The full classification, qualifying, grid, pit stops and fastest laps need the results archive and are not in the snapshot.</p>
          <SnapshotNote className="mt-3" />
          <button className="btn mt-3" onClick={schedule.reload}>Try the archive again</button>
        </section>
        <div id="recap"><RaceRecaps season={season} grandPrix={snap.name} hasSprint={false} /></div>
      </div>
    );
  }
  if (schedule.error) return <ErrorState message={schedule.error.message} onRetry={schedule.reload} />;
  if (!race) return <Panel title="Race not found"><p className="text-sm text-muted">There is no round {round} in the {season} archive.</p><Link to="/races" className="btn mt-3 inline-flex">Historical races</Link></Panel>;

  const rows = result.data?.rows ?? [];
  const fastest = rows.find((x) => x.fastestLap?.rank === 1);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <Link to="/races" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><Icon name="back" size={14} /> Historical races</Link>
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label">{season} · Round {round}</div>
            <h1 className="font-display text-3xl font-black uppercase sm:text-4xl">{race.name}</h1>
            <p className="text-sm text-muted">{race.circuit.name} · {race.circuit.locality}, {race.circuit.country} · {race.raceDate}</p>
          </div>
          <RefreshButton reloads={[schedule.reload, result.reload]} loading={schedule.loading || result.loading} />
          <span className={rows.length ? "chip bg-ok/15 text-ok" : "chip bg-warn/20 text-warn"} title="Status of the classification in the results archive">
            {!held ? "NOT YET RACED" : rows.length ? "OFFICIAL RESULT IN ARCHIVE" : "RESULT NOT PUBLISHED YET"}
          </span>
        </div>
        {held && race.season >= 2023 && <Link className="btn btn-accent mt-4 inline-flex" to="?tab=replay"><Icon name="play" size={13} filled /> Replay on the circuit map</Link>}
        {rows.length > 0 && (
          <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="label">Winner</dt><dd>{rows[0].driver.givenName} {rows[0].driver.familyName} <span className="text-muted">{rows[0].constructor.name}</span></dd></div>
            <div><dt className="label">Pole sitter</dt><dd>{rows.find((x) => x.grid === 1) ? `${rows.find((x) => x.grid === 1)!.driver.givenName} ${rows.find((x) => x.grid === 1)!.driver.familyName}` : "See qualifying"}</dd></div>
            <div><dt className="label">Fastest lap</dt><dd>{fastest ? `${fastest.driver.givenName} ${fastest.driver.familyName} · ${fastest.fastestLap?.time ?? ""}` : <span className="text-muted">Not recorded for this race</span>}</dd></div>
          </dl>
        )}
        <p className="mt-3 text-[11px] text-muted">Source: Jolpica F1 (Ergast-compatible archive). Penalties are already applied to the classification. Archive results are post-race classifications, not provisional timing.</p>
      </section>
      {!held && <Unavailable title="This race has not been run" reason="Results, qualifying and recaps appear after the event." />}
      {held && (
        <>
          <div id="recap"><RaceRecaps season={season} grandPrix={race.name} hasSprint={race.sessions.some((x) => x.kind === "Sprint")} /></div>
          <RaceTabs race={race} initialTab={(params.get("tab") as Tab | null) ?? "race"} />
        </>
      )}
    </div>
  );
}
