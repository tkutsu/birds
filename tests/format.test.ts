import { describe, expect, it } from "vitest";
import { formatClock, formatNightLabel, headingLabel } from "@/lib/format";

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
