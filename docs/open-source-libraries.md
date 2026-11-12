# Open-source libraries we may use

Researched 2026-10-30 (Helmut's rule: no building on existing project repositories except the organisers' starters `tum-hackathon-quickstart` and `x402-express`; open-source libraries as dependencies are allowed). Versions, licences and dates come from `npm view` on 2026-10-30; weekly downloads from the npm API where noted. "Pin" means an exact version in `package.json` (no `^`), per `AGENTS.md`. Nothing here is installed. Licence check: all rows are OSI-approved unless flagged **NON-OSI**.

Already in the repo (do not duplicate): React 19.3.1, Vite 8.3.5, Express 4.21.2, zod 4.6.7, vitest 5.0.5, Testing Library 16.3.3, jsdom 30.1.3, tsx, sharp 0.34.5 (verifier), `@x402/*` 2.26.0, `@evolution-sdk/evolution` 0.5.14, TypeScript 6.0.3, ESLint 10, Prettier 3.9.10. Custom code planned by the design: redacting logger, `securityHeaders.ts`, `rateLimit.ts`, JPEG metadata stripper, JSONL ledger, session store, inline SVG icons, native `<dialog>` sheet and toast, plain CSS tokens.

Note on pins: the x402 template pins `@x402/*` 2.26.0 and `@evolution-sdk/evolution` 0.5.14; the registry now has `@x402/*` 2.29.0 and evolution 0.8.0. Do not bump during the event (AGENTS.md).

## 1. Vision model calls

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| plain `fetch` + zod | built in | - | One REST call to the chosen provider, `AbortSignal.timeout`, zod parse of the reply | This is the current plan (`packages/vision`) | **adopt now**: fewest moving parts, full control of error mapping (V7 requires never logging bodies) |
| `@google/genai` | 2.32.0 (2026-10-29) | Apache-2.0 | Official Gemini SDK, native `responseJsonSchema` structured output, image parts | Replaces hand-written Gemini request/response code | optional: use only if Gemini is chosen and the SDK saves time; pulls `ws`, `protobufjs`, `google-auth-library`, `p-retry@4` (12.5 MB unpacked) |
| `openai` | 7.45.1 (2026-10-27) | Apache-2.0 | Official OpenAI SDK, `zodResponseFormat` helper (peer `zod` ^3.25 or ^4), built-in retries and timeouts | Replaces OpenAI fetch code | optional: node >= 22, 23 MB unpacked; good if OpenAI is the chosen provider |
| `@anthropic-ai/sdk` | 1.3.0 (2026-10-23) | Apache-2.0 | Claude vision, only if Claude is evaluated | Same | skip unless C picks Claude; 15.7 MB |
| zod 4 `z.toJSONSchema()` | already in zod 4.6.7 | MIT | Turn the extraction zod schema into the JSON Schema the provider wants | Zero new dependency | **adopt now** (use instead of the library below) |
| `zod-to-json-schema` | 3.25.2 | ISC | Same, for zod 3 | Redundant with zod 4 built-in | skip: zod 4 has it natively |
| `p-retry` | 8.0.1 (2026-09-01, ~71M weekly) | MIT | Retry with backoff on 429/5xx | A 15-line loop does the same (`VISION_TIMEOUT`, serial queue) | optional: node >= 22 ok; adopt only if C does not want to write the loop. Never retry a paid x402 call with it |

Timeouts: `AbortSignal.timeout(ms)` is built into Node 24; no package needed.

