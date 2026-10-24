import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SessionTimeline, type LapRecord } from "@f1/shared";
import { T0, driver, emptyCore, rc } from "../../shared/test/fixtures";

vi.mock("../src/api", () => ({ api: { sessions: async () => [], schedule: async () => [], results: async () => null } }));

import { LiveStandings } from "../src/pages/LiveStandings";
import { useSession } from "../src/store/session";
import { clearAsyncCache } from "../src/hooks/useAsync";

const lap = (d: number, n: number, duration: number, s: [number, number, number]): LapRecord => ({
  driver: d, lap: n, start: T0 + n * 90_000, duration, s1: s[0], s2: s[1], s3: s[2], i1Speed: null, i2Speed: null, stSpeed: null, pitOutLap: false, segments: [null, null, null],
});

function timeline(results = false) {
  const core = emptyCore({
    drivers: [driver(1, "AAA", "Red"), driver(2, "BBB", "Blue"), driver(3, "CCC", "Green")],
    positions: [
      { driver: 2, ts: T0, position: 1 }, { driver: 1, ts: T0, position: 2 }, { driver: 3, ts: T0, position: 3 },
    ],
    laps: [
      lap(1, 1, 90.5, [30.1, 30.2, 30.2]), lap(1, 2, 90.0, [30.0, 30.0, 30.0]),
      lap(2, 1, 91.0, [30.5, 30.3, 30.2]),
      lap(3, 1, 92.0, [30.9, 30.6, 30.5]),
    ],
    raceControl: [rc(T0 + 1000, "CAR 3 (CCC) TIME 5 SECOND TIME PENALTY - SPEEDING IN THE PIT LANE", { driver: 3 }), rc(T0 + 2000, "TURN 4 INCIDENT INVOLVING CAR 2 (BBB) NOTED - TRACK LIMITS")],
    results: results ? [{ driver: 2, position: 1, laps: 2, dnf: false, dns: false, dsq: false, duration: null, gapToLeader: null }] : [],
  });
  core.session = { ...core.session, type: "Race", name: "Race", year: 2024 };
  return new SessionTimeline(core);
}

beforeEach(() => clearAsyncCache());
afterEach(cleanup);

function show(tl: SessionTimeline) {
  useSession.setState({ selectedDriver: null, phase: "ready", timeline: tl, sessionKey: tl.core.session.sessionKey, server: { now: Date.now(), live: { session: null, available: false, reason: null, connected: false, lastMessageAt: null, transport: "none" }, providers: [] } as never, serverError: null });
  return render(<MemoryRouter><LiveStandings /></MemoryRouter>);
}

const rowsOf = () => within(screen.getByRole("table", { name: "Standings" })).getAllByRole("row");
const tab = (name: string) => screen.getByRole("tab", { name });

describe("Live Standings", () => {
  it("lists every driver in session order and offers the five views", () => {
    show(timeline());
    expect(rowsOf().map((r) => r.textContent)).toEqual([expect.stringContaining("BBB"), expect.stringContaining("AAA"), expect.stringContaining("CCC")]);
    for (const v of ["Race order", "Gaps", "Sectors", "Tyres", "Speed"]) expect(tab(v)).toBeTruthy();
    fireEvent.click(tab("Gaps"));
    expect(rowsOf()[1].textContent).toContain("1:30.000");
  });

  it("does not need sideways scrolling: no fixed minimum width on the standings", () => {
    const { container } = show(timeline());
    expect(container.querySelector('[class*="min-w-[1"]')).toBeNull();
  });

  it("colours sectors: purple for the session best, green for a personal best, yellow otherwise", () => {
    show(timeline());
    fireEvent.click(tab("Sectors"));
    const sec = (row: HTMLElement) => [...row.querySelectorAll("span.num")].filter((s) => s.className.includes("w-[3.9rem]")).map((s) => ({ t: s.textContent, c: s.className }));
    // AAA lap 2: 30.000 x3 are the session's fastest sectors.
    expect(sec(rowsOf()[1]).length).toBe(3);
    expect(sec(rowsOf()[1]).every((s) => s.c.includes("text-best"))).toBe(true);
    // CCC has one lap, its personal best, but slower than the session best.
    expect(sec(rowsOf()[2]).every((s) => s.c.includes("text-ok"))).toBe(true);
  });

  it("labels the order provisional until a classification is published, and keeps points separate", () => {
    const { unmount } = show(timeline());
    expect(screen.getByText("Provisional order from timing")).toBeTruthy();
    fireEvent.click(screen.getByText("Data and session details"));
    expect(screen.getByText(/Championship points are a separate dataset/)).toBeTruthy();
    unmount();
    show(timeline(true));
    expect(screen.getByText("Official classification published")).toBeTruthy();
  });

  it("shows penalties and open investigations on the right driver once the row is opened", () => {
    show(timeline());
    fireEvent.click(rowsOf()[2].querySelector("button")!);
    expect(rowsOf()[2].textContent).toContain("PEN");
    fireEvent.click(rowsOf()[0].querySelector("button")!);
    expect(within(rowsOf()[0]).queryByText("INVESTIGATION")).toBeTruthy();
  });

  it("shows no speed when there is no car telemetry instead of inventing one", () => {
    show(timeline());
    expect((tab("Speed") as HTMLButtonElement).disabled).toBe(true);
    expect(rowsOf().every((r) => !/\d+ km\/h/.test(r.textContent ?? ""))).toBe(true);
    fireEvent.click(rowsOf()[0].querySelector("button")!);
    expect(screen.getByText(/No fresh car telemetry/)).toBeTruthy();
  });
});
