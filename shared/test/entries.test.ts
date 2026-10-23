import { describe, expect, it } from "vitest";
import { ENTRIES_2026, driversOf, entriesFor, joinStandings, matchTeam, snapshotTable } from "../src/entries.ts";

describe("2026 entry list", () => {
  it("has 11 teams with two race drivers each and unique numbers", () => {
    expect(ENTRIES_2026.teams).toHaveLength(11);
    for (const t of ENTRIES_2026.teams) expect(driversOf(ENTRIES_2026, t.id), t.name).toHaveLength(2);
    const nums = ENTRIES_2026.drivers.map((d) => d.number);
    expect(new Set(nums).size).toBe(nums.length);
    expect(new Set(ENTRIES_2026.drivers.map((d) => d.code)).size).toBe(22);
  });

  it("only offers an entry list for the season it describes", () => {
    expect(entriesFor(2026)).not.toBeNull();
    expect(entriesFor(2024)).toBeNull();
  });

  it("matches constructors without confusing Red Bull and Racing Bulls", () => {
    expect(matchTeam(ENTRIES_2026, "red_bull", "Red Bull")?.id).toBe("red_bull");
    expect(matchTeam(ENTRIES_2026, "rb", "RB F1 Team")?.id).toBe("rb");
    expect(matchTeam(ENTRIES_2026, "racing_bulls", "Racing Bulls")?.id).toBe("rb");
    expect(matchTeam(ENTRIES_2026, "audi", "Audi")?.id).toBe("audi");
    expect(matchTeam(ENTRIES_2026, "nobody", "Nobody")).toBeUndefined();
  });
});

describe("joinStandings", () => {
  it("orders by points and keeps every team, even ones the feed omits", () => {
    const t = joinStandings(ENTRIES_2026, {
      round: 3,
      constructors: [
        { position: 2, points: 10, wins: 0, constructor: { id: "ferrari", name: "Ferrari" } },
        { position: 1, points: 25, wins: 1, constructor: { id: "mercedes", name: "Mercedes" } },
      ],
      drivers: [{ position: 1, points: 25, wins: 1, driver: { id: "antonelli", code: "ANT", number: 12, familyName: "Antonelli" } }],
    });
    expect(t.teams).toHaveLength(11);
    expect(t.teams.slice(0, 2).map((x) => x.team.id)).toEqual(["mercedes", "ferrari"]);
    expect(t.teams.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(t.teams[10].points).toBe(0);
    expect(t.drivers).toHaveLength(22);
    expect(t.drivers[0].driver.code).toBe("ANT");
    expect(t.basis).toBe("feed");
  });
});

describe("snapshot", () => {
  it("is labelled, complete and consistent with the entry list", () => {
    const s = snapshotTable();
    expect(s.basis).toBe("snapshot");
    expect(s.asOf).toBe("2026-10-11");
    expect(s.teams).toHaveLength(11);
    expect(s.drivers).toHaveLength(22);
    expect(s.teams[0]).toMatchObject({ position: 1, points: 578 });
    expect(s.teams.every((t) => t.team)).toBe(true);
    // Constructors' points are the drivers' points, except points scored for another team.
    const sum = (id: string) => s.drivers.filter((d) => d.driver.teamId === id).reduce((a, d) => a + d.points, 0);
    for (const id of ["mercedes", "ferrari", "mclaren", "haas", "audi", "williams", "aston_martin", "cadillac", "alpine"]) {
      expect(s.teams.find((t) => t.team.id === id)!.points, id).toBe(sum(id));
    }
  });
});
