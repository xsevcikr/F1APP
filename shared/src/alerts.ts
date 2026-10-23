// Notification selection. Each alert has a stable id so the same event never
// alerts twice, even after a reload (the caller persists `seen`).
import type { PositionChange } from "./events.ts";
import { classifyRaceControl } from "./raceControl.ts";
import type { PitRecord, RaceControlRecord } from "./types.ts";

export type AlertType =
  | "overtake"
  | "position"
  | "pit"
  | "safety-car"
  | "vsc"
  | "red-flag"
  | "penalty"
  | "personal-best"
  | "championship";

export interface AlertPrefs {
  enabled: Record<AlertType, boolean>;
  /** When non-empty, driver-specific alerts only fire for these drivers. */
  favouriteDrivers: number[];
  favouriteTeams: string[];
}

export interface Alert {
  id: string;
  type: AlertType;
  ts: number;
  title: string;
  body: string;
  drivers: number[];
}

export interface AlertSources {
  changes: readonly PositionChange[];
  pits: readonly PitRecord[];
  raceControl: readonly RaceControlRecord[];
  personalBests: readonly { driver: number; lap: number; ts: number; time: number }[];
  teamOf: (driver: number) => string | undefined;
  nameOf: (driver: number) => string;
}

export function collectAlerts(src: AlertSources): Alert[] {
  const out: Alert[] = [];
  for (const c of src.changes) {
    const type: AlertType = c.kind === "confirmed" || c.kind === "likely-on-track" ? "overtake" : "position";
    out.push({
      id: `pc:${c.id}`,
      type,
      ts: c.ts,
      title: type === "overtake" ? `${src.nameOf(c.gainer)} passes ${src.nameOf(c.loser)}` : `${src.nameOf(c.gainer)} up to P${c.gainerTo}`,
      body: `P${c.gainerFrom} → P${c.gainerTo}. ${c.basis}`,
      drivers: [c.gainer, c.loser],
    });
  }
  for (const p of src.pits) {
    out.push({ id: `pit:${p.driver}:${p.ts}`, type: "pit", ts: p.ts, title: `${src.nameOf(p.driver)} pits`, body: p.lap ? `Lap ${p.lap}` : "", drivers: [p.driver] });
  }
  for (const r of src.raceControl) {
    const k = classifyRaceControl(r).kind;
    const type: AlertType | null = k === "safety-car" ? "safety-car" : k === "vsc" ? "vsc" : k === "red" ? "red-flag" : k === "penalty" ? "penalty" : null;
    if (type) out.push({ id: `rc:${r.id}`, type, ts: r.ts, title: classifyRaceControl(r).title, body: r.message, drivers: r.driver ? [r.driver] : [] });
  }
  for (const pb of src.personalBests) {
    out.push({ id: `pb:${pb.driver}:${pb.lap}`, type: "personal-best", ts: pb.ts, title: `Personal best: ${src.nameOf(pb.driver)}`, body: `Lap ${pb.lap}`, drivers: [pb.driver] });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

const TRACK_WIDE: AlertType[] = ["safety-car", "vsc", "red-flag"];

export function selectAlerts(all: readonly Alert[], prefs: AlertPrefs, seen: Set<string>, teamOf: (d: number) => string | undefined): Alert[] {
  const favs = new Set(prefs.favouriteDrivers);
  const teams = new Set(prefs.favouriteTeams);
  const filtering = favs.size > 0 || teams.size > 0;
  const out: Alert[] = [];
  for (const a of all) {
    if (seen.has(a.id) || !prefs.enabled[a.type]) continue;
    if (filtering && !TRACK_WIDE.includes(a.type)) {
      const relevant = a.drivers.some((d) => favs.has(d) || teams.has(teamOf(d) ?? ""));
      if (!relevant) continue;
    }
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  enabled: {
    overtake: false,
    position: false,
    pit: false,
    "safety-car": true,
    vsc: true,
    "red-flag": true,
    penalty: false,
    "personal-best": false,
    championship: false,
  },
  favouriteDrivers: [],
  favouriteTeams: [],
};
