import { describe, expect, it } from "vitest";
import { birdVisibility, birdWings, headingOf } from "@/lib/bird";

describe("headingOf", () => {
  it("reads like a compass: north 0, east a quarter turn clockwise", () => {
    expect(headingOf(0, 10)).toBeCloseTo(0);
    expect(headingOf(10, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(headingOf(0, -10))).toBeCloseTo(Math.PI);
  });
});

describe("birdWings", () => {
  it("sweeps both wing tips behind a bird flying north", () => {
    const [lx, ly, bx, by, rx, ry] = birdWings(50, 50, 0, 3, 0);
    expect([bx, by]).toEqual([50, 50]);
    // Screen y grows downwards, so "behind" a northbound bird is larger y.
    expect(ly).toBeGreaterThan(by);
    expect(ry).toBeGreaterThan(by);
    expect(lx).toBeLessThan(bx);
    expect(rx).toBeGreaterThan(bx);
  });

  it("sweeps the tips west of a bird flying east", () => {
    const [lx, , bx, , rx] = birdWings(50, 50, Math.PI / 2, 3, 0);
    expect(lx).toBeLessThan(bx);
    expect(rx).toBeLessThan(bx);
  });

  it("flaps: the sweep changes through the wingbeat", () => {
    const up = birdWings(0, 0, 0, 3, 0.25);
    const down = birdWings(0, 0, 0, 3, 0.75);
    expect(up[1]).not.toBeCloseTo(down[1]);
  });
});

describe("birdVisibility", () => {
  it("keeps a bird fully visible while its sky is at least as busy as at birth", () => {
    expect(birdVisibility(1, 0.4)).toBe(1);
    expect(birdVisibility(2, 0.9)).toBe(1);
  });

  it("fades a bird as the density around it falls towards its threshold", () => {
    expect(birdVisibility(0.7, 0.4)).toBeCloseTo(0.5);
  });

  it("kills a bird once the density reaches its threshold", () => {
    expect(birdVisibility(0.4, 0.4)).toBe(0);
    expect(birdVisibility(0, 0.1)).toBe(0);
  });

  it("thins a flock to the density ratio, since thresholds are uniform", () => {
    // With thresholds spread evenly over 0-1, the share still alive at a given
    // ratio is the share of thresholds below it.
    const thresholds = Array.from({ length: 1000 }, (_, index) => index / 1000);
    const alive = thresholds.filter((threshold) => birdVisibility(0.3, threshold) > 0);
    expect(alive.length / thresholds.length).toBeCloseTo(0.3, 2);
  });

  it("treats a missing density as an empty sky", () => {
    expect(birdVisibility(Number.NaN, 0.2)).toBe(0);
  });
});
