import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { driversOf, formatCountdown } from "@f1/shared";
import { CarHero } from "../car/CarArt";
import { carSpecFor } from "../components/people";
import { Icon } from "../components/Icon";
import { standingsNote, useSeason } from "../data/season";
import { statusOf, useWeekend } from "../data/weekend";
import { useSession } from "../store/session";

const SECONDARY = [
  { to: "/race", label: "Race Centre" },
  { to: "/live-standings", label: "Live Standings" },
  { to: "/races", label: "Historical Races" },
  { to: "/championship", label: "Championship" },
  { to: "/recaps", label: "Race Recaps" },
  { to: "/live", label: "Circuit Map" },
  { to: "/timing", label: "Live Timing" },
  { to: "/race-control", label: "Race Control" },
  { to: "/battles", label: "Battles" },
  { to: "/settings", label: "Settings" },
] as const;

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 22 L13 10 H27 L24.6 13.6 H15.4 L11 22Z" fill="#fff" />
      <path d="M12 22 L16.4 16.4 H25 L23 19 H18 L16 22Z" fill="#fff" opacity="0.8" />
    </svg>
  );
}

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button className="lp-cond flex items-center gap-1.5 text-base font-semibold uppercase italic tracking-wide" aria-expanded={open} aria-haspopup="true" aria-controls="lp-more" onClick={() => setOpen((o) => !o)}>
        <Icon name="menu" size={18} />
        <span className="hidden sm:inline">More</span>
      </button>
      {open && (
        <ul id="lp-more" className="lp-info absolute right-0 top-full z-30 mt-3 min-w-[200px] overflow-hidden rounded-xl bg-black py-1.5 text-white shadow-2xl">
          {SECONDARY.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="lp-cond block px-4 py-2 text-lg font-semibold uppercase italic tracking-wide hover:bg-white/10" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Nav() {
  const live = useSession((s) => s.server?.live.session);
  return (
    <header className="relative z-20 flex items-center gap-4 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-10">
      <Link to="/" className="flex items-center gap-2.5" aria-label="Control Room home">
        <BrandMark />
        <span className="lp-cond hidden text-lg font-bold uppercase tracking-[0.18em] sm:inline">Control Room</span>
      </Link>
      <nav className="lp-cond ml-auto flex items-center gap-5 text-[1.1rem] sm:gap-9 lg:gap-14" aria-label="Main">
        <Link className="lp-nav-link" to="/calendar">Schedule</Link>
        <Link className="lp-nav-link" to="/drivers">Drivers</Link>
        <Link className="lp-nav-link" to="/teams">Teams</Link>
        {live && (
          <Link to="/live-standings" className="lp-cond flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black px-2.5 py-1 text-xs font-bold uppercase tracking-wider sm:px-3 sm:text-sm">
            <span className="h-2 w-2 animate-pulse2 rounded-full bg-[#ff3b4d]" />
            Live
          </Link>
        )}
        <MoreMenu />
      </nav>
    </header>
  );
}

function TeamStrip({ items, selected, onSelect }: { items: { id: string; position: number; name: string; points: number; colour: string }[]; selected: string; onSelect: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, left: 0, moved: false });

  const reveal = useCallback((id: string) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-team="${id}"]`);
    el?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);
  useEffect(() => reveal(selected), [selected, reveal]);

  // A mouse wheel scrolls the strip sideways; trackpads and touch already do.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === selected);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = items[Math.min(items.length - 1, Math.max(0, next))];
    onSelect(t.id);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-team="${t.id}"]`)?.focus({ preventScroll: true }));
  };

  return (
    <div
      ref={box}
      role="tablist"
      aria-label="Teams in championship order"
      className="lp-strip flex cursor-grab select-none gap-7 overflow-x-auto px-5 pb-3 pt-2 active:cursor-grabbing sm:gap-10 sm:px-8 lg:px-10"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        drag.current = { down: true, x: e.clientX, left: box.current!.scrollLeft, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.down) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 5) d.moved = true;
        if (d.moved) box.current!.scrollLeft = d.left - dx;
      }}
      onPointerUp={() => (drag.current.down = false)}
      onPointerLeave={() => (drag.current.down = false)}
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.stopPropagation();
          e.preventDefault();
          drag.current.moved = false;
        }
      }}
    >
      {items.map((t) => (
        <button
          key={t.id}
          data-team={t.id}
          id={`lp-tab-${t.id}`}
          role="tab"
          aria-selected={t.id === selected}
          aria-controls="lp-panel"
          tabIndex={t.id === selected ? 0 : -1}
          onClick={() => onSelect(t.id)}
          className="lp-tab lp-cond text-left"
        >
          <span className="block whitespace-nowrap text-[clamp(1.5rem,3.1vw,2.6rem)] font-bold uppercase leading-none tracking-wide">
            {t.position}. {t.name}
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full ring-2 ring-white/70" style={{ background: t.colour }} aria-hidden="true" />
            <span className="num">{t.points} pts</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function WeekendBadge() {
  const { weekend, now } = useWeekend();
  const [open, setOpen] = useState(false);
  if (!weekend) return null;
  const list = weekend.sessions.map((s) => ({ s, st: statusOf(s, now, formatCountdown) }));
  const live = list.find((x) => x.st.running);
  const next = list.find((x) => x.s.start > now);
  const head = live ?? next ?? list[list.length - 1];
  const local = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const track = (ms: number, off: string) => new Date(ms + (Number(off.slice(0, 3)) * 60 + (off.startsWith("-") ? -1 : 1) * Number(off.slice(4, 6))) * 60_000).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return (
    <div className="absolute left-5 top-2 z-20 max-w-[min(26rem,calc(100vw-2.5rem))] sm:left-8 lg:left-10">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="lp-cond flex items-center gap-2 rounded-full bg-black px-4 py-1.5 text-sm font-semibold uppercase tracking-wide">
        <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-[#ff4b5c]" : "bg-white/50"}`} aria-hidden="true" />
        {weekend.name === "United States Grand Prix" ? "US GP · Austin" : weekend.name}
        <span className="text-white/70">· {head.s.name} {head.st.label.toLowerCase()}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-black/90 p-3 text-sm shadow-xl backdrop-blur">
          <ul className="flex flex-col divide-y divide-white/10">
            {list.map(({ s, st }) => (
              <li key={s.sessionKey} className="flex items-center justify-between gap-3 py-1.5">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="num text-[11px] text-white/70">{local(s.start)} your time · {track(s.start, s.gmtOffset)} Austin</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${st.running ? "bg-[#fa1735]" : "bg-white/10"}`}>{st.label}</span>
              </li>
            ))}
          </ul>
          <a href="https://www.formula1.com/en/timing/f1-live" target="_blank" rel="noopener noreferrer" className="lp-cond mt-2 inline-flex items-center gap-2 rounded-full bg-[#fa1735] px-4 py-1 text-sm font-semibold uppercase tracking-wide">
            Open F1 live timing <span className="text-[10px] font-normal normal-case text-white/80">formula1.com, opens in a new tab</span>
          </a>
          <a href="https://f1livedata.com/" target="_blank" rel="noopener noreferrer" className="lp-cond ml-2 mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-sm font-semibold uppercase tracking-wide">
            Open F1 Live Data <span className="text-[10px] font-normal normal-case text-white/80">f1livedata.com, unofficial, new tab</span>
          </a>
          <p className="mt-2 text-[11px] leading-snug text-white/70" role="status">
            {weekend.basis === "snapshot" ? "Schedule snapshot from OpenF1, dated 23 Oct 2026. " : "Schedule from OpenF1. "}
            Status here comes from the schedule only. Live timing, positions and race control for a running session need OpenF1 Sponsor credentials on the server; without them the session appears here after it ends, as historical.
          </p>
        </div>
      )}
    </div>
  );
}

export function Landing() {
  const season = useSeason();
  const [params, setParams] = useSearchParams();
  const rows = season.table.teams;
  const selectedId = rows.some((t) => t.team.id === params.get("team")) ? params.get("team")! : rows[0].team.id;
  const sel = rows.find((t) => t.team.id === selectedId)!;
  const team = sel.team;
  const pair = useMemo(() => driversOf(season.entries, team.id), [season.entries, team.id]);
  const [pick, setPick] = useState(0);
  useEffect(() => setPick(0), [team.id]);
  const driver = pair[pick] ?? pair[0];
  const spec = useMemo(() => carSpecFor(team, driver, (pick === 1 ? 1 : 0) as 0 | 1), [team, driver, pick]);
  const select = useCallback((id: string) => setParams({ team: id }, { replace: true }), [setParams]);
  const items = useMemo(() => rows.map((t) => ({ id: t.team.id, position: t.position, name: t.team.name, points: t.points, colour: t.team.colour })), [rows]);
  const digits = String(sel.position).length;

  return (
    <div className="lp relative isolate flex h-[100dvh] min-h-[560px] flex-col overflow-hidden">
      {/* Oversized geometry: the selected team's position, and two quiet arcs for depth. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="lp-shape absolute -left-[18vmax] top-[38%] h-[46vmax] w-[46vmax] rounded-full opacity-[0.16]" />
        <div className="lp-shape absolute -right-[22vmax] -top-[26vmax] h-[60vmax] w-[60vmax] rounded-full opacity-[0.12]" />
        <div className="absolute inset-0 grid place-items-center">
          <span key={sel.position} className="lp-num" style={{ fontSize: digits === 1 ? "min(118vh, 78vw)" : "min(92vh, 64vw)", opacity: 0.55, transform: "translateY(3%)" }}>
            {sel.position}
          </span>
        </div>
      </div>

      <Nav />

      <main className="relative flex-1">
        <WeekendBadge />
        <div className="absolute left-1/2 top-[46%] aspect-[16/9] w-[min(92vw,calc((100dvh-250px)*1.7),1020px)] -translate-x-1/2 -translate-y-1/2">
          <div key={team.id} className="lp-car h-full w-full">
            <CarHero spec={spec} className="h-full w-full" />
          </div>
        </div>
        <p className="absolute bottom-2 right-5 max-w-[16rem] text-right text-[10px] font-medium uppercase leading-snug tracking-wider text-white/75 sm:right-8 lg:right-10">
          Illustrative model in team colours, not an official car render. Drag to turn.
        </p>
      </main>

      <section id="lp-panel" role="tabpanel" aria-labelledby={`lp-tab-${team.id}`} className="relative z-10 px-5 pb-1 sm:px-8 lg:px-10">
        <div key={team.id} className="lp-info">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="lp-cond text-[clamp(1.9rem,3.6vw,3rem)] font-bold uppercase leading-none tracking-wide">
              {sel.position}. {team.name}
            </h1>
            <span className="lp-cond flex flex-col items-center rounded bg-black px-2 py-0.5 text-center leading-none">
              <span className="num text-lg font-bold">{sel.points}</span>
              <span className="text-[10px] font-semibold tracking-wider">PTS</span>
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-[0.95rem] text-white/90">
            {pair.map((d, i) => (
              <button key={d.number} onClick={() => setPick(i)} className="underline-offset-4 hover:underline" aria-pressed={pick === i} title={`Show car #${d.number}`}>
                <span className={pick === i ? "font-semibold" : ""}>
                  {d.firstName} {d.lastName}
                </span>
                <span className="num ml-1.5 text-xs text-white/70">#{d.number}</span>
              </button>
            ))}
            <span className="text-xs text-white/70">{team.chassis} · {team.powerUnit}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link to={`/teams/${team.id}`} className="lp-cond inline-flex items-center gap-2 rounded-full bg-black px-5 py-1.5 text-base font-semibold uppercase tracking-wide transition-transform hover:scale-[1.03]">
              Team profile <Icon name="chevron" size={14} />
            </Link>
            <Link to="/championship" className="lp-cond text-base font-semibold uppercase tracking-wide underline-offset-4 hover:underline">
              Full standings
            </Link>
            <span className="text-[11px] leading-tight text-white/80" role="status">
              {standingsNote(season)}
            </span>
          </div>
        </div>
      </section>

      <TeamStrip items={items} selected={team.id} onSelect={select} />
    </div>
  );
}