## 2. Image handling

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| `sharp` | 0.34.5 (already pinned in verifier; latest 0.35.5, 2026-09-27) | Apache-2.0 | Header-only dimension read, resize, re-encode to JPEG (strips EXIF/GPS; kills polyglots), crop for the model | Overlaps the planned 50-line hand-rolled stripper | **adopt now** (security.md open item 8): re-encode is the stronger control; keep prebuilt binaries working with `--ignore-scripts`; move the import to `apps/engine` only if A needs it there. Keep the version already used; do not bump |
| `exifr` | 7.1.3 (2022-05-01, ~2.9M weekly) | MIT | Read EXIF/GPS for tests and diagnostics only | Not needed for stripping | skip for production; optional in tests to prove no `Exif`/GPS survives (a byte search for `Exif` already does that) |
| `exif-reader` | 2.0.3 (2025-12-12) | MIT | Alternative EXIF reader | Same | skip |
| `sharp-phash` | 2.2.0 (2024-10-31) | MIT | 64-bit perceptual hash on top of sharp for G7 duplicate/old-photo detection | Design G7 uses a content hash; perceptual hash catches re-shot or re-encoded duplicates | optional: peer `sharp` >= 0.32 fits; small (7.5 kB). Adopt only if C wants near-duplicate detection beyond exact hash |
| `blockhash-core` | 0.1.0 (2022-04-12) | MIT | Pure blockhash on raw pixels (no deps) | Same | skip: stale; use sharp-phash if needed |
| `imghash` | 1.1.5 (2026-10-14) | MIT | Blockhash from files | Pulls `jpeg-js`, `@canvas/image` | skip: heavier than sharp-phash |
| `jimp` | 1.6.1 | MIT | Pure-JS image ops | Overlaps sharp, slower | skip |
| `jpeg-js` | 0.4.4 (2022) | BSD-3-Clause | Pure-JS JPEG decode | Alternative to sharp, stale | skip |
| `@zxing/library` | 0.23.0 (2026-04-29) | Apache-2.0 | EAN-13/UPC decode from a frame (client or server) | New capability (barcode as extra match signal) | optional: engines `node >= 24` (ok); 11.8 MB unpacked; not in the MVP gates, so only if time remains |
| `@zxing/browser` | 0.2.1 (2026-07-06) | MIT | Browser camera + barcode wrapper | Same | skip: camera flow is custom (`getUserMedia`) |
| `barcode-detector` | 3.2.3 (2026-10-19) | MIT | Polyfill of the native `BarcodeDetector` API (WASM zxing-cpp), small | Same | optional: best barcode choice if wanted (native API on Chrome Android, polyfill elsewhere) |
| `@ericblade/quagga2` | 1.13.0 (2026-10-21) | MIT | 1D barcode scanning | Same | skip: 3.7 MB, older approach |
| `tesseract.js` | 7.0.0 (2025-12-15) | Apache-2.0 | OCR fallback if the vision model fails | The vision model already reads the tag | skip: slow, language-data downloads, poor on price tags; Plan B letter pack could revisit |
| `browser-image-compression` | 2.0.2 (2023-03-06) | MIT | Client resize/compress | Canvas `toBlob("image/jpeg", 0.85)` + resize is already in ui-design.md | skip: stale, redundant |
| `pica` | 10.0.3 (2026-08-15) | MIT | High-quality client resize | Same | skip: canvas is enough for the photo size cap |

## 3. Security

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| `helmet` | 8.3.0 (2026-07-12, ~22.6M weekly) | MIT | CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS etc. in one call | Replaces the planned `securityHeaders.ts` (security.md 4.4 calls it "helmet equivalent") | **adopt now**: configure the exact CSP from security.md, assert in `headers.sec.test`; wrapper stays 10 lines |
| `express-rate-limit` | 8.7.2 (2026-10-29, ~93M weekly) | MIT | Per-route and per-IP limits, custom key (session id), custom store | Replaces `rateLimit.ts` token bucket | **adopt now**: set `trust proxy` correctly behind the tunnel (else all clients share one IP); keep failed-admin-auth limiter via `skipSuccessfulRequests` |
| `cors` | 2.8.6 | MIT | CORS headers | Design says no CORS in production | skip: same-origin; Vite dev proxy covers dev |
| `csrf-csrf` | 4.0.3 (2025-05-27) | ISC | Double-submit CSRF token | Design uses `SameSite=Lax` + `Origin` check (E9) | skip: Origin check is enough for a same-origin JSON API |
| `cookie-parser` | 1.4.7 (2024-10-08) | MIT | Parse the `__Host-sid` cookie | Hand parsing is 5 lines | optional |
| `express-session` | 1.19.0 | MIT | Server-side sessions with store | Design has its own opaque-id store | skip: default MemoryStore warns, and the custom store is already specified |
| `iron-session` | 9.0.1 (2026-08-30) | MIT | Sealed stateless cookie session | Design is server-side store (revocable) | skip: node >= 22.13 ok, but stateless cookies cannot be revoked and add a second session model |
| `sanitize-html` | 2.18.1 | MIT | HTML sanitising | We never render HTML; React escapes, zod limits `displayName` | skip |
| `dompurify` | 3.4.17 | MPL-2.0 OR Apache-2.0 | HTML sanitising in browser | Same | skip: no `dangerouslySetInnerHTML` |
| `fast-check` | 4.10.2 (2026-09-19) | MIT | Property tests (parsers, ID validation, path containment, state machines) | Complements vitest | optional: strong for price/EAN parsers and the payout queue |

