import { z } from "zod";

// Field names follow investigacion/catalogo/stores.json and products.json as summarised in
// contracts.md section 1.1a. // verify Friday: the files win where they differ.

export const CatalogStoreSchema = z.object({
  id: z.string().min(1),
  chain: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  lat: z.number(),
  lon: z.number(),
  geofenceRadiusM: z.number().positive().optional(),
  /** Other addresses people know the store by (e.g. the OSM street when the display address is the chain finder's). */
  aliases: z.array(z.string()).optional(),
  /** Stage/demo shelf, not a real supermarket. */
  demo: z.boolean().optional(),
});
export type CatalogStore = z.infer<typeof CatalogStoreSchema>;

export const CatalogProductSchema = z.object({
  ean: z.string().regex(/^\d{8,14}$/),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  priceMinEur: z.number().nonnegative(),
  priceMaxEur: z.number().nonnegative(),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

export const StoresFileSchema = z.array(CatalogStoreSchema);
export const ProductsFileSchema = z.array(CatalogProductSchema);

/** GET /api/catalog (public): store positions (public business data), no price ranges. */
export const CatalogResponseSchema = z.object({
  cities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      stores: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          chain: z.string(),
          address: z.string(),
          lat: z.number(),
          lon: z.number(),
          aliases: z.array(z.string()).optional(),
        }),
      ),
      products: z.array(z.object({ ean: z.string(), name: z.string() })),
    }),
  ),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

/** Intake filter reason codes (contracts section 1.1a). */
export const IntakeReasonCodeSchema = z.enum([
  "unknown_store",
  "unknown_product",
  "city_not_supported",
  "multi_store_unsupported",
  "catalog_mismatch",
]);
export type IntakeReasonCode = z.infer<typeof IntakeReasonCodeSchema>;

export const IntakeReasonSchema = z.object({
  code: IntakeReasonCodeSchema,
  field: z.string(),
});
export type IntakeReason = z.infer<typeof IntakeReasonSchema>;

export const IntakeRejectedDetailsSchema = z.object({ reasons: z.array(IntakeReasonSchema) });
