import { describe, expect, it } from "vitest";
import { battlesAt, detectPositionChanges, estimateSlipstream, swapsBetween } from "../src/events.ts";
import type { CarSample, PositionRecord } from "../src/types.ts";
import { rc } from "./fixtures.ts";

const p = (ts: number, driver: number, position: number): PositionRecord => ({ ts, driver, position });

const start = [p(0, 1, 1), p(0, 2, 2), p(0, 3, 3)];

describe("swapsBetween", () => {
  it("finds the pair that swapped", () => {
    const before = new Map([[1, 1], [2, 2], [3, 3]]);
    const after = new Map([[1, 1], [2, 3], [3, 2]]);
    expect(swapsBetween(before, after)).toEqual([{ gainer: 3, loser: 2, gainerFrom: 3, gainerTo: 2, loserFrom: 2, loserTo: 3 }]);
  });
  it("finds multiple swaps when one car drops several places", () => {
    const before = new Map([[1, 1], [2, 2], [3, 3]]);
    const after = new Map([[1, 3], [2, 1], [3, 2]]);
    const swaps = swapsBetween(before, after);
    expect(swaps.map((s) => [s.gainer, s.loser])).toEqual([[2, 1], [3, 1]]);
  });
});

describe("detectPositionChanges", () => {
  it("waits for a consistent order before comparing", () => {
    // Driver 3 reported P2 at 10s, driver 2 reported P3 at 11s.
    const changes = detectPositionChanges({
      positions: [...start, p(10_000, 3, 2), p(11_000, 2, 3)],
      pits: [], raceControl: [], sourceOvertakes: [],
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ gainer: 3, loser: 2, gainerFrom: 3, gainerTo: 2, kind: "likely-on-track", ts: 11_000 });
  });

  it("marks changes listed by the source as confirmed", () => {
    const changes = detectPositionChanges({
      positions: [...start, p(10_000, 3, 2), p(10_000, 2, 3)],
      pits: [], raceControl: [],
      sourceOvertakes: [{ ts: 9_000, overtaking: 3, overtaken: 2, position: 2 }],
    });
    expect(changes[0].kind).toBe("confirmed");
  });

  it("never confirms a pit-cycle change as an on-track overtake", () => {
    const changes = detectPositionChanges({
      positions: [...start, p(60_000, 3, 2), p(60_000, 2, 3)],
      pits: [{ driver: 2, ts: 40_000, lap: 10, laneDuration: 22, stopDuration: 2.5 }],
      raceControl: [],
      sourceOvertakes: [{ ts: 60_000, overtaking: 3, overtaken: 2, position: 2 }],
    });
    expect(changes[0].kind).toBe("pit-cycle");
  });

  it("labels changes under a safety car as neutralized", () => {
    const changes = detectPositionChanges({
      positions: [...start, p(60_000, 3, 2), p(60_000, 2, 3)],
      pits: [],
      raceControl: [rc(50_000, "SAFETY CAR DEPLOYED", { category: "SafetyCar" })],
      sourceOvertakes: [],
    });
    expect(changes[0].kind).toBe("neutralized");
  });

  it("ignores changes before the from time", () => {
    const changes = detectPositionChanges({
      positions: [...start, p(10_000, 3, 2), p(10_000, 2, 3)],
      pits: [], raceControl: [], sourceOvertakes: [], from: 20_000,
    });
    expect(changes).toEqual([]);
  });
});

describe("battles and slipstream", () => {
  const car = (driver: number, ts: number, speed: number): CarSample => ({ driver, ts, speed, throttle: 100, brake: 0, gear: 8, rpm: 11000, drs: 0 });
  const data: Record<number, CarSample[]> = { 1: [car(1, 9_500, 310)], 2: [car(2, 9_600, 318)] };

  it("reports close pairs with measured relative speed and an estimated tow", () => {
    const b = battlesAt({
      t: 10_000,
      order: [
        { driver: 1, position: 1, interval: { value: { kind: "leader" }, ts: 9_000 }, inPitLane: false },
        { driver: 2, position: 2, interval: { value: { kind: "time", seconds: 0.6 }, ts: 9_000 }, inPitLane: false },
        { driver: 3, position: 3, interval: { value: { kind: "time", seconds: 4.2 }, ts: 9_000 }, inPitLane: false },
      ],
      carData: (d) => data[d] ?? [],
    });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ follower: 2, target: 1, gap: 0.6, relativeSpeed: 8 });
    expect(b[0].slipstream.likely).toBe(true);
    expect(b[0].slipstream.basis).toMatch(/Estimate/);
  });

  it("skips stale intervals and cars in the pit lane", () => {
    const b = battlesAt({
      t: 60_000,
      order: [
        { driver: 1, position: 1, interval: { value: { kind: "leader" }, ts: 1 }, inPitLane: false },
        { driver: 2, position: 2, interval: { value: { kind: "time", seconds: 0.6 }, ts: 1 }, inPitLane: false },
      ],
      carData: () => [],
    });
    expect(b).toEqual([]);
  });

  it("does not suggest a tow in slow corners", () => {
    expect(estimateSlipstream(0.4, 120).likely).toBe(false);
    expect(estimateSlipstream(1.4, 300).likely).toBe(false);
  });
});
