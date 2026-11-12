import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, CatalogProductSchema, CatalogStoreSchema } from "@shelfie/core";
import type { CatalogProduct, CatalogStore } from "@shelfie/core";

/** Seeded catalogs (contracts 1.1a). Read-only; no live lookup. */
export interface Catalog {
  readonly stores: readonly CatalogStore[];
  readonly products: readonly CatalogProduct[];
  store(id: string): CatalogStore | undefined;
  product(ean: string): CatalogProduct | undefined;
}

export function makeCatalog(
  stores: readonly CatalogStore[],
  products: readonly CatalogProduct[],
): Catalog {
  const s = new Map(stores.map((x) => [x.id, x]));
  const p = new Map(products.map((x) => [x.ean, x]));
  return { stores, products, store: (id) => s.get(id), product: (ean) => p.get(ean) };
}

/**
 * Local catalog loader behind the `Catalog` interface.
 * TODO(integration): replace with `loadCatalog()` from `@shelfie/domain-shelf` once it exports it.
 * Source files: ROOT/investigacion/catalogo/{stores,products}.json (copied to
 * packages/domain-shelf/catalog/ on Friday).
 */
export function loadCatalogFromDir(dir: string): Catalog {
  const read = (name: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      throw new AppError("internal", `Catalog file ${name} could not be read.`, 500, { dir });
    }
  };
  // Per-record validation: the research files contain unfinished records (ean null, no price
  // range). Those are skipped (they cannot be keyed), the rest is used. // verify Friday
  const keep = <T>(
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
    raw: unknown,
  ): T[] => {
    if (!Array.isArray(raw)) throw new AppError("internal", "Catalog file is not an array.", 500);
    const out: T[] = [];
    for (const item of raw) {
      const r = schema.safeParse(item);
      if (r.success && r.data !== undefined) out.push(r.data);
    }
    return out;
  };
  const stores = keep<CatalogStore>(CatalogStoreSchema, read("stores.json"));
  const products = keep<CatalogProduct>(CatalogProductSchema, read("products.json"));
  if (stores.length === 0 || products.length === 0) {
    throw new AppError("internal", "Catalog has no usable stores or products.", 500, { dir });
  }
  return makeCatalog(stores, products);
}

/** Default catalog directory relative to this file (ROOT/investigacion/catalogo). */
export const DEFAULT_CATALOG_DIR = fileURLToPath(
  new URL("../../../../investigacion/catalogo/", import.meta.url),
);
