// SIMULATED demonstration provider, enabled only with DATA_MODE=demo.
//
// It generates a fictional race on a synthetic circuit with fictional drivers
// and teams, so the interface can be explored offline. Every response is
// marked SIMULATED and the UI shows a permanent banner. Nothing here describes
// a real session, driver or team.
import {
  boundsOf,
  inLiveWindow,
  type CarSample,
  type ChannelAvailability,
  type CircuitModel,
  type Compound,
  type DriverInfo,
  type Gap,
  type IntervalRecord,
  type LapRecord,
  type LiveRecord,
  type LocationSample,
  type PitRecord,
  type Point,
  type PositionRecord,
  type ProviderHealth,
  type RaceControlRecord,
  type SampleWindow,
  type SessionCore,
  type SessionInfo,
  type StintRecord,
  type WeatherRecord,
  type ResultRecord,
  type GridRecord,
  type SourceOvertake,
} from "@f1/shared";
import type { LiveFeed } from "../live.ts";
import type { TimingProvider } from "./types.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEAMS: [string, string][] = [
  ["Aurora Racing", "#E10600"],
  ["Vector GP", "#2F6BFF"],
  ["Kestrel Motorsport", "#FF8A00"],
  ["Halcyon F1", "#00C2A8"],
  ["Monolith Racing", "#9AA3AE"],
  ["Nova Dynamics", "#B46BFF"],
  ["Ridgeline", "#1FB25A"],
  ["Cobalt Works", "#0AA5E0"],
  ["Ember Speed", "#FF3D7F"],
  ["Polar Team", "#F2F2F2"],
];

const NAMES = [
  "Alex Demo", "Bea Sample", "Cal Synth", "Dana Proto", "Eli Mock", "Fay Test", "Gus Model", "Hana Fixture", "Ian Stub", "Jo Dummy",
  "Kai Render", "Lea Pixel", "Max Vector", "Nia Frame", "Oli Sprite", "Pia Shader", "Quin Buffer", "Rae Kernel", "Sol Cache", "Tom Thread",
];

const TOTAL_LAPS = 40;
const DT = 0.25; // simulation step, seconds
const SAMPLE_MS = 270; // ~3.7 Hz like OpenF1
const UNITS_PER_M = 10;

interface Sim {
  session: SessionInfo;
  core: Omit<SessionCore, "fetchedAt">;
  locations: LocationSample[];
  carData: CarSample[];
  circuit: CircuitModel;
}

export class DemoProvider implements TimingProvider, LiveFeed {
  readonly id = "demo" as const;
  private sim: Sim;

  constructor(
    bootTime = Date.now(),
    private now: () => number = Date.now,
  ) {
    this.sim = simulate(bootTime - 25 * 60_000);
  }

  get session() {
    return this.sim.session;
  }

  health(): ProviderHealth {
    return { id: "demo", ok: true, lastSuccess: this.now(), lastError: null, authenticated: false };
  }

  async listSessions(): Promise<SessionInfo[]> {
    return [this.sim.session];
  }

  async getSession(key: number) {
    return key === this.sim.session.sessionKey ? this.sim.session : null;
  }

  async getCore(): Promise<SessionCore> {
    const t = this.now();
    const c = this.sim.core;
    const upTo = <T extends { ts: number }>(a: T[]) => a.filter((r) => r.ts <= t);
    const finished = c.raceControl.some((r) => r.flag === "CHEQUERED" && r.ts <= t);
    return {
      ...c,
      laps: c.laps.filter((l) => l.start !== null && l.start <= t).map((l) => (l.start! + (l.duration ?? 0) * 1000 <= t ? l : { ...l, duration: null, s1: null, s2: null, s3: null })),
      stints: c.stints.filter((s) => (c.laps.find((l) => l.driver === s.driver && l.lap === s.lapStart)?.start ?? Infinity) <= t),
      pits: upTo(c.pits),
      positions: upTo(c.positions),
      intervals: upTo(c.intervals),
      raceControl: upTo(c.raceControl),
      weather: upTo(c.weather),
      overtakes: upTo(c.overtakes),
      results: finished ? c.results : [],
      quality: "SIMULATED",
      fetchedAt: t,
    };
  }

