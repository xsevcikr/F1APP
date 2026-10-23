// Data-quality decisions shared by server and client.
import type { Quality, SessionInfo } from "./types.ts";

/** OpenF1 serves a session live from 30 minutes before its start to 30 minutes after its end. */
export const LIVE_WINDOW_MS = 30 * 60_000;

export function inLiveWindow(s: Pick<SessionInfo, "start" | "end">, now: number): boolean {
  return now >= s.start - LIVE_WINDOW_MS && now <= s.end + LIVE_WINDOW_MS;
}

export type SessionPhase = "upcoming" | "live-window" | "finished";

export function sessionPhase(s: Pick<SessionInfo, "start" | "end">, now: number): SessionPhase {
  if (now < s.start - LIVE_WINDOW_MS) return "upcoming";
  if (now <= s.end + LIVE_WINDOW_MS) return "live-window";
  return "finished";
}

/** Age after which live data is considered delayed rather than live. */
export const DELAYED_AFTER_MS = 15_000;

/**
 * Quality of the data shown for a session at a moment.
 * - demo data is always SIMULATED
 * - a finished session is HISTORICAL
 * - in a live window, LIVE while fresh records keep arriving, DELAYED when they stop,
 *   UNAVAILABLE when there is no live connection at all
 */
export function qualityFor(opts: {
  demo: boolean;
  phase: SessionPhase;
  liveConnected: boolean;
  lastRecordAt: number | null;
  now: number;
  viewingLiveEdge: boolean;
}): Quality {
  if (opts.demo) return "SIMULATED";
  if (opts.phase === "finished") return "HISTORICAL";
  if (opts.phase === "upcoming") return "UNAVAILABLE";
  if (!opts.liveConnected) return opts.lastRecordAt ? "DELAYED" : "UNAVAILABLE";
  if (!opts.viewingLiveEdge) return "DELAYED";
  if (opts.lastRecordAt === null) return "UNAVAILABLE";
  return opts.now - opts.lastRecordAt > DELAYED_AFTER_MS ? "DELAYED" : "LIVE";
}

export const QUALITY_HELP: Record<Quality, string> = {
  LIVE: "Current data is being received from the live feed.",
  DELAYED: "Data is available but not current. It may be catching up, or you are viewing an earlier moment.",
  HISTORICAL: "Archived data from a finished session.",
  SIMULATED: "Generated demonstration data. Not a real session.",
  UNAVAILABLE: "This data cannot currently be retrieved.",
};
