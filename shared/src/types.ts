// Normalized data model shared by the server and the web client.
// All timestamps are epoch milliseconds (UTC). Every record keeps the time the
// source reported it, so the UI can always say how old a value is.

/** Data-quality state attached to every value the UI shows. */
export type Quality = "LIVE" | "DELAYED" | "HISTORICAL" | "UNAVAILABLE";

/** How a value was obtained. */
export type Provenance = "measured" | "derived" | "estimated" | "unavailable";

export type ProviderId = "openf1" | "jolpica";

/** A value together with where it came from and how much it can be trusted. */
export interface Sourced<T> {
  value: T | null;
  provenance: Provenance;
  /** Source timestamp of the underlying record, when known. */
  ts: number | null;
  /** Human-readable basis for derived or estimated values, or reason for unavailability. */
  basis?: string;
}

export type SessionType = "Practice" | "Qualifying" | "Sprint Qualifying" | "Sprint" | "Race" | "Unknown";

export interface SessionInfo {
  sessionKey: number;
  meetingKey: number;
  name: string; // "Race", "Practice 1", "Sprint Qualifying"...
  type: SessionType;
  year: number;
  circuitKey: number | null;
  circuitShortName: string;
  location: string;
  countryName: string;
  countryCode: string;
  start: number;
  end: number;
  gmtOffset: string; // "+02:00"
  cancelled: boolean;
  provider: ProviderId;
}

export interface MeetingInfo {
  meetingKey: number;
  name: string;
  officialName: string;
  location: string;
  countryName: string;
  countryCode: string;
  circuitShortName: string;
  circuitType: string | null;
  year: number;
  start: number;
  end: number;
  gmtOffset: string;
}

export interface DriverInfo {
  number: number;
  code: string; // three-letter acronym
  firstName: string;
  lastName: string;
  fullName: string;
  broadcastName: string;
  team: string;
  /** Hex colour including '#', or null when the source does not supply one. */
  teamColour: string | null;
  headshotUrl: string | null;
}

export interface LapRecord {
  driver: number;
  lap: number;
  /** Approximate lap start time (OpenF1 marks this as approximate). */
  start: number | null;
  duration: number | null; // seconds
  s1: number | null;
  s2: number | null;
  s3: number | null;
  i1Speed: number | null;
  i2Speed: number | null;
  stSpeed: number | null;
  pitOutLap: boolean;
  /** Mini-sector status codes per sector (not supplied for races). */
  segments: [number[] | null, number[] | null, number[] | null];
}

export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

export interface StintRecord {
  driver: number;
  stint: number;
  compound: Compound;
  lapStart: number;
  lapEnd: number | null;
  tyreAgeAtStart: number | null;
}

export interface PitRecord {
  driver: number;
  lap: number | null;
  ts: number;
  laneDuration: number | null; // seconds in the pit lane
  stopDuration: number | null; // stationary seconds
}

export interface PositionRecord {
  driver: number;
  ts: number;
  position: number;
}

/** A gap is either seconds or a number of laps. */
export type Gap = { kind: "time"; seconds: number } | { kind: "laps"; laps: number } | { kind: "leader" };

export interface IntervalRecord {
  driver: number;
  ts: number;
  gapToLeader: Gap | null;
  interval: Gap | null;
}

export interface LocationSample {
  driver: number;
  ts: number;
  x: number;
  y: number;
  z: number;
}

/** Raw DRS code from car telemetry; see drs.ts for its meaning. */
export interface CarSample {
  driver: number;
  ts: number;
  speed: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  rpm: number | null;
  drs: number | null;
}

export interface RaceControlRecord {
  id: string;
  ts: number;
  category: string;
  flag: string | null;
  message: string;
  scope: string | null;
  sector: number | null;
  driver: number | null;
  lap: number | null;
  qualifyingPhase: number | null;
}

export interface WeatherRecord {
  ts: number;
  airTemp: number | null;
  trackTemp: number | null;
  humidity: number | null;
  pressure: number | null;
  rainfall: boolean | null;
  windDirection: number | null;
  windSpeed: number | null;
}

export interface SourceOvertake {
  ts: number;
  overtaking: number;
  overtaken: number;
  position: number;
}

export interface ResultRecord {
  driver: number;
  position: number | null;
  laps: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  /** Seconds; for qualifying the best of Q1..Q3 per phase. */
  duration: number | null | (number | null)[];
  gapToLeader: Gap | null | (Gap | null)[];
}

export interface GridRecord {
  driver: number;
  position: number;
  lapDuration: number | null;
}

/** Everything about a session except high-frequency channels (location, car data). */
export interface SessionCore {
  session: SessionInfo;
  meeting: MeetingInfo | null;
  drivers: DriverInfo[];
  laps: LapRecord[];
  stints: StintRecord[];
  pits: PitRecord[];
  positions: PositionRecord[];
  intervals: IntervalRecord[];
  raceControl: RaceControlRecord[];
  weather: WeatherRecord[];
  overtakes: SourceOvertake[];
  results: ResultRecord[];
  grid: GridRecord[];
  /** Which channels the provider could supply for this session. */
  channels: ChannelAvailability;
  quality: Quality;
  fetchedAt: number;
}

export type ChannelName =
  | "location"
  | "carData"
  | "intervals"
  | "positions"
  | "laps"
  | "stints"
  | "pits"
  | "raceControl"
  | "weather"
  | "overtakes"
  | "results"
  | "grid"
  | "energy"
  | "overtakeMode";

export type ChannelAvailability = Record<ChannelName, { available: boolean; reason?: string }>;

/** A window of high-frequency samples for all drivers. */
export interface SampleWindow<T> {
  from: number;
  to: number;
  samples: T[];
}

/** A pushed live update. */
export type LiveRecord =
  | { kind: "location"; data: LocationSample }
  | { kind: "carData"; data: CarSample }
  | { kind: "position"; data: PositionRecord }
  | { kind: "interval"; data: IntervalRecord }
  | { kind: "lap"; data: LapRecord }
  | { kind: "stint"; data: StintRecord }
  | { kind: "pit"; data: PitRecord }
  | { kind: "raceControl"; data: RaceControlRecord }
  | { kind: "weather"; data: WeatherRecord }
  | { kind: "overtake"; data: SourceOvertake }
  | { kind: "driver"; data: DriverInfo };

export interface LiveStatus {
  /** Session currently inside its live window, if any. */
  session: SessionInfo | null;
  available: boolean;
  /** Why live data is not available, when it is not. */
  reason: string | null;
  connected: boolean;
  lastMessageAt: number | null;
  transport: "mqtt" | "polling" | "none";
  /** Free-tier (no credentials) watch of the newest session: when OpenF1 starts serving it. */
  delayed?: DelayedWatch | null;
}

export interface DelayedWatch {
  sessionKey: number;
  /** waiting: OpenF1 has not released the session's data yet; released: it can be loaded now. */
  state: "waiting" | "released";
  /** Last time the free API was asked. */
  checkedAt: number | null;
  /** When a probe first found data, and whether that was before the session's end + 30 minutes. */
  releasedAt: number | null;
  releasedEarly: boolean;
  /** What the last refused probe said, e.g. an HTTP status. */
  lastReply: string | null;
}

export interface ProviderHealth {
  id: ProviderId;
  ok: boolean;
  lastSuccess: number | null;
  lastError: string | null;
  authenticated: boolean;
}

export interface ServerStatus {
  now: number;
  live: LiveStatus;
  providers: ProviderHealth[];
}
