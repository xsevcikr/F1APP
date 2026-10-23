import { lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { SessionInfo } from "@f1/shared";
import { api } from "./api";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { AlertsWatcher } from "./components/Alerts";
import { useServerLink } from "./hooks/live";
import { LiveRace } from "./pages/LiveRace";
import { Landing } from "./pages/Landing";
import { RaceControlPage } from "./pages/RaceControl";
import { useSession } from "./store/session";
import { applyTheme, useSettings } from "./store/settings";

const LiveTiming = lazy(() => import("./pages/LiveTiming").then((m) => ({ default: m.LiveTiming })));
const Battles = lazy(() => import("./pages/Battles").then((m) => ({ default: m.Battles })));
const Calendar = lazy(() => import("./pages/Calendar").then((m) => ({ default: m.Calendar })));
const RaceCentre = lazy(() => import("./pages/RaceCentre").then((m) => ({ default: m.RaceCentre })));
const LiveStandings = lazy(() => import("./pages/LiveStandings").then((m) => ({ default: m.LiveStandings })));
const Races = lazy(() => import("./pages/Races").then((m) => ({ default: m.Races })));
const RaceDetail = lazy(() => import("./pages/RaceDetail").then((m) => ({ default: m.RaceDetail })));
const Recaps = lazy(() => import("./pages/Recaps").then((m) => ({ default: m.Recaps })));
const DriversTeams = lazy(() => import("./pages/DriversTeams").then((m) => ({ default: m.DriversTeams })));
const TeamsDirectory = lazy(() => import("./pages/Teams").then((m) => ({ default: m.TeamsDirectory })));
const TeamProfile = lazy(() => import("./pages/Teams").then((m) => ({ default: m.TeamProfile })));
const DriversDirectory = lazy(() => import("./pages/Drivers").then((m) => ({ default: m.DriversDirectory })));
const DriverProfile = lazy(() => import("./pages/Drivers").then((m) => ({ default: m.DriverProfile })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));

/** Picks a sensible session on first load: the live one, else the most recent finished one. */
export function pickDefaultSession(sessions: SessionInfo[], now: number): SessionInfo | null {
  const done = sessions.filter((s) => !s.cancelled && s.start < now).sort((a, b) => b.start - a.start);
  const latestMeeting = done[0]?.meetingKey;
  const sameMeeting = done.filter((s) => s.meetingKey === latestMeeting);
  return sameMeeting.find((s) => s.type === "Race") ?? sameMeeting[0] ?? null;
}

function useDefaultSession() {
  const server = useSession((s) => s.server);
  const sessionKey = useSession((s) => s.sessionKey);
  const load = useSession((s) => s.load);
  const tried = useRef(false);
  useEffect(() => {
    if (!server || sessionKey !== null || tried.current) return;
    tried.current = true;
    if (server.live.session) {
      void load(server.live.session.sessionKey);
      return;
    }
    const year = new Date().getUTCFullYear();
    (async () => {
      for (const y of [year, year - 1]) {
        try {
          const s = pickDefaultSession(await api.sessions(y), Date.now());
          if (s) return void load(s.sessionKey);
        } catch {
          /* fall through to the previous season; the header shows the error state */
        }
      }
    })();
  }, [server, sessionKey, load]);
}

export function App({ Router = BrowserRouter }: { Router?: ComponentType<{ children?: ReactNode }> }) {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  useServerLink();
  useDefaultSession();

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="*"
          element={
            <Layout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/race" element={<RaceCentre />} />
                  <Route path="/live-standings" element={<LiveStandings />} />
                  <Route path="/live" element={<LiveRace />} />
                  <Route path="/timing" element={<LiveTiming />} />
                  <Route path="/battles" element={<Battles />} />
                  <Route path="/race-control" element={<RaceControlPage />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/races" element={<Races />} />
                  <Route path="/races/:season/:round" element={<RaceDetail />} />
                  <Route path="/recaps" element={<Recaps />} />
                  <Route path="/championship" element={<DriversTeams />} />
                  <Route path="/overview" element={<Navigate to="/race" replace />} />
                  <Route path="/history" element={<Navigate to="/races" replace />} />
                  <Route path="/archive" element={<Navigate to="/races" replace />} />
                  <Route path="/standings" element={<Navigate to="/championship" replace />} />
                  <Route path="/teams" element={<TeamsDirectory />} />
                  <Route path="/teams/:id" element={<TeamProfile />} />
                  <Route path="/drivers" element={<DriversDirectory />} />
                  <Route path="/drivers/:number" element={<DriverProfile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<p className="p-6 text-muted">Page not found.</p>} />
                </Routes>
              </Suspense>
            </Layout>
          }
        />
      </Routes>
      <AlertsWatcher />
    </Router>
  );
}
