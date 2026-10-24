import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { checkEntryList, driverByNumber, teamById, type DriverEntry, type SeasonEntries } from "@f1/shared";
import { Icon } from "../components/Icon";
import { LineChart } from "../components/LineChart";
import { carSpecFor, DriverPortrait, flagLabel, TeamCar, TeamMark } from "../components/people";
import { cx, Loading, Panel, Stat, Unavailable } from "../components/ui";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { ENTRY_SEASON, useSeason, type SeasonView } from "../data/season";
import { driverSeasonStats, teammateComparison } from "../lib/stats";
import { PageHead, SourceNote } from "./Teams";
import { useSeasonData } from "./DriversTeams";

/** Compares the bundled entry list with the drivers Jolpica lists for the season. */
function EntryCheckNote({ entries }: { entries: SeasonEntries }) {
  const api_ = useAsync(`seasonDrivers:${entries.season}`, () => api.seasonDrivers(entries.season), 60 * 60_000);
  const check = useMemo(() => (api_.data && api_.data.length ? checkEntryList(entries, api_.data) : null), [api_.data, entries]);
  if (api_.error) return <p className="text-[11px] text-muted" role="status">Entry list not cross-checked: {api_.error.message}</p>;
  if (!check) return <p className="text-[11px] text-muted" role="status">{api_.loading ? "Cross-checking the entry list with the results archive…" : `The results archive lists no drivers for ${entries.season} yet, so the entry list could not be cross-checked.`}</p>;
  const clean = check.notInApi.length === 0 && check.notInList.length === 0;
  return (
    <p className="text-[11px] text-muted" role="status">
      Cross-check with the results archive: {check.confirmed.length} of {entries.drivers.length} drivers confirmed.
      {clean ? " No differences." : ""}
      {check.notInApi.length > 0 && ` Not yet listed by the archive: ${check.notInApi.map((d) => d.lastName).join(", ")}.`}
      {check.notInList.length > 0 && ` Listed by the archive but missing here: ${check.notInList.join(", ")}.`}
    </p>
  );
}

