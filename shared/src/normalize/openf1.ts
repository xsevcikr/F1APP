// Converts raw OpenF1 JSON (https://openf1.org/docs) into the normalized model.
// Each function tolerates missing or null fields, because the API omits values
// it does not have rather than sending defaults.
import type {
  CarSample,
  Compound,
  DriverInfo,
  Gap,
  GridRecord,
  IntervalRecord,
  LapRecord,
  LocationSample,
  MeetingInfo,
  PitRecord,
  PositionRecord,
  RaceControlRecord,
  ResultRecord,
  SessionInfo,
  SessionType,
  SourceOvertake,
  StintRecord,
  WeatherRecord,
} from "../types.ts";

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Parses an ISO date; returns null for anything unparseable. */
export function parseDate(v: unknown): number | null {
  if (typeof v !== "string") return null;
  // OpenF1 sends "2023-09-16T13:59:07.606000+00:00"; Date.parse handles it.
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** OpenF1 gaps are a number of seconds, "+1 LAP" / "+2 LAPS" strings, or null for the leader. */
export function parseGap(v: unknown, isLeaderWhenNull = false): Gap | null {
  if (typeof v === "number" && Number.isFinite(v)) return { kind: "time", seconds: v };
  if (typeof v === "string") {
    const m = v.match(/^\+?\s*(\d+)\s*LAPS?$/i);
    if (m) return { kind: "laps", laps: Number(m[1]) };
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return { kind: "time", seconds: n };
  }
  if (v === null && isLeaderWhenNull) return { kind: "leader" };
  return null;
}

export function sessionTypeOf(name: string | null, type: string | null): SessionType {
  const n = (name ?? "").toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (n.includes("sprint") && (n.includes("qualifying") || n.includes("shootout"))) return "Sprint Qualifying";
  if (n === "sprint" || (t === "race" && n.includes("sprint"))) return "Sprint";
  if (t === "race" || n === "race") return "Race";
  if (t === "qualifying" || n.includes("qualifying")) return "Qualifying";
  if (t === "practice" || n.includes("practice")) return "Practice";
  return "Unknown";
}

function offset(v: unknown): string {
  const s = str(v);
  if (!s) return "+00:00";
  const m = s.match(/^(-)?(\d{2}):(\d{2})/);
  if (!m) return "+00:00";
  return `${m[1] ? "-" : "+"}${m[2]}:${m[3]}`;
}

export function normalizeSession(r: Raw): SessionInfo | null {
  const key = num(r.session_key);
  const start = parseDate(r.date_start);
  if (key === null || start === null) return null;
  const name = str(r.session_name) ?? "Session";
  return {
    sessionKey: key,
    meetingKey: num(r.meeting_key) ?? 0,
    name,
    type: sessionTypeOf(name, str(r.session_type)),
    year: num(r.year) ?? new Date(start).getUTCFullYear(),
    circuitKey: num(r.circuit_key),
    circuitShortName: str(r.circuit_short_name) ?? "",
    location: str(r.location) ?? "",
    countryName: str(r.country_name) ?? "",
    countryCode: str(r.country_code) ?? "",
    start,
    end: parseDate(r.date_end) ?? start,
    gmtOffset: offset(r.gmt_offset),
    cancelled: r.is_cancelled === true,
    provider: "openf1",
  };
}

export function normalizeMeeting(r: Raw): MeetingInfo | null {
  const key = num(r.meeting_key);
  const start = parseDate(r.date_start);
  if (key === null || start === null) return null;
  return {
    meetingKey: key,
    name: str(r.meeting_name) ?? "",
    officialName: str(r.meeting_official_name) ?? str(r.meeting_name) ?? "",
    location: str(r.location) ?? "",
    countryName: str(r.country_name) ?? "",
    countryCode: str(r.country_code) ?? "",
    circuitShortName: str(r.circuit_short_name) ?? "",
    circuitType: str(r.circuit_type),
    year: num(r.year) ?? new Date(start).getUTCFullYear(),
    start,
    end: parseDate(r.date_end) ?? start,
    gmtOffset: offset(r.gmt_offset),
  };
}

export function normalizeDriver(r: Raw): DriverInfo | null {
  const n = num(r.driver_number);
  if (n === null) return null;
  const colour = str(r.team_colour);
  const last = str(r.last_name) ?? "";
  return {
    number: n,
    code: str(r.name_acronym) ?? (last.slice(0, 3).toUpperCase() || String(n)),
    firstName: str(r.first_name) ?? "",
    lastName: last,
    fullName: str(r.full_name) ?? `${str(r.first_name) ?? ""} ${last}`.trim(),
    broadcastName: str(r.broadcast_name) ?? "",
    team: str(r.team_name) ?? "Unknown team",
    teamColour: colour && /^#?[0-9a-f]{6}$/i.test(colour) ? `#${colour.replace("#", "")}` : null,
    headshotUrl: str(r.headshot_url),
  };
}

/** OpenF1 returns one driver row per session; keep the latest non-empty row per number. */
export function normalizeDrivers(rows: Raw[]): DriverInfo[] {
  const byNumber = new Map<number, DriverInfo>();
  for (const r of rows) {
    const d = normalizeDriver(r);
    if (!d) continue;
    const prev = byNumber.get(d.number);
    byNumber.set(d.number, prev ? { ...prev, ...stripNulls(d) } : d);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function stripNulls<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== "")) as Partial<T>;
}

