import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), schedule: vi.fn(), results: vi.fn() }));
vi.mock("../src/api", () => ({ api: { sessions: mocks.sessions, schedule: mocks.schedule, results: mocks.results } }));

import { RaceCentre } from "../src/pages/RaceCentre";
import { RaceRecaps } from "../src/components/Recaps";
import { NAV } from "../src/components/Layout";
import { RECAPS } from "../src/data/recaps";
import { useSession } from "../src/store/session";
import { clearAsyncCache } from "../src/hooks/useAsync";

const status = (live: object | null, reason: string | null) => ({
  now: Date.now(),
  live: { session: live, available: !!live, reason, connected: !!live, lastMessageAt: null, transport: "none" },
  providers: [{ id: "openf1", ok: true, lastSuccess: Date.now(), lastError: null, authenticated: false }],
});

beforeEach(() => {
  clearAsyncCache();
  mocks.sessions.mockReset().mockResolvedValue([]);
  mocks.schedule.mockReset().mockResolvedValue([]);
  mocks.results.mockReset().mockResolvedValue(null);
  useSession.setState({ server: null, serverError: null, timeline: null });
});
afterEach(cleanup);

const renderCentre = () => render(<MemoryRouter><RaceCentre /></MemoryRouter>);

describe("Race Centre", () => {
  it("says no session is live and never shows a live race when the server reports none", async () => {
    useSession.setState({ server: status(null, "No session is in its live window.") as never });
    renderCentre();
    expect(await screen.findByText("No session is live right now")).toBeTruthy();
    expect(screen.queryByText(/session in progress/i)).toBeNull();
    expect(screen.getByText(/nothing on this page is simulated/i)).toBeTruthy();
    expect(screen.getByText(/OpenF1 Sponsor credentials/i)).toBeTruthy();
  });

  it("shows the next real session from the sessions feed, with its own countdown", async () => {
    const start = Date.now() + 3 * 3600_000;
    mocks.sessions.mockResolvedValue([
      { sessionKey: 9, meetingKey: 1, name: "Practice 1", type: "Practice", year: new Date().getUTCFullYear(), circuitKey: 1, circuitShortName: "X", location: "Zandvoort", countryName: "NL", countryCode: "NED", start, end: start + 3600_000, gmtOffset: "+02:00", cancelled: false, provider: "openf1" },
    ]);
    useSession.setState({ server: status(null, null) as never });
    renderCentre();
    await waitFor(() => expect(screen.getByText(/Zandvoort · Practice 1/)).toBeTruthy());
    expect(screen.getByText(/From the OpenF1 session calendar/)).toBeTruthy();
  });

  it("reports the app server being unreachable", async () => {
    useSession.setState({ serverError: "fetch failed" });
    renderCentre();
    expect(await screen.findByText("App server unreachable")).toBeTruthy();
  });
});

describe("Race recaps", () => {
  it("shows a verified recap and marks the rest unavailable", () => {
    render(<RaceRecaps season={2026} grandPrix="Azerbaijan Grand Prix" hasSprint={false} />);
    expect(screen.getAllByRole("link").some((a) => (a as HTMLAnchorElement).href.includes("race-highlights-2026-azerbaijan-grand-prix.1877401243065210101"))).toBe(true);
    expect(screen.getByText(/Qualifying Highlights: recap unavailable/)).toBeTruthy();
    expect(screen.queryByText(/Sprint Highlights/)).toBeNull();
  });

  it("never links an unrelated video for a race without a verified recap", () => {
    render(<RaceRecaps season={1999} grandPrix="Monaco Grand Prix" hasSprint={false} />);
    expect(screen.getByText(/Race Highlights: recap unavailable/)).toBeTruthy();
    expect(screen.getAllByRole("link").every((a) => !(a as HTMLAnchorElement).href.includes("/video/"))).toBe(true);
  });

  it("only lists official formula1.com video pages that carry a numeric id and a verification date", () => {
    for (const r of RECAPS) {
      expect(r.url).toMatch(/^https:\/\/www\.formula1\.com\/en\/video\/[a-z0-9-]+\.\d{10,}$/);
      expect(r.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.url.toLowerCase()).toContain(String(r.season));
    }
  });
});

describe("Navigation and simulation removal", () => {
  it("has the requested sections and no simulator entry", () => {
    const labels = NAV.map((n) => n.label);
    for (const l of ["Race Centre", "Live Standings", "Calendar", "Historical Races", "Championship Standings", "Race Recaps"]) expect(labels).toContain(l);
    expect(NAV.some((n) => /demo|simulat|overview/i.test(n.to + n.label))).toBe(false);
  });

  it("leaves no simulator code behind in the source tree", () => {
    const files = ["../src/store/session.ts", "../src/components/Layout.tsx", "../src/pages/Settings.tsx", "../src/components/ui.tsx"].map((f) => readFileSync(resolve(__dirname, f), "utf8"));
    for (const f of files) expect(f).not.toMatch(/SIMULATED|DemoProvider|provider === "demo"|mode === "demo"/);
  });
});
