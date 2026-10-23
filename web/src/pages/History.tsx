import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { classifyRaceControl, detectPositionChanges, jolpica, neutralPeriods, type SessionCore } from "@f1/shared";
import { api } from "../api";
import { RaceChampionship } from "../components/Championship";
import { CircuitInfo, useWeekendSessions } from "../components/CircuitInfo";
import { Icon } from "../components/Icon";
import { LapReplay } from "../components/LapReplay";
import { LineChart, type Series } from "../components/LineChart";
import { FIRST_OPENF1_YEAR } from "../components/SessionPicker";
import { cx, ErrorState, Loading, Panel, Segmented, Unavailable } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";

export type Tab = "race" | "qualifying" | "sprint" | "grid" | "pits" | "laps" | "replay" | "events" | "circuit";

const PALETTE = ["#e10600", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#14b8a6", "#ec4899", "#eab308", "#64748b", "#f97316"];

export function RaceTabs({ race, initialTab = "race" }: { race: jolpica.ScheduleRace; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [focus, setFocus] = useState<string>("");
  const hasSprint = race.sessions.some((s) => s.kind === "Sprint");
  const tabs: { value: Tab; label: string }[] = [
    { value: "race", label: "Race" },
    { value: "qualifying", label: "Qualifying" },
    ...(hasSprint ? [{ value: "sprint" as Tab, label: "Sprint" }] : []),
    { value: "grid", label: "Grid" },
    { value: "pits", label: "Pit stops" },
    { value: "laps", label: "Lap chart" },
    { value: "replay", label: "Replay" },
    { value: "events", label: "SC, incidents and stewards" },
    { value: "circuit", label: "Circuit" },
  ];

  return (
    <Panel
      title="Session results"
      right={<div className="hidden md:block"><Segmented value={tab} onChange={setTab} options={tabs} size="xs" /></div>}
      bodyClass="p-0"
    >
      <div className="flex flex-wrap items-center gap-2 border-b hairline p-2">
        <select className="input md:hidden" value={tab} onChange={(e) => setTab(e.target.value as Tab)} aria-label="View">
          {tabs.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input className="input w-48" placeholder="Highlight driver or team" value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Highlight driver or constructor" />
      </div>
      <div className="p-4">
        {tab === "race" && (
          <>
            <RaceResult race={race} focus={focus} kind="race" />
            <RaceChampionship season={race.season} round={race.round} />
          </>
        )}
        {tab === "sprint" && <RaceResult race={race} focus={focus} kind="sprint" />}
        {tab === "qualifying" && <Qualifying race={race} focus={focus} />}
        {tab === "grid" && <Grid race={race} focus={focus} />}
        {tab === "pits" && <PitStops race={race} />}
        {tab === "laps" && <LapChart race={race} focus={focus} />}
        {tab === "replay" && <Replay race={race} />}
        {tab === "events" && <Events race={race} />}
        {tab === "circuit" && <CircuitInfo race={race} />}
      </div>
    </Panel>
  );
}

const matches = (focus: string, ...vals: (string | null | undefined)[]) => !!focus && vals.some((v) => v?.toLowerCase().includes(focus.toLowerCase()));

function RaceResult({ race, focus, kind }: { race: jolpica.ScheduleRace; focus: string; kind: "race" | "sprint" }) {
  const res = useAsync(`${kind}:${race.season}:${race.round}`, () => (kind === "race" ? api.results(race.season, race.round) : api.sprint(race.season, race.round)));
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState message={res.error.message} onRetry={res.reload} />;
  if (!res.data) return <Unavailable title="Not available" reason="The archive has no classification for this session yet." />;
  const rows = res.data.rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
          <tr>
            <th className="py-1.5 font-medium">Pos</th>
            <th className="font-medium">Driver</th>
            <th className="font-medium">Constructor</th>
            <th className="text-right font-medium">Grid</th>
            <th className="text-right font-medium">Laps</th>
            <th className="text-right font-medium">Time / status</th>
            <th className="text-right font-medium">Fastest lap</th>
            <th className="text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const finished = jolpica.isFinishStatus(r.status);
            return (
              <tr key={r.driver.id} className={cx("border-t hairline", matches(focus, r.driver.familyName, r.driver.code, r.constructor.name) && "bg-accent/10", !finished && "text-muted")}>
                <td className="num py-1.5 font-display font-bold">{r.positionText}</td>
                <td>
                  <span className="font-semibold">{r.driver.givenName} {r.driver.familyName}</span>
                  {r.number !== null && <span className="num ml-1.5 text-xs text-faint">#{r.number}</span>}
                </td>
                <td className="text-muted">{r.constructor.name}</td>
                <td className="num text-right">{r.grid === 0 ? "PL" : r.grid ?? "—"}</td>
                <td className="num text-right">{r.laps ?? "—"}</td>
                <td className="num text-right">
                  {r.time ?? r.status}
                  {!finished && <span className="ml-1.5 chip bg-danger/15 text-danger">{r.positionText === "D" ? "DSQ" : "DNF"}</span>}
                </td>
                <td className={cx("num text-right", r.fastestLap?.rank === 1 && "font-semibold text-best")}>{r.fastestLap?.time ?? "—"}</td>
                <td className="num text-right font-semibold">{r.points ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted">
        Official classification. Grid “PL” means a pit-lane start. Fastest-lap data is archived from 2004. Penalties are already applied to the classification; individual penalty decisions appear under SC &amp; incidents for 2023 onward.
      </p>
    </div>
  );
}

function Qualifying({ race, focus }: { race: jolpica.ScheduleRace; focus: string }) {
  const res = useAsync(`quali:${race.season}:${race.round}`, () => api.qualifying(race.season, race.round));
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState message={res.error.message} onRetry={res.reload} />;
  if (!res.data) return <Unavailable reason="No qualifying results archived for this race (the archive has full qualifying times from 1994)." />;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
        <tr>
          <th className="py-1.5 font-medium">Pos</th>
          <th className="font-medium">Driver</th>
          <th className="hidden font-medium sm:table-cell">Constructor</th>
          <th className="text-right font-medium">Q1</th>
          <th className="text-right font-medium">Q2</th>
          <th className="text-right font-medium">Q3</th>
        </tr>
      </thead>
      <tbody className="num">
        {res.data.rows.map((r) => (
          <tr key={r.driver.id} className={cx("border-t hairline", matches(focus, r.driver.familyName, r.driver.code, r.constructor.name) && "bg-accent/10")}>
            <td className="py-1.5 font-display font-bold">{r.position}</td>
            <td className="font-sans font-semibold">{r.driver.givenName} {r.driver.familyName}</td>
            <td className="hidden font-sans text-muted sm:table-cell">{r.constructor.name}</td>
            <td className="text-right">{r.q1 ?? "—"}</td>
            <td className="text-right">{r.q2 ?? "—"}</td>
            <td className="text-right font-semibold">{r.q3 ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Grid({ race, focus }: { race: jolpica.ScheduleRace; focus: string }) {
  const res = useAsync(`race:${race.season}:${race.round}`, () => api.results(race.season, race.round));
  if (res.loading && !res.data) return <Loading />;
  if (!res.data) return <Unavailable reason="No starting grid archived." />;
  const grid = [...res.data.rows].filter((r) => r.grid !== null).sort((a, b) => (a.grid || 99) - (b.grid || 99));
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:max-w-xl">
        {grid.map((r, i) => (
          <div key={r.driver.id} className={cx("flex items-center gap-2 rounded-lg border hairline bg-raised/50 px-3 py-2", i % 2 === 1 && "mt-5", matches(focus, r.driver.familyName, r.driver.code, r.constructor.name) && "ring-1 ring-accent")}>
            <span className="num w-6 font-display font-black">{r.grid === 0 ? "PL" : r.grid}</span>
            <span className="truncate text-sm font-semibold">{r.driver.familyName}</span>
            <span className="ml-auto truncate text-[11px] text-muted">{r.constructor.name}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted">Grid from the official race classification, after grid penalties. PL = pit-lane start.</p>
    </div>
  );
}

function PitStops({ race }: { race: jolpica.ScheduleRace }) {
  const res = useAsync(`pits:${race.season}:${race.round}`, () => api.pitStops(race.season, race.round));
  const results = useAsync(`race:${race.season}:${race.round}`, () => api.results(race.season, race.round));
  if (race.season < 2011) return <Unavailable reason="Pit-stop data is archived from 2011." />;
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorState message={res.error.message} onRetry={res.reload} />;
  if (!res.data?.length) return <Unavailable reason="No pit stops archived for this race." />;
  const name = (id: string) => results.data?.rows.find((r) => r.driver.id === id)?.driver.familyName ?? id;
  const fastest = Math.min(...res.data.map((p) => jolpica.lapTimeToSeconds(p.duration) ?? Infinity));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
        <tr>
          <th className="py-1.5 font-medium">Driver</th>
          <th className="text-right font-medium">Stop</th>
          <th className="text-right font-medium">Lap</th>
          <th className="text-right font-medium">Time of day</th>
          <th className="text-right font-medium">Pit-lane time</th>
        </tr>
      </thead>
      <tbody className="num">
        {res.data.map((p) => (
          <tr key={`${p.driverId}-${p.stop}`} className="border-t hairline">
            <td className="py-1.5 font-sans font-semibold">{name(p.driverId)}</td>
            <td className="text-right">{p.stop}</td>
            <td className="text-right">{p.lap}</td>
            <td className="text-right text-muted">{p.time}</td>
            <td className={cx("text-right", jolpica.lapTimeToSeconds(p.duration) === fastest && "font-semibold text-best")}>{p.duration}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LapChart({ race, focus }: { race: jolpica.ScheduleRace; focus: string }) {
  const laps = useAsync(race.season >= 1996 ? `laps:${race.season}:${race.round}` : null, () => api.lapPositions(race.season, race.round), 24 * 3600_000);
  const results = useAsync(`race:${race.season}:${race.round}`, () => api.results(race.season, race.round));
  if (race.season < 1996) return <Unavailable reason="Lap-by-lap positions are archived from 1996." />;
  if (laps.loading && !laps.data) return <Loading label="Loading lap-by-lap positions (many pages on first load)" />;
  if (laps.error) return <ErrorState message={laps.error.message} onRetry={laps.reload} />;
  const rows = results.data?.rows ?? [];
  const series: Series[] = rows.map((r, i) => ({
    id: r.driver.id,
    label: r.driver.code ?? r.driver.familyName,
    colour: focus && !matches(focus, r.driver.familyName, r.driver.code, r.constructor.name) ? "rgb(var(--faint) / 0.35)" : PALETTE[i % PALETTE.length],
    step: true,
    points: (laps.data ?? []).map((l) => ({ x: l.lap, y: l.timings.find((t) => t.driverId === r.driver.id)?.position ?? null })),
  }));
  return (
    <div>
      <LineChart series={series} height={420} invertY xFormat={(x) => `L${Math.round(x)}`} yFormat={(y) => `P${Math.round(y)}`} empty="No lap data" />
      <p className="mt-2 text-[10px] text-muted">Running order at the end of each lap from the archive. Colours are assigned for readability and are not team colours. Use the highlight box to focus a driver or team.</p>
    </div>
  );
}

function useOpenF1Race(race: jolpica.ScheduleRace) {
  const weekend = useWeekendSessions(race);
  const session = weekend.find((s) => s.type === "Race");
  const core = useAsync<SessionCore>(session ? `core:${session.sessionKey}` : null, () => api.core(session!.sessionKey), 60 * 60_000);
  return { session, core };
}

function Replay({ race }: { race: jolpica.ScheduleRace }) {
  const nav = useNavigate();
  const load = useSession((s) => s.load);
  const weekend = useWeekendSessions(race);
  const session = weekend.find((s) => s.type === "Race");
  const laps = useAsync(race.season < FIRST_OPENF1_YEAR && race.season >= 1996 ? `laps:${race.season}:${race.round}` : null, () => api.lapPositions(race.season, race.round), 24 * 3600_000);
  const results = useAsync(`race:${race.season}:${race.round}`, () => api.results(race.season, race.round));

  if (race.season >= FIRST_OPENF1_YEAR) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Archived OpenF1 position samples exist for this race, so it can be replayed on the circuit map with the synchronized leaderboard, race control and telemetry. Playback speeds 0.5× to 10×, a draggable timeline, lap selection and event-by-event navigation are in the transport bar.
        </p>
        {session ? (
          <div className="flex flex-wrap gap-2">
            {weekend.map((s) => (
              <button
                key={s.sessionKey}
                className={cx("btn", s.type === "Race" && "btn-accent")}
                onClick={() => {
                  void load(s.sessionKey);
                  nav("/live");
                }}
              >
                <Icon name="play" size={13} filled /> {s.name}
              </button>
            ))}
          </div>
        ) : (
          <Loading label="Finding the OpenF1 session" />
        )}
      </div>
    );
  }
  if (race.season < 1996) return <Unavailable reason="No lap-by-lap or position data was archived for races before 1996, so no replay is possible." />;
  if (laps.loading && !laps.data) return <Loading label="Loading lap-by-lap positions" />;
  if (laps.error) return <ErrorState message={laps.error.message} onRetry={laps.reload} />;
  return <LapReplay laps={laps.data ?? []} results={results.data?.rows ?? []} />;
}

function Events({ race }: { race: jolpica.ScheduleRace }) {
  const results = useAsync(`race:${race.season}:${race.round}`, () => api.results(race.season, race.round));
  const { core } = useOpenF1Race(race);
  const retirements = (results.data?.rows ?? []).filter((r) => !jolpica.isFinishStatus(r.status));
  const periods = core.data ? neutralPeriods(core.data.raceControl) : [];
  const stewards = core.data ? core.data.raceControl.filter((r) => ["penalty", "investigation", "unsafe-release"].includes(classifyRaceControl(r).kind)) : [];
  const changes = useMemo(() => {
    if (!core.data) return null;
    const c = core.data;
    const first = c.laps.filter((l) => l.lap === 1 && l.start !== null).map((l) => l.start!).sort()[0];
    return detectPositionChanges({ positions: c.positions, pits: c.pits, raceControl: c.raceControl, sourceOvertakes: c.overtakes, from: first });
  }, [core.data]);
  const code = (n: number) => core.data?.drivers.find((d) => d.number === n)?.code ?? String(n);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="label mb-2">Retirements and disqualifications</div>
        {retirements.length === 0 ? (
          <p className="text-sm text-muted">{results.loading ? "Loading…" : "Every starter was classified as running."}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {retirements.map((r) => (
              <li key={r.driver.id} className="flex justify-between gap-2">
                <span>{r.driver.givenName} {r.driver.familyName} <span className="text-xs text-muted">{r.constructor.name}</span></span>
                <span className="text-muted">{r.status}{r.laps !== null ? ` · ${r.laps} laps` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="label mb-2">Safety Car, VSC and red flags</div>
        {race.season < FIRST_OPENF1_YEAR ? (
          <Unavailable reason="Neutralization periods come from race-control messages, available from 2023 via OpenF1." />
        ) : core.loading && !core.data ? (
          <Loading />
        ) : core.error ? (
          <ErrorState message={core.error.message} onRetry={core.reload} />
        ) : periods.length === 0 ? (
          <p className="text-sm text-muted">No neutralizations recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {periods.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={p.kind === "red" ? "chip bg-danger text-white" : "chip bg-warn text-black"}>{p.kind === "safety-car" ? "SC" : p.kind === "vsc" ? "VSC" : "RED"}</span>
                <span className="text-muted">{p.startLap ? `From lap ${p.startLap}` : ""} · {p.end ? `${Math.round((p.end - p.start) / 60000)} min` : "until end"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {race.season >= FIRST_OPENF1_YEAR && (
        <>
          <div>
            <div className="label mb-2">Stewards' decisions</div>
            {stewards.length === 0 ? (
              <p className="text-sm text-muted">{core.data ? "None recorded." : "—"}</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
                {stewards.map((r) => (
                  <li key={r.id}>
                    {r.lap && <span className="num mr-1.5 text-muted">L{r.lap}</span>}
                    {r.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="label mb-2">Position changes (reconstructed)</div>
            {changes ? (
              <div className="text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {(["confirmed", "likely-on-track", "pit-cycle", "neutralized"] as const).map((k) => (
                    <div key={k} className="rounded-lg bg-raised/60 p-2">
                      <div className="label">{k.replace(/-/g, " ")}</div>
                      <div className="num text-lg font-semibold">{changes.filter((c) => c.kind === k).length}</div>
                    </div>
                  ))}
                </div>
                <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted">
                  {changes.filter((c) => c.kind === "confirmed" || c.kind === "likely-on-track").slice(0, 60).map((c) => (
                    <li key={c.id}>
                      {code(c.gainer)} past {code(c.loser)} for P{c.gainerTo} <span className="text-faint">({c.kind === "confirmed" ? "confirmed" : "likely"})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">{core.loading ? "Loading…" : "—"}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
