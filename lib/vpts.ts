/**
 * Reads Aloft's VPTS (vertical profile time series) CSV and integrates height
 * away.
 *
 * A radar reports bird density in ~200 m altitude bins up to ~5 km, every
 * 5–15 minutes. Nobody needs that on a map: the two numbers the field works
 * in are VID, the column total, and MTR, how fast that column is moving past
 * a line on the ground. Integrating here is what keeps a continent-wide night
 * inside a few hundred KB of JSON.
 */

/** One altitude bin of one profile. Non-finite values mean "not retrieved". */
export interface ProfileBin {
  /** Bottom of the bin, metres above the radar. */
  height: number;
  /** Bird density, birds/km³. Already zeroed by Aloft below the VVP threshold. */
  dens: number;
  /** Ground speed eastward / northward, m/s. */
  u: number;
  v: number;
  /** Ground speed magnitude, m/s. */
  ff: number;
}

export interface IntegratedProfile {
  /** Vertically integrated density, birds/km². */
  vid: number;
  /** Migration traffic rate, birds/km/hour. */
  mtr: number;
  /** Density-weighted mean ground speed, m/s. */
  u: number;
  v: number;
}

export interface VptsDay {
  radar: string;
  latitude: number;
  longitude: number;
  /** Integrated profiles keyed by their ISO timestamp. */
  profiles: Map<string, IntegratedProfile>;
}

/** The lowest bin is ground clutter far more often than it is birds. */
const MIN_HEIGHT_M = 200;
/** Above this, returns are aircraft and noise rather than migrants. */
const MAX_HEIGHT_M = 5000;
const DEFAULT_BIN_M = 200;
const MPS_TO_KMH = 3.6;

const EMPTY: IntegratedProfile = { vid: 0, mtr: 0, u: 0, v: 0 };

function toNumber(raw: string | undefined): number {
  // "NaN" and "" both appear for values the retrieval could not produce.
  if (raw === undefined || raw === "" || raw === "NaN") return Number.NaN;
  return Number(raw);
}

/** Bin width in metres, read off the profile rather than assumed. */
function binWidth(heights: number[]): number {
  if (heights.length < 2) return DEFAULT_BIN_M;
  const gaps = heights
    .slice(1)
    .map((height, index) => height - heights[index])
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  return gaps.length === 0 ? DEFAULT_BIN_M : gaps[Math.floor(gaps.length / 2)];
}

/**
 * Collapses one profile to VID, MTR and a mean heading.
 *
 * Speed is missing far more often than density (the velocity fit needs more
 * signal than the reflectivity does), so MTR is VID times the density-weighted
 * mean speed of the bins that did resolve, rather than a sum that silently
 * treats an unresolved bin as a stationary one.
 */
export function integrate(bins: readonly ProfileBin[]): IntegratedProfile {
  const usable = bins
    .filter(
      (bin) =>
        bin.height >= MIN_HEIGHT_M &&
        bin.height < MAX_HEIGHT_M &&
        Number.isFinite(bin.dens) &&
        bin.dens > 0,
    )
    .sort((a, b) => a.height - b.height);
  if (usable.length === 0) return EMPTY;

  const dh = binWidth(usable.map((bin) => bin.height)) / 1000;

  let vid = 0;
  let speedWeight = 0;
  let speedSum = 0;
  let headingWeight = 0;
  let uSum = 0;
  let vSum = 0;

  for (const bin of usable) {
    const column = bin.dens * dh;
    vid += column;
    if (Number.isFinite(bin.ff)) {
      speedSum += column * bin.ff;
      speedWeight += column;
    }
    if (Number.isFinite(bin.u) && Number.isFinite(bin.v)) {
      uSum += column * bin.u;
      vSum += column * bin.v;
      headingWeight += column;
    }
  }

  const meanSpeed = speedWeight > 0 ? speedSum / speedWeight : 0;
  return {
    vid,
    mtr: vid * meanSpeed * MPS_TO_KMH,
    u: headingWeight > 0 ? uSum / headingWeight : 0,
    v: headingWeight > 0 ? vSum / headingWeight : 0,
  };
}

/** Running mean, so repeated scans inside one timestamp count once. */
interface BinAccumulator {
  height: number;
  dens: [sum: number, count: number];
  u: [sum: number, count: number];
  v: [sum: number, count: number];
  ff: [sum: number, count: number];
}

function add(pair: [number, number], value: number): void {
  if (!Number.isFinite(value)) return;
  pair[0] += value;
  pair[1] += 1;
}

function mean(pair: [number, number]): number {
  return pair[1] === 0 ? Number.NaN : pair[0] / pair[1];
}

/**
 * Parses one radar-day of VPTS CSV.
 *
 * A five-minute radar publishes several scans under one `datetime`, so rows
 * are averaged per timestamp and height before the profile is integrated.
 */
export function parseVptsDay(csv: string): VptsDay | null {
  const lines = csv.split("\n");
  const header = lines[0]?.trim().split(",");
  if (!header || !header.includes("dens")) return null;

  const column = (name: string) => header.indexOf(name);
  const iRadar = column("radar");
  const iDatetime = column("datetime");
  const iHeight = column("height");
  const iLat = column("radar_latitude");
  const iLon = column("radar_longitude");
  const columns = {
    dens: column("dens"),
    u: column("u"),
    v: column("v"),
    ff: column("ff"),
  };
  if (iDatetime < 0 || iHeight < 0 || columns.dens < 0) return null;

  const byTime = new Map<string, Map<number, BinAccumulator>>();
  let radar = "";
  let latitude = Number.NaN;
  let longitude = Number.NaN;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const cells = line.split(",");
    const at = cells[iDatetime];
    const height = Number(cells[iHeight]);
    if (!at || !Number.isFinite(height)) continue;

    if (!radar) {
      radar = cells[iRadar] ?? "";
      latitude = toNumber(cells[iLat]);
      longitude = toNumber(cells[iLon]);
    }

    let bins = byTime.get(at);
    if (!bins) {
      bins = new Map();
      byTime.set(at, bins);
    }
    let bin = bins.get(height);
    if (!bin) {
      bin = {
        height,
        dens: [0, 0],
        u: [0, 0],
        v: [0, 0],
        ff: [0, 0],
      };
      bins.set(height, bin);
    }
    add(bin.dens, toNumber(cells[columns.dens]));
    add(bin.u, toNumber(cells[columns.u]));
    add(bin.v, toNumber(cells[columns.v]));
    add(bin.ff, toNumber(cells[columns.ff]));
  }

  if (!radar || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const profiles = new Map<string, IntegratedProfile>();
  for (const [at, bins] of byTime) {
    profiles.set(
      at,
      integrate(
        [...bins.values()].map((bin) => ({
          height: bin.height,
          dens: mean(bin.dens),
          u: mean(bin.u),
          v: mean(bin.v),
          ff: mean(bin.ff),
        })),
      ),
    );
  }

  return { radar, latitude, longitude, profiles };
}
