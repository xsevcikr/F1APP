// Licensed images and 3D assets.
//
// The app ships without official portraits, team logos or car renders, because
// those are copyrighted and no open licence covers them. Anything listed in
// `public/media/manifest.json` is used in their place. Each entry must name its
// licence and credit; see public/media/README.md. Without an entry the UI shows
// a clearly marked fallback, never a different person's photo.
import { useEffect, useState } from "react";

export interface MediaItem {
  src: string;
  /** Who made it. */
  credit: string;
  /** Licence or permission under which it may be shown, e.g. "CC BY 4.0" or "Licensed from <owner>". */
  license: string;
  /** Where it came from. */
  source?: string;
}

export interface MediaManifest {
  /** Portraits by race number. The driver's code must match, so a reused number can never show the wrong face. */
  drivers: Record<string, MediaItem & { code: string }>;
  /** Team logos by team id. */
  logos: Record<string, MediaItem>;
  /** Car renders by team id: a transparent PNG or WebP at the same angle for every team. */
  cars: Record<string, MediaItem>;
}

const EMPTY: MediaManifest = { drivers: {}, logos: {}, cars: {} };
let loaded: Promise<MediaManifest> | null = null;

export function loadMedia(): Promise<MediaManifest> {
  if (import.meta.env.MODE === "standalone") return Promise.resolve(EMPTY);
  loaded ??= fetch(`${import.meta.env.BASE_URL}media/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Partial<MediaManifest>>) : EMPTY))
    .then((m) => ({ ...EMPTY, ...m }))
    .catch(() => EMPTY);
  return loaded;
}

export function useMedia(): MediaManifest {
  const [m, setM] = useState<MediaManifest>(EMPTY);
  useEffect(() => {
    let live = true;
    void loadMedia().then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, []);
  return m;
}
