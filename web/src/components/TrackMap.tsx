// Interactive circuit map drawn on a canvas.
//
// Car markers come from SessionTimeline.carPositionsAt, which interpolates only
// between real samples and never extrapolates. Cars whose latest sample is old
// are drawn hollow and faded, so stale positions never look live.
import { useCallback, useEffect, useRef, useState } from "react";
import { DRS_LABEL, formatGap, formatLapTime, kmhTo, type CircuitModel, type InterpolatedPosition, type Snapshot } from "@f1/shared";
import { useSnapshot } from "../hooks/live";
import { displayTime, useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";
import { cx, Loading, TyreBadge, Unavailable } from "./ui";

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface Fit {
  s: number;
  ox: number;
  oy: number;
}

function computeFit(c: CircuitModel | null, pts: InterpolatedPosition[], w: number, h: number, pad: number): Fit | null {
  let b = c?.bounds;
  if (!b && pts.length) {
    b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of pts) {
      b.minX = Math.min(b.minX, p.x);
      b.maxX = Math.max(b.maxX, p.x);
      b.minY = Math.min(b.minY, p.y);
      b.maxY = Math.max(b.maxY, p.y);
    }
  }
  if (!b || !Number.isFinite(b.minX)) return null;
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  // Y is flipped so north-up data reads naturally on screen.
  return { s, ox: (w - bw * s) / 2 - b.minX * s, oy: (h - bh * s) / 2 + b.maxY * s };
}

function css(name: string, alpha = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v.includes(" ") ? `rgb(${v} / ${alpha})` : v;
}

function readableOn(hex: string) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0b0c0e" : "#ffffff";
}