Secret scanning stays with gitleaks. Vite CSP: set headers on the Express side (helmet) for the built static files; dev server needs no CSP.

## 4. Login and identity (workers, brands)

Constraint from security.md 4.1: tier S0 is a pasted preprod address plus a server-issued opaque session (default); tier S1 is CIP-30 `signData` verified server side. Brands use Sokosumi (no brand login in the MVP).

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| Signed/opaque session cookie (custom, `node:crypto`) | built in | - | S0 session as designed | This is the design | **adopt now** (no library) |
| `@cardano-foundation/cardano-verify-datasignature` | 1.0.11 (2026-05-06) | Apache-2.0 | Server-side verification of CIP-30 `signData` (COSE_Sign1) against address/key | Saves writing COSE parsing for S1 | **adopt now if S1 is attempted**: 2.6 MB; verify it checks the address-to-key-hash binding and test against a real wallet signature; fall back to S0 if it fails by Friday evening |
| `@emurgo/cardano-message-signing-nodejs` | 1.1.0 (2026-07-03) | MIT | Low-level COSE_Sign1 parsing (WASM) | Alternative to the row above | optional: only if the verify package is insufficient |
| `@cardano-sdk/crypto` | 0.4.7 (node >= 22) | Apache-2.0 | Ed25519 / blake2b | Overlaps what evolution-sdk already bundles | skip |
| `@simplewebauthn/server` + `/browser` | 14.0.3 / 14.0.0 | MIT | Passkeys | Not in the design; needs HTTPS origin and RP id tied to the tunnel hostname that changes on restart | skip: tunnel hostname instability breaks passkey RP ids; no value for a 30-hour demo |
| Magic link (custom) | - | - | Email login | Needs mail delivery | skip: no email infrastructure, adds PII |

Recommendation: ship S0 (pasted address + opaque session, as in security.md) first; add S1 with the CF verify package only after M2; no passkeys, no magic links.

## 5. UI

