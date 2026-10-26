import { useEffect, useRef } from "react";
import { CarView } from "./scene";
import type { CarSpec } from "./spec";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Car3D({ spec, className }: { spec: CarSpec; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<CarView | null>(null);
  const latest = useRef(spec);
  latest.current = spec;
  const kick = useRef<() => void>(() => undefined);

  useEffect(() => {
    const el = wrap.current!, cv = canvas.current!;
    const size = () => ({ w: Math.max(2, el.clientWidth), h: Math.max(2, el.clientHeight) });
    let { w, h } = size();
    let v: CarView;
    try {
      v = new CarView(cv, w, h, latest.current);
    } catch {
      return;
    }
    view.current = v;
    let raf = 0, last = performance.now(), t0 = last, visible = true, dragging = false, velocity = 0;
    const calm = reduced();
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moving = v.advance(dt);
      if (!dragging) {
        v.yaw += velocity * dt;
        velocity *= Math.pow(0.04, dt);
        if (Math.abs(velocity) < 0.01) velocity = 0;
      }
      const sway = calm ? 0 : Math.sin((now - t0) / 2600) * 0.12;
      v.render(sway);
      if (visible && (!calm || moving || velocity !== 0 || dragging)) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    kick.current = start;
    start();

    const ro = new ResizeObserver(() => {
      ({ w, h } = size());
      v.setSize(w, h);
      start();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(el);

    // Drag to turn (with a little momentum), wheel and pinch to zoom, arrow keys to turn.
    const pts = new Map<number, number>();
    let lastX = 0, pinch = 0;
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, e.clientX);
      lastX = e.clientX;
      dragging = true;
      velocity = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.abs(a - b);
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e.clientX);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.abs(a - b);
        if (pinch) v.setZoom(v.zoom * (d / pinch));
        pinch = d;
      } else {
        const dx = e.clientX - lastX;
        v.yaw += dx * 0.008;
        velocity = dx * 0.5;
        lastX = e.clientX;
      }
      start();
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size === 0) dragging = false;
      pinch = 0;
      start();
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      v.setZoom(v.zoom * (e.deltaY < 0 ? 1.08 : 0.93));
      start();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") v.yaw -= 0.15;
      else if (e.key === "ArrowRight") v.yaw += 0.15;
      else if (e.key === "+" || e.key === "=") v.setZoom(v.zoom * 1.1);
      else if (e.key === "-") v.setZoom(v.zoom / 1.1);
      else if (e.key === "0") {
        v.yaw = 0;
        v.setZoom(1);
      } else return;
      e.preventDefault();
      start();
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    cv.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wheel);
      cv.removeEventListener("keydown", key);
      v.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.setSpec(spec, !reduced());
    kick.current();
  }, [spec]);

  return (
    <div ref={wrap} className={className} style={{ touchAction: "pan-y" }}>
      <canvas
        ref={canvas}
        className="h-full w-full cursor-grab outline-none active:cursor-grabbing"
        tabIndex={0}
        role="img"
        aria-label="Illustrative 3D car in team colours. Drag or use the arrow keys to turn it, hold Ctrl and scroll or use plus and minus to zoom."
      />
    </div>
  );
}
