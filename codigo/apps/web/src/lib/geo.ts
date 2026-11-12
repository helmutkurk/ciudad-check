import type { CaptureLocation, ClaimLocation } from "@shelfie/core/browser";

export interface PositionLike {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}
export interface PositionErrorLike {
  code: number; // 1 permission denied, 2 unavailable, 3 timeout
}
export interface GeolocationLike {
  getCurrentPosition(
    success: (position: PositionLike) => void,
    error: (error: PositionErrorLike) => void,
    options?: PositionOptions,
  ): void;
}

export type GeoFailure = "denied" | "unavailable";

export class GeoError extends Error {
  readonly kind: GeoFailure;
  constructor(kind: GeoFailure) {
    super(kind === "denied" ? "Location permission denied" : "Location unavailable");
    this.name = "GeoError";
    this.kind = kind;
  }
}

function read(geo: GeolocationLike | undefined, options: PositionOptions): Promise<PositionLike> {
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(new GeoError("unavailable"));
      return;
    }
    geo.getCurrentPosition(
      resolve,
      (e) => reject(new GeoError(e.code === 1 ? "denied" : "unavailable")),
      options,
    );
  });
}

/** About 1 km: two decimals of latitude. Used for the city feed and the claim (contracts 1.2). */
export function roundCoarse(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function readCoarseLocation(geo: GeolocationLike | undefined): Promise<ClaimLocation> {
  const p = await read(geo, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8000 });
  return {
    lat: roundCoarse(p.coords.latitude),
    lon: roundCoarse(p.coords.longitude),
    accuracyM: Math.round(Math.max(p.coords.accuracy, 800)),
  };
}

/**
 * Position for the on-device map dot only. The caller keeps it in component state: it is never
 * sent to the server, never written to storage, and not rounded. Only called after a user gesture.
 */
export async function readDevicePosition(
  geo: GeolocationLike | undefined,
): Promise<{ lat: number; lon: number; accuracyM: number }> {
  const p = await read(geo, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
  return {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    accuracyM: Math.round(p.coords.accuracy),
  };
}

/** Fresh precise fix at the shutter (contracts 1.3: maximumAge 0). */
export async function readFreshFix(
  geo: GeolocationLike | undefined,
  now: () => Date,
): Promise<CaptureLocation> {
  const p = await read(geo, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  return {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    accuracyM: Math.round(p.coords.accuracy),
    fixAgeMs: Math.max(0, now().getTime() - p.timestamp),
  };
}
