import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogChoices, inputSchemaFromCatalog, resolveCatalogInput } from "./catalog-input.js";
import { BridgeError } from "./errors.js";

// Shape of GET /api/catalog (engine), trimmed to a few real Munich entries.
const CATALOG = {
  cities: [
    {
      id: "munich",
      name: "München",
      stores: [
        { id: "rewe-81671-august-everding-strasse-20", name: "REWE", chain: "REWE", address: "Hanne-Hiob-Straße 10, 81671 München", aliases: ["August-Everding-Straße 20"] },
        { id: "lidl-81671-august-everding-strasse-20", name: "Lidl", chain: "Lidl", address: "August-Everding-Straße 20, 81671 München" },
        { id: "lidl-81667-orleansplatz-7", name: "Lidl", chain: "Lidl", address: "Orleansplatz 7, 81667 München" },
        { id: "aldi-81667-orleansplatz-2", name: "Aldi Süd", chain: "Aldi Süd", address: "Orleansplatz 2, 81667 München" },
      ],
      products: [
        { ean: "5449000000439", name: "Coca-Cola Original Taste 1,5 l" },
        { ean: "4008400402222", name: "Nutella 450 g" },
        { ean: "4066600204404", name: "Augustiner Lagerbier Hell 0,33 l" },
        { ean: "4066600641919", name: "Augustiner Edelstoff 0,33 l" },
      ],
    },
  ],
};

const IDS = (ean, store) => ({ productEan: ean, stores: [{ id: store }] });
const rejected = (e) => e instanceof BridgeError && e.code === "input_schema_violation";

describe("inputSchemaFromCatalog", () => {
  it("builds two single-choice MIP-003 dropdowns in a stable order", () => {
    const schema = inputSchemaFromCatalog(CATALOG);
    assert.deepEqual(
      schema.input_data.map((f) => [f.id, f.type, f.data.values.length]),
      [
        ["productEan", "option", 4],
        ["storeId", "option", 4],
      ],
    );
    assert.equal(schema.input_data[1].data.values[0], "Aldi Süd, Orleansplatz 2, 81667 München");
    assert.deepEqual(schema.input_data[0].validations, [
      { validation: "min", value: "1" },
      { validation: "max", value: "1" },
    ]);
  });
});

describe("resolveCatalogInput", () => {
  const { stores, products } = catalogChoices(CATALOG);
  const idx = (list, id) => list.findIndex((c) => c.id === id);

  it("maps Sokosumi dropdown indices back to catalog ids", () => {
    const input = { productEan: [idx(products, "4008400402222")], storeId: [idx(stores, "rewe-81671-august-everding-strasse-20")] };
    assert.deepEqual(resolveCatalogInput(input, CATALOG), IDS("4008400402222", "rewe-81671-august-everding-strasse-20"));
    assert.deepEqual(resolveCatalogInput(JSON.stringify({ input_data: input }), CATALOG), IDS("4008400402222", "rewe-81671-august-everding-strasse-20"));
  });

  it("accepts the dropdown label text", () => {
    const input = { productEan: "Nutella 450 g (EAN 4008400402222)", storeId: "Lidl, Orleansplatz 7, 81667 München" };
    assert.deepEqual(resolveCatalogInput(input, CATALOG), IDS("4008400402222", "lidl-81667-orleansplatz-7"));
  });

  it("resolves free text to one store and one product", () => {
    assert.deepEqual(
      resolveCatalogInput("Please check Nutella at the REWE on August-Everding-Strasse", CATALOG),
      IDS("4008400402222", "rewe-81671-august-everding-strasse-20"),
    );
    assert.deepEqual(
      resolveCatalogInput("Augustiner Edelstoff price, Lidl Orleansplatz", CATALOG),
      IDS("4066600641919", "lidl-81667-orleansplatz-7"),
    );
    assert.deepEqual(resolveCatalogInput("EAN 5449000000439 at aldi-81667-orleansplatz-2", CATALOG), IDS("5449000000439", "aldi-81667-orleansplatz-2"));
  });

  it("finds the REWE by its finder address or by its alias", () => {
    const ids = IDS("4008400402222", "rewe-81671-august-everding-strasse-20");
    assert.deepEqual(resolveCatalogInput("Nutella at the REWE, Hanne-Hiob-Straße 10", CATALOG), ids);
    assert.deepEqual(resolveCatalogInput({ productEan: "Nutella 450 g (EAN 4008400402222)", storeId: "REWE, Hanne-Hiob-Straße 10, 81671 München" }, CATALOG), ids);
  });

  it("rejects ambiguous or unknown requests instead of guessing", () => {
    assert.throws(() => resolveCatalogInput("Augustiner at the REWE on August-Everding-Strasse", CATALOG), rejected); // two Augustiner
    assert.throws(() => resolveCatalogInput("Nutella at a Lidl", CATALOG), rejected); // two Lidl
    assert.throws(() => resolveCatalogInput("Milka at Edeka", CATALOG), rejected);
    assert.throws(() => resolveCatalogInput({ productEan: [99], storeId: [0] }, CATALOG), rejected);
    assert.throws(() => resolveCatalogInput({ productEan: [0, 1], storeId: [0] }, CATALOG), rejected);
  });
});
