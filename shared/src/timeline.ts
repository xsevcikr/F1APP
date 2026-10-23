// SessionTimeline indexes a session's records so the state at any moment can be
// computed quickly. The same code serves live sessions (records are appended as
// they arrive) and replays (records are loaded up front and the clock moves).
import { drsReading, type DrsReading } from "./drs.ts";
import { DEFAULT_INTERPOLATION, positionAt, type InterpolatedPosition, type InterpolationOptions } from "./interpolation.ts";
import { classifyRaceControl, driversInMessage, timePenaltySeconds } from "./raceControl.ts";
import { byDriver, byTs, insertSorted, lastAtOrBefore } from "./series.ts";
import { trackStatusAt, type TrackStatus } from "./trackStatus.ts";
import type {
  CarSample,
  Compound,
  DriverInfo,
  Gap,
  IntervalRecord,
  LapRecord,
  LiveRecord,
  LocationSample,
  PitRecord,
  PositionRecord,
  RaceControlRecord,
  SessionCore,
  StintRecord,
  WeatherRecord,
} from "./types.ts";

export type DriverStatus = "running" | "pit" | "retired" | "dsq" | "dns" | "finished";

export interface Timed<T> {
  value: T | null;
  ts: number | null;
}

export interface LeaderboardRow {
  driver: DriverInfo;
  position: number | null;
  /** Grid slot, or the first reported position when no grid is published. */
  startPosition: number | null;
  /** Positive when the driver has gained places since the start. */
  gained: number | null;
  lap: number | null;
  gapToLeader: Timed<Gap>;
  interval: Timed<Gap>;
  lastLap: LapRecord | null;
  bestLap: LapRecord | null;
  /** True for a few seconds after the driver completes a new personal best. */
  newPersonalBest: boolean;
  compound: Compound | null;
  tyreAge: number | null;
  pitStops: number;
  inPitLane: boolean;
  status: DriverStatus;
  /** How the status was determined, for retired/DSQ rows. */
  statusBasis: string | null;
  penalties: { ts: number; message: string; seconds: number | null }[];
  drs: DrsReading;
  car: CarSample | null;
}

export interface Snapshot {
  t: number;
  track: TrackStatus;
  rows: LeaderboardRow[];
  leaderLap: number | null;
  totalLaps: number | null;
  weather: WeatherRecord | null;
}

const PB_FLASH_MS = 8000;

export class SessionTimeline {
  readonly core: SessionCore;
  readonly drivers = new Map<number, DriverInfo>();
  private positions = new Map<number, PositionRecord[]>();
  private intervals = new Map<number, IntervalRecord[]>();
  private laps = new Map<number, LapRecord[]>();
  private stints = new Map<number, StintRecord[]>();
  private pits = new Map<number, PitRecord[]>();
  private locations = new Map<number, LocationSample[]>();
  private carData = new Map<number, CarSample[]>();
  readonly raceControl: RaceControlRecord[];
  readonly weather: WeatherRecord[];
  /** Bumped on every mutation so views can memoize. */
  version = 0;
  /** Latest source timestamp of any record, used as the live edge. */
  latestTs = 0;

  constructor(core: SessionCore) {
    this.core = core;
    for (const d of core.drivers) this.drivers.set(d.number, d);
    this.positions = byDriver([...core.positions].sort(byTs));
    this.intervals = byDriver([...core.intervals].sort(byTs));
    this.laps = byDriver([...core.laps].sort((a, b) => a.lap - b.lap));
    this.stints = byDriver([...core.stints].sort((a, b) => a.stint - b.stint));
    this.pits = byDriver([...core.pits].sort(byTs));
    this.raceControl = [...core.raceControl].sort(byTs);
    this.weather = [...core.weather].sort(byTs);
    for (const list of [core.positions, core.intervals, core.pits, core.raceControl, core.weather]) {
      for (const r of list as { ts: number }[]) this.latestTs = Math.max(this.latestTs, r.ts);
    }
  }

  get year() {
    return this.core.session.year;
  }

  driverList(): DriverInfo[] {
    return [...this.drivers.values()];
  }

  lapsOf(driver: number): readonly LapRecord[] {
    return this.laps.get(driver) ?? [];
  }

  stintsOf(driver: number): readonly StintRecord[] {
    return this.stints.get(driver) ?? [];
  }

  pitsOf(driver: number): readonly PitRecord[] {
    return this.pits.get(driver) ?? [];
  }

  positionsOf(driver: number): readonly PositionRecord[] {
    return this.positions.get(driver) ?? [];
  }

  intervalsOf(driver: number): readonly IntervalRecord[] {
    return this.intervals.get(driver) ?? [];
  }

  locationsOf(driver: number): readonly LocationSample[] {
    return this.locations.get(driver) ?? [];
  }

  carDataOf(driver: number): readonly CarSample[] {
    return this.carData.get(driver) ?? [];
  }

  hasLocations(): boolean {
    for (const l of this.locations.values()) if (l.length) return true;
    return false;
  }

