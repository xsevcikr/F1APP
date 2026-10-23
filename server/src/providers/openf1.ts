// OpenF1 provider (https://openf1.org). Historical data needs no account. Live
// data (from 30 minutes before a session until 30 minutes after it) needs a
// paid Sponsor account, configured with OPENF1_USERNAME / OPENF1_PASSWORD.
import {
  buildCircuit,
  inLiveWindow,
  openf1 as n,
  pickReferenceLap,
  seasonHasDrs,
  sessionPhase,
  type CarSample,
  type ChannelAvailability,
  type CircuitModel,
  type LocationSample,
  type ProviderHealth,
  type SampleWindow,
  type SessionCore,
  type SessionInfo,
} from "@f1/shared";
import type { Cache, CachePolicy } from "../cache.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";
import { RateLimiter } from "../rateLimiter.ts";
import type { TimingProvider } from "./types.ts";

const FREE_LIMITS = [
  { max: 3, windowMs: 1000 },
  { max: 30, windowMs: 60_000 },
];
const SPONSOR_LIMITS = [
  { max: 6, windowMs: 1000 },
  { max: 60, windowMs: 60_000 },
];

export const WINDOW_MS = 60_000;
const align = (t: number) => Math.floor(t / WINDOW_MS) * WINDOW_MS;
const iso = (t: number) => new Date(t).toISOString();

/** OAuth2 password-grant token for OpenF1, refreshed before it expires. */
export class OpenF1Auth {
  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string> | null = null;
  lastError: string | null = null;

  constructor(private cfg: Config["openf1"]) {}

  get configured() {
    return !!(this.cfg.username && this.cfg.password);
  }

  async getToken(): Promise<string | null> {
    if (!this.configured) return null;
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token;
    this.pending ??= this.fetchToken().finally(() => (this.pending = null));
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const res = await fetch(this.cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: this.cfg.username!, password: this.cfg.password! }),
    });
    if (!res.ok) {
      this.lastError = `Token request failed with HTTP ${res.status}`;
      throw new UpstreamError(this.lastError, res.status, this.cfg.tokenUrl);
    }
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    this.token = body.access_token;
    this.expiresAt = Date.now() + Number(body.expires_in ?? 3600) * 1000;
    this.lastError = null;
    return this.token;
  }
}

export class OpenF1Provider implements TimingProvider {
  readonly id = "openf1" as const;
  readonly limiter: RateLimiter;
  private lastSuccess: number | null = null;
  private lastError: string | null = null;

  constructor(
    private cfg: Config,
    private cache: Cache,
    readonly auth: OpenF1Auth,
    private now: () => number = Date.now,
  ) {
    this.limiter = new RateLimiter(auth.configured ? SPONSOR_LIMITS : FREE_LIMITS);
  }

  health(): ProviderHealth {
    return { id: "openf1", ok: this.lastError === null, lastSuccess: this.lastSuccess, lastError: this.lastError ?? this.auth.lastError, authenticated: this.auth.configured };
  }

  /** GET an OpenF1 endpoint. Query values are appended raw so filters like `date>=` work. */
  async get<T = unknown[]>(endpoint: string, query: string): Promise<T> {
    const url = `${this.cfg.openf1.baseUrl}/${endpoint}?${query}`;
    const token = await this.auth.getToken().catch(() => null);
    try {
      const v = await fetchJson<T>(url, {
        limiter: this.limiter,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        emptyOn: [404],
        emptyValue: [],
      });
      this.lastSuccess = this.now();
      this.lastError = null;
      return v;
    } catch (err) {
      const e = err as UpstreamError;
      this.lastError =
        e.status === 401 || e.status === 403
          ? "OpenF1 refused the request. During a live session OpenF1 restricts access to Sponsor accounts; archived data returns about 30 minutes after the session ends."
          : e.message;
      throw err;
    }
  }

