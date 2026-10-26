import { kmhTo, type CarSample } from "@f1/shared";
import { cx } from "./ui";

/** Every component here renders "—" for a missing value. Nothing is filled in to look complete. */

const MAX_KMH = 360;
const MAX_RPM = 15000;

/** Half-circle speed gauge with the number in the middle. */
export function SpeedGauge({ speedKmh, units }: { speedKmh: number | null; units: "metric" | "imperial" }) {
  const v = speedKmh;
  const frac = v === null ? 0 : Math.max(0, Math.min(1, v / MAX_KMH));
  const R = 44, C = Math.PI * R;
  return (
    <div className="relative mx-auto w-[132px]" role="img" aria-label={v === null ? "Speed unavailable" : `Speed ${Math.round(kmhTo(v, units))} ${units === "metric" ? "kilometres per hour" : "miles per hour"}`}>
      <svg viewBox="0 0 100 56" className="w-full" aria-hidden="true">
        <path d="M6 52 A44 44 0 0 1 94 52" fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth="7" strokeLinecap="round" />
        <path d="M6 52 A44 44 0 0 1 94 52" fill="none" stroke="rgb(var(--info))" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} style={{ transition: "stroke-dasharray 0.4s ease" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <div className="num text-3xl font-semibold">{v === null ? "—" : Math.round(kmhTo(v, units))}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">{units === "metric" ? "km/h" : "mph"}</div>
      </div>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={value === null ? `${label} unavailable` : `${label} ${Math.round(value)} percent`}>
      <div className="relative h-16 w-3 overflow-hidden rounded-full bg-fg/10">
        <div className={cx("absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-200", tone)} style={{ height: `${value === null ? 0 : Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-faint">{label}</span>
    </div>
  );
}

export function PedalBars({ throttle, brake }: { throttle: number | null; brake: number | null }) {
  return (
    <div className="flex items-end justify-center gap-3">
      <Bar label="Thr" value={throttle} tone="bg-ok" />
      <Bar label="Brk" value={brake} tone="bg-danger" />
    </div>
  );
}

/** Gear and a horizontal RPM bar. */
export function GearRpm({ gear, rpm }: { gear: number | null; rpm: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-12 flex-col items-center justify-center rounded-xl bg-fg/[0.06]" role="img" aria-label={gear === null ? "Gear unavailable" : `Gear ${gear}`}>
        <span className="num text-3xl font-semibold leading-none">{gear === null ? "—" : gear === 0 ? "N" : gear}</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-faint">Gear</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-fg/10" role="img" aria-label={rpm === null ? "RPM unavailable" : `${Math.round(rpm)} RPM`}>
          <div className="h-full rounded-full bg-gradient-to-r from-info via-ok to-warn transition-[width] duration-200" style={{ width: `${rpm === null ? 0 : Math.min(100, (rpm / MAX_RPM) * 100)}%` }} />
        </div>
        <div className="num mt-1 text-xs text-muted">{rpm === null ? "—" : Math.round(rpm).toLocaleString()} <span className="text-faint">rpm</span></div>
      </div>
    </div>
  );
}

/** Speed, pedals, gear and RPM for one car, from a telemetry sample that is fresh enough to trust. */
export function CarTelemetry({ car, fresh, units }: { car: CarSample | null; fresh: boolean; units: "metric" | "imperial" }) {
  const c = fresh ? car : null;
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <SpeedGauge speedKmh={c?.speed ?? null} units={units} />
        <PedalBars throttle={c?.throttle ?? null} brake={c?.brake ?? null} />
      </div>
      <div className="mt-3"><GearRpm gear={c?.gear ?? null} rpm={c?.rpm ?? null} /></div>
      {!c && <p className="mt-2 text-[11px] text-faint">No fresh car telemetry for this moment.</p>}
    </div>
  );
}

export type SectorTone = "purple" | "green" | "yellow" | null;
const SEG: Record<Exclude<SectorTone, null>, string> = { purple: "bg-best", green: "bg-ok", yellow: "bg-warn" };

/** Three colour-coded sector segments with the times beneath. Purple is the session best, green a personal best, yellow anything slower. */
export function SectorBar({ times, tones }: { times: (number | null)[]; tones: SectorTone[] }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className={cx("h-1.5 rounded-full", tones[i] ? SEG[tones[i]!] : "bg-fg/10")} />
          <div className={cx("num mt-0.5 text-center text-[11px]", tones[i] ? "text-fg" : "text-faint")}>{times[i] != null ? times[i]!.toFixed(3) : "—"}</div>
        </div>
      ))}
    </div>
  );
}

/** Tiny trend line for a series of numbers (for example the gap to the car ahead). Fewer than two points draws nothing. */
export function Sparkline({ values, className, stroke = "rgb(var(--info))" }: { values: number[]; className?: string; stroke?: string }) {
  if (values.length < 2) return <span className="text-faint">—</span>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(18 - ((v - min) / span) * 16).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className={cx("h-5 w-full", className)} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const TRACE_MS = 20_000;
const GAP_MS = 2500;

/** Speed, throttle and brake over the last 20 s, drawn only from real samples. A gap in the data breaks the line. */
export function TraceChart({ samples, t }: { samples: readonly CarSample[]; t: number }) {
  // Binary search for the last sample at or before t, then walk back through the window.
  let lo = 0, hi = samples.length - 1, end = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ts <= t) { end = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const win: CarSample[] = [];
  for (let i = end; i >= 0 && samples[i].ts >= t - TRACE_MS; i--) win.unshift(samples[i]);
  if (win.length < 2) return <p className="text-[11px] text-faint">No car telemetry in the last 20 seconds.</p>;
  const x = (ts: number) => ((ts - (t - TRACE_MS)) / TRACE_MS) * 100;
  const line = (pick: (c: CarSample) => number | null, scale: (v: number) => number) => {
    const parts: string[] = [];
    let prev: CarSample | null = null, open = false;
    for (const c of win) {
      const v = pick(c);
      if (v === null) { open = false; prev = c; continue; }
      if (!open || !prev || c.ts - prev.ts > GAP_MS) parts.push(`M${x(c.ts).toFixed(1)},${scale(v).toFixed(1)}`);
      else parts.push(`L${x(c.ts).toFixed(1)},${scale(v).toFixed(1)}`);
      open = true;
      prev = c;
    }
    return parts.join(" ");
  };
  const speed = line((c) => c.speed, (v) => 38 - Math.min(1, Math.max(0, v / MAX_KMH)) * 36);
  const throttle = line((c) => c.throttle, (v) => 56 - Math.min(100, Math.max(0, v)) * 0.14);
  const brakes = win.filter((c) => c.brake !== null && c.brake > 0);
  return (
    <div role="img" aria-label="Speed, throttle and brake over the last 20 seconds">
      <svg viewBox="0 0 100 58" preserveAspectRatio="none" className="h-24 w-full">
        <defs>
          <linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--info))" stopOpacity="0.28" />
            <stop offset="1" stopColor="rgb(var(--info))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 22, 34].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgb(var(--line) / 0.07)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />)}
        {brakes.map((c, i) => <rect key={i} x={x(c.ts)} y="0" width="0.7" height="58" fill="rgb(var(--danger))" opacity={Math.min(0.5, 0.08 + (c.brake ?? 0) / 250)} />)}
        <path d={`${speed} L100,40 L0,40 Z`} fill="url(#trace-fill)" stroke="none" />
        <path d={speed} fill="none" stroke="rgb(var(--info))" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={throttle} fill="none" stroke="rgb(var(--ok))" strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex gap-3 text-[10px] uppercase tracking-wider text-faint">
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-info" />Speed</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ok" />Throttle</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-danger" />Braking</span>
        <span className="ml-auto">20 s</span>
      </div>
    </div>
  );
}

/** One column of three sector segments per recent lap, coloured the same way as the sector bar. */
export function LapRibbon({ laps }: { laps: { lap: number; tones: SectorTone[] }[] }) {
  if (laps.length === 0) return <span className="text-faint">—</span>;
  return (
    <div className="flex items-end gap-1" role="img" aria-label="Sector colours for recent laps">
      {laps.map((l) => (
        <div key={l.lap} className="flex flex-1 flex-col gap-0.5" title={`Lap ${l.lap}`}>
          {[0, 1, 2].map((i) => <div key={i} className={cx("h-1.5 rounded-sm", l.tones[i] ? SEG[l.tones[i]!] : "bg-fg/10")} />)}
          <span className="num text-center text-[9px] text-faint">{l.lap}</span>
        </div>
      ))}
    </div>
  );
}
