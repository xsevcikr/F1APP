import { useMemo } from "react";
import { jolpica, type SessionInfo, type StandingBefore } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";

const DAY = 86_400_000;

export const toBefore = (rows: ReturnType<typeof jolpica.driverStandings>["rows"]): StandingBefore[] =>
  rows.map((r) => ({
    code: r.driver.code ?? r.driver.familyName.slice(0, 3).toUpperCase(),
    name: `${r.driver.givenName} ${r.driver.familyName}`,
    team: r.constructors[0]?.name ?? "",
    points: r.points,
    position: r.position,
  }));

/**
 * Championship standings before the Grand Prix weekend a session belongs to
 * (the archive's standings after the previous round).
 */
export function useStandingsBefore(session: SessionInfo | null) {
  const year = session?.year ?? 0;
  const schedule = useAsync(session ? `schedule:${year}` : null, () => api.schedule(year), 60 * 60_000);
  const round = useMemo(() => {
    if (!session || !schedule.data) return null;
    return schedule.data.find((r) => Math.abs((r.raceStart ?? Date.parse(r.raceDate)) - session.start) < 4 * DAY)?.round ?? null;
  }, [session, schedule.data]);
  const standings = useAsync(round && round > 1 ? `dstand:${year}:${round - 1}` : null, () => api.driverStandings(year, round! - 1), 60 * 60_000);
  const before = useMemo(() => (round === 1 ? [] : standings.data ? toBefore(standings.data.rows) : null), [round, standings.data]);
  return { round, before, loading: schedule.loading || standings.loading, error: schedule.error ?? standings.error ?? null };
}
