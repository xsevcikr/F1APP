import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  mode: "real" | "demo";
  cacheDir: string;
  openf1: {
    baseUrl: string;
    tokenUrl: string;
    mqttUrl: string;
    username: string | null;
    password: string | null;
  };
  jolpica: { baseUrl: string; userAgent: string };
  webDist: string | null;
  corsOrigin: string | boolean;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export function loadConfig(): Config {
  const mode = env("DATA_MODE") === "demo" ? "demo" : "real";
  return {
    port: Number(env("PORT") ?? 8787),
    host: env("HOST") ?? "127.0.0.1",
    mode,
    cacheDir: resolve(env("CACHE_DIR") ?? ".cache"),
    openf1: {
      baseUrl: env("OPENF1_BASE_URL") ?? "https://api.openf1.org/v1",
      tokenUrl: env("OPENF1_TOKEN_URL") ?? "https://api.openf1.org/token",
      mqttUrl: env("OPENF1_MQTT_URL") ?? "wss://mqtt.openf1.org:8084/mqtt",
      username: env("OPENF1_USERNAME") ?? null,
      password: env("OPENF1_PASSWORD") ?? null,
    },
    jolpica: {
      baseUrl: env("JOLPICA_BASE_URL") ?? "https://api.jolpi.ca/ergast/f1",
      userAgent: env("JOLPICA_USER_AGENT") ?? "f1-control-room/0.1 (personal, non-commercial)",
    },
    webDist: env("WEB_DIST") ?? resolve("web/dist"),
    corsOrigin: env("CORS_ORIGIN") ?? true,
  };
}
