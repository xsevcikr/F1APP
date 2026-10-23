import { Link } from "react-router-dom";
import { formatCountdown, type jolpica } from "@f1/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { Leaderboard } from "../components/Leaderboard";
import { RaceControlFeed } from "../components/RaceControlFeed";
import { TrackMap } from "../components/TrackMap";
import { ErrorState, Loading, Panel, QualityBadge, Unavailable } from "../components/ui";
import { useNow, useSnapshot } from "../hooks/live";
import { useAsync } from "../hooks/useAsync";
import { currentQuality, isLiveSession, useSession } from "../store/session";

export function Overview() {
  const server = useSession((s) => s.server);
  const timeline = useSession((s) => s.timeline);
  const demo = server?.mode === "demo";
  const live = !!timeline && isLiveSession(server, timeline.core.session.sessionKey);
  if (!server) return <Loading label="Connecting to the app server" />;

  return (
    <div className="flex flex-col gap-3">
      {live || demo ? <LiveSummary /> : <SelectedSessionCard />}
      {!demo && (
        <div className="grid gap-3 lg:grid-cols-3">
          <NextSession />
          <LatestResults />
          <Championship />
        </div>
      )}
      {demo && <p className="text-xs text-muted">Calendar, results and standings come from the Jolpica archive and are not shown in demo mode.</p>}
    </div>
  );
}

function LiveSummary() {
  const snap = useSnapshot(4);
  const timeline = useSession((s) => s.timeline);
  if (!timeline) return <Loading label="Connecting to live session" />;
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title="Live circuit" right={<Link to="/live" className="btn py-1 text-xs">Open Live Race <Icon name="chevron" size={14} /></Link>} bodyClass="p-2">
        <TrackMap compact className="h-[360px] xl:h-full xl:min-h-[420px]" />
      </Panel>
      <div className="flex flex-col gap-3">
        <Panel title="Top 10" bodyClass="p-0">
          <Leaderboard snap={snap ? { ...snap, rows: snap.rows.slice(0, 10) } : null} compact />
        </Panel>
        <Panel title="Latest from race control" bodyClass="p-0 max-h-[220px] flex flex-col">
          <RaceControlFeed t={snap?.t ?? 0} compact limit={5} />
        </Panel>
      </div>
    </div>
  );
}

