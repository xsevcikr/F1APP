import { lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { SessionInfo } from "@f1/shared";
import { api } from "./api";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { AlertsWatcher } from "./components/Alerts";
import { useServerLink } from "./hooks/live";
import { LiveRace } from "./pages/LiveRace";
import { Overview } from "./pages/Overview";
import { RaceControlPage } from "./pages/RaceControl";
import { useSession } from "./store/session";
import { applyTheme, useSettings } from "./store/settings";

const LiveTiming = lazy(() => import("./pages/LiveTiming").then((m) => ({ default: m.LiveTiming })));
const Battles = lazy(() => import("./pages/Battles").then((m) => ({ default: m.Battles })));
const Calendar = lazy(() => import("./pages/Calendar").then((m) => ({ default: m.Calendar })));
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const DriversTeams = lazy(() => import("./pages/DriversTeams").then((m) => ({ default: m.DriversTeams })));
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
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/live" element={<LiveRace />} />
            <Route path="/timing" element={<LiveTiming />} />
            <Route path="/battles" element={<Battles />} />
            <Route path="/race-control" element={<RaceControlPage />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/history" element={<History />} />
            <Route path="/drivers" element={<DriversTeams />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<p className="p-6 text-muted">Page not found.</p>} />
          </Routes>
        </Suspense>
      </Layout>
      <AlertsWatcher />
    </Router>
  );
}
