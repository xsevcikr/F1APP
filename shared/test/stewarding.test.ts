import { describe, expect, it } from "vitest";
import { classifyRaceControl, penaltyTypeOf } from "../src/raceControl.ts";
import { flagStateAt, stewardMatters } from "../src/stewarding.ts";
import { rc } from "./fixtures.ts";

describe("FIA flags and penalties", () => {
  it("classifies the black-flag family without confusing them", () => {
    expect(classifyRaceControl(rc(0, "BLACK AND WHITE FLAG FOR CAR 14 (ALO) - TRACK LIMITS", { category: "Flag", flag: "BLACK AND WHITE" })).kind).toBe("black-white");
    expect(classifyRaceControl(rc(0, "BLACK AND ORANGE FLAG FOR CAR 4 (NOR)", { category: "Flag" })).kind).toBe("black-orange");
    expect(classifyRaceControl(rc(0, "BLACK FLAG FOR CAR 2 (SAR)", { category: "Flag", flag: "BLACK" })).kind).toBe("black");
  });

  it("names the penalty the stewards imposed", () => {
    expect(penaltyTypeOf("FIA STEWARDS: DRIVE THROUGH PENALTY FOR CAR 11 (PER) - SPEEDING IN THE PIT LANE")).toBe("drive-through");
    expect(penaltyTypeOf("FIA STEWARDS: 10 SECOND STOP AND GO PENALTY FOR CAR 18")).toBe("stop-go");
    expect(penaltyTypeOf("FIA STEWARDS: REPRIMAND FOR CAR 63 (RUS) - IMPEDING")).toBe("reprimand");
    expect(penaltyTypeOf("FIA STEWARDS: CAR 31 (OCO) DISQUALIFIED - TECHNICAL INFRINGEMENT")).toBe("disqualified");
    const c = classifyRaceControl(rc(0, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 81 (PIA) - TRACK LIMITS"));
    expect(c).toMatchObject({ kind: "penalty", penalty: "time", title: "5 SECOND TIME PENALTY" });
    expect(classifyRaceControl(rc(0, "FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 81 (PIA)")).kind).toBe("penalty-served");
    expect(classifyRaceControl(rc(0, "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (NOR) AND 16 (LEC) REVIEWED NO FURTHER INVESTIGATION")).title).toBe("NO FURTHER ACTION");
  });
});

describe("stewardMatters", () => {
  it("follows a matter from noted to a confirmed penalty", () => {
    const msgs = [
      rc(1000, "FIA STEWARDS: TURN 4 INCIDENT INVOLVING CARS 44 (HAM) AND 3 (VER) NOTED - CAUSING A COLLISION"),
      rc(2000, "FIA STEWARDS: TURN 4 INCIDENT INVOLVING CARS 44 (HAM) AND 3 (VER) UNDER INVESTIGATION - CAUSING A COLLISION"),
      rc(3000, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION"),
      rc(4000, "FIA STEWARDS: TURN 9 INCIDENT INVOLVING CAR 10 (GAS) NOTED - LEAVING THE TRACK AND GAINING AN ADVANTAGE"),
    ];
    expect(stewardMatters(msgs, 1500)[0].status).toBe("noted");
    expect(stewardMatters(msgs, 2500)[0].status).toBe("under investigation");
    const all = stewardMatters(msgs);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ status: "confirmed", penalty: "time", location: "TURN 4", drivers: [44, 3] });
    expect(all[1]).toMatchObject({ status: "noted", drivers: [10] });
  });

  it("marks cleared and withdrawn decisions", () => {
    const msgs = [
      rc(1000, "FIA STEWARDS: UNSAFE RELEASE OF CAR 23 (ALB) UNDER INVESTIGATION - UNSAFE RELEASE"),
      rc(2000, "FIA STEWARDS: UNSAFE RELEASE OF CAR 23 (ALB) REVIEWED NO FURTHER INVESTIGATION - UNSAFE RELEASE"),
    ];
    expect(stewardMatters(msgs)[0].status).toBe("cleared");
    const w = [rc(1000, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 12 (ANT) - FALSE START"), rc(2000, "FIA STEWARDS: PENALTY FOR CAR 12 (ANT) WITHDRAWN - FALSE START")];
    expect(stewardMatters(w)[0].status).toBe("withdrawn");
  });
});

describe("flagStateAt", () => {
  const y = rc(1000, "YELLOW IN TRACK SECTOR 7", { category: "Flag", flag: "YELLOW", scope: "Sector", sector: 7 });
  const msgs = [y, rc(2000, "CLEAR IN TRACK SECTOR 7", { category: "Flag", flag: "CLEAR", scope: "Sector", sector: 7 }), rc(3000, "SAFETY CAR DEPLOYED", { category: "SafetyCar" }), rc(5000, "TRACK CLEAR", { category: "Flag", flag: "GREEN", scope: "Track" })];
  it("tracks whether a yellow or Safety Car still applies", () => {
    expect(flagStateAt(msgs, y, 1500)).toBe("active");
    expect(flagStateAt(msgs, y, 2500)).toBe("cleared");
    expect(flagStateAt(msgs, msgs[2], 4000)).toBe("active");
    expect(flagStateAt(msgs, msgs[2], 6000)).toBe("ended");
    expect(flagStateAt(msgs, msgs[1], 6000)).toBeNull();
  });
});
