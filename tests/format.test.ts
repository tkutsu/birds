import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatNightLabel,
  headingLabel,
  summarizeFrame,
} from "@/lib/format";

describe("formatClock", () => {
  it("shows UTC, which is the clock the whole map is on", () => {
    expect(formatClock("2026-09-09T22:15:00.000Z")).toBe("22:15");
  });
});

describe("formatNightLabel", () => {
  it("names a night for both dates it touches", () => {
    expect(formatNightLabel("2026-09-09")).toBe("9–10 Sep");
  });

  it("spells out both months when the night crosses one", () => {
    expect(formatNightLabel("2026-09-30")).toBe("30 Sep–1 Oct");
  });
});

describe("headingLabel", () => {
  it("names where the birds are going, not where they came from", () => {
    // u east, v north: due south is v negative.
    expect(headingLabel(0, -10)).toBe("S");
    expect(headingLabel(-10, -10)).toBe("SW");
    expect(headingLabel(10, 0)).toBe("E");
  });

  it("says nothing when the flight is too slow to have a direction", () => {
    expect(headingLabel(0.1, 0.1)).toBeNull();
  });
});

describe("summarizeFrame", () => {
  it("weights the network's heading by density", () => {
    const summary = summarizeFrame({
      at: "2026-09-09T22:00:00.000Z",
      samples: [
        { r: 0, vid: 90, mtr: 0, u: 10, v: 0 },
        { r: 1, vid: 10, mtr: 0, u: 0, v: 10 },
      ],
    });
    expect(summary.u).toBeCloseTo(9);
    expect(summary.peakVid).toBe(90);
    expect(summary.meanVid).toBeCloseTo(50);
    expect(summary.active).toBe(2);
  });

  it("survives a frame nobody reported", () => {
    expect(summarizeFrame(undefined).peakVid).toBe(0);
  });
});
