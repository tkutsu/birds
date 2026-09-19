/** Everything is shown in UTC: a continent-wide night has no single local clock. */
export function formatClock(iso: string): string {
  return iso.slice(11, 16);
}

// Spelled out rather than taken from Intl, which renders en-GB September as
// "Sept" and changes its mind between ICU versions.
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "9–10 Sep": a night is named for both of the dates it touches. */
export function formatNightLabel(date: string): string {
  const evening = new Date(`${date}T12:00:00Z`);
  const morning = new Date(evening.getTime() + 86_400_000);
  const evenMonth = MONTHS[evening.getUTCMonth()];
  const mornMonth = MONTHS[morning.getUTCMonth()];
  const left =
    evenMonth === mornMonth
      ? `${evening.getUTCDate()}`
      : `${evening.getUTCDate()} ${evenMonth}`;
  return `${left}–${morning.getUTCDate()} ${mornMonth}`;
}

export function formatDensity(vid: number): string {
  if (vid >= 100) return Math.round(vid).toLocaleString("en-GB");
  if (vid >= 10) return vid.toFixed(0);
  return vid.toFixed(1);
}

/** Rounded to a hundred once the number stops being worth reading exactly. */
export function formatTraffic(mtr: number): string {
  const rounded = mtr >= 1000 ? Math.round(mtr / 100) * 100 : Math.round(mtr);
  return rounded.toLocaleString("en-GB");
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/**
 * The compass point birds are flying *towards*.
 *
 * Meteorology names a wind for where it comes from; a migration is named for
 * where it is going, which is the direction that means something here.
 */
export function headingLabel(u: number, v: number): string | null {
  if (Math.hypot(u, v) < 0.5) return null;
  const degrees = (Math.atan2(u, v) * 180) / Math.PI;
  const index = Math.round(((degrees + 360) % 360) / 22.5) % 16;
  return COMPASS[index];
}

/** Ground speed in km/h, which is how fast a bird reads to a person. */
export function formatSpeed(u: number, v: number): string {
  return `${Math.round(Math.hypot(u, v) * 3.6)} km/h`;
}