export function TrackMap({ compact = false, className }: { compact?: boolean; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timeline = useSession((s) => s.timeline);
  const circuit = useSession((s) => s.circuit);
  const circuitState = useSession((s) => s.circuitState);
  const circuitError = useSession((s) => s.circuitError);
  const selected = useSession((s) => s.selectedDriver);
  const follow = useSession((s) => s.followDriver);
  const selectDriver = useSession((s) => s.selectDriver);
  const setFollow = useSession((s) => s.setFollow);
  const lowPower = useSettings((s) => s.lowPower);
  const units = useSettings((s) => s.units);
  const snap = useSnapshot(4);
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = snap;
  const [view, setViewState] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // Follow mode moves viewRef every frame, so updates always start from it.
  const setView = useCallback((next: View | ((v: View) => View)) => {
    const v = typeof next === "function" ? next(viewRef.current) : next;
    viewRef.current = v;
    setViewState(v);
  }, []);
  const posRef = useRef<InterpolatedPosition[]>([]);
  const fitRef = useRef<Fit | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hasCars, setHasCars] = useState(false);

  const toScreen = useCallback((x: number, y: number): [number, number] => {
    const f = fitRef.current!;
    const v = viewRef.current;
    return [(f.ox + x * f.s) * v.scale + v.tx, (f.oy - y * f.s) * v.scale + v.ty];
  }, []);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const frameMs = lowPower ? 1000 / 15 : 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < frameMs) return;
      last = now;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap || !timeline) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = displayTime(Date.now());
      const positions = timeline.carPositionsAt(t);
      posRef.current = positions;
      if (positions.length > 0 !== hasCars) setHasCars(positions.length > 0);
      fitRef.current = computeFit(circuit?.circuit ?? null, positions, w, h, compact ? 18 : 36);
      if (!fitRef.current) return;

      // Follow mode keeps the selected car centred.
      const st = useSession.getState();
      if (st.followDriver && st.selectedDriver !== null) {
        const p = positions.find((q) => q.driver === st.selectedDriver);
        if (p) {
          const f = fitRef.current;
          const v = viewRef.current;
          const sx = (f.ox + p.x * f.s) * v.scale, sy = (f.oy - p.y * f.s) * v.scale;
          const target = { scale: Math.max(v.scale, 2.2), tx: w / 2 - sx, ty: h / 2 - sy };
          viewRef.current = { scale: target.scale, tx: v.tx + (target.tx - v.tx) * 0.15, ty: v.ty + (target.ty - v.ty) * 0.15 };
        }
      }

      const zoom = viewRef.current.scale;
      const c = circuit?.circuit;
      if (c) drawCircuit(ctx, c, toScreen, zoom, compact);

      const s = snapRef.current;
      const leader = s?.rows.find((r) => r.position === 1)?.driver.number;
      const secondCars = new Set<number>();
      const byTeam = new Map<string, number[]>();
      for (const dd of timeline.drivers.values()) byTeam.set(dd.team, [...(byTeam.get(dd.team) ?? []), dd.number]);
      for (const nums of byTeam.values()) if (nums.length > 1) secondCars.add(nums.sort((a, b) => a - b)[1]);
      const r = (compact ? 7 : 9.5) * Math.min(1.6, Math.max(1, Math.sqrt(zoom) * 0.9));
      // Draw selected and leader last so they sit on top.
      const ordered = [...positions].sort((a, b) => Number(a.driver === st.selectedDriver) - Number(b.driver === st.selectedDriver) || Number(a.driver === leader) - Number(b.driver === leader));
      for (const p of ordered) {
        const d = timeline.drivers.get(p.driver);
        const colour = d?.teamColour ?? "#8a8f98";
        const [x, y] = toScreen(p.x, p.y);
        const isSel = p.driver === st.selectedDriver;
        const isLeader = p.driver === leader;
        ctx.save();
        ctx.globalAlpha = p.stale ? 0.35 : 1;
        if (isSel) {
          ctx.shadowColor = css("accent", 0.9);
          ctx.shadowBlur = 18;
        }
        // Direction tick.
        if (p.heading !== null && !p.stale) {
          const hx = Math.cos(p.heading), hy = -Math.sin(p.heading);
          ctx.beginPath();
          ctx.moveTo(x + hx * (r + 5), y + hy * (r + 5));
          ctx.lineTo(x + hx * r - hy * 4, y + hy * r + hx * 4);
          ctx.lineTo(x + hx * r + hy * 4, y + hy * r - hx * 4);
          ctx.closePath();
          ctx.fillStyle = colour;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (p.stale) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = colour;
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        // A team's second car (higher number) carries an inner ring so teammates read apart.
        if (secondCars.has(p.driver) && !p.stale) {
          ctx.beginPath();
          ctx.arc(x, y, r - 2.4, 0, Math.PI * 2);
          ctx.strokeStyle = readableOn(colour);
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (isLeader || isSel) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? css("accent") : css("fg", 0.9);
          ctx.lineWidth = isSel ? 2.5 : 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = p.stale ? colour : readableOn(colour);
        ctx.font = `700 ${Math.round(r * 1.05)}px 'Titillium Web', Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(p.driver), x, y + 0.5);
        if (!compact && (isSel || zoom > 2.5)) {
          ctx.font = `600 11px Inter, sans-serif`;
          ctx.fillStyle = css("fg");
          ctx.fillText(d?.code ?? "", x, y - r - 9);
        }
        ctx.restore();
      }

      // Position the driver popover next to the selected car.
      const pop = popRef.current;
      if (pop) {
        const p = positions.find((q) => q.driver === st.selectedDriver);
        if (p && !compact) {
          const [x, y] = toScreen(p.x, p.y);
          const left = Math.min(w - pop.offsetWidth - 8, Math.max(8, x + 18));
          const top = Math.min(h - pop.offsetHeight - 8, Math.max(8, y - pop.offsetHeight / 2));
          pop.style.transform = `translate(${left}px, ${top}px)`;
          pop.style.opacity = "1";
        } else pop.style.opacity = "0";
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [timeline, circuit, compact, lowPower, toScreen, hasCars]);

  // Interaction: wheel zoom, drag pan, pinch, click to select.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinchDist = 0;
    const zoomAt = (factor: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const scale = Math.min(12, Math.max(0.6, v.scale * factor));
      const k = scale / v.scale;
      setView({ scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = el.getBoundingClientRect();
        if (pinchDist) zoomAt(d / pinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        pinchDist = d;
        moved = true;
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (moved) {
        if (useSession.getState().followDriver) setFollow(false);
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (moved || !fitRef.current) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best: number | null = null, bestD = 22 * 22;
      for (const p of posRef.current) {
        const [x, y] = toScreen(p.x, p.y);
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p.driver;
        }
      }
      selectDriver(best);
      if (best === null) setFollow(false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [selectDriver, setFollow, toScreen, setView]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current?.parentElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const row = snap?.rows.find((r) => r.driver.number === selected);
  const pos = posRef.current.find((p) => p.driver === selected);
  const sector = row && timeline ? currentSector(timeline.lapsOf(row.driver.number), snap!.t) : null;

  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-surface", fullscreen && "rounded-none", className)}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(255,176,32,0.07), transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(232,33,39,0.09), transparent 55%), linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)", backgroundSize: "auto, auto, 32px 32px, 32px 32px" }}
      />
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-label="Circuit map with car positions" role="img" />
      </div>

      {!timeline && <Loading label="Waiting for session" className="absolute inset-0 justify-center" />}
      {timeline && !hasCars && (
        <div className="absolute inset-x-3 bottom-3 max-w-md">
          <Unavailable
            title={timeline.core.channels.location.available ? "No car positions at this moment" : "Car positions unavailable"}
            reason={timeline.core.channels.location.reason ?? "Position samples are loading, or the source has none for this time. Cars are never placed without a reported position."}
          />
        </div>
      )}
      {timeline && circuitState === "unavailable" && hasCars && (
        <div className="absolute left-3 top-3 max-w-xs text-[11px] text-muted">Circuit outline unavailable: {circuitError}</div>
      )}
      {circuitState === "loading" && <div className="absolute left-3 top-3 text-[11px] text-muted">Tracing circuit from position data…</div>}

      {!compact && (
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <MapButton label="Zoom in" icon="plus" onClick={() => setView((v) => ({ ...v, scale: Math.min(12, v.scale * 1.3) }))} />
          <MapButton label="Zoom out" icon="minus" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.6, v.scale / 1.3) }))} />
          <MapButton label="Fit circuit" icon="fit" onClick={() => { setFollow(false); setView({ scale: 1, tx: 0, ty: 0 }); }} />
          <MapButton label={follow ? "Stop following" : "Follow selected driver"} icon="target" active={follow} disabled={selected === null} onClick={() => setFollow(!follow)} />
          <MapButton label={fullscreen ? "Exit full screen" : "Full screen"} icon={fullscreen ? "shrink" : "expand"} onClick={toggleFullscreen} />
        </div>
      )}

      {!compact && (
        <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex flex-wrap items-end justify-between gap-2 text-[10px] text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <Legend swatch={<span className="h-0.5 w-4 rounded bg-ok" />} label="DRS zone (derived)" show={!!circuit?.circuit.drsZones.length} />
            <Legend swatch={<span className="h-0 w-4 border-t border-dashed border-muted" />} label="Pit lane (derived)" show={!!circuit?.circuit.pitLane} />
            <Legend swatch={<span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted" />} label="No recent sample" show />
          </div>
          <div className="max-w-md text-right" title={circuit?.circuit.basis.join(" ")}>
            Positions are interpolated between reported samples, never extrapolated.
            {circuit && circuit.fromSession.sessionKey !== timeline?.core.session.sessionKey && ` Outline from ${circuit.fromSession.name} ${circuit.fromSession.year}.`}
          </div>
        </div>
      )}

      <div ref={popRef} className="pointer-events-auto absolute left-0 top-0 w-60 opacity-0 transition-opacity" style={{ willChange: "transform" }}>
        {row && !compact && (
          <div className="panel bg-panel/95 p-3 text-xs shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full" style={{ background: row.driver.teamColour ?? undefined }} />
                <div>
                  <div className="font-display text-sm font-bold">{row.driver.fullName}</div>
                  <div className="text-[10px] text-muted">{row.driver.team}</div>
                </div>
              </div>
              <div className="font-display text-xl font-black">P{row.position ?? "—"}</div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <Item k="Lap" v={row.lap ?? "—"} />
              <Item k="Speed" v={row.car?.speed != null && snap && snap.t - row.car.ts < 5000 ? `${Math.round(kmhTo(row.car.speed, units))} ${units === "metric" ? "km/h" : "mph"}` : "—"} title="Measured by car telemetry" />
              <Item k="Sector" v={sector ? `S${sector}` : "—"} title="Derived from the lap's sector times" />
              <Item k="Gap ahead" v={formatGap(row.interval.value)} />
              <Item k="DRS" v={DRS_LABEL[row.drs.state]} title={row.drs.basis} />
              <Item k="Tyre" v={<TyreBadge compound={row.compound} age={row.tyreAge} size={18} />} />
              <Item k="Last lap" v={formatLapTime(row.lastLap?.duration)} />
              <Item k="Track" v={snap?.track.headline ?? "—"} />
            </dl>
            {pos && (
              <div className="mt-2 border-t hairline pt-1.5 text-[10px] text-muted">
                {pos.stale ? `No position sample for ${Math.round(pos.ageMs / 1000)} s` : pos.kind === "interpolated" ? "Position interpolated between samples" : pos.kind === "held" ? "Held at last sample" : "Measured sample"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ k, v, title }: { k: string; v: React.ReactNode; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-[9px] uppercase tracking-wider text-muted">{k}</dt>
      <dd className="num font-semibold">{v}</dd>
    </div>
  );
}

function Legend({ swatch, label, show }: { swatch: React.ReactNode; label: string; show: boolean }) {
  if (!show) return null;
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}

function MapButton({ label, icon, onClick, active, disabled }: { label: string; icon: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx("flex h-8 w-8 items-center justify-center rounded-lg border hairline bg-panel/90 backdrop-blur transition-colors", active ? "text-accent ring-1 ring-accent/60" : "text-muted hover:text-fg", disabled && "opacity-40")}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

export function currentSector(laps: readonly { lap: number; start: number | null; s1: number | null; s2: number | null }[], t: number): 1 | 2 | 3 | null {
  let cur = null as (typeof laps)[number] | null;
  for (const l of laps) if (l.start !== null && l.start <= t) cur = l;
  if (!cur || cur.start === null) return null;
  const e = (t - cur.start) / 1000;
  if (cur.s1 === null) return 1;
  if (e < cur.s1) return 1;
  if (cur.s2 === null) return 2;
  return e < cur.s1 + cur.s2 ? 2 : 3;
}

function drawCircuit(ctx: CanvasRenderingContext2D, c: CircuitModel, toScreen: (x: number, y: number) => [number, number], zoom: number, compact: boolean) {
  const width = (compact ? 7 : 11) * Math.min(2.2, Math.max(1, Math.sqrt(zoom)));
  const path = new Path2D();
  c.path.forEach(([x, y], i) => {
    const [sx, sy] = toScreen(x, y);
    if (i === 0) path.moveTo(sx, sy);
    else path.lineTo(sx, sy);
  });
  path.closePath();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Layered like a satellite view: pale run-off, red/white kerb edge, dark asphalt,
  // a faint amber racing line. Styling only; the geometry is the traced outline.
  const dark = !document.documentElement.dataset.theme?.includes("light");
  ctx.strokeStyle = dark ? "rgba(214, 200, 186, 0.2)" : "rgba(120, 110, 100, 0.18)";
  ctx.lineWidth = width * 2.6;
  ctx.stroke(path);
  ctx.strokeStyle = dark ? "rgba(214, 200, 186, 0.34)" : "rgba(120, 110, 100, 0.28)";
  ctx.lineWidth = width * 1.7;
  ctx.stroke(path);
  ctx.strokeStyle = "#e82127";
  ctx.lineWidth = width + 9;
  ctx.stroke(path);
  ctx.setLineDash([width * 0.55, width * 0.55]);
  ctx.strokeStyle = "#f4f1ea";
  ctx.stroke(path);
  ctx.setLineDash([]);
  ctx.strokeStyle = dark ? "#16171b" : css("track");
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.strokeStyle = "rgba(255, 190, 40, 0.28)";
  ctx.lineWidth = Math.max(1, width * 0.12);
  ctx.setLineDash([width * 0.9, width * 0.9]);
  ctx.stroke(path);
  ctx.setLineDash([]);

  if (c.pitLane && c.pitLane.length > 1) {
    ctx.beginPath();
    c.pitLane.forEach(([x, y], i) => {
      const [sx, sy] = toScreen(x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = css("muted", 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const z of c.drsZones) {
    ctx.beginPath();
    for (let i = z.from; i <= z.to; i++) {
      const [sx, sy] = toScreen(c.path[i][0], c.path[i][1]);
      if (i === z.from) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = css("ok", 0.75);
    ctx.lineWidth = Math.max(2.5, width * 0.35);
    ctx.stroke();
  }

  const tick = (m: { x: number; y: number; heading: number | null }, colour: string, len: number, lw: number) => {
    if (m.heading === null) return;
    const [sx, sy] = toScreen(m.x, m.y);
    const nx = -Math.sin(m.heading), ny = -Math.cos(m.heading);
    ctx.beginPath();
    ctx.moveTo(sx - nx * len, sy - ny * len);
    ctx.lineTo(sx + nx * len, sy + ny * len);
    ctx.strokeStyle = colour;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  c.sectorLines.forEach((m, i) => {
    tick(m, css("warn", 0.9), width * 0.9, 2);
    if (!compact && m.heading !== null) {
      const [sx, sy] = toScreen(m.x, m.y);
      ctx.font = "600 10px Inter, sans-serif";
      ctx.fillStyle = css("muted");
      ctx.textAlign = "center";
      ctx.fillText(`S${i + 2}`, sx + Math.sin(m.heading) * (width + 10), sy + Math.cos(m.heading) * (width + 10));
    }
  });
  if (c.startFinish) {
    tick(c.startFinish, "#ffffff", width * 1.1, 4);
    tick(c.startFinish, "#000000", width * 1.1, 1.2);
  }
}