  /** Merges a window of samples, ignoring duplicates already loaded. */
  addLocations(samples: readonly LocationSample[]) {
    mergeSamples(this.locations, samples);
    for (const s of samples) this.latestTs = Math.max(this.latestTs, s.ts);
    this.version++;
  }

  addCarData(samples: readonly CarSample[]) {
    mergeSamples(this.carData, samples);
    for (const s of samples) this.latestTs = Math.max(this.latestTs, s.ts);
    this.version++;
  }

  /** Applies one pushed live record. */
  apply(rec: LiveRecord) {
    switch (rec.kind) {
      case "location":
        pushTo(this.locations, rec.data);
        break;
      case "carData":
        pushTo(this.carData, rec.data);
        break;
      case "position":
        pushTo(this.positions, rec.data);
        break;
      case "interval":
        pushTo(this.intervals, rec.data);
        break;
      case "pit":
        pushTo(this.pits, rec.data);
        break;
      case "raceControl":
        if (!this.raceControl.some((r) => r.id === rec.data.id)) insertSorted(this.raceControl, rec.data);
        break;
      case "weather":
        insertSorted(this.weather, rec.data);
        break;
      case "lap":
        upsertBy(this.laps, rec.data, (l) => l.lap);
        break;
      case "stint":
        upsertBy(this.stints, rec.data, (s) => s.stint);
        break;
      case "overtake":
        this.core.overtakes.push(rec.data);
        break;
      case "driver":
        this.drivers.set(rec.data.number, { ...this.drivers.get(rec.data.number), ...rec.data });
        break;
    }
    const ts = "ts" in rec.data ? (rec.data as { ts: number }).ts : (rec.data as LapRecord).start ?? 0;
    this.latestTs = Math.max(this.latestTs, ts ?? 0);
    this.version++;
  }

  trackAt(t: number): TrackStatus {
    return trackStatusAt(this.raceControl, t);
  }

  positionOf(driver: number, t: number): number | null {
    return lastAtOrBefore(this.positionsOf(driver), t, (p) => p.ts)?.position ?? null;
  }

  /** Map position for each driver at time t (see interpolation rules). */
  carPositionsAt(t: number, opts: InterpolationOptions = DEFAULT_INTERPOLATION): InterpolatedPosition[] {
    const out: InterpolatedPosition[] = [];
    for (const [, samples] of this.locations) {
      const p = positionAt(samples, t, opts);
      if (p) out.push(p);
    }
    return out;
  }

  /** The lap a driver is on at time t: the highest lap that has started. */
  lapAt(driver: number, t: number): number | null {
    const laps = this.lapsOf(driver);
    let lap: number | null = null;
    for (const l of laps) {
      if (l.start !== null && l.start <= t) lap = l.lap;
      else if (l.start !== null) break;
    }
    return lap;
  }

  /** Completed laps at time t (lap start + duration <= t). */
  completedLaps(driver: number, t: number): LapRecord[] {
    return this.lapsOf(driver).filter((l) => l.start !== null && l.duration !== null && l.start + l.duration * 1000 <= t);
  }

  stintAtLap(driver: number, lap: number | null): StintRecord | null {
    const stints = this.stintsOf(driver);
    if (!stints.length) return null;
    if (lap === null) return stints[0];
    let found: StintRecord | null = null;
    for (const s of stints) if (s.lapStart <= lap) found = s;
    return found;
  }

  private startPosition(driver: number): number | null {
    const g = this.core.grid.find((r) => r.driver === driver);
    if (g) return g.position;
    return this.positionsOf(driver)[0]?.position ?? null;
  }

  private statusAt(driver: number, t: number, inPit: boolean): { status: DriverStatus; basis: string | null } {
    const sessionOver = t >= this.core.session.end;
    const result = this.core.results.find((r) => r.driver === driver);
    const laps = this.lapsOf(driver);
    const last = laps[laps.length - 1];
    const lastEnd = last?.start != null && last.duration != null ? last.start + last.duration * 1000 : last?.start ?? null;
    if (result?.dsq && sessionOver) return { status: "dsq", basis: "Official session result" };
    if (result?.dns) return { status: "dns", basis: "Official session result" };
    // A DNF in the final result applies from the end of the driver's last lap.
    if (result?.dnf && lastEnd !== null && t > lastEnd + 60_000) {
      return { status: "retired", basis: "Official result lists a DNF; shown from the end of the driver's last recorded lap" };
    }
    if (this.trackAt(t).chequered && result && !result.dnf && lastEnd !== null && t >= lastEnd) {
      return { status: "finished", basis: null };
    }
    return { status: inPit ? "pit" : "running", basis: null };
  }

