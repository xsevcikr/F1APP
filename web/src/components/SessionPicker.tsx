import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inLiveWindow, type SessionInfo } from "@f1/shared";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { useSession } from "../store/session";
import { Icon } from "./Icon";
import { cx, ErrorState, Loading } from "./ui";

/** OpenF1 has data from 2023. */
export const FIRST_OPENF1_YEAR = 2023;

export function SessionPicker({ onClose }: { onClose: () => void }) {
  const current = new Date().getUTCFullYear();
  const sessionKey = useSession((s) => s.sessionKey);
  const load = useSession((s) => s.load);
  const nav = useNavigate();
  const [year, setYear] = useState(current);
  const sessions = useAsync(`sessions:${year}`, () => api.sessions(year));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meetings = useMemo(() => {
    const m = new Map<number, SessionInfo[]>();
    for (const s of sessions.data ?? []) m.set(s.meetingKey, [...(m.get(s.meetingKey) ?? []), s]);
    return [...m.values()].reverse();
  }, [sessions.data]);

  const now = Date.now();
  const pick = (s: SessionInfo) => {
    void load(s.sessionKey);
    onClose();
    nav("/live");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Select session" className="panel flex max-h-[80vh] w-full max-w-3xl flex-col bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b hairline px-4 py-3">
          <div className="font-display text-sm font-bold uppercase tracking-[0.14em]">Select session</div>
          <div className="flex items-center gap-2">
            {(
              <select className="input py-1" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Season">
                {Array.from({ length: current - FIRST_OPENF1_YEAR + 1 }, (_, i) => current - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <button className="btn px-2" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {(
            <p className="mb-3 text-xs text-muted">
              Timing, positions and telemetry come from OpenF1, which covers {FIRST_OPENF1_YEAR} onward. For earlier seasons, use History for archived results.
            </p>
          )}
          {sessions.loading && !sessions.data && <Loading label="Loading sessions" />}
          {sessions.error && <ErrorState message={sessions.error.message} onRetry={sessions.reload} />}
          {sessions.data && sessions.data.length === 0 && <p className="p-4 text-sm text-muted">No sessions published for {year}.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {meetings.map((list) => (
              <div key={list[0].meetingKey} className="rounded-xl border hairline bg-raised/40 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="truncate font-display font-bold uppercase tracking-wide">{list[0].location}</div>
                  <div className="text-[11px] text-muted">{new Date(list[0].start).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => {
                    const future = s.start > now + 30 * 60_000;
                    const live = inLiveWindow(s, now);
                    return (
                      <button
                        key={s.sessionKey}
                        disabled={future || s.cancelled}
                        onClick={() => pick(s)}
                        title={future ? "Not started yet" : s.cancelled ? "Cancelled" : undefined}
                        className={cx(
                          "rounded-md px-2 py-1 text-xs font-medium ring-1 transition-colors",
                          s.sessionKey === sessionKey ? "bg-accent text-white ring-accent" : "bg-panel ring-line/10 hover:ring-accent/50",
                          (future || s.cancelled) && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse2 rounded-full bg-accent align-middle" />}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
