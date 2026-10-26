import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { driversOf, jolpica, matchTeam, teamById, type SeasonEntries, type TeamEntry } from "@f1/shared";
import { CarHero } from "../car/CarArt";
import { Icon } from "../components/Icon";
import { carSpecFor, DriverPortrait, TeamCar, TeamMark } from "../components/people";
import { cx, Loading, Panel, Segmented, Stat, Unavailable } from "../components/ui";
import { ENTRY_SEASON, standingsNote, useSeason, type SeasonView } from "../data/season";
import { useSeasonData } from "./DriversTeams";

export function PageHead({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-wide sm:text-4xl">{title}</h1>
          {note && (
            <button className="rounded-full p-1.5 text-muted transition-colors hover:bg-fg/8 hover:text-fg" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide page details" : "About this page"} title="About this page">
              <Icon name="info" size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
      {note && open && <p className="max-w-2xl rounded-xl bg-fg/[0.04] px-3 py-2 text-xs leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

export function SourceNote({ season }: { season: SeasonView }) {
  return (
    <p className="text-[11px] text-muted" role="status">
      {standingsNote(season)} Entry list: {season.entries.source}
    </p>
  );
}

export function TeamsDirectory() {
  const season = useSeason();
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <PageHead title={`${ENTRY_SEASON} teams`} note="All eleven entries, in championship order. Car images are illustrative models in each team's colours at one shared angle." />
      <ul className="stagger grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {season.table.teams.map((t) => (
          <li key={t.team.id}>
            <TeamCard team={t.team} position={t.position} points={t.points} entries={season.entries} table={season.table} />
          </li>
        ))}
      </ul>
      <SourceNote season={season} />
    </div>
  );
}

function TeamCard({ team, position, points, entries, table }: { team: TeamEntry; position: number; points: number; entries: SeasonEntries; table: SeasonView["table"] }) {
  const pair = driversOf(entries, team.id);
  return (
    <Link to={`/teams/${team.id}`} className="panel group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${team.colour}33, transparent 70%)` }}>
        <span className="absolute left-4 top-3 font-display text-5xl font-black leading-none opacity-90" style={{ color: team.colour }}>
          {position}
        </span>
        <div className="absolute right-4 top-3 text-right">
          <div className="num text-xl font-bold">{points}</div>
          <div className="label">points</div>
        </div>
        <TeamCar team={team} driver={pair[0]} className="mx-auto mt-2 aspect-[640/340] w-[92%] transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <TeamMark team={team} className="text-lg" />
          <div className="mt-0.5 text-xs text-muted">{team.entrant} · {team.chassis} · {team.powerUnit}</div>
        </div>
        <ul className="mt-auto grid grid-cols-2 gap-3">
          {pair.map((d) => {
            const row = table.drivers.find((x) => x.driver.number === d.number);
            return (
              <li key={d.number} className="flex items-center gap-2.5">
                <DriverPortrait driver={d} team={team} className="w-11 shrink-0 text-[10px]" rounded="rounded-md" label={false} />
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold">{d.lastName}</div>
                  <div className="num text-xs text-muted">
                    #{d.number} · {row?.position ? `P${row.position}` : "—"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Link>
  );
}

export function TeamProfile() {
  const { id } = useParams();
  const season = useSeason();
  const team = id ? teamById(season.entries, id) : undefined;
  if (!team) {
    return (
      <Panel title="Team not found">
        <p className="text-sm text-muted">There is no team with that name in the {ENTRY_SEASON} entry list.</p>
        <Link to="/teams" className="btn mt-3 inline-flex">All teams</Link>
      </Panel>
    );
  }
  return <TeamProfileInner team={team} season={season} />;
}

function TeamProfileInner({ team, season }: { team: TeamEntry; season: SeasonView }) {
  const pair = driversOf(season.entries, team.id);
  const [which, setWhich] = useState<0 | 1>(0);
  const row = season.table.teams.find((t) => t.team.id === team.id)!;
  const data = useSeasonData(ENTRY_SEASON);
  const practice = season.entries.practice.filter((p) => p.teamId === team.id);
  const reserves = season.entries.reserves.filter((r) => r.teamId === team.id);
  const spec = useMemo(() => carSpecFor(team, pair[which], which), [team, pair, which]);

  // Race-by-race: every classified row that belongs to this team, whoever drove.
  const races = useMemo(
    () =>
      (data.results.data ?? []).map((r) => ({
        race: r.race,
        rows: r.rows.filter((x) => matchTeam(season.entries, x.constructor.id, x.constructor.name)?.id === team.id),
      })),
    [data.results.data, team.id, season.entries],
  );
  const teamWins = races.reduce((n, r) => n + r.rows.filter((x) => x.position === 1).length, 0);
  const haveResults = !!data.results.data && races.length > 0;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <Link to="/teams" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <Icon name="back" size={14} /> All teams
      </Link>
      <section className="panel overflow-hidden" style={{ background: `linear-gradient(120deg, ${team.colour}2e, transparent 60%)` }}>
        <div className="grid items-center gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-4 p-5 sm:p-7">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-6xl font-black leading-none" style={{ color: team.colour }}>{row.position}</span>
              <h1 className="font-display text-3xl font-black uppercase tracking-wide sm:text-4xl">{team.name}</h1>
            </div>
            <p className="text-sm text-muted">{team.entrant}</p>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Points" value={row.points} />
              <Stat label="Wins" value={haveResults ? teamWins : row.wins ?? "—"} sub={haveResults ? undefined : "needs the results feed"} />
              <Stat label="Standing" value={`P${row.position}`} sub={`of ${season.table.teams.length}`} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Chassis</dt><dd>{team.chassis}</dd>
              <dt className="text-muted">Power unit</dt><dd>{team.powerUnit}</dd>
              <dt className="text-muted">Base</dt><dd>{team.base}</dd>
            </dl>
            <Segmented value={which} onChange={setWhich} options={pair.map((d, i) => ({ value: i as 0 | 1, label: `#${d.number} ${d.lastName}` }))} />
          </div>
          <div className="relative">
            <CarHero spec={spec} className="mx-auto aspect-[16/10] w-full max-w-[860px]" />
            <p className="px-5 pb-3 text-center text-[10px] uppercase tracking-wider text-muted">Illustrative model in team colours, not an official render. Drag to turn, Ctrl and scroll to zoom.</p>
          </div>
        </div>
      </section>

      <Panel title="Drivers">
        <ul className="grid gap-4 sm:grid-cols-2">
          {pair.map((d) => {
            const r = season.table.drivers.find((x) => x.driver.number === d.number);
            return (
              <li key={d.number}>
                <Link to={`/drivers/${d.number}`} className="flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-raised/70">
                  <DriverPortrait driver={d} team={team} className="w-24 shrink-0 text-sm" />
                  <div className="min-w-0">
                    <div className="font-display text-xl font-bold uppercase leading-tight">{d.firstName} <span className="font-black">{d.lastName}</span></div>
                    <div className="text-xs text-muted">{d.nationality} · #{d.number}{d.rounds ? ` · rounds ${d.rounds}` : ""}</div>
                    <div className="num mt-1 text-sm">{r?.position ? `P${r.position}` : "—"} · {r?.points ?? 0} pts</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {(reserves.length > 0 || practice.length > 0) && (
          <div className="mt-4 border-t hairline pt-3 text-xs text-muted">
            {reserves.map((r) => (
              <p key={r.name}><span className="font-semibold text-fg">Reserve: {r.name}.</span> {r.role}</p>
            ))}
            {practice.map((p) => (
              <p key={p.name}><span className="font-semibold text-fg">Practice: {p.name}.</span> {p.sessions}</p>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Race results" subtitle="Classified positions from the results feed. A driver who raced for another team that day is listed under that team.">
        {data.loading && !data.results.data && <Loading />}
        {data.results.error && <Unavailable title="Results unavailable" reason={`${data.results.error.message} Race results are shown when the results feed can be reached.`} />}
        {haveResults && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
                <tr><th className="py-1 font-medium">Rd</th><th className="font-medium">Grand Prix</th><th className="font-medium">Finishing positions</th><th className="text-right font-medium">Pts</th></tr>
              </thead>
              <tbody className="num">
                {races.map((r) => (
                  <tr key={r.race.round} className="border-t hairline">
                    <td className="py-1.5">{r.race.round}</td>
                    <td className="font-sans">{r.race.name.replace(" Grand Prix", "")}</td>
                    <td>
                      <span className="flex flex-wrap gap-2">
                        {r.rows.map((x) => (
                          <span key={x.driver.id} className={cx("rounded px-1.5", x.position === 1 ? "bg-accent text-white" : "bg-raised", !jolpica.isFinishStatus(x.status) && "text-muted")}>
                            {x.driver.code ?? x.driver.familyName} {x.positionText}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="text-right font-semibold">{r.rows.reduce((n, x) => n + (x.points ?? 0), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!data.loading && !data.results.error && races.length === 0 && <Unavailable reason="No results have been published yet." />}
      </Panel>
      <SourceNote season={season} />
    </div>
  );
}
