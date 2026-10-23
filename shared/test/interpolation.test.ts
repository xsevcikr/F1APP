import { describe, expect, it } from "vitest";
import { blendHeading, positionAt } from "../src/interpolation.ts";
import type { LocationSample } from "../src/types.ts";

const s = (ts: number, x: number, y: number): LocationSample => ({ driver: 1, ts, x, y, z: 0 });

describe("positionAt", () => {
  const samples = [s(1000, 0, 0), s(1270, 100, 0), s(1540, 100, 100), s(5000, 0, 100)];

  it("returns null before the first sample", () => {
    expect(positionAt(samples, 500)).toBeNull();
  });

  it("marks exact samples as measured", () => {
    const p = positionAt(samples, 1270)!;
    expect(p.kind).toBe("measured");
    expect(p.x).toBe(100);
  });

  it("interpolates linearly between close samples", () => {
    const p = positionAt(samples, 1135)!;
    expect(p.kind).toBe("interpolated");
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
    expect(p.heading).toBeCloseTo(0);
    expect(p.stale).toBe(false);
  });

  it("holds across a long gap instead of drawing a line", () => {
    const p = positionAt(samples, 3000)!;
    expect(p.kind).toBe("held");
    expect(p.x).toBe(100);
    expect(p.y).toBe(100);
    expect(p.ageMs).toBe(1460);
    expect(p.stale).toBe(false);
  });

  it("never extrapolates past the last sample and marks old data stale", () => {
    const p = positionAt(samples, 12_000)!;
    expect(p.kind).toBe("held");
    expect(p.x).toBe(0);
    expect(p.stale).toBe(true);
  });

  it("respects custom thresholds", () => {
    const p = positionAt(samples, 1100, { maxGapMs: 100, staleMs: 50 })!;
    expect(p.kind).toBe("held");
    expect(p.stale).toBe(true);
  });
});

describe("blendHeading", () => {
  it("takes the short way round", () => {
    const h = blendHeading(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(h) - Math.PI)).toBeLessThan(1e-9);
  });
});