const segs = (v: unknown): number[] | null =>
  Array.isArray(v) ? v.map((x) => (typeof x === "number" ? x : 0)) : null;

export function normalizeLap(r: Raw): LapRecord | null {
  const driver = num(r.driver_number);
  const lap = num(r.lap_number);
  if (driver === null || lap === null) return null;
  return {
    driver,
    lap,
    start: parseDate(r.date_start),
    duration: num(r.lap_duration),
    s1: num(r.duration_sector_1),
    s2: num(r.duration_sector_2),
    s3: num(r.duration_sector_3),
    i1Speed: num(r.i1_speed),
    i2Speed: num(r.i2_speed),
    stSpeed: num(r.st_speed),
    pitOutLap: r.is_pit_out_lap === true,
    segments: [segs(r.segments_sector_1), segs(r.segments_sector_2), segs(r.segments_sector_3)],
  };
}

const COMPOUNDS: Compound[] = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

export function normalizeCompound(v: unknown): Compound {
  const s = (str(v) ?? "").toUpperCase();
  return (COMPOUNDS as string[]).includes(s) ? (s as Compound) : "UNKNOWN";
}

export function normalizeStint(r: Raw): StintRecord | null {
  const driver = num(r.driver_number);
  const lapStart = num(r.lap_start);
  if (driver === null || lapStart === null) return null;
  return {
    driver,
    stint: num(r.stint_number) ?? 0,
    compound: normalizeCompound(r.compound),
    lapStart,
    lapEnd: num(r.lap_end),
    tyreAgeAtStart: num(r.tyre_age_at_start),
  };
}

export function normalizePit(r: Raw): PitRecord | null {
  const driver = num(r.driver_number);
  const ts = parseDate(r.date);
  if (driver === null || ts === null) return null;
  return {
    driver,
    ts,
    lap: num(r.lap_number),
    // pit_duration is the deprecated name of lane_duration.
    laneDuration: num(r.lane_duration) ?? num(r.pit_duration),
    stopDuration: num(r.stop_duration),
  };
}

export function normalizePosition(r: Raw): PositionRecord | null {
  const driver = num(r.driver_number);
  const ts = parseDate(r.date);
  const position = num(r.position);
  if (driver === null || ts === null || position === null) return null;
  return { driver, ts, position };
}

