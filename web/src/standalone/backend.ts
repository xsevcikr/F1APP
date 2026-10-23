// In-browser stand-in for the app server, used only by the standalone build.
// It answers the same /api routes from the SIMULATED demo provider, so the
// page runs without a server. It never reaches a real data source.
import { inLiveWindow, type LiveRecord, type LiveStatus, type ServerStatus } from "@f1/shared";
import { DemoProvider } from "../../../server/src/providers/demo.ts";

const MAX_WINDOW_MS = 10 * 60_000;
const demo = new DemoProvider();

function liveStatus(): LiveStatus {
  const live = inLiveWindow(demo.session, Date.now());
  return {
    session: demo.session,
    available: live,
    reason: live ? null : "The simulated session has finished.",
    connected: live,
    lastMessageAt: live ? Date.now() : null,
    transport: live ? "polling" : "none",
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function route(path: string, q: URLSearchParams): Promise<unknown> {
  if (path === "/health") return { ok: true };
  if (path === "/status") {
    const s: ServerStatus = { now: Date.now(), mode: "demo", live: liveStatus(), providers: [demo.health()] };
    return s;
  }
  if (path === "/sessions") return demo.listSessions();
  if (path.startsWith("/archive/")) throw new HttpError(503, "Results archive is not available in this simulated preview. Run the full app with its server for real data.");
  const m = path.match(/^\/sessions\/(\d+)(?:\/([a-z-]+))?$/);
  if (!m) throw new HttpError(404, "Not found");
  const key = Number(m[1]);
  if (key !== demo.session.sessionKey) throw new HttpError(404, "Not found");
  switch (m[2]) {
    case undefined:
      return demo.getSession(key);
    case "core":
      return demo.getCore();
    case "circuit":
      return demo.getCircuit();
    case "locations":
    case "car-data": {
      const from = Number(q.get("from")), to = Number(q.get("to"));
      if (!(to > from) || to - from > MAX_WINDOW_MS) throw new HttpError(400, "Window must be positive and at most 10 minutes");
      const d = q.get("driver");
      const driver = d === null ? undefined : Number(d);
      return m[2] === "locations" ? demo.getLocations(key, from, to, driver) : demo.getCarData(key, from, to, driver);
    }
  }
  throw new HttpError(404, "Not found");
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Event stream with the EventSource surface the app uses. */
class LocalEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private cursor = Date.now();

  constructor(_url: string) {
    super();
    setTimeout(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      this.onopen?.(new Event("open"));
      this.emit("status", liveStatus());
      this.timers.push(setInterval(() => this.flush(), 250));
      this.timers.push(setInterval(() => this.emit("status", liveStatus()), 5000));
    }, 0);
  }

  private flush() {
    const t = Date.now();
    const records: LiveRecord[] = demo.recordsBetween(this.cursor, t);
    this.cursor = t;
    if (records.length) this.emit("records", { sessionKey: demo.session.sessionKey, records });
  }

  private emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  close() {
    this.readyState = 2;
    for (const t of this.timers) clearInterval(t);
  }
}

export function installLocalBackend() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith("/api/") || url.origin !== location.origin) return realFetch(input, init);
    try {
      return json(await route(url.pathname.slice(4), url.searchParams));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: status >= 500 ? "internal" : "bad_request", message: (err as Error).message }, status);
    }
  };
  (window as unknown as { EventSource: unknown }).EventSource = LocalEventSource;
}
