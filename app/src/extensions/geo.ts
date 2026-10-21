// Geography shared by widgets that place things by latitude and longitude.

import type { Place } from "@/project/schema";

/** Kilometres in a degree of latitude, and of longitude at the equator. */
export const KM_PER_DEG = 111.32;

/** The box around a place: square on the ground, so a degree of longitude shrinks with latitude. */
export function boxAround(place: Place, km: number): { lamin: number; lamax: number; lomin: number; lomax: number } {
  const dLat = km / KM_PER_DEG;
  const dLon = km / (KM_PER_DEG * Math.max(0.05, Math.cos((place.latitude * Math.PI) / 180)));
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    lamin: r(Math.max(-90, place.latitude - dLat)),
    lamax: r(Math.min(90, place.latitude + dLat)),
    lomin: r(Math.max(-180, place.longitude - dLon)),
    lomax: r(Math.min(180, place.longitude + dLon)),
  };
}
