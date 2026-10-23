// Race-event detection: position changes, battles and slipstream estimates.
//
// Position changes are found by comparing consecutive consistent orders of the
// field (an order is consistent when every position is held by exactly one
// driver). Each swap is then classified. Only swaps the source itself lists as
// overtakes are "confirmed"; everything else is labelled with the basis of
// the inference.
import { neutralPeriods } from "./trackStatus.ts";
import { lastAtOrBefore } from "./series.ts";
import type { CarSample, Gap, IntervalRecord, PitRecord, PositionRecord, RaceControlRecord, SourceOvertake } from "./types.ts";

export type PositionChangeKind = "confirmed" | "likely-on-track" | "pit-cycle" | "neutralized" | "other";

export interface PositionChange {
  id: string;
  ts: number;
  /** Driver who moved up. */
  gainer: number;
  /** Driver who moved down. */
  loser: number;
  gainerFrom: number;
  gainerTo: number;
  loserFrom: number;
  loserTo: number;
  kind: PositionChangeKind;
  /** Always true: a classification swap is for position. Kept explicit for the UI. */
  forPosition: boolean;
  basis: string;
}

export interface DetectionInput {
  positions: readonly PositionRecord[];
  pits: readonly PitRecord[];
  raceControl: readonly RaceControlRecord[];
  sourceOvertakes: readonly SourceOvertake[];
  /** Ignore changes before this time (e.g. formation lap shuffles). */
  from?: number;
}

const PIT_WINDOW_BEFORE_MS = 30_000;
const PIT_WINDOW_AFTER_MS = 45_000;
const SOURCE_MATCH_MS = 15_000;

export function detectPositionChanges(input: DetectionInput): PositionChange[] {
  const records = [...input.positions].sort((a, b) => a.ts - b.ts);
  const current = new Map<number, number>();
  let lastConsistent: Map<number, number> | null = null;
  const changes: PositionChange[] = [];
  const periods = neutralPeriods(input.raceControl);
  const usedSource = new Set<SourceOvertake>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    current.set(r.driver, r.position);
    // Apply every record with the same timestamp before evaluating.
    if (i + 1 < records.length && records[i + 1].ts === r.ts) continue;
    if (!isConsistent(current)) continue;
    const snapshot = new Map(current);
    if (lastConsistent && (input.from === undefined || r.ts >= input.from)) {
      for (const swap of swapsBetween(lastConsistent, snapshot)) {
        changes.push(classify(swap, r.ts, input, periods, usedSource));
      }
    }
    lastConsistent = snapshot;
  }
  return changes;
}

function isConsistent(order: Map<number, number>): boolean {
  const seen = new Set<number>();
  for (const p of order.values()) {
    if (seen.has(p)) return false;
    seen.add(p);
  }
  return true;
}

interface Swap {
  gainer: number;
  loser: number;
  gainerFrom: number;
  gainerTo: number;
  loserFrom: number;
  loserTo: number;
}

/** Pairs whose relative order flipped between two orders. */
export function swapsBetween(before: Map<number, number>, after: Map<number, number>): Swap[] {
  const moved = [...after.keys()].filter((d) => before.has(d) && before.get(d) !== after.get(d));
  const swaps: Swap[] = [];
  for (const a of moved) {
    for (const b of moved) {
      if (a === b) continue;
      const a0 = before.get(a)!, a1 = after.get(a)!;
      const b0 = before.get(b)!, b1 = after.get(b)!;
      // a was behind b and is now ahead of b, and a moved up.
      if (a0 > b0 && a1 < b1 && a1 < a0) swaps.push({ gainer: a, loser: b, gainerFrom: a0, gainerTo: a1, loserFrom: b0, loserTo: b1 });
    }
  }
  return swaps;
}

function nearPit(pits: readonly PitRecord[], driver: number, ts: number): boolean {
  return pits.some((p) => {
    if (p.driver !== driver) return false;
    const lane = (p.laneDuration ?? 25) * 1000;
    return ts >= p.ts - PIT_WINDOW_BEFORE_MS && ts <= p.ts + lane + PIT_WINDOW_AFTER_MS;
  });
}

