import type { StreetCategory, StreetReport } from "@shelfie/core";
import { haversineM } from "../geo.js";

/** Great-circle distance in metres between two `{lat, lng}` points (the legacy helper says `lon`). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return haversineM({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
}

/**
 * Duplicate clustering: a new report joins the cluster of the nearest non-rejected report of the
 * same category within `radiusM` (15 m in the pack), otherwise it starts a new cluster.
 */
export function assignCluster(
  point: { lat: number; lng: number; category: StreetCategory },
  existing: readonly StreetReport[],
  radiusM: number,
  newClusterId: () => string,
): string {
  let best: { clusterId: string; d: number } | undefined;
  for (const r of existing) {
    if (r.category !== point.category || r.status === "rejected") continue;
    const d = distanceM(point, r);
    if (d <= radiusM && (best === undefined || d < best.d)) best = { clusterId: r.clusterId, d };
  }
  return best?.clusterId ?? newClusterId();
}
