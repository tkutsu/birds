import { describe, expect, it } from "vitest";
import {
  BIRDS_PER_10K_PX_AT_MAX,
  drawnBirdDensity,
  VID_SCALE_MAX,
} from "@/lib/scale";

describe("drawnBirdDensity", () => {
  it("draws nothing for an empty sky or a missing reading", () => {
    expect(drawnBirdDensity(0)).toBe(0);
    expect(drawnBirdDensity(Number.NaN)).toBe(0);
    expect(drawnBirdDensity(-5)).toBe(0);
  });

  it("is linear, so five times the birds aloft is five times the birds drawn", () => {
    expect(drawnBirdDensity(50)).toBeCloseTo(drawnBirdDensity(10) * 5);
  });

  it("saturates at the top of the scale", () => {
    expect(drawnBirdDensity(VID_SCALE_MAX)).toBeCloseTo(
      BIRDS_PER_10K_PX_AT_MAX / 10_000,
    );
    expect(drawnBirdDensity(VID_SCALE_MAX * 3)).toBe(
      drawnBirdDensity(VID_SCALE_MAX),
    );
  });
});
