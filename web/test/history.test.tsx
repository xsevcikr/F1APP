import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SNAPSHOT_SEASONS, snapshotRace, snapshotSeason } from "../src/data/historySnapshot";

vi.mock("../src/api", () => {
  const down = () => Promise.reject(new Error("archive unreachable"));
  return {
  api: {
    seasons: down, schedule: down, seasonResults: down, sessions: async () => [], results: down,
    driverStandings: down, constructorStandings: down, seasonSprints: down, seasonQualifying: down,
  },
  };
});

import { Races } from "../src/pages/Races";
import { RaceDetail } from "../src/pages/RaceDetail";
import { DriversTeams } from "../src/pages/DriversTeams";
import { clearAsyncCache } from "../src/hooks/useAsync";

beforeEach(() => clearAsyncCache());
afterEach(cleanup);

describe("history snapshot data", () => {
  it("covers 2024 to 2026 and every race has a three-driver podium", () => {
    expect(SNAPSHOT_SEASONS).toEqual([2026, 2025, 2024]);
    for (const y of SNAPSHOT_SEASONS) for (const r of snapshotSeason(y)!.races) expect(r.podium.map((p) => p.pos)).toEqual([1, 2, 3]);
  });
  it("standings wins equal podium wins", () => {
    for (const y of SNAPSHOT_SEASONS) {
      const s = snapshotSeason(y)!;
      const wins = new Map<string, number>();
      for (const r of s.races) wins.set(r.podium[0].driverId, (wins.get(r.podium[0].driverId) ?? 0) + 1);
      for (const d of s.drivers) expect(d.wins).toBe(wins.get(d.driverId) ?? 0);
    }
  });
});

describe("offline fallback", () => {
  it("lists researched races, labelled as a snapshot, when the archive is down", async () => {
    render(<MemoryRouter><Races /></MemoryRouter>);
    expect((await screen.findByRole("note")).textContent).toMatch(/Research snapshot/);
    const first = snapshotSeason(new Date().getUTCFullYear())?.races.at(-1);
    if (first) expect(screen.getAllByText(first.podium[0].driver).length).toBeGreaterThan(0);
  });
  it("shows the podium on a race page and says what is missing", async () => {
    const r = snapshotRace(2025, 1)!;
    render(
      <MemoryRouter initialEntries={["/races/2025/1"]}>
        <Routes><Route path="/races/:season/:round" element={<RaceDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect((await screen.findAllByText(r.name)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(r.podium[0].driver).length).toBeGreaterThan(0);
    expect(screen.getByText(/need the results archive/)).toBeTruthy();
  });
  it("shows final standings with the snapshot label", async () => {
    render(<MemoryRouter><DriversTeams /></MemoryRouter>);
    expect((await screen.findByRole("note")).textContent).toMatch(/Research snapshot/);
    expect(screen.getByText(/Final standings after round/)).toBeTruthy();
  });
});
