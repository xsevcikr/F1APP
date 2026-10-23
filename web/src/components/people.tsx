import { useState } from "react";
import { driverByNumber, ENTRIES_2026, teamById, type DriverEntry, type DriverInfo, type TeamEntry } from "@f1/shared";
import { CarStill } from "../car/CarArt";
import type { CarSpec } from "../car/spec";
import { useMedia } from "../media";
import { cx } from "./ui";

export function carSpecFor(team: TeamEntry, driver?: Pick<DriverEntry, "number"> | null, variant: 0 | 1 = 0): CarSpec {
  return { colour: team.colour, accent: team.accent, ink: team.ink, number: driver?.number ?? null, variant };
}

/**
 * A driver portrait. Only a licensed image from the media manifest is shown,
 * and only when its code matches this driver. Otherwise a marked placeholder
 * stands in. It never shows another person's photo.
 */
export function DriverPortrait({ driver, team, className, rounded = "rounded-xl", label = true }: { driver: DriverEntry; team: TeamEntry; className?: string; rounded?: string; label?: boolean }) {
  const media = useMedia();
  const [failed, setFailed] = useState(false);
  const item = media.drivers[String(driver.number)];
  const ok = item && item.code.toUpperCase() === driver.code && !failed;
  return (
    <div className={cx("relative aspect-[4/5] overflow-hidden", rounded, className)} style={{ background: `linear-gradient(160deg, ${team.colour}, ${team.colour}99)` }}>
      {ok ? (
        <img src={item.src} alt={`${driver.firstName} ${driver.lastName}`} title={`${item.credit} · ${item.license}`} className="h-full w-full object-cover object-top" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1" style={{ color: team.ink }} title="No licensed portrait has been added for this driver">
          <span className="font-display text-[2.2em] font-black leading-none tracking-wide">{driver.code}</span>
          {label && <span className="px-1 text-center text-[0.5em] font-semibold uppercase leading-tight tracking-[0.1em] opacity-70">Portrait not available</span>}
        </div>
      )}
    </div>
  );
}

/** Team identifier: a licensed logo when one exists, otherwise the name set in the team colour. */
export function TeamMark({ team, className }: { team: TeamEntry; className?: string }) {
  const media = useMedia();
  const [failed, setFailed] = useState(false);
  const logo = media.logos[team.id];
  if (logo && !failed) return <img src={logo.src} alt={team.name} title={`${logo.credit} · ${logo.license}`} className={cx("h-6 w-auto", className)} onError={() => setFailed(true)} />;
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide", className)}>
      <span className="h-3 w-1.5 rounded-sm" style={{ background: team.colour }} />
      {team.name}
    </span>
  );
}

/** The team's car: a licensed render when one exists, otherwise the illustrative 3D still. */
export function TeamCar({ team, driver, variant = 0, className }: { team: TeamEntry; driver?: DriverEntry | null; variant?: 0 | 1; className?: string }) {
  const media = useMedia();
  const [failed, setFailed] = useState(false);
  const render = media.cars[team.id];
  if (render && !failed) return <img src={render.src} alt={`${team.name} ${team.chassis}`} title={`${render.credit} · ${render.license}`} className={className} onError={() => setFailed(true)} loading="lazy" />;
  return <CarStill spec={carSpecFor(team, driver, variant)} className={className} />;
}

export const flagLabel = (d: DriverEntry) => `${d.nationality} (${d.country})`;

const lum = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/**
 * The car for a driver in a live session. A 2026 race uses that driver's team
 * livery from the entry list, and only when the number and code both match.
 * Any other session gets a plain car in the team colour the timing feed reports.
 * `second` marks the team's other car so the two look different.
 */
export function liveCarSpec(d: DriverInfo, year: number, second: boolean): { spec: CarSpec; livery: "team" | "generic" } {
  const entry = year === ENTRIES_2026.season ? driverByNumber(ENTRIES_2026, d.number) : undefined;
  const team = entry && entry.code === d.code ? teamById(ENTRIES_2026, entry.teamId) : undefined;
  const variant = (second ? 1 : 0) as 0 | 1;
  if (team) return { spec: carSpecFor(team, entry, variant), livery: "team" };
  const colour = d.teamColour ?? "#7a808a";
  return { spec: { colour, accent: "#14161a", ink: lum(colour) > 0.6 ? "#0b0d0e" : "#ffffff", number: d.number, variant }, livery: "generic" };
}
