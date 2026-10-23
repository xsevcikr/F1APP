// Circuit-position interpolation.
//
// The rules are deliberately conservative:
// - Between two reported samples that are close in time we interpolate linearly
//   and mark the result as interpolated, never as measured.
// - We never extrapolate beyond the latest sample. A car whose data stops is held
//   at its last reported point and flagged as stale once that point is old.
// - Across a long gap (sparse or missing data) we hold rather than drawing a
//   straight line across the infield.
import { lastIndexAtOrBefore } from "./series.ts";
import type { LocationSample } from "./types.ts";

export type PositionKind = "measured" | "interpolated" | "held";

export interface InterpolatedPosition {
  driver: number;
  x: number;
  y: number;
  /** Direction of travel in radians (atan2 of dy, dx), or null when unknown. */
  heading: number | null;
  kind: PositionKind;
  /** Milliseconds between t and the nearest reported sample at or before t. */
  ageMs: number;
  stale: boolean;
  /** Timestamp of the sample at or before t. */
  sampleTs: number;
}

export interface InterpolationOptions {
  /** Largest gap between two samples we interpolate across. */
  maxGapMs: number;
  /** Age after which a held position is considered stale. */
  staleMs: number;
}

export const DEFAULT_INTERPOLATION: InterpolationOptions = { maxGapMs: 1500, staleMs: 5000 };

const MEASURED_TOLERANCE_MS = 1;

export function positionAt(
  samples: readonly LocationSample[],
  t: number,
  opts: InterpolationOptions = DEFAULT_INTERPOLATION,
): InterpolatedPosition | null {
  const i = lastIndexAtOrBefore(samples, t, (s) => s.ts);
  if (i < 0) return null;
  const a = samples[i];
  const b = samples[i + 1];
  const age = t - a.ts;

  if (age <= MEASURED_TOLERANCE_MS) {
    return { driver: a.driver, x: a.x, y: a.y, heading: headingAround(samples, i), kind: "measured", ageMs: age, stale: false, sampleTs: a.ts };
  }

  if (b && b.ts - a.ts <= opts.maxGapMs) {
    const f = (t - a.ts) / (b.ts - a.ts);
    const heading = b.x !== a.x || b.y !== a.y ? Math.atan2(b.y - a.y, b.x - a.x) : headingAround(samples, i);
    return {
      driver: a.driver,
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      heading,
      kind: "interpolated",
      ageMs: age,
      stale: false,
      sampleTs: a.ts,
    };
  }

  return { driver: a.driver, x: a.x, y: a.y, heading: headingAround(samples, i), kind: "held", ageMs: age, stale: age > opts.staleMs, sampleTs: a.ts };
}

/** Direction from the nearest distinct previous sample to sample i. */
function headingAround(samples: readonly LocationSample[], i: number): number | null {
  const p = samples[i];
  for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
    const q = samples[k];
    if (q.x !== p.x || q.y !== p.y) return Math.atan2(p.y - q.y, p.x - q.x);
  }
  const n = samples[i + 1];
  if (n && (n.x !== p.x || n.y !== p.y)) return Math.atan2(n.y - p.y, n.x - p.x);
  return null;
}

/** Smallest angle-aware blend between two headings, for smooth arrow rotation. */
export function blendHeading(from: number, to: number, f: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + d * f;
}
