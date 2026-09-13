import { describe, expect, it } from "vitest";
import { distanceKm, thinBySeparation } from "@/lib/geo";

const DEN_HELDER = { latitude: 52.95279, longitude: 4.79061 };
const JABBEKE = { latitude: 51.1917, longitude: 3.0642 };

describe("distanceKm", () => {
  it("measures a known pair of radars", () => {
    // Den Helder to Jabbeke is a little over 220 km.
    expect(distanceKm(DEN_HELDER, JABBEKE)).toBeGreaterThan(215);
    expect(distanceKm(DEN_HELDER, JABBEKE)).toBeLessThan(230);
  });

  it("is zero for a point against itself", () => {
    expect(distanceKm(DEN_HELDER, DEN_HELDER)).toBeCloseTo(0);
  });
});

describe("thinBySeparation", () => {
  it("keeps the better-ranked radar of a close pair", () => {
    const kept = thinBySeparation([DEN_HELDER, JABBEKE], 300, 10);
    expect(kept).toEqual([DEN_HELDER]);
  });

  it("keeps both once they are far enough apart", () => {
    expect(thinBySeparation([DEN_HELDER, JABBEKE], 150, 10)).toHaveLength(2);
  });

  it("honours the limit", () => {
    const spread = Array.from({ length: 10 }, (_, index) => ({
      latitude: 40 + index * 5,
      longitude: 0,
    }));
    expect(thinBySeparation(spread, 1, 3)).toHaveLength(3);
  });
});
