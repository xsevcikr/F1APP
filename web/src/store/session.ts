// The selected session: its timeline, circuit, playback clock and live link.
// Every view that shows session data (live race, timing, battles, race control,
// replays) reads from here, so live and replay behave the same way.
import { create } from "zustand";
import {
  inLiveWindow,
  qualityFor,
  ReplayClock,
  sessionPhase,
  SessionTimeline,
  type CircuitModel,
  type LiveRecord,
  type Quality,
  type ServerStatus,
  type SessionInfo,
} from "@f1/shared";
import { api } from "../api";
import { useSettings } from "./settings";

export const WINDOW_MS = 60_000;
const align = (t: number) => Math.floor(t / WINDOW_MS) * WINDOW_MS;

interface SessionStore {
  server: ServerStatus | null;
  serverError: string | null;
  /** Wall time of the last record received over the live stream. */
  lastLiveAt: number | null;
  streamOpen: boolean;

  sessionKey: number | null;
  phase: "idle" | "loading" | "ready" | "error";
  error: string | null;
  timeline: SessionTimeline | null;
  circuit: { circuit: CircuitModel; fromSession: SessionInfo } | null;
  circuitState: "idle" | "loading" | "ready" | "unavailable";
  circuitError: string | null;
  clock: ReplayClock | null;
  windowState: Map<number, { state: "loading" | "ready" | "error"; at: number }>;
  windowError: string | null;
  version: number;
  selectedDriver: number | null;
  followDriver: boolean;
  compare: number[];

  setServer(s: ServerStatus | null, err?: string | null): void;
  setStreamOpen(v: boolean): void;
  load(sessionKey: number, opts?: { at?: number }): Promise<void>;
  applyLive(sessionKey: number, records: LiveRecord[]): void;
  ensureWindows(t: number, playing: boolean, speed: number): void;
  selectDriver(n: number | null): void;
  setFollow(v: boolean): void;
  setCompare(list: number[]): void;
  bump(): void;
}

export const useSession = create<SessionStore>((set, get) => ({
  server: null,
  serverError: null,
  lastLiveAt: null,
  streamOpen: false,
  sessionKey: null,
  phase: "idle",
  error: null,
  timeline: null,
  circuit: null,
  circuitState: "idle",
  circuitError: null,
  clock: null,
  windowState: new Map(),
  windowError: null,
  version: 0,
  selectedDriver: null,
  followDriver: false,
  compare: [],

  setServer: (server, err = null) => set({ server, serverError: err }),
  setStreamOpen: (streamOpen) => set({ streamOpen }),
  bump: () => set((s) => ({ version: s.version + 1 })),

  async load(sessionKey, opts) {
    if (get().sessionKey === sessionKey && get().phase === "ready" && !opts?.at) return;
    set({ sessionKey, phase: "loading", error: null, timeline: null, circuit: null, circuitState: "loading", circuitError: null, clock: null, windowState: new Map(), windowError: null, compare: [] });
    try {
      const core = await api.core(sessionKey);
      if (get().sessionKey !== sessionKey) return;
      const tl = new SessionTimeline(core);
      const now = Date.now();
      const range = tl.range();
      const live = inLiveWindow(core.session, now) && isLiveSession(get().server, sessionKey);
      const firstLap = tl.lapStartTime(1);
      const start = opts?.at ?? firstLap ?? range.start;
      const clock = new ReplayClock(range.start, Math.max(range.end, now < range.end ? now : range.end), now, { t: start });
      if (live) clock.goLive(now);
      set({ timeline: tl, clock, phase: "ready" });
      get().ensureWindows(live ? Math.max(tl.latestTs, now - 5000) : start, false, 1);
    } catch (err) {
      if (get().sessionKey === sessionKey) set({ phase: "error", error: (err as Error).message });
      return;
    }
    api.circuit(sessionKey).then(
      (c) => get().sessionKey === sessionKey && set({ circuit: c, circuitState: "ready" }),
      (err: Error) => get().sessionKey === sessionKey && set({ circuitState: "unavailable", circuitError: err.message }),
    );
  },

  applyLive(sessionKey, records) {
    const s = get();
    if (s.sessionKey !== sessionKey || !s.timeline) {
      set({ lastLiveAt: Date.now() });
      return;
    }
    for (const r of records) s.timeline.apply(r);
    s.clock?.setRange(s.clock.start, Math.max(s.clock.end, s.timeline.latestTs));
    set({ lastLiveAt: Date.now(), version: s.version + 1 });
  },

  ensureWindows(t, playing, speed) {
    const { timeline, sessionKey, windowState } = get();
    if (!timeline || sessionKey === null) return;
    const range = timeline.range();
    const ahead = playing ? Math.max(2, Math.ceil(speed / 2) + 1) : 1;
    const wanted: number[] = [];
    for (let w = align(t) - WINDOW_MS; w <= align(t) + ahead * WINDOW_MS; w += WINDOW_MS) {
      if (w + WINDOW_MS < range.start - 60_000 || w > Math.min(range.end, Date.now())) continue;
      const st = windowState.get(w);
      // Retry failed windows after 10 seconds.
      if (!st || (st.state === "error" && Date.now() - st.at > 10_000)) wanted.push(w);
    }
    for (const w of wanted.slice(0, 3)) {
      windowState.set(w, { state: "loading", at: Date.now() });
      Promise.all([api.locations(sessionKey, w, w + WINDOW_MS), api.carData(sessionKey, w, w + WINDOW_MS)]).then(
        ([loc, car]) => {
          if (get().sessionKey !== sessionKey) return;
          timeline.addLocations(loc.samples);
          timeline.addCarData(car.samples);
          // A window that is still filling during a live session is completed by the live stream.
          windowState.set(w, { state: "ready", at: Date.now() });
          set({ version: get().version + 1, windowError: null });
        },
        (err: Error) => {
          windowState.set(w, { state: "error", at: Date.now() });
          set({ windowError: err.message });
        },
      );
    }
  },

  selectDriver: (selectedDriver) => set({ selectedDriver }),
  setFollow: (followDriver) => set({ followDriver }),
  setCompare: (compare) => set({ compare }),
}));

/** Human name of the source of the selected session's data. */
export function sourceLabel(): string {
  const p = useSession.getState().timeline?.core.session.provider;
  return p === "demo" ? "the built-in simulator (not real data)" : "OpenF1";
}

export function isLiveSession(server: ServerStatus | null, sessionKey: number): boolean {
  return !!server?.live.session && server.live.session.sessionKey === sessionKey;
}

/** Display time: the live edge minus a small buffer when following live, otherwise the replay clock. */
export function displayTime(wallNow: number): number {
  const { clock, timeline } = useSession.getState();
  if (!clock || !timeline) return wallNow;
  const buffer = useSettings.getState().liveBufferMs;
  const edge = timeline.latestTs ? Math.min(timeline.latestTs, wallNow) - buffer : undefined;
  return clock.tick(wallNow, edge).t;
}

/** The data-quality state of what is currently on screen. */
export function currentQuality(wallNow = Date.now()): Quality {
  const s = useSession.getState();
  const tl = s.timeline;
  if (!tl) return "UNAVAILABLE";
  const session = tl.core.session;
  const demo = session.provider === "demo";
  const clock = s.clock?.tick(wallNow);
  return qualityFor({
    demo,
    phase: sessionPhase(session, wallNow),
    liveConnected: !!s.server?.live.connected && isLiveSession(s.server, session.sessionKey) && s.streamOpen,
    lastRecordAt: s.lastLiveAt,
    now: wallNow,
    viewingLiveEdge: !!clock?.followLive,
  });
}
