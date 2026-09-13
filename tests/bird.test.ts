import { describe, expect, it } from "vitest";
import { birdWings, headingOf } from "@/lib/bird";

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