function classify(
  s: Swap,
  ts: number,
  input: DetectionInput,
  periods: ReturnType<typeof neutralPeriods>,
  used: Set<SourceOvertake>,
): PositionChange {
  const base = { id: `${ts}:${s.gainer}>${s.loser}`, ts, ...s, forPosition: true };
  const source = input.sourceOvertakes.find(
    (o) => !used.has(o) && o.overtaking === s.gainer && o.overtaken === s.loser && Math.abs(o.ts - ts) <= SOURCE_MATCH_MS,
  );
  const pit = nearPit(input.pits, s.gainer, ts) || nearPit(input.pits, s.loser, ts);
  if (pit) {
    // A pit stop explains the change even if the source lists it.
    return { ...base, kind: "pit-cycle", basis: "One of the two drivers was in or near the pit lane when the order changed." };
  }
  if (source) {
    used.add(source);
    return { ...base, kind: "confirmed", basis: "Listed as an overtake by the data source." };
  }
  const neutral = periods.find((p) => ts >= p.start && (p.end === null || ts <= p.end));
  if (neutral) {
    return { ...base, kind: "neutralized", basis: `Order changed during a ${neutral.kind === "vsc" ? "VSC" : neutral.kind === "red" ? "red flag" : "Safety Car"} period, so it is unlikely to be an on-track pass.` };
  }
  return { ...base, kind: "likely-on-track", basis: "Order changed with no pit stop or neutralization involved. Inferred from timing order, not confirmed." };
}

/** A pair of cars running close together at a moment in time. */
export interface Battle {
  follower: number;
  target: number;
  followerPosition: number;
  /** Interval in seconds, as reported by timing. */
  gap: number;
  gapTs: number;
  /** follower speed minus target speed in km/h, when both cars have fresh telemetry. */
  relativeSpeed: number | null;
  followerSpeed: number | null;
  /** Estimated: close enough that a tow is plausible. */
  slipstream: SlipstreamEstimate;
}

export interface SlipstreamEstimate {
  likely: boolean;
  basis: string;
}

export interface BattleInput {
  t: number;
  order: { driver: number; position: number | null; interval: { value: Gap | null; ts: number | null }; inPitLane: boolean }[];
  carData: (driver: number) => readonly CarSample[];
  /** Interval threshold in seconds. */
  maxGap?: number;
  maxAgeMs?: number;
}

/** Interval below which aerodynamic tow is usually considered possible. A rule of thumb, not physics. */
export const SLIPSTREAM_GAP_S = 1.0;
const SLIPSTREAM_MIN_SPEED = 200;

export function battlesAt(input: BattleInput): Battle[] {
  const { t, order, carData, maxGap = 1.5, maxAgeMs = 4000 } = input;
  const sorted = order.filter((r) => r.position !== null).sort((a, b) => a.position! - b.position!);
  const out: Battle[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const f = sorted[i];
    const ahead = sorted[i - 1];
    const iv = f.interval.value;
    if (!iv || iv.kind !== "time" || f.interval.ts === null) continue;
    if (t - f.interval.ts > 15_000) continue; // interval too old to describe now
    if (iv.seconds > maxGap || f.inPitLane || ahead.inPitLane) continue;
    const fc = lastAtOrBefore(carData(f.driver), t, (c) => c.ts);
    const tc = lastAtOrBefore(carData(ahead.driver), t, (c) => c.ts);
    const fresh = (c?: CarSample) => !!c && t - c.ts <= maxAgeMs && c.speed !== null;
    const relativeSpeed = fresh(fc) && fresh(tc) ? fc!.speed! - tc!.speed! : null;
    const followerSpeed = fresh(fc) ? fc!.speed : null;
    out.push({
      follower: f.driver,
      target: ahead.driver,
      followerPosition: f.position!,
      gap: iv.seconds,
      gapTs: f.interval.ts,
      relativeSpeed,
      followerSpeed,
      slipstream: estimateSlipstream(iv.seconds, followerSpeed),
    });
  }
  return out;
}

export function estimateSlipstream(gapSeconds: number, followerSpeed: number | null): SlipstreamEstimate {
  if (gapSeconds > SLIPSTREAM_GAP_S) {
    return { likely: false, basis: `Gap ${gapSeconds.toFixed(3)} s is above the ${SLIPSTREAM_GAP_S.toFixed(1)} s rule of thumb for a tow.` };
  }
  if (followerSpeed === null) {
    return { likely: true, basis: `Estimate: gap under ${SLIPSTREAM_GAP_S.toFixed(1)} s. No fresh speed data, so it is unknown whether the cars are on a straight.` };
  }
  if (followerSpeed < SLIPSTREAM_MIN_SPEED) {
    return { likely: false, basis: `Estimate: gap is small but speed ${followerSpeed} km/h suggests a corner, where tow has little effect.` };
  }
  return { likely: true, basis: `Estimate: gap under ${SLIPSTREAM_GAP_S.toFixed(1)} s at ${followerSpeed} km/h. No aerodynamic data is measured.` };
}

/** Latest interval for a driver at time t. */
export function intervalAt(list: readonly IntervalRecord[], t: number) {
  return lastAtOrBefore(list, t, (r) => r.ts);
}
