import type { CaptureLocation, ClaimLocation } from "@shelfie/core";

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CityBox {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * City bounding boxes for the soft city check (contracts 1.2). Demo grade, generous.
 * // verify Friday: Munich box is an approximation of the city area, not an official boundary.
 */
export const CITY_BOXES: readonly CityBox[] = [
  { id: "munich", name: "Munich", minLat: 47.95, maxLat: 48.3, minLon: 11.35, maxLon: 11.8 },
];

export function cityIdFromName(name: string): string {
  return name.trim().toLowerCase();
}

/** The city a coarse coordinate falls in, or undefined. */
export function resolveCity(loc: Pick<ClaimLocation, "lat" | "lon">): CityBox | undefined {
  return CITY_BOXES.find(
    (c) => loc.lat >= c.minLat && loc.lat <= c.maxLat && loc.lon >= c.minLon && loc.lon <= c.maxLon,
  );
}

export interface LocationLimits {
  defaultGeofenceM: number;
  accuracyCapM: number;
  /** accuracyM above this is `location_inaccurate` (contracts 1.3: 300). */
  maxAccuracyM: number;
  /** fixAgeMs above this is `location_inaccurate` (contracts 1.3: 30000). */
  maxFixAgeMs: number;
}

export type LocationPrecheck =
  | { ok: true; distanceM: number; allowedM: number }
  | {
      ok: false;
      code: "location_inaccurate" | "location_mismatch";
      distanceM: number;
      allowedM: number;
    };

/**
 * Capture-time precheck (contracts 1.3): pass if distanceM <= radius + min(accuracyM, cap).
 * Pure; the engine decides what a failure costs (nothing: no verify, no fee, no attempt).
 */
export function precheckLocation(
  loc: CaptureLocation,
  store: { lat: number; lon: number; geofenceRadiusM?: number | undefined },
  limits: LocationLimits,
): LocationPrecheck {
  const radius = store.geofenceRadiusM ?? limits.defaultGeofenceM;
  const allowedM = Math.round(radius + Math.min(loc.accuracyM, limits.accuracyCapM));
  const distanceM = Math.round(haversineM(loc, store));
  if (loc.accuracyM > limits.maxAccuracyM || loc.fixAgeMs > limits.maxFixAgeMs) {
    return { ok: false, code: "location_inaccurate", distanceM, allowedM };
  }
  if (distanceM > allowedM) return { ok: false, code: "location_mismatch", distanceM, allowedM };
  return { ok: true, distanceM, allowedM };
}
