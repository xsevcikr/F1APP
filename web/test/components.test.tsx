import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReplayClock, SessionTimeline, type SessionCore } from "@f1/shared";
import { PlaybackBar } from "../src/components/PlaybackBar";
import { Leaderboard } from "../src/components/Leaderboard";
import { QualityBadge } from "../src/components/ui";
import { useSession } from "../src/store/session";

const T0 = Date.parse("2024-05-26T13:00:00Z");

function core(): SessionCore {
  const none = { available: true };
  const driver = (number: number, code: string, team: string) => ({ number, code, firstName: code, lastName: code, fullName: code, broadcastName: code, team, teamColour: "#ff0000", headshotUrl: null });
  const lap = (d: number, n: number, start: number) => ({ driver: d, lap: n, start, duration: 90, s1: 30, s2: 30, s3: 30, i1Speed: null, i2Speed: null, stSpeed: null, pitOutLap: false, segments: [null, null, null] as [null, null, null] });
  return {
    session: { sessionKey: 1, meetingKey: 1, name: "Race", type: "Race", year: 2024, circuitKey: 1, circuitShortName: "T", location: "T", countryName: "T", countryCode: "T", start: T0, end: T0 + 600_000, gmtOffset: "+00:00", cancelled: false, provider: "openf1" },
    meeting: null,
    drivers: [driver(1, "AAA", "Red"), driver(2, "BBB", "Blue")],
    laps: [lap(1, 1, T0), lap(1, 2, T0 + 90_000), lap(2, 1, T0), lap(2, 2, T0 + 91_000)],
    stints: [{ driver: 1, stint: 1, compound: "SOFT", lapStart: 1, lapEnd: null, tyreAgeAtStart: 0 }],
    pits: [],
    positions: [{ driver: 1, ts: T0, position: 1 }, { driver: 2, ts: T0, position: 2 }],
    intervals: [],
    raceControl: [{ id: "a", ts: T0 + 60_000, category: "SafetyCar", flag: null, message: "SAFETY CAR DEPLOYED", scope: null, sector: null, driver: null, lap: 1, qualifyingPhase: null }],
    weather: [],
    overtakes: [],
    results: [],
    grid: [],
    channels: Object.fromEntries(["location", "carData", "intervals", "positions", "laps", "stints", "pits", "raceControl", "weather", "overtakes", "results", "grid", "energy", "overtakeMode"].map((k) => [k, none])) as SessionCore["channels"],
    quality: "HISTORICAL",
    fetchedAt: T0,
  };
}

beforeEach(() => {
  const tl = new SessionTimeline(core());
  const clock = new ReplayClock(T0, T0 + 600_000, Date.now(), { t: T0 });
  useSession.setState({ timeline: tl, clock, phase: "ready", sessionKey: 1, server: null, ensureWindows: () => undefined });
});
afterEach(cleanup);

describe("PlaybackBar", () => {
  it("plays, pauses and changes speed", () => {
    render(<PlaybackBar />);
    const clock = useSession.getState().clock!;
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(clock.tick(Date.now()).playing).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "5×" }));
    expect(clock.tick(Date.now()).speed).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(clock.tick(Date.now()).playing).toBe(false);
  });

  it("jumps to the next race-control event and to a lap", () => {
    render(<PlaybackBar />);
    const clock = useSession.getState().clock!;
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(clock.tick(Date.now()).t).toBe(T0 + 60_000);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(clock.tick(Date.now()).t).toBe(T0 + 90_000);
  });

  it("steps with the keyboard", () => {
    render(<PlaybackBar />);
    const clock = useSession.getState().clock!;
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(clock.tick(Date.now()).t).toBe(T0 + 10_000);
  });

  it("offers Go live only for the live session", () => {
    render(<PlaybackBar />);
    expect(screen.queryByText("Go live")).toBeNull();
  });
});

describe("Leaderboard", () => {
  it("renders rows in position order and selects a driver", () => {
    const tl = useSession.getState().timeline!;
    render(
      <MemoryRouter>
        <Leaderboard snap={tl.snapshotAt(T0 + 100_000)} />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows[0].textContent).toContain("AAA");
    act(() => {
      fireEvent.click(rows[1]);
    });
    expect(useSession.getState().selectedDriver).toBe(2);
  });

  it("filters by tyre compound", () => {
    const tl = useSession.getState().timeline!;
    render(<Leaderboard snap={tl.snapshotAt(T0 + 100_000)} />);
    fireEvent.change(screen.getByLabelText("Filter by tyre"), { target: { value: "SOFT" } });
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });
});

describe("QualityBadge", () => {
  it("explains each state", () => {
    render(<QualityBadge quality="SIMULATED" />);
    expect(screen.getByText("SIMULATED").getAttribute("title")).toMatch(/demonstration/);
  });
});
