// DRS state, from the car telemetry DRS code and the season's regulations.
// A driver is shown as DRS ACTIVE only when the car's own telemetry says the
// flap is open. Being close to another car is never treated as activation.
import type { CarSample } from "./types.ts";
import type { TrackStatus } from "./trackStatus.ts";

export type DrsState = "ACTIVE" | "AVAILABLE" | "OFF" | "DISABLED" | "UNKNOWN" | "NOT_APPLICABLE";

export interface DrsReading {
  state: DrsState;
  label: string;
  basis: string;
  ts: number | null;
}

/** DRS existed from 2011 to 2025. The 2026 regulations replaced it with active aero and an overtake mode. */
export function seasonHasDrs(year: number): boolean {
  return year >= 2011 && year <= 2025;
}

/**
 * OpenF1 car_data `drs` codes (from its documentation):
 * 0, 1 = off; 8 = detected, eligible once in an activation zone; 10, 12, 14 = on.
 * Other values are undocumented and treated as unknown.
 */
export function drsFromCode(code: number | null): DrsState {
  if (code === null) return "UNKNOWN";
  if (code === 10 || code === 12 || code === 14) return "ACTIVE";
  if (code === 8) return "AVAILABLE";
  if (code === 0 || code === 1) return "OFF";
  return "UNKNOWN";
}

export const DRS_LABEL: Record<DrsState, string> = {
  ACTIVE: "DRS ACTIVE",
  AVAILABLE: "DRS AVAILABLE",
  OFF: "DRS OFF",
  DISABLED: "DRS DISABLED",
  UNKNOWN: "DRS UNKNOWN",
  NOT_APPLICABLE: "NO DRS",
};

export function drsReading(opts: {
  year: number;
  sample: CarSample | undefined;
  now: number;
  track: TrackStatus | null;
  maxAgeMs?: number;
}): DrsReading {
  const { year, sample, now, track, maxAgeMs = 5000 } = opts;
  if (!seasonHasDrs(year)) {
    return { state: "NOT_APPLICABLE", label: DRS_LABEL.NOT_APPLICABLE, basis: `DRS is not part of the ${year} technical regulations.`, ts: null };
  }
  const neutral = track && track.neutralization !== "none";
  if (track && (track.drsEnabled === false || neutral)) {
    return {
      state: "DISABLED",
      label: DRS_LABEL.DISABLED,
      basis: neutral ? "DRS is not allowed while the session is neutralized." : "Race control has disabled DRS.",
      ts: track.since?.ts ?? null,
    };
  }
  if (!sample) return { state: "UNKNOWN", label: DRS_LABEL.UNKNOWN, basis: "No car telemetry for this driver.", ts: null };
  if (now - sample.ts > maxAgeMs) {
    return { state: "UNKNOWN", label: DRS_LABEL.UNKNOWN, basis: "Car telemetry is too old to show the current DRS state.", ts: sample.ts };
  }
  const state = drsFromCode(sample.drs);
  return {
    state,
    label: DRS_LABEL[state],
    basis: state === "UNKNOWN" ? `Undocumented DRS code ${sample.drs}.` : "Reported by car telemetry.",
    ts: sample.ts,
  };
}
