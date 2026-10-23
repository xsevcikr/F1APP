// Jolpica F1 (Ergast-compatible) provider for results, standings, schedules and
// historical data back to 1950. Limits: 4 requests/second, 500/hour.
import { AsyncLocalStorage } from "node:async_hooks";
import { jolpica as j, type ProviderHealth } from "@f1/shared";
import type { Cache, CachePolicy } from "../cache.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";
import { RateLimiter } from "../rateLimiter.ts";

type MR = Record<string, any>;

/** The table the Ergast envelope must contain for a path. */
function tableFor(path: string): j.MRTable {
  if (path.endsWith("driverstandings") || path.endsWith("constructorstandings")) return "StandingsTable";
  if (path === "seasons") return "SeasonTable";
  if (path.endsWith("/drivers") || path === "drivers") return "DriverTable";
  if (path.endsWith("/constructors") || path === "constructors") return "ConstructorTable";
  if (path.endsWith("/circuits") || path === "circuits") return "CircuitTable";
  return "RaceTable";
}

export class JolpicaProvider {
  readonly limiter = new RateLimiter([
    { max: 4, windowMs: 1000 },
    { max: 450, windowMs: 3600_000 }, // stay under the published 500/hour
  ]);
  /** Set while serving a user-requested refresh: cached entries older than a minute are reloaded. */
  private readonly refreshCtx = new AsyncLocalStorage<boolean>();
  private lastSuccess: number | null = null;
  private lastError: string | null = null;

  constructor(
    private cfg: Config["jolpica"],
    private cache: Cache,
    private now: () => number = Date.now,
  ) {}

  health(): ProviderHealth {
    return { id: "jolpica", ok: this.lastError === null, lastSuccess: this.lastSuccess, lastError: this.lastError, authenticated: false };
  }

  private currentYear() {
    return new Date(this.now()).getUTCFullYear();
  }

  /** Past seasons are permanent; the current season refreshes every 30 minutes. */
  private policy(season: number | "current"): CachePolicy {
    return season !== "current" && season < this.currentYear() ? { ttlMs: null, persist: true } : { ttlMs: 30 * 60_000, persist: true };
  }

  /** Runs `fn` so that its requests may reload cache entries older than a minute. */
  refreshing<T>(fn: () => Promise<T>): Promise<T> {
    return this.refreshCtx.run(true, fn);
  }

  private async raw(path: string, season: number | "current", query = "", table: j.MRTable = tableFor(path)): Promise<MR> {
    const url = `${this.cfg.baseUrl}/${path}.json?${query}`;
    const refreshAfterMs = this.refreshCtx.getStore() ? 60_000 : undefined;
    const { value } = await this.cache.getOrLoad(`jolpica:${path}?${query}`, this.policy(season), async () => {
      try {
        const v = await fetchJson<MR>(url, { limiter: this.limiter, headers: { "User-Agent": this.cfg.userAgent } });
        const bad = j.checkEnvelope(v, table);
        if (bad) throw new UpstreamError(`Unexpected response from Jolpica for ${path}: ${bad}`, null, url);
        this.lastSuccess = this.now();
        this.lastError = null;
        return v;
      } catch (err) {
        this.lastError = (err as UpstreamError).message;
        throw err;
      }
    }, { refreshAfterMs });
    return value;
  }

  /** Follows limit/offset pagination and concatenates the races of every page. */
  private async paged(path: string, season: number | "current", rowKey: string): Promise<MR> {
    const limit = 100;
    const first = await this.raw(path, season, `limit=${limit}&offset=0`);
    const total = Number(first?.MRData?.total ?? 0);
    const races: MR[] = [...(first?.MRData?.RaceTable?.Races ?? [])];
    for (let offset = limit; offset < total && offset < 20_000; offset += limit) {
      const page = await this.raw(path, season, `limit=${limit}&offset=${offset}`);
      for (const r of page?.MRData?.RaceTable?.Races ?? []) {
        const existing = races.find((x) => x.round === r.round);
        if (existing) existing[rowKey] = [...(existing[rowKey] ?? []), ...(r[rowKey] ?? [])];
        else races.push(r);
      }
    }
    return { MRData: { RaceTable: { Races: races } } };
  }

  schedule(season: number | "current") {
    return this.raw(`${season}/races`, season, "limit=100").then(j.schedule);
  }

  async results(season: number, round: number) {
    return j.raceResults(await this.raw(`${season}/${round}/results`, season, "limit=100"))[0] ?? null;
  }

  async sprint(season: number, round: number) {
    return j.raceResults(await this.raw(`${season}/${round}/sprint`, season, "limit=100"), "SprintResults")[0] ?? null;
  }

