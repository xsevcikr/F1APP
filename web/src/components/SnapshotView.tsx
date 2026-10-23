import { Link } from "react-router-dom";
import { SNAPSHOT_DATE, SNAPSHOT_METHOD, SNAPSHOT_SOURCE, type SnapRace, type SnapSeason } from "../data/historySnapshot";
import { recapsFor } from "../data/recaps";
import { cx } from "./ui";

/** Says plainly that these figures are a bundled copy, not a live archive response. */
export function SnapshotNote({ className }: { className?: string }) {
  return (
    <p className={cx("rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-fg", className)} role="note">
      <span className="font-semibold">Research snapshot, read on {SNAPSHOT_DATE}.</span> The live results archive could not be reached, so this is a copy bundled with the app. {SNAPSHOT_SOURCE} {SNAPSHOT_METHOD}
    </p>
  );
}

export function PodiumList({ race }: { race: SnapRace }) {
  return (
    <ol className="divide-hairline">
      {race.podium.map((p) => (
        <li key={p.pos} className="flex items-center gap-3 px-1 py-1.5 text-sm">
          <span className="num w-5 text-right font-display font-bold">{p.pos}</span>
          <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{p.driver}</span> <span className="text-xs text-muted">{p.constructor}</span></span>
          <span className="num text-xs text-muted">{p.time}</span>
        </li>
      ))}
    </ol>
  );
}

/** Every race of a season with its podium, newest first. */
export function SnapshotRaces({ season, data, who, where }: { season: number; data: SnapSeason; who: string; where: string }) {
  const q = (s: string, n: string) => s.toLowerCase().includes(n.trim().toLowerCase());
  const list = data.races.filter((r) => (!where || q(r.name, where)) && (!who || r.podium.some((p) => q(`${p.driver} ${p.constructor}`, who)))).slice().reverse();
  return (
    <ul className="flex flex-col gap-3">
      {list.length === 0 && <li className="text-sm text-muted">No Grand Prix in {season} matches.</li>}
      {list.map((r) => (
        <li key={r.round} className="panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-black uppercase italic">
              <Link to={`/races/${season}/${r.round}`} className="hover:underline"><span className="num mr-2 text-accent">R{r.round}</span>{r.name}</Link>
            </h2>
            <span className="text-xs text-muted">{r.date}</span>
          </div>
          <div className="mt-1 text-sm text-muted">Winner: <span className="font-semibold text-fg">{r.podium[0]?.driver}</span> · {r.podium[0]?.constructor}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="btn btn-accent" to={`/races/${season}/${r.round}`}>Podium</Link>
            {recapsFor(season, r.name).length > 0 && <Link className="btn" to={`/races/${season}/${r.round}#recap`}>Recap</Link>}
          </div>
        </li>
      ))}
    </ul>
  );
}
