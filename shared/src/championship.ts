// Championship points as they would stand for a running order. Derived, never
// official: the FIA only awards points when a session is classified.

/** Points for P1..P10 in a Grand Prix and P1..P8 in a sprint (2022 onward). */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

export type PointsKind = "race" | "sprint";

export function pointsFor(kind: PointsKind, position: number | null): number {
  if (!position || position < 1) return 0;
  return (kind === "race" ? RACE_POINTS : SPRINT_POINTS)[position - 1] ?? 0;
}

export interface StandingBefore {
  code: string;
  name: string;
  team: string;
  points: number;
  position: number | null;
}

export interface ProjectedRow {
  code: string;
  name: string;
  team: string;
  before: number;
  beforePosition: number | null;
  gain: number;
  total: number;
  position: number;
  /** Places gained (+) or lost (-) in the championship against before the session. */
  change: number | null;
}

/**
 * Standings before a session plus the points its running order would award.
 * `order` maps a driver code to the position shown. Drivers missing from
 * `before` (new or substitute drivers) start from zero.
 */
export function projectChampionship(before: readonly StandingBefore[], order: ReadonlyMap<string, number | null>, kind: PointsKind, names: ReadonlyMap<string, { name: string; team: string }> = new Map()): ProjectedRow[] {
  const rows = new Map<string, Omit<ProjectedRow, "position" | "change">>();
  for (const b of before) rows.set(b.code, { code: b.code, name: b.name, team: b.team, before: b.points, beforePosition: b.position, gain: 0, total: b.points });
  for (const [code, pos] of order) {
    const gain = pointsFor(kind, pos);
    const row = rows.get(code) ?? { code, name: names.get(code)?.name ?? code, team: names.get(code)?.team ?? "", before: 0, beforePosition: null, gain: 0, total: 0 };
    row.gain = gain;
    row.total = row.before + gain;
    rows.set(code, row);
  }
  const sorted = [...rows.values()].sort((a, b) => b.total - a.total || b.gain - a.gain || (a.beforePosition ?? 99) - (b.beforePosition ?? 99));
  return sorted.map((r, i) => ({ ...r, position: i + 1, change: r.beforePosition === null ? null : r.beforePosition - (i + 1) }));
}
