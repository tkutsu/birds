/**
 * How bird density becomes birds on screen.
 *
 * The map has no colour scale. A place with more birds aloft simply has more
 * birds drawn over it, in proportion: twice the density, twice the birds. The
 * count is set per screen area rather than per square kilometre, so a flock
 * keeps its look as the map zooms and the legend stays true at every level.
 */

/**
 * Birds/km² at which the drawn flock stops getting denser.
 *
 * Measured, not guessed: across October 2023 the Dutch coastal radar at Den
 * Helder peaked at 389 birds/km² but spent 99% of the month under 75, and
 * inland French and Belgian radars an order of magnitude below that. Past 150
 * the screen is full; the handful of extraordinary hours read as saturated,
 * which is what they look like from the ground too.
 */
export const VID_SCALE_MAX = 150;

/** Birds drawn per 10,000 px² of screen at VID_SCALE_MAX. */
export const BIRDS_PER_10K_PX_AT_MAX = 140;

/** Drawn birds per screen px² for a density in birds/km². Linear, capped. */
export function drawnBirdDensity(vid: number): number {
  if (!(vid > 0)) return 0;
  return (Math.min(vid, VID_SCALE_MAX) / VID_SCALE_MAX) *
    (BIRDS_PER_10K_PX_AT_MAX / 10_000);
}
