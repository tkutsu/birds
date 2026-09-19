/**
 * How bird density becomes birds on screen.
 *
 * The map has no colour scale. A place with more birds aloft simply has more
 * birds drawn over it, in proportion: twice the density, twice the birds. The
 * count is fixed per square kilometre at the closest zoom, so zooming out
 * mostly keeps every bird and makes them smaller; once they are dots the
 * flock is thinned evenly, which leaves the proportion intact.
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

/** Birds drawn per 10,000 px² of screen at VID_SCALE_MAX, at the closest zoom. */
export const BIRDS_PER_10K_PX_AT_MAX = 140;

/**
 * Drawn birds per screen px² at the closest zoom for a density in birds/km².
 * Linear, capped.
 */
export function drawnBirdDensity(vid: number): number {
  if (!(vid > 0)) return 0;
  return (Math.min(vid, VID_SCALE_MAX) / VID_SCALE_MAX) *
    (BIRDS_PER_10K_PX_AT_MAX / 10_000);
}

export interface ZoomScale {
  /** How many more birds each screen px² holds than at the closest zoom. */
  factor: number;
  /** Half the wingspan of a drawn bird, px. */
  span: number;
  /** Past a few levels out a bird is too small to have wings: it is a dot. */
  mode: "birds" | "dots";
}

/** Levels out from the closest zoom at which birds become trailing dots. */
const DOTS_FROM_LEVELS_OUT = 3;

/**
 * The same birds at any zoom. Each level out covers four times the ground per
 * pixel, so four times the birds share it; each bird shrinks by half its
 * wingspan every two levels so the flock does not turn to felt.
 */
export function zoomScale(zoom: number, maxZoom: number, fullSpan: number): ZoomScale {
  const levelsOut = Math.max(0, maxZoom - zoom);
  return {
    factor: 4 ** levelsOut,
    span: fullSpan * 2 ** (-levelsOut / 2),
    mode: levelsOut >= DOTS_FROM_LEVELS_OUT ? "dots" : "birds",
  };
}
