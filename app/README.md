# Aldia citizen app

Flutter / Dart app for Android, iOS and the Linux demo, in Spanish (Guatemala). Citizens report street problems with a
live photo. Contract: `../documentation/api-contract.md`; UI decisions: `../documentation/ui/app-ui-notes.md`.
No reference assets, copy or code are included.

## Flow

- First run: three skippable onboarding slides, remembered locally.
- Five bottom destinations: **Inicio**, **Avisos**, **Reportar**, **Mis reportes**, **Perfil**.
- Inicio shows the resolved count from `GET /api/stats` (`resueltos`, with a v0.1 fallback). A failed request shows an
  unavailable marker and leaves both actions usable. The counter follows the server's default reporting period;
  it does not claim to be an all-time total.
- **Explorar mi ciudad** opens a full-screen map with floating controls: back, a **Mapa | Lista** switch and a
  filter button with the number of active filters. The map adds zoom, my location, layers, a state legend and
  loading/empty/error messages; pins show the category icon on the state color with the state word below. One
  `ExploreQuery` (`features/home/explore_query.dart`, see `app/GLOSSARY.md`) decides what both modes show: Mapa and
  Lista always show the same reports for the visible area. Without filters the map shows clusters (requested 3 zoom
  levels out, so they sit about 128 px apart); tapping one lists every report in its grid cell, and a one-report
  cluster is drawn as its state pin when its report is among the newest 100 of the area. Clusters fall back to
  individual reports. **Filtros** opens a sheet with search plus category and state-group chips (`state_group`);
  any filter or search switches the map to pins, and search is matched in the app on the loaded reports. Results
  come 100 at a time: the map says when more exist, and Lista has **Ver más**.
- Wizard: **Ubicación → Categoría → Foto → Detalles → Revisar y enviar** (the nearby-duplicates step was removed). Every step has a summary of
  the chosen place/category. Location supports explicit address search, GPS and the map pin; the app never
  shows or asks for coordinates;
  **CONFIRMAR UBICACIÓN** remains at the bottom. Categories and groups come from `GET /api/categories`, with offline
  contract defaults. A report rejected by the verifier as a duplicate still shows the existing report.
  A live photo is mandatory. Retake and verifier feedback remain available.
- Cards show a large photo (with **Foto verificada** when verified), status dot **and word** beside follow and share,
  category, street address, note and **Enviado hace…**. The API has no address field, so the app looks the address
  up with `GeocoderService.reverse` (see below); until it answers, or when there is none, it says **Punto marcado en
  el mapa**. Mis reportes groups queued reports and drafts under **Sin enviar (n)**.
  Hearts are device-local follows; followed reports appear in Mis reportes and feed the local inbox.
- Sharing uses Android/iOS system sheets (WhatsApp when installed), Linux's WhatsApp web handler, and a copied public
  link as fallback. Configure `PUBLIC_PORTAL_URL` before sharing outside the development laptop.
- Avisos records state changes observed when refreshing the device's own/followed reports or opening their details. The first
  observation establishes a quiet baseline. Inbox/follows survive restarts; there is no push or background polling.
- Login comes first: after onboarding, the app shows **Entra a Aldia** until the citizen has an account, and the
  report flow never asks for a phone. Phone-code verification uses Guatemala's `+502` prefix and eight national digits;
  the code has six digits and resending is disabled for 60 seconds. An optional display name stays private unless
  explicitly opted into publication. Logging out returns to the login screen.
- **MVP test account:** while the login method (citizen ID or email) is undecided, **Entrar con cuenta de prueba**
  enters without a server login. It is local to the device and reports are sent without credentials, so the API must
  keep `REQUIRE_CITIZEN_LOGIN=false` (its default). Build with `--dart-define=ALLOW_TEST_ACCOUNT=false` to hide it.
