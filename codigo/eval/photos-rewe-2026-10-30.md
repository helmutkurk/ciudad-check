Draft by Codex for Helmut (D), 2026-10-30; reviewer: Lorenz (C)

# REWE photo set — 2026-10-30

Training/evaluation draft for G3-G5. The 10 shelf photos contain no challenge code, so they are not challenge-code evidence: G2 has no training-set evidence (`no_challenge_in_training_set`). Expected verdicts below assume G2 is stubbed or ignored. The current eval runner still evaluates G2; these labels are therefore not ready for an unmodified live run.

Store reported for the set: a REWE near House of Communication, Munich. The catalog candidate is `rewe-81671-august-everding-strasse-20`, August-Everding-Straße 20, 81671 München, 254 m from the venue. Catalog data says its chain locator is unverified; the branch match remains **verify**.

## Photo labels

| Photo | Product / visible evidence | Quality / intent | Price, unit price, deposit | Expected verdict (G2 stubbed) | Reason / notes |
|---|---|---|---|---|---|
| `rewe-01.jpeg` | Cropped Adelholzener water and Giesinger bottles; no single target or price can be assigned | Blurry / negative_blur | Unreadable | FAIL | G3 `price_unreadable`; G2 has no challenge evidence |
| `rewe-02.jpeg` | Beverage aisle under GETRÄNKE sign; target and tag unreadable | Blurry / negative_blur | Unreadable | FAIL | G3 `price_unreadable`; G2 has no challenge evidence |
| `rewe-03.jpeg` | Giesinger bestie, 0.5 l; €1.05 tag is visible, but exact product/tag association is uncertain | Sharp / borderline | €1.05; unit price and deposit not confirmed | PASS (provisional) | Current verifier does not gate shelf-slot association; reviewer should confirm this borderline label. G2 has no challenge evidence. |
| `rewe-04.jpeg` | Lemonade bottles; motion blur obscures the product and shelf labels | Blurry / negative_blur | Unreadable | FAIL | G3 `price_unreadable`; G2 has no challenge evidence |
| `rewe-05.jpeg` | Giesinger Erhellung, 0.5 l | Sharp / positive | €1.69; €3.38/l; +€0.08 Pfand | PASS | Base price excludes Pfand; G2 has no challenge evidence. |
| `rewe-06.jpeg` | Bad Brambacher Garten-Limonade Zitrone and Pink Grapefruit, 0.5 l; separate tags | Sharp / positive | Both €0.95; €1.90/l; +€0.15 Pfand | PASS | Label targets Zitrone; both variants are in frame. G2 has no challenge evidence. |
| `rewe-07.jpeg` | Wider view of the same two Bad Brambacher variants and shelf tags | Sharp / positive | Both €0.95; €1.90/l; +€0.15 Pfand | PASS | Label targets Zitrone; multiple products in frame. G2 has no challenge evidence. |
| `rewe-08.jpeg` | Little Lunch Protein Bowl, Protein-licious, 350 g; motion-blurred tag | Blurry / negative_blur | €3.79 provisional human read; unit line not confirmed | FAIL | G3 `price_unreadable`; compare with sharp `rewe-09.jpeg`. G2 has no challenge evidence. |
| `rewe-09.jpeg` | Little Lunch Protein Bowl Protein-licious, 350 g; EAN 4260614720343 | Sharp / positive | €3.79; €10.83/kg; no deposit observed | PASS | Product, price, unit price, and EAN are readable. G2 has no challenge evidence. |
| `rewe-10.jpeg` | Garten-Limonade Zitrone, 0.5 l; product and €0.95 are partly readable | Partial / borderline | €0.95 provisional; unit price and deposit not confirmed | FAIL (provisional) | G3 `price_unreadable` or `low_confidence`; G2 has no challenge evidence. |

The machine-readable draft follows `codigo/eval/src/labels.ts`. Its schema requires `expectedCode` and a product EAN string; `EVAL-STUB-NO-CHALLENGE` is only a placeholder, and empty EANs mean no EAN was read from that photo. The G2 note above is not a verifier reason code. The `truth.priceValue` entries hold shelf price only; unit price and Pfand remain in each label's notes because the current schema has no fields for them.

## Catalog gaps