export function normalizeInterval(r: Raw): IntervalRecord | null {
  const driver = num(r.driver_number);
  const ts = parseDate(r.date);
  if (driver === null || ts === null) return null;
  // A null gap_to_leader means the driver is the leader only when interval is null too.
  const leader = r.gap_to_leader === null && r.interval === null;
  return {
    driver,
    ts,
    gapToLeader: leader ? { kind: "leader" } : parseGap(r.gap_to_leader),
    interval: leader ? { kind: "leader" } : parseGap(r.interval),
  };
}

export function normalizeLocation(r: Raw): LocationSample | null {
  const driver = num(r.driver_number);
  const ts = parseDate(r.date);
  const x = num(r.x);
  const y = num(r.y);
  if (driver === null || ts === null || x === null || y === null) return null;
  return { driver, ts, x, y, z: num(r.z) ?? 0 };
}

export function normalizeCarData(r: Raw): CarSample | null {
  const driver = num(r.driver_number);
  const ts = parseDate(r.date);
  if (driver === null || ts === null) return null;
  return {
    driver,
    ts,
    speed: num(r.speed),
    throttle: num(r.throttle),
    brake: num(r.brake),
    gear: num(r.n_gear),
    rpm: num(r.rpm),
    drs: num(r.drs),
  };
}

export function normalizeRaceControl(r: Raw): RaceControlRecord | null {
  const ts = parseDate(r.date);
  const message = str(r.message);
  if (ts === null || !message) return null;
  return {
    // OpenF1 has no message id; date + message is unique in practice.
    id: `${ts}:${message}`,
    ts,
    category: str(r.category) ?? "Other",
    flag: str(r.flag),
    message,
    scope: str(r.scope),
    sector: num(r.sector),
    driver: num(r.driver_number),
    lap: num(r.lap_number),
    qualifyingPhase: num(r.qualifying_phase),
  };
}

export function normalizeWeather(r: Raw): WeatherRecord | null {
  const ts = parseDate(r.date);
  if (ts === null) return null;
  const rain = r.rainfall;
  return {
    ts,
    airTemp: num(r.air_temperature),
    trackTemp: num(r.track_temperature),
    humidity: num(r.humidity),
    pressure: num(r.pressure),
    rainfall: typeof rain === "number" ? rain > 0 : typeof rain === "boolean" ? rain : null,
    windDirection: num(r.wind_direction),
    windSpeed: num(r.wind_speed),
  };
}

export function normalizeOvertake(r: Raw): SourceOvertake | null {
  const ts = parseDate(r.date);
  const a = num(r.overtaking_driver_number);
  const b = num(r.overtaken_driver_number);
  if (ts === null || a === null || b === null) return null;
  return { ts, overtaking: a, overtaken: b, position: num(r.position) ?? 0 };
}

function gapOrArray(v: unknown): Gap | null | (Gap | null)[] {
  return Array.isArray(v) ? v.map((x) => parseGap(x)) : parseGap(v);
}

export function normalizeResult(r: Raw): ResultRecord | null {
  const driver = num(r.driver_number);
  if (driver === null) return null;
  const d = r.duration;
  return {
    driver,
    position: num(r.position),
    laps: num(r.number_of_laps),
    dnf: r.dnf === true,
    dns: r.dns === true,
    dsq: r.dsq === true,
    duration: Array.isArray(d) ? d.map(num) : num(d),
    gapToLeader: gapOrArray(r.gap_to_leader),
  };
}

export function normalizeGrid(r: Raw): GridRecord | null {
  const driver = num(r.driver_number);
  const position = num(r.position);
  if (driver === null || position === null) return null;
  return { driver, position, lapDuration: num(r.lap_duration) };
}

/** Normalizes a list, dropping invalid rows, and sorts by a time key when given. */
export function normalizeAll<T>(rows: unknown, fn: (r: Raw) => T | null, timeKey?: (t: T) => number | null): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const r of rows) {
    if (r && typeof r === "object") {
      const v = fn(r as Raw);
      if (v) out.push(v);
    }
  }
  if (timeKey) out.sort((a, b) => (timeKey(a) ?? 0) - (timeKey(b) ?? 0));
  return out;
}
