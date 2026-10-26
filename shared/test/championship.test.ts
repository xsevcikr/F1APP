import { describe, expect, it } from "vitest";
import { pointsFor, projectChampionship, type StandingBefore } from "../src/index.ts";

const before: StandingBefore[] = [
  { code: "AAA", name: "A One", team: "X", points: 100, position: 1 },
  { code: "BBB", name: "B Two", team: "Y", points: 95, position: 2 },
  { code: "CCC", name: "C Three", team: "Z", points: 10, position: 3 },
];

describe("championship projection", () => {
  it("awards race and sprint points by position", () => {
    expect(pointsFor("race", 1)).toBe(25);
    expect(pointsFor("race", 10)).toBe(1);
    expect(pointsFor("race", 11)).toBe(0);
    expect(pointsFor("sprint", 8)).toBe(1);
    expect(pointsFor("sprint", 9)).toBe(0);
    expect(pointsFor("race", null)).toBe(0);
  });

  it("re-ranks the championship and reports places gained", () => {
    const rows = projectChampionship(before, new Map([["AAA", 2], ["BBB", 1], ["CCC", 3]]), "race");
    expect(rows.map((r) => [r.code, r.total, r.position, r.change])).toEqual([
      ["BBB", 120, 1, 1],
      ["AAA", 118, 2, -1],
      ["CCC", 25, 3, 0],
    ]);
  });

  it("starts unlisted drivers from zero", () => {
    const rows = projectChampionship(before, new Map([["NEW", 1]]), "race", new Map([["NEW", { name: "N Ew", team: "Q" }]]));
    const n = rows.find((r) => r.code === "NEW")!;
    expect(n.total).toBe(25);
    expect(n.change).toBeNull();
  });
});
