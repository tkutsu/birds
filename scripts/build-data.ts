/**
 * Bakes the migration nights the site ships with, so the deployment is static.
 *
 * The expensive part is the integration. Aloft publishes ~1.5 MB of CSV per
 * radar per day (a 25-bin vertical profile every five to fifteen minutes),
 * and there are around two hundred radars. Integrating height away here turns
 * each radar-timestamp into four numbers, which is the difference between a
 * gigabyte of download and a couple of hundred KB of JSON. The browser never
 * sees a VPTS file.
 *
 * Run with: pnpm build:data
 */
import { mkdir, writeFile } from "node:fs/promises";
import {
  fetchOperaRadars,
  fetchVptsDay,
  listRadarCodes,
  listRadarDates,
  mapWithLimit,
} from "@/lib/aloft";
import { thinBySeparation } from "@/lib/geo";
import {
  FRAME_MINUTES,
  nightDays,
  nightFrames,
  pickNights,
  toUtcDay,
} from "@/lib/night";
import type {
  Night,
  NightFrame,
  NightsPayload,
  Radar,
  RadarSample,
} from "@/lib/types";
import type { IntegratedProfile } from "@/lib/vpts";

const OUT_DIR = new URL("../public/data/", import.meta.url);

/** Mainland Europe. Iceland, the Azores and Tel Aviv would stretch the map
 *  three times as wide to show three radars. */
const BOUNDS = { south: 35, north: 71, west: -11, east: 32 };

/** How many nights to bake. One is the MVP; the archive goes back to 2008. */
const NIGHT_COUNT = Number(process.env.NIGHT_COUNT ?? 1);
/**
 * Specific nights to bake instead of the most recent, as evening dates:
 * `NIGHT_DATES=2023-10-04,2023-10-05`. The deployed build wants last night;
 * this is for pulling a famous one out of the archive.
 */
const NIGHT_DATES = (process.env.NIGHT_DATES ?? "")
  .split(",")
  .map((date) => date.trim())
  .filter(Boolean);
/** Radars closer than this to a better-ranked one are dropped: see lib/geo.ts. */
const MIN_SEPARATION_KM = Number(process.env.MIN_SEPARATION_KM ?? 150);
const MAX_RADARS = Number(process.env.MAX_RADARS ?? 60);
/** A radar counts for a frame if it reported within half a frame of it. */
const MATCH_TOLERANCE_MS = (FRAME_MINUTES / 2) * 60_000;
const LISTING_CONCURRENCY = 16;
const DOWNLOAD_CONCURRENCY = 8;
/** Below this many reporting radars a night is not worth animating. */
const MIN_RADARS_PER_NIGHT = 8;