  /** Cache policy for data about a session, based on whether it can still change. */
  private policyFor(s: Pick<SessionInfo, "start" | "end">): CachePolicy {
    const phase = sessionPhase(s, this.now());
    if (phase === "finished" && this.now() > s.end + 3 * 3600_000) return { ttlMs: null, persist: true };
    if (phase === "finished") return { ttlMs: 10 * 60_000, persist: true };
    if (phase === "live-window") return { ttlMs: 3_000, persist: false };
    return { ttlMs: 10 * 60_000, persist: false };
  }

  async listSessions(year: number): Promise<SessionInfo[]> {
    const past = year < new Date(this.now()).getUTCFullYear();
    const { value } = await this.cache.getOrLoad(
      `openf1:sessions:${year}`,
      { ttlMs: past ? null : 3 * 3600_000, persist: true },
      async () => n.normalizeAll(await this.get("sessions", `year=${year}`), n.normalizeSession, (s) => s.start),
    );
    return value;
  }

  async getSession(sessionKey: number): Promise<SessionInfo | null> {
    const { value } = await this.cache.getOrLoad(`openf1:session:${sessionKey}`, { ttlMs: 3 * 3600_000, persist: true }, async () => {
      const rows = n.normalizeAll(await this.get("sessions", `session_key=${sessionKey}`), n.normalizeSession);
      return rows[0] ?? null;
    });
    return value;
  }

  async getCore(sessionKey: number): Promise<SessionCore> {
    const session = await this.getSession(sessionKey);
    if (!session) throw new UpstreamError(`Session ${sessionKey} not found`, 404, "sessions");
    const { value } = await this.cache.getOrLoad(`openf1:core:${sessionKey}`, this.policyFor(session), () => this.loadCore(session));
    return value;
  }

