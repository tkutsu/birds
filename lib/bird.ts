/**
 * The bird glyph: a body point and two wing tips, the shape a gull makes
 * against the sky. Drawn thousands of times a frame, so it is three points and
 * no allocation beyond the tuple.
 */

/** Seconds per wingbeat. Real migrants beat faster; this is legible. */
export const WINGBEAT_S = 0.55;

/** Half the wingspan of a drawn bird, px. Smaller reads as a comma. */
export const BIRD_SPAN_PX = 4;

export const BIRD_STROKE_PX = 1.4;

/**
 * Wing tips and body for a bird at (x, y) in screen space.
 *
 * `heading` is radians clockwise from north, the way a compass reads.
 * `phase` runs 0-1 through a wingbeat: the tips sweep back and forward, which
 * at this size reads as flapping.
 */
export function birdWings(
  x: number,
  y: number,
  heading: number,
  span: number,
  phase: number,
): [number, number, number, number, number, number] {
  // Forward unit vector on screen: north is up, so y is negated.
  const fx = Math.sin(heading);
  const fy = -Math.cos(heading);
  // Right-hand unit vector.
  const rx = -fy;
  const ry = fx;
  const sweep = span * (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI)));
  return [
    x - rx * span - fx * sweep,
    y - ry * span - fy * sweep,
    x,
    y,
    x + rx * span - fx * sweep,
    y + ry * span - fy * sweep,
  ];
}

/** Compass heading, radians clockwise from north, of an east/north vector. */
export function headingOf(u: number, v: number): number {
  return Math.atan2(u, v);
}

/**
 * How visible a bird is as the density around it falls.
 *
 * `ratio` is the density where the bird is now over the density it was born
 * into; `threshold` is the bird's own random cut-off, drawn once at birth. A
 * bird is fully visible while its patch of sky is at least as busy as when it
 * appeared and fades out linearly as the ratio falls to its threshold, where
 * it dies. Across a flock that makes the surviving share equal the density
 * ratio, with no bird ever popping out.
 */
export function birdVisibility(ratio: number, threshold: number): number {
  if (!(ratio > threshold)) return 0;
  const span = Math.max(0.05, 1 - threshold);
  return Math.min(1, (ratio - threshold) / span);
}
