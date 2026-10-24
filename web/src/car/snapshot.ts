// Still images of a car at one fixed angle, rendered once with a shared
// off-screen renderer. Directories and panels use these so that many cars on a
// page share one WebGL context and look identical in angle, light and size.
import type { WebGLRenderer } from "three";
import { carKey, type CarSpec } from "./spec";

const cache = new Map<string, string>();
let shared: { renderer: WebGLRenderer; canvas: HTMLCanvasElement } | null = null;
let queue: Promise<unknown> = Promise.resolve();

let webgl: boolean | null = null;

/** Checked once: every probe opens a context, and browsers cap how many may be alive. */
export function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

export function snapshotCar(spec: CarSpec, width = 640, height = 340): Promise<string | null> {
  const key = `${carKey(spec)}@${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    try {
      const THREE = await import("three");
      const { CarView } = await import("./scene");
      if (!shared) {
        const canvas = document.createElement("canvas");
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
        shared = { renderer, canvas };
      }
      const view = new CarView(null, width, height, spec, shared.renderer);
      view.setSize(width, height);
      view.render(0.12);
      const url = shared.canvas.toDataURL("image/png");
      view.dispose(true);
      cache.set(key, url);
      if (cache.size > 80) cache.delete(cache.keys().next().value as string);
      return url;
    } catch {
      return null;
    }
  });
  queue = job.catch(() => null);
  return job;
}
