import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveRecord, ServerStatus, Snapshot } from "@f1/shared";
import { api } from "../api";
import { displayTime, useSession } from "../store/session";

/** Polls server status and keeps one EventSource open for live records. */
export function useServerLink() {
  const setServer = useSession((s) => s.setServer);
  const applyLive = useSession((s) => s.applyLive);
  const setStreamOpen = useSession((s) => s.setStreamOpen);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const s = await api.status();
        if (!stop) setServer(s, null);
      } catch (err) {
        if (!stop) setServer(useSession.getState().server, (err as Error).message);
      }
    };
    void poll();
    const t = setInterval(poll, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [setServer]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource("/api/live/stream");
      es.onopen = () => setStreamOpen(true);
      es.onerror = () => {
        setStreamOpen(false);
        // EventSource retries on its own; if it closed, reopen with backoff.
        if (es?.readyState === EventSource.CLOSED) retry = setTimeout(open, 5000);
      };
      es.addEventListener("status", (e) => {
        const live = JSON.parse((e as MessageEvent).data) as ServerStatus["live"];
        const cur = useSession.getState().server;
        if (cur) setServer({ ...cur, live }, null);
      });
      es.addEventListener("records", (e) => {
        const { sessionKey, records } = JSON.parse((e as MessageEvent).data) as { sessionKey: number; records: LiveRecord[] };
        applyLive(sessionKey, records);
      });
    };
    open();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [applyLive, setServer, setStreamOpen]);
}

/** Re-renders at `hz` with the current display time. */
export function useDisplayTime(hz = 4): number {
  const [t, setT] = useState(() => displayTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setT(displayTime(Date.now())), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return t;
}

/** Leaderboard snapshot at the display time, recomputed a few times per second. */
export function useSnapshot(hz = 4): Snapshot | null {
  const timeline = useSession((s) => s.timeline);
  const version = useSession((s) => s.version);
  const t = useDisplayTime(hz);
  // Quantize to 250 ms so equal moments reuse the snapshot.
  const q = Math.floor(t / 250) * 250;
  const snap = useMemo(() => (timeline ? timeline.snapshotAt(q) : null), [timeline, q, version]);
  // Keep window loading tied to the clock.
  const ensure = useSession((s) => s.ensureWindows);
  const clock = useSession((s) => s.clock);
  const last = useRef(0);
  useEffect(() => {
    if (!clock) return;
    if (Math.abs(q - last.current) < 5000) return;
    last.current = q;
    const st = clock.tick(Date.now());
    ensure(q, st.playing, st.speed);
  }, [q, clock, ensure]);
  return snap;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
