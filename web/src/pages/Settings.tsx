import { formatAge, QUALITY_HELP, type AlertType, type Quality } from "@f1/shared";
import { Icon } from "../components/Icon";
import { cx, Panel, QualityBadge, Segmented } from "../components/ui";
import { useNow } from "../hooks/live";
import { useSession } from "../store/session";
import { useSettings, type Theme } from "../store/settings";

const ALERTS: { type: AlertType; label: string; note?: string }[] = [
  { type: "overtake", label: "Overtakes", note: "Confirmed or likely on-track passes" },
  { type: "position", label: "Other position changes", note: "Pit cycles and changes under neutralization" },
  { type: "pit", label: "Pit stops" },
  { type: "safety-car", label: "Safety Car" },
  { type: "vsc", label: "Virtual Safety Car" },
  { type: "red-flag", label: "Red flags" },
  { type: "penalty", label: "Penalties" },
  { type: "personal-best", label: "Personal best laps" },
  { type: "championship", label: "Championship position changes", note: "Not available: live projected standings are not published by the data source" },
];

export function Settings() {
  const s = useSettings();
  const server = useSession((st) => st.server);
  const serverError = useSession((st) => st.serverError);
  const timeline = useSession((st) => st.timeline);
  const now = useNow(5000);
  const drivers = timeline?.driverList() ?? [];
  const teams = [...new Set(drivers.map((d) => d.team))].sort();

  const enableBrowser = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
    }
    s.setBrowserNotifications(!s.browserNotifications);
  };

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Panel title="Appearance and units">
        <div className="space-y-4">
          <Row label="Theme">
            <Segmented<Theme> value={s.theme} onChange={s.setTheme} options={[{ value: "red", label: "Red" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "System" }]} />
          </Row>
          <Row label="Units">
            <Segmented value={s.units} onChange={s.setUnits} options={[{ value: "metric", label: "km/h · °C" }, { value: "imperial", label: "mph · °F" }]} />
          </Row>
          <Row label="Driver photos" note="OpenF1 links photos hosted by Formula 1. This app has no licence for them, so they are off unless you choose to show them for personal use.">
            <Toggle on={s.showHeadshots} onChange={() => s.setShowHeadshots(!s.showHeadshots)} />
          </Row>
        </div>
      </Panel>

      <Panel title="Refresh behaviour">
        <div className="space-y-4">
          <Row label="Live map delay" note="The map runs this far behind the newest position sample so it can interpolate between real samples instead of guessing ahead.">
            <Segmented value={s.liveBufferMs} onChange={s.setLiveBuffer} options={[1500, 3000, 5000, 8000].map((v) => ({ value: v, label: `${v / 1000} s` }))} />
          </Row>
          <Row label="Battery saver" note="Draws the map at 15 frames per second.">
            <Toggle on={s.lowPower} onChange={() => s.setLowPower(!s.lowPower)} />
          </Row>
        </div>
      </Panel>

      <Panel title="Favourites" subtitle={timeline ? `Drivers in ${timeline.core.meeting?.name ?? "the selected session"}` : "Select a session to choose drivers"}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {drivers.map((d) => {
              const on = s.alerts.favouriteDrivers.includes(d.number);
              return (
                <button key={d.number} onClick={() => s.toggleFavouriteDriver(d.number)} aria-pressed={on} className={cx("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ring-1", on ? "bg-warn/15 text-warn ring-warn/40" : "text-muted ring-line/10 hover:text-fg")}>
                  <span className="h-3 w-1 rounded-full" style={{ background: d.teamColour ?? "#888" }} />
                  {d.code}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => {
              const on = s.alerts.favouriteTeams.includes(t);
              return (
                <button key={t} onClick={() => s.toggleFavouriteTeam(t)} aria-pressed={on} className={cx("rounded-lg px-2 py-1 text-xs ring-1", on ? "bg-warn/15 text-warn ring-warn/40" : "text-muted ring-line/10 hover:text-fg")}>
                  {t}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted">With favourites set, driver alerts only fire for them. Safety Car, VSC and red-flag alerts always fire when enabled.</p>
        </div>
      </Panel>

      <Panel title="Notifications" subtitle="Alerts fire only while you follow a live session, and each event alerts once.">
        <div className="space-y-2">
          {ALERTS.map((a) => (
            <Row key={a.type} label={a.label} note={a.note}>
              <Toggle on={s.alerts.enabled[a.type]} onChange={() => s.toggleAlert(a.type)} disabled={a.type === "championship"} />
            </Row>
          ))}
          <div className="border-t hairline pt-3">
            <Row label="Browser notifications" note={"Notification" in window ? `Permission: ${Notification.permission}` : "Not supported in this browser"}>
              <Toggle on={s.browserNotifications} onChange={enableBrowser} />
            </Row>
          </div>
        </div>
      </Panel>

      <Panel title="Data sources" className="xl:col-span-2">
        <div className="space-y-4 text-sm">
          {serverError && <p className="text-danger">App server unreachable: {serverError}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {server?.providers.map((p) => (
              <div key={p.id} className="rounded-lg border hairline p-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold uppercase tracking-wide">{p.id === "openf1" ? "OpenF1" : p.id === "jolpica" ? "Jolpica F1" : "Demo (simulated)"}</span>
                  <span className={cx("chip", p.ok ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger")}>{p.ok ? "OK" : "Error"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p.id === "openf1" && (p.authenticated ? "Sponsor credentials configured on the server: live data enabled." : "Free tier: historical data only. Live timing needs an OpenF1 Sponsor account configured on the server.")}
                  {p.id === "jolpica" && "Results, standings and schedules from 1950. Non-commercial use, 500 requests per hour."}
                  {p.id === "demo" && "Generated data for trying the interface offline."}
                </p>
                <p className="mt-1 text-[11px] text-faint">
                  Last success: {p.lastSuccess ? formatAge(now - p.lastSuccess) : "never"}
                  {p.lastError && <span className="text-danger"> · {p.lastError}</span>}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border hairline p-3">
            <div className="label mb-1">Live link</div>
            <p className="text-xs text-muted">
              {server?.live.session ? `${server.live.session.location} ${server.live.session.name}: ` : ""}
              {server?.live.connected ? `connected via ${server.live.transport}` : server?.live.reason ?? "unknown"}
            </p>
          </div>
          <div>
            <div className="label mb-2">Data-quality labels</div>
            <ul className="grid gap-2 md:grid-cols-2">
              {(["LIVE", "DELAYED", "HISTORICAL", "SIMULATED", "UNAVAILABLE"] as Quality[]).map((q) => (
                <li key={q} className="flex items-start gap-2 text-xs">
                  <QualityBadge quality={q} />
                  <span className="text-muted">{QUALITY_HELP[q]}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            Unofficial app. OpenF1 and Jolpica are community projects not affiliated with Formula 1, the FIA or FOM. Data is licensed CC BY-NC-SA 4.0 for non-commercial use.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {note && <div className="text-[11px] leading-snug text-muted">{note}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={onChange} className={cx("relative h-6 w-11 rounded-full transition-colors", on ? "bg-accent" : "bg-raised ring-1 ring-line/10", disabled && "opacity-40")}>
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}