The current catalog search found no matching Giesinger, Bad Brambacher, or Little Lunch products. These are proposed records, not verified market price bands. `priceMinEur` and `priceMaxEur` repeat the photographed price only where the product/tag association is clear; a single shelf photo is not enough to establish a general range. Pfand is separate from product price. EAN is populated only where it is legible in the image.

```json
[
  {
    "id": "giesinger-bestie-0-5l",
    "ean": null,
    "name": "Giesinger bestie 0.5 l",
    "brand": "Giesinger",
    "packSize": "0.5 l",
    "category": "beer",
    "aliases": ["Giesinger bestie", "bestie"],
    "priceMinEur": null,
    "priceMaxEur": null,
    "sources": ["codigo/eval/photos/rewe-2026-10-30/rewe-03.jpeg"]
  },
  {
    "id": "giesinger-erhellung-0-5l",
    "ean": null,
    "name": "Giesinger Erhellung 0.5 l",
    "brand": "Giesinger",
    "packSize": "0.5 l",
    "category": "beer",
    "aliases": ["Erhellung", "Untergiesinger Erhellung"],
    "priceMinEur": 1.69,
    "priceMaxEur": 1.69,
    "sources": ["codigo/eval/photos/rewe-2026-10-30/rewe-05.jpeg"]
  },
  {
    "id": "bad-brambacher-garten-limonade-zitrone-0-5l",
    "ean": null,
    "name": "Bad Brambacher Garten-Limonade Zitrone 0.5 l",
    "brand": "Bad Brambacher",
    "packSize": "0.5 l",
    "category": "beverage",
    "aliases": ["Gartenlimo Zitrone", "Garten-Limonade Zitrone"],
    "priceMinEur": 0.95,
    "priceMaxEur": 0.95,
    "sources": [
      "codigo/eval/photos/rewe-2026-10-30/rewe-06.jpeg",
      "codigo/eval/photos/rewe-2026-10-30/rewe-07.jpeg"
    ]
  },
  {
    "id": "bad-brambacher-garten-limonade-pink-grapefruit-0-5l",
    "ean": null,
    "name": "Bad Brambacher Garten-Limonade Pink Grapefruit 0.5 l",
    "brand": "Bad Brambacher",
    "packSize": "0.5 l",
    "category": "beverage",
    "aliases": ["Gartenlimo Grapefruit", "Garten-Limonade Pink Grapefruit"],
    "priceMinEur": 0.95,
    "priceMaxEur": 0.95,
    "sources": [
      "codigo/eval/photos/rewe-2026-10-30/rewe-06.jpeg",
      "codigo/eval/photos/rewe-2026-10-30/rewe-07.jpeg"
    ]
  },
  {
    "id": "little-lunch-protein-bowl-protein-licious-350g",
    "ean": "4260614720343",
    "name": "Little Lunch Protein Bowl Protein-licious 350 g",
    "brand": "Little Lunch",
    "packSize": "350 g",
    "category": "ready meal",
    "aliases": ["Protein Bowl", "Protein-licious", "chickpeas and lentils"],
    "priceMinEur": 3.79,
    "priceMaxEur": 3.79,
    "sources": ["codigo/eval/photos/rewe-2026-10-30/rewe-09.jpeg"]
  }
]
```

For the Giesinger bestie proposal, the photo's tag reads €1.05 but the association is uncertain, so price bounds are intentionally null pending review. The other price bounds are single-photo snapshots from the unconfirmed REWE branch, not a regional or current catalog guarantee. The €0.08 and €0.15 Pfand amounts belong in price-tag extraction/reporting, not in the base `priceMinEur` / `priceMaxEur` values.

## Verifier prompt observations

1. REWE electronic shelf labels put the product/pack text on the left and the large shelf price on the right. Ask the extractor to keep the selected product text and displayed price paired from the same label.
2. The unit-price line sits below the large price and uses units such as `1 l = ...` or `1 kg = ...`; preserve it separately from the displayed shelf price.
3. Pfand appears as a separate `+ Pfand ...` line. The examples show €0.08 and €0.15; do not add Pfand to the shelf price.
4. Wider frames can show multiple variants and several adjacent tags. Use shelf position and product wording together; do not infer a product/tag association from brand similarity alone.
5. Motion blur can leave bottle branding recognizable while making the tag unreliable. Treat a partly legible price as a low-confidence or unreadable G3 extraction; do not fill missing digits from neighboring tags.
