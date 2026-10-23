// Converts Jolpica (Ergast-compatible) MRData responses into small typed records.
// Jolpica sends every number as a string, so everything goes through toNum.

type Raw = Record<string, any>;

const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ErgastDriver {
  id: string;
  code: string | null;
  number: number | null;
  givenName: string;
  familyName: string;
  nationality: string;
  dateOfBirth: string | null;
  url: string | null;
}

export interface ErgastConstructor {
  id: string;
  name: string;
  nationality: string;
}

export interface ErgastCircuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number | null;
  long: number | null;
  url: string | null;
}

export interface ScheduleSession {
  kind: "FP1" | "FP2" | "FP3" | "Qualifying" | "Sprint Qualifying" | "Sprint" | "Race";
  start: number | null; // null when only a date without time is published
  date: string; // YYYY-MM-DD
}

export interface ScheduleRace {
  season: number;
  round: number;
  name: string;
  circuit: ErgastCircuit;
  sessions: ScheduleSession[];
  raceStart: number | null;
  raceDate: string;
  url: string | null;
}

export interface ClassificationRow {
  position: number | null;
  positionText: string; // "R" retired, "D" disqualified, "W" withdrawn, "N" not classified...
  number: number | null;
  driver: ErgastDriver;
  constructor: ErgastConstructor;
  grid: number | null;
  laps: number | null;
  status: string;
  time: string | null;
  millis: number | null;
  points: number | null;
  fastestLap: { rank: number | null; lap: number | null; time: string | null } | null;
}

