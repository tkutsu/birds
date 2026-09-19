import { describe, expect, it } from "vitest";
import { NEIGHBOUR_KM, unifyFlow, type FlowSample } from "@/lib/flow";

/** A degree of latitude is 111 km, which is how the distances here are set. */
function radar(
  latitude: number,
  u: number,
  v: number,
  vid = 50,
): FlowSample {
  return { latitude, longitude: 10, vid, u, v };
}

describe("unifyFlow", () => {
  it("carries a disagreeing radar along with its neighbours", () => {
    const [odd] = unifyFlow([
      radar(52, 10, 0),
      radar(51, 0, 10),
      radar(53, 0, 10),
    ]);
    // Two neighbours 111 km out outweigh the station between them.
    expect(odd.v).toBeGreaterThan(odd.u);
    // Outweigh, not overrule: what the radar itself saw is still in there.
    expect(odd.u).toBeGreaterThan(2);
  });

  it("leaves a radar with nobody in range exactly as it was", () => {
    const far = radar(60, 10, 0);
    const [, alone] = unifyFlow([radar(50, 0, 10), far]);
    expect(alone).toEqual(far);
  });

  it("keeps the radars themselves in place, birds and all", () => {
    const before = [radar(50, 0, 10, 80), radar(51, 4, 4, 3)];
    const after = unifyFlow(before);
    expect(after.map((sample) => [sample.latitude, sample.vid])).toEqual([
      [50, 80],
      [51, 3],
    ]);
  });

  it("does not let an unresolved velocity drag the flow towards zero", () => {
    const [measured] = unifyFlow([radar(50, 0, 10), radar(50.2, 0, 0, 90)]);
    expect(measured.v).toBeCloseTo(10);
  });

  it("gives the radar with the birds the loudest say", () => {
    const [sparse] = unifyFlow([radar(50, 10, 0, 1), radar(51, 0, 10, 100)]);
    expect(sparse.v).toBeGreaterThan(sparse.u);
  });

  it("ignores a neighbour once it reaches the edge of the neighbourhood", () => {
    const own = radar(50, 10, 0);
    const justOutside = radar(50 + NEIGHBOUR_KM / 111 + 0.1, 0, 10);
    const [kept] = unifyFlow([own, justOutside]);
    expect(kept.u).toBeCloseTo(10);
    expect(kept.v).toBeCloseTo(0);
  });
});