  snapshotAt(t: number): Snapshot {
    const track = this.trackAt(t);
    const rows: LeaderboardRow[] = [];
    let leaderLap: number | null = null;

    for (const d of this.drivers.values()) {
      const num = d.number;
      const position = this.positionOf(num, t);
      const iv = lastAtOrBefore(this.intervalsOf(num), t, (r) => r.ts);
      const lap = this.lapAt(num, t);
      const done = this.completedLaps(num, t);
      const timed = done.filter((l) => l.duration !== null);
      const lastLap = timed[timed.length - 1] ?? null;
      let bestLap: LapRecord | null = null;
      for (const l of timed) if (!l.pitOutLap && (!bestLap || (l.duration ?? Infinity) < (bestLap.duration ?? Infinity))) bestLap = l;
      const lastEnd = lastLap?.start != null && lastLap.duration != null ? lastLap.start + lastLap.duration * 1000 : null;
      const newPersonalBest = !!(lastLap && bestLap && lastLap === bestLap && timed.length > 1 && lastEnd !== null && t - lastEnd < PB_FLASH_MS);

      const stint = this.stintAtLap(num, lap);
      const tyreAge = stint && stint.tyreAgeAtStart !== null && lap !== null ? stint.tyreAgeAtStart + Math.max(0, lap - stint.lapStart) : null;

      const pits = this.pitsOf(num).filter((p) => p.ts <= t);
      const lastPit = pits[pits.length - 1];
      const inPitLane = !!(lastPit && lastPit.laneDuration !== null && t <= lastPit.ts + lastPit.laneDuration * 1000);

      const penalties = this.raceControl
        .filter((r) => r.ts <= t && classifyRaceControl(r).kind === "penalty" && (r.driver === num || driversInMessage(r.message).includes(num)))
        .map((r) => ({ ts: r.ts, message: r.message, seconds: timePenaltySeconds(r.message) }));

      const car = lastAtOrBefore(this.carDataOf(num), t, (c) => c.ts) ?? null;
      const { status, basis } = this.statusAt(num, t, inPitLane);
      const start = this.startPosition(num);

      if (position === 1) leaderLap = lap;
      rows.push({
        driver: d,
        position,
        startPosition: start,
        gained: start !== null && position !== null ? start - position : null,
        lap,
        gapToLeader: { value: iv?.gapToLeader ?? null, ts: iv?.ts ?? null },
        interval: { value: iv?.interval ?? null, ts: iv?.ts ?? null },
        lastLap,
        bestLap,
        newPersonalBest,
        compound: stint?.compound ?? null,
        tyreAge,
        pitStops: pits.length,
        inPitLane,
        status,
        statusBasis: basis,
        penalties,
        drs: drsReading({ year: this.year, sample: car ?? undefined, now: t, track }),
        car,
      });
    }

    rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.driver.number - b.driver.number);
    const weather = lastAtOrBefore(this.weather, t, (w) => w.ts) ?? null;
    return { t, track, rows, leaderLap, totalLaps: this.totalLaps(), weather };
  }

  /**
   * Total race laps, only when the official classification gives it (the winner's
   * lap count). OpenF1 does not publish the scheduled lap count before a race.
   */
  totalLaps(): number | null {
    const winner = this.core.results.find((r) => r.position === 1);
    return this.core.session.type === "Race" || this.core.session.type === "Sprint" ? winner?.laps ?? null : null;
  }

  /** Position of every driver at the end of every lap, for progression charts. */
  lapPositions(): Map<number, { lap: number; position: number }[]> {
    const out = new Map<number, { lap: number; position: number }[]>();
    for (const [num, laps] of this.laps) {
      const series: { lap: number; position: number }[] = [];
      for (const l of laps) {
        if (l.start === null || l.duration === null) continue;
        const p = this.positionOf(num, l.start + l.duration * 1000);
        if (p !== null) series.push({ lap: l.lap, position: p });
      }
      out.set(num, series);
    }
    return out;
  }

  /** Time range covered by the session's records. */
  range(): { start: number; end: number } {
    const s = this.core.session;
    return { start: s.start, end: Math.max(s.end, this.latestTs) };
  }

  /** Approximate start time of a given leader lap, for lap selection in replays. */
  lapStartTime(lap: number): number | null {
    let best: number | null = null;
    for (const laps of this.laps.values()) {
      const l = laps.find((x) => x.lap === lap);
      if (l?.start != null && (best === null || l.start < best)) best = l.start;
    }
    return best;
  }
}

function pushTo<T extends { driver: number; ts: number }>(m: Map<number, T[]>, item: T) {
  let list = m.get(item.driver);
  if (!list) m.set(item.driver, (list = []));
  insertSorted(list, item);
}

function upsertBy<T extends { driver: number }>(m: Map<number, T[]>, item: T, key: (x: T) => number) {
  let list = m.get(item.driver);
  if (!list) m.set(item.driver, (list = []));
  const i = list.findIndex((x) => key(x) === key(item));
  if (i >= 0) list[i] = { ...list[i], ...item };
  else {
    list.push(item);
    list.sort((a, b) => key(a) - key(b));
  }
}

function mergeSamples<T extends { driver: number; ts: number }>(m: Map<number, T[]>, samples: readonly T[]) {
  const incoming = byDriver(samples);
  for (const [driver, list] of incoming) {
    const existing = m.get(driver) ?? [];
    const seen = new Set(existing.map((s) => s.ts));
    const merged = existing.concat(list.filter((s) => !seen.has(s.ts)));
    merged.sort(byTs);
    m.set(driver, merged);
  }
}
