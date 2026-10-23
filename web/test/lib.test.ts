import { describe, expect, it } from "vitest";
import type { CarSample, jolpica } from "@f1/shared";
import { brakingPoints, buildTrace, deltaTrace, sectionTimes, timeAtDistance } from "../src/lib/telemetry";
import { constructorProgression, driverSeasonStats, teammateComparison } from "../src/lib/stats";
import { pickDefaultSession } from "../src/App";

const car = (ts: number, speed: number, brake = 0): CarSample => ({ driver: 1, ts, speed, throttle: 100, brake, gear: 7, rpm: 11000, drs: 0 });

describe("telemetry", () => {
  it("integrates distance from speed", () => {
    // 360 km/h = 100 m/s for 2 s → 200 m.
    const tr = buildTrace([car(0, 360), car(1000, 360), car(2000, 360)], 0);
    expect(tr[2].d).toBeCloseTo(200);
    expect(timeAtDistance(tr, 150)).toBeCloseTo(1.5);
    expect(timeAtDistance(tr, 500)).toBeNull();
  });

  it("does not integrate across long gaps", () => {
    const tr = buildTrace([car(0, 360), car(10_000, 360)], 0);
    expect(tr[1].d).toBe(0);
  });

  it("computes deltas and section times", () => {
    const fast = buildTrace([car(0, 360), car(1000, 360), car(2000, 360)], 0);
    const slow = buildTrace([car(0, 180), car(2000, 180), car(4000, 180)], 0);
    const d = deltaTrace(fast, slow, 50);
    expect(d[d.length - 1].y).toBeCloseTo(2); // 200 m: 2 s vs 4 s
    expect(sectionTimes(fast, 2, 200)).toEqual([1, 1]);
  });

  it("finds braking points", () => {
    const tr = buildTrace([car(0, 300), car(500, 300, 100), car(1000, 200, 100), car(1500, 200), car(3000, 300), car(3500, 300, 100)], 0);
    expect(brakingPoints(tr).length).toBe(2);
  });
});

const drv = (id: string) => ({ id, code: id.toUpperCase().slice(0, 3), number: null, givenName: id, familyName: id, nationality: "", dateOfBirth: null, url: null });
const con = (id: string) => ({ id, name: id, nationality: "" });
const row = (driverId: string, team: string, position: number, points: number, status = "Finished", extra: Partial<jolpica.ClassificationRow> = {}): jolpica.ClassificationRow => ({
  position, positionText: status === "Finished" ? String(position) : "R", number: null, driver: drv(driverId), constructor: con(team), grid: position, laps: 50, status, time: null, millis: null, points, fastestLap: null, ...extra,
});
const race = (round: number, rows: jolpica.ClassificationRow[]) => ({ race: { season: 2024, round, name: `GP ${round}`, circuit: { id: "c", name: "", locality: "", country: "", lat: null, long: null, url: null }, sessions: [], raceStart: null, raceDate: "", url: null }, rows });

describe("season stats", () => {
  const races = [
    race(1, [row("ann", "red", 1, 25, "Finished", { fastestLap: { rank: 1, lap: 30, time: "1:30.000" } }), row("bob", "red", 2, 18), row("cat", "blue", 3, 15)]),
    race(2, [row("cat", "blue", 1, 25), row("bob", "red", 2, 18), row("ann", "red", 20, 0, "Engine")]),
  ];
  const sprints = [race(2, [row("ann", "red", 1, 8)])];
  const qualis = [
    { race: races[0].race, rows: [{ position: 1, number: null, driver: drv("ann"), constructor: con("red"), q1: null, q2: null, q3: null }, { position: 2, number: null, driver: drv("bob"), constructor: con("red"), q1: null, q2: null, q3: null }] },
  ];

  it("derives wins, podiums, poles, DNFs and progression", () => {
    const s = driverSeasonStats("ann", races, sprints, qualis);
    expect(s).toMatchObject({ starts: 2, wins: 1, podiums: 1, poles: 1, fastestLaps: 1, finishes: 1, dnfs: 1, points: 33, sprintPoints: 8, bestFinish: 1 });
    expect(s.progression).toEqual([{ round: 1, points: 25 }, { round: 2, points: 33 }]);
    expect(s.recent[0].pos).toBe("R");
  });

  it("compares teammates only when both are classified", () => {
    const [h] = teammateComparison("bob", races, qualis);
    expect(h.teammateId).toBe("ann");
    expect(h.races).toEqual({ ahead: 1, behind: 1 });
    expect(h.qualifying).toEqual({ ahead: 0, behind: 1 });
  });

  it("sums constructor points per round", () => {
    const c = constructorProgression("red", races, sprints);
    expect(c.progression).toEqual([{ round: 1, points: 43 }, { round: 2, points: 69 }]);
    expect(c.drivers[0]).toMatchObject({ id: "bob", points: 36 });
  });
});

describe("pickDefaultSession", () => {
  const s = (key: number, meeting: number, type: string, start: number) => ({ sessionKey: key, meetingKey: meeting, type, start, cancelled: false }) as never;
  it("prefers the race of the latest started meeting", () => {
    const now = 1000;
    const list = [s(1, 1, "Race", 100), s(2, 2, "Practice", 500), s(3, 2, "Qualifying", 600), s(4, 3, "Race", 5000)];
    expect(pickDefaultSession(list, now)?.sessionKey).toBe(3);
    expect(pickDefaultSession([...list, s(5, 2, "Race", 900)], now)?.sessionKey).toBe(5);
    expect(pickDefaultSession([], now)).toBeNull();
  });
});
