import { useMemo } from "react";
import { projectChampionship, type PointsKind, type Snapshot } from "@f1/shared";
import { api } from "../api";
import { toBefore, useStandingsBefore } from "../data/championship";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";
import { cx, Loading, Panel, Unavailable } from "./ui";

const Change = ({ n }: { n: number | null }) => (n === null ? <span className="text-faint">new</span> : n === 0 ? <span className="text-faint">–</span> : <span className={n > 0 ? "text-ok" : "text-danger"}>{n > 0 ? "▲" : "▼"}{Math.abs(n)}</span>);

/** Championship points as they would stand if the session ended with the order shown. Derived. */
export function ChampionshipPanel({ snap }: { snap: Snapshot | null }) {
  const session = useSession((s) => s.timeline?.core.session ?? null);
  const demo = useSession((s) => s.server?.mode === "demo");
  const kind: PointsKind | null = session?.type === "Race" ? (/sprint/i.test(session.name) ? "sprint" : "race") : null;
  const { round, before, loading, error } = useStandingsBefore(kind && !demo ? session : null);
  const rows = useMemo(() => {
    if (!kind || !before || !snap) return [];
    const order = new Map(snap.rows.map((r) => [r.driver.code, r.position] as const));
    const names = new Map(snap.rows.map((r) => [r.driver.code, { name: r.driver.fullName, team: r.driver.team }] as const));
    return projectChampionship(before, order, kind, names).filter((r) => r.gain > 0 || r.before > 0 || order.has(r.code));
  }, [kind, before, snap]);

  if (!kind || demo) return null;
  return (
    <Panel
      title="Championship at this moment"
      subtitle={`Points before this ${kind === "sprint" ? "sprint" : "race"} plus what the running order would award. Derived: official points are only awarded at the end.`}
      right={<span className="chip bg-info/15 text-info">DERIVED</span>}
      bodyClass="p-0 max-h-[420px] overflow-auto"
    >
      {loading && !before && <div className="p-4"><Loading label="Loading standings before this race" /></div>}
      {error && !before && <div className="p-4"><Unavailable title="Standings unavailable" reason={`${error.message} Points before the race come from the results archive.`} /></div>}
      {before && round === null && <div className="p-4"><Unavailable reason="This session could not be matched to a round in the results archive." /></div>}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase tracking-wider text-faint">
            <tr><th className="px-3 py-1.5 font-medium">Pos</th><th className="font-medium">Driver</th><th className="text-right font-medium">Before</th><th className="text-right font-medium">Race</th><th className="text-right font-medium">Total</th><th className="pr-3 text-right font-medium">Δ</th></tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.code} className="border-t hairline">
                <td className="px-3 py-1 font-display font-bold">{r.position}</td>
                <td className="font-sans"><span className="font-semibold">{r.name}</span> <span className="text-xs text-faint">{r.code}</span></td>
                <td className="text-right text-muted">{r.before}</td>
                <td className={cx("text-right", r.gain > 0 ? "font-semibold text-ok" : "text-faint")}>{r.gain > 0 ? `+${r.gain}` : "0"}</td>
                <td className="text-right font-semibold">{r.total}</td>
                <td className="pr-3 text-right"><Change n={r.change} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/** Official standings before and after a past Grand Prix. */
export function RaceChampionship({ season, round }: { season: number; round: number }) {
  const before = useAsync(round > 1 ? `dstand:${season}:${round - 1}` : null, () => api.driverStandings(season, round - 1), 60 * 60_000);
  const after = useAsync(`dstand:${season}:${round}`, () => api.driverStandings(season, round), 60 * 60_000);
  const rows = useMemo(() => {
    if (!after.data) return [];
    const prev = new Map(toBefore(round > 1 ? before.data?.rows ?? [] : []).map((b) => [b.code, b] as const));
    return toBefore(after.data.rows).map((a) => {
      const b = prev.get(a.code);
      return { ...a, before: b?.points ?? 0, beforePos: b?.position ?? null };
    });
  }, [after.data, before.data, round]);
  const ready = after.data && (round === 1 || before.data);
  return (
    <div className="mt-5">
      <h3 className="label mb-2">Championship, drivers</h3>
      {!ready && !after.error && <Loading />}
      {after.error && <Unavailable title="Standings unavailable" reason={after.error.message} />}
      {ready && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
              <tr><th className="py-1.5 font-medium">Pos</th><th className="font-medium">Driver</th><th className="text-right font-medium">Before</th><th className="text-right font-medium">Scored</th><th className="text-right font-medium">After</th><th className="text-right font-medium">Δ</th></tr>
            </thead>
            <tbody className="num">
              {rows.map((r) => (
                <tr key={r.code} className="border-t hairline">
                  <td className="py-1 font-display font-bold">{r.position}</td>
                  <td className="font-sans"><span className="font-semibold">{r.name}</span> <span className="text-xs text-faint">{r.team}</span></td>
                  <td className="text-right text-muted">{r.before}</td>
                  <td className={cx("text-right", r.points - r.before > 0 ? "text-ok" : "text-faint")}>{r.points - r.before > 0 ? `+${r.points - r.before}` : "0"}</td>
                  <td className="text-right font-semibold">{r.points}</td>
                  <td className="text-right"><Change n={r.beforePos === null || r.position === null ? null : r.beforePos - r.position} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted">Official standings from the results archive after round {round - 1 || "0"} and after round {round}. Points scored include sprint points from the same weekend.</p>
        </div>
      )}
    </div>
  );
}
