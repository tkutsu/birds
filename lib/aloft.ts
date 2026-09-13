/**
 * Client for Aloft (aloftdata.eu), the ENRAM/Baltrad archive of European
 * weather-radar bird profiles: plain HTTP on a public S3 bucket, CC0, no key.
 *
 * Only the build script uses this. The browser never sees a VPTS file: one
 * radar-day is ~1.5 MB of CSV, and there are a couple of hundred radars.
 */
import { parseVptsDay, type VptsDay } from "@/lib/vpts";

const BUCKET = "https://aloftdata.s3-eu-west-1.amazonaws.com";
/** Baltrad is the pan-European source; `uva` and `ecog-04003` are narrower. */
const SOURCE = "baltrad";
const OPERA_DB =
  "https://raw.githubusercontent.com/aloftdata/aloftdata.eu/main/_data/OPERA_RADARS_DB.json";

/** A station in the OPERA radar database: where a radar is and what it is called. */
export interface OperaRadar {
  odimcode: string;
  location: string;
  country: string;
  latitude: number;
  longitude: number;
}

export function dailyVptsUrl(radar: string, date: string): string {
  const compact = date.replaceAll("-", "");
  return `${BUCKET}/${SOURCE}/daily/${radar}/${date.slice(0, 4)}/${radar}_vpts_${compact}.csv`;
}

function matchAll(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

async function listBucket(
  params: Record<string, string>,
): Promise<{ keys: string[]; prefixes: string[] }> {
  const keys: string[] = [];
  const prefixes: string[] = [];
  let token: string | undefined;

  do {
    const query = new URLSearchParams({ "list-type": "2", ...params });
    if (token) query.set("continuation-token", token);
    const response = await fetch(`${BUCKET}/?${query}`);
    if (!response.ok) {
      throw new Error(`Aloft listing failed with status ${response.status}`);
    }
    const xml = await response.text();
    keys.push(...matchAll(xml, "Key"));
    prefixes.push(...matchAll(xml, "Prefix").filter((p) => p !== params.prefix));
    token = matchAll(xml, "NextContinuationToken")[0];
  } while (token);

  return { keys, prefixes };
}

/** Every radar with daily profiles in the archive, as ODIM codes. */
export async function listRadarCodes(): Promise<string[]> {
  const { prefixes } = await listBucket({
    prefix: `${SOURCE}/daily/`,
    delimiter: "/",
  });
  return prefixes
    .map((prefix) => prefix.split("/").at(-2) ?? "")
    .filter(Boolean)
    .sort();
}

/** The UTC dates a radar published profiles for, within the given years. */
export async function listRadarDates(
  radar: string,
  years: readonly string[],
): Promise<Set<string>> {
  const dates = new Set<string>();
  for (const year of years) {
    const { keys } = await listBucket({
      prefix: `${SOURCE}/daily/${radar}/${year}/`,
    });
    for (const key of keys) {
      // ...<radar>_vpts_YYYYMMDD.csv
      const stamp = key.match(/_vpts_(\d{4})(\d{2})(\d{2})\.csv$/);
      if (stamp) dates.add(`${stamp[1]}-${stamp[2]}-${stamp[3]}`);
    }
  }
  return dates;
}

/** One radar-day of profiles, or null when the radar did not report. */
export async function fetchVptsDay(
  radar: string,
  date: string,
): Promise<VptsDay | null> {
  const response = await fetch(dailyVptsUrl(radar, date));
  if (!response.ok) return null;
  return parseVptsDay(await response.text());
}

export async function fetchOperaRadars(): Promise<Map<string, OperaRadar>> {
  const response = await fetch(OPERA_DB);
  if (!response.ok) {
    throw new Error(`OPERA database failed with status ${response.status}`);
  }
  const rows = (await response.json()) as Record<string, string>[];
  const radars = new Map<string, OperaRadar>();
  for (const row of rows) {
    const odimcode = row.odimcode?.trim();
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!odimcode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    // A code can appear twice as a site is upgraded; the newest entry wins.
    radars.set(odimcode, {
      odimcode,
      location: row.location?.trim() || odimcode,
      country: row.country?.trim() || "",
      latitude,
      longitude,
    });
  }
  return radars;
}

/** Runs `task` over `items`, never more than `limit` requests in flight. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