interface Candidate extends Radar {
  /** Days this radar published in the listed years: a reliability proxy. */
  published: ReadonlySet<string>;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The years the listing has to cover for a set of nights to be resolvable. */
function yearsFor(today: string, requested: readonly string[]): string[] {
  if (requested.length > 0) {
    // A night on 31 December reaches into the next year's files.
    const years = requested.flatMap((date) => {
      const year = Number(date.slice(0, 4));
      return date.slice(5) === "12-31" ? [year, year + 1] : [year];
    });
    return [...new Set(years)].sort().map(String);
  }
  const year = Number(today.slice(0, 4));
  // January nights reach back into December.
  return today.slice(5) < "02-01"
    ? [String(year), String(year - 1)]
    : [String(year)];
}

/** The profile closest to `at`, or null if the radar was not reporting then. */
function profileAt(
  profiles: ReadonlyMap<number, IntegratedProfile>,
  at: number,
): IntegratedProfile | null {
  let best: IntegratedProfile | null = null;
  let bestGap = MATCH_TOLERANCE_MS;
  for (const [stamp, profile] of profiles) {
    const gap = Math.abs(stamp - at);
    if (gap <= bestGap) {
      bestGap = gap;
      best = profile;
    }
  }
  return best;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const observedAt = new Date().toISOString();
  const today = toUtcDay(new Date(observedAt));

  const [codes, opera] = await Promise.all([
    listRadarCodes(),
    fetchOperaRadars(),
  ]);

  const located = codes.flatMap((id) => {
    const station = opera.get(id);
    if (!station) return [];
    const { latitude, longitude } = station;
    const inside =
      latitude >= BOUNDS.south &&
      latitude <= BOUNDS.north &&
      longitude >= BOUNDS.west &&
      longitude <= BOUNDS.east;
    return inside
      ? [{ id, station, latitude, longitude }]
      : [];
  });
  console.log(`${located.length} of ${codes.length} radars inside the map`);

  const years = yearsFor(today, NIGHT_DATES);
  const published = await mapWithLimit(
    located,
    LISTING_CONCURRENCY,
    (radar) => listRadarDates(radar.id, years),
  );
  const availability = new Map(
    located.map((radar, index) => [radar.id, published[index]] as const),
  );

  const nights =
    NIGHT_DATES.length > 0
      ? NIGHT_DATES
      : pickNights(availability, { count: NIGHT_COUNT, today, quorum: 0.5 });
  if (nights.length === 0) {
    throw new Error("No night had enough radars reporting both of its days");
  }
  console.log(`nights: ${nights.join(", ")}`);

  // Every day any chosen night touches.
  const requiredDays = [
    ...new Set(nights.flatMap((night) => nightDays(night))),
  ];

  const candidates: Candidate[] = located
    .map((radar) => ({
      id: radar.id,
      name: radar.station.location,
      country: radar.station.country,
      latitude: radar.latitude,
      longitude: radar.longitude,
      published: availability.get(radar.id) ?? new Set<string>(),
    }))
    .filter((radar) => requiredDays.every((day) => radar.published.has(day)))
    // The most consistently reporting radar wins its neighbourhood.
    .sort((a, b) => b.published.size - a.published.size);

  const selected = thinBySeparation(
    candidates,
    MIN_SEPARATION_KM,
    MAX_RADARS,
  );
  console.log(
    `${selected.length} radars selected from ${candidates.length} covering every night`,
  );

  // radar id -> day -> timestamp -> profile
  const downloads = selected.flatMap((radar) =>
    requiredDays.map((day) => ({ radar: radar.id, day })),
  );
  let fetched = 0;
  const days = await mapWithLimit(
    downloads,
    DOWNLOAD_CONCURRENCY,
    async ({ radar, day }) => {
      const result = await fetchVptsDay(radar, day);
      fetched += 1;
      if (fetched % 20 === 0) {
        console.log(`  ${fetched}/${downloads.length} radar-days read`);
      }
      return result;
    },
  );

  // Timestamps are parsed once here; profileAt compares millions of them.
  const profilesByRadar = new Map<string, Map<number, IntegratedProfile>>();
  downloads.forEach(({ radar }, index) => {
    const day = days[index];
    if (!day) return;
    let merged = profilesByRadar.get(radar);
    if (!merged) {
      merged = new Map();
      profilesByRadar.set(radar, merged);
    }
    for (const [stamp, profile] of day.profiles) {
      merged.set(new Date(stamp).getTime(), profile);
    }
  });

  // Only radars that actually returned data make it into the payload, so an
  // index in `samples` always resolves.
  const radars: Radar[] = selected
    .filter((radar) => profilesByRadar.has(radar.id))
    .map(({ id, name, country, latitude, longitude }) => ({
      id,
      name,
      country,
      latitude,
      longitude,
    }));
  const indexOf = new Map(radars.map((radar, index) => [radar.id, index]));

  const baked: Night[] = [];
  for (const date of nights) {
    let peakVid = 0;
    const frames: NightFrame[] = nightFrames(date).map((at) => {
      const instant = new Date(at).getTime();
      const samples: RadarSample[] = [];
      for (const radar of radars) {
        const profiles = profilesByRadar.get(radar.id);
        if (!profiles) continue;
        const profile = profileAt(profiles, instant);
        if (!profile) continue;
        if (profile.vid > peakVid) peakVid = profile.vid;
        samples.push({
          r: indexOf.get(radar.id) ?? 0,
          vid: round(profile.vid, 1),
          mtr: Math.round(profile.mtr),
          u: round(profile.u, 2),
          v: round(profile.v, 2),
        });
      }
      return { at, samples };
    });

    const reporting = new Set(
      frames.flatMap((frame) => frame.samples.map((sample) => sample.r)),
    ).size;
    if (reporting < MIN_RADARS_PER_NIGHT) {
      console.warn(`skipping ${date}: only ${reporting} radars reported`);
      continue;
    }
    baked.push({ date, frames, peakVid: round(peakVid, 1) });
  }

  if (baked.length === 0) throw new Error("Every candidate night was empty");

  const payload: NightsPayload = { radars, nights: baked, observedAt };
  const json = JSON.stringify(payload);
  await writeFile(new URL("nights.json", OUT_DIR), json);

  const samples = baked.reduce(
    (total, night) =>
      total +
      night.frames.reduce((sum, frame) => sum + frame.samples.length, 0),
    0,
  );
  console.log(
    `nights.json: ${baked.length} night(s), ${radars.length} radars, ` +
      `${samples} samples, ${(json.length / 1024).toFixed(0)} KB\n` +
      baked
        .map((night) => `  ${night.date}: peak ${night.peakVid} birds/km²`)
        .join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
