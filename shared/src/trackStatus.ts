// Folds race-control messages into the track status at a moment in time.
// Only official messages change the status; nothing here is guessed.
import { classifyRaceControl } from "./raceControl.ts";
import type { RaceControlRecord } from "./types.ts";

export type Neutralization = "none" | "vsc" | "vsc-ending" | "safety-car" | "safety-car-ending" | "red";

export interface TrackStatus {
  /** Overall status headline, from most to least severe. */
  headline: "RED FLAG" | "SAFETY CAR" | "VSC" | "VSC ENDING" | "SC IN THIS LAP" | "YELLOW" | "GREEN" | "CHEQUERED" | "UNKNOWN";
  neutralization: Neutralization;
  /** Sectors (1-based) currently under local yellow or double yellow. */
  yellowSectors: { sector: number; double: boolean }[];
  /** Track-wide yellow without a sector. */
  trackYellow: boolean;
  chequered: boolean;
  /** Whether race control has DRS enabled; null when no DRS message has been seen. */
  drsEnabled: boolean | null;
  /** The message that last changed the headline. */
  since: RaceControlRecord | null;
}

export function trackStatusAt(messages: readonly RaceControlRecord[], t: number): TrackStatus {
  let neutralization: Neutralization = "none";
  const yellows = new Map<number, boolean>();
  let trackYellow = false;
  let chequered = false;
  let drsEnabled: boolean | null = null;
  let since: RaceControlRecord | null = null;
  let sawAny = false;

  for (const r of messages) {
    if (r.ts > t) break;
    const c = classifyRaceControl(r);
    switch (c.kind) {
      case "safety-car":
      case "vsc":
      case "red":
        neutralization = c.kind;
        since = r;
        sawAny = true;
        break;
      case "safety-car-ending":
        if (neutralization === "safety-car") neutralization = "safety-car-ending";
        since = r;
        break;
      case "vsc-ending":
        if (neutralization === "vsc") neutralization = "vsc-ending";
        since = r;
        break;
      case "green":
        sawAny = true;
        if (r.sector) yellows.delete(r.sector);
        else {
          // A track-wide green ends neutralizations and local cautions.
          neutralization = "none";
          yellows.clear();
          trackYellow = false;
          since = r;
        }
        break;
      case "track-clear":
        if (r.sector) yellows.delete(r.sector);
        else trackYellow = false;
        break;
      case "yellow":
      case "double-yellow":
        sawAny = true;
        if (r.sector) yellows.set(r.sector, c.kind === "double-yellow" || yellows.get(r.sector) === true);
        else trackYellow = true;
        break;
      case "chequered":
        chequered = true;
        sawAny = true;
        since = r;
        break;
      case "drs":
        drsEnabled = !r.message.toUpperCase().includes("DISABLED");
        break;
    }
  }

  const yellowSectors = [...yellows.entries()].map(([sector, double]) => ({ sector, double })).sort((a, b) => a.sector - b.sector);
  let headline: TrackStatus["headline"] = sawAny ? "GREEN" : "UNKNOWN";
  if (chequered) headline = "CHEQUERED";
  else if (neutralization === "red") headline = "RED FLAG";
  else if (neutralization === "safety-car") headline = "SAFETY CAR";
  else if (neutralization === "safety-car-ending") headline = "SC IN THIS LAP";
  else if (neutralization === "vsc") headline = "VSC";
  else if (neutralization === "vsc-ending") headline = "VSC ENDING";
  else if (trackYellow || yellowSectors.length > 0) headline = "YELLOW";

  return { headline, neutralization, yellowSectors, trackYellow, chequered, drsEnabled, since };
}

/** Time ranges of SC, VSC and red-flag periods, for timelines and history. */
export interface NeutralPeriod {
  kind: "safety-car" | "vsc" | "red";
  start: number;
  end: number | null;
  startLap: number | null;
}

export function neutralPeriods(messages: readonly RaceControlRecord[]): NeutralPeriod[] {
  const out: NeutralPeriod[] = [];
  let open: NeutralPeriod | null = null;
  for (const r of messages) {
    const c = classifyRaceControl(r);
    if (c.kind === "safety-car" || c.kind === "vsc" || c.kind === "red") {
      if (open && open.kind === c.kind) continue;
      if (open) open.end = r.ts;
      open = { kind: c.kind, start: r.ts, end: null, startLap: r.lap };
      out.push(open);
    } else if (open && ((c.kind === "green" && !r.sector) || c.kind === "chequered")) {
      open.end = r.ts;
      open = null;
    }
  }
  return out;
}
