import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RateLimiter } from "../src/rateLimiter.ts";
import { Cache } from "../src/cache.ts";
import { parseLiveMessage } from "../src/live.ts";
import { OpenF1Auth, OpenF1Provider } from "../src/providers/openf1.ts";
import { DemoProvider } from "../src/providers/demo.ts";
import { buildApp, createDeps } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "f1-test-"));

describe("RateLimiter", () => {
  it("computes the wait from every window", () => {
    let now = 0;
    const l = new RateLimiter([{ max: 2, windowMs: 1000 }, { max: 3, windowMs: 60_000 }], () => now);
    const run = () => l.schedule(async () => now);
    void run();
    void run();
    expect(l.waitTime()).toBe(1000);
    now = 1000;
    void run();
    now = 2000;
    expect(l.waitTime()).toBe(58_000);
  });

  it("queues and releases requests over time", async () => {
    vi.useFakeTimers();
    const l = new RateLimiter([{ max: 1, windowMs: 100 }]);
    const done: number[] = [];
    const ps = [1, 2, 3].map((i) => l.schedule(async () => done.push(i)));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([1]);
    await vi.advanceTimersByTimeAsync(250);
    await Promise.all(ps);
    expect(done).toEqual([1, 2, 3]);
    vi.useRealTimers();
  });
});

describe("Cache", () => {
  it("shares in-flight loads and persists permanent entries", async () => {
    const dir = tmp();
    const c = new Cache(dir);
    let loads = 0;
    const load = async () => {
      loads++;
      return { v: 1 };
    };
    const [a, b] = await Promise.all([c.getOrLoad("k", { ttlMs: null, persist: true }, load), c.getOrLoad("k", { ttlMs: null, persist: true }, load)]);
    expect(loads).toBe(1);
    expect(a.value).toEqual(b.value);
    const fresh = new Cache(dir);
    expect((await fresh.get("k"))?.value).toEqual({ v: 1 });
  });

  it("returns stale data marked stale when a reload fails", async () => {
    let now = 0;
    const c = new Cache(tmp(), () => now);
    await c.getOrLoad("k", { ttlMs: 10, persist: false }, async () => "old");
    now = 100;
    const r = await c.getOrLoad("k", { ttlMs: 10, persist: false }, async () => {
      throw new Error("down");
    });
    expect(r).toMatchObject({ value: "old", stale: true });
  });
});

describe("parseLiveMessage", () => {
  it("normalizes known topics and filters other sessions", () => {
    const msg = JSON.stringify({ session_key: 5, driver_number: 1, date: "2025-03-16T05:00:00+00:00", position: 2 });
    expect(parseLiveMessage("v1/position", msg, 5)).toEqual([{ kind: "position", data: { driver: 1, ts: Date.parse("2025-03-16T05:00:00Z"), position: 2 } }]);
    expect(parseLiveMessage("v1/position", msg, 6)).toEqual([]);
    expect(parseLiveMessage("v1/unknown", msg, 5)).toEqual([]);
    expect(parseLiveMessage("v1/position", "{not json", 5)).toEqual([]);
  });
});

