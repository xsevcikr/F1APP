import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Paths resolve from the repository root, whichever directory the server starts in.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface Config {
  port: number;
  host: string;
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
  /** When set, every request except the health check and app icons needs this password (HTTP Basic, any user name). */
  appPassword: string | null;
  corsOrigin: string | boolean;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export function loadConfig(): Config {
  // A root .env fills in variables the environment has not already set.
  const envFile = resolve(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return {
    port: Number(env("PORT") ?? 8787),
    host: env("HOST") ?? "127.0.0.1",
    cacheDir: resolve(ROOT, env("CACHE_DIR") ?? ".cache"),
    openf1: {
      baseUrl: env("OPENF1_BASE_URL") ?? "https://api.openf1.org/v1",
      tokenUrl: env("OPENF1_TOKEN_URL") ?? "https://api.openf1.org/token",
      mqttUrl: env("OPENF1_MQTT_URL") ?? "wss://mqtt.openf1.org:8084/mqtt",
      username: env("OPENF1_USERNAME") ?? null,
      password: env("OPENF1_PASSWORD") ?? null,
    },
    jolpica: {
      baseUrl: env("JOLPICA_BASE_URL") ?? "https://api.jolpi.ca/ergast/f1",
      userAgent: env("JOLPICA_USER_AGENT") ?? "f1-control-room/0.1 (+https://github.com/xsevcikr/F1APP; non-commercial)",
    },
    webDist: env("WEB_DIST") ?? resolve(ROOT, "web/dist"),
    corsOrigin: env("CORS_ORIGIN") ?? true,
    appPassword: env("APP_PASSWORD") ?? null,
  };
}
