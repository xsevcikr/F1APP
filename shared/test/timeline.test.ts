import { describe, expect, it } from "vitest";
import { SessionTimeline } from "../src/timeline.ts";
import { drsFromCode, drsReading, seasonHasDrs } from "../src/drs.ts";
import { trackStatusAt } from "../src/trackStatus.ts";
import { qualityFor, sessionPhase } from "../src/quality.ts";
import { DEFAULT_ALERT_PREFS, collectAlerts, selectAlerts } from "../src/alerts.ts";
import { buildCircuit, pickReferenceLap } from "../src/circuit.ts";
import type { LapRecord, LocationSample } from "../src/types.ts";
import { T0, driver, emptyCore, rc } from "./fixtures.ts";

const lap = (d: number, n: number, start: number, duration: number | null, extra: Partial<LapRecord> = {}): LapRecord => ({
  driver: d, lap: n, start, duration, s1: null, s2: null, s3: null, i1Speed: null, i2Speed: null, stSpeed: null, pitOutLap: false, segments: [null, null, null], ...extra,
});

function makeTimeline() {
  return new SessionTimeline(
    emptyCore({
      drivers: [driver(1, "AAA", "Red"), driver(2, "BBB", "Blue")],
      grid: [{ driver: 1, position: 2, lapDuration: 70 }, { driver: 2, position: 1, lapDuration: 69.9 }],
      positions: [
        { driver: 2, ts: T0, position: 1 }, { driver: 1, ts: T0, position: 2 },
        { driver: 1, ts: T0 + 100_000, position: 1 }, { driver: 2, ts: T0 + 100_000, position: 2 },
      ],
      intervals: [
        { driver: 1, ts: T0 + 101_000, gapToLeader: { kind: "leader" }, interval: { kind: "leader" } },
        { driver: 2, ts: T0 + 101_000, gapToLeader: { kind: "time", seconds: 0.8 }, interval: { kind: "time", seconds: 0.8 } },
      ],
      laps: [
        lap(1, 1, T0, 90), lap(1, 2, T0 + 90_000, 80), lap(1, 3, T0 + 170_000, 79),
        lap(2, 1, T0, 89), lap(2, 2, T0 + 89_000, 82), lap(2, 3, T0 + 171_000, null),
      ],
      stints: [
        { driver: 1, stint: 1, compound: "SOFT", lapStart: 1, lapEnd: 2, tyreAgeAtStart: 3 },
        { driver: 1, stint: 2, compound: "HARD", lapStart: 3, lapEnd: null, tyreAgeAtStart: 0 },
      ],
      pits: [{ driver: 1, ts: T0 + 165_000, lap: 2, laneDuration: 20, stopDuration: 2.4 }],
      raceControl: [rc(T0 + 1000, "GREEN LIGHT", { flag: "GREEN", category: "Flag" }), rc(T0 + 120_000, "5 SECOND TIME PENALTY FOR CAR 2 (BBB) - FALSE START")],
      results: [{ driver: 1, position: 1, laps: 3, dnf: false, dns: false, dsq: false, duration: 249, gapToLeader: null }, { driver: 2, position: 2, laps: 2, dnf: true, dns: false, dsq: false, duration: null, gapToLeader: null }],
    }),
  );
}

