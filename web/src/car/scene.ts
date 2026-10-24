// Low-poly Formula 1 car built from primitives and dressed in a team's colours.
//
// This is an illustrative model, not a scan or a licensed render of a real car:
// the proportions follow a current car, while sponsor graphics, the exact wing
// and sidepod shapes and the real livery pattern are not reproduced. The UI
// labels it that way. A licensed model can replace it (see web/public/media).
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  RingGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { carKey, type CarSpec } from "./spec";

const DARK = "#14161a";
const TYRE = "#0b0b0c";

function std(color: string, rough = 0.55, metal = 0.1) {
  return new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** Painted bodywork: smooth shading with a glossy clear coat that picks up the environment. */
function paint(color: string, rough = 0.32, metal = 0.25) {
  return new MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: 1, clearcoatRoughness: 0.12 });
}

/** A rounded body section laid along the car's length (len along x, h up, w across). */
function pod(len: number, h: number, w: number, mat: MeshStandardMaterial, x: number, y: number, z: number) {
  // The capsule is 2 long and 1 wide along its own Y; rotating it by 90 degrees puts the length on x.
  const m = new Mesh(new CapsuleGeometry(0.5, 1, 8, 20), mat);
  m.rotation.z = Math.PI / 2;
  m.scale.set(h, len / 2, w);
  m.position.set(x, y, z);
  return m;
}

