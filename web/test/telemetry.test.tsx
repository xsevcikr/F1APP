import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CarSample } from "@f1/shared";
import { LapRibbon, TraceChart } from "../src/components/Telemetry";
import { Roll } from "../src/components/ui";
import { tick } from "../src/lib/haptics";

afterEach(cleanup);

const sample = (ts: number, speed: number | null): CarSample => ({ driver: 1, ts, speed, throttle: 80, brake: 0, gear: 5, rpm: 10000, drs: 0 });

describe("TraceChart", () => {
  it("says so when there is no telemetry in the window and draws nothing invented", () => {
    render(<TraceChart samples={[sample(0, 200)]} t={60_000} />);
    expect(screen.getByText(/No car telemetry in the last 20 seconds/)).toBeTruthy();
  });

  it("draws a chart from real samples inside the window", () => {
    const s = [sample(50_000, 100), sample(52_000, 200), sample(54_000, 300)];
    render(<TraceChart samples={s} t={55_000} />);
    expect(screen.getByRole("img", { name: /over the last 20 seconds/ })).toBeTruthy();
  });

  it("breaks the line across a data gap instead of joining the points", () => {
    const s = [sample(40_000, 100), sample(41_000, 120), sample(50_000, 200), sample(51_000, 210)];
    const { container } = render(<TraceChart samples={s} t={52_000} />);
    const speed = [...container.querySelectorAll("path")].find((p) => p.getAttribute("stroke") === "rgb(var(--info))")!;
    expect((speed.getAttribute("d")!.match(/M/g) ?? []).length).toBe(2);
  });
});

describe("LapRibbon", () => {
  it("shows a dash with no laps and one column per lap otherwise", () => {
    const { rerender } = render(<LapRibbon laps={[]} />);
    expect(screen.getByText("—")).toBeTruthy();
    rerender(<LapRibbon laps={[{ lap: 3, tones: ["purple", "green", "yellow"] }, { lap: 4, tones: [null, null, null] }]} />);
    expect(screen.getByTitle("Lap 3")).toBeTruthy();
    expect(screen.getByTitle("Lap 4")).toBeTruthy();
  });
});

describe("Roll and haptics", () => {
  it("renders text values and passes other nodes through", () => {
    render(<div><Roll>+1.234</Roll><Roll><b>node</b></Roll></div>);
    expect(screen.getByText("+1.234").className).toContain("roll-in");
    expect(screen.getByText("node").tagName).toBe("B");
  });

  it("does not throw where vibration is unsupported", () => {
    expect(() => tick()).not.toThrow();
  });
});
