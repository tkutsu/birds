/**
 * A migration night is not a calendar day: it starts at dusk and ends at
 * dawn, so it straddles midnight and its data lives in two of Aloft's daily
 * files.
 *
 * The window is fixed in UTC rather than computed from sunset per radar.
 * Across Europe in migration season the sun is down everywhere between
 * 17:00Z and 06:00Z, and a shared window means every radar is on the same
 * clock, which is what makes a continent-wide animation readable.
 */

/** Minutes between animation frames: the coarsest radar reports every 15. */
export const FRAME_MINUTES = 15;
const NIGHT_START_HOUR_UTC = 17;
const NIGHT_HOURS = 13;

const DAY_MS = 24 * 60 * 60 * 1000;

export function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC date `days` after `date` (negative to go back). */
export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS;
  return toUtcDay(new Date(shifted));
}

/** The two UTC dates whose files a night's profiles are split across. */
export function nightDays(date: string): [string, string] {
  return [date, shiftDate(date, 1)];
}

/** Every frame timestamp of a night, dusk first. */
export function nightFrames(date: string): string[] {
  const start = new Date(
    `${date}T${String(NIGHT_START_HOUR_UTC).padStart(2, "0")}:00:00Z`,
  ).getTime();
  const count = (NIGHT_HOURS * 60) / FRAME_MINUTES;
  return Array.from({ length: count + 1 }, (_, index) =>
    new Date(start + index * FRAME_MINUTES * 60_000).toISOString(),
  );
}

/**
 * The most recent nights that enough radars covered end to end.
 *
 * Aloft publishes a day at a time and a radar can simply be down, so the
 * newest file is not the newest usable night: a night needs both of its days
 * present at most of the network before it is worth animating.
 */
export function pickNights(
  available: ReadonlyMap<string, ReadonlySet<string>>,
  options: { count: number; today: string; quorum: number },
): string[] {
  const radars = [...available.values()];
  if (radars.length === 0) return [];
  const needed = Math.max(1, Math.ceil(radars.length * options.quorum));

  const nights: string[] = [];
  // Two weeks back is generous: the feed is daily, so a usable night is
  // normally one or two days old.
  for (let back = 1; back <= 14 && nights.length < options.count; back += 1) {
    const date = shiftDate(options.today, -back);
    const [evening, morning] = nightDays(date);
    const covering = radars.filter(
      (dates) => dates.has(evening) && dates.has(morning),
    ).length;
    if (covering >= needed) nights.push(date);
  }
  return nights.reverse();
}