export function DriversDirectory() {
  const season = useSeason();
  const { entries, table } = season;
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <PageHead title={`${ENTRY_SEASON} drivers`} note="Every race driver on the entry list, in championship order. Select a driver for their season profile." />
      <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {table.drivers.map((r) => {
          const team = teamById(entries, r.driver.teamId)!;
          return (
            <li key={r.driver.number}>
              <Link to={`/drivers/${r.driver.number}`} className="panel group relative flex h-full gap-4 overflow-hidden p-3 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <DriverPortrait driver={r.driver} team={team} className="w-24 shrink-0 text-sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="num font-display text-3xl font-black leading-none" style={{ color: team.colour }}>{r.driver.number}</span>
                    <span className="num text-right text-sm">
                      <span className="font-bold">{r.position ? `P${r.position}` : "—"}</span>
                      <span className="block text-xs text-muted">{r.points} pts</span>
                    </span>
                  </div>
                  <div className="mt-1 font-display text-lg font-bold uppercase leading-tight">
                    {r.driver.firstName} <span className="font-black">{r.driver.lastName}</span>
                  </div>
                  <div className="mt-auto flex flex-col gap-0.5 pt-2 text-xs text-muted">
                    <TeamMark team={team} className="text-xs text-fg" />
                    <span>{flagLabel(r.driver)}</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <Reserves entries={entries} />
      <SourceNote season={season} />
      <EntryCheckNote entries={season.entries} />
    </div>
  );
}

function Reserves({ entries }: { entries: SeasonEntries }) {
  return (
    <Panel title="Reserve and practice drivers" subtitle="Reserve drivers named by their teams, and drivers who have taken part in free practice this season. They hold no race seat.">
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        {entries.reserves.map((r) => (
          <p key={r.name} className="text-sm">
            <span className="font-semibold">{r.name}</span> <span className="text-muted">· {teamById(entries, r.teamId)?.name}. {r.role}</span>
          </p>
        ))}
        {entries.practice.map((p) => (
          <p key={p.name} className="text-sm">
            <span className="font-semibold">{p.name}</span> <span className="text-muted">· {teamById(entries, p.teamId)?.name}. {p.sessions}</span>
          </p>
        ))}
      </div>
    </Panel>
  );
}

export function DriverProfile() {
  const { number } = useParams();
  const season = useSeason();
  const driver = driverByNumber(season.entries, Number(number));
  if (!driver) {
    return (
      <Panel title="Driver not found">
        <p className="text-sm text-muted">No race driver on the {ENTRY_SEASON} entry list has number {number}.</p>
        <Link to="/drivers" className="btn mt-3 inline-flex">All drivers</Link>
      </Panel>
    );
  }
  return <DriverProfileInner driver={driver} season={season} />;
}

function DriverProfileInner({ driver, season }: { driver: DriverEntry; season: SeasonView }) {
  const team = teamById(season.entries, driver.teamId)!;
  const row = season.table.drivers.find((r) => r.driver.number === driver.number);
  const data = useSeasonData(ENTRY_SEASON);

  // The results feed names drivers by its own ids; find this driver's by code or surname.
  const driverId = useMemo(() => {
    const all = data.results.data?.flatMap((r) => r.rows) ?? [];
    return all.find((r) => r.driver.code === driver.code || r.driver.familyName.toLowerCase() === driver.lastName.toLowerCase())?.driver.id ?? null;
  }, [data.results.data, driver]);
  const stats = useMemo(() => (driverId && data.results.data ? driverSeasonStats(driverId, data.results.data, data.sprints.data ?? [], data.quali.data ?? []) : null), [driverId, data.results.data, data.sprints.data, data.quali.data]);
  const h2h = useMemo(() => (driverId && data.results.data ? teammateComparison(driverId, data.results.data, data.quali.data ?? []) : []), [driverId, data.results.data, data.quali.data]);
  const mate = season.entries.drivers.find((d) => d.teamId === driver.teamId && d.number !== driver.number);
  const teamRow = season.table.teams.find((t) => t.team.id === team.id);
  const fromFeed = season.table.basis === "feed";

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <Link to="/drivers" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <Icon name="back" size={14} /> All drivers
      </Link>
      <section className="panel overflow-hidden" style={{ background: `linear-gradient(120deg, ${team.colour}2e, transparent 65%)` }}>
        <div className="grid items-center gap-4 p-5 sm:p-7 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
          <DriverPortrait driver={driver} team={team} className="mx-auto w-44 text-lg md:w-full" />
          <div className="flex flex-col gap-2">
            <span className="num font-display text-7xl font-black leading-none" style={{ color: team.colour }}>{driver.number}</span>
            <h1 className="font-display text-3xl font-bold uppercase leading-tight sm:text-4xl">{driver.firstName} <span className="font-black">{driver.lastName}</span></h1>
            <div className="text-sm text-muted">{flagLabel(driver)}{driver.rounds ? ` · drove for ${team.name} in rounds ${driver.rounds}` : ""}</div>
            <Link to={`/teams/${team.id}`} className="inline-flex w-fit items-center gap-1 text-sm hover:underline"><TeamMark team={team} /> <Icon name="chevron" size={12} /></Link>
          </div>
          <TeamCar team={team} driver={driver} variant={mate && mate.number < driver.number ? 1 : 0} className="mx-auto aspect-[640/340] w-full max-w-[460px]" />
        </div>
      </section>

      <Panel title={`${ENTRY_SEASON} season`} subtitle={fromFeed ? `Official standings after round ${season.table.round}` : "Championship position and points are from a dated snapshot. Race statistics need the results feed."}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Championship" value={row?.position ? `P${row.position}` : "—"} />
          <Stat label="Points" value={row?.points ?? 0} />
          <Stat label="Wins" value={stats ? stats.wins : "—"} />
          <Stat label="Podiums" value={stats ? stats.podiums : "—"} />
          <Stat label="Poles" value={stats ? stats.poles : "—"} sub="Qualifying P1" />
          <Stat label="Fastest laps" value={stats ? stats.fastestLaps : "—"} />
          <Stat label="Starts" value={stats ? stats.starts : "—"} />
          <Stat label="Team rank" value={teamRow ? `P${teamRow.position}` : "—"} sub={team.name} />
        </div>
        {data.loading && !data.results.data && <Loading label="Loading race results" />}
        {!stats && !data.loading && <Unavailable className="mt-4" title="Race statistics unavailable" reason={data.results.error ? `${data.results.error.message}` : "No race results have been published for this driver yet."} />}
      </Panel>

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Recent results">
            <ul className="space-y-1.5 text-sm">
              {stats.recent.slice(-8).reverse().map((r) => (
                <li key={r.round} className="flex items-center gap-3">
                  <span className={cx("num w-9 rounded text-center font-display font-bold", r.pos === "1" ? "bg-accent text-white" : /^[23]$/.test(r.pos) ? "bg-raised" : "text-muted")}>{/^\d+$/.test(r.pos) ? `P${r.pos}` : r.pos}</span>
                  <span className="flex-1 truncate">{r.race}</span>
                  <span className="num text-xs text-muted">{r.points} pts</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Points progression" subtitle="Derived from race and sprint points in each classification">
            <LineChart series={[{ id: "d", label: driver.code, colour: team.colour, points: stats.progression.map((p) => ({ x: p.round, y: p.points })) }]} height={220} xFormat={(x) => `R${Math.round(x)}`} yFormat={(y) => String(Math.round(y))} />
            {h2h[0] && mate && (
              <p className="mt-2 text-xs text-muted">
                Against {mate.firstName} {mate.lastName}: ahead in {h2h[0].races.ahead} of {h2h[0].races.ahead + h2h[0].races.behind} races and {h2h[0].qualifying.ahead} of {h2h[0].qualifying.ahead + h2h[0].qualifying.behind} qualifying sessions, when both were classified.
              </p>
            )}
          </Panel>
        </div>
      )}
      <SourceNote season={season} />
    </div>
  );
}
