import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ALERT_PREFS, type AlertPrefs, type AlertType } from "@f1/shared";

export type Theme = "graphite" | "dark" | "light" | "system";

export interface Settings {
  theme: Theme;
  units: "metric" | "imperial";
  /** How far behind the newest live sample the map runs, so it can interpolate instead of guess. */
  liveBufferMs: number;
  /** Lower map frame rate to save battery. */
  lowPower: boolean;
  /** Short vibration on phones when a car gains a place. */
  haptics: boolean;
  setHaptics(v: boolean): void;
  sidebarCollapsed: boolean;
  alerts: AlertPrefs;
  browserNotifications: boolean;
  /** OpenF1 links driver photos hosted by Formula 1; off by default because the app holds no licence for them. */
  showHeadshots: boolean;
  setShowHeadshots(v: boolean): void;
  setTheme(t: Theme): void;
  setUnits(u: Settings["units"]): void;
  setLiveBuffer(ms: number): void;
  setLowPower(v: boolean): void;
  toggleSidebar(): void;
  toggleAlert(t: AlertType): void;
  toggleFavouriteDriver(n: number): void;
  toggleFavouriteTeam(team: string): void;
  setBrowserNotifications(v: boolean): void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: "graphite",
      units: "metric",
      liveBufferMs: 3000,
      lowPower: false,
      haptics: true,
      setHaptics: (haptics) => set({ haptics }),
      sidebarCollapsed: false,
      alerts: DEFAULT_ALERT_PREFS,
      browserNotifications: false,
      showHeadshots: false,
      setShowHeadshots: (showHeadshots) => set({ showHeadshots }),
      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set({ units }),
      setLiveBuffer: (liveBufferMs) => set({ liveBufferMs }),
      setLowPower: (lowPower) => set({ lowPower }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleAlert: (t) => set((s) => ({ alerts: { ...s.alerts, enabled: { ...s.alerts.enabled, [t]: !s.alerts.enabled[t] } } })),
      toggleFavouriteDriver: (n) =>
        set((s) => {
          const f = s.alerts.favouriteDrivers;
          return { alerts: { ...s.alerts, favouriteDrivers: f.includes(n) ? f.filter((x) => x !== n) : [...f, n] } };
        }),
      toggleFavouriteTeam: (team) =>
        set((s) => {
          const f = s.alerts.favouriteTeams;
          return { alerts: { ...s.alerts, favouriteTeams: f.includes(team) ? f.filter((x) => x !== team) : [...f, team] } };
        }),
      setBrowserNotifications: (browserNotifications) => set({ browserNotifications }),
    }),
    {
      name: "f1-settings",
      // localStorage can be unavailable (private mode); zustand falls back to memory.
      version: 2,
      // v1 had a red theme that no longer exists.
      migrate: (persisted) => {
        const s = persisted as Partial<Settings>;
        return ((s.theme as string) === "red" ? { ...s, theme: "graphite" } : s) as Settings;
      },
    },
  ),
);

export function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
}