Constraint: ui-design.md wants system fonts, plain CSS tokens, about 14 hand-built components, native `<select>`, native `<dialog>` sheet, inline SVG icons "copied into the repo", and says a heavy UI kit fights the look.

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| `@radix-ui/react-dialog` | 1.3.1 (2026-10-14) | MIT | Accessible dialog/focus trap | Native `<dialog>` is the design | skip: native dialog already gives focus management; revisit only if Safari `<dialog>` bugs bite |
| `@headlessui/react` | 2.2.10 | MIT | Headless primitives | Same | skip |
| `@ark-ui/react` | 5.40.0 (3.3 MB) | MIT | Headless primitives | Same | skip |
| shadcn-style copy-in | - | MIT | Tailwind + Radix copy-in components | Adds Tailwind and a look unlike Apple HIG | skip |
| `lucide-react` | 1.65.0 (2026-10-30, ~130M weekly) | ISC | Line icons (1.75 px stroke matches the plan) | Design copies about 12 inline SVGs by hand | optional: named imports tree-shake; use if D wants speed over the hand-copied set; keep `aria-hidden`. The package is 38 MB unpacked on disk but ships only the icons imported |
| `qrcode` | 1.5.4 (2025-11-13) | MIT | QR as SVG/data URL for the worker link and dashboard (ADR-06 regenerates the QR when the tunnel hostname changes) | New capability | **adopt now**: server or client; `toString(text, {type: "svg"})` |
| `qrcode.react` | 4.2.0 (2024-12-11, ~13.7M weekly) | ISC | React component version | Same as above | optional: choose one of the two QR packages, not both; `qrcode.react` is simpler in React |
| `leaflet` | 1.9.4 (2025-08-16) | BSD-2-Clause | Map with OSM tiles | Map view is roadmap, not MVP (webapps.md 6) | skip for the MVP; if used, call Leaflet directly in a `useEffect` and obey the OSM tile usage policy (attribution, no heavy use) |
| `react-leaflet` | 5.0.0 | **Hippocratic-2.1 (NON-OSI)** | React bindings for Leaflet | - | **do not add**: licence is not OSI-approved (ethical-source licence); use plain `leaflet` if a map is ever needed |
| `sonner` | 2.0.8 (2026-08-09) | MIT | Toasts | The design specifies a simple `role="status"` pill toast (about 30 lines) | skip: our toast spec differs |
| `react-hot-toast` | 2.6.1 | MIT | Toasts | Same | skip |
| `recharts` | 3.10.1 (2026-10-29, 7.5 MB) | MIT | Dashboard charts | Dashboard needs tables, status pills and a ledger, not charts, in the MVP | skip for the MVP; optional later for price distribution (roadmap) |
| `motion` | 14.8.0 | MIT | Animation | ui-design.md: motion only 150-250 ms `transform`/`opacity`, "never decorate" | skip: CSS transitions suffice |

## 6. Camera, geolocation, PWA, geodistance

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| Browser APIs `getUserMedia`, `geolocation`, canvas `toBlob` | built in | - | Live camera, location at shutter, JPEG export | The design | **adopt now** (no library) |
| `haversine-distance` | 1.2.4 (2025-06-18, 5.9 kB) | MIT | Distance engine-side for the geofence (default 150 m) | 10 lines of code does it | optional: fine to write inline; use the package only if a unit-tested helper is wanted |
| `geolib` | 4.0.1 (2026-10-30) | MIT | Distance, bounding boxes, point-in-polygon | Same | optional: use only if polygons are needed; the version was published today, so wait before trusting a fresh major release |
| `vite-plugin-pwa` | 2.0.0 (2026-10-03, node >= 20.19) | MIT | Installable PWA, service worker | A service worker over the changing tunnel hostname risks stale caches | skip: no offline need; camera works without it |

## 7. Cardano and x402

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| `@x402/express`, `@x402/core`, `@x402/cardano`, `@x402/fetch` | 2.26.0 (template pin; registry has 2.29.0) | Apache-2.0 | Seller/buyer | Already installed | keep the template pin; do not bump |
| `@evolution-sdk/evolution` | 0.5.14 (template pin; registry has 0.8.0, 2026-10-28) | MIT | Transactions, plain-transfer payouts | Already installed | keep the template pin; verify Friday that it can send plain transfers (ADR-04) |
| `@blockfrost/blockfrost-js` | 6.2.0 (2026-08-21, node >= 20) | Apache-2.0 | Tx lookup by hash, tx UTxOs and metadata, address history for reconcile | Reconcile can use plain `fetch` to the Blockfrost REST API with zod (3 endpoints) | optional: use the SDK if B wants typed calls; otherwise `fetch`. Key stays server-side |
| `@meshsdk/core` | 1.9.1 (2026-06-19) | Apache-2.0 | Wallet-agnostic CIP-30 browser connector (`BrowserWallet`) | Overlaps what the worker page needs only for `enable()` and `signData` | skip: the CIP-30 calls are plain `window.cardano[name].enable()`; Mesh adds a large transitive tree |
| `@meshsdk/react` | 2.0.0-beta.2 | Apache-2.0 | Connect-wallet UI | Pre-release, bundles Radix and a styled look | skip: beta, fights ui-design.md |
| `@cardano-foundation/cardano-connect-with-wallet` | 0.2.22 (2026-05-16) | Apache-2.0 | React wallet connect hook/button | Needs `styled-components` peer | skip: peer dependency and its own styling; hand-written 40 lines of CIP-30 is enough |
| `@lucid-evolution/lucid` | 0.8.9 (2026-10-29) | MIT | Alternative Cardano tx builder / wallet API | Overlaps `@evolution-sdk/evolution` | skip: two Cardano SDKs would conflict |
| `lucid-cardano` | 0.10.11 (2026-02-04) | MIT | Legacy | Same | skip: legacy |

