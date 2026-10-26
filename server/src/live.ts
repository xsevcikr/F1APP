// Live hub: finds the session in its live window, receives its records
// (OpenF1 MQTT over WebSocket, or REST polling as a fallback), and fans them
// out to browsers over server-sent events.
import mqtt, { type MqttClient } from "mqtt";
import { inLiveWindow, openf1 as n, type LiveRecord, type LiveStatus, type SessionInfo } from "@f1/shared";
import type { Config } from "./config.ts";
import type { OpenF1Provider } from "./providers/openf1.ts";
import type { Cache } from "./cache.ts";
import type { DelayedWatch } from "@f1/shared";

type Raw = Record<string, unknown>;

const TOPICS: Record<string, (r: Raw) => LiveRecord | null> = {
  "v1/location": (r) => wrap("location", n.normalizeLocation(r)),
  "v1/car_data": (r) => wrap("carData", n.normalizeCarData(r)),
  "v1/position": (r) => wrap("position", n.normalizePosition(r)),
  "v1/intervals": (r) => wrap("interval", n.normalizeInterval(r)),
  "v1/laps": (r) => wrap("lap", n.normalizeLap(r)),
  "v1/stints": (r) => wrap("stint", n.normalizeStint(r)),
  "v1/pit": (r) => wrap("pit", n.normalizePit(r)),
  "v1/race_control": (r) => wrap("raceControl", n.normalizeRaceControl(r)),
  "v1/weather": (r) => wrap("weather", n.normalizeWeather(r)),
  "v1/overtakes": (r) => wrap("overtake", n.normalizeOvertake(r)),
  "v1/drivers": (r) => wrap("driver", n.normalizeDriver(r)),
};

function wrap<K extends LiveRecord["kind"]>(kind: K, data: unknown): LiveRecord | null {
  return data ? ({ kind, data } as LiveRecord) : null;
}

/** Parses one MQTT message into live records for the given session. */
export function parseLiveMessage(topic: string, payload: string, sessionKey: number): LiveRecord[] {
  const norm = TOPICS[topic];
  if (!norm) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out: LiveRecord[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if ((r as Raw).session_key !== undefined && (r as Raw).session_key !== sessionKey) continue;
    const rec = norm(r as Raw);
    if (rec) out.push(rec);
  }
  return out;
}

export interface SseClient {
  send(event: string, data: unknown): void;
}

export class LiveHub {
  private clients = new Set<SseClient>();
  private buffer: LiveRecord[] = [];
  private session: SessionInfo | null = null;
  private mqttClient: MqttClient | null = null;
  private connected = false;
  private transport: LiveStatus["transport"] = "none";
  private lastMessageAt: number | null = null;
  private reason: string | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private pollCursor = new Map<string, number>();
  private mqttFailedAt: number | null = null;
  private watch: DelayedWatch | null = null;

  constructor(
    private cfg: Config,
    private openf1: OpenF1Provider | null,
    private now: () => number = Date.now,
    private cache: Cache | null = null,
  ) {}

  start() {
    void this.refresh();
    this.timers.push(setInterval(() => void this.refresh(), 60_000));
    this.timers.push(setInterval(() => this.flush(), 250));
    this.timers.push(setInterval(() => this.broadcast("status", this.status()), 5000));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.mqttClient?.end(true);
  }

  status(): LiveStatus {
    return {
      session: this.session,
      available: this.connected,
      reason: this.reason,
      connected: this.connected,
      lastMessageAt: this.lastMessageAt,
      transport: this.transport,
      delayed: this.watch,
    };
  }

  addClient(c: SseClient) {
    this.clients.add(c);
    c.send("status", this.status());
    return () => this.clients.delete(c);
  }

  private broadcast(event: string, data: unknown) {
    for (const c of this.clients) c.send(event, data);
  }

  private flush() {
    if (!this.buffer.length || !this.session) return;
    const batch = this.buffer;
    this.buffer = [];
    this.broadcast("records", { sessionKey: this.session.sessionKey, records: batch });
  }

  private push(records: LiveRecord[]) {
    if (!records.length) return;
    this.lastMessageAt = this.now();
    this.buffer.push(...records);
  }

  /** Re-evaluates which session is live and how to receive it. */
  async refresh() {
    if (!this.openf1) return;
    const year = new Date(this.now()).getUTCFullYear();
    let sessions: SessionInfo[] = [];
    try {
      sessions = await this.openf1.listSessions(year);
    } catch (err) {
      this.reason = `Could not load the session calendar: ${(err as Error).message}`;
    }
    const live = sessions.find((s) => !s.cancelled && inLiveWindow(s, this.now())) ?? null;
    if (live?.sessionKey !== this.session?.sessionKey) {
      this.disconnect();
      this.pollCursor.clear();
    }
    this.session = live;
    if (!this.openf1.auth.configured) await this.probeFreeTier(live ?? this.justEnded(sessions));
    if (!live) {
      this.reason = "No session is in its live window.";
      this.disconnect();
      return;
    }
    if (!this.openf1.auth.configured) {
      this.reason =
        "OpenF1 serves live data only to Sponsor accounts. Set OPENF1_USERNAME and OPENF1_PASSWORD on the server to enable it. The app asks OpenF1 once a minute and loads the session, marked DELAYED, as soon as OpenF1 releases it.";
      this.connected = false;
      this.transport = "none";
      return;
    }
    this.reason = null;
    if (!this.mqttClient && (this.mqttFailedAt === null || this.now() - this.mqttFailedAt > 5 * 60_000)) await this.connectMqtt(live);
    if (!this.connected && !this.timers.some((t) => (t as unknown as { _poll?: boolean })._poll)) this.startPolling();
  }

