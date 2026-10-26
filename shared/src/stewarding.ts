// Follows each stewarding matter through its official messages:
// noted -> under investigation -> penalty / no further action / withdrawn.
// A status only ever comes from a message the source sent; when no decision
// has been published, the matter stays "under investigation" or "noted".
import { classifyRaceControl, driversInMessage, penaltyTypeOf, type PenaltyType } from "./raceControl.ts";
import type { RaceControlRecord } from "./types.ts";

export type StewardStatus = "noted" | "under investigation" | "investigation after session" | "confirmed" | "served" | "cleared" | "withdrawn";

export interface StewardMatter {
  id: string;
  /** Offence as race control described it, e.g. "CAUSING A COLLISION". */
  reason: string;
  /** Where, when the message says (e.g. "TURN 4", "PIT LANE"). */
  location: string | null;
  drivers: number[];
  status: StewardStatus;
  penalty: PenaltyType | null;
  messages: RaceControlRecord[];
  opened: number;
  updated: number;
}

const STEWARD_KINDS = new Set(["investigation", "penalty", "penalty-served", "unsafe-release", "incident", "track-limits", "black-white"]);

/** Text after the last " - ", which race control uses for the offence. */
function reasonOf(message: string): string {
  const m = message.toUpperCase();
  const i = m.lastIndexOf(" - ");
  return (i >= 0 ? m.slice(i + 3) : "").replace(/\s+/g, " ").trim();
}

function locationOf(message: string): string | null {
  const m = message.toUpperCase();
  const turn = m.match(/\bTURNS? \d+(?:\s*(?:-|AND|&)\s*\d+)?/);
  if (turn) return turn[0];
  if (m.includes("PIT LANE")) return "PIT LANE";
  if (m.includes("PIT ENTRY")) return "PIT ENTRY";
  if (m.includes("PIT EXIT")) return "PIT EXIT";
  if (m.includes("START")) return "START";
  return null;
}

function statusOf(message: string, kind: string): StewardStatus | null {
  const m = message.toUpperCase();
  if (/WITHDRAWN|RESCINDED|OVERTURNED|REVOKED/.test(m)) return "withdrawn";
  if (/NO FURTHER ACTION|NO FURTHER INVESTIGATION|NFA\b/.test(m)) return "cleared";
  if (kind === "penalty-served") return "served";
  if (/WILL BE INVESTIGATED AFTER THE (RACE|SESSION)/.test(m)) return "investigation after session";
  if (/UNDER INVESTIGATION|WILL BE INVESTIGATED|SUMMONED/.test(m)) return "under investigation";
  if (kind === "penalty") return "confirmed";
  if (/\bNOTED\b/.test(m)) return "noted";
  return null;
}

const ORDER: StewardStatus[] = ["noted", "under investigation", "investigation after session", "confirmed", "served", "cleared", "withdrawn"];

/**
 * Groups stewarding messages issued up to `t` into matters. Messages join a
 * matter when they share the offence text and at least one car.
 */
export function stewardMatters(messages: readonly RaceControlRecord[], t = Infinity): StewardMatter[] {
  const out: StewardMatter[] = [];
  for (const r of messages) {
    if (r.ts > t) break;
    const kind = classifyRaceControl(r).kind;
    if (!STEWARD_KINDS.has(kind)) continue;
    const status = statusOf(r.message, kind);
    if (!status) continue;
    const reason = reasonOf(r.message);
    const cars = driversInMessage(r.message);
    if (r.driver !== null && !cars.includes(r.driver)) cars.push(r.driver);
    // Join the most recent open-or-recent matter with the same offence and a shared car.
    let match: StewardMatter | undefined;
    for (let i = out.length - 1; i >= 0; i--) {
      const m = out[i];
      if (m.reason === reason && (cars.length === 0 || m.drivers.some((d) => cars.includes(d)))) {
        match = m;
        break;
      }
    }
    // A served penalty or a new decision always attaches; a fresh "noted" after a closed matter starts a new one.
    if (match && status === "noted" && ["confirmed", "served", "cleared", "withdrawn"].includes(match.status)) match = undefined;
    if (!match) {
      match = { id: r.id, reason, location: locationOf(r.message), drivers: [...cars], status, penalty: null, messages: [], opened: r.ts, updated: r.ts };
      out.push(match);
    } else {
      for (const c of cars) if (!match.drivers.includes(c)) match.drivers.push(c);
      // Statuses only move forward, except a withdrawal, which always wins.
      if (status === "withdrawn" || ORDER.indexOf(status) >= ORDER.indexOf(match.status)) match.status = status;
      match.location ??= locationOf(r.message);
    }
    if (kind === "penalty") match.penalty = penaltyTypeOf(r.message);
    match.messages.push(r);
    match.updated = r.ts;
  }
  return out;
}

/** Status of the matter a message belongs to, as of `t`. */
export function stewardStatusFor(matters: readonly StewardMatter[], messageId: string): StewardMatter | null {
  return matters.find((m) => m.messages.some((r) => r.id === messageId)) ?? null;
}

export type FlagState = "active" | "cleared" | "ended";

/**
 * Whether a flag or neutralization message still applies at `t`. Yellows end
 * with CLEAR or GREEN in the same sector or a track-wide green; SC, VSC and red
 * end with a track-wide green or the chequered flag. Returns null for messages
 * that are not flag states.
 */
export function flagStateAt(messages: readonly RaceControlRecord[], target: RaceControlRecord, t: number): FlagState | null {
  const kind = classifyRaceControl(target).kind;
  const local = kind === "yellow" || kind === "double-yellow";
  const neutral = kind === "safety-car" || kind === "vsc" || kind === "red";
  if (!local && !neutral) return null;
  for (const r of messages) {
    if (r.ts <= target.ts || r.id === target.id) continue;
    if (r.ts > t) break;
    const k = classifyRaceControl(r).kind;
    if (local) {
      if ((k === "track-clear" || k === "green") && (r.sector === null ? k === "green" : r.sector === target.sector)) return "cleared";
      if (k === "chequered" || ((k === "safety-car" || k === "red") && target.sector === null)) return "ended";
    } else {
      if ((k === "green" && r.sector === null) || k === "chequered") return "ended";
      if (k !== kind && (k === "safety-car" || k === "vsc" || k === "red")) return "ended";
    }
  }
  return "active";
}
