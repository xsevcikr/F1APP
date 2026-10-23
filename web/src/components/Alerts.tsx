import { useEffect, useRef, useState } from "react";
import { collectAlerts, detectPositionChanges, selectAlerts, type Alert } from "@f1/shared";
import { useSession } from "../store/session";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";

const SEEN_KEY = "f1-alerts-seen";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-2000)));
  } catch {
    /* storage unavailable: alerts still dedupe for this tab */
  }
}

/**
 * Raises alerts for events that happen while you follow a live session.
 * Opening or replaying an old session never triggers alerts, and every event
 * alerts at most once (ids are remembered across reloads).
 */
export function AlertsWatcher() {
  const [toasts, setToasts] = useState<Alert[]>([]);
  const seen = useRef(loadSeen());
  const since = useRef<{ key: number | null; at: number }>({ key: null, at: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const s = useSession.getState();
      const tl = s.timeline;
      const clock = s.clock?.tick(Date.now());
      if (!tl || !clock?.followLive) return;
      if (since.current.key !== tl.core.session.sessionKey) {
        since.current = { key: tl.core.session.sessionKey, at: tl.latestTs };
        return;
      }
      const prefs = useSettings.getState().alerts;
      const from = since.current.at;
      const all = tl.driverList().map((d) => d.number);
      const changes = detectPositionChanges({
        positions: all.flatMap((n) => tl.positionsOf(n)),
        pits: all.flatMap((n) => tl.pitsOf(n)),
        raceControl: tl.raceControl,
        sourceOvertakes: tl.core.overtakes,
        from,
      });
      const personalBests = tl.snapshotAt(clock.t).rows.flatMap((r) => {
        if (!r.newPersonalBest || !r.lastLap?.start) return [];
        const l = r.lastLap;
        return [{ driver: r.driver.number, lap: l.lap, ts: l.start! + (l.duration ?? 0) * 1000, time: l.duration ?? 0 }];
      });
      const alerts = collectAlerts({
        changes,
        pits: all.flatMap((n) => tl.pitsOf(n)).filter((p) => p.ts > from),
        raceControl: tl.raceControl.filter((r) => r.ts > from),
        personalBests: personalBests.filter((p) => p.ts > from),
        teamOf: (n) => tl.drivers.get(n)?.team,
        nameOf: (n) => tl.drivers.get(n)?.code ?? String(n),
      });
      const fresh = selectAlerts(alerts, prefs, seen.current, (n) => tl.drivers.get(n)?.team);
      if (!fresh.length) return;
      saveSeen(seen.current);
      setToasts((t) => [...t, ...fresh].slice(-4));
      if (useSettings.getState().browserNotifications && "Notification" in window && Notification.permission === "granted") {
        for (const a of fresh.slice(-3)) new Notification(a.title, { body: a.body, tag: a.id });
      }
      for (const a of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), 8000);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-50 flex w-80 flex-col gap-2 md:bottom-4" aria-live="polite">
      {toasts.map((a) => (
        <div key={a.id} className="panel pointer-events-auto flex gap-2 bg-panel p-3 shadow-xl">
          <Icon name="bell" size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{a.title}</div>
            {a.body && <div className="line-clamp-2 text-xs text-muted">{a.body}</div>}
          </div>
          <button className="text-muted hover:text-fg" onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
