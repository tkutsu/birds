import { describe, expect, it } from "vitest";
import { cumulative, estimateField, pickWeighted } from "@/lib/grid";

const samples = [
  { x: 0, y: 0, value: 100, u: 10, v: 0 },
  { x: 100, y: 0, value: 0, u: 0, v: 10 },
];

describe("estimateField", () => {
  it("returns a sample's own value on top of it", () => {
    expect(estimateField(samples, 0, 0, 200).value).toBeCloseTo(100, 1);
  });

  it("blends between two samples", () => {
    const middle = estimateField(samples, 50, 0, 200).value;
    expect(middle).toBeCloseTo(50, 1);
  });

  it("lets the nearer sample outvote the further one", () => {
    expect(estimateField(samples, 25, 0, 200).value).toBeGreaterThan(50);
  });

  it("reports full coverage on a radar and none beyond its influence", () => {
    expect(estimateField(samples, 0, 0, 200).coverage).toBeCloseTo(1);
    expect(estimateField(samples, 0, 400, 200)).toEqual({
      value: 0,
      coverage: 0,
      u: 0,
      v: 0,
    });
  });

  it("fades linearly towards the edge of coverage, so gaps look like gaps", () => {
    const half = estimateField([samples[0]], 100, 0, 200).coverage;
    expect(half).toBeCloseTo(0.5);
  });

  it("interpolates the vector alongside the scalar", () => {
    const middle = estimateField(samples, 50, 0, 200);
    expect(middle.u).toBeCloseTo(5, 1);
    expect(middle.v).toBeCloseTo(5, 1);
  });
});

describe("pickWeighted", () => {
  it("picks each index in proportion to its weight", () => {
    const totals = cumulative([1, 0, 3]);
    expect(pickWeighted(totals, 0.1)).toBe(0);
    // The zero-weight cell is never picked.
    expect(pickWeighted(totals, 0.25)).toBe(2);
    expect(pickWeighted(totals, 0.99)).toBe(2);
  });

  it("returns -1 when there is nothing to pick", () => {
    expect(pickWeighted(cumulative([0, 0]), 0.5)).toBe(-1);
  });

  it("ignores negative weights", () => {
    expect(cumulative([-4, 2])[1]).toBe(2);
  });
});
