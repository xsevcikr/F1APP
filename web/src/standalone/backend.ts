// Offline stand-in for the app server, used only by the standalone build.
// A static page cannot reach OpenF1 or Jolpica, so every data route answers
// "unavailable" and the app shows its honest empty states. It serves no data.
import type { ServerStatus } from "@f1/shared";

const REASON = "This is a static preview with no server, so it cannot reach live timing or the results archive. Run the full app to see real data.";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function route(path: string): Response {
  if (path === "/health") return json({ ok: true });
  if (path === "/status") {
    const s: ServerStatus = { now: Date.now(), live: { session: null, available: false, reason: REASON, connected: false, lastMessageAt: null, transport: "none" }, providers: [] };
    return json(s);
  }
  return json({ error: "upstream", message: REASON }, 503);
}

/** Event stream that never connects, so nothing can look live. */
class OfflineEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 2;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(_url: string) {
    super();
    setTimeout(() => this.onerror?.(new Event("error")), 0);
  }
  close() {}
}

export function installOfflineBackend() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith("/api/") || url.origin !== location.origin) return realFetch(input, init);
    return route(url.pathname.slice(4));
  };
  (window as unknown as { EventSource: unknown }).EventSource = OfflineEventSource;
}