  /** The newest session that ended within the last three hours: it may still be waiting for OpenF1 to release it. */
  private justEnded(sessions: SessionInfo[]): SessionInfo | null {
    const t = this.now();
    return sessions.filter((s) => !s.cancelled && s.end <= t && t - s.end < 3 * 3600_000).sort((a, b) => b.end - a.end)[0] ?? null;
  }

  /**
   * Without credentials OpenF1 serves only archived data. Ask for one small
   * channel once a minute (the free limit is 30 per minute) and note when the
   * session first comes back, so the app can load it as soon as it exists.
   */
  private async probeFreeTier(target: SessionInfo | null) {
    if (!target || !this.openf1) {
      if (this.watch?.state === "waiting") this.watch = null;
      return;
    }
    if (this.watch?.sessionKey !== target.sessionKey) this.watch = { sessionKey: target.sessionKey, state: "waiting", checkedAt: null, releasedAt: null, releasedEarly: false, lastReply: null };
    const w = this.watch;
    if (w.state === "released") {
      // One more reload an hour after the end: the archive can still be filling in late records.
      if (!w.refreshedAt && this.now() >= target.end + 60 * 60_000) {
        w.refreshedAt = this.now();
        await this.cache?.expire(`openf1:core:${target.sessionKey}`);
        this.broadcast("status", this.status());
      }
      return;
    }
    w.checkedAt = this.now();
    try {
      const rows = await this.openf1.get<unknown[]>("drivers", `session_key=${target.sessionKey}`);
      if (rows.length > 0) {
        w.state = "released";
        w.releasedAt = this.now();
        w.releasedEarly = this.now() < target.end + 30 * 60_000;
        w.lastReply = null;
        // A core loaded while the session was withheld is empty; drop it so the next load gets the real data.
        await this.cache?.expire(`openf1:core:${target.sessionKey}`);
        this.broadcast("status", this.status());
      } else {
        w.lastReply = "OpenF1 has no data for this session yet.";
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      w.lastReply = status ? `OpenF1 answered HTTP ${status}.` : (err as Error).message;
    }
  }

  private disconnect() {
    this.mqttClient?.end(true);
    this.mqttClient = null;
    this.connected = false;
    this.transport = "none";
  }

  private async connectMqtt(session: SessionInfo) {
    const token = await this.openf1!.auth.getToken().catch((e) => {
      this.reason = `OpenF1 sign-in failed: ${(e as Error).message}`;
      return null;
    });
    if (!token) return;
    const client = mqtt.connect(this.cfg.openf1.mqttUrl, {
      username: this.cfg.openf1.username ?? "f1-control-room",
      password: token,
      reconnectPeriod: 5000,
      connectTimeout: 15_000,
    });
    this.mqttClient = client;
    client.on("connect", () => {
      this.connected = true;
      this.transport = "mqtt";
      this.mqttFailedAt = null;
      client.subscribe(Object.keys(TOPICS));
      this.broadcast("status", this.status());
    });
    client.on("message", (topic, payload) => this.push(parseLiveMessage(topic, payload.toString("utf8"), session.sessionKey)));
    client.on("close", () => {
      this.connected = false;
      this.broadcast("status", this.status());
    });
    client.on("error", async (err) => {
      this.reason = `Live connection error: ${err.message}`;
      this.mqttFailedAt = this.now();
      // Tokens last an hour; reconnect with a fresh one.
      if (/auth|not authorized/i.test(err.message)) {
        this.disconnect();
        await this.connectMqtt(session);
      }
    });
  }

  /** REST polling fallback within the Sponsor rate limits (about 48 requests per minute). */
  private startPolling() {
    const endpoints: [string, string, keyof typeof TOPICS][] = [
      ["position", "date", "v1/position"],
      ["intervals", "date", "v1/intervals"],
      ["race_control", "date", "v1/race_control"],
      ["pit", "date", "v1/pit"],
      ["laps", "date_start", "v1/laps"],
      ["stints", "", "v1/stints"],
      ["weather", "date", "v1/weather"],
      ["location", "date", "v1/location"],
    ];
    const timer = setInterval(async () => {
      const s = this.session;
      if (!s || !this.openf1 || this.transport === "mqtt") return;
      for (const [ep, dateField, topic] of endpoints) {
        const since = this.pollCursor.get(ep) ?? (ep === "location" ? this.now() - 15_000 : s.start - 30 * 60_000);
        const q = `session_key=${s.sessionKey}${dateField ? `&${dateField}>${new Date(since).toISOString()}` : ""}`;
        try {
          const rows = await this.openf1.get<Raw[]>(ep, q);
          const recs = rows.flatMap((r) => parseLiveMessage(topic, JSON.stringify(r), s.sessionKey));
          this.push(recs);
          this.connected = true;
          this.transport = "polling";
          let max = since;
          for (const r of rows) {
            const t = Date.parse(String(r[dateField] ?? ""));
            if (Number.isFinite(t)) max = Math.max(max, t);
          }
          this.pollCursor.set(ep, max);
        } catch (err) {
          this.reason = `Live polling error: ${(err as Error).message}`;
        }
      }
    }, 10_000);
    (timer as unknown as { _poll?: boolean })._poll = true;
    this.timers.push(timer);
  }
}