Mobile CIP-30: phone browsers rarely inject `window.cardano` (webapps.md open item 11), so the paste-address tier stays the default; no library fixes this, and the Cardano peer-connect route needs a wallet app that most demo phones will not have.

## 8. Backend utilities

| Library | Version to pin | Licence | Use | Overlaps existing? | Verdict |
|---|---|---|---|---|---|
| SSE (hand-written `res.write("data: ...")`) | built in | - | Task feed and ledger stream | Express 4 handles it with headers + heartbeat | **adopt now** (no library) |
| `eventsource-parser` | 4.1.3 (node >= 22.12) | MIT | Parse SSE in tests or Node clients | Browser `EventSource` is built in | skip |
| `better-sqlite3` | 13.0.3 (2026-08-05, node >= 22) | MIT | Persistence with queries | ADR-10 chose in-memory plus append-only log; native build risk on four laptops | skip: ADR-10 rationale stands; revisit only per its own condition |
| `lowdb` | 7.0.1 (2025-03-06) | MIT | JSON file store | Same | skip: JSONL log plus Store interface already decided |
| `proper-lockfile` | 4.1.2 (2022) | MIT | File locks | Single process owns the ledger | skip |
| `pino` | 10.4.0 (2026-10-02, ~76M weekly) | MIT | Structured JSON logs with `redact` paths | Overlaps the zero-dependency redacting logger (security.md 4.6, `logger.sec.test`) | skip: the custom logger already has key-based redaction and tests; do not run two loggers |
| `croner` | 11.0.0 (2026-10-27) | MIT | Cron/timers | Window ends and claim TTLs use `setTimeout` plus persisted deadlines | skip |
| `node-cron` | 4.6.0 | ISC | Cron | Same | skip |
| `multer` | 2.5.0 (2026-10-22) | MIT | Multipart uploads | Design is a JSON body with base64 and a size limit (B1, 4.3) | skip: no multipart path exists; a second upload route would double the attack surface |
| `busboy` | 1.6.0 (2026-04-24; registry licence field empty, repository states MIT, verify before pinning) | MIT (unverified in registry) | Multipart streaming | Same | skip |
| `supertest` | 7.3.1 (2026-10-02) | MIT | HTTP assertions on the Express app without a port | Planned `*.sec.test` files need an HTTP harness; Node `fetch` against `app.listen(0)` also works | **adopt now**: `devDependency`, tiny, works with vitest |
| `msw` | 3.0.3 (2026-10-10, node >= 22.12) | MIT | Mock the vision provider HTTP | A fake HTTP server (`node:http`) is already in the test plan | optional: nicer than a hand-made server for provider fakes |
| `@playwright/test` | 1.64.1 (2026-10-30) | Apache-2.0 | Phone-flow E2E (camera via fake media flags, geolocation grants) | Not in the plan; Testing Library covers component states | optional: adds browser downloads (hundreds of MB); use only for one scripted mobile smoke if B/D have time |
| `fast-check` | see section 3 | MIT | Property tests | - | optional |

## Recommended additions for today

Highest value per minute saved, in order. Each needs a one-line reason in the commit message and an exact pin.

