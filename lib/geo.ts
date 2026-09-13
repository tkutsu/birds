export interface LatLon {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const lat1 = a.latitude * toRad;
  const lat2 = b.latitude * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Thins a ranked list down to points at least `minKm` apart.
 *
 * Radar coverage is wildly uneven (the Low Countries and Germany have a
 * station every 80 km, Iberia and the Balkans one every 300), and downloading
 * every one of them would cost a gigabyte to render a cluster of dots on top
 * of each other. Keeping the best-ranked radar in each neighbourhood buys an
 * even map for a fraction of the build.
 */
export function thinBySeparation<T extends LatLon>(
  ranked: readonly T[],
  minKm: number,
  limit: number,
): T[] {
  const kept: T[] = [];
  for (const candidate of ranked) {
    if (kept.length >= limit) break;
    if (kept.every((point) => distanceKm(point, candidate) >= minKm)) {
      kept.push(candidate);
    }
  }
  return kept;
}
