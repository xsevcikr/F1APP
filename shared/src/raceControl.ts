// Classifies official race-control messages into kinds the UI can style.
// The classification only reads the message the source sent: it never creates
// events. The explanation is general guidance about what the message means.
import type { RaceControlRecord } from "./types.ts";

export type RcKind =
  | "green"
  | "yellow"
  | "double-yellow"
  | "blue"
  | "black"
  | "black-white"
  | "black-orange"
  | "vsc"
  | "vsc-ending"
  | "safety-car"
  | "safety-car-ending"
  | "red"
  | "chequered"
  | "track-clear"
  | "track-limits"
  | "incident"
  | "investigation"
  | "penalty"
  | "penalty-served"
  | "unsafe-release"
  | "debris"
  | "car-stopped"
  | "pit-lane"
  | "track-condition"
  | "drs"
  | "session"
  | "restart"
  | "other";

export type Severity = "info" | "notice" | "caution" | "danger";

export type PenaltyType = "time" | "drive-through" | "stop-go" | "grid" | "reprimand" | "disqualified" | "fine" | "other";

export interface ClassifiedMessage {
  kind: RcKind;
  severity: Severity;
  title: string;
  explanation: string;
  /** For penalties: what the stewards imposed, as the message states it. */
  penalty?: PenaltyType;
}

/** Penalty type named in a stewards' message, or null when it names none. */
export function penaltyTypeOf(message: string): PenaltyType | null {
  const m = message.toUpperCase();
  if (/\bDISQUALIFIED\b|\bDISQUALIFICATION\b/.test(m)) return "disqualified";
  if (/DRIVE[ -]?THROUGH/.test(m)) return "drive-through";
  if (/STOP[ -]?(AND|&)?[ -]?GO/.test(m)) return "stop-go";
  if (/\d+\s*SECONDS?\s+TIME PENALTY|TIME PENALTY/.test(m)) return "time";
  if (/GRID (PLACE )?PENALTY|PLACE GRID/.test(m)) return "grid";
  if (/\bREPRIMAND\b/.test(m)) return "reprimand";
  if (/\bFINE(D)?\b/.test(m) && /EUR|€|\bFINE\b/.test(m)) return "fine";
  if (/PENALT(Y|IES)/.test(m)) return "other";
  return null;
}

const PENALTY_TITLE: Record<PenaltyType, string> = {
  time: "TIME PENALTY",
  "drive-through": "DRIVE-THROUGH PENALTY",
  "stop-go": "STOP AND GO PENALTY",
  grid: "GRID PENALTY",
  reprimand: "REPRIMAND",
  disqualified: "DISQUALIFIED",
  fine: "FINE",
  other: "PENALTY",
};

const PENALTY_HELP: Record<PenaltyType, string> = {
  time: "Time is added to the driver's race time, or served at a pit stop before work starts on the car.",
  "drive-through": "The driver must drive through the pit lane at the speed limit without stopping.",
  "stop-go": "The driver must stop in the pit box for the stated time; no work may be done on the car.",
  grid: "The driver will start a future race further down the grid.",
  reprimand: "A formal warning. Repeated reprimands in a season can lead to a grid penalty.",
  disqualified: "The stewards have excluded the car from the results of the session.",
  fine: "A financial penalty imposed by the stewards.",
  other: "The stewards have imposed a penalty.",
};

const has = (m: string, ...words: string[]) => words.some((w) => m.includes(w));