  private slice<T extends { ts: number; driver: number }>(arr: T[], from: number, to: number, driver?: number) {
    const t = Math.min(to, this.now());
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].ts < from) lo = mid + 1;
      else hi = mid;
    }
    const out: T[] = [];
    for (let i = lo; i < arr.length && arr[i].ts < t; i++) if (driver === undefined || arr[i].driver === driver) out.push(arr[i]);
    return out;
  }

  async getLocations(_k: number, from: number, to: number, driver?: number): Promise<SampleWindow<LocationSample>> {
    return { from, to, samples: this.slice(this.sim.locations, from, to, driver) };
  }

  async getCarData(_k: number, from: number, to: number, driver?: number): Promise<SampleWindow<CarSample>> {
    return { from, to, samples: this.slice(this.sim.carData, from, to, driver) };
  }

  async getCircuit() {
    return { circuit: this.sim.circuit, fromSession: this.sim.session };
  }

  recordsBetween(from: number, to: number): LiveRecord[] {
    if (!inLiveWindow(this.sim.session, to)) return [];
    const c = this.sim.core;
    const inRange = (ts: number | null) => ts !== null && ts > from && ts <= to;
    const out: LiveRecord[] = [];
    for (const s of this.slice(this.sim.locations, from + 1, to + 1)) out.push({ kind: "location", data: s });
    for (const s of this.slice(this.sim.carData, from + 1, to + 1)) out.push({ kind: "carData", data: s });
    for (const r of c.positions) if (inRange(r.ts)) out.push({ kind: "position", data: r });
    for (const r of c.intervals) if (inRange(r.ts)) out.push({ kind: "interval", data: r });
    for (const r of c.pits) if (inRange(r.ts)) out.push({ kind: "pit", data: r });
    for (const r of c.raceControl) if (inRange(r.ts)) out.push({ kind: "raceControl", data: r });
    for (const r of c.weather) if (inRange(r.ts)) out.push({ kind: "weather", data: r });
    for (const r of c.overtakes) if (inRange(r.ts)) out.push({ kind: "overtake", data: r });
    for (const l of c.laps) {
      // A lap is pushed when it starts (without times) and again when it completes.
      if (inRange(l.start)) out.push({ kind: "lap", data: { ...l, duration: null, s1: null, s2: null, s3: null } });
      if (l.start !== null && l.duration !== null && inRange(l.start + l.duration * 1000)) out.push({ kind: "lap", data: l });
    }
    for (const s of c.stints) {
      const start = c.laps.find((l) => l.driver === s.driver && l.lap === s.lapStart)?.start ?? null;
      if (inRange(start)) out.push({ kind: "stint", data: s });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Simulation

function buildTrack() {
  const N = 1600;
  const raw: Point[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * 2 * Math.PI;
    const r = 1 + 0.22 * Math.sin(3 * th) + 0.12 * Math.cos(5 * th + 0.5) + 0.05 * Math.sin(7 * th + 1.2);
    raw.push([Math.cos(th) * r * 1.35, Math.sin(th) * r]);
  }
  let len = 0;
  for (let i = 0; i < N; i++) len += Math.hypot(raw[(i + 1) % N][0] - raw[i][0], raw[(i + 1) % N][1] - raw[i][1]);
  const scale = (4900 * UNITS_PER_M) / len;
  const pts: Point[] = raw.map(([x, y]) => [x * scale, y * scale]);
  const cum: number[] = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % N][0] - pts[i - 1][0], pts[i % N][1] - pts[i - 1][1]));
  const L = cum[N];
  // Speed profile from curvature (km/h), smoothed so braking zones look plausible.
  const curv: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 4 + N) % N], b = pts[i], c = pts[(i + 4) % N];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = h2 - h1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    curv.push(Math.abs(d));
  }
  let speed = curv.map((k) => 95 + 235 * Math.exp(-k * 9));
  for (let pass = 0; pass < 6; pass++) speed = speed.map((_, i) => Math.min(...[-6, -3, 0, 3, 6].map((o) => speed[(i + o + N) % N])) * 0.5 + speed[i] * 0.5);
  return { pts, cum, L, speed, N };
}

type Track = ReturnType<typeof buildTrack>;

