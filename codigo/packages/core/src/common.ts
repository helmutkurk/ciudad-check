import { z } from "zod";

/** ISO-8601 UTC timestamp ("2000-01-01T00:00:00Z"). */
export const IsoTimestampSchema = z.iso.datetime();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

/** Money is a decimal string of lovelace (integer, no sign). Never floating point. */
export const LovelaceSchema = z.string().regex(/^\d+$/, "lovelace must be an integer string");
export type Lovelace = z.infer<typeof LovelaceSchema>;

export function lovelaceToBigInt(value: Lovelace): bigint {
  return BigInt(LovelaceSchema.parse(value));
}

/** 1 tADA = 1_000_000 lovelace. Display helper only (string math, no float). */
export function lovelaceToAdaString(value: Lovelace): string {
  const n = lovelaceToBigInt(value);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
}

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, "sha256 must be 64 hex chars");

export const ImageMimeTypeSchema = z.enum(["image/jpeg", "image/png"]);
export type ImageMimeType = z.infer<typeof ImageMimeTypeSchema>;

/** The worker's claim, selects the gate set (verifier-rules sections 2 and 2a). */
export const OutcomeSchema = z.enum(["OBSERVED", "OUT_OF_STOCK"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const JobSourceSchema = z.enum(["shell", "demo"]);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const LatLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/** Coarse location sent at claim time (rounded to about 1 km by the client). */
export const ClaimLocationSchema = LatLonSchema.extend({
  accuracyM: z.number().nonnegative().optional(),
});
export type ClaimLocation = z.infer<typeof ClaimLocationSchema>;

/** Fresh fix sent with a submission (contracts section 1.3); required. */
export const CaptureLocationSchema = LatLonSchema.extend({
  accuracyM: z.number().nonnegative(),
  fixAgeMs: z.number().nonnegative(),
});
export type CaptureLocation = z.infer<typeof CaptureLocationSchema>;

/** What the engine keeps of a capture location: raw coordinates are not stored. */
export const StoredCaptureLocationSchema = z.object({
  distanceM: z.number().nonnegative(),
  accuracyM: z.number().nonnegative(),
  withinGeofence: z.boolean(),
});
export type StoredCaptureLocation = z.infer<typeof StoredCaptureLocationSchema>;

/** Cardano preprod address (shape check only; real parsing lives in packages/payments). */
export const PayoutAddressSchema = z
  .string()
  .regex(/^addr_test1[0-9a-z]{20,}$/, "must be a preprod address (addr_test1...)");

export const NetworkSchema = z.literal("preprod", {
  error: "NETWORK must be preprod (mainnet is refused)",
});

/** Brand id (ADR-21): lowercase slug, used in env, orders and the brand profile. */
export const BrandIdSchema = z
  .string()
  .regex(/^[a-z0-9-]{2,40}$/, "brand id must be 2-40 of a-z, 0-9, -");

/** Preprod wallet of a brand (ADR-21, shown in the profile; never a mainnet address). */
export const BrandWalletAddressSchema = z
  .string()
  .regex(/^addr_test1[0-9a-z]{50,120}$/, "must be a preprod address (addr_test1...)");
