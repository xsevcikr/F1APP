import { useMemo } from "react";
import { sessionPhase, type SessionInfo, type SessionPhase } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { useNow } from "../hooks/live";

export interface Weekend {
  name: string;
  location: string;
  sessions: SessionInfo[];
  /** "feed" when it came from the sessions API; "snapshot" when it is the bundled fallback. */
  basis: "feed" | "snapshot";
}

const at = (iso: string) => Date.parse(iso);
const austin = (key: number, name: string, type: SessionInfo["type"], start: string, end: string): SessionInfo => ({
  sessionKey: key, meetingKey: 1297, name, type, year: 2026, circuitKey: 9, circuitShortName: "Austin", location: "Austin", countryName: "United States", countryCode: "USA",
  start: at(start), end: at(end), gmtOffset: "-05:00", cancelled: false, provider: "openf1",
});

/**
 * United States Grand Prix, Austin. Session times as listed by OpenF1 on
 * 2026-10-23. Used only when the sessions API cannot be reached, and labelled
 * as a snapshot.
 */
export const AUSTIN_2026: Weekend = {
  name: "United States Grand Prix",
  location: "Austin",
  basis: "snapshot",
  sessions: [
    austin(11389, "Practice 1", "Practice", "2026-10-23T17:30:00Z", "2026-10-23T18:30:00Z"),
    austin(11390, "Practice 2", "Practice", "2026-10-23T21:00:00Z", "2026-10-23T22:00:00Z"),
    austin(11391, "Practice 3", "Practice", "2026-10-24T17:30:00Z", "2026-10-24T18:30:00Z"),
    austin(11392, "Qualifying", "Qualifying", "2026-10-24T21:00:00Z", "2026-10-24T22:00:00Z"),
    austin(11396, "Race", "Race", "2026-10-25T20:00:00Z", "2026-10-25T22:00:00Z"),
  ],
};

const DAY = 86_400_000;

/** The race weekend that is running now, or the next one starting within a week. */
export function pickWeekend(sessions: SessionInfo[], now: number): SessionInfo[] | null {
  const byMeeting = new Map<number, SessionInfo[]>();
  for (const s of sessions) if (!s.cancelled) byMeeting.set(s.meetingKey, [...(byMeeting.get(s.meetingKey) ?? []), s]);
  let best: { list: SessionInfo[]; start: number } | null = null;
  for (const list of byMeeting.values()) {
    list.sort((a, b) => a.start - b.start);
    const start = list[0].start, end = list[list.length - 1].end;
    // Running now (with a little margin either side), or the nearest upcoming weekend.
    const running = now >= start - 6 * 3_600_000 && now <= end + 6 * 3_600_000;
    const soon = start > now && start - now < 7 * DAY;
    if ((running || soon) && (!best || start < best.start)) best = { list, start };
  }
  return best?.list ?? null;
}

export function useWeekend(): { weekend: Weekend | null; now: number } {
  const year = new Date().getUTCFullYear();
  const list = useAsync(`sessions:${year}`, () => api.sessions(year), 60_000);
  const now = useNow(1000);
  const weekend = useMemo<Weekend | null>(() => {
    const real = (list.data ?? []).filter((s) => s.provider === "openf1");
    const picked = pickWeekend(real, now);
    if (picked) return { name: `${picked[0].location} weekend`, location: picked[0].location, sessions: picked, basis: "feed" };
    // No real sessions came back (offline or demo): fall back to the dated snapshot while it is still current.
    const snap = pickWeekend(AUSTIN_2026.sessions, now);
    return snap && real.length === 0 ? AUSTIN_2026 : null;
  }, [list.data, now]);
  return { weekend, now };
}

export type SessionStatus = { phase: SessionPhase; running: boolean; label: string };

/** Where a session stands at `now`, using only its scheduled times. */
export function statusOf(s: SessionInfo, now: number, fmt: (ms: number) => string): SessionStatus {
  const phase = sessionPhase(s, now);
  if (now >= s.start && now <= s.end) return { phase, running: true, label: "Running now" };
  if (now < s.start) return { phase, running: false, label: `Starts in ${fmt(s.start - now)}` };
  return { phase, running: false, label: now <= s.end + 30 * 60_000 ? "Just finished" : "Finished" };
}