function box(w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number) {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function numberTexture(n: number | null, ink: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const g = c.getContext("2d");
  if (g && n !== null) {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = ink;
    g.font = "800 128px 'Barlow Condensed', 'Titillium Web', 'Arial Narrow', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), c.width / 2, c.height / 2 + 6);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

interface Parts {
  body: MeshStandardMaterial[];
  accent: MeshStandardMaterial[];
  helmet: MeshStandardMaterial;
  stripe: MeshStandardMaterial;
  numberMats: MeshBasicMaterial[];
}

export function buildCar(spec: CarSpec): { group: Group; parts: Parts } {
  const group = new Group();
  const body = paint(spec.colour);
  const accent = paint(spec.accent, 0.4, 0.15);
  const dark = std(DARK, 0.7, 0.2);
  const tyre = std(TYRE, 0.9, 0);
  const rim = std("#e6e8ec", 0.35, 0.5);
  const helmet = std(spec.variant === 0 ? "#f4f4f4" : spec.accent, 0.4, 0.1);
  const stripe = std(spec.variant === 0 ? spec.accent : "#ffffff", 0.5, 0.1);

  // Floor and diffuser.
  group.add(box(4.5, 0.05, 1.55, dark, 0.15, 0.11, 0));
  group.add(box(0.9, 0.12, 1.05, dark, 1.95, 0.2, 0));

  // Nose: a six-sided taper, thick at the tub and narrow at the tip.
  const nose = new Mesh(new CylinderGeometry(0.3, 0.07, 2.1, 24), body);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(0.82, 1, 1);
  nose.position.set(-1.1, 0.36, 0);
  group.add(nose);
  const noseStripe = box(1.6, 0.012, 0.14, stripe, -1.05, 0.527, 0);
  group.add(noseStripe);

  // Survival cell, sidepods, engine cover and airbox.
  group.add(pod(1.5, 0.46, 0.66, body, -0.15, 0.42, 0));
  for (const s of [-1, 1]) {
    const sidepod = pod(1.6, 0.36, 0.52, body, 0.5, 0.33, 0.52 * s);
    sidepod.rotation.y = -0.05 * s;
    group.add(sidepod);
    group.add(box(1.5, 0.08, 0.52, accent, 0.5, 0.18, 0.52 * s));
    group.add(box(0.05, 0.24, 0.42, dark, -0.27, 0.33, 0.52 * s)); // inlet
    const tail = box(0.9, 0.2, 0.3, body, 1.55, 0.3, 0.3 * s);
    group.add(tail);
  }
  group.add(pod(1.9, 0.34, 0.5, body, 0.85, 0.56, 0));
  group.add(box(1.1, 0.2, 0.26, body, 1.95, 0.5, 0));
  group.add(box(0.42, 0.3, 0.3, dark, 0.35, 0.86, 0));
  group.add(box(1.0, 0.26, 0.04, stripe, 1.4, 0.8, 0)); // shark fin

  // Halo and driver.
  const halo = new Mesh(new TorusGeometry(0.21, 0.024, 4, 8, Math.PI), dark);
  halo.rotation.set(0, Math.PI / 2, 0);
  halo.position.set(-0.3, 0.64, 0);
  group.add(halo);
  group.add(box(0.05, 0.2, 0.05, dark, -0.55, 0.7, 0));
  const head = new Mesh(new IcosahedronGeometry(0.13, 0), helmet);
  head.position.set(-0.05, 0.72, 0);
  group.add(head);

  // Front wing: main plane, flap and end plates.
  group.add(box(0.5, 0.035, 2.0, accent, -2.2, 0.13, 0));
  group.add(box(0.3, 0.03, 1.9, accent, -2.0, 0.2, 0));
  for (const s of [-1, 1]) group.add(box(0.62, 0.22, 0.03, accent, -2.1, 0.22, 1.0 * s));

  // Rear wing and beam wing.
  group.add(box(0.46, 0.04, 1.12, accent, 2.2, 0.88, 0));
  group.add(box(0.3, 0.035, 1.12, accent, 2.3, 1.0, 0));
  group.add(box(0.3, 0.03, 0.95, dark, 2.2, 0.5, 0));
  group.add(box(0.12, 0.5, 0.07, dark, 2.1, 0.66, 0));
  for (const s of [-1, 1]) group.add(box(0.8, 0.46, 0.03, accent, 2.2, 0.86, 0.57 * s));

  // Wheels and suspension.
  const wheel = (x: number, r: number, w: number, z: number) => {
    const g = new Group();
    const t = new Mesh(new CylinderGeometry(r, r, w, 36), tyre);
    const h = new Mesh(new CylinderGeometry(r * 0.62, r * 0.62, w + 0.012, 24), rim);
    const hub = new Mesh(new CylinderGeometry(r * 0.18, r * 0.18, w + 0.03, 12), dark);
    g.add(t, h, hub);
    for (const side of [-1, 1]) {
      const band = new Mesh(new TorusGeometry(r * 0.8, 0.012, 6, 36), std("#e8c547", 0.6, 0));
      band.position.y = side * (w / 2 + 0.002);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    g.rotation.x = Math.PI / 2;
    g.position.set(x, r, z);
    group.add(g);
  };
  const FZ = 0.92, RZ = 0.9;
  for (const s of [-1, 1]) {
    wheel(-1.75, 0.33, 0.3, FZ * s);
    wheel(1.65, 0.36, 0.42, RZ * s);
    for (const dy of [0.26, 0.4]) {
      const a = box(0.05, 0.03, 0.62, dark, -1.75, dy, 0.6 * s);
      a.rotation.y = 0.18 * s;
      group.add(a);
      group.add(box(0.05, 0.03, 0.6, dark, 1.6, dy - 0.04, 0.6 * s));
    }
  }

  // Race number on the nose and on both sidepods.
  const numberMats: MeshBasicMaterial[] = [];
  const addNumber = (w: number, h: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new MeshBasicMaterial({ map: numberTexture(spec.number, spec.ink), transparent: true, depthWrite: false });
    numberMats.push(m);
    const p = new Mesh(new PlaneGeometry(w, h), m);
    p.position.set(...pos);
    p.rotation.set(...rot);
    group.add(p);
  };
  for (const s of [-1, 1]) addNumber(0.56, 0.35, [0.42, 0.38, 0.795 * s], [0, s === 1 ? 0 : Math.PI, 0]);
  addNumber(0.5, 0.31, [-1.35, 0.534, 0], [-Math.PI / 2, 0, -Math.PI / 2]);

  group.position.y = 0;
  return { group, parts: { body: [body], accent: [accent], helmet, stripe, numberMats } };
}

/** The prefiltered environment is expensive, so each renderer builds it once. */
const ENV = new WeakMap<WebGLRenderer, Texture>();

export function createScene(canvas: HTMLCanvasElement | null, width: number, height: number, opts: { alpha?: boolean; renderer?: WebGLRenderer } = {}) {
  const renderer =
    opts.renderer ??
    new WebGLRenderer({ canvas: canvas ?? undefined, antialias: true, alpha: opts.alpha ?? true, preserveDrawingBuffer: !canvas, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x4a505c, 1.05));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-3.5, 6, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffe2dc, 1.4);
  rim.position.set(5, 3, -4);
  scene.add(rim);

  // Soft reflections: a small built-in studio environment, prefiltered once.
  try {
    let env = ENV.get(renderer);
    if (!env) {
      const pm = new PMREMGenerator(renderer);
      env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      ENV.set(renderer, env);
    }
    scene.environment = env;
    scene.environmentIntensity = 0.55;
  } catch {
    /* no WebGL2: lit by the lights below */
  }
  // A thin glowing ring under the car, like a display plinth.
  const ring = new Mesh(new RingGeometry(2.9, 2.95, 96), new MeshBasicMaterial({ color: 0xe82127, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0.1, 0.004, 0);
  scene.add(ring);
  const shadow = new Mesh(new PlaneGeometry(8.2, 3.6), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.1, 0.005, 0);
  scene.add(shadow);

  const camera = new PerspectiveCamera(26, width / height, 0.1, 60);
  const holder = new Group();
  scene.add(holder);
  return { renderer, scene, camera, holder, shadow };
}

const LOOK = { x: 0, y: 0.38, z: 0 };

export function placeCamera(camera: PerspectiveCamera, zoom: number, aspect: number) {
  // Three-quarter view from the front left. Narrow frames pull back so the car stays whole.
  const fit = aspect < 1.5 ? 1.5 / aspect : 1;
  const d = (10.6 / zoom) * fit;
  camera.position.set(-d * 0.56, d * 0.24, d * 0.8);
  camera.lookAt(LOOK.x, LOOK.y, LOOK.z);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

const lerpColour = (a: Color, b: Color, t: number, out: Color) => out.copy(a).lerp(b, t);

/** A car in a scene that can be re-dressed with a short colour transition. */
export class CarView {
  private car: ReturnType<typeof buildCar>;
  private ctx: ReturnType<typeof createScene>;
  private spec: CarSpec;
  private from: { body: Color; accent: Color } | null = null;
  private to: { body: Color; accent: Color } | null = null;
  private anim = 1;
  private pending: CarSpec | null = null;
  yaw = 0;
  zoom = 1;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement | null, width: number, height: number, spec: CarSpec, renderer?: WebGLRenderer) {
    this.width = width;
    this.height = height;
    this.ctx = createScene(canvas, width, height, { renderer });
    this.spec = spec;
    this.car = buildCar(spec);
    this.ctx.holder.add(this.car.group);
    placeCamera(this.ctx.camera, this.zoom, width / height);
  }

  get renderer() {
    return this.ctx.renderer;
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.ctx.renderer.setSize(w, h, false);
    placeCamera(this.ctx.camera, this.zoom, w / h);
  }

  setZoom(z: number) {
    this.zoom = Math.min(1.8, Math.max(0.7, z));
    placeCamera(this.ctx.camera, this.zoom, this.width / this.height);
  }

  /** Re-dress the car. With `animate`, colours blend and the car turns slightly. */
  setSpec(next: CarSpec, animate: boolean) {
    if (carKey(next) === carKey(this.spec)) return;
    const p = this.car.parts;
    this.from = { body: p.body[0].color.clone(), accent: p.accent[0].color.clone() };
    this.to = { body: new Color(next.colour), accent: new Color(next.accent) };
    this.pending = next;
    this.anim = animate ? 0 : 1;
    if (!animate) this.advance(0);
  }

  /** Moves the transition forward by `dt` seconds. Returns true while something is still changing. */
  advance(dt: number): boolean {
    if (this.anim >= 1 || !this.to || !this.from || !this.pending) return false;
    this.anim = Math.min(1, this.anim + (dt === 0 ? 1 : dt / 0.45));
    const e = 1 - Math.pow(1 - this.anim, 3);
    const p = this.car.parts;
    lerpColour(this.from.body, this.to.body, e, p.body[0].color);
    lerpColour(this.from.accent, this.to.accent, e, p.accent[0].color);
    if (this.anim >= 1) {
      const n = this.pending;
      p.helmet.color.set(n.variant === 0 ? "#f4f4f4" : n.accent);
      p.stripe.color.set(n.variant === 0 ? n.accent : "#ffffff");
      for (const m of p.numberMats) {
        m.map?.dispose();
        m.map = numberTexture(n.number, n.ink);
        m.needsUpdate = true;
      }
      this.spec = n;
      this.pending = null;
      return false;
    }
    return true;
  }

  get animating() {
    return this.anim < 1;
  }

  render(sway = 0) {
    const turn = this.anim < 1 ? (1 - Math.abs(this.anim * 2 - 1)) * 0.25 : 0;
    this.ctx.holder.rotation.y = this.yaw + sway + turn;
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
  }

  dispose(keepRenderer = false) {
    this.ctx.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
    });
    if (!keepRenderer) this.ctx.renderer.dispose();
  }
}
