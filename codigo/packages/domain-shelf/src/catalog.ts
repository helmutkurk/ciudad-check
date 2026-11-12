import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogProductSchema, CatalogStoreSchema } from "@shelfie/core";
import type { CatalogProduct, CatalogStore } from "@shelfie/core";
import { z } from "zod";
import { isValidGtin } from "./parsers.js";

// Loads investigacion/catalogo/*.json (research material, the single copy: contracts.md 1.1a).
// Path is resolved relative to this file, never relative to the working directory.
// verify Friday: the README proposes copying the files into packages/domain-shelf/catalog/;
// until then we read them in place.

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG_DIR = resolve(HERE, "../../../../investigacion/catalogo");

/** G5 defaults, used when the catalog has no price range for a product. */
export const DEFAULT_PRICE_RANGE = { priceMinEur: 0.2, priceMaxEur: 60 } as const;

export type CatalogIssueKind =
  | "schema_mismatch" // record dropped: does not match the core schema
  | "product_without_ean" // dropped: ean is the key
  | "price_range_defaulted" // kept, range filled with G5 defaults
  | "ean_checksum_invalid" // kept, flagged
  | "duplicate_id"; // dropped

export interface CatalogIssue {
  file: "stores.json" | "products.json";
  index: number;
  id: string | null;
  kind: CatalogIssueKind;
  detail: string;
}

export interface Catalog {
  stores: CatalogStore[];
  products: CatalogProduct[];
  /** Every difference between the JSON files and the core schemas. Print it on startup. */
  issues: CatalogIssue[];
}

export interface LoadCatalogOptions {
  dir?: string;
  /** Throw when any record is dropped (not for defaulted ranges). */
  strict?: boolean;
}

const idOf = (raw: unknown): string | null =>
  typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string"
    ? raw.id
    : null;

function readJsonArray(path: string): unknown[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return z.array(z.unknown()).parse(parsed);
}

export function loadCatalog(opts: LoadCatalogOptions = {}): Catalog {
  const dir = opts.dir ?? DEFAULT_CATALOG_DIR;
  const issues: CatalogIssue[] = [];
  const stores: CatalogStore[] = [];
  const products: CatalogProduct[] = [];

  const seenStores = new Set<string>();
  readJsonArray(resolve(dir, "stores.json")).forEach((raw, index) => {
    const parsed = CatalogStoreSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({
        file: "stores.json",
        index,
        id: idOf(raw),
        kind: "schema_mismatch",
        detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      return;
    }
    if (seenStores.has(parsed.data.id)) {
      issues.push({ file: "stores.json", index, id: parsed.data.id, kind: "duplicate_id", detail: "" });
      return;
    }
    seenStores.add(parsed.data.id);
    stores.push(parsed.data);
  });

  const seenEan = new Set<string>();
  readJsonArray(resolve(dir, "products.json")).forEach((raw, index) => {
    const rec = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const id = idOf(raw);
    if (rec["ean"] === null || rec["ean"] === undefined) {
      issues.push({
        file: "products.json",
        index,
        id,
        kind: "product_without_ean",
        detail: "ean is the catalog key; read it from the physical package first",
      });
      return;
    }
    let candidate: Record<string, unknown> = rec;
    if (rec["priceMinEur"] === null || rec["priceMaxEur"] === null) {
      candidate = { ...rec, ...DEFAULT_PRICE_RANGE };
      issues.push({
        file: "products.json",
        index,
        id,
        kind: "price_range_defaulted",
        detail: `null range replaced by ${DEFAULT_PRICE_RANGE.priceMinEur}-${DEFAULT_PRICE_RANGE.priceMaxEur} EUR (G5 defaults)`,
      });
    }
    const parsed = CatalogProductSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({
        file: "products.json",
        index,
        id,
        kind: "schema_mismatch",
        detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      return;
    }
    if (seenEan.has(parsed.data.ean)) {
      issues.push({ file: "products.json", index, id, kind: "duplicate_id", detail: parsed.data.ean });
      return;
    }
    seenEan.add(parsed.data.ean);
    if (!isValidGtin(parsed.data.ean)) {
      issues.push({
        file: "products.json",
        index,
        id,
        kind: "ean_checksum_invalid",
        detail: parsed.data.ean,
      });
    }
    products.push(parsed.data);
  });

  if (opts.strict) {
    const dropped = issues.filter(
      (i) => i.kind === "schema_mismatch" || i.kind === "duplicate_id" || i.kind === "product_without_ean",
    );
    if (dropped.length > 0) {
      throw new Error(`Catalog mismatch: ${dropped.length} record(s) dropped (see issues)`);
    }
  }
  return { stores, products, issues };
}