export interface QualifyingRow {
  position: number | null;
  number: number | null;
  driver: ErgastDriver;
  constructor: ErgastConstructor;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

export interface DriverStanding {
  position: number | null;
  points: number;
  wins: number;
  driver: ErgastDriver;
  constructors: ErgastConstructor[];
}

export interface ConstructorStanding {
  position: number | null;
  points: number;
  wins: number;
  constructor: ErgastConstructor;
}

export interface PitStopRow {
  driverId: string;
  lap: number | null;
  stop: number | null;
  time: string | null;
  duration: string | null;
}

export interface LapPositionRow {
  lap: number;
  timings: { driverId: string; position: number | null; time: string | null }[];
}

export function driver(r: Raw | undefined): ErgastDriver {
  return {
    id: r?.driverId ?? "unknown",
    code: r?.code ?? null,
    number: toNum(r?.permanentNumber),
    givenName: r?.givenName ?? "",
    familyName: r?.familyName ?? "",
    nationality: r?.nationality ?? "",
    dateOfBirth: r?.dateOfBirth ?? null,
    url: r?.url ?? null,
  };
}

export function constructor(r: Raw | undefined): ErgastConstructor {
  return { id: r?.constructorId ?? "unknown", name: r?.name ?? "", nationality: r?.nationality ?? "" };
}

export function circuit(r: Raw | undefined): ErgastCircuit {
  return {
    id: r?.circuitId ?? "unknown",
    name: r?.circuitName ?? "",
    locality: r?.Location?.locality ?? "",
    country: r?.Location?.country ?? "",
    lat: toNum(r?.Location?.lat),
    long: toNum(r?.Location?.long),
    url: r?.url ?? null,
  };
}

/** Combines an Ergast date and optional time ("13:00:00Z") into epoch ms. */
export function dateTime(date: string | undefined, time: string | undefined): number | null {
  if (!date || !time) return null;
  const t = Date.parse(`${date}T${time.endsWith("Z") ? time : `${time}Z`}`);
  return Number.isNaN(t) ? null : t;
}

const SESSION_KEYS: [string, ScheduleSession["kind"]][] = [
  ["FirstPractice", "FP1"],
  ["SecondPractice", "FP2"],
  ["ThirdPractice", "FP3"],
  ["SprintQualifying", "Sprint Qualifying"],
  ["SprintShootout", "Sprint Qualifying"],
  ["Sprint", "Sprint"],
  ["Qualifying", "Qualifying"],
];

export function scheduleRace(r: Raw): ScheduleRace {
  const sessions: ScheduleSession[] = [];
  for (const [key, kind] of SESSION_KEYS) {
    const s = r[key];
    if (s?.date) sessions.push({ kind, date: s.date, start: dateTime(s.date, s.time) });
  }
  const raceStart = dateTime(r.date, r.time);
  sessions.push({ kind: "Race", date: r.date, start: raceStart });
  sessions.sort((a, b) => (a.start ?? Date.parse(a.date)) - (b.start ?? Date.parse(b.date)));
  return {
    season: toNum(r.season) ?? 0,
    round: toNum(r.round) ?? 0,
    name: r.raceName ?? "",
    circuit: circuit(r.Circuit),
    sessions,
    raceStart,
    raceDate: r.date ?? "",
    url: r.url ?? null,
  };
}

export function races(mr: Raw): Raw[] {
  return mr?.MRData?.RaceTable?.Races ?? [];
}

export function schedule(mr: Raw): ScheduleRace[] {
  return races(mr).map(scheduleRace);
}

export function classificationRow(r: Raw): ClassificationRow {
  return {
    position: toNum(r.position),
    positionText: r.positionText ?? "",
    number: toNum(r.number),
    driver: driver(r.Driver),
    constructor: constructor(r.Constructor),
    grid: toNum(r.grid),
    laps: toNum(r.laps),
    status: r.status ?? "",
    time: r.Time?.time ?? null,
    millis: toNum(r.Time?.millis),
    points: toNum(r.points),
    fastestLap: r.FastestLap
      ? { rank: toNum(r.FastestLap.rank), lap: toNum(r.FastestLap.lap), time: r.FastestLap.Time?.time ?? null }
      : null,
  };
}

export function qualifyingRow(r: Raw): QualifyingRow {
  return {
    position: toNum(r.position),
    number: toNum(r.number),
    driver: driver(r.Driver),
    constructor: constructor(r.Constructor),
    q1: r.Q1 || null,
    q2: r.Q2 || null,
    q3: r.Q3 || null,
  };
}

export interface RaceWithRows<T> {
  race: ScheduleRace;
  rows: T[];
}

export function raceResults(mr: Raw, key: "Results" | "SprintResults" = "Results"): RaceWithRows<ClassificationRow>[] {
  return races(mr).map((r) => ({ race: scheduleRace(r), rows: (r[key] ?? []).map(classificationRow) }));
}

export function qualifyingResults(mr: Raw): RaceWithRows<QualifyingRow>[] {
  return races(mr).map((r) => ({ race: scheduleRace(r), rows: (r.QualifyingResults ?? []).map(qualifyingRow) }));
}

export function pitStops(mr: Raw): PitStopRow[] {
  const r = races(mr)[0];
  return (r?.PitStops ?? []).map((p: Raw) => ({
    driverId: p.driverId,
    lap: toNum(p.lap),
    stop: toNum(p.stop),
    time: p.time ?? null,
    duration: p.duration ?? null,
  }));
}

export function lapPositions(mr: Raw): LapPositionRow[] {
  const r = races(mr)[0];
  return (r?.Laps ?? []).map((l: Raw) => ({
    lap: toNum(l.number) ?? 0,
    timings: (l.Timings ?? []).map((t: Raw) => ({ driverId: t.driverId, position: toNum(t.position), time: t.time ?? null })),
  }));
}

export function driverStandings(mr: Raw): { season: number; round: number; rows: DriverStanding[] } {
  const list = mr?.MRData?.StandingsTable?.StandingsLists?.[0];
  return {
    season: toNum(list?.season) ?? 0,
    round: toNum(list?.round) ?? 0,
    rows: (list?.DriverStandings ?? []).map((s: Raw) => ({
      position: toNum(s.position),
      points: toNum(s.points) ?? 0,
      wins: toNum(s.wins) ?? 0,
      driver: driver(s.Driver),
      constructors: (s.Constructors ?? []).map(constructor),
    })),
  };
}

export function constructorStandings(mr: Raw): { season: number; round: number; rows: ConstructorStanding[] } {
  const list = mr?.MRData?.StandingsTable?.StandingsLists?.[0];
  return {
    season: toNum(list?.season) ?? 0,
    round: toNum(list?.round) ?? 0,
    rows: (list?.ConstructorStandings ?? []).map((s: Raw) => ({
      position: toNum(s.position),
      points: toNum(s.points) ?? 0,
      wins: toNum(s.wins) ?? 0,
      constructor: constructor(s.Constructor),
    })),
  };
}

/** "1:23.456" or "83.456" to seconds. */
export function lapTimeToSeconds(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  let s = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    s = s * 60 + n;
  }
  return s;
}

/** True when the status means the car was still running at the flag. */
export function isFinishStatus(status: string): boolean {
  return status === "Finished" || /^\+\d+ Laps?$/.test(status) || status === "Lapped";
}
