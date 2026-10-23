// Small hand-written fixtures in the exact shape of OpenF1 / Jolpica responses,
// used to exercise normalization and the derived logic. They are test inputs,
// not real session data.
import type { RaceControlRecord, SessionCore } from "../src/types.ts";

export const T0 = Date.parse("2024-05-26T13:00:00Z");
export const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "+00:00");

export const rawSession = {
  circuit_key: 22,
  circuit_short_name: "Monte Carlo",
  country_code: "MON",
  country_key: 114,
  country_name: "Monaco",
  date_end: "2024-05-26T15:00:00+00:00",
  date_start: "2024-05-26T13:00:00+00:00",
  gmt_offset: "02:00:00",
  location: "Monaco",
  meeting_key: 1236,
  session_key: 9523,
  session_name: "Race",
  session_type: "Race",
  year: 2024,
};

export const rawDriver = {
  broadcast_name: "C LECLERC",
  country_code: "MON",
  driver_number: 16,
  first_name: "Charles",
  full_name: "Charles LECLERC",
  headshot_url: "https://example.test/lec.png",
  last_name: "Leclerc",
  meeting_key: 1236,
  name_acronym: "LEC",
  session_key: 9523,
  team_colour: "E8002D",
  team_name: "Ferrari",
};

export function rc(ts: number, message: string, extra: Partial<RaceControlRecord> = {}): RaceControlRecord {
  return { id: `${ts}:${message}`, ts, category: "Other", flag: null, message, scope: null, sector: null, driver: null, lap: null, qualifyingPhase: null, ...extra };
}

export function emptyCore(overrides: Partial<SessionCore> = {}): SessionCore {
  const none = { available: false };
  return {
    session: {
      sessionKey: 1,
      meetingKey: 1,
      name: "Race",
      type: "Race",
      year: 2024,
      circuitKey: 1,
      circuitShortName: "Test",
      location: "Test",
      countryName: "Test",
      countryCode: "TST",
      start: T0,
      end: T0 + 7200_000,
      gmtOffset: "+00:00",
      cancelled: false,
      provider: "openf1",
    },
    meeting: null,
    drivers: [],
    laps: [],
    stints: [],
    pits: [],
    positions: [],
    intervals: [],
    raceControl: [],
    weather: [],
    overtakes: [],
    results: [],
    grid: [],
    channels: {
      location: none, carData: none, intervals: none, positions: none, laps: none, stints: none, pits: none,
      raceControl: none, weather: none, overtakes: none, results: none, grid: none, energy: none, overtakeMode: none,
    },
    quality: "HISTORICAL",
    fetchedAt: T0,
    ...overrides,
  };
}

export const driver = (number: number, code: string, team = "Team") => ({
  number,
  code,
  firstName: code,
  lastName: code,
  fullName: code,
  broadcastName: code,
  team,
  teamColour: "#ff0000",
  headshotUrl: null,
});
