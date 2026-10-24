import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import type { CarSpec } from "./spec";
import { snapshotCar, webglAvailable } from "./snapshot";

const Car3D = lazy(() => import("./Car3D"));

/** Flat low-poly side-on car, shown while the 3D model loads or when WebGL is unavailable. */
export function CarFallback({ spec, className }: { spec: CarSpec; className?: string }) {
  return (
    <svg viewBox="0 0 560 190" className={className} role="img" aria-label="Illustrative car in team colours">
      <ellipse cx="290" cy="170" rx="230" ry="9" fill="#000" opacity="0.25" />
      <path d="M40 140 L120 118 L380 112 L500 100 L520 140Z" fill="#14161a" />
      <path d="M60 128 L150 104 L330 92 L430 98 L505 110 L505 134 L60 138Z" fill={spec.colour} />
      <path d="M170 104 L230 74 L300 74 L340 98Z" fill={spec.colour} />
      <rect x="20" y="132" width="110" height="9" fill={spec.accent} />
      <rect x="452" y="64" width="64" height="8" fill={spec.accent} />
      <rect x="500" y="64" width="6" height="40" fill={spec.accent} />
      {[
        [120, 28],
        [420, 32],
      ].map(([x, r]) => (
        <g key={x}>
          <circle cx={x} cy={140} r={r} fill="#0b0b0c" />
          <circle cx={x} cy={140} r={r * 0.55} fill="#e6e8ec" />
        </g>
      ))}
      {spec.number !== null && (
        <text x="250" y="122" fill={spec.ink} fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="30" textAnchor="middle">
          {spec.number}
        </text>
      )}
    </svg>
  );
}

/** A still of the car at a fixed angle: same look for every team in a list. */
export const CarStill = memo(function CarStill({ spec, className, width = 640, height = 340 }: { spec: CarSpec; className?: string; width?: number; height?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const ok = useRef<boolean | null>(null);
  ok.current ??= typeof document !== "undefined" && webglAvailable();
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (!ok.current) return;
    // Spread many stills over idle time so a directory does not block the first paint.
    const run = () => void snapshotCar(spec, width, height).then((u) => live && setSrc(u));
    const w = window as unknown as { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (n: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 30);
    return () => {
      live = false;
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [spec.colour, spec.accent, spec.ink, spec.number, spec.variant, width, height]);
  if (!src) return <CarFallback spec={spec} className={className} />;
  return <img src={src} alt="Illustrative 3D car in team colours" className={className} width={width} height={height} draggable={false} />;
});

/** Interactive 3D car: drag to turn, wheel or pinch to zoom. Falls back to a flat drawing. */
export function CarHero({ spec, className }: { spec: CarSpec; className?: string }) {
  const [ok] = useState(() => typeof document !== "undefined" && webglAvailable());
  if (!ok) return <CarFallback spec={spec} className={className} />;
  return (
    <Suspense fallback={<CarFallback spec={spec} className={className} />}>
      <Car3D spec={spec} className={className} />
    </Suspense>
  );
}
