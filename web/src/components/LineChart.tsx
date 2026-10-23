// Small dependency-free SVG line chart with a hover crosshair. Gaps in data
// (null values) break the line instead of being bridged.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export interface Series {
  id: string;
  label: string;
  colour: string;
  points: { x: number; y: number | null }[];
  dashed?: boolean;
  step?: boolean;
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  yLabel?: string;
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  yDomain?: [number, number];
  invertY?: boolean;
  yTicks?: number[];
  className?: string;
  /** Vertical bands, e.g. safety-car periods. */
  bands?: { from: number; to: number; colour: string; label?: string }[];
  zeroLine?: boolean;
  /** Synchronized hover across charts. */
  hoverX?: number | null;
  onHover?: (x: number | null) => void;
  empty?: ReactNode;
}

const PAD = { l: 44, r: 10, t: 10, b: 22 };

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function LineChart({ series, height = 180, yLabel, xFormat = (x) => String(Math.round(x)), yFormat = (y) => String(Math.round(y * 100) / 100), yDomain, invertY, yTicks, className, bands, zeroLine, hoverX, onHover, empty }: LineChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(600);
  const [localHover, setLocalHover] = useState<number | null>(null);
  const hx = hoverX !== undefined ? hoverX : localHover;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of series)
      for (const p of s.points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y !== null) {
          if (p.y < yMin) yMin = p.y;
          if (p.y > yMax) yMax = p.y;
        }
      }
    if (yDomain) [yMin, yMax] = yDomain;
    else if (Number.isFinite(yMin)) {
      const pad = (yMax - yMin) * 0.06 || 1;
      yMin -= pad;
      yMax += pad;
    }
    return { xMin, xMax, yMin, yMax };
  }, [series, yDomain]);

  const hasData = Number.isFinite(xMin) && Number.isFinite(yMin);
  const iw = Math.max(10, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const sx = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * iw;
  const sy = (y: number) => (invertY ? PAD.t + ((y - yMin) / (yMax - yMin || 1)) * ih : PAD.t + ih - ((y - yMin) / (yMax - yMin || 1)) * ih);

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = "";
        let pen = false;
        let prevY: number | null = null;
        for (const p of s.points) {
          if (p.y === null) {
            pen = false;
            continue;
          }
          const X = sx(p.x).toFixed(1), Y = sy(p.y).toFixed(1);
          if (!pen) d += `M${X},${Y}`;
          else if (s.step && prevY !== null) d += `H${X}V${Y}`;
          else d += `L${X},${Y}`;
          pen = true;
          prevY = p.y;
        }
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, w, height, xMin, xMax, yMin, yMax, invertY],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, [hasData]);

  if (!hasData) return <div className={cx("flex items-center justify-center text-sm text-muted", className)} style={{ height }}>{empty ?? "No data"}</div>;

  const xt = niceTicks(xMin, xMax, Math.max(2, Math.floor(iw / 90)));
  const yt = yTicks ?? niceTicks(yMin, yMax, Math.max(2, Math.floor(ih / 36)));
  const hover = hx !== null && hx !== undefined && hx >= xMin && hx <= xMax ? hx : null;
  const valuesAt = hover === null ? [] : series.map((s) => {
    let best: { x: number; y: number | null } | null = null;
    for (const p of s.points) if (!best || Math.abs(p.x - hover) < Math.abs(best.x - hover)) best = p;
    return { s, y: best?.y ?? null };
  });

  return (
    <div className={cx("relative", className)}>
      {yLabel && <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">{yLabel}</div>}
      <svg
        ref={ref}
        width="100%"
        height={height}
        className="block overflow-visible"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = xMin + ((e.clientX - r.left - PAD.l) / iw) * (xMax - xMin);
          (onHover ?? setLocalHover)(x);
        }}
        onPointerLeave={() => (onHover ?? setLocalHover)(null)}
        role="img"
        aria-label={yLabel ? `${yLabel} chart` : "Chart"}
      >
        {bands?.map((b, i) => (
          <rect key={i} x={sx(Math.max(b.from, xMin))} y={PAD.t} width={Math.max(0, sx(Math.min(b.to, xMax)) - sx(Math.max(b.from, xMin)))} height={ih} fill={b.colour}>
            {b.label && <title>{b.label}</title>}
          </rect>
        ))}
        {yt.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + iw} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={PAD.l - 6} y={sy(v)} dy="0.32em" textAnchor="end" className="fill-[rgb(var(--faint))] font-mono text-[9px]">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {zeroLine && yMin < 0 && yMax > 0 && <line x1={PAD.l} x2={PAD.l + iw} y1={sy(0)} y2={sy(0)} stroke="rgb(var(--muted) / 0.5)" />}
        {xt.map((v) => (
          <text key={v} x={sx(v)} y={height - 6} textAnchor="middle" className="fill-[rgb(var(--faint))] font-mono text-[9px]">
            {xFormat(v)}
          </text>
        ))}
        {series.map((s, i) => (
          <path key={s.id} d={paths[i]} fill="none" stroke={s.colour} strokeWidth={1.6} strokeDasharray={s.dashed ? "4 3" : undefined} strokeLinejoin="round" />
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="rgb(var(--fg) / 0.35)" />
            {valuesAt.map(({ s, y }) => y !== null && <circle key={s.id} cx={sx(hover)} cy={sy(y)} r={3} fill={s.colour} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-md border hairline bg-panel/95 px-2 py-1 text-[10px] shadow" style={{ left: Math.min(w - 150, sx(hover) + 8) }}>
          <div className="num text-muted">{xFormat(hover)}</div>
          {valuesAt.map(({ s, y }) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />
              <span className="text-muted">{s.label}</span>
              <span className="num ml-auto font-semibold">{y === null ? "—" : yFormat(y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
