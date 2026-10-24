import { useMemo } from "react";
import { ENTRIES_2026, joinStandings, snapshotTable, type SeasonEntries, type SeasonTable } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";

export const ENTRY_SEASON = ENTRIES_2026.season;

export interface SeasonView {
  entries: SeasonEntries;
  table: SeasonTable;
  /** True while the live standings request is still running. */
  loading: boolean;
  /** Why the feed was not used, when the table is the snapshot. */
  error: string | null;
  reload: () => void;
}

/**
 * The 2026 teams and drivers with their championship positions. Positions and
 * points come from the standings feed (Jolpica). When the feed cannot be
 * reached the bundled, dated snapshot is shown and labelled as such.
 */
export function useSeason(): SeasonView {
  const ds = useAsync(`standings:drivers:${ENTRY_SEASON}`, () => api.driverStandings(ENTRY_SEASON), 10 * 60_000);
  const cs = useAsync(`standings:teams:${ENTRY_SEASON}`, () => api.constructorStandings(ENTRY_SEASON), 10 * 60_000);
  const table = useMemo<SeasonTable>(() => {
    if (cs.data && cs.data.rows.length > 0) {
      const t = joinStandings(ENTRIES_2026, {
        round: cs.data.round || null,
        constructors: cs.data.rows,
        drivers: (ds.data?.rows ?? []).map((r) => ({ position: r.position, points: r.points, wins: r.wins, driver: { id: r.driver.id, code: r.driver.code, number: r.driver.number, familyName: r.driver.familyName } })),
      });
      return t;
    }
    return snapshotTable(ENTRIES_2026);
  }, [cs.data, ds.data]);
  return {
    entries: ENTRIES_2026,
    table,
    loading: cs.loading || ds.loading,
    error: table.basis === "snapshot" ? (cs.error?.message ?? ds.error?.message ?? null) : null,
    reload: () => {
      cs.reload();
      ds.reload();
    },
  };
}

export function standingsNote(v: SeasonView): string {
  if (v.table.basis === "feed") return `Standings after round ${v.table.round ?? "?"} · Jolpica results feed`;
  const when = v.table.asOf ? new Date(v.table.asOf + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  return `${v.loading ? "Refreshing · showing " : ""}Snapshot after round ${v.table.round}, ${when}, from third-party standings tables. Live standings feed unavailable.`;
}
