import type { Gap } from "./types.ts";

export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

export function formatGap(g: Gap | null | undefined, leaderLabel = "LEADER"): string {
  if (!g) return "—";
  if (g.kind === "leader") return leaderLabel;
  if (g.kind === "laps") return `+${g.laps} LAP${g.laps > 1 ? "S" : ""}`;
  return `+${g.seconds.toFixed(3)}`;
}

export function formatDelta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return `${seconds >= 0 ? "+" : "−"}${Math.abs(seconds).toFixed(3)}`;
}

/** "1:23:45" session clock from milliseconds. */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatAge(ms: number): string {
  if (ms < 1000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  return `${Math.floor(ms / 86_400_000)} d ago`;
}

/** Applies a "+02:00" offset to show circuit-local wall time. */
export function localTimeAt(ts: number, gmtOffset: string): string {
  const m = gmtOffset.match(/^([+-])(\d{2}):(\d{2})/);
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const d = new Date(ts + off * 60_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function kmhTo(speed: number, units: "metric" | "imperial"): number {
  return units === "imperial" ? speed * 0.621371 : speed;
}

export function tempTo(c: number, units: "metric" | "imperial"): number {
  return units === "imperial" ? c * 1.8 + 32 : c;
}
