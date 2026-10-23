// Circuit geometry derived from real car positions.
//
// OpenF1 does not publish a circuit outline, sector lines, pit lane or DRS
// zones. We reconstruct them from what cars actually did:
// - outline: the location trace of one clean lap
// - start/finish and sector lines: where that car was at its lap start and at
//   the end of sectors 1 and 2 (lap start times are approximate in the source)
// - pit lane: the trace of a car during a pit stop
// - DRS activation zones: where cars' telemetry reported DRS open
// Everything here is labelled as derived in the UI.
import { drsFromCode } from "./drs.ts";
import { positionAt } from "./interpolation.ts";
import type { CarSample, LapRecord, LocationSample } from "./types.ts";

export type Point = [number, number];

export interface CircuitMarker {
  x: number;
  y: number;
  /** Direction of travel in radians, for drawing a perpendicular line. */
  heading: number | null;
}

export interface CircuitModel {
  path: Point[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  startFinish: CircuitMarker | null;
  sectorLines: CircuitMarker[];
  pitLane: Point[] | null;
  /** DRS activation zones as index ranges into path. */
  drsZones: { from: number; to: number }[];
  reference: { driver: number; lap: number } | null;
  basis: string[];
}

/** Drops points closer than minDist to the previous kept point. */
export function simplify(points: Point[], minDist: number): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]];
  for (const p of points.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist) out.push(p);
  }
  return out;
}

export function boundsOf(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function nearestIndex(path: Point[], x: number, y: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface DrsReference {
  locations: readonly LocationSample[];
  car: readonly CarSample[];
}

export interface BuildCircuitInput {
  lap: LapRecord;
  /** Location samples covering the reference lap. */
  locations: readonly LocationSample[];
  pitLaneSamples?: readonly LocationSample[];
  drsReferences?: DrsReference[];
  seasonHasDrs: boolean;
}

export function buildCircuit(input: BuildCircuitInput): CircuitModel | null {
  const { lap, locations } = input;
  if (lap.start === null || lap.duration === null) return null;
  const lapEnd = lap.start + lap.duration * 1000;
  const inLap = locations.filter((s) => s.ts >= lap.start! && s.ts <= lapEnd && !(s.x === 0 && s.y === 0));
  if (inLap.length < 50) return null;

  const raw: Point[] = inLap.map((s) => [s.x, s.y]);
  const b0 = boundsOf(raw);
  const span = Math.max(b0.maxX - b0.minX, b0.maxY - b0.minY);
  const path = simplify(raw, span / 600);
  const basis = [`Outline traced from car #${lap.driver}'s position samples on lap ${lap.lap}.`];

  const marker = (t: number): CircuitMarker | null => {
    const p = positionAt(locations, t, { maxGapMs: 2000, staleMs: 2000 });
    return p ? { x: p.x, y: p.y, heading: p.heading } : null;
  };
  const startFinish = marker(lap.start);
  const sectorLines: CircuitMarker[] = [];
  if (lap.s1 !== null) {
    const m = marker(lap.start + lap.s1 * 1000);
    if (m) sectorLines.push(m);
    if (lap.s2 !== null) {
      const m2 = marker(lap.start + (lap.s1 + lap.s2) * 1000);
      if (m2) sectorLines.push(m2);
    }
  }
  if (startFinish) basis.push("Start/finish and sector lines placed where the reference car was at its (approximate) lap and sector times.");

  let pitLane: Point[] | null = null;
  if (input.pitLaneSamples && input.pitLaneSamples.length > 10) {
    pitLane = simplify(
      input.pitLaneSamples.filter((s) => !(s.x === 0 && s.y === 0)).map((s) => [s.x, s.y] as Point),
      span / 600,
    );
    basis.push("Pit lane traced from a car's positions during a pit stop.");
  }

  const drsZones: { from: number; to: number }[] = [];
  if (input.seasonHasDrs && input.drsReferences?.length) {
    const open = new Array<boolean>(path.length).fill(false);
    for (const ref of input.drsReferences) {
      for (const c of ref.car) {
        if (drsFromCode(c.drs) !== "ACTIVE") continue;
        const p = positionAt(ref.locations, c.ts, { maxGapMs: 1500, staleMs: 1000 });
        if (p && p.kind !== "held") open[nearestIndex(path, p.x, p.y)] = true;
      }
    }
    // Close small holes, then collect runs.
    for (let i = 1; i < path.length - 1; i++) if (!open[i] && open[i - 1] && (open[i + 1] || open[i + 2])) open[i] = true;
    let runStart = -1;
    for (let i = 0; i <= path.length; i++) {
      if (i < path.length && open[i]) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        if (i - runStart >= 3) drsZones.push({ from: runStart, to: i - 1 });
        runStart = -1;
      }
    }
    if (drsZones.length) basis.push("DRS activation zones are where car telemetry reported DRS open. Detection points are not published by the source.");
  }

  return {
    path,
    bounds: boundsOf(pitLane ? path.concat(pitLane) : path),
    startFinish,
    sectorLines,
    pitLane,
    drsZones,
    reference: { driver: lap.driver, lap: lap.lap },
    basis,
  };
}

/** Picks a clean reference lap: a fast, complete lap that is not an out-lap. */
export function pickReferenceLap(laps: readonly LapRecord[]): LapRecord | null {
  const clean = laps.filter((l) => l.start !== null && l.duration !== null && !l.pitOutLap && l.lap > 1);
  if (!clean.length) return null;
  const sorted = [...clean].sort((a, b) => a.duration! - b.duration!);
  // Use a lap near the fastest but not an outlier: the median of the fastest five.
  return sorted[Math.min(2, sorted.length - 1)];
}
