// Lap telemetry helpers: distance from speed, time-at-distance and deltas.
// Distance is integrated from the car's reported speed, so it is a derived
// quantity that drifts slightly over a lap; traces are aligned by it.
import type { CarSample } from "@f1/shared";

export interface TracePoint {
  t: number; // seconds since lap start
  d: number; // metres since lap start (derived)
  speed: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  rpm: number | null;
  drs: number | null;
}

export function buildTrace(samples: readonly CarSample[], lapStart: number): TracePoint[] {
  const out: TracePoint[] = [];
  let d = 0;
  let prev: CarSample | null = null;
  for (const s of samples) {
    if (prev && prev.speed !== null && s.speed !== null) {
      const dt = (s.ts - prev.ts) / 1000;
      if (dt > 0 && dt < 3) d += ((prev.speed + s.speed) / 2 / 3.6) * dt;
    }
    out.push({ t: (s.ts - lapStart) / 1000, d, speed: s.speed, throttle: s.throttle, brake: s.brake, gear: s.gear, rpm: s.rpm, drs: s.drs });
    prev = s;
  }
  return out;
}

/** Time (s) at which the trace reached distance d, linearly interpolated. */
export function timeAtDistance(trace: readonly TracePoint[], d: number): number | null {
  if (!trace.length || d < trace[0].d || d > trace[trace.length - 1].d) return null;
  let lo = 0, hi = trace.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = trace[lo], b = trace[hi];
  if (b.d === a.d) return a.t;
  return a.t + ((d - a.d) / (b.d - a.d)) * (b.t - a.t);
}

/** Time difference (other minus reference) along the lap, sampled every `step` metres. */
export function deltaTrace(ref: readonly TracePoint[], other: readonly TracePoint[], step = 10): { x: number; y: number | null }[] {
  const end = Math.min(ref[ref.length - 1]?.d ?? 0, other[other.length - 1]?.d ?? 0);
  const out: { x: number; y: number | null }[] = [];
  for (let d = 0; d <= end; d += step) {
    const a = timeAtDistance(ref, d), b = timeAtDistance(other, d);
    out.push({ x: d, y: a !== null && b !== null ? b - a : null });
  }
  return out;
}

/** Splits the lap into equal-distance sections and reports time spent in each. */
export function sectionTimes(trace: readonly TracePoint[], sections: number, lapLength: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < sections; i++) {
    const a = timeAtDistance(trace, (lapLength * i) / sections);
    const b = timeAtDistance(trace, (lapLength * (i + 1)) / sections);
    out.push(a !== null && b !== null ? b - a : null);
  }
  return out;
}

/** Distances where the brake channel switches on, after at least `minGapM` metres off. */
export function brakingPoints(trace: readonly TracePoint[], minGapM = 80): number[] {
  const out: number[] = [];
  let lastOff = -Infinity;
  for (let i = 1; i < trace.length; i++) {
    const on = (trace[i].brake ?? 0) > 0;
    const was = (trace[i - 1].brake ?? 0) > 0;
    if (!was) lastOff = trace[i - 1].d;
    if (on && !was && (out.length === 0 || trace[i].d - out[out.length - 1] > minGapM) && trace[i].d - lastOff >= 0) out.push(trace[i].d);
  }
  return out;
}