describe("OpenF1Provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  const session = {
    session_key: 9999, meeting_key: 1, session_name: "Race", session_type: "Race", year: 2024,
    date_start: "2024-03-02T15:00:00+00:00", date_end: "2024-03-02T17:00:00+00:00", gmt_offset: "03:00:00",
    circuit_key: 63, circuit_short_name: "Sakhir", location: "Sakhir", country_name: "Bahrain", country_code: "BRN",
  };

  function stubFetch(handler: (url: URL) => { status: number; body: unknown }) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input);
      calls.push(url.pathname + url.search);
      const { status, body } = handler(url);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    });
    return calls;
  }

  const make = () => {
    const cfg = loadConfig();
    cfg.openf1 = { ...cfg.openf1, username: null, password: null };
    return new OpenF1Provider(cfg, new Cache(tmp()), new OpenF1Auth(cfg.openf1), () => Date.parse("2025-01-01T00:00:00Z"));
  };

  it("loads a finished session core and treats 404 as empty channels", async () => {
    const calls = stubFetch((url) => {
      const ep = url.pathname.split("/").pop();
      if (ep === "sessions") return { status: 200, body: [session] };
      if (ep === "drivers") return { status: 200, body: [{ driver_number: 1, name_acronym: "VER", team_name: "Red Bull Racing", team_colour: "3671C6" }] };
      if (ep === "race_control") return { status: 200, body: [{ date: "2024-03-02T15:03:00+00:00", category: "Flag", flag: "GREEN", message: "GREEN LIGHT - PIT EXIT OPEN" }] };
      return { status: 404, body: { detail: "No results found." } };
    });
    const p = make();
    const core = await p.getCore(9999);
    expect(core.session.gmtOffset).toBe("+03:00");
    expect(core.drivers[0].teamColour).toBe("#3671C6");
    expect(core.raceControl).toHaveLength(1);
    expect(core.quality).toBe("HISTORICAL");
    expect(core.channels.laps.available).toBe(false);
    expect(core.channels.energy.available).toBe(false);
    expect(core.channels.overtakeMode.reason).toMatch(/No overtake mode/);
    // Second call comes from cache.
    const n = calls.length;
    await p.getCore(9999);
    expect(calls.length).toBe(n);
    expect(calls.some((c) => c.includes("session_key=9999"))).toBe(true);
  });

  it("requests aligned one-minute location windows", async () => {
    const calls = stubFetch((url) => (url.pathname.endsWith("sessions") ? { status: 200, body: [session] } : { status: 200, body: [] }));
    const p = make();
    const from = Date.parse("2024-03-02T15:10:30Z");
    await p.getLocations(9999, from, from + 90_000);
    const loc = calls.filter((c) => c.includes("/location"));
    expect(loc).toHaveLength(2);
    expect(decodeURIComponent(loc[0])).toContain("date>=2024-03-02T15:10:00.000Z");
  });

  it("explains auth refusals", async () => {
    stubFetch((url) => (url.pathname.endsWith("sessions") ? { status: 401, body: { detail: "restricted" } } : { status: 401, body: {} }));
    const p = make();
    await expect(p.listSessions(2024)).rejects.toThrow();
    expect(p.health().lastError).toMatch(/Sponsor/);
  });
});

describe("Demo provider", () => {
  it("only releases records up to the current time and labels them simulated", async () => {
    const boot = Date.parse("2025-06-01T12:00:00Z");
    let now = boot;
    const d = new DemoProvider(boot, () => now);
    const core = await d.getCore();
    expect(core.quality).toBe("SIMULATED");
    expect(core.positions.every((p) => p.ts <= now)).toBe(true);
    expect(core.results).toEqual([]);
    now = boot + 3 * 3600_000;
    const done = await d.getCore();
    expect(done.results.length).toBe(20);
    expect(done.raceControl.some((r) => r.flag === "CHEQUERED")).toBe(true);
  });
});

describe("HTTP API", () => {
  it("serves status, sessions and validates windows in demo mode", async () => {
    const cfg = { ...loadConfig(), mode: "demo" as const, webDist: null, cacheDir: tmp() };
    const app = await buildApp(cfg, createDeps(cfg));
    const status = await app.inject("/api/status");
    expect(status.json().mode).toBe("demo");
    const sessions = (await app.inject("/api/sessions")).json();
    expect(sessions[0].provider).toBe("demo");
    const bad = await app.inject(`/api/sessions/${sessions[0].sessionKey}/locations?from=10&to=5`);
    expect(bad.statusCode).toBe(400);
    const archive = await app.inject("/api/archive/2024/schedule");
    expect(archive.statusCode).toBe(503);
    await app.close();
  });
});
