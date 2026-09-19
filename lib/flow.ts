/**
 * One movement out of sixty radars.
 *
 * Each station resolves its own density-weighted mean velocity, and two
 * stations watching the same front never quite agree: they see different
 * slices of it, an hour apart in the birds' own time, through different
 * clutter. Interpolating those readings as they come gives every radar a cell
 * of birds flying its heading and a seam down the middle where the flock
 * turns, which is an artefact of the network rather than anything the birds
 * are doing.
 *
 * A migration front is one movement across several hundred kilometres, so
 * before the field is drawn each radar's velocity is replaced by the mean of
 * the stations around it. Only stations within NEIGHBOUR_KM take part: a
 * radar alone in Iberia keeps its own reading rather than borrowing one from
 * 600 km away, which would be inventing a flow where there is no evidence of
 * one. Density is left alone, and the tooltips keep quoting what each radar
 * actually measured.
 */

import { distanceKm, type LatLon } from "@/lib/geo";
import { meanVelocity } from "@/lib/grid";

export interface FlowSample extends LatLon {
  /** Birds/km², which is also how much this radar's heading counts for. */
  vid: number;
  /** Ground speed east/north, m/s. Both zero when velocity did not resolve. */
  u: number;
  v: number;
}

/**
 * How far a radar listens to its neighbours.
 *
 * The limit is about the network rather than the birds, which stay coherent
 * over far more than this. 250 km reaches the two or three nearest stations
 * across the Low Countries, Germany and Scandinavia, and reaches nobody at
 * all in Iberia or the Balkans: agreement where there is something to agree
 * with, and silence where there is not.
 */
export const NEIGHBOUR_KM = 250;

/**
 * Every radar's velocity, replaced by the weighted mean of its neighbourhood.
 *
 * Neighbours count for their bird density, because a radar under an empty sky
 * still reports a heading and that heading is mostly noise, and for how close
 * they are, on a curve that falls to zero at the rim so a station going quiet
 * at the edge of the neighbourhood does not snap the flow. Two stations that
 * disagree about which way the birds are turning meet in the middle by
 * heading and by speed separately, so the answer is a heading between theirs
 * flown at the speed they saw, not the crawl that averaging the two
 * velocities would give. A station is worth
 * about three quarters of itself to a neighbour 125 km away, so across the
 * dense part of the network the two or three radars around one station
 * outweigh it and a single odd heading is carried along with the rest. A
 * radar keeps its own reading when nobody near it has birds.
 */
export function unifyFlow(
  samples: readonly FlowSample[],
  radiusKm = NEIGHBOUR_KM,
): FlowSample[] {
  return samples.map((sample) => {
    let weight = 0;
    let dirX = 0;
    let dirY = 0;
    let speedSum = 0;

    for (const other of samples) {
      // Nothing to lend: no birds, or no velocity resolved out of them.
      if (other.vid <= 0) continue;
      const speed = Math.hypot(other.u, other.v);
      if (speed === 0) continue;
      const km = distanceKm(sample, other);
      if (km >= radiusKm) continue;
      const share = (1 - (km / radiusKm) ** 2) * other.vid;
      weight += share;
      dirX += (share * other.u) / speed;
      dirY += (share * other.v) / speed;
      speedSum += share * speed;
    }

    if (weight === 0) return sample;
    return { ...sample, ...meanVelocity(dirX, dirY, speedSum / weight, sample) };
  });
}
