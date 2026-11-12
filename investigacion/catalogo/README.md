# Seed catalog research (stores and products)

Research material for the intake filter (`diseno/contracts.md` section 1.1a, ADR-16). Not project code. Retrieved 2026-10-29 (Europe/Berlin). No code in `codigo/` before Fri 2026-10-30 09:00.

## Files
- `stores.json`: 24 Munich supermarket branches.
- `products.json`: 39 everyday products.

## Stores
Chains: REWE 7, EDEKA 4, Lidl 4, Aldi Süd 3, Penny 3, Netto Marken-Discount 2, Kaufland 1. Drugstores (dm, Rossmann) are skipped: the design covers supermarket price tags only.
Venue: House of Communication, Friedenstraße 24, 81671 München (Nominatim: 48.12755, 11.60937). Stores are sorted by `distanceToVenueM`. Within 500 m: REWE and Lidl at August-Everding-Straße 20 (254 / 263 m, Werksviertel), Lidl Orleansplatz 7 (363 m), EDEKA Ernst Orleansplatz 10-12 (394 m). Within 1 km: Aldi Süd Orleansplatz 2, EDEKA Annabrunner Str. 2, Penny Innsbrucker Ring 44. Central: REWE Tal 13 / EDEKA Tal 29 (Marienplatz), REWE Sendlinger Str. 46 and Penny Klenzestr. 26 (Sendlinger Tor), Lidl Leopoldstr. 21 (Schwabing), REWE Augustenstr. 78 and Lidl Luisenstr. 53 (Maxvorstadt, about 1 km from TUM Arcisstraße).

### Method and sources
1. OpenStreetMap (ODbL) via Overpass API, query `shop=supermarket` around the venue and the central points, 2026-10-29 (OSM data timestamp 20:03Z). Address (street, house number, postcode) and lat/lon come from the OSM object named in `coordSource`.
2. Cross-check: each address was geocoded with Nominatim; `nominatimCrossCheckDeviationM` is the distance to the OSM point (0-50 m for all 24).
3. `distanceToVenueM` is a straight-line (haversine) distance computed from the two coordinate pairs.
4. `geofenceRadiusM` is 150 for every store: a suggestion only (Helmut's geofence requirement), to be tuned on site. GPS indoors is poor.

### Limitations
- The chains' official store locators were not queried (REWE blocks scripted access with 403; others not tried), so `chainLocatorVerified` is false for every store. Verify the demo stores on the chain locator or on site before Friday.
- OSM coordinates are building or entrance points, not necessarily the shelf. Chains and opening hours can have changed.
- `preparacion/demo-props.md` lists REWE at Hanne-Hiob-Str. 10 (from the REWE finder); OSM puts the REWE at August-Everding-Straße 20 and an Asia Center at Hanne-Hiob-Straße 10. Both points are about 20 m apart. Resolved 2026-10-30: the REWE keeps its id and OSM coordinates (the 150 m geofence covers both) but is displayed as "REWE, Hanne-Hiob-Straße 10, 81671 München" (the address teammates know), with `aliases: ["August-Everding-Straße 20"]`; the Lidl stays at August-Everding-Straße 20.
- `address` has the form `Street No, PLZ München`; the contract says the address must match the catalog entry exactly, so the shell must use the same string.

## Products
39 records: 13 with an EAN-13 verified (checksum valid and Open Food Facts name/quantity matches, URL in `eanSource`), 7 with a price range, 4 of which also carry an EAN (Coca-Cola 1,5 l, Nutella, Barilla Spaghetti Nr. 5, Red Bull 250 ml); the other 3 have a range but `ean: null` (Weihenstephan Milch, Kerrygold, Milka).
Price method: offers and previous prices read on discounto.de pages (aggregator of chain flyers) on 2026-10-29, listed in `priceObservations` with chain, kind (promo, regular, previous price) and URL. `priceMinEur`/`priceMaxEur` are the lowest and highest observed value. REWE's own shop shows prices only after choosing a store and returns 403 to scripts; Open Food Facts / Open Prices has no German prices for these EANs. Where no usable observation exists, both fields are `null` and the engine falls back to the G5 defaults (0.20-60.00).
Limitations: observed values are mostly promotions; ranges are provisional and should be widened (for example by checking prices at the demo store on Thursday/Friday). Some sources (Aldi Nord, Müller, myTime.de) are not Munich catalog chains or do not state the pack size; this is in `notes`. Pfand (deposit) is not included in any price. `chainsCarrying` is only filled when a source showed the chain; `null` means unknown. Own-brand records (ja!, Milbona, Milsani, Gut & Günstig, K-Classic) rely on general knowledge of the brand-chain link, not a source.
Records with `ean: null` cannot be keyed in the contract's catalog (`ean` is the key): copy only records with an EAN, or read the EAN from the physical package of the demo product first (the demo needs the products bought anyway, `preparacion/demo-props.md`).
Rejected EAN guesses: Haribo 4001686301555 (unnamed 100 g item), Ritter Sport 4000417025005 (named marzipan), Oreo 7622300489434 (Norwegian 246 g), Heinz 5000157024671 (UK beans).

## Schema
Store: `id, chain, name, address, city ("Munich"), street, postcode, lat, lon, geofenceRadiusM, distanceToVenueM, coordSource, addressSource, nominatimCrossCheckDeviationM, chainLocatorVerified, retrievedAt`. Contract fields: `id, chain, name, address, city`; the rest is extra (lat/lon/geofenceRadiusM are new requirements).
Product: `id, ean, name, brand, packSize, category, aliases[], priceMinEur, priceMaxEur, priceObservations[], chainsCarrying, eanSource, eanNote, sources[], notes, retrievedAt`. Contract fields: `ean, name, aliases[], priceMinEur, priceMaxEur`.

## Copy on Friday (role C owns `domain-shelf`)
```
mkdir -p codigo/packages/domain-shelf/catalog
cp investigacion/catalogo/stores.json codigo/packages/domain-shelf/catalog/stores.json
cp investigacion/catalogo/products.json codigo/packages/domain-shelf/catalog/products.json
```
The zod schemas should ignore or strip the extra fields (or the copy step should keep only contract fields plus lat/lon/geofenceRadiusM/category). Filter out products with `ean: null` before seeding, and add the real demo product and store (contract: both must exist in the catalogs).


## Demo store (2026-10-30)
`demo-hoc-friedenstrasse-24` (chain DEMO, `demo: true`) is the stage shelf at the venue, House of Communication, Friedenstraße 24, 81671 München, for the live demo with props (`preparacion/demo-props.md`). It is NOT a real supermarket. Coordinates 48.1275499, 11.6093703 from OpenStreetMap Nominatim (node 7020339979, "Serviceplan - House Of Communication", ODbL, queried 2026-10-30; the earlier venue point 48.12755, 11.60937 agrees). Geofence 150 m.
