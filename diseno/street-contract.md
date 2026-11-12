# Street contract (CiudadCheck)

Shared contract between the engine (`apps/engine`), the verifier (`apps/verifier`) and the web app (`apps/web`).
The zod schemas in `codigo/packages/core/src/street.ts` are the source of truth; this file must match them.
Change this file first, then the schema, in the same commit. Only the integrator changes the contract; branches
ask for changes in their PR notes.

Every schema name carries a `Street` prefix so it never collides with the legacy Shelfie schemas
(`SubmissionSchema`, `VerdictSchema`, `GateResultSchema` in `contracts.md`).

## 1. Categories

| id | Guatemala (GT, default) | Colombia (CO) |
|---|---|---|
| `ramp` | Rampa | Rampa |
| `sidewalk` | Banqueta / acera | Andén |
| `pothole` | Bache | Bache |
| `graffiti` | Graffiti | Graffiti |
| `drain_cover` | Alcantarilla sin tapa | Alcantarilla sin tapa |
| `street_light` | Luminaria apagada | Luminaria apagada |

Code uses the ids everywhere (data attributes, CSS suffixes, JSON). Labels come from
`STREET_CATEGORY_LABELS_GT` / `STREET_CATEGORY_LABELS_CO` or `streetCategoryLabels(country)`.

## 2. Entities

- **Report** (free, citizen): `{ id, category, lat, lng, accuracyM, capturedAt (server time), photoId, note?,
  status: "new"|"verified"|"rejected"|"repaired", clusterId, country? }`
- **Mission** (paid): `{ id, kind: "confirm"|"measure"|"repair_check", category, lat, lng, radiusM, beforeReportId?,
  payout: { amountMinor: integer, currency: "GTQ"|"COP" }, status: "open"|"claimed"|"submitted"|"passed"|"failed"|"expired",
  claimedBy?, expiresAt, country? }`
- **Submission**: `{ id, missionId?, reportId?, photoId, lat, lng, accuracyM, capturedAt, verdict? }`
- **Verdict**: `{ passed: boolean, category?, confidence: 0-1, gates: [{ name, passed, detail }], blurBoxes? }`.
  `detail` strings are Spanish (shown to workers). `blurBoxes` are normalised face/plate boxes.

Ids: `rep_`, `mis_`, `sub_`, `pho_`, `clu_`, `spy_` (payout), `wrk_` (worker), then 1-32 alphanumerics.
Amounts are integers in minor units (centavos). Payments stay `FAKE_PAYMENTS=1`: a local ledger of `StreetPayout`
records with `status: "simulated"`. No chain, no real money.

## 3. Engine HTTP (same origin, JSON, zod `.strict()` at the boundary)

| Method and path | Body / query | Response |
|---|---|---|
| `POST /api/reports` | `CreateStreetReportBody { category, photo, location: StreetFix, note? }` | `{ report, submission, verdict \| null }` (A1) |
| `GET /api/reports?bbox=minLng,minLat,maxLng,maxLat` | `StreetReportsQuery` | `StreetReport[]` |
| `POST /api/admin/missions` (`X-Admin-Token`) | `CreateStreetMissionBody` | `StreetMission` |
| `GET /api/missions?near=lat,lng&radiusKm=` | `StreetMissionsQuery` | `StreetMission[]` |
| `POST /api/missions/:id/claim` | `{ workerId }` | `StreetMission` |
| `POST /api/missions/:id/submit` | `{ workerId, photo, location: StreetFix }` | `{ submission, verdict, mission }` |
| `GET /api/evidence/:submissionId` | - | `StreetEvidencePack` (photo hash, time, place, gates, payout) |
| `GET /api/dashboard/summary` | - | `StreetDashboardSummary` (counts per category and status, payout totals per currency) |
| `GET /api/photos/:photoId` | - | `image/jpeg` (A2) |

`photo` is `{ mimeType: "image/jpeg", base64 }`. Errors use the common error body of `contracts.md` section 0.

## 4. Verifier

`POST /evaluate` with `StreetEvaluateRequest { pack: "street-check", submissionId, kind: "report"|"confirm"|"measure"|
"repair_check", category, photo, beforePhoto?, location: { lat, lng, accuracyM, capturedAt }, target: { lat, lng,
radiusM } }` returns a `StreetVerdict`. `beforePhoto` is required for `repair_check`.

Gates: all kinds run `image_ok`, `location_in_radius` (distance <= radiusM + min(accuracyM, cap)), `fix_fresh`,
`duplicate_photo`, `live_capture`, `category_match`; `measure` adds `reference_object`; `repair_check` adds `repaired`
and `before_after_same_place`. Thresholds come from the street pack (`packages/domain-street`), never inline in gates.
Model output is untrusted and validated with `StreetExtractionSchema` before any gate reads it.

## 5. Amendments approved 2026-11-12

- **A1.** `POST /api/reports` returns `{ report, submission, verdict | null }` so the app can show the Spanish reason.
  `verdict` is `null` when the verifier is unavailable; the report then stays `new`.
- **A2.** `GET /api/photos/:photoId` returns the cleaned JPEG, for the "antes" photo and the evidence page.
- **A3.** The client sends `location.fixAgeMs` (age of the GPS fix); the engine stamps `capturedAt` from server time
  and passes `capturedAt = now - fixAgeMs` to the verifier for `fix_fresh`.
- **A4.** Colombia: countries `GT` and `CO` (`StreetCountrySchema`, `streetCountryForPoint`), money currency
  `GTQ | COP` (`StreetMoneySchema`), `formatMoney` ("Q 12.50", "$ 5.000"; `formatGtq` kept as alias), Colombian labels
  (`STREET_CATEGORY_LABELS_CO`, sidewalk = "Andén"), optional `country` on reports and missions, payout totals per
  currency in the dashboard, pack payout defaults and maximums per currency.

## 6. Known demo limitations

- **Worker identity.** `workerId` travels in the claim and submit bodies (the phone stores a random `wrk_` id). This is
  NOT authentication: anyone who knows a worker id can submit for it. Wrong worker -> 403 `forbidden` is tested, but a
  server session cookie (`diseno/security.md`) is required before any real use.
- **Live capture.** No gesture challenge for street checks: `live_capture` relies on the vision read (not a photo of a
  screen) plus `fix_fresh`.
- **Duplicates.** `duplicate_photo` is per verifier process, keyed by `submissionId` so retries do not flag themselves;
  only hashes of passed submissions are kept.
- **Blur.** The verifier returns `blurBoxes`; applying the blur in the engine is a TODO. Demo photos are synthetic.
