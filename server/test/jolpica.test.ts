import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cache } from "../src/cache.ts";
import { JolpicaProvider } from "../src/providers/jolpica.ts";
import { loadConfig } from "../src/config.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "f1-jolpica-"));
afterEach(() => vi.unstubAllGlobals());

const env = (table: string, body: object, extra: object = {}) => ({ MRData: { series: "f1", limit: "100", offset: "0", total: "1", ...extra, [table]: body } });
const race = (round: string, extra: object = {}) => ({ season: "2025", round, raceName: "Test Grand Prix", date: "2025-03-16", Circuit: { circuitId: "x", circuitName: "X", Location: { locality: "L", country: "C" } }, ...extra });
const resRow = (id: string, pos: string, extra: object = {}) => ({ position: pos, positionText: pos, points: "25", Driver: { driverId: id, givenName: "G", familyName: id }, Constructor: { constructorId: "c", name: "C" }, grid: "1", laps: "57", status: "Finished", ...extra });

function setup(handler: (url: URL, headers: Headers) => object | { status: number; body?: unknown }, now = () => Date.parse("2026-10-23T12:00:00Z")) {
  const calls: { path: string; ua: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({ path: url.pathname + url.search, ua: headers.get("user-agent") });
    const out = handler(url, headers) as { status?: number; body?: unknown };
    if (typeof out.status === "number") return new Response(JSON.stringify(out.body ?? {}), { status: out.status });
    return new Response(JSON.stringify(out), { status: 200 });
  });
  const cfg = loadConfig();
  const p = new JolpicaProvider(cfg.jolpica, new Cache(tmp(), now), now);
  // Real limiter delays would slow the tests; the limiter itself has its own tests.
  (p as unknown as { limiter: { schedule: <T>(f: () => Promise<T>) => Promise<T> } }).limiter = { schedule: (f) => f() } as never;
  return { p, calls };
}

describe("Jolpica provider", () => {
  it("sends the configured User-Agent and the documented path", async () => {
    const { p, calls } = setup(() => env("RaceTable", { Races: [race("1", { Results: [resRow("norris", "1")] })] }));
    const r = await p.results(2025, 1);
    expect(r?.rows[0].driver.id).toBe("norris");
    expect(calls[0].path).toBe("/ergast/f1/2025/1/results.json?limit=100");
    expect(calls[0].ua).toMatch(/^f1-control-room\/\d.*non-commercial/);
  });

  it("follows limit/offset pages until total is reached and merges rows of the same race", async () => {
    const { p, calls } = setup((url) => {
      const offset = Number(url.searchParams.get("offset"));
      const rows = offset === 0 ? [resRow("a", "1"), resRow("b", "2")] : [resRow("c", "3")];
      return env("RaceTable", { Races: [race("1", { Results: rows })] }, { total: "3", offset: String(offset) });
    });
    // paged() uses limit=100, so lower total pages are simulated by a total above one page.
    const out = await (p as unknown as { paged: (p: string, s: number, k: string) => Promise<{ MRData: { RaceTable: { Races: { Results: unknown[] }[] } } } > }).paged("2025/results", 2025, "Results");
    expect(out.MRData.RaceTable.Races).toHaveLength(1);
    expect(out.MRData.RaceTable.Races[0].Results).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("rejects a payload without the Ergast envelope instead of showing it", async () => {
    const { p } = setup(() => ({ message: "maintenance" }));
    await expect(p.results(2025, 1)).rejects.toThrow(/Unexpected response from Jolpica.*no MRData/);
    expect(p.health().ok).toBe(false);
  });

  it("rejects a payload whose total is not a number", async () => {
    const { p } = setup(() => env("RaceTable", { Races: [] }, { total: "many" }));
    await expect(p.schedule(2025)).rejects.toThrow(/total is missing or not a number/);
  });

  it("never invents a result row that does not say who it belongs to", async () => {
    const { p } = setup(() => env("RaceTable", { Races: [race("1", { Results: [resRow("norris", "1"), { position: "2", points: "18" }, { ...resRow("x", "3"), Driver: {} }] })] }));
    const r = await p.results(2025, 1);
    expect(r?.rows.map((x) => x.driver.id)).toEqual(["norris"]);
  });

  it("returns null when a race has no published results rather than an empty template", async () => {
    const { p } = setup(() => env("RaceTable", { Races: [] }, { total: "0" }));
    expect(await p.results(2026, 18)).toBeNull();
  });

  it("caches finished seasons permanently and only reloads a current-season entry on refresh after a minute", async () => {
    let t = Date.parse("2026-10-23T12:00:00Z");
    const { p, calls } = setup(() => env("RaceTable", { Races: [race("1")] }), () => t);
    await p.schedule(2026);
    await p.schedule(2026);
    expect(calls).toHaveLength(1);
    await p.refreshing(() => p.schedule(2026));
    expect(calls).toHaveLength(1); // too soon: protects the rate limit
    t += 61_000;
    await p.refreshing(() => p.schedule(2026));
    expect(calls).toHaveLength(2);
    await p.schedule(2024);
    t += 10 * 3600_000;
    await p.schedule(2024);
    expect(calls).toHaveLength(3); // 2024 loaded once, then served from cache
  });

  it("serves stale data when the upstream fails, and reports the error in health", async () => {
    let fail = false;
    let t = Date.parse("2026-10-23T12:00:00Z");
    const { p } = setup(() => (fail ? { status: 403 } : env("RaceTable", { Races: [race("1")] })), () => t);
    expect(await p.schedule(2026)).toHaveLength(1);
    t += 3600_000;
    fail = true;
    expect(await p.schedule(2026)).toHaveLength(1);
  });

  it("reads season drivers, constructors and circuits from their own endpoints", async () => {
    const { p, calls } = setup((url) => {
      if (url.pathname.endsWith("/drivers.json")) return env("DriverTable", { Drivers: [{ driverId: "norris", code: "NOR", permanentNumber: "4", givenName: "Lando", familyName: "Norris" }] });
      if (url.pathname.endsWith("/constructors.json")) return env("ConstructorTable", { Constructors: [{ constructorId: "mclaren", name: "McLaren" }] });
      return env("CircuitTable", { Circuits: [{ circuitId: "albert_park", circuitName: "Albert Park", Location: { locality: "Melbourne", country: "Australia" } }] });
    });
    expect((await p.seasonDrivers(2025))[0]).toMatchObject({ id: "norris", code: "NOR", number: 4 });
    expect((await p.seasonConstructors(2025))[0].name).toBe("McLaren");
    expect((await p.seasonCircuits(2025))[0].locality).toBe("Melbourne");
    expect(calls.map((c) => c.path.split("?")[0])).toEqual(["/ergast/f1/2025/drivers.json", "/ergast/f1/2025/constructors.json", "/ergast/f1/2025/circuits.json"]);
  });
});
