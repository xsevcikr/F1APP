import { useMemo, useState } from "react";
import { ENTRIES_2026, jolpica, matchTeam } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { LineChart, type Series } from "../components/LineChart";
import { cx, ErrorState, Loading, Panel, RefreshButton, Segmented, Stat, Unavailable } from "../components/ui";
import { DriverAvatar } from "../components/people";
import { SnapshotNote } from "../components/SnapshotView";
import { snapshotSeason } from "../data/historySnapshot";
import { useAsync } from "../hooks/useAsync";
import { constructorProgression, driverSeasonStats, teammateComparison } from "../lib/stats";
import { useSession } from "../store/session";

const PALETTE = ["#e10600", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#14b8a6", "#ec4899", "#eab308", "#64748b", "#f97316"];

export function useSeasonData(season: number) {
  const results = useAsync(`seasonResults:${season}`, () => api.seasonResults(season), 30 * 60_000);
  const sprints = useAsync(`seasonSprints:${season}`, () => api.seasonSprints(season), 30 * 60_000);
  const quali = useAsync(`seasonQuali:${season}`, () => api.seasonQualifying(season), 30 * 60_000);
  return { results, sprints, quali, loading: results.loading || sprints.loading || quali.loading };
}

export function DriversTeams() {
  const current = new Date().getUTCFullYear();
  const [season, setSeason] = useState(current);
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
  const [driverId, setDriverId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const ds = useAsync(`standings:drivers:${season}`, () => api.driverStandings(season));
  const cs = useAsync(`standings:teams:${season}`, () => api.constructorStandings(season));
  const data = useSeasonData(season);
  const snap = ds.error || cs.error ? snapshotSeason(season) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight">{season} championship</h1>
          <p className="text-xs text-muted">{ds.data?.round ? `Official, after round ${ds.data.round}` : "Official standings"}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton reloads={[ds.reload, cs.reload]} loading={ds.loading || cs.loading} />
          <select className="input py-1 text-xs" value={season} onChange={(e) => { setSeason(Number(e.target.value)); setDriverId(null); setTeamId(null); }} aria-label="Season">
            {Array.from({ length: current - 1949 }, (_, i) => current - i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: "drivers", label: "Drivers" }, { value: "constructors", label: "Constructors" }]} size="xs" />
      <Panel
        bodyClass="p-0"
      >
        {tab === "drivers" ? (
          <>
            {ds.loading && !ds.data && <Loading />}
            {snap && ds.error && (
              <div className="p-4">
                <SnapshotNote className="mb-3" />
                <p className="label mb-1">Final standings after round {snap.standingsRound}</p>
                <ol className="divide-hairline">
                  {snap.drivers.map((r) => (
                    <li key={r.driverId} className="flex items-center gap-3 px-1 py-2 text-sm">
                      <span className="num w-6 text-right font-display font-bold">{r.position}</span>
                      <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{r.driver}</span><span className="ml-2 text-xs text-muted">{r.teams}</span></span>
                      <span className="num text-xs text-muted">{r.wins} {r.wins === 1 ? "win" : "wins"}</span>
                      <span className="num w-12 text-right font-semibold">{r.points}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {ds.error && !snap && <div className="p-4"><ErrorState message={ds.error.message} onRetry={ds.reload} /></div>}
            {ds.data && ds.data.rows.length === 0 && <div className="p-4"><Unavailable reason="No standings published for this season yet." /></div>}
            <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ol className="divide-hairline">
                {ds.data?.rows.map((r) => (
                  <li key={r.driver.id}>
                    <button onClick={() => setDriverId(r.driver.id)} className={cx("flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised/60", driverId === r.driver.id && "bg-accent/10")}>
                      <span className="num w-6 text-right font-display font-bold">{r.position ?? "—"}</span>
                      <DriverAvatar number={r.driver.number} code={r.driver.code} colour={matchTeam(ENTRIES_2026, ...r.constructors.map((c) => c.name))?.colour ?? "#444"} ink={matchTeam(ENTRIES_2026, ...r.constructors.map((c) => c.name))?.ink} />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{r.driver.givenName} {r.driver.familyName}</span>
                        <span className="ml-2 text-xs text-muted">{r.constructors.map((c) => c.name).join(" / ")}</span>
                      </span>
                      <span className="num text-xs text-muted">{r.wins} {r.wins === 1 ? "win" : "wins"}</span>
                      <span className="num w-12 text-right font-semibold">{r.points}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="border-t hairline p-4 xl:border-l xl:border-t-0">
                <SeasonProgressionChart season={season} ids={(ds.data?.rows ?? []).slice(0, 6).map((r) => r.driver.id)} data={data} />
              </div>
            </div>
          </>
        ) : (
          <>
            {cs.loading && !cs.data && <Loading />}
            {snap && cs.error && (
              <div className="p-4">
                <SnapshotNote className="mb-3" />
                <p className="label mb-1">Final standings after round {snap.standingsRound}</p>
                <ol className="divide-hairline">
                  {snap.constructors.map((r) => (
                    <li key={r.constructorId} className="flex items-center gap-3 px-1 py-2 text-sm">
                      <span className="num w-6 text-right font-display font-bold">{r.position}</span>
                      <span className="flex-1 font-semibold">{r.name}</span>
                      <span className="num text-xs text-muted">{r.wins} {r.wins === 1 ? "win" : "wins"}</span>
                      <span className="num w-12 text-right font-semibold">{r.points}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {cs.error && !snap && <div className="p-4"><ErrorState message={cs.error.message} onRetry={cs.reload} /></div>}
            {season < 1958 && <div className="p-4"><Unavailable reason="The constructors' championship started in 1958." /></div>}
            <ol className="divide-hairline">
              {cs.data?.rows.map((r) => (
                <li key={r.constructor.id}>
                  <button onClick={() => setTeamId(r.constructor.id)} className={cx("flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised/60", teamId === r.constructor.id && "bg-accent/10")}>
                    <span className="num w-6 text-right font-display font-bold">{r.position ?? "—"}</span>
                    <span className="flex-1 font-semibold">{r.constructor.name}</span>
                    <span className="num text-xs text-muted">{r.wins} {r.wins === 1 ? "win" : "wins"}</span>
                    <span className="num w-12 text-right font-semibold">{r.points}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>
      {tab === "drivers" && driverId && <DriverProfile season={season} driverId={driverId} data={data} standings={ds.data?.rows ?? []} onClose={() => setDriverId(null)} />}
      {tab === "constructors" && teamId && <ConstructorProfile season={season} constructorId={teamId} data={data} onClose={() => setTeamId(null)} />}
    </div>
  );
}

export type SeasonData = ReturnType<typeof useSeasonData>;

function SeasonProgressionChart({ season, ids, data }: { season: number; ids: string[]; data: SeasonData }) {
  const series: Series[] = useMemo(() => {
    if (!data.results.data) return [];
    return ids.map((id, i) => {
      const s = driverSeasonStats(id, data.results.data!, data.sprints.data ?? [], []);
      const row = data.results.data!.flatMap((r) => r.rows).find((r) => r.driver.id === id);
      return { id, label: row?.driver.code ?? row?.driver.familyName ?? id, colour: PALETTE[i], points: s.progression.map((p) => ({ x: p.round, y: p.points })) };
    });
  }, [ids.join(","), data.results.data, data.sprints.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="label mb-1">Points progression, top 6 ({season})</div>
      {data.loading && !data.results.data ? <Loading /> : <LineChart series={series} height={260} xFormat={(x) => `R${Math.round(x)}`} yFormat={(y) => String(Math.round(y))} empty="No race results yet" />}
      <p className="mt-1 text-[10px] text-muted">Derived by adding race and sprint points from each classification. Can differ slightly from the official standings after later penalties or appeals.</p>
    </div>
  );
}

function DriverProfile({ season, driverId, data, standings, onClose }: { season: number; driverId: string; data: SeasonData; standings: jolpica.DriverStanding[]; onClose: () => void }) {
  const [career, setCareer] = useState(false);
  const careerData = useAsync(career ? `career:${driverId}` : null, () => api.driverCareer(driverId), 24 * 3600_000);
  const st = standings.find((s) => s.driver.id === driverId);
  const stats = useMemo(() => (data.results.data ? driverSeasonStats(driverId, data.results.data, data.sprints.data ?? [], data.quali.data ?? []) : null), [driverId, data.results.data, data.sprints.data, data.quali.data]);
  const h2h = useMemo(() => (data.results.data ? teammateComparison(driverId, data.results.data, data.quali.data ?? []) : []), [driverId, data.results.data, data.quali.data]);
  const name = (id: string) => {
    const d = data.results.data?.flatMap((r) => r.rows).find((r) => r.driver.id === id)?.driver;
    return d ? `${d.givenName} ${d.familyName}` : id;
  };
  const mateSeries: Series[] = useMemo(() => {
    if (!data.results.data || !stats) return [];
    return [
      { id: driverId, label: name(driverId), colour: "rgb(var(--accent))", points: stats.progression.map((p) => ({ x: p.round, y: p.points })) },
      ...h2h.map((h, i) => {
        const s = driverSeasonStats(h.teammateId, data.results.data!, data.sprints.data ?? [], []);
        return { id: h.teammateId, label: name(h.teammateId), colour: PALETTE[(i + 1) % PALETTE.length], dashed: true, points: s.progression.map((p) => ({ x: p.round, y: p.points })) };
      }),
    ];
  }, [stats, h2h, data.results.data, data.sprints.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const careerStats = useMemo(() => {
    if (!careerData.data) return null;
    const rows = careerData.data.map((r) => r.rows[0]).filter(Boolean);
    return {
      starts: rows.length,
      wins: rows.filter((r) => r.position === 1).length,
      podiums: rows.filter((r) => r.position !== null && r.position <= 3 && /^\d+$/.test(r.positionText)).length,
      seasons: new Set(careerData.data.map((r) => r.race.season)).size,
      first: careerData.data.map((r) => r.race.season).sort()[0],
    };
  }, [careerData.data]);

  return (
    <Panel
      title={st ? `${st.driver.givenName} ${st.driver.familyName}` : name(driverId)}
      subtitle={st ? `${st.constructors.map((c) => c.name).join(" / ")} · ${st.driver.nationality}${st.driver.number ? ` · #${st.driver.number}` : ""}` : undefined}
      right={<button className="btn px-2" onClick={onClose} aria-label="Close profile"><Icon name="close" size={14} /></button>}
    >
      {data.loading && !stats && <Loading />}
      {stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Championship" value={st?.position ? `P${st.position}` : "—"} />
            <Stat label="Points" value={st?.points ?? stats.points} sub={stats.sprintPoints ? `${stats.sprintPoints} from sprints` : undefined} />
            <Stat label="Wins" value={stats.wins} />
            <Stat label="Podiums" value={stats.podiums} />
            <Stat label="Poles" value={stats.poles} sub="Qualifying P1" />
            <Stat label="Fastest laps" value={stats.fastestLaps} />
            <Stat label="Starts" value={stats.starts} />
            <Stat label="Finishes" value={stats.finishes} sub={`${stats.dnfs} not classified as running`} />
            <Stat label="Best finish" value={stats.bestFinish ? `P${stats.bestFinish}` : "—"} />
            <Stat label="Avg finish" value={stats.avgFinish ? stats.avgFinish.toFixed(1) : "—"} sub="when running at the flag" />
            <Stat label="Avg grid" value={stats.avgGrid ? stats.avgGrid.toFixed(1) : "—"} />
            <Stat label="Season" value={season} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="label mb-1.5">Recent form</div>
              <ul className="space-y-1 text-sm">
                {stats.recent.map((r) => (
                  <li key={r.round} className="flex items-center gap-3">
                    <span className={cx("num w-8 rounded text-center font-display font-bold", r.pos === "1" ? "bg-accent text-white" : /^[23]$/.test(r.pos) ? "bg-raised text-fg" : "text-muted")}>{/^\d+$/.test(r.pos) ? `P${r.pos}` : r.pos}</span>
                    <span className="flex-1 truncate">{r.race}</span>
                    <span className="num text-xs text-muted">{r.points} pts</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label mb-1.5">Teammate head-to-head</div>
              {h2h.length === 0 ? (
                <p className="text-sm text-muted">No teammate data.</p>
              ) : (
                h2h.map((h) => (
                  <div key={h.teammateId} className="mb-3">
                    <div className="mb-1 text-sm">vs {name(h.teammateId)}</div>
                    <H2HBar label="Race" a={h.races.ahead} b={h.races.behind} />
                    <H2HBar label="Qualifying" a={h.qualifying.ahead} b={h.qualifying.behind} />
                  </div>
                ))
              )}
              <p className="text-[10px] text-muted">Races count only when both were classified.</p>
            </div>
          </div>

          <div>
            <div className="label mb-1">Points progression vs teammate (derived)</div>
            <LineChart series={mateSeries} height={220} xFormat={(x) => `R${Math.round(x)}`} yFormat={(y) => String(Math.round(y))} />
          </div>

          <div>
            <div className="label mb-1">Qualifying positions</div>
            <LineChart series={[{ id: "q", label: "Qualifying", colour: "rgb(var(--info))", points: stats.qualifying.map((q) => ({ x: q.round, y: q.pos })) }]} height={150} invertY xFormat={(x) => `R${Math.round(x)}`} yFormat={(y) => `P${Math.round(y)}`} empty="No qualifying data" />
          </div>

          <div>
            <div className="label mb-1.5">Career (historical)</div>
            {!career ? (
              <button className="btn" onClick={() => setCareer(true)}>
                Load career record
              </button>
            ) : careerData.loading ? (
              <Loading label="Loading career results" />
            ) : careerData.error ? (
              <ErrorState message={careerData.error.message} onRetry={careerData.reload} />
            ) : careerStats ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Starts" value={careerStats.starts} />
                <Stat label="Wins" value={careerStats.wins} />
                <Stat label="Podiums" value={careerStats.podiums} />
                <Stat label="Seasons" value={careerStats.seasons} />
                <Stat label="Debut season" value={careerStats.first} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

function H2HBar({ label, a, b }: { label: string; a: number; b: number }) {
  const total = a + b || 1;
  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <span className="w-20 text-muted">{label}</span>
      <span className="num w-5 text-right font-semibold">{a}</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="bg-accent" style={{ width: `${(a / total) * 100}%` }} />
        <div className="bg-faint/60" style={{ width: `${(b / total) * 100}%` }} />
      </div>
      <span className="num w-5 font-semibold">{b}</span>
    </div>
  );
}

function ConstructorProfile({ season, constructorId, data, onClose }: { season: number; constructorId: string; data: SeasonData; onClose: () => void }) {
  const prog = useMemo(() => (data.results.data ? constructorProgression(constructorId, data.results.data, data.sprints.data ?? []) : null), [constructorId, data.results.data, data.sprints.data]);
  const races = data.results.data ?? [];
  const name = races.flatMap((r) => r.rows).find((r) => r.constructor.id === constructorId)?.constructor.name ?? constructorId;
  return (
    <Panel title={name} subtitle={`${season} season`} right={<button className="btn px-2" onClick={onClose} aria-label="Close profile"><Icon name="close" size={14} /></button>}>
      {!prog ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="label mb-1">Points progression (derived)</div>
              <LineChart series={[{ id: "c", label: name, colour: "rgb(var(--accent))", points: prog.progression.map((p) => ({ x: p.round, y: p.points })) }]} height={220} xFormat={(x) => `R${Math.round(x)}`} yFormat={(y) => String(Math.round(y))} />
            </div>
            <div>
              <div className="label mb-2">Driver contribution</div>
              {prog.drivers.map((d) => (
                <div key={d.id} className="mb-2">
                  <div className="flex justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="num font-semibold">{d.points}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-raised">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(d.points / Math.max(1, ...prog.drivers.map((x) => x.points))) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="label mb-1.5">Race results</div>
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1 font-medium">Rd</th>
                  <th className="font-medium">Grand Prix</th>
                  {prog.drivers.map((d) => (
                    <th key={d.id} className="text-right font-medium">{d.name.split(" ").pop()}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="num">
                {races.map((r) => (
                  <tr key={r.race.round} className="border-t hairline">
                    <td className="py-1">{r.race.round}</td>
                    <td className="font-sans">{r.race.name.replace(" Grand Prix", "")}</td>
                    {prog.drivers.map((d) => {
                      const row = r.rows.find((x) => x.driver.id === d.id && x.constructor.id === constructorId);
                      return (
                        <td key={d.id} className={cx("text-right", row?.position === 1 && "font-semibold text-accent", row && !jolpica.isFinishStatus(row.status) && "text-muted")}>
                          {row ? row.positionText : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
