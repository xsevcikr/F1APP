import { useState } from "react";
import { formatCountdown } from "@f1/shared";
import { api } from "../api";
import { CircuitInfo } from "../components/CircuitInfo";
import { Icon } from "../components/Icon";
import { cx, ErrorState, Loading, Panel } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useNow } from "../hooks/live";
import { useSession } from "../store/session";

export function Calendar() {
  const demo = useSession((s) => s.server?.mode === "demo");
  const current = new Date().getUTCFullYear();
  const [season, setSeason] = useState(current);
  const schedule = useAsync(demo ? null : `schedule:${season === current ? "current" : season}`, () => api.schedule(season === current ? "current" : season));
  const now = useNow(1000);
  const [open, setOpen] = useState<number | null>(null);

  if (demo) return <Panel title="Calendar"><p className="text-sm text-muted">The calendar comes from the Jolpica archive, which is not used in demo mode.</p></Panel>;
  const races = schedule.data ?? [];
  const nextIdx = races.findIndex((r) => (r.raceStart ?? Date.parse(r.raceDate)) + 3 * 3600_000 > now);

  return (
    <Panel
      title={`${season} calendar`}
      subtitle="Schedule from the Jolpica archive. Times shown in your time zone."
      right={
        <select className="input py-1 text-xs" value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">
          {Array.from({ length: 8 }, (_, i) => current - i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      }
      bodyClass="p-0"
    >
      {schedule.loading && !schedule.data && <Loading />}
      {schedule.error && (
        <div className="p-4">
          <ErrorState message={schedule.error.message} onRetry={schedule.reload} />
        </div>
      )}
      <ol className="divide-hairline">
        {races.map((r, i) => {
          const raceTs = r.raceStart ?? Date.parse(r.raceDate);
          const done = i < nextIdx || nextIdx < 0;
          const next = i === nextIdx;
          const sprint = r.sessions.some((s) => s.kind === "Sprint");
          const isOpen = open === r.round;
          return (
            <li key={r.round} className={cx(next && "bg-accent/5")}>
              <button className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-raised/50" onClick={() => setOpen(isOpen ? null : r.round)} aria-expanded={isOpen}>
                <span className={cx("num w-8 font-display text-lg font-black", done ? "text-faint" : "text-fg")}>{String(r.round).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cx("truncate font-display font-bold uppercase tracking-wide", done && "text-muted")}>{r.name}</span>
                    {sprint && <span className="chip bg-info/15 text-info">Sprint</span>}
                    {next && <span className="chip bg-accent text-white">Next</span>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {r.circuit.name} · {r.circuit.locality}, {r.circuit.country}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="num text-sm">{new Date(raceTs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                  <div className="num text-[11px] text-muted">{next ? `in ${formatCountdown(raceTs - now)}` : done ? "Completed" : new Date(raceTs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <Icon name="chevronDown" size={16} className={cx("text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t hairline bg-surface/50 p-4">
                  <CircuitInfo race={r} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
