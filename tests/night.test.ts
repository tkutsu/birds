import { describe, expect, it } from "vitest";
import {
  FRAME_MINUTES,
  nightDays,
  nightFrames,
  pickNights,
  shiftDate,
  toUtcDay,
} from "@/lib/night";

describe("shiftDate", () => {
  it("crosses a month boundary", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a year boundary backwards", () => {
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("nightFrames", () => {
  it("runs from dusk to dawn across midnight", () => {
    const frames = nightFrames("2026-09-09");
    expect(frames[0]).toBe("2026-09-09T17:00:00.000Z");
    expect(frames.at(-1)).toBe("2026-09-10T06:00:00.000Z");
  });

  it("steps by one frame", () => {
    const frames = nightFrames("2026-09-09");
    const step =
      new Date(frames[1]).getTime() - new Date(frames[0]).getTime();
    expect(step).toBe(FRAME_MINUTES * 60_000);
  });
});

describe("nightDays", () => {
  it("names both files a night's profiles live in", () => {
    expect(nightDays("2026-12-31")).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("pickNights", () => {
  const dates = (...days: string[]) => new Set(days);

  it("takes the newest night both of whose days most radars covered", () => {
    const available = new Map([
      ["a", dates("2026-09-08", "2026-09-09", "2026-09-10")],
      ["b", dates("2026-09-08", "2026-09-09", "2026-09-10")],
    ]);
    expect(
      pickNights(available, { count: 1, today: "2026-09-12", quorum: 0.5 }),
    ).toEqual(["2026-09-09"]);
  });

  it("skips a night the network only half covered", () => {
    // Only "a" has 10 September, so the 9th-10th night falls short of quorum.
    const available = new Map([
      ["a", dates("2026-09-08", "2026-09-09", "2026-09-10")],
      ["b", dates("2026-09-08", "2026-09-09")],
      ["c", dates("2026-09-08", "2026-09-09")],
    ]);
    expect(
      pickNights(available, { count: 1, today: "2026-09-12", quorum: 0.6 }),
    ).toEqual(["2026-09-08"]);
  });

  it("returns the nights oldest first so playback runs forwards", () => {
    const all = dates(
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    );
    expect(
      pickNights(new Map([["a", all]]), {
        count: 2,
        today: "2026-09-12",
        quorum: 1,
      }),
    ).toEqual(["2026-09-09", "2026-09-10"]);
  });

  it("gives up rather than inventing a night", () => {
    expect(
      pickNights(new Map(), { count: 1, today: "2026-09-12", quorum: 0.5 }),
    ).toEqual([]);
  });
});

describe("toUtcDay", () => {
  it("reads the UTC date, not the local one", () => {
    expect(toUtcDay(new Date("2026-09-09T23:30:00Z"))).toBe("2026-09-09");
  });
});