function locate(track: Track, s: number): { i: number; f: number } {
  const L = track.L;
  const d = ((s % L) + L) % L;
  let lo = 0, hi = track.N;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (track.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const f = (d - track.cum[lo]) / (track.cum[lo + 1] - track.cum[lo] || 1);
  return { i: lo, f };
}

function pointAt(track: Track, s: number, offset = 0): Point {
  const { i, f } = locate(track, s);
  const a = track.pts[i], b = track.pts[(i + 1) % track.N];
  const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
  if (!offset) return [x, y];
  const h = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return [x - Math.sin(h) * offset, y + Math.cos(h) * offset];
}

function speedAt(track: Track, s: number) {
  const { i, f } = locate(track, s);
  return track.speed[i] * (1 - f) + track.speed[(i + 1) % track.N] * f;
}

function drsZonesOf(track: Track): [number, number][] {
  // The two longest runs above 290 km/h.
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= track.N; i++) {
    const fast = i < track.N && track.speed[i] > 290;
    if (fast && start < 0) start = i;
    if (!fast && start >= 0) {
      runs.push([track.cum[start], track.cum[i]]);
      start = -1;
    }
  }
  return runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 2);
}

function simulate(sessionStart: number): Sim {
  const rand = mulberry32(20261023);
  const track = buildTrack();
  const L = track.L;
  const zones = drsZonesOf(track);
  const inZone = (s: number) => zones.some(([a, b]) => (s % L) >= a && (s % L) <= b);
  const raceStart = sessionStart + 3 * 60_000;
  const pitEntry = L - 1800;
  const pitExit = 1500;
  const PIT_SPEED = 60;

  const drivers: DriverInfo[] = NAMES.map((name, i) => {
    const [first, last] = name.split(" ");
    const [team, colour] = TEAMS[Math.floor(i / 2)];
    return {
      number: [3, 7, 9, 12, 15, 17, 19, 21, 24, 26, 28, 29, 32, 34, 36, 37, 39, 41, 42, 45][i],
      code: (last.slice(0, 3)).toUpperCase(),
      firstName: first,
      lastName: last,
      fullName: `${first} ${last.toUpperCase()}`,
      broadcastName: `${first[0]} ${last.toUpperCase()}`,
      team,
      teamColour: colour,
      headshotUrl: null,
    };
  });
  const D = drivers.length;
  const pace = drivers.map((_, i) => 1 - i * 0.0011 - rand() * 0.004);
  const grid = drivers.map((_, i) => i).sort((a, b) => pace[b] + rand() * 0.002 - (pace[a] + rand() * 0.002));
  const gridPos = new Array<number>(D);
  grid.forEach((d, p) => (gridPos[d] = p + 1));
  const pitLap = drivers.map(() => 13 + Math.floor(rand() * 12));
  const compounds: [Compound, Compound][] = drivers.map(() => (rand() > 0.5 ? ["MEDIUM", "HARD"] : ["SOFT", "HARD"]));
  const retireDriver = grid[14];
  const retireLap = 27;

  const dist = drivers.map((_, i) => -(gridPos[i] - 1) * 80 - 40);
  const speedNow = new Array<number>(D).fill(0);
  const state = drivers.map(() => ({ lap: 1, pitting: false, stopLeft: 0, pitted: false, finished: false, retired: false, lapStart: raceStart, sectorStart: raceStart, s1: 0, s2: 0, drsEligible: false, finishTs: 0 }));

  const laps: LapRecord[] = [];
  const pits: PitRecord[] = [];
  const positions: PositionRecord[] = [];
  const intervals: IntervalRecord[] = [];
  const raceControl: RaceControlRecord[] = [];
  const weather: WeatherRecord[] = [];
  const overtakes: SourceOvertake[] = [];
  const locations: LocationSample[] = [];
  const carData: CarSample[] = [];
  const stints: StintRecord[] = [];
  const rc = (ts: number, category: string, message: string, extra: Partial<RaceControlRecord> = {}) =>
    raceControl.push({ id: `${ts}:${message}`, ts, category, flag: null, message, scope: null, sector: null, driver: null, lap: null, qualifyingPhase: null, ...extra });

  rc(sessionStart + 60_000, "Flag", "GREEN LIGHT - PIT EXIT OPEN", { flag: "GREEN", scope: "Track" });
  rc(sessionStart + 120_000, "Other", "PIT EXIT CLOSED");
  rc(raceStart, "Flag", "GREEN", { flag: "GREEN", scope: "Track", lap: 1 });
  drivers.forEach((d, i) => {
    laps.push({ driver: d.number, lap: 1, start: raceStart, duration: null, s1: null, s2: null, s3: null, i1Speed: null, i2Speed: null, stSpeed: null, pitOutLap: false, segments: [null, null, null] });
    stints.push({ driver: d.number, stint: 1, compound: compounds[i][0], lapStart: 1, lapEnd: null, tyreAgeAtStart: compounds[i][0] === "SOFT" ? 3 : 0 });
  });
  for (let d = 0; d < D; d++) positions.push({ driver: drivers[d].number, ts: sessionStart + 2 * 60_000, position: gridPos[d] });

  let scStart = 0, scEnd = 0, scState: "none" | "sc" | "ending" = "none";
  let drsEnabled = false, yellowAt = 0, chequeredAt = 0, retiredAt = 0;
  let order = [...grid];
  let lastSample = 0, lastInterval = 0, lastWeather = 0;
  const lapTimeRef = 92;

  for (let step = 0; ; step++) {
    const ts = raceStart + Math.round(step * DT * 1000);
    if (ts > raceStart + 3 * 3600_000) break;
    const leader = order[0];
    const leaderLap = state[leader].lap;

    // Race control script, driven by the leader's progress.
    if (!drsEnabled && leaderLap >= 3 && scState === "none") {
      drsEnabled = true;
      rc(ts, "Drs", "DRS ENABLED");
    }
    if (!yellowAt && leaderLap === 8) {
      yellowAt = ts;
      rc(ts, "Flag", "YELLOW IN TRACK SECTOR 2", { flag: "YELLOW", scope: "Sector", sector: 2, lap: leaderLap });
      rc(ts + 1500, "Other", `CAR ${drivers[grid[9]].number} (${drivers[grid[9]].code}) TIME ${fmt(lapTimeRef + 1.2)} DELETED - TRACK LIMITS AT TURN 9 LAP 7`, { driver: drivers[grid[9]].number, lap: 7 });
    }
    if (yellowAt && ts === yellowAt + 40_000) rc(ts, "Flag", "CLEAR IN TRACK SECTOR 2", { flag: "CLEAR", scope: "Sector", sector: 2, lap: leaderLap });
    if (!retiredAt && state[retireDriver].lap === retireLap && (dist[retireDriver] % L) > L * 0.55) {
      retiredAt = ts;
      state[retireDriver].retired = true;
      const d = drivers[retireDriver];
      rc(ts + 2000, "CarEvent", `CAR ${d.number} (${d.code}) STOPPED AT TURN 11`, { driver: d.number, lap: leaderLap });
      rc(ts + 3000, "Flag", "DOUBLE YELLOW IN TRACK SECTOR 3", { flag: "DOUBLE YELLOW", scope: "Sector", sector: 3, lap: leaderLap });
    }
    if (retiredAt && !scStart && ts >= retiredAt + 15_000) {
      scStart = ts;
      scState = "sc";
      drsEnabled = false;
      rc(ts, "SafetyCar", "SAFETY CAR DEPLOYED", { lap: leaderLap, scope: "Track" });
      rc(ts + 1000, "Drs", "DRS DISABLED");
    }
    if (scState === "sc" && ts >= scStart + 3.2 * lapTimeRef * 1000) {
      scState = "ending";
      rc(ts, "SafetyCar", "SAFETY CAR IN THIS LAP", { lap: leaderLap, scope: "Track" });
    }
    if (scState === "ending" && (dist[leader] % L) < 400 && ts > scStart + 3.6 * lapTimeRef * 1000) {
      scState = "none";
      scEnd = ts;
      rc(ts, "Flag", "CLEAR IN TRACK SECTOR 3", { flag: "CLEAR", scope: "Sector", sector: 3, lap: leaderLap });
      rc(ts + 10, "Flag", "TRACK CLEAR", { flag: "GREEN", scope: "Track", lap: leaderLap });
    }
    if (scEnd && !drsEnabled && ts > scEnd + 2 * lapTimeRef * 1000) {
      drsEnabled = true;
      rc(ts, "Drs", "DRS ENABLED");
      const d = drivers[grid[6]];
      rc(ts + 30_000, "Other", `FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR ${d.number} (${d.code}) - LEAVING THE TRACK AND GAINING AN ADVANTAGE`, { driver: d.number, lap: leaderLap });
    }

    // Movement.
    const pos = new Map(order.map((d, p) => [d, p]));
    for (let d = 0; d < D; d++) {
      const st = state[d];
      if (st.retired || (st.finished && ts > st.finishTs + 40_000)) {
        speedNow[d] = 0;
        continue;
      }
      if (ts < raceStart) continue;
      const s = dist[d];
      const sMod = ((s % L) + L) % L;
      let v = speedAt(track, s) * pace[d];
      const tyreLaps = st.pitted ? st.lap - pitLap[d] : st.lap + (compounds[d][0] === "SOFT" ? 3 : 0);
      const comp = st.pitted ? compounds[d][1] : compounds[d][0];
      const deg = comp === "SOFT" ? 0.0011 : comp === "MEDIUM" ? 0.0007 : 0.0004;
      v *= (comp === "SOFT" ? 1.004 : comp === "MEDIUM" ? 1.001 : 0.998) - deg * tyreLaps;
      v *= 1 + (rand() - 0.5) * 0.01;
      // Launch: ramp up over the first seconds.
      v *= Math.min(1, 0.25 + (ts - raceStart) / 9000);
      if (scState !== "none") v = Math.min(v, 170);
      if (st.finished) v = Math.min(v, 140);
      // Pit lane.
      if (!st.pitted && st.lap === pitLap[d] && sMod >= pitEntry && !st.pitting && scState === "none") {
        st.pitting = true;
        pits.push({ driver: drivers[d].number, ts, lap: st.lap, laneDuration: null, stopDuration: 2.4 + rand() * 0.8 });
      }
      if (st.pitting) {
        v = PIT_SPEED;
        const p = pits[pits.length - 1].driver === drivers[d].number ? pits[pits.length - 1] : pits.find((x) => x.driver === drivers[d].number)!;
        if (sMod < 30 && st.stopLeft === 0 && !st.pitted && st.lap > pitLap[d]) st.stopLeft = p.stopDuration!;
        if (st.stopLeft > 0) {
          st.stopLeft -= DT;
          v = 0;
          if (st.stopLeft <= 0) {
            st.stopLeft = -1;
            st.pitted = true;
            stints.push({ driver: drivers[d].number, stint: 2, compound: compounds[d][1], lapStart: st.lap, lapEnd: null, tyreAgeAtStart: 0 });
            stints.find((x) => x.driver === drivers[d].number && x.stint === 1)!.lapEnd = st.lap - 1;
          }
        }
        if (st.pitted && sMod >= pitExit && sMod < pitEntry) {
          st.pitting = false;
          p.laneDuration = Math.round((ts - p.ts) / 10) / 100;
        }
      }
      // Following: cannot drive through the car ahead unless overtaking on a straight.
      const p = pos.get(d)!;
      if (p > 0 && !st.pitting) {
        const ahead = order[p - 1];
        const gap = dist[ahead] - s;
        const minGap = scState !== "none" ? 120 : 35;
        if (gap > 0 && gap < minGap + 25) {
          const canPass = scState === "none" && inZone(s) && v > speedNow[ahead] * 1.004 && !state[ahead].pitting && rand() < 0.5;
          if (!canPass && !state[ahead].pitting) v = Math.min(v, speedNow[ahead] * (gap < minGap ? 0.97 : 1));
        }
        if (scState !== "none" && gap > 300) v = Math.min(240, v * 1.6);
      }
      // DRS (open only with DRS enabled, eligible and in a zone).
      const zone = zones.find(([a]) => Math.abs(sMod - a) < 30);
      if (zone && p > 0) {
        const ahead = order[p - 1];
        const gapS = (dist[ahead] - s) / ((v / 3.6) * UNITS_PER_M || 1);
        st.drsEligible = drsEnabled && gapS < 1.0 && gapS > 0;
      }
      const drsOpen = drsEnabled && st.drsEligible && inZone(s) && !st.pitting;
      if (!inZone(s) && !zone) {
        // keep eligibility until the end of the zone
      }
      if (drsOpen) v *= 1.025;
      speedNow[d] = v;
      dist[d] += (v / 3.6) * UNITS_PER_M * DT;

      // Lap and sector bookkeeping.
      const lapBase = (st.lap - 1) * L;
      if (!st.s1 && dist[d] >= lapBase + L / 3) st.s1 = (ts - st.lapStart) / 1000;
      if (!st.s2 && st.s1 && dist[d] >= lapBase + (2 * L) / 3) st.s2 = (ts - st.lapStart) / 1000 - st.s1;
      if (dist[d] >= st.lap * L && !st.finished) {
        const lap = laps.find((l) => l.driver === drivers[d].number && l.lap === st.lap)!;
        const dur = (ts - st.lapStart) / 1000;
        Object.assign(lap, { duration: round3(dur), s1: round3(st.s1), s2: round3(st.s2), s3: round3(dur - st.s1 - st.s2), stSpeed: Math.round(speedAt(track, L * 0.2) * pace[d]) });
        if (chequeredAt || (d === leader && st.lap >= TOTAL_LAPS)) {
          if (!chequeredAt) {
            chequeredAt = ts;
            rc(ts, "Flag", "CHEQUERED FLAG", { flag: "CHEQUERED", scope: "Track", lap: st.lap });
          }
          st.finished = true;
          st.finishTs = ts;
        } else {
          st.lap++;
          st.lapStart = ts;
          st.s1 = 0;
          st.s2 = 0;
          laps.push({ driver: drivers[d].number, lap: st.lap, start: ts, duration: null, s1: null, s2: null, s3: null, i1Speed: null, i2Speed: null, stSpeed: null, pitOutLap: st.pitted && st.lap === pitLap[d] + 1, segments: [null, null, null] });
        }
      }
    }

    // Order, by distance; retired cars drop to the back.
    const newOrder = [...order].sort((a, b) => (state[a].retired ? 1 : 0) - (state[b].retired ? 1 : 0) || dist[b] - dist[a]);
    if (step % 4 === 0 && newOrder.some((d, i) => d !== order[i])) {
      for (let i = 0; i < D; i++) {
        if (newOrder[i] !== order[i]) positions.push({ driver: drivers[newOrder[i]].number, ts, position: i + 1 });
      }
      for (let i = 0; i < D - 1; i++) {
        const a = newOrder[i], b = newOrder[i + 1];
        if (order.indexOf(a) > order.indexOf(b) && !state[a].pitting && !state[b].pitting && !state[b].retired && scState === "none") {
          overtakes.push({ ts, overtaking: drivers[a].number, overtaken: drivers[b].number, position: i + 1 });
        }
      }
      order = newOrder;
    }

    // Intervals every 4 s.
    if (ts - lastInterval >= 4000 && ts >= raceStart) {
      lastInterval = ts;
      const lapMs = lapTimeRef * 1000;
      for (let i = 0; i < D; i++) {
        const d = order[i];
        if (state[d].retired) continue;
        const gap = (a: number): Gap => {
          const dd = dist[a] - dist[d];
          if (dd >= L) return { kind: "laps", laps: Math.floor(dd / L) };
          return { kind: "time", seconds: round3(((dd / L) * lapMs) / 1000) };
        };
        intervals.push({ driver: drivers[d].number, ts, gapToLeader: i === 0 ? { kind: "leader" } : gap(order[0]), interval: i === 0 ? { kind: "leader" } : gap(order[i - 1]) });
      }
    }

    // Position and car samples at ~3.7 Hz.
    if (ts - lastSample >= SAMPLE_MS) {
      lastSample = ts;
      for (let d = 0; d < D; d++) {
        const st = state[d];
        if (st.finished && ts > st.finishTs + 60_000) continue;
        if (st.retired && ts > retiredAt + 120_000) continue;
        const [x, y] = pointAt(track, dist[d], st.pitting ? -260 : 0);
        locations.push({ driver: drivers[d].number, ts, x: Math.round(x), y: Math.round(y), z: 0 });
        const v = speedNow[d];
        const gear = v < 1 ? 0 : Math.min(8, 1 + Math.floor(v / 42));
        const sMod = ((dist[d] % L) + L) % L;
        const ahead = speedAt(track, dist[d] + 600);
        const drsCode = st.pitting || !drsEnabled ? 0 : inZone(dist[d]) && st.drsEligible ? 12 : st.drsEligible ? 8 : 0;
        carData.push({
          driver: drivers[d].number,
          ts,
          speed: Math.round(v),
          throttle: ahead < v - 25 ? 0 : 100,
          brake: ahead < v - 40 ? 100 : 0,
          gear,
          rpm: gear === 0 ? 4500 : Math.round(9500 + ((v % 42) / 42) * 2500),
          drs: sMod >= 0 ? drsCode : 0,
        });
      }
    }

    if (ts - lastWeather >= 60_000) {
      lastWeather = ts;
      const k = (ts - raceStart) / 3600_000;
      weather.push({ ts, airTemp: round1(24.5 - k * 1.2), trackTemp: round1(38 - k * 3.5), humidity: Math.round(48 + k * 6), pressure: 1012.4, rainfall: false, windDirection: 220, windSpeed: round1(2.1 + Math.sin(k * 6))});
    }

    if (chequeredAt && state.every((s) => s.finished || s.retired) && ts > chequeredAt + 70_000) break;
  }

  const sessionEnd = (chequeredAt || raceStart + 3600_000) + 8 * 60_000;
  const finalOrder = [...order];
  const results: ResultRecord[] = finalOrder.map((d, i) => ({
    driver: drivers[d].number,
    position: state[d].retired ? null : i + 1,
    laps: state[d].retired ? state[d].lap - 1 : state[d].lap,
    dnf: state[d].retired,
    dns: false,
    dsq: false,
    duration: null,
    gapToLeader: null,
  }));
  const gridRecords: GridRecord[] = grid.map((d, i) => ({ driver: drivers[d].number, position: i + 1, lapDuration: null }));

  const session: SessionInfo = {
    sessionKey: 990001,
    meetingKey: 990001,
    name: "Race",
    type: "Race",
    year: 2025, // DRS-era rules, so the DRS features can be demonstrated
    circuitKey: null,
    circuitShortName: "Synthetic Circuit",
    location: "Simulation",
    countryName: "Simulated",
    countryCode: "SIM",
    start: sessionStart,
    end: sessionEnd,
    gmtOffset: "+00:00",
    cancelled: false,
    provider: "demo",
  };
  const sim: Omit<SessionCore, "fetchedAt"> = {
    session,
    meeting: {
      meetingKey: 990001,
      name: "Demo Grand Prix (simulated)",
      officialName: "Demo Grand Prix — SIMULATED DATA",
      location: "Simulation",
      countryName: "Simulated",
      countryCode: "SIM",
      circuitShortName: "Synthetic Circuit",
      circuitType: "Permanent",
      year: 2025,
      start: sessionStart,
      end: sessionEnd,
      gmtOffset: "+00:00",
    },
    drivers,
    laps,
    stints,
    pits,
    positions,
    intervals,
    raceControl: raceControl.sort((a, b) => a.ts - b.ts),
    weather,
    overtakes,
    results,
    grid: gridRecords,
    channels: allChannels(),
    quality: "SIMULATED",
  };

  const path = track.pts.filter((_, i) => i % 2 === 0);
  const idx = (s: number) => Math.floor(locate(track, s).i / 2);
  const marker = (s: number) => {
    const [x, y] = pointAt(track, s);
    const [x2, y2] = pointAt(track, s + 20);
    return { x, y, heading: Math.atan2(y2 - y, x2 - x) };
  };
  const pitLane: Point[] = [];
  for (let s = pitEntry; s <= L + pitExit; s += 120) pitLane.push(pointAt(track, s, -260));
  const circuit: CircuitModel = {
    path,
    bounds: boundsOf(path.concat(pitLane)),
    startFinish: marker(0),
    sectorLines: [marker(L / 3), marker((2 * L) / 3)],
    pitLane,
    drsZones: zones.map(([a, b]) => ({ from: idx(a), to: idx(b) })),
    reference: null,
    basis: ["SIMULATED: synthetic circuit generated for demonstration. Not a real track."],
  };
  locations.sort((a, b) => a.ts - b.ts);
  carData.sort((a, b) => a.ts - b.ts);
  return { session, core: sim, locations, carData, circuit };
}

function allChannels(): ChannelAvailability {
  const yes = { available: true };
  return {
    location: yes, carData: yes, intervals: yes, positions: yes, laps: yes, stints: yes, pits: yes, raceControl: yes,
    weather: yes, overtakes: yes, results: yes, grid: yes,
    energy: { available: false, reason: "Not simulated: no real source exposes energy data, so the demo does not invent it." },
    overtakeMode: { available: false, reason: "No overtake mode in the simulated (2025-rules) session." },
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