  async qualifying(season: number, round: number) {
    return j.qualifyingResults(await this.raw(`${season}/${round}/qualifying`, season, "limit=100"))[0] ?? null;
  }

  async pitStops(season: number, round: number) {
    return j.pitStops(await this.paged(`${season}/${round}/pitstops`, season, "PitStops"));
  }

  async lapPositions(season: number, round: number) {
    const mr = await this.raw(`${season}/${round}/laps`, season, "limit=100&offset=0");
    const total = Number(mr?.MRData?.total ?? 0);
    const laps: MR[] = [...(mr?.MRData?.RaceTable?.Races?.[0]?.Laps ?? [])];
    for (let offset = 100; offset < total; offset += 100) {
      const page = await this.raw(`${season}/${round}/laps`, season, `limit=100&offset=${offset}`);
      for (const l of page?.MRData?.RaceTable?.Races?.[0]?.Laps ?? []) {
        const existing = laps.find((x) => x.number === l.number);
        if (existing) existing.Timings = [...existing.Timings, ...l.Timings];
        else laps.push(l);
      }
    }
    return j.lapPositions({ MRData: { RaceTable: { Races: [{ Laps: laps }] } } });
  }

  async driverStandings(season: number | "current", round?: number) {
    return j.driverStandings(await this.raw(round ? `${season}/${round}/driverstandings` : `${season}/driverstandings`, season, "limit=100"));
  }

  async constructorStandings(season: number | "current", round?: number) {
    return j.constructorStandings(await this.raw(round ? `${season}/${round}/constructorstandings` : `${season}/constructorstandings`, season, "limit=100"));
  }

  /** All race results of a season, used for progression charts and profiles. */
  async seasonResults(season: number) {
    return j.raceResults(await this.paged(`${season}/results`, season, "Results"));
  }

  async seasonSprints(season: number) {
    return j.raceResults(await this.paged(`${season}/sprint`, season, "SprintResults"), "SprintResults");
  }

  async seasonQualifying(season: number) {
    return j.qualifyingResults(await this.paged(`${season}/qualifying`, season, "QualifyingResults"));
  }

  /** Winners of every race held at a circuit, newest first. */
  async circuitWinners(circuitId: string) {
    const mr = await this.paged(`circuits/${circuitId}/results/1`, "current", "Results");
    return j.raceResults(mr).sort((a, b) => b.race.season - a.race.season);
  }

  /** The fastest race lap of every race held at a circuit (Ergast "fastest/1"), from 2004 when the archive starts recording them. */
  async circuitFastestLaps(circuitId: string) {
    const mr = await this.paged(`circuits/${circuitId}/fastest/1/results`, "current", "Results");
    return j.raceResults(mr).sort((a, b) => b.race.season - a.race.season);
  }

  async driverCareer(driverId: string) {
    return j.raceResults(await this.paged(`drivers/${driverId}/results`, "current", "Results"));
  }

  /** Drivers, constructors and circuits that took part in a season (Ergast /drivers, /constructors, /circuits). */
  async seasonDrivers(season: number | "current") {
    return j.seasonDrivers(await this.listAll(`${season}/drivers`, season, "DriverTable", "Drivers"));
  }

  async seasonConstructors(season: number | "current") {
    return j.seasonConstructors(await this.listAll(`${season}/constructors`, season, "ConstructorTable", "Constructors"));
  }

  async seasonCircuits(season: number | "current") {
    return j.seasonCircuits(await this.listAll(`${season}/circuits`, season, "CircuitTable", "Circuits"));
  }

  /** Follows limit/offset pages of a flat table and concatenates them. */
  private async listAll(path: string, season: number | "current", table: string, key: string): Promise<MR> {
    const items: MR[] = [];
    for (let offset = 0, total = Infinity; offset < total && offset < 5000; offset += 100) {
      const page = await this.raw(path, season, `limit=100&offset=${offset}`);
      total = Number(page.MRData.total);
      items.push(...(page.MRData[table]?.[key] ?? []));
    }
    return { MRData: { [table]: { [key]: items } } };
  }

  async seasons() {
    const mr = await this.raw("seasons", "current", "limit=100&offset=0");
    const total = Number(mr?.MRData?.total ?? 0);
    const out: number[] = (mr?.MRData?.SeasonTable?.Seasons ?? []).map((s: MR) => Number(s.season));
    for (let offset = 100; offset < total; offset += 100) {
      const page = await this.raw("seasons", "current", `limit=100&offset=${offset}`);
      out.push(...(page?.MRData?.SeasonTable?.Seasons ?? []).map((s: MR) => Number(s.season)));
    }
    return out.sort((a, b) => b - a);
  }
}