- Perfil shows only the verified number's masked last two digits and **Cerrar sesión**. **Borrar mis datos** confirms
  before deleting local drafts/photos, outbox, follows, notices, sent-report ids and the local login session. Already
  submitted public reports remain on the server; this does not delete the citizen account.
- Mis reportes merges paginated `GET /api/citizens/me/reports` account reports with device-local ids and follows,
  deduplicated by report id. Local items remain usable when the account endpoint cannot be reached.

Citizen wording for all 11 states stays in `lib/core/citizen_states.dart`; v0.1 responses derive it from verifier status
and resolution. A stub verifier is always labeled as a test.

## Persistence and accessibility

Drafts and the outbox retain JSON plus photos in app-private storage (`path_provider`). Each report keeps one persisted
`Idempotency-Key`; offline delivery retries when connectivity returns and on resume. Old photo-first drafts still
restore; missing photo files require retaking the photo without discarding other fields. The selected address label is
local draft metadata and is not added to the API upload.

`LocalCitizenStore` uses `shared_preferences` for follows, observed states and up to 100 notices.
Citizen credentials use exact-pinned `flutter_secure_storage: 11.2.0`: one device UUID, the opaque bearer token,
absolute expiry and masked phone only. Raw phone/code values are transient and never written to preferences,
drafts or outbox. Tokens expire after 90 days; verification rotates the prior token for that device. Requests
include `X-Device-ID` with the bearer, including outbox retries. Offline logout clears local credentials and
explains that server revocation could not be confirmed; verify again online to rotate the server token.
It defaults to memory in tests. Inbox storage failures do not trigger another upload of an accepted report.

Aldia's shared palette remains in `lib/core/theme.dart` and `../documentation/design-tokens.md`. Screens preserve semantics, 48 dp targets, the light scheme (the app is light only, as in Figma; the dark scheme is kept unused),
scrollable layouts at 200% text and reduced-motion routes, sheets and tabs. Tests inject offline map tiles, GPS, camera
and geocoder; they never query Nominatim.

## Address search

The demo injects `GeocoderService` with a shared `NominatimGeocoder`. Searches require **Buscar** or Enter, debounce
450 ms, serialize requests at most once per second, cache up to 50 queries, identify Aldia and restrict countries to
`gt,co,mx`. Typing does not issue autocomplete requests. Results and maps display OpenStreetMap attribution.
`reverse()` turns a report's point into a short address ("road number, area, city") through the same 1/s queue,
cached per point (about 10 m) for the session, up to 200 points. A long Explorar list therefore fills addresses
in about one card per second; an `address` field in the API would remove these requests.

