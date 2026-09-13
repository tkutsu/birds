import { describe, expect, it } from "vitest";
import { integrate, parseVptsDay, type ProfileBin } from "@/lib/vpts";

function bin(partial: Partial<ProfileBin> & { height: number }): ProfileBin {
  return { dens: 0, u: Number.NaN, v: Number.NaN, ff: Number.NaN, ...partial };
}

describe("integrate", () => {
  it("sums density over 200 m bins into birds per square kilometre", () => {
    const profile = integrate([
      bin({ height: 200, dens: 10 }),
      bin({ height: 400, dens: 10 }),
      bin({ height: 600, dens: 10 }),
    ]);
    // 3 bins x 10 birds/km³ x 0.2 km
    expect(profile.vid).toBeCloseTo(6);
  });

  it("drops the ground-clutter bin and everything above 5 km", () => {
    const profile = integrate([
      bin({ height: 0, dens: 1000 }),
      bin({ height: 5000, dens: 1000 }),
      bin({ height: 200, dens: 10 }),
    ]);
    expect(profile.vid).toBeCloseTo(2);
  });

  it("reads the bin width off the profile rather than assuming it", () => {
    const profile = integrate([
      bin({ height: 200, dens: 10 }),
      bin({ height: 700, dens: 10 }),
      bin({ height: 1200, dens: 10 }),
    ]);
    // 500 m bins
    expect(profile.vid).toBeCloseTo(15);
  });

  it("turns speed into a traffic rate in birds per kilometre per hour", () => {
    const profile = integrate([
      bin({ height: 200, dens: 10, ff: 10, u: 0, v: 10 }),
      bin({ height: 400, dens: 10, ff: 10, u: 0, v: 10 }),
    ]);
    expect(profile.vid).toBeCloseTo(4);
    // 4 birds/km² x 10 m/s x 3.6
    expect(profile.mtr).toBeCloseTo(144);
  });

  it("carries a bin's speed across bins where the velocity fit failed", () => {
    // Density resolves far more often than velocity does, so summing only the
    // bins with both would quietly treat half the column as standing still.
    const profile = integrate([
      bin({ height: 200, dens: 10, ff: 10, u: 0, v: 10 }),
      bin({ height: 400, dens: 10 }),
    ]);
    expect(profile.vid).toBeCloseTo(4);
    expect(profile.mtr).toBeCloseTo(144);
  });

  it("weights the mean heading by density", () => {
    const profile = integrate([
      bin({ height: 200, dens: 90, u: 10, v: 0, ff: 10 }),
      bin({ height: 400, dens: 10, u: 0, v: 10, ff: 10 }),
    ]);
    expect(profile.u).toBeCloseTo(9);
    expect(profile.v).toBeCloseTo(1);
  });

  it("returns nothing for an empty sky", () => {
    expect(integrate([bin({ height: 200, dens: 0 })])).toEqual({
      vid: 0,
      mtr: 0,
      u: 0,
      v: 0,
    });
  });
});

const HEADER =
  "radar,datetime,height,u,v,ff,dens,radar_latitude,radar_longitude";

describe("parseVptsDay", () => {
  it("averages the repeated scans a five-minute radar files under one stamp", () => {
    const day = parseVptsDay(
      [
        HEADER,
        "nldhl,2026-09-09T22:00:00Z,200,0,10,10,20,52.95,4.79",
        "nldhl,2026-09-09T22:00:00Z,200,0,10,10,40,52.95,4.79",
        "",
      ].join("\n"),
    );
    // Mean density 30 over one 200 m bin.
    expect(day?.profiles.get("2026-09-09T22:00:00Z")?.vid).toBeCloseTo(6);
  });

  it("keeps the radar position and code", () => {
    const day = parseVptsDay(
      [HEADER, "nldhl,2026-09-09T22:00:00Z,200,0,10,10,20,52.95,4.79"].join(
        "\n",
      ),
    );
    expect(day?.radar).toBe("nldhl");
    expect(day?.latitude).toBeCloseTo(52.95);
    expect(day?.longitude).toBeCloseTo(4.79);
  });

  it("treats NaN as absent rather than as zero", () => {
    const day = parseVptsDay(
      [
        HEADER,
        "nldhl,2026-09-09T22:00:00Z,200,NaN,NaN,NaN,20,52.95,4.79",
      ].join("\n"),
    );
    const profile = day?.profiles.get("2026-09-09T22:00:00Z");
    expect(profile?.vid).toBeCloseTo(4);
    expect(profile?.mtr).toBe(0);
  });

  it("rejects a file that is not VPTS", () => {
    expect(parseVptsDay("a,b,c\n1,2,3")).toBeNull();
  });
});