export function classifyRaceControl(r: RaceControlRecord): ClassifiedMessage {
  const m = r.message.toUpperCase();
  const flag = (r.flag ?? "").toUpperCase();
  const where = r.sector ? ` — SECTOR ${r.sector}` : r.scope === "Track" ? " — TRACK" : "";

  if (r.category === "SafetyCar" || has(m, "SAFETY CAR")) {
    const virtual = has(m, "VIRTUAL SAFETY CAR", "VSC");
    if (has(m, "ENDING", "IN THIS LAP", "WITHDRAWN")) {
      return virtual
        ? { kind: "vsc-ending", severity: "caution", title: "VSC ENDING", explanation: "The Virtual Safety Car period is ending. Racing resumes when the track goes green." }
        : { kind: "safety-car-ending", severity: "caution", title: "SAFETY CAR IN THIS LAP", explanation: "The Safety Car will enter the pit lane at the end of this lap and the race will restart." };
    }
    if (has(m, "DEPLOYED") || virtual) {
      return virtual
        ? { kind: "vsc", severity: "caution", title: "VIRTUAL SAFETY CAR", explanation: "The session is neutralized. Drivers must keep above the minimum delta time and may not overtake." }
        : { kind: "safety-car", severity: "danger", title: "SAFETY CAR", explanation: "The Safety Car has been deployed. The field is neutralized and drivers queue behind the Safety Car." };
    }
  }

  // Check chequered first: "CHEQUERED FLAG" contains the text "RED FLAG".
  if (flag === "CHEQUERED" || has(m, "CHEQUERED FLAG")) {
    return { kind: "chequered", severity: "info", title: "CHEQUERED FLAG", explanation: "The session has finished." };
  }
  if (flag === "RED" || /\bRED FLAG\b/.test(m)) {
    return { kind: "red", severity: "danger", title: "RED FLAG", explanation: "The session has been suspended. Cars must return slowly to the pit lane." };
  }
  if (flag === "DOUBLE YELLOW") {
    return { kind: "double-yellow", severity: "danger", title: `DOUBLE YELLOW${where}`, explanation: "Drivers must slow significantly and be prepared to stop. No overtaking." };
  }
  if (flag === "YELLOW") {
    return { kind: "yellow", severity: "caution", title: `YELLOW FLAG${where}`, explanation: "A local caution has been reported. Drivers must slow down and may not overtake in the affected area." };
  }
  if (flag === "CLEAR") {
    return { kind: "track-clear", severity: "info", title: `CLEAR${where}`, explanation: "The caution in this area has been lifted." };
  }
  if (flag === "GREEN") {
    return { kind: "green", severity: "info", title: `GREEN FLAG${where}`, explanation: "The track is clear and racing conditions apply." };
  }
  if (flag === "BLUE") {
    return { kind: "blue", severity: "notice", title: "BLUE FLAG", explanation: "A driver is being shown blue flags and must let a faster, lapping car through." };
  }

  // Black-flag family. "BLACK AND WHITE" and "BLACK AND ORANGE" both contain "BLACK".
  if (flag === "BLACK AND WHITE" || has(m, "BLACK AND WHITE")) {
    return { kind: "black-white", severity: "caution", title: "BLACK AND WHITE FLAG", explanation: "A warning to the driver for unsportsmanlike behaviour or repeated track-limits offences. A further offence can bring a penalty." };
  }
  if (flag === "BLACK AND ORANGE" || has(m, "BLACK AND ORANGE", "MECHANICAL FLAG")) {
    return { kind: "black-orange", severity: "danger", title: "BLACK FLAG WITH ORANGE DISC", explanation: "The car has a mechanical problem that may endanger others and must come to the pits." };
  }
  if (flag === "BLACK" || /\bBLACK FLAG\b/.test(m)) {
    return { kind: "black", severity: "danger", title: "BLACK FLAG", explanation: "The driver must return to the pits and is excluded from the session." };
  }

  if (r.category === "Drs" || has(m, "DRS ")) {
    return { kind: "drs", severity: "notice", title: has(m, "DISABLED") ? "DRS DISABLED" : "DRS ENABLED", explanation: "Race control has changed whether DRS may be used." };
  }
  if (has(m, "PENALTY SERVED")) {
    return { kind: "penalty-served", severity: "notice", title: "PENALTY SERVED", explanation: "The driver has served a penalty the stewards imposed earlier." };
  }
  const pen = has(m, "NO FURTHER ACTION", "NO FURTHER INVESTIGATION", "UNDER INVESTIGATION", "WILL BE INVESTIGATED", "NOTED") ? null : penaltyTypeOf(m);
  if (pen) {
    const secs = timePenaltySeconds(m);
    const title = pen === "time" && secs ? `${secs} SECOND TIME PENALTY` : PENALTY_TITLE[pen];
    return { kind: "penalty", severity: pen === "reprimand" || pen === "fine" ? "notice" : pen === "disqualified" ? "danger" : "caution", title, explanation: PENALTY_HELP[pen], penalty: pen };
  }
  if (has(m, "TRACK LIMITS")) {
    return { kind: "track-limits", severity: "notice", title: "TRACK LIMITS", explanation: "A lap time was deleted or a warning was issued for leaving the track." };
  }
  if (has(m, "UNSAFE RELEASE")) {
    return { kind: "unsafe-release", severity: "caution", title: "UNSAFE RELEASE", explanation: "A car was reported as released unsafely from its pit box." };
  }
  if (has(m, "UNDER INVESTIGATION", "WILL BE INVESTIGATED", "REVIEWED", "NO FURTHER ACTION", "NO FURTHER INVESTIGATION", "NOTED", "SUMMONED")) {
    const closed = has(m, "NO FURTHER ACTION", "NO FURTHER INVESTIGATION");
    return {
      kind: "investigation",
      severity: "notice",
      title: closed ? "NO FURTHER ACTION" : has(m, "UNDER INVESTIGATION", "WILL BE INVESTIGATED") ? "UNDER INVESTIGATION" : has(m, "NOTED") ? "INCIDENT NOTED" : "STEWARDS",
      explanation: closed ? "The stewards have closed the matter without a penalty." : "The stewards are looking at an incident. No decision has been announced yet.",
    };
  }
  if (has(m, "COLLISION", "INCIDENT", "CONTACT")) {
    return { kind: "incident", severity: "caution", title: "INCIDENT", explanation: "An incident has been reported." };
  }
  if (has(m, "DEBRIS")) {
    return { kind: "debris", severity: "caution", title: "DEBRIS", explanation: "Debris has been reported on track." };
  }
  if (has(m, "STOPPED", "STOPPING")) {
    return { kind: "car-stopped", severity: "caution", title: "CAR STOPPED", explanation: "A car has been reported stopped." };
  }
  if (has(m, "PIT EXIT", "PIT ENTRY", "PIT LANE")) {
    return { kind: "pit-lane", severity: "notice", title: "PIT LANE", explanation: "A pit-lane status change has been reported." };
  }
  if (has(m, "SLIPPERY", "TRACK SURFACE", "RAIN", "WET", "DAMP")) {
    return { kind: "track-condition", severity: "notice", title: "TRACK CONDITIONS", explanation: "Race control reported a change in track conditions." };
  }
  if (has(m, "RESUME", "RESTART", "STANDING START", "ROLLING START", "FORMATION LAP")) {
    return { kind: "restart", severity: "notice", title: "RESTART", explanation: "Race control announced how the session will resume." };
  }
  if (r.category === "SessionStatus" || has(m, "SESSION")) {
    return { kind: "session", severity: "info", title: "SESSION", explanation: "Session status update." };
  }
  return { kind: "other", severity: "info", title: r.category.toUpperCase(), explanation: "Official race-control message." };
}

/** Driver numbers mentioned in a message, e.g. "CAR 44 (HAM)". */
export function driversInMessage(message: string): number[] {
  const out = new Set<number>();
  for (const m of message.matchAll(/CARS?\s+((?:\d{1,2}\s*(?:\([A-Z]{3}\))?\s*(?:,|AND|&)?\s*)+)/gi)) {
    for (const n of m[1].matchAll(/\d{1,2}/g)) out.add(Number(n[0]));
  }
  return [...out];
}

/** Seconds of time penalty in a message like "5 SECOND TIME PENALTY FOR CAR 1". */
export function timePenaltySeconds(message: string): number | null {
  const m = message.toUpperCase().match(/(\d+)\s*SECOND(?:S)?\s+TIME PENALTY/);
  return m ? Number(m[1]) : null;
}