The [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits autocomplete and caps
traffic at one request/second **across the whole app**, not per user. This implementation is for a single-device demo;
before multi-user deployment inject a centrally rate-limited proxy/provider with a remotely switchable endpoint.
Only search public street locations; do not send confidential information. Map tiles are also for light demo use.

## Run

Run the app quality gates from the repository root with `make -C app lint test`.
They use `mise exec -- flutter analyze --no-pub` and `flutter test --no-pub` with
the existing dependency resolution. An already installed SDK can be selected with
`FLUTTER=/path/to/flutter`. This Flutter area uses Dart analysis; Ruff and mypy
are Python tools and are not substitutes for these checks. Widget tests need a
runner that permits Flutter's local loopback test socket.

```bash
mise exec -- flutter pub get
mise exec -- flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api  # Android
mise exec -- flutter run --dart-define=API_BASE_URL=http://localhost:8000/api # iOS simulator, camera required
mise exec -- flutter build linux --debug
mise exec -- flutter run -d linux --dart-define=API_BASE_URL=http://localhost:8000/api --dart-define=DEV_FAKE_CAMERA=true
```

`DEV_FAKE_CAMERA=true` works **only in debug on non-mobile targets**. It draws a labeled synthetic 640×480 PNG in code,
with no asset or gallery access. Android/iOS always request the live camera, including simulator/debug. Release builds
never use the fake, even if the define is supplied. A desktop release needs a real camera implementation to report.

Other defines: `API_BASE_URL`, `TILE_URL`, `PUBLIC_PORTAL_URL` (default `http://localhost:5173`, links use `#/reports/<id>`).
Use HTTPS outside local development. Push, remote deletion and actual manual review remain pending.

### Phone-code demo (nothing is sent)

Run the API with exact `ENV=dev` and `CITIZEN_SMS_PROVIDER=console`, after applying migration `0005`.
The six-digit development code appears only in the API log under a loud DEV banner; no SMS or WhatsApp
message is sent. Use synthetic numbers only. The default `null` provider refuses delivery. Read the code
locally; never paste it, phone numbers or bearer credentials into shared logs or screenshots.

The app requires an account by default (`REQUIRE_CITIZEN_LOGIN=true`); `--dart-define=REQUIRE_CITIZEN_LOGIN=false`
restores anonymous use for demos. The API default stays false, which the MVP test account needs. A valid session automatically authenticates later submissions. Signing
out preserves local report references; account reports become available again after verification.

Provisional outbox behavior: queued reports use the session active when actually sent. Switching accounts while
items are queued can associate an unsent item with the new account, or produce an idempotency conflict if an
earlier accepted upload used the prior account. Drain or delete pending items before changing accounts in this
demo. Persisted account binding and an explicit account-switch queue policy remain follow-up work.

Linux needs a Secret Service/keyring and the build dependency `libsecret` (for example `libsecret-1-dev`
on Debian/Ubuntu). Keychain Sharing entitlements are wired for all iOS runner configurations; Android
backup is disabled to prevent restoring device-bound encrypted credentials without their key. Native
secure-storage behavior still requires device/platform validation; unit/widget tests use memory fakes.
Web storage is browser-based and requires HTTPS or localhost, so native device storage is the release target.

## Mobile distribution

See [mobile-release.md](../documentation/mobile-release.md) for debug APK installation, signed Android releases,
unsigned iOS archives, TestFlight setup, account-only steps and Spanish store copy. CI uses Flutter 3.47.9's official
release tag, matching the existing CI. Android/iOS icons and splash marks are original generated assets:
`python3 scripts/generate_icons.py` (Pillow on the development machine only, no new Flutter dependency).

The provisional Android application ID is `org.aldia.aldia_app` (confirm/change before store creation). iOS uses
`org.aldia.aldiaApp`, with iOS 15.0 minimum. Both take release version/build numbers from `pubspec.yaml`.
Release signing never falls back to Android's debug key. `android/key.properties.example` documents local signing;
real signing files and credentials are ignored. No account or signing credential is needed for the debug APK or
the unsigned iOS workflow.

## Checks

```bash
mise exec -- dart format lib test
mise exec -- flutter analyze
mise exec -- flutter test
```

On a sandbox with a read-only installed SDK/cache, validation can use an existing writable SDK/cache without changing
project configuration:

```bash
mise exec -- env PATH=/tmp/aldia-flutter-sdk/bin:$PATH PUB_CACHE=/tmp/aldia-pub-cache flutter analyze --no-pub
```

For a sandbox desktop session, use temporary `XDG_CONFIG_HOME` / `XDG_DATA_HOME` and a temporary documents directory
in `user-dirs.dirs` so the demo can persist drafts without writing outside the allowed workspace.

## Layout

`lib/core/`: theme, strings, states and fallback categories. `lib/data/`: API, reports and local citizen storage.
`lib/services/`: location, geocoder, camera, sharing, connectivity and citizen identity services.
`lib/features/`: shell/explore, citizen inbox/profile, onboarding, wizard, details, mine, drafts and outbox.
`lib/widgets/`: report cards, states, map layers, empty states and reduced-motion routes.
`android/`, `ios/`, `linux/`: platform projects. Citizen login adds the approved secure-storage dependency only.