1. `helmet` 8.3.0: replaces `securityHeaders.ts`; CSP per security.md 4.4. (A)
2. `express-rate-limit` 8.7.2: replaces the token-bucket limiter; set `trust proxy` for the tunnel. (A)
3. `sharp` 0.34.5 (keep the pin already in the verifier): re-encode uploads to strip EXIF/GPS and read dimensions from the header; closes U1/U2 and security open item 8. (A/C)
4. `supertest` 7.3.1 (dev): HTTP harness for the `*.sec.test` suite. (A)
5. `zod` 4 `z.toJSONSchema()` (already installed): provider JSON schema from the extraction schema; no new package. (C)
6. `qrcode` 1.5.4 or `qrcode.react` 4.2.0 (one of them): worker-link QR on the dashboard, regenerated when the tunnel hostname changes. (D)
7. `@cardano-foundation/cardano-verify-datasignature` 1.0.11: only when tier S1 starts; test against a real wallet signature. (A)
8. `fast-check` 4.10.2 (dev, optional): property tests for price/EAN parsers and ID validation. (C)
9. `lucide-react` 1.65.0 (optional): only if D prefers it to the hand-copied SVG set.
10. `sharp-phash` 2.2.0 (optional): only if C adds near-duplicate detection to G7.

Provider SDK (`@google/genai` 2.32.0 or `openai` 7.45.1): decide when C picks the model; plain `fetch` is the default.

## Do not add

| Library | Reason |
|---|---|
| `react-leaflet` 5.0.0 | Licence is Hippocratic-2.1, not OSI-approved. Use `leaflet` directly if a map is needed (roadmap) |
| `pino` | Overlaps the custom redacting logger and its tests; two loggers risk unredacted output |
| `better-sqlite3`, `lowdb` | ADR-10: in-memory plus JSONL; native build risk |
| `multer`, `busboy` | Uploads are base64 JSON by design; multipart is a second attack surface |
| `express-session`, `iron-session`, `csrf-csrf`, `cors` | Session, CSRF and CORS are specified (opaque server-side session, Origin check, same-origin) |
| `@simplewebauthn/*` | Passkeys need a stable RP id; the tunnel hostname changes |
| `@meshsdk/*`, `@cardano-foundation/cardano-connect-with-wallet`, `@lucid-evolution/lucid`, `lucid-cardano` | Second Cardano SDK or styled wallet UI; CIP-30 is a few lines; beta packages |
| Radix, Headless UI, Ark UI, shadcn, MUI-class kits | Native `<dialog>`, `<select>` and plain CSS are the design; adds bundle and look drift |
| `sonner`, `react-hot-toast`, `motion`, `recharts` | Toast and motion are specified by hand; no charts in the MVP |
| `vite-plugin-pwa` | Stale service worker over a changing tunnel hostname; no offline need |
| `tesseract.js`, `@ericblade/quagga2`, `@zxing/browser`, `browser-image-compression`, `pica`, `jimp`, `jpeg-js`, `imghash`, `blockhash-core` | Redundant with the vision model, canvas, or sharp; stale or heavy |
| `zod-to-json-schema` | Zod 4 has `z.toJSONSchema()` |
| `@x402/*` 2.29.0, `@evolution-sdk/evolution` 0.8.0 | Newer than the template pins; no bumps during the event |

## Rule for additions

- Every new dependency needs a one-line reason in the commit message (what it replaces or enables) and Helmut's OK before install (AGENTS.md: ask the human before any new dependency).
- Exact version pin in `package.json` (no `^` or `~`), lockfile changed only by `npm install`, never by hand.
- Check before adding: OSI licence, last publish date, Node 24 and browser support, transitive size, and whether it overlaps code the design already specifies.
- Open-source libraries only as dependencies; no copying of other project repositories into ours. Organisers' starters are the only exception (note each in `codigo/docs/verified.md` with its pinned commit).
- Versions in this file are a snapshot of 2026-10-30; re-run `npm view <pkg> version license time.modified` before pinning, and record any difference in the commit message.
