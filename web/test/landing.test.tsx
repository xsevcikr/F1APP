import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ENTRIES_2026 } from "@f1/shared";

const mocks = vi.hoisted(() => ({
  driverStandings: vi.fn(),
  constructorStandings: vi.fn(),
  media: { drivers: {} as Record<string, unknown>, logos: {}, cars: {} },
}));

vi.mock("../src/api", () => ({ api: { driverStandings: mocks.driverStandings, constructorStandings: mocks.constructorStandings } }));
vi.mock("../src/media", () => ({ useMedia: () => mocks.media, loadMedia: async () => mocks.media }));

import { Landing } from "../src/pages/Landing";
import { DriverPortrait } from "../src/components/people";
import { useSession } from "../src/store/session";

// jsdom has no canvas; the car falls back to its flat drawing.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// The hook caches by key for ten minutes, so each test uses a fresh module state.
beforeEach(async () => {
  vi.resetModules();
  mocks.driverStandings.mockReset().mockRejectedValue(new Error("offline"));
  mocks.constructorStandings.mockReset().mockRejectedValue(new Error("offline"));
  mocks.media.drivers = {};
  useSession.setState({ server: null });
});
afterEach(cleanup);

const renderLanding = (url = "/") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Landing />
    </MemoryRouter>,
  );

describe("Landing", () => {
  it("lists all 11 teams in championship order and labels the snapshot", async () => {
    renderLanding();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs).toHaveLength(11);
    expect(tabs[0].textContent).toContain("1. Mercedes");
    expect(tabs[0].textContent).toContain("578");
    expect(tabs[10].textContent).toContain("11. Cadillac");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Snapshot after round 17.*feed unavailable/));
  });

  it("selecting a team updates the position, name, points and drivers", async () => {
    renderLanding();
    fireEvent.click(await screen.findByRole("tab", { name: /2\. Ferrari/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { level: 1 }).textContent).toBe("2. Ferrari");
    expect(panel.textContent).toContain("444");
    expect(panel.textContent).toContain("Charles Leclerc");
    expect(panel.textContent).toContain("Lewis Hamilton");
    expect(screen.getByRole("tab", { name: /2\. Ferrari/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("moves with the arrow keys, Home and End", async () => {
    renderLanding();
    const first = await screen.findByRole("tab", { name: /1\. Mercedes/ });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /2\. Ferrari/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /2\. Ferrari/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /11\. Cadillac/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /11\. Cadillac/ }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /11\. Cadillac/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /11\. Cadillac/ }), { key: "Home" });
    expect(screen.getByRole("tab", { name: /1\. Mercedes/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens on the team named in the address", async () => {
    renderLanding("/?team=mclaren");
    expect((await screen.findByRole("tabpanel")).textContent).toContain("3. McLaren");
  });

  it("takes positions and points from the standings feed when it is available", async () => {
    const c = (id: string, name: string, position: number, points: number) => ({ position, points, wins: 0, constructor: { id, name } });
    mocks.constructorStandings.mockResolvedValue({
      season: 2026,
      round: 5,
      rows: [c("ferrari", "Ferrari", 1, 100), c("mercedes", "Mercedes", 2, 90), c("mclaren", "McLaren", 3, 10)],
    });
    mocks.driverStandings.mockResolvedValue({ season: 2026, round: 5, rows: [] });
    renderLanding();
    await waitFor(() => expect(screen.getAllByRole("tab")[0].textContent).toContain("1. Ferrari"));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(11);
    expect(tabs[1].textContent).toContain("2. Mercedes");
    // Teams the feed has not listed yet stay, with zero points, below the ranked ones.
    expect(tabs[10].textContent).toMatch(/0\s*pts/i);
    expect(screen.getByRole("status").textContent).toMatch(/after round 5.*Jolpica/);
  });
});

describe("DriverPortrait", () => {
  const ham = ENTRIES_2026.drivers.find((d) => d.code === "HAM")!;
  const team = ENTRIES_2026.teams.find((t) => t.id === "ferrari")!;

  it("shows a marked placeholder when no licensed portrait exists", () => {
    render(<DriverPortrait driver={ham} team={team} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Portrait not available")).toBeTruthy();
  });

  it("never shows a photo whose driver code does not match", () => {
    mocks.media.drivers = { "44": { code: "VET", src: "/media/x.webp", credit: "c", license: "l" } };
    render(<DriverPortrait driver={ham} team={team} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a matching licensed portrait with its credit, and falls back if it fails to load", () => {
    mocks.media.drivers = { "44": { code: "HAM", src: "/media/44.webp", credit: "A. Photographer", license: "Licensed" } };
    render(<DriverPortrait driver={ham} team={team} />);
    const img = screen.getByRole("img", { name: "Lewis Hamilton" });
    expect(img.getAttribute("title")).toBe("A. Photographer · Licensed");
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Portrait not available")).toBeTruthy();
  });
});
