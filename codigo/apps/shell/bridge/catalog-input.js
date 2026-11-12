import { BridgeError } from "./errors.js";

// One input format for every channel: catalog ids, exactly what the dashboard's dropdowns send
// ({ productEan, stores: [{ id }] }, ADR-17). This module turns the other shapes a Sokosumi request
// can take into those ids, using the engine's GET /api/catalog:
//   - MIP-003 dropdowns (type "option"): Sokosumi submits the selected index, e.g. { storeId: [2] }
//   - the dropdown label text, e.g. "REWE, August-Everding-Straße 20, 81671 München"
//   - free text in a Task description, e.g. "Nutella at the REWE on August-Everding-Straße"
// Anything that does not resolve to exactly one store and one product is rejected (no guessing).

/**
 * @typedef {{ id: string, name: string, chain?: string, address?: string, aliases?: string[] }} CatalogStore
 * @typedef {{ ean: string, name: string }} CatalogProduct
 * @typedef {{ cities: { id: string, name: string, stores: CatalogStore[], products: CatalogProduct[] }[] }} Catalog
 * @typedef {{ id: string, label: string, aliases?: string[] }} Choice
 */

const REJECT = "The request must name one product and one store from the Shelfie catalog.";
const UNITS = new Set(["l", "ml", "g", "kg", "nr", "original", "the", "and", "der", "die", "das"]);

/** Lowercase, strip accents, ß -> ss, keep letters and digits only. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/strasse\b/g, " strasse")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** @param {string} text */
function tokens(text) {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length >= 2 && !UNITS.has(t));
}

/**
 * Dropdown choices in a stable order (sorted by id), shared by the input schema and the resolver.
 * @param {Catalog} catalog
 * @returns {{ stores: Choice[], products: Choice[] }}
 */
export function catalogChoices(catalog) {
  const city = catalog?.cities?.[0];
  if (!city) throw new BridgeError("dependency_unavailable", "The Shelfie catalog is empty.", { status: 503 });
  const stores = [...city.stores]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, label: s.address ? `${s.name}, ${s.address}` : s.name, aliases: s.aliases ?? [] }));
  const products = [...city.products]
    .sort((a, b) => a.ean.localeCompare(b.ean))
    .map((p) => ({ id: p.ean, label: `${p.name} (EAN ${p.ean})` }));
  return { stores, products };
}

/**
 * MIP-003 input schema with two single-choice dropdowns, for the starter's GET /input_schema.
 * @param {Catalog} catalog
 */
export function inputSchemaFromCatalog(catalog) {
  const { stores, products } = catalogChoices(catalog);
  const single = [
    { validation: "min", value: "1" },
    { validation: "max", value: "1" },
  ];
  return {
    input_data: [
      { id: "productEan", type: "option", name: "Product", data: { values: products.map((p) => p.label), description: "The product to check on the shelf." }, validations: single },
      { id: "storeId", type: "option", name: "Store (Munich)", data: { values: stores.map((s) => s.label), description: "The store to visit." }, validations: single },
    ],
  };
}

/**
 * One choice from a dropdown value: an index (number or [number]), the id itself, or the label.
 * @param {unknown} value
 * @param {Choice[]} choices
 * @returns {string | undefined}
 */
function pick(value, choices) {
  const v = Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
  if (typeof v === "number" || (typeof v === "string" && /^\d{1,3}$/.test(v.trim()))) {
    return choices[Number(v)]?.id;
  }
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return (choices.find((c) => c.id === t) ?? choices.find((c) => c.label === t))?.id;
}

/**
 * Best unique free-text match: the choice whose tokens appear most often in the text.
 * Ties and zero scores return undefined, so an ambiguous request is rejected, not guessed.
 * @param {string} text
 * @param {Choice[]} choices
 * @param {(c: Choice) => string[]} [strong] tokens that count double (e.g. the chain name)
 */
function bestMatch(text, choices, strong = () => []) {
  const words = new Set(tokens(text));
  const flat = ` ${normalize(text)} `;
  let best;
  let bestScore = 0;
  let tie = false;
  for (const c of choices) {
    if (flat.includes(` ${normalize(c.id)} `)) return c.id;
    const strongTokens = new Set(strong(c).flatMap(tokens));
    let score = 0;
    for (const t of new Set(tokens([c.label, ...(c.aliases ?? [])].join(" ")))) if (words.has(t)) score += strongTokens.has(t) ? 2 : 1;
    if (score > bestScore) {
      best = c.id;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore > 0 && !tie ? best : undefined;
}

/**
 * Turn any supported request shape into the dashboard's ids-only job input.
 * @param {unknown} input object or string (JSON or free text)
 * @param {Catalog} catalog
 * @returns {{ productEan: string, stores: { id: string }[] }}
 */
export function resolveCatalogInput(input, catalog) {
  const { stores, products } = catalogChoices(catalog);
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      // free text, handled below
    }
  }
  /** @type {string | undefined} */
  let productEan;
  /** @type {string | undefined} */
  let storeId;
  if (typeof value === "object" && value !== null) {
    const o = /** @type {Record<string, unknown>} */ (value);
    const data = typeof o.input_data === "object" && o.input_data !== null ? /** @type {Record<string, unknown>} */ (o.input_data) : o;
    productEan = pick(data.productEan ?? data.product, products);
    const storeValue = data.storeId ?? data.store ?? (Array.isArray(data.stores) ? /** @type {any} */ (data.stores[0])?.id : undefined);
    storeId = pick(storeValue, stores);
  } else if (typeof value === "string") {
    const byChain = new Map(catalog.cities[0].stores.map((s) => [s.id, s.chain ?? s.name]));
    productEan = bestMatch(value, products);
    storeId = bestMatch(value, stores, (c) => [byChain.get(c.id) ?? ""]);
  }
  if (!productEan || !storeId) {
    const missing = [!productEan && "product", !storeId && "store"].filter(Boolean).join(" and ");
    const hint = 'Name the product and the store chain with its street, for example "Nutella at the REWE on August-Everding-Straße".';
    throw new BridgeError("input_schema_violation", `${REJECT} Could not identify the ${missing}. ${hint}`, { status: 422, details: { reasons: [{ code: "catalog_unresolved" }] } });
  }
  return { productEan, stores: [{ id: storeId }] };
}
