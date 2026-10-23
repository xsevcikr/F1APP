import { useEffect, useMemo, useRef, useState } from "react";
import { DRS_LABEL, formatGap, formatLapTime, type Compound, type LeaderboardRow, type Snapshot } from "@f1/shared";
import { useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";
import { cx, TyreBadge } from "./ui";

type SortKey = "position" | "team" | "tyre" | "pit";

const ROW_H = 40;
const ROW_H_COMPACT = 30;
const STALE_GAP_MS = 20_000;

export function Leaderboard({ snap, compact = false, onSelect }: { snap: Snapshot | null; compact?: boolean; onSelect?: (n: number) => void }) {
  const selected = useSession((s) => s.selectedDriver);
  const selectDriver = useSession((s) => s.selectDriver);
  const favs = useSettings((s) => s.alerts.favouriteDrivers);
  const showHeadshots = useSettings((s) => s.showHeadshots);
  const [sort, setSort] = useState<SortKey>("position");
  const [team, setTeam] = useState("");
  const [compound, setCompound] = useState<Compound | "">("");
  const [pitFilter, setPitFilter] = useState<"" | "in" | "out">("");
  const [onlyFavs, setOnlyFavs] = useState(false);

  // Remember each driver's previous position to flash changes.
  const prev = useRef(new Map<number, { pos: number | null; at: number; dir: 1 | -1 | 0 }>());
  const now = snap?.t ?? 0;
  const lastT = useRef<number | null>(null);
  if (snap) {
    // A seek or lap jump changes many positions at once; that is not a position change to highlight.
    const jumped = lastT.current === null || Math.abs(snap.t - lastT.current) > 5000;
    lastT.current = snap.t;
    for (const r of snap.rows) {
      const p = prev.current.get(r.driver.number);
      if (!p || jumped) prev.current.set(r.driver.number, { pos: r.position, at: 0, dir: 0 });
      else if (p.pos !== r.position && r.position !== null && p.pos !== null) prev.current.set(r.driver.number, { pos: r.position, at: Date.now(), dir: r.position < p.pos ? 1 : -1 });
      else if (p.pos !== r.position) p.pos = r.position;
    }
  }
  // Clear flash memory when the session changes.
  const sessionKey = useSession((s) => s.sessionKey);
  useEffect(() => prev.current.clear(), [sessionKey]);

  const teams = useMemo(() => [...new Set(snap?.rows.map((r) => r.driver.team) ?? [])].sort(), [snap?.rows.length, snap?.rows[0]?.driver.team]);

  const rows = useMemo(() => {
    if (!snap) return [];
    let list = snap.rows;
    if (team) list = list.filter((r) => r.driver.team === team);
    if (compound) list = list.filter((r) => r.compound === compound);
    if (pitFilter) list = list.filter((r) => (pitFilter === "in" ? r.inPitLane : !r.inPitLane));
    if (onlyFavs) list = list.filter((r) => favs.includes(r.driver.number));
    const byPos = (a: LeaderboardRow, b: LeaderboardRow) => (a.position ?? 99) - (b.position ?? 99);
    const sorted = [...list];
    if (sort === "team") sorted.sort((a, b) => a.driver.team.localeCompare(b.driver.team) || byPos(a, b));
    if (sort === "tyre") sorted.sort((a, b) => (a.compound ?? "Z").localeCompare(b.compound ?? "Z") || byPos(a, b));
    if (sort === "pit") sorted.sort((a, b) => Number(b.inPitLane) - Number(a.inPitLane) || b.pitStops - a.pitStops || byPos(a, b));
    return sorted;
  }, [snap, sort, team, compound, pitFilter, onlyFavs, favs]);

  const rh = compact ? ROW_H_COMPACT : ROW_H;
  const pick = (n: number) => {
    selectDriver(selected === n ? null : n);
    onSelect?.(n);
  };

  return (
    <div className="flex min-h-0 flex-col">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted">
            Sort
            <select className="input py-0.5 text-xs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="position">Position</option>
              <option value="team">Team</option>
              <option value="tyre">Tyre compound</option>
              <option value="pit">Pit status</option>
            </select>
          </label>
          <select className="input py-0.5 text-xs" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="input py-0.5 text-xs" value={compound} onChange={(e) => setCompound(e.target.value as Compound | "")} aria-label="Filter by tyre">
            <option value="">All tyres</option>
            {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
              <option key={c} value={c}>
                {c[0] + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select className="input py-0.5 text-xs" value={pitFilter} onChange={(e) => setPitFilter(e.target.value as "" | "in" | "out")} aria-label="Filter by pit status">
            <option value="">Any pit status</option>
            <option value="in">In pit lane</option>
            <option value="out">On track</option>
          </select>
          <button className={cx("btn py-0.5 text-xs", onlyFavs && "text-accent ring-1 ring-accent/50")} onClick={() => setOnlyFavs((v) => !v)} aria-pressed={onlyFavs} title="Show favourite drivers only">
            <Icon name="star" size={13} filled={onlyFavs} /> Favourites
          </button>
        </div>
      )}

      <div className="@container overflow-x-auto">
        <div className="min-w-0">
          <div className={cx("grid items-center gap-x-2 border-b hairline px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint", compact ? GRID_COMPACT : GRID)}>
            <span>Pos</span>
            <span />
            <span>Driver</span>
            {!compact && <span className="hidden text-right @md:block">Lap</span>}
            <span className="text-right">{compact ? "Gap" : "Leader"}</span>
            {!compact && <span className="text-right">Int</span>}
            {!compact && <span className="hidden text-right @2xl:block">Last</span>}
            {!compact && <span className="hidden text-right @3xl:block">Best</span>}
            <span className="text-center">Tyre</span>
            {!compact && <span className="hidden text-center @lg:block">Pit</span>}
            {!compact && <span className="hidden text-center @2xl:block">DRS</span>}
          </div>
          <div className="relative" style={{ height: rows.length * rh }} role="table" aria-label="Live standings">
            {rows.map((r, i) => {
              const flash = prev.current.get(r.driver.number);
              const changed = flash && flash.dir !== 0 && Date.now() - flash.at < 2500;
              const isSel = r.driver.number === selected;
              const gapStale = r.interval.ts !== null && now - r.interval.ts > STALE_GAP_MS;
              const out = r.status === "retired" || r.status === "dsq" || r.status === "dns";
              return (
                <div
                  key={r.driver.number}
                  role="row"
                  tabIndex={0}
                  onClick={() => pick(r.driver.number)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(r.driver.number))}
                  className={cx(
                    "absolute inset-x-0 grid cursor-pointer items-center gap-x-2 px-3 transition-[transform,background-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]",
                    compact ? GRID_COMPACT : GRID,
                    isSel ? "bg-accent/10" : "hover:bg-raised/70",
                    changed && flash!.dir === 1 && "bg-ok/10",
                    changed && flash!.dir === -1 && "bg-danger/10",
                    out && "opacity-50",
                  )}
                  style={{ transform: `translateY(${i * rh}px)`, height: rh }}
                  aria-selected={isSel}
                >
                  <span className={cx("num text-center font-display font-bold", compact ? "text-sm" : "text-base")}>{r.position ?? "—"}</span>
                  <Gained n={r.gained} />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: r.driver.teamColour ?? "#777" }} />
                    {!compact && showHeadshots && r.driver.headshotUrl ? (
                      <img src={r.driver.headshotUrl} alt="" className="h-7 w-7 shrink-0 rounded-full bg-raised object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : null}
                    <span className="font-display text-[15px] font-bold tracking-wide">{r.driver.code}</span>
                    {!compact && <span className="hidden truncate text-xs text-muted @md:inline">{r.driver.lastName || r.driver.team}</span>}
                    {favs.includes(r.driver.number) && <Icon name="star" size={11} filled className="shrink-0 text-warn" />}
                    <StatusChips row={r} />
                  </span>
                  {!compact && <span className="num hidden text-right text-xs text-muted @md:block">{r.lap ?? "—"}</span>}
                  <span className={cx("num text-right text-xs", gapStale && "text-faint")} title={gapStale ? "Gap not updated recently" : undefined}>
                    {r.position === 1 ? <span className="text-muted">{compact ? "" : "LEADER"}</span> : formatGap(r.gapToLeader.value)}
                  </span>
                  {!compact && (
                    <span className={cx("num text-right text-xs", gapStale && "text-faint", r.interval.value?.kind === "time" && r.interval.value.seconds < 1 && !gapStale && "text-ok")}>
                      {r.position === 1 ? "" : formatGap(r.interval.value)}
                    </span>
                  )}
                  {!compact && (
                    <span className={cx("num hidden rounded px-1 text-right text-xs @2xl:block", r.newPersonalBest && "animate-flash text-best")} key={r.lastLap?.lap}>
                      {formatLapTime(r.lastLap?.duration)}
                    </span>
                  )}
                  {!compact && <span className="num hidden text-right text-xs text-muted @3xl:block">{formatLapTime(r.bestLap?.duration)}</span>}
                  <span className="flex justify-center">
                    <TyreBadge compound={r.compound} age={compact ? undefined : r.tyreAge} size={compact ? 16 : 20} />
                  </span>
                  {!compact && <span className="num hidden text-center text-xs @lg:block">{r.pitStops}</span>}
                  {!compact && (
                    <span className="hidden justify-center @2xl:flex">
                      <DrsChip row={r} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {snap && rows.length === 0 && <div className="p-6 text-center text-sm text-muted">{snap.rows.length ? "No drivers match the filters." : "No drivers reported for this session."}</div>}
        </div>
      </div>
    </div>
  );
}

const GRID = "grid-cols-[28px_24px_minmax(90px,1fr)_70px_64px_42px] @md:grid-cols-[30px_26px_minmax(120px,1fr)_32px_70px_64px_50px] @lg:grid-cols-[30px_26px_minmax(120px,1fr)_32px_70px_64px_50px_30px] @2xl:grid-cols-[30px_26px_minmax(140px,1fr)_32px_74px_64px_74px_50px_30px_64px] @3xl:grid-cols-[30px_26px_minmax(150px,1fr)_32px_74px_64px_74px_74px_50px_30px_64px]";
const GRID_COMPACT = "grid-cols-[24px_22px_minmax(60px,1fr)_64px_28px]";

function Gained({ n }: { n: number | null }) {
  if (n === null || n === 0) return <span className="text-center text-[10px] text-faint">{n === 0 ? "–" : ""}</span>;
  return (
    <span className={cx("num text-center text-[10px] font-semibold", n > 0 ? "text-ok" : "text-danger")} title={`${n > 0 ? "Gained" : "Lost"} ${Math.abs(n)} since the start`}>
      {n > 0 ? "▲" : "▼"}
      {Math.abs(n)}
    </span>
  );
}

function StatusChips({ row }: { row: LeaderboardRow }) {
  return (
    <span className="flex shrink-0 gap-1">
      {row.status === "pit" && <span className="chip bg-info/20 text-info">PIT</span>}
      {row.status === "retired" && <span className="chip bg-danger/20 text-danger" title={row.statusBasis ?? undefined}>OUT</span>}
      {row.status === "dsq" && <span className="chip bg-danger/20 text-danger">DSQ</span>}
      {row.status === "dns" && <span className="chip bg-faint/20 text-muted">DNS</span>}
      {row.status === "finished" && <span className="chip bg-fg/10 text-fg">FIN</span>}
      {row.gapToLeader.value?.kind === "laps" && <span className="chip bg-faint/15 text-muted" title="Lapped">+{row.gapToLeader.value.laps}L</span>}
      {row.penalties.length > 0 && (
        <span className="chip bg-warn/20 text-warn" title={row.penalties.map((p) => p.message).join("\n")}>
          {row.penalties.reduce((s, p) => s + (p.seconds ?? 0), 0) > 0 ? `+${row.penalties.reduce((s, p) => s + (p.seconds ?? 0), 0)}s` : "PEN"}
        </span>
      )}
    </span>
  );
}

export function DrsChip({ row }: { row: Pick<LeaderboardRow, "drs"> }) {
  const s = row.drs.state;
  const style =
    s === "ACTIVE" ? "bg-ok text-black" : s === "AVAILABLE" ? "bg-ok/20 text-ok ring-1 ring-ok/40" : s === "DISABLED" ? "bg-danger/15 text-danger" : s === "NOT_APPLICABLE" ? "bg-transparent text-faint" : "bg-raised text-faint";
  return (
    <span className={cx("chip", style)} title={row.drs.basis}>
      {s === "NOT_APPLICABLE" ? "N/A" : DRS_LABEL[s].replace("DRS ", "")}
    </span>
  );
}