describe("SessionTimeline.snapshotAt", () => {
  it("orders the leaderboard and computes positions gained", () => {
    const snap = makeTimeline().snapshotAt(T0 + 105_000);
    expect(snap.rows.map((r) => r.driver.code)).toEqual(["AAA", "BBB"]);
    expect(snap.rows[0].gained).toBe(1);
    expect(snap.rows[1].gained).toBe(-1);
    expect(snap.rows[1].interval.value).toEqual({ kind: "time", seconds: 0.8 });
    expect(snap.leaderLap).toBe(2);
  });

  it("shows only laps completed by the time shown", () => {
    const tl = makeTimeline();
    expect(tl.snapshotAt(T0 + 100_000).rows[0].lastLap?.lap).toBe(1);
    const later = tl.snapshotAt(T0 + 172_000).rows[0];
    expect(later.lastLap?.lap).toBe(2);
    expect(later.bestLap?.duration).toBe(80);
    expect(later.newPersonalBest).toBe(true);
    expect(tl.snapshotAt(T0 + 200_000).rows[0].newPersonalBest).toBe(false);
  });

  it("tracks tyre, pit and penalties over time", () => {
    const tl = makeTimeline();
    const before = tl.snapshotAt(T0 + 100_000).rows.find((r) => r.driver.number === 1)!;
    expect(before.compound).toBe("SOFT");
    expect(before.tyreAge).toBe(4);
    expect(before.pitStops).toBe(0);
    const inPit = tl.snapshotAt(T0 + 170_000).rows.find((r) => r.driver.number === 1)!;
    expect(inPit.inPitLane).toBe(true);
    expect(inPit.status).toBe("pit");
    expect(inPit.compound).toBe("HARD");
    expect(inPit.pitStops).toBe(1);
    const b = tl.snapshotAt(T0 + 130_000).rows.find((r) => r.driver.number === 2)!;
    expect(b.penalties).toHaveLength(1);
    expect(b.penalties[0].seconds).toBe(5);
  });

  it("shows a DNF only after the driver's last recorded lap", () => {
    const tl = makeTimeline();
    expect(tl.snapshotAt(T0 + 175_000).rows.find((r) => r.driver.number === 2)!.status).toBe("running");
    const late = tl.snapshotAt(T0 + 300_000).rows.find((r) => r.driver.number === 2)!;
    expect(late.status).toBe("retired");
    expect(late.statusBasis).toMatch(/Official result/);
  });

  it("only reports total laps from the official classification", () => {
    expect(makeTimeline().totalLaps()).toBe(3);
    expect(new SessionTimeline(emptyCore()).totalLaps()).toBeNull();
  });

  it("applies live records and moves the live edge", () => {
    const tl = makeTimeline();
    const v = tl.version;
    tl.apply({ kind: "position", data: { driver: 2, ts: T0 + 400_000, position: 1 } });
    tl.apply({ kind: "raceControl", data: rc(T0 + 400_001, "SAFETY CAR DEPLOYED", { category: "SafetyCar" }) });
    tl.apply({ kind: "raceControl", data: rc(T0 + 400_001, "SAFETY CAR DEPLOYED", { category: "SafetyCar" }) });
    expect(tl.version).toBeGreaterThan(v);
    expect(tl.latestTs).toBe(T0 + 400_001);
    expect(tl.positionOf(2, T0 + 400_000)).toBe(1);
    expect(tl.raceControl.filter((r) => r.message.includes("SAFETY")).length).toBe(1);
    expect(tl.snapshotAt(T0 + 400_002).track.headline).toBe("SAFETY CAR");
  });

  it("merges sample windows without duplicates", () => {
    const tl = makeTimeline();
    const loc = (k: number): LocationSample => ({ driver: 1, ts: k * 100, x: k, y: 0, z: 0 });
    tl.addLocations([loc(1), loc(2), loc(3)]);
    tl.addLocations([loc(3), loc(4)]);
    expect(tl.locationsOf(1).map((s) => s.ts)).toEqual([100, 200, 300, 400]);
    expect(tl.carPositionsAt(250)[0].x).toBeCloseTo(2.5);
  });

  it("computes lap-by-lap positions", () => {
    const lp = makeTimeline().lapPositions();
    expect(lp.get(1)).toEqual([{ lap: 1, position: 2 }, { lap: 2, position: 1 }, { lap: 3, position: 1 }]);
  });
});

describe("DRS", () => {
  it("knows which seasons have DRS", () => {
    expect(seasonHasDrs(2025)).toBe(true);
    expect(seasonHasDrs(2026)).toBe(false);
  });
  it("maps documented codes only", () => {
    expect(drsFromCode(12)).toBe("ACTIVE");
    expect(drsFromCode(8)).toBe("AVAILABLE");
    expect(drsFromCode(1)).toBe("OFF");
    expect(drsFromCode(3)).toBe("UNKNOWN");
    expect(drsFromCode(null)).toBe("UNKNOWN");
  });
  const sample = { driver: 1, ts: 1000, speed: 300, throttle: 100, brake: 0, gear: 8, rpm: 11000, drs: 12 };
  it("is not applicable in 2026", () => {
    expect(drsReading({ year: 2026, sample, now: 1000, track: null }).state).toBe("NOT_APPLICABLE");
  });
  it("is disabled under neutralization even if telemetry says open", () => {
    const track = trackStatusAt([rc(0, "SAFETY CAR DEPLOYED", { category: "SafetyCar" })], 500);
    expect(drsReading({ year: 2024, sample, now: 1000, track }).state).toBe("DISABLED");
  });
  it("is unknown when telemetry is old", () => {
    expect(drsReading({ year: 2024, sample, now: 20_000, track: null }).state).toBe("UNKNOWN");
    expect(drsReading({ year: 2024, sample: undefined, now: 20_000, track: null }).state).toBe("UNKNOWN");
  });
  it("is active only from telemetry", () => {
    expect(drsReading({ year: 2024, sample, now: 1200, track: null }).state).toBe("ACTIVE");
  });
});

