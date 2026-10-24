import { useState } from "react";
import { ChampionshipPanel } from "../components/Championship";
import { DriverPanel } from "../components/DriverPanel";
import { Leaderboard } from "../components/Leaderboard";
import { PlaybackBar } from "../components/PlaybackBar";
import { RaceControlFeed } from "../components/RaceControlFeed";
import { TrackMap } from "../components/TrackMap";
import { cx, Panel, Segmented } from "../components/ui";
import { SessionGate } from "../components/SessionGate";
import { useSnapshot } from "../hooks/live";
import { useSession } from "../store/session";

export function LiveRace() {
  return (
    <SessionGate>
      <LiveRaceInner />
    </SessionGate>
  );
}

function LiveRaceInner() {
  const snap = useSnapshot(4);
  const selected = useSession((s) => s.selectedDriver);
  const selectDriver = useSession((s) => s.selectDriver);
  const [mapMode, setMapMode] = useState<"expanded" | "compact">("expanded");

  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar />
      <div className={cx("grid gap-3", mapMode === "expanded" ? "xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.9fr)]" : "xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]")}>
        <Panel
          title="Circuit"
          subtitle="Click a car for details. Scroll or pinch to zoom, drag to pan."
          right={
            <Segmented
              size="xs"
              value={mapMode}
              onChange={setMapMode}
              options={[
                { value: "expanded", label: "Expanded" },
                { value: "compact", label: "Compact" },
              ]}
            />
          }
          bodyClass="p-2"
        >
          <TrackMap compact={mapMode === "compact"} className={mapMode === "expanded" ? "h-[52vh] min-h-[340px] xl:h-[calc(100vh-260px)]" : "h-[300px]"} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-3">
          {selected !== null && snap?.rows.some((r) => r.driver.number === selected) && (
            <div className="xl:hidden">
              <DriverPanel snap={snap} onClose={() => selectDriver(null)} />
            </div>
          )}
          <Panel title="Standings" subtitle="Updates as timing arrives. Click a driver for details." bodyClass="p-0">
            <Leaderboard snap={snap} />
          </Panel>
          <ChampionshipPanel snap={snap} />
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="Race control" subtitle="Official messages up to the moment shown" bodyClass="p-0 max-h-[360px] flex flex-col">
          <RaceControlFeed t={snap?.t ?? 0} compact limit={40} />
        </Panel>
        {selected !== null && snap?.rows.some((r) => r.driver.number === selected) ? (
          <div className="hidden max-h-[720px] xl:block">
            <DriverPanel snap={snap} onClose={() => selectDriver(null)} />
          </div>
        ) : (
          <Panel title="Driver details" className="hidden xl:flex">
            <p className="text-sm text-muted">Select a driver on the map or in the standings to see timing, tyres, pit stops and lap times.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
