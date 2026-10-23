import { describe, expect, it } from "vitest";
import * as o from "../src/normalize/openf1.ts";
import * as j from "../src/normalize/jolpica.ts";
import { rawDriver, rawSession } from "./fixtures.ts";

describe("OpenF1 normalization", () => {
  it("normalizes sessions with offsets and types", () => {
    const s = o.normalizeSession(rawSession)!;
    expect(s.sessionKey).toBe(9523);
    expect(s.type).toBe("Race");
    expect(s.gmtOffset).toBe("+02:00");
    expect(s.start).toBe(Date.parse("2024-05-26T13:00:00Z"));
    expect(o.normalizeSession({ ...rawSession, gmt_offset: "-05:00:00" })!.gmtOffset).toBe("-05:00");
  });

  it("classifies sprint sessions", () => {
    expect(o.sessionTypeOf("Sprint", "Race")).toBe("Sprint");
    expect(o.sessionTypeOf("Sprint Qualifying", "Qualifying")).toBe("Sprint Qualifying");
    expect(o.sessionTypeOf("Sprint Shootout", "Qualifying")).toBe("Sprint Qualifying");
    expect(o.sessionTypeOf("Practice 2", "Practice")).toBe("Practice");
    expect(o.sessionTypeOf("Qualifying", "Qualifying")).toBe("Qualifying");
  });

  it("drops rows without required keys", () => {
    expect(o.normalizeSession({ session_key: 1 })).toBeNull();
    expect(o.normalizeLocation({ driver_number: 1, date: "2024-01-01T00:00:00Z", x: null, y: 2 })).toBeNull();
    expect(o.normalizeAll("not an array", o.normalizeLap)).toEqual([]);
  });

  it("normalizes drivers and team colours", () => {
    const d = o.normalizeDriver(rawDriver)!;
    expect(d.code).toBe("LEC");
    expect(d.teamColour).toBe("#E8002D");
    expect(o.normalizeDriver({ ...rawDriver, team_colour: "nope" })!.teamColour).toBeNull();
  });

  it("merges duplicate driver rows keeping non-null fields", () => {
    const list = o.normalizeDrivers([rawDriver, { driver_number: 16, team_colour: null, headshot_url: null }]);
    expect(list).toHaveLength(1);
    expect(list[0].teamColour).toBe("#E8002D");
  });

  it("parses gaps in seconds, laps and leader form", () => {
    expect(o.parseGap(1.234)).toEqual({ kind: "time", seconds: 1.234 });
    expect(o.parseGap("+1 LAP")).toEqual({ kind: "laps", laps: 1 });
    expect(o.parseGap("+3 LAPS")).toEqual({ kind: "laps", laps: 3 });
    expect(o.parseGap(null)).toBeNull();
    const leader = o.normalizeInterval({ driver_number: 1, date: "2024-05-26T13:10:00+00:00", gap_to_leader: null, interval: null })!;
    expect(leader.gapToLeader).toEqual({ kind: "leader" });
    const other = o.normalizeInterval({ driver_number: 2, date: "2024-05-26T13:10:00+00:00", gap_to_leader: "+1 LAP", interval: 0.4 })!;
    expect(other.gapToLeader).toEqual({ kind: "laps", laps: 1 });
    expect(other.interval).toEqual({ kind: "time", seconds: 0.4 });
  });

  it("normalizes laps, stints, pits and car data", () => {
    const lap = o.normalizeLap({
      driver_number: 16, lap_number: 5, date_start: "2024-05-26T13:10:00.123+00:00", lap_duration: 76.5,
      duration_sector_1: 20.1, duration_sector_2: 35.2, duration_sector_3: 21.2, is_pit_out_lap: false,
      segments_sector_1: [2049, 2051], segments_sector_2: null, segments_sector_3: [2048],
    })!;
    expect(lap.start).toBe(Date.parse("2024-05-26T13:10:00.123Z"));
    expect(lap.segments[0]).toEqual([2049, 2051]);
    expect(lap.segments[1]).toBeNull();

    expect(o.normalizeStint({ driver_number: 16, lap_start: 1, lap_end: 20, compound: "medium", stint_number: 1, tyre_age_at_start: 3 })!.compound).toBe("MEDIUM");
    expect(o.normalizeStint({ driver_number: 16, lap_start: 1, compound: "TEST_UNKNOWN" })!.compound).toBe("UNKNOWN");

    const pit = o.normalizePit({ driver_number: 16, date: "2024-05-26T13:30:00+00:00", lap_number: 20, pit_duration: 22.1 })!;
    expect(pit.laneDuration).toBe(22.1); // deprecated alias still honoured
    expect(pit.stopDuration).toBeNull();

    const car = o.normalizeCarData({ driver_number: 16, date: "2024-05-26T13:30:00+00:00", speed: 300, n_gear: 8, drs: 12, rpm: 11000, throttle: 100, brake: 0 })!;
    expect(car.gear).toBe(8);
    expect(car.drs).toBe(12);
  });

  it("normalizes weather rainfall and race control", () => {
    expect(o.normalizeWeather({ date: "2024-05-26T13:00:00+00:00", rainfall: 0, air_temperature: 21.5 })!.rainfall).toBe(false);
    expect(o.normalizeWeather({ date: "2024-05-26T13:00:00+00:00", rainfall: 1 })!.rainfall).toBe(true);
    const r = o.normalizeRaceControl({ date: "2024-05-26T13:00:00+00:00", category: "Flag", flag: "YELLOW", message: "YELLOW IN TRACK SECTOR 7", scope: "Sector", sector: 7 })!;
    expect(r.sector).toBe(7);
    expect(r.id).toContain("YELLOW");
  });

  it("normalizes qualifying results with three-part arrays", () => {
    const q = o.normalizeResult({ driver_number: 16, position: 1, duration: [71.2, 70.9, null], gap_to_leader: [0, 0, null], dnf: false, dns: false, dsq: false, number_of_laps: 18 })!;
    expect(q.duration).toEqual([71.2, 70.9, null]);
  });
});

