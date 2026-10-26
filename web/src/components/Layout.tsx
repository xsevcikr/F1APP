import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSettings } from "../store/settings";
import { useSession } from "../store/session";
import { Icon } from "./Icon";
import { cx } from "./ui";
import { SessionHeader } from "./SessionHeader";

export const NAV = [
  { to: "/", label: "Home", short: "Home", icon: "home" },
  { to: "/race", label: "Race Centre", short: "Race", icon: "overview" },
  { to: "/live-standings", label: "Live Standings", short: "Standings", icon: "timing" },
  { to: "/live", label: "Circuit Map", short: "Map", icon: "live" },
  { to: "/timing", label: "Live Timing", short: "Timing", icon: "timing" },
  { to: "/battles", label: "Battles", short: "Battles", icon: "battles" },
  { to: "/race-control", label: "Race Control", short: "Control", icon: "flag" },
  { to: "/calendar", label: "Calendar", short: "Calendar", icon: "calendar" },
  { to: "/races", label: "Historical Races", short: "Races", icon: "history" },
  { to: "/championship", label: "Championship Standings", short: "Champ.", icon: "trophy" },
  { to: "/recaps", label: "Race Recaps", short: "Recaps", icon: "play" },
  { to: "/teams", label: "Teams", short: "Teams", icon: "battles" },
  { to: "/drivers", label: "Drivers", short: "Drivers", icon: "drivers" },
  { to: "/settings", label: "Settings", short: "Settings", icon: "settings" },
] as const;

const MOBILE_PRIMARY = ["/", "/race", "/live-standings", "/races"];
/** Pages about a loaded session keep the session bar; the others bring their own header. */
const SESSION_BAR = ["/live-standings", "/live", "/timing", "/battles", "/race-control"];


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
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="isolate flex h-full">
      <div className="ambient" aria-hidden="true" />
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
        {SESSION_BAR.includes(loc.pathname) && <SessionHeader />}
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6 md:pb-8 md:pt-4">
          <div key={loc.pathname} className="page-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t hairline bg-bg/65 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl backdrop-saturate-150 md:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => cx("relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors", isActive ? "text-fg" : "text-faint")}>
              {({ isActive }) => (
                <>
                  <span className={cx("absolute top-0 h-[2px] w-8 rounded-full bg-accent transition-opacity", isActive ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <Icon name={n.icon} size={21} className={isActive ? "text-accent" : ""} />
                  {n.short}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className={cx("relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors", !MOBILE_PRIMARY.includes(loc.pathname) ? "text-fg" : "text-faint")} aria-haspopup="dialog">
            <span className={cx("absolute top-0 h-[2px] w-8 rounded-full bg-accent transition-opacity", !MOBILE_PRIMARY.includes(loc.pathname) ? "opacity-100" : "opacity-0")} aria-hidden="true" />
            <Icon name="menu" size={21} className={!MOBILE_PRIMARY.includes(loc.pathname) ? "text-accent" : ""} />
            More
          </button>
        </div>
      </nav>
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t hairline bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" role="dialog" aria-label="All pages" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-fg/15" aria-hidden="true" />
            <div className="grid grid-cols-3 gap-2">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setMoreOpen(false)} className={({ isActive }) => cx("flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-[11px] leading-tight", isActive ? "bg-accent/15 text-fg ring-1 ring-accent/40" : "bg-fg/[0.04] text-muted")}>
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