function SelectedSessionCard() {
  const timeline = useSession((s) => s.timeline);
  const phase = useSession((s) => s.phase);
  const server = useSession((s) => s.server);
  const now = useNow(5000);
  if (phase === "loading") return <Loading label="Loading the latest session" />;
  if (!timeline) return null;
  const s = timeline.core.session;
  const results = timeline.core.results.filter((r) => r.position !== null).sort((a, b) => a.position! - b.position!).slice(0, 3);
  return (
    <section className="panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label">No session is live right now</div>
          <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-wide">{timeline.core.meeting?.name ?? s.location}</h1>
          <p className="text-sm text-muted">
            {s.name} · {s.circuitShortName} · {new Date(s.start).toLocaleDateString(undefined, { dateStyle: "medium" })}
          </p>
          {server?.live.reason && server.live.session && <p className="mt-2 max-w-xl text-xs text-warn">{server.live.reason}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/live" className="btn btn-accent">
              <Icon name="play" size={14} filled /> Replay this session
            </Link>
            <Link to="/history" className="btn">
              Browse history
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <QualityBadge quality={currentQuality(now)} />
          {results.length > 0 && (
            <ol className="space-y-1 text-sm">
              {results.map((r) => {
                const d = timeline.drivers.get(r.driver);
                return (
                  <li key={r.driver} className="flex items-center gap-2">
                    <span className="num w-5 text-right font-display font-bold">{r.position}</span>
                    <span className="h-4 w-1 rounded-full" style={{ background: d?.teamColour ?? "#777" }} />
                    <span className="font-display font-bold">{d?.code ?? r.driver}</span>
                    <span className="text-xs text-muted">{d?.team}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function NextSession() {
  const now = useNow(1000);
  const schedule = useAsync("schedule:current", () => api.schedule("current"));
  if (schedule.loading && !schedule.data) return <Panel title="Next session"><Loading /></Panel>;
  if (schedule.error) return <Panel title="Next session"><ErrorState message={schedule.error.message} onRetry={schedule.reload} /></Panel>;
  const upcoming = (schedule.data ?? []).flatMap((r) => r.sessions.map((s) => ({ race: r, s }))).find(({ s }) => (s.start ?? Date.parse(s.date)) > now);
  if (!upcoming)
    return (
      <Panel title="Next session">
        <Unavailable title="Season complete" reason="No further sessions are published for this season yet." />
      </Panel>
    );
  const { race, s } = upcoming;
  const start = s.start ?? Date.parse(s.date);
  return (
    <Panel title="Next session" right={<Link to="/calendar" className="text-xs text-muted hover:text-fg">Calendar →</Link>}>
      <div className="label">Round {race.round} · {s.kind}</div>
      <div className="mt-1 font-display text-xl font-black uppercase">{race.name}</div>
      <div className="text-sm text-muted">{race.circuit.name}, {race.circuit.locality}</div>
      <div className="num mt-4 font-display text-4xl font-black tracking-tight text-accent">{formatCountdown(start - now)}</div>
      <div className="mt-1 text-xs text-muted">
        {s.start ? new Date(s.start).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : `${s.date} (time not yet published)`}
      </div>
      <ul className="mt-4 space-y-1 text-xs">
        {race.sessions.map((x) => (
          <li key={x.kind} className="flex justify-between gap-2">
            <span className={x === s ? "font-semibold text-fg" : "text-muted"}>{x.kind}</span>
            <span className="num text-muted">{x.start ? new Date(x.start).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : x.date}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LatestResults() {
  const now = useNow(60_000);
  const schedule = useAsync("schedule:current", () => api.schedule("current"));
  const last = (schedule.data ?? []).filter((r) => (r.raceStart ?? Date.parse(r.raceDate)) + 3 * 3600_000 < now).pop() as jolpica.ScheduleRace | undefined;
  const res = useAsync(last ? `results:${last.season}:${last.round}` : null, () => api.results(last!.season, last!.round));
  return (
    <Panel title="Latest race result" subtitle={last ? `${last.name} · Round ${last.round}` : undefined} right={<Link to="/history" className="text-xs text-muted hover:text-fg">History →</Link>} bodyClass="p-0">
      {(schedule.loading || res.loading) && !res.data && <Loading />}
      {res.error && <div className="p-3"><ErrorState message={res.error.message} onRetry={res.reload} /></div>}
      {schedule.data && !last && <div className="p-4"><Unavailable title="No race yet" reason="No race of this season has finished yet." /></div>}
      {res.data === null && <div className="p-4"><Unavailable title="Not yet published" reason="The official classification has not reached the archive yet." /></div>}
      {res.data && (
        <ol className="divide-hairline">
          {res.data.rows.slice(0, 10).map((r) => (
            <li key={r.driver.id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
              <span className="num w-5 text-right font-display font-bold">{r.positionText}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{r.driver.givenName} {r.driver.familyName}</span> <span className="text-xs text-muted">{r.constructor.name}</span>
              </span>
              {r.fastestLap?.rank === 1 && <span className="chip bg-best/20 text-best" title={`Fastest lap ${r.fastestLap.time}`}>FL</span>}
              <span className="num text-xs text-muted">{r.time ?? r.status}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Championship() {
  const drivers = useAsync("standings:drivers:current", () => api.driverStandings("current"));
  const teams = useAsync("standings:teams:current", () => api.constructorStandings("current"));
  return (
    <Panel title="Championship" subtitle={drivers.data ? `${drivers.data.season} after round ${drivers.data.round}` : undefined} right={<Link to="/drivers" className="text-xs text-muted hover:text-fg">Drivers & Teams →</Link>}>
      {drivers.loading && !drivers.data && <Loading />}
      {drivers.error && <ErrorState message={drivers.error.message} onRetry={drivers.reload} />}
      {drivers.data && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="label mb-1.5">Drivers</div>
            <ol className="space-y-1">
              {drivers.data.rows.slice(0, 5).map((r) => (
                <li key={r.driver.id} className="flex justify-between gap-2">
                  <span className="truncate"><span className="num mr-1.5 text-muted">{r.position}</span>{r.driver.code ?? r.driver.familyName}</span>
                  <span className="num font-semibold">{r.points}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="label mb-1.5">Constructors</div>
            <ol className="space-y-1">
              {teams.data?.rows.slice(0, 5).map((r) => (
                <li key={r.constructor.id} className="flex justify-between gap-2">
                  <span className="truncate"><span className="num mr-1.5 text-muted">{r.position}</span>{r.constructor.name}</span>
                  <span className="num font-semibold">{r.points}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-muted">Official standings from the Jolpica archive.</p>
    </Panel>
  );
}
