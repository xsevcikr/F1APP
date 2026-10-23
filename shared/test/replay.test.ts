import { describe, expect, it } from "vitest";
import { ReplayClock } from "../src/replay.ts";

describe("ReplayClock", () => {
  it("starts paused at the start", () => {
    const c = new ReplayClock(1000, 11_000, 0);
    expect(c.tick(5000)).toMatchObject({ t: 1000, playing: false });
  });

  it("advances with wall time times speed", () => {
    const c = new ReplayClock(0, 100_000, 0);
    c.play(0);
    expect(c.tick(1000).t).toBe(1000);
    c.setSpeed(5, 1000);
    expect(c.tick(2000).t).toBe(6000);
    c.setSpeed(0.5, 2000);
    expect(c.tick(4000).t).toBe(7000);
  });

  it("pauses and resumes without jumping", () => {
    const c = new ReplayClock(0, 100_000, 0);
    c.play(0);
    c.pause(2000);
    expect(c.tick(10_000).t).toBe(2000);
    c.play(10_000);
    expect(c.tick(11_000).t).toBe(3000);
  });

  it("clamps seeks and stops at the end", () => {
    const c = new ReplayClock(0, 10_000, 0);
    c.seek(-5, 0);
    expect(c.tick(0).t).toBe(0);
    c.seek(9_000, 0);
    c.setSpeed(10, 0);
    c.play(0);
    const s = c.tick(1000);
    expect(s.t).toBe(10_000);
    expect(s.playing).toBe(false);
    // Playing again from the end restarts.
    c.play(2000);
    expect(c.tick(2000).t).toBe(0);
  });

  it("rejects unsupported speeds", () => {
    const c = new ReplayClock(0, 10_000, 0);
    expect(() => c.setSpeed(3 as never, 0)).toThrow();
  });

  it("follows the live edge until the user seeks", () => {
    const c = new ReplayClock(0, 10_000, 0);
    c.goLive(0);
    expect(c.tick(100, 20_000).t).toBe(20_000);
    c.seek(5000, 200);
    expect(c.tick(300, 25_000).followLive).toBe(false);
  });

  it("jumps between event markers", () => {
    const c = new ReplayClock(0, 100_000, 0);
    c.seek(10_000, 0);
    expect(c.jumpToMarker([5_000, 20_000, 40_000], 1, 0)).toBe(20_000);
    expect(c.jumpToMarker([5_000, 20_000, 40_000], -1, 0)).toBe(5_000);
    expect(c.jumpToMarker([5_000], -1, 0)).toBeNull();
  });

  it("steps relative to the current time", () => {
    const c = new ReplayClock(0, 100_000, 0);
    c.seek(50_000, 0);
    c.step(-10_000, 0);
    expect(c.tick(0).t).toBe(40_000);
  });
});
