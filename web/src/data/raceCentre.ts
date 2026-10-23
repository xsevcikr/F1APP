import { useMemo } from "react";
import { inLiveWindow, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { useNow } from "../hooks/live";
import { useSession } from "../store/session";
import { AUSTIN_2026 } from "./weekend";

export interface CentreState {
  /** A session inside its live window according to the server, or null. */
  live: SessionInfo | null;
  /** True only between the session's scheduled start and end. */
  running: boolean;
  next: SessionInfo | null;
  last: SessionInfo | null;
  /** Where the schedule came from: the OpenF1 sessions feed, or the dated calendar snapshot. */
  basis: "feed" | "snapshot" | "none";
  loading: boolean;
  error: string | null;
  now: number;
}

/**
 * Which session is active, which is next and which was last. Everything is
 * derived from session metadata (never hardcoded as active): a session is
 * "live" only when the server reports it inside its live window.
 */
export function useRaceCentre(): CentreState {
  const server = useSession((s) => s.server);
  const now = useNow(1000);
  const year = new Date(now).getUTCFullYear();
  const list = useAsync(`sessions:${year}`, () => api.sessions(year), 60_000);

  return useMemo<CentreState>(() => {
    const real = (list.data ?? []).filter((s) => s.provider === "openf1" && !s.cancelled);
    // The dated snapshot only stands in while the feed is unreachable and the snapshot is recent.
    const snapshotFresh = now < AUSTIN_2026.sessions[AUSTIN_2026.sessions.length - 1].end + 30 * 86_400_000;
    const source = real.length ? real : snapshotFresh ? AUSTIN_2026.sessions : [];
    const basis: CentreState["basis"] = real.length ? "feed" : source.length ? "snapshot" : "none";
    const all = source.slice().sort((a, b) => a.start - b.start);
    const fromServer = server?.live.session ?? null;
    const live = fromServer && inLiveWindow(fromServer, now) ? fromServer : null;
    const running = !!live && now >= live.start && now <= live.end;
    const next = all.find((s) => s.start > now && s.sessionKey !== live?.sessionKey) ?? null;
    const past = all.filter((s) => s.end < now && s.sessionKey !== live?.sessionKey);
    const last = past[past.length - 1] ?? null;
    return { live, running, next, last, basis, loading: list.loading && !list.data, error: list.error?.message ?? null, now };
  }, [list.data, list.loading, list.error, server, now]);
}
