/**
 * Inverse-distance interpolation of the radar network onto a continuous field.
 *
 * Radars are point samples a hundred-odd kilometres apart, and the thing being
 * sampled, a front of migrating birds, really is continuous, so smoothing
 * between them is fair. Smoothing *across* a 600 km hole in the network is
 * not, so every estimate carries a coverage weight that falls to zero at the
 * edge of a radar's influence. The map draws that as transparency: no data
 * looks like no data, not like an empty sky.
 */

export interface FieldSample {
  /** Position in whatever flat space the caller is working in, e.g. pixels. */
  x: number;
  y: number;
  value: number;
  /** Vector carried along for the flow field; ignored by the scalar estimate. */
  u?: number;
  v?: number;
}

export interface FieldEstimate {
  value: number;
  /** 1 right on top of a radar, 0 beyond the influence radius. */
  coverage: number;
  /** Interpolated vector, in the same units the samples carried. */
  u: number;
  v: number;
}

const NOTHING: FieldEstimate = { value: 0, coverage: 0, u: 0, v: 0 };

/** Keeps the weight finite directly on top of a sample. */
const EPSILON = 1e-6;

export interface Velocity {
  u: number;
  v: number;
}

/**
 * One velocity out of several, with the heading and the speed averaged apart.
 *
 * Averaging velocities component by component drags a turn through the
 * middle: two radars whose birds differ by a right angle give a point between
 * them that is 30% slower than either, and two that disagree outright give a
 * dead spot where the birds stop dead and start again facing the other way.
 * Real birds between two such radars are flying at their own speed on some
 * heading between the two, so the headings are averaged as headings, the
 * short way round, and the speeds as speeds.
 *
 * Callers accumulate `dirX` and `dirY` as weighted unit headings and pass the
 * weighted mean `speed`. Directly opposed headings cancel and leave no mean
 * to normalise; there the fallback stands in, which is the nearest radar's
 * own reading, and the two sides of that line each fly what they measured.
 */
export function meanVelocity(
  dirX: number,
  dirY: number,
  speed: number,
  fallback: Velocity,
): Velocity {
  const length = Math.hypot(dirX, dirY);
  if (length <= EPSILON) return { u: fallback.u, v: fallback.v };
  return { u: (dirX / length) * speed, v: (dirY / length) * speed };
}

/**
 * Estimates the field at (x, y) from the samples within `influence`.
 *
 * Weights fall off as 1/d², which is the usual choice: gentle enough to blend
 * neighbouring radars, sharp enough that a distant one cannot outvote the one
 * overhead. Density is averaged as a number and the velocity as a movement,
 * which is not the same operation: see meanVelocity.
 */
export function estimateField(
  samples: readonly FieldSample[],
  x: number,
  y: number,
  influence: number,
): FieldEstimate {
  let weightSum = 0;
  let valueSum = 0;
  let dirX = 0;
  let dirY = 0;
  let speedSum = 0;
  let flowWeight = 0;
  let nearest = Infinity;
  const nearestFlow: Velocity = { u: 0, v: 0 };

  for (const sample of samples) {
    const dx = sample.x - x;
    const dy = sample.y - y;
    const squared = dx * dx + dy * dy;
    if (squared >= influence * influence) continue;
    const distance = Math.sqrt(squared);
    const weight = 1 / (squared + EPSILON);
    weightSum += weight;
    valueSum += weight * sample.value;

    const u = sample.u ?? 0;
    const v = sample.v ?? 0;
    if (distance < nearest) {
      nearest = distance;
      nearestFlow.u = u;
      nearestFlow.v = v;
    }
    // A radar that resolved no velocity has no heading to average in, and no
    // speed either: a zero there means unknown, not still.
    const speed = Math.hypot(u, v);
    if (speed === 0) continue;
    flowWeight += weight;
    dirX += (weight * u) / speed;
    dirY += (weight * v) / speed;
    speedSum += weight * speed;
  }

  if (weightSum === 0) return NOTHING;
  // Linear in distance rather than in the weight, so the fade reads as a soft
  // edge at the rim of coverage instead of a hard disc around each radar.
  const coverage = Math.max(0, 1 - nearest / influence);
  const flow = meanVelocity(
    dirX,
    dirY,
    flowWeight > 0 ? speedSum / flowWeight : 0,
    nearestFlow,
  );
  return {
    value: valueSum / weightSum,
    coverage,
    u: flow.u,
    v: flow.v,
  };
}

/**
 * Running totals over non-negative weights, for picking an index with
 * probability proportional to its weight. The last entry is the total.
 */
export function cumulative(weights: ArrayLike<number>): Float64Array {
  const totals = new Float64Array(weights.length);
  let running = 0;
  for (let index = 0; index < weights.length; index += 1) {
    running += Math.max(0, weights[index]);
    totals[index] = running;
  }
  return totals;
}

/** The index whose share of the total contains `fraction` (0-1). */
export function pickWeighted(totals: Float64Array, fraction: number): number {
  const total = totals[totals.length - 1] ?? 0;
  if (total <= 0) return -1;
  const target = fraction * total;
  let low = 0;
  let high = totals.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (totals[middle] > target) high = middle;
    else low = middle + 1;
  }
  return low;
}