describe("Jolpica normalization", () => {
  const mr = {
    MRData: {
      RaceTable: {
        Races: [
          {
            season: "2024", round: "8", raceName: "Monaco Grand Prix", date: "2024-05-26", time: "13:00:00Z",
            Circuit: { circuitId: "monaco", circuitName: "Circuit de Monaco", Location: { locality: "Monte-Carlo", country: "Monaco", lat: "43.7347", long: "7.42056" } },
            FirstPractice: { date: "2024-05-24", time: "11:30:00Z" },
            Qualifying: { date: "2024-05-25", time: "14:00:00Z" },
            Results: [
              { number: "16", position: "1", positionText: "1", points: "25", Driver: { driverId: "leclerc", code: "LEC", givenName: "Charles", familyName: "Leclerc" }, Constructor: { constructorId: "ferrari", name: "Ferrari" }, grid: "1", laps: "78", status: "Finished", Time: { millis: "8378345", time: "2:23:15.554" }, FastestLap: { rank: "6", lap: "52", Time: { time: "1:15.919" } } },
              { number: "11", position: "20", positionText: "R", points: "0", Driver: { driverId: "perez" }, Constructor: { constructorId: "red_bull", name: "Red Bull" }, grid: "18", laps: "0", status: "Accident" },
            ],
          },
        ],
      },
    },
  };

  it("parses schedules with session times in order", () => {
    const [race] = j.schedule(mr);
    expect(race.round).toBe(8);
    expect(race.circuit.lat).toBeCloseTo(43.7347);
    expect(race.sessions.map((s) => s.kind)).toEqual(["FP1", "Qualifying", "Race"]);
    expect(race.raceStart).toBe(Date.parse("2024-05-26T13:00:00Z"));
  });

  it("parses classifications with numbers as strings", () => {
    const [{ rows }] = j.raceResults(mr);
    expect(rows[0].points).toBe(25);
    expect(rows[0].fastestLap?.lap).toBe(52);
    expect(rows[1].positionText).toBe("R");
    expect(j.isFinishStatus(rows[1].status)).toBe(false);
    expect(j.isFinishStatus("+1 Lap")).toBe(true);
  });

  it("converts lap times", () => {
    expect(j.lapTimeToSeconds("1:15.919")).toBeCloseTo(75.919);
    expect(j.lapTimeToSeconds("2:23:15.554")).toBeCloseTo(8595.554);
    expect(j.lapTimeToSeconds(null)).toBeNull();
  });

  it("handles empty standings", () => {
    expect(j.driverStandings({}).rows).toEqual([]);
  });
});