describe("quality states", () => {
  const s = { start: 100 * 60_000, end: 200 * 60_000 };
  it("derives session phase from the live window", () => {
    expect(sessionPhase(s, 0)).toBe("upcoming");
    expect(sessionPhase(s, 80 * 60_000)).toBe("live-window");
    expect(sessionPhase(s, 240 * 60_000)).toBe("finished");
  });
  it("maps to quality", () => {
    const base = { demo: false, phase: "live-window" as const, liveConnected: true, lastRecordAt: 1000, now: 2000, viewingLiveEdge: true };
    expect(qualityFor(base)).toBe("LIVE");
    expect(qualityFor({ ...base, now: 60_000 })).toBe("DELAYED");
    expect(qualityFor({ ...base, viewingLiveEdge: false })).toBe("DELAYED");
    expect(qualityFor({ ...base, liveConnected: false, lastRecordAt: null })).toBe("UNAVAILABLE");
    expect(qualityFor({ ...base, phase: "finished" })).toBe("HISTORICAL");
    expect(qualityFor({ ...base, demo: true })).toBe("SIMULATED");
  });
});

describe("alerts", () => {
  const all = collectAlerts({
    changes: [{ id: "c1", ts: 10, gainer: 1, loser: 2, gainerFrom: 2, gainerTo: 1, loserFrom: 1, loserTo: 2, kind: "likely-on-track", forPosition: true, basis: "" }],
    pits: [{ driver: 2, ts: 20, lap: 5, laneDuration: 20, stopDuration: 2 }],
    raceControl: [rc(30, "SAFETY CAR DEPLOYED", { category: "SafetyCar" })],
    personalBests: [],
    teamOf: () => "T",
    nameOf: (d) => `D${d}`,
  });

  it("alerts once per event", () => {
    const seen = new Set<string>();
    const prefs = { ...DEFAULT_ALERT_PREFS, enabled: { ...DEFAULT_ALERT_PREFS.enabled, overtake: true, pit: true } };
    expect(selectAlerts(all, prefs, seen, () => "T").map((a) => a.type)).toEqual(["overtake", "pit", "safety-car"]);
    expect(selectAlerts(all, prefs, seen, () => "T")).toEqual([]);
  });

  it("filters driver alerts by favourites but keeps track-wide alerts", () => {
    const prefs = { ...DEFAULT_ALERT_PREFS, enabled: { ...DEFAULT_ALERT_PREFS.enabled, overtake: true, pit: true }, favouriteDrivers: [44] };
    expect(selectAlerts(all, prefs, new Set(), () => "T").map((a) => a.type)).toEqual(["safety-car"]);
  });
});

describe("circuit", () => {
  it("builds an outline, start line and sector lines from a lap trace", () => {
    const locs: LocationSample[] = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * 2 * Math.PI;
      locs.push({ driver: 1, ts: i * 1000, x: Math.cos(a) * 1000, y: Math.sin(a) * 1000, z: 0 });
    }
    const l = lap(1, 5, 0, 100, { s1: 25, s2: 25 });
    const c = buildCircuit({ lap: l, locations: locs, seasonHasDrs: true, drsReferences: [] })!;
    expect(c.path.length).toBeGreaterThan(50);
    expect(c.startFinish!.x).toBeCloseTo(1000);
    expect(c.sectorLines).toHaveLength(2);
    expect(c.sectorLines[0].y).toBeCloseTo(1000, 0);
    expect(c.basis[0]).toMatch(/car #1/);
  });

  it("returns null when there is too little data", () => {
    expect(buildCircuit({ lap: lap(1, 1, 0, 90), locations: [], seasonHasDrs: false })).toBeNull();
  });

  it("picks a clean reference lap", () => {
    const laps = [lap(1, 1, 0, 70), lap(1, 2, 0, 80, { pitOutLap: true }), lap(1, 3, 0, 75), lap(1, 4, 0, 76), lap(1, 5, 0, 77), lap(1, 6, 0, null)];
    expect(pickReferenceLap(laps)?.lap).toBe(5);
  });
});
