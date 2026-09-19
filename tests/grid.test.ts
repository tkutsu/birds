import { describe, expect, it } from "vitest";
import {
  cumulative,
  estimateField,
  meanVelocity,
  pickWeighted,
} from "@/lib/grid";

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

  it("turns the flow between two radars without slowing it down", () => {
    // One radar's birds fly east at 10 m/s, the other's north at 10 m/s.
    const middle = estimateField(samples, 50, 0, 200);
    expect(Math.hypot(middle.u, middle.v)).toBeCloseTo(10, 1);
    expect(middle.u).toBeCloseTo(middle.v, 1);
  });

  it("leans the heading towards the nearer radar", () => {
    const near = estimateField(samples, 25, 0, 200);
    expect(near.u).toBeGreaterThan(near.v);
    expect(Math.hypot(near.u, near.v)).toBeCloseTo(10, 1);
  });

  it("flies what the nearest radar saw where two radars face each other", () => {
    const opposed = [
      { x: 0, y: 0, value: 10, u: 10, v: 0 },
      { x: 100, y: 0, value: 10, u: -10, v: 0 },
    ];
    // Halfway there is no mean heading to be had, so nothing is invented.
    expect(estimateField(opposed, 50, 0, 200).u).toBeCloseTo(10);
    expect(estimateField(opposed, 60, 0, 200).u).toBeCloseTo(-10);
  });

  it("takes no speed from a radar that resolved no velocity", () => {
    const partial = [
      { x: 0, y: 0, value: 10, u: 0, v: 0 },
      { x: 100, y: 0, value: 10, u: 0, v: 8 },
    ];
    expect(estimateField(partial, 20, 0, 200).v).toBeCloseTo(8);
  });
});

describe("meanVelocity", () => {
  it("normalises the summed headings back up to the mean speed", () => {
    expect(meanVelocity(3, 0, 12, { u: 0, v: 0 })).toEqual({ u: 12, v: 0 });
  });

  it("falls back when the headings cancel out", () => {
    expect(meanVelocity(0, 0, 12, { u: 1, v: 2 })).toEqual({ u: 1, v: 2 });
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
