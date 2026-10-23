import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import type { ServerStatus } from "@f1/shared";
import { Cache } from "./cache.ts";
import type { Config } from "./config.ts";
import { UpstreamError } from "./http.ts";
import { LiveHub } from "./live.ts";
import { JolpicaProvider } from "./providers/jolpica.ts";
import { OpenF1Auth, OpenF1Provider } from "./providers/openf1.ts";
import type { TimingProvider } from "./providers/types.ts";

export interface AppDeps {
  timing: TimingProvider;
  jolpica: JolpicaProvider;
  live: LiveHub;
}

export function createDeps(cfg: Config): AppDeps {
  const cache = new Cache(cfg.cacheDir);
  const openf1 = new OpenF1Provider(cfg, cache, new OpenF1Auth(cfg.openf1));
  return { timing: openf1, jolpica: new JolpicaProvider(cfg.jolpica, cache), live: new LiveHub(cfg, openf1, Date.now, cache) };
}

const MAX_WINDOW_MS = 10 * 60_000;

function int(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw Object.assign(new Error(`Invalid ${name}`), { statusCode: 400 });
  return n;
}

function time(v: unknown, name: string): number {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : Date.parse(String(v));
  if (!Number.isFinite(n)) throw Object.assign(new Error(`Invalid ${name}`), { statusCode: 400 });
  return n;
}

export async function buildApp(cfg: Config, deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cors, { origin: cfg.corsOrigin });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof UpstreamError) {
      // Never forward upstream bodies verbatim; summarize for the UI.
      return reply.status(err.status === 404 ? 404 : 502).send({ error: "upstream", message: err.message, status: err.status });
    }
    const code = err.statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.status(code).send({ error: code >= 500 ? "internal" : "bad_request", message: err.message });
  });

  const jolpica = () => deps.jolpica;

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/status", async (): Promise<ServerStatus> => ({
    now: Date.now(),
    live: deps.live.status(),
    providers: [deps.timing.health(), deps.jolpica.health()],
  }));

  app.get<{ Querystring: { year?: string } }>("/api/sessions", async (req) => {
    const year = req.query.year ? int(req.query.year, "year") : new Date().getUTCFullYear();
    if (year < 2023 && deps.timing.id === "openf1") return [];
    return deps.timing.listSessions(year);
  });

  app.get<{ Params: { key: string } }>("/api/sessions/:key", async (req, reply) => {
    const s = await deps.timing.getSession(int(req.params.key, "session key"));
    return s ?? reply.status(404).send({ error: "not_found" });
  });

  app.get<{ Params: { key: string } }>("/api/sessions/:key/core", async (req) => deps.timing.getCore(int(req.params.key, "session key")));

  const windowRoute = (kind: "locations" | "car-data") =>
    app.get<{ Params: { key: string }; Querystring: { from: string; to: string; driver?: string } }>(`/api/sessions/:key/${kind}`, async (req) => {
      const key = int(req.params.key, "session key");
      const from = time(req.query.from, "from");
      const to = time(req.query.to, "to");
      if (to <= from || to - from > MAX_WINDOW_MS) throw Object.assign(new Error("Window must be positive and at most 10 minutes"), { statusCode: 400 });
      const driver = req.query.driver !== undefined ? int(req.query.driver, "driver") : undefined;
      return kind === "locations" ? deps.timing.getLocations(key, from, to, driver) : deps.timing.getCarData(key, from, to, driver);
    });
  windowRoute("locations");
  windowRoute("car-data");

  app.get<{ Params: { key: string } }>("/api/sessions/:key/circuit", async (req, reply) => {
    const c = await deps.timing.getCircuit(int(req.params.key, "session key"));
    return c ?? reply.status(404).send({ error: "not_found", message: "Not enough position data to draw this circuit yet." });
  });

  app.get("/api/live/stream", (req, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });
    reply.raw.write("retry: 3000\n\n");
    const remove = deps.live.addClient({
      send: (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    });
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      remove();
    });
    reply.hijack();
  });

  // Results archive (Jolpica). `?refresh=1` reloads cached entries older than a minute.
  type P = { season: string; round: string };
  type Q = { refresh?: string };
  const season = (v: string) => (v === "current" ? new Date().getUTCFullYear() : int(v, "season"));
  const archive = <T>(req: { query: Q }, fn: (j: JolpicaProvider) => Promise<T>): Promise<T> => (req.query.refresh === "1" ? jolpica().refreshing(() => fn(jolpica())) : fn(jolpica()));
  const slug = (v: string) => v.replace(/[^a-z0-9_]/gi, "");
  app.get<{ Querystring: Q }>("/api/archive/seasons", async (req) => archive(req, (j) => j.seasons()));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/schedule", async (req) => archive(req, (j) => j.schedule(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/drivers", async (req) => archive(req, (j) => j.seasonDrivers(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/constructors", async (req) => archive(req, (j) => j.seasonConstructors(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/circuits", async (req) => archive(req, (j) => j.seasonCircuits(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/:round/results", async (req) => archive(req, (j) => j.results(season(req.params.season), int(req.params.round, "round"))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/:round/sprint", async (req) => archive(req, (j) => j.sprint(season(req.params.season), int(req.params.round, "round"))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/:round/qualifying", async (req) => archive(req, (j) => j.qualifying(season(req.params.season), int(req.params.round, "round"))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/:round/pitstops", async (req) => archive(req, (j) => j.pitStops(season(req.params.season), int(req.params.round, "round"))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/:round/laps", async (req) => archive(req, (j) => j.lapPositions(season(req.params.season), int(req.params.round, "round"))));
  app.get<{ Params: P; Querystring: Q & { round?: string } }>("/api/archive/:season/standings/drivers", async (req) =>
    archive(req, (j) => j.driverStandings(season(req.params.season), req.query.round ? int(req.query.round, "round") : undefined)),
  );
  app.get<{ Params: P; Querystring: Q & { round?: string } }>("/api/archive/:season/standings/constructors", async (req) =>
    archive(req, (j) => j.constructorStandings(season(req.params.season), req.query.round ? int(req.query.round, "round") : undefined)),
  );
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/results", async (req) => archive(req, (j) => j.seasonResults(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/sprints", async (req) => archive(req, (j) => j.seasonSprints(season(req.params.season))));
  app.get<{ Params: P; Querystring: Q }>("/api/archive/:season/qualifying", async (req) => archive(req, (j) => j.seasonQualifying(season(req.params.season))));
  app.get<{ Params: { id: string }; Querystring: Q }>("/api/archive/circuits/:id/winners", async (req) => archive(req, (j) => j.circuitWinners(slug(req.params.id))));
  app.get<{ Params: { id: string }; Querystring: Q }>("/api/archive/circuits/:id/fastest", async (req) => archive(req, (j) => j.circuitFastestLaps(slug(req.params.id))));
  app.get<{ Params: { id: string }; Querystring: Q }>("/api/archive/drivers/:id/career", async (req) => archive(req, (j) => j.driverCareer(slug(req.params.id))));

  if (cfg.webDist && existsSync(cfg.webDist)) {
    await app.register(fastifyStatic, { root: cfg.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: "not_found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
