// Season statistics derived from official classifications. Everything here is
// computed from archived results; nothing is estimated.
import { jolpica } from "@f1/shared";

type Race = jolpica.RaceWithRows<jolpica.ClassificationRow>;
type Quali = jolpica.RaceWithRows<jolpica.QualifyingRow>;

export interface DriverSeasonStats {
  driverId: string;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  finishes: number;
  dnfs: number;
  bestFinish: number | null;
  avgFinish: number | null;
  avgGrid: number | null;
  points: number;
  sprintPoints: number;
  recent: { round: number; race: string; pos: string; points: number }[];
  /** Cumulative points after each round (race + sprint), derived from classifications. */
  progression: { round: number; points: number }[];
  qualifying: { round: number; race: string; pos: number | null }[];
}

export function driverSeasonStats(driverId: string, races: Race[], sprints: Race[], qualis: Quali[]): DriverSeasonStats {
  let wins = 0, podiums = 0, fastestLaps = 0, finishes = 0, dnfs = 0, points = 0, sprintPoints = 0, starts = 0;
  let best: number | null = null;
  const finishPos: number[] = [];
  const grids: number[] = [];
  const recent: DriverSeasonStats["recent"] = [];
  const perRound = new Map<number, number>();

  for (const r of races) {
    const row = r.rows.find((x) => x.driver.id === driverId);
    if (!row) continue;
    starts++;
    const p = row.points ?? 0;
    points += p;
    perRound.set(r.race.round, (perRound.get(r.race.round) ?? 0) + p);
    if (row.position === 1) wins++;
    if (row.position !== null && row.position <= 3 && /^\d+$/.test(row.positionText)) podiums++;
    if (row.fastestLap?.rank === 1) fastestLaps++;
    if (jolpica.isFinishStatus(row.status)) {
      finishes++;
      if (row.position !== null) finishPos.push(row.position);
    } else dnfs++;
    if (/^\d+$/.test(row.positionText) && row.position !== null) best = best === null ? row.position : Math.min(best, row.position);
    if (row.grid) grids.push(row.grid);
    recent.push({ round: r.race.round, race: r.race.name, pos: row.positionText, points: p });
  }
  for (const s of sprints) {
    const row = s.rows.find((x) => x.driver.id === driverId);
    if (!row) continue;
    sprintPoints += row.points ?? 0;
    perRound.set(s.race.round, (perRound.get(s.race.round) ?? 0) + (row.points ?? 0));
  }
  const qualifying = qualis.flatMap((q) => {
    const row = q.rows.find((x) => x.driver.id === driverId);
    return row ? [{ round: q.race.round, race: q.race.name, pos: row.position }] : [];
  });
  const rounds = [...new Set([...races.map((r) => r.race.round), ...sprints.map((s) => s.race.round)])].sort((a, b) => a - b);
  let acc = 0;
  const progression = rounds.map((round) => ({ round, points: (acc += perRound.get(round) ?? 0) }));
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return {
    driverId,
    starts,
    wins,
    podiums,
    poles: qualifying.filter((q) => q.pos === 1).length,
    fastestLaps,
    finishes,
    dnfs,
    bestFinish: best,
    avgFinish: avg(finishPos),
    avgGrid: avg(grids),
    points: points + sprintPoints,
    sprintPoints,
    recent: recent.slice(-5).reverse(),
    progression,
    qualifying,
  };
}

export interface HeadToHead {
  teammateId: string;
  races: { ahead: number; behind: number };
  qualifying: { ahead: number; behind: number };
}

/** Head-to-head against every teammate who shared a car with the driver this season. */
export function teammateComparison(driverId: string, races: Race[], qualis: Quali[]): HeadToHead[] {
  const out = new Map<string, HeadToHead>();
  const get = (id: string) => out.get(id) ?? out.set(id, { teammateId: id, races: { ahead: 0, behind: 0 }, qualifying: { ahead: 0, behind: 0 } }).get(id)!;
  for (const r of races) {
    const me = r.rows.find((x) => x.driver.id === driverId);
    if (!me) continue;
    for (const mate of r.rows.filter((x) => x.constructor.id === me.constructor.id && x.driver.id !== driverId)) {
      const h = get(mate.driver.id);
      // Both classified: compare positions. Otherwise the classified one is ahead.
      if (me.position !== null && mate.position !== null) (me.position < mate.position ? h.races.ahead++ : h.races.behind++);
    }
  }
  for (const q of qualis) {
    const me = q.rows.find((x) => x.driver.id === driverId);
    if (!me) continue;
    for (const mate of q.rows.filter((x) => x.constructor.id === me.constructor.id && x.driver.id !== driverId)) {
      const h = get(mate.driver.id);
      if (me.position !== null && mate.position !== null) (me.position < mate.position ? h.qualifying.ahead++ : h.qualifying.behind++);
    }
  }
  return [...out.values()];
}

export function constructorProgression(constructorId: string, races: Race[], sprints: Race[]) {
  const perRound = new Map<number, number>();
  const perDriver = new Map<string, { name: string; points: number }>();
  for (const list of [races, sprints])
    for (const r of list)
      for (const row of r.rows.filter((x) => x.constructor.id === constructorId)) {
        perRound.set(r.race.round, (perRound.get(r.race.round) ?? 0) + (row.points ?? 0));
        const d = perDriver.get(row.driver.id) ?? { name: `${row.driver.givenName} ${row.driver.familyName}`, points: 0 };
        d.points += row.points ?? 0;
        perDriver.set(row.driver.id, d);
      }
  const rounds = [...new Set(races.map((r) => r.race.round))].sort((a, b) => a - b);
  let acc = 0;
  return { progression: rounds.map((round) => ({ round, points: (acc += perRound.get(round) ?? 0) })), drivers: [...perDriver.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.points - a.points) };
}
