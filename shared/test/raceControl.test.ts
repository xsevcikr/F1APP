import { describe, expect, it } from "vitest";
import { classifyRaceControl, driversInMessage, timePenaltySeconds } from "../src/raceControl.ts";
import { neutralPeriods, trackStatusAt } from "../src/trackStatus.ts";
import { rc } from "./fixtures.ts";

describe("classifyRaceControl", () => {
  const cases: [Parameters<typeof rc>, string][] = [
    [[0, "SAFETY CAR DEPLOYED", { category: "SafetyCar" }], "safety-car"],
    [[0, "SAFETY CAR IN THIS LAP", { category: "SafetyCar" }], "safety-car-ending"],
    [[0, "VIRTUAL SAFETY CAR DEPLOYED", { category: "SafetyCar" }], "vsc"],
    [[0, "VIRTUAL SAFETY CAR ENDING", { category: "SafetyCar" }], "vsc-ending"],
    [[0, "RED FLAG", { category: "Flag", flag: "RED" }], "red"],
    [[0, "CHEQUERED FLAG", { category: "Flag", flag: "CHEQUERED" }], "chequered"],
    [[0, "DOUBLE YELLOW IN TRACK SECTOR 4", { category: "Flag", flag: "DOUBLE YELLOW", sector: 4 }], "double-yellow"],
    [[0, "YELLOW IN TRACK SECTOR 4", { category: "Flag", flag: "YELLOW", sector: 4 }], "yellow"],
    [[0, "GREEN LIGHT - PIT EXIT OPEN", { category: "Flag", flag: "GREEN" }], "green"],
    [[0, "CAR 1 (VER) TIME 1:20.000 DELETED - TRACK LIMITS AT TURN 4 LAP 3", { category: "Other" }], "track-limits"],
    [[0, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION", { category: "Other" }], "penalty"],
    [[0, "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) UNDER INVESTIGATION", { category: "Other" }], "investigation"],
    [[0, "DRS DISABLED", { category: "Drs" }], "drs"],
    [[0, "DEBRIS AT TURN 3", { category: "Other" }], "debris"],
    [[0, "CAR 20 (MAG) STOPPED AT TURN 8", { category: "CarEvent" }], "car-stopped"],
    [[0, "TRACK SURFACE SLIPPERY IN SECTOR 2", { category: "Other" }], "track-condition"],
    [[0, "FIA STEWARDS: UNSAFE RELEASE OF CAR 10 (GAS) UNDER INVESTIGATION", { category: "Other" }], "unsafe-release"],
    [[0, "RACE WILL RESUME AT 15:20 WITH A STANDING START", { category: "Other" }], "restart"],
  ];
  for (const [args, kind] of cases) {
    it(`${args[1]} → ${kind}`, () => {
      expect(classifyRaceControl(rc(...args)).kind).toBe(kind);
    });
  }

  it("does not label a no-further-action decision as a penalty", () => {
    expect(classifyRaceControl(rc(0, "FIA STEWARDS: NO FURTHER ACTION FOR CAR 1 PENALTY REVIEW")).kind).toBe("investigation");
  });

  it("extracts driver numbers and penalty seconds", () => {
    expect(driversInMessage("INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) NOTED")).toEqual([1, 4]);
    expect(driversInMessage("CAR 44 (HAM) STOPPED")).toEqual([44]);
    expect(timePenaltySeconds("10 SECOND TIME PENALTY FOR CAR 2")).toBe(10);
    expect(timePenaltySeconds("DRIVE THROUGH PENALTY")).toBeNull();
  });
});

describe("trackStatusAt", () => {
  const msgs = [
    rc(1000, "GREEN LIGHT - PIT EXIT OPEN", { flag: "GREEN", category: "Flag" }),
    rc(2000, "YELLOW IN TRACK SECTOR 3", { flag: "YELLOW", sector: 3, category: "Flag" }),
    rc(2500, "DOUBLE YELLOW IN TRACK SECTOR 5", { flag: "DOUBLE YELLOW", sector: 5, category: "Flag" }),
    rc(3000, "CLEAR IN TRACK SECTOR 3", { flag: "CLEAR", sector: 3, category: "Flag" }),
    rc(4000, "SAFETY CAR DEPLOYED", { category: "SafetyCar" }),
    rc(5000, "SAFETY CAR IN THIS LAP", { category: "SafetyCar" }),
    rc(6000, "TRACK CLEAR", { flag: "GREEN", category: "Flag", scope: "Track" }),
    rc(7000, "VIRTUAL SAFETY CAR DEPLOYED", { category: "SafetyCar" }),
    rc(8000, "RED FLAG", { flag: "RED", category: "Flag" }),
    rc(9000, "GREEN", { flag: "GREEN", category: "Flag", scope: "Track" }),
    rc(9500, "DRS ENABLED", { category: "Drs" }),
    rc(10_000, "CHEQUERED FLAG", { flag: "CHEQUERED", category: "Flag" }),
  ];

  it("is unknown before any message", () => {
    expect(trackStatusAt(msgs, 0).headline).toBe("UNKNOWN");
  });
  it("tracks local yellows per sector", () => {
    const s = trackStatusAt(msgs, 2600);
    expect(s.headline).toBe("YELLOW");
    expect(s.yellowSectors).toEqual([{ sector: 3, double: false }, { sector: 5, double: true }]);
    expect(trackStatusAt(msgs, 3100).yellowSectors).toEqual([{ sector: 5, double: true }]);
  });
  it("follows SC deploy, ending and green", () => {
    expect(trackStatusAt(msgs, 4100).headline).toBe("SAFETY CAR");
    expect(trackStatusAt(msgs, 5100).headline).toBe("SC IN THIS LAP");
    const g = trackStatusAt(msgs, 6100);
    expect(g.headline).toBe("GREEN");
    expect(g.yellowSectors).toEqual([]);
  });
  it("handles VSC, red flag, resumption, DRS and chequered", () => {
    expect(trackStatusAt(msgs, 7100).headline).toBe("VSC");
    expect(trackStatusAt(msgs, 8100).headline).toBe("RED FLAG");
    expect(trackStatusAt(msgs, 9100).headline).toBe("GREEN");
    expect(trackStatusAt(msgs, 9100).drsEnabled).toBeNull();
    expect(trackStatusAt(msgs, 9600).drsEnabled).toBe(true);
    expect(trackStatusAt(msgs, 10_100).headline).toBe("CHEQUERED");
  });
  it("lists neutral periods", () => {
    const p = neutralPeriods(msgs);
    expect(p.map((x) => [x.kind, x.start, x.end])).toEqual([
      ["safety-car", 4000, 6000],
      ["vsc", 7000, 8000],
      ["red", 8000, 9000],
    ]);
  });
});
