import { describe, expect, it } from "vitest";
import {
  BIRDS_PER_10K_PX_AT_MAX,
  drawnBirdDensity,
  VID_SCALE_MAX,
  zoomScale,
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

describe("zoomScale", () => {
  it("draws the closest zoom's birds at full size", () => {
    expect(zoomScale(8, 8, 4)).toEqual({ factor: 1, span: 4, mode: "birds" });
  });

  it("keeps the same birds per square kilometre as the map zooms out", () => {
    // One level out, each pixel covers four times the ground.
    expect(zoomScale(7, 8, 4).factor).toBe(4);
    expect(zoomScale(5, 8, 4).factor).toBe(64);
  });

  it("halves the wingspan every two levels out", () => {
    expect(zoomScale(6, 8, 4).span).toBeCloseTo(2);
  });

  it("turns birds into dots three levels out", () => {
    expect(zoomScale(6, 8, 4).mode).toBe("birds");
    expect(zoomScale(5, 8, 4).mode).toBe("dots");
  });

  it("never scales past the closest zoom", () => {
    expect(zoomScale(9, 8, 4).factor).toBe(1);
  });
});
