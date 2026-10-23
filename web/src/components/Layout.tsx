import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSettings } from "../store/settings";
import { useSession } from "../store/session";
import { Icon } from "./Icon";
import { cx } from "./ui";
import { SessionHeader } from "./SessionHeader";

export const NAV = [
  { to: "/", label: "Home", short: "Home", icon: "star" },
  { to: "/overview", label: "Dashboard", short: "Dashboard", icon: "overview" },
  { to: "/live", label: "Live Race", short: "Race", icon: "live" },
  { to: "/timing", label: "Live Timing", short: "Timing", icon: "timing" },
  { to: "/battles", label: "Battles", short: "Battles", icon: "battles" },
  { to: "/race-control", label: "Race Control", short: "Control", icon: "flag" },
  { to: "/calendar", label: "Calendar", short: "Calendar", icon: "calendar" },
  { to: "/archive", label: "Past weekends", short: "Archive", icon: "history" },
  { to: "/history", label: "History", short: "History", icon: "history" },
  { to: "/standings", label: "Standings", short: "Standings", icon: "timing" },
  { to: "/teams", label: "Teams", short: "Teams", icon: "battles" },
  { to: "/drivers", label: "Drivers", short: "Drivers", icon: "drivers" },
  { to: "/settings", label: "Settings", short: "Settings", icon: "settings" },
] as const;

const MOBILE_PRIMARY = ["/", "/live", "/timing", "/race-control"];


function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-4">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="rgb(var(--raised))" />
        <path d="M6 21 L14 11 H26 L24 14 H16 L11 21Z" fill="rgb(var(--accent))" />
        <path d="M13 21 L17 16 H24 L22.5 18 H18 L16 21Z" fill="rgb(var(--fg))" opacity="0.85" />
      </svg>
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-black uppercase tracking-[0.16em]">Control Room</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">F1 telemetry</div>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const toggle = useSettings((s) => s.toggleSidebar);
  const demo = useSession((s) => s.server?.mode === "demo");
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={cx("hidden shrink-0 flex-col border-r hairline bg-surface/80 backdrop-blur md:flex", collapsed ? "w-[68px]" : "w-[220px]")}>
        <Brand collapsed={collapsed} />
        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                cx(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent/10 text-fg" : "text-muted hover:bg-raised hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent shadow-glow" />}
                  <Icon name={n.icon} className={isActive ? "text-accent" : ""} />
                  {!collapsed && <span>{n.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <button onClick={toggle} className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted hover:bg-raised hover:text-fg" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <Icon name="sidebar" size={16} />
          {!collapsed && "Collapse"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {demo && (
          <div className="flex items-center justify-center gap-2 bg-best/15 px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-best" role="note">
            Simulated demo mode — the live session, timing and map are generated (fictional drivers and circuit). Team, driver and standings pages show the real 2026 entry list.
          </div>
        )}
        <SessionHeader />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-3 md:px-5 md:pb-6">
          <div key={loc.pathname} className="page-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t hairline bg-surface/95 backdrop-blur md:hidden" aria-label="Main">
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", isActive ? "text-accent" : "text-muted")}>
            <Icon name={n.icon} size={20} />
            {n.short}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", !MOBILE_PRIMARY.includes(loc.pathname) ? "text-accent" : "text-muted")}>
          <Icon name="menu" size={20} />
          More
        </button>
      </nav>
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t hairline bg-panel p-3" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setMoreOpen(false)} className={({ isActive }) => cx("flex flex-col items-center gap-1 rounded-xl p-3 text-xs", isActive ? "bg-accent/10 text-accent" : "bg-raised text-muted")}>
                  <Icon name={n.icon} size={22} />
                  {n.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