  private async loadCore(session: SessionInfo): Promise<SessionCore> {
    const q = `session_key=${session.sessionKey}`;
    const isRace = session.type === "Race" || session.type === "Sprint";
    const failures: Partial<Record<keyof ChannelAvailability, string>> = {};
    const safe = async <T>(channel: keyof ChannelAvailability, p: Promise<T>, empty: T): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        failures[channel] = (err as Error).message;
        return empty;
      }
    };

    const [meetingRows, drivers, laps, stints, pits, positions, intervals, raceControl, weather, overtakes, results, grid] = await Promise.all([
      safe("results", this.get("meetings", `meeting_key=${session.meetingKey}`), []),
      safe("results", this.get("drivers", q), []),
      safe("laps", this.get("laps", q), []),
      safe("stints", this.get("stints", q), []),
      safe("pits", this.get("pit", q), []),
      safe("positions", this.get("position", q), []),
      isRace ? safe("intervals", this.get("intervals", q), []) : Promise.resolve([]),
      safe("raceControl", this.get("race_control", q), []),
      safe("weather", this.get("weather", q), []),
      isRace ? safe("overtakes", this.get("overtakes", q), []) : Promise.resolve([]),
      safe("results", this.get("session_result", q), []),
      isRace ? safe("grid", this.get("starting_grid", q), []) : Promise.resolve([]),
    ]);

    const core: SessionCore = {
      session,
      meeting: n.normalizeAll(meetingRows, n.normalizeMeeting)[0] ?? null,
      drivers: n.normalizeDrivers(drivers as Record<string, unknown>[]),
      laps: n.normalizeAll(laps, n.normalizeLap),
      stints: n.normalizeAll(stints, n.normalizeStint),
      pits: n.normalizeAll(pits, n.normalizePit, (p) => p.ts),
      positions: n.normalizeAll(positions, n.normalizePosition, (p) => p.ts),
      intervals: n.normalizeAll(intervals, n.normalizeInterval, (p) => p.ts),
      raceControl: n.normalizeAll(raceControl, n.normalizeRaceControl, (p) => p.ts),
      weather: n.normalizeAll(weather, n.normalizeWeather, (p) => p.ts),
      overtakes: n.normalizeAll(overtakes, n.normalizeOvertake, (p) => p.ts),
      results: n.normalizeAll(results, n.normalizeResult),
      grid: n.normalizeAll(grid, n.normalizeGrid),
      channels: this.channels(session, failures),
      quality: sessionPhase(session, this.now()) === "finished" ? "HISTORICAL" : inLiveWindow(session, this.now()) ? "LIVE" : "UNAVAILABLE",
      fetchedAt: this.now(),
    };
    const nonEmpty = (k: keyof ChannelAvailability, len: number) => {
      if (len === 0 && core.channels[k].available) core.channels[k] = { available: false, reason: failures[k] ?? "The source returned no records for this session." };
    };
    nonEmpty("laps", core.laps.length);
    nonEmpty("positions", core.positions.length);
    nonEmpty("raceControl", core.raceControl.length);
    nonEmpty("weather", core.weather.length);
    nonEmpty("stints", core.stints.length);
    if (isRace) {
      nonEmpty("intervals", core.intervals.length);
      nonEmpty("overtakes", core.overtakes.length);
      nonEmpty("grid", core.grid.length);
    }
    nonEmpty("results", core.results.length);
    if (Object.keys(failures).length === 12) throw new UpstreamError(Object.values(failures)[0] ?? "OpenF1 unavailable", null, "core");
    return core;
  }

  private channels(session: SessionInfo, failures: Partial<Record<keyof ChannelAvailability, string>>): ChannelAvailability {
    const isRace = session.type === "Race" || session.type === "Sprint";
    const ok = (k: keyof ChannelAvailability) => (failures[k] ? { available: false, reason: failures[k] } : { available: true });
    return {
      location: { available: true },
      carData: { available: true },
      intervals: isRace ? ok("intervals") : { available: false, reason: "OpenF1 publishes intervals for races only." },
      positions: ok("positions"),
      laps: ok("laps"),
      stints: ok("stints"),
      pits: ok("pits"),
      raceControl: ok("raceControl"),
      weather: ok("weather"),
      overtakes: isRace ? ok("overtakes") : { available: false, reason: "Overtakes are published for races only." },
      results: ok("results"),
      grid: isRace ? ok("grid") : { available: false, reason: "Starting grid applies to races only." },
      energy: { available: false, reason: "No accessible data source publishes ERS deployment, harvesting or battery state of charge." },
      overtakeMode:
        session.year >= 2026
          ? { available: false, reason: "The 2026 overtake mode exists, but OpenF1 does not publish when drivers activate it." }
          : { available: false, reason: `No overtake mode exists in the ${session.year} regulations.` },
    };
  }

  private async window<T>(
    kind: "location" | "car_data",
    session: SessionInfo,
    from: number,
    to: number,
    driver: number | undefined,
    norm: (r: Record<string, unknown>) => T | null,
  ): Promise<T[]> {
    const policy = this.policyFor(session);
    const fetchRange = (a: number, b: number) =>
      this.get(kind, `session_key=${session.sessionKey}${driver !== undefined ? `&driver_number=${driver}` : ""}&date>=${iso(a)}&date<${iso(b)}`).then((rows) =>
        n.normalizeAll(rows, norm, (s) => (s as { ts: number }).ts),
      );

    if (driver !== undefined) {
      const { value } = await this.cache.getOrLoad(`openf1:${kind}:${session.sessionKey}:${driver}:${from}:${to}`, policy, () => fetchRange(from, to));
      return value;
    }
    // All-driver requests use aligned one-minute windows so the cache can be reused.
    const out: T[] = [];
    for (let a = align(from); a < to; a += WINDOW_MS) {
      const live = inLiveWindow(session, this.now()) && a + WINDOW_MS > this.now() - 5000;
      const p: CachePolicy = live ? { ttlMs: 2000, persist: false } : policy;
      const { value } = await this.cache.getOrLoad(`openf1:${kind}:${session.sessionKey}:all:${a}`, p, () => fetchRange(a, a + WINDOW_MS));
      out.push(...value);
    }
    return out.filter((s) => (s as { ts: number }).ts >= from && (s as { ts: number }).ts < to);
  }

  async getLocations(sessionKey: number, from: number, to: number, driver?: number): Promise<SampleWindow<LocationSample>> {
    const session = await this.getSession(sessionKey);
    if (!session) throw new UpstreamError("Session not found", 404, "sessions");
    return { from, to, samples: await this.window("location", session, from, to, driver, n.normalizeLocation) };
  }

  async getCarData(sessionKey: number, from: number, to: number, driver?: number): Promise<SampleWindow<CarSample>> {
    const session = await this.getSession(sessionKey);
    if (!session) throw new UpstreamError("Session not found", 404, "sessions");
    return { from, to, samples: await this.window("car_data", session, from, to, driver, n.normalizeCarData) };
  }

  /**
   * Builds the circuit from this session, or when it has no completed laps yet
   * (e.g. a live session that has just started), from an earlier session of
   * the same meeting or the same circuit's previous season.
   */
  async getCircuit(sessionKey: number): Promise<{ circuit: CircuitModel; fromSession: SessionInfo } | null> {
    const session = await this.getSession(sessionKey);
    if (!session) return null;
    const candidates: SessionInfo[] = [session];
    const year = await this.listSessions(session.year).catch(() => []);
    candidates.push(...year.filter((s) => s.meetingKey === session.meetingKey && s.sessionKey !== sessionKey && s.end < this.now()).reverse());
    const prev = await this.listSessions(session.year - 1).catch(() => []);
    candidates.push(...prev.filter((s) => s.circuitKey === session.circuitKey && s.circuitKey !== null).reverse());

    for (const s of candidates.slice(0, 4)) {
      const built = await this.cache
        .getOrLoad(`openf1:circuit:v1:${s.sessionKey}`, (v: CircuitModel | null) => (v ? this.policyFor(s) : { ttlMs: 60_000, persist: false }), () => this.buildFor(s))
        .catch(() => ({ value: null }));
      if (built.value) return { circuit: built.value, fromSession: s };
    }
    return null;
  }

  private async buildFor(s: SessionInfo): Promise<CircuitModel | null> {
    const core = await this.getCore(s.sessionKey);
    const byDriver = new Map<number, typeof core.laps>();
    for (const l of core.laps) byDriver.set(l.driver, [...(byDriver.get(l.driver) ?? []), l]);
    // Reference: the driver with the most laps, using one of their clean laps.
    const [refDriver] = [...byDriver.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    if (refDriver === undefined) return null;
    const lap = pickReferenceLap(byDriver.get(refDriver)!);
    if (!lap || lap.start === null || lap.duration === null) return null;
    const lapEnd = lap.start + lap.duration * 1000;
    const loc = await this.getLocations(s.sessionKey, lap.start - 2000, lapEnd + 2000, refDriver);

    const pit = core.pits.find((p) => p.driver === refDriver && p.laneDuration !== null) ?? core.pits.find((p) => p.laneDuration !== null);
    const pitLaneSamples = pit
      ? (await this.getLocations(s.sessionKey, pit.ts - 3000, pit.ts + (pit.laneDuration! + 3) * 1000, pit.driver)).samples
      : undefined;

    const drsRefs = [];
    if (seasonHasDrs(s.year)) {
      // DRS opens only when a car is within a second, so use a few drivers' laps.
      const drivers = [...byDriver.keys()].slice(0, 4);
      for (const d of drivers) {
        const l = pickReferenceLap(byDriver.get(d)!);
        if (!l || l.start === null || l.duration === null) continue;
        const end = l.start + l.duration * 1000;
        const [locs, car] = await Promise.all([this.getLocations(s.sessionKey, l.start, end, d), this.getCarData(s.sessionKey, l.start, end, d)]);
        drsRefs.push({ locations: locs.samples, car: car.samples });
      }
    }
    return buildCircuit({ lap, locations: loc.samples, pitLaneSamples, drsReferences: drsRefs, seasonHasDrs: seasonHasDrs(s.year) });
  }
}
