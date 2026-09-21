# Team collaboration implementation — September 18, 2026

These modules extend the existing authenticated business; they do not create another business namespace or alter historical records.

## Files

`server/src/files/index.ts` registers authenticated `/api/v1/files` routes. Authentication precedes parsing, including rejected/oversized uploads; writes also require exact-origin CSRF. `PUT /:uuid` sends a selected file as raw `application/octet-stream` with `parentType`, `parentId` and `name` query fields. The browser retains each UUID for uncertain-response retries. Valid parent records must belong to the signed-in business. Same-business authorized employees can upload, read, recoverably remove and restore.

Private immutable files are written and fsynced before the attachment's database transaction commits. Storage keys are generated UUID filenames, never user paths, and are absent from snapshot and upload responses. Original parent relationships remain in the database. Project/client views derive descendants without creating new binaries; unfiled saved tasks can have attachments and later move to a project. Removal updates `removed_at` only. Downloads of removed files return404 until restored. Download names are sanitized, `nosniff`, no-store, same-origin and restrictive file CSP headers are sent.

Configuration is `PIRATA_UPLOADS_PATH` (default: database-adjacent `uploads`) and `PIRATA_STORAGE_LIMIT_BYTES` (default2GiB). It must stay outside all public web roots. Quota includes previews, removed files and private unfinished/orphan files. Operators must increase storage or review retention explicitly; there is no user hard-delete operation.

Photos accept20MiB and PDFs25MiB. Signature checks reject HTML, SVG, executables, videos and unsupported types; claimed upload MIME/extensions are not trusted. Images are fully decoded and normalized into EXIF-oriented JPEG with a1400px preview; metadata is stripped. JPEG/PNG/WebP use sharp. HEIC uses libheif WASM through heic-convert, then sharp for compatible JPEG output. Decode is limited to24MP and one concurrent worker,192MiB JS heap,20seconds total, with12second sharp processing bounds. Native image buffers require the separately scoped1GiB Pirata process memory limit. PDFs are structurally parsed using pdf-lib, restricted to1–2000 pages, and reject encrypted/unreadable documents and active-content dictionaries/actions. Live files never enter localStorage.

The browser uses file inputs supported by Safari, explicit phone camera capture, XHR upload progress, useful errors and retry with stable IDs. Actual iPhone hardware testing remains separate from browser-engine tests. Reference API docs: https://sharp.pixelplumbing.com/api-constructor/ and https://sharp.pixelplumbing.com/security/; https://github.com/catdad-experiments/heic-convert; https://pdf-lib.js.org/docs/api/classes/pdfdocument.

Backups must take the consistent SQLite snapshot first, then copy its immutable referenced `storage_key` and `preview_key` files (including removed attachments), and fail if any referenced file is missing. The deployment agent owns the installed backup/recovery scripts and deployment README; do not restore only the database for this version. Retain file hashes/manifests with the DB backup. Orphan binaries are private and can be reviewed independently; never remove binaries still referenced by a recovered snapshot.

## Shared work

The global Updates and project Updates panel show attributed messages, current work/timers and server activity. The coordinator's revision-aware polling refreshes open clients. React keys use activity IDs; command receipts prevent replayed messages from duplicating. File additions produce project/task activity. Financial command activity is not included in the shared feed.

Project notes allow a title and optional body, pin state, product/brand, color/code, finish, quantity, store and an existing project/task file as a label reference. Adding a note to Shopping is explicit. Checking Shopping never writes an expense, material adjustment or stock quantity.

## Cleanup

Equipment rules store cleaning minutes and maximum delay. Recording use creates at most one open obligation for an equipment item; a database partial unique index reinforces this. Its responsible person, first-use timestamp, latest deadline and estimated minutes are captured once. Due time is the earlier of business end-of-day or the fixed deadline; late-day use is due immediately when end-of-day has already passed. Business time resolves America/New_York DST. Rule edits and repeated uses cannot extend existing deadlines or duplicate obligations. No labor/time entries are fabricated.

Use without a configured rule is still attributed activity and shows a setup warning; no safety interval is guessed. Snooze must be later than the existing due time and current time, but no later than the captured deadline. Every snooze preserves responsibility and stores who postponed it, when and both due times. Mark cleaned completes the obligation. Later new use starts a distinct cycle.

## Verification

`server/tests/modules/collaboration` covers private uploads before parsing, CSRF/parent ownership, normalization/previews, recoverable removal, idempotent UUID retries, content rejection, size/quota/decoder bounds, real HEIC conversion, fixed cleanup deadlines/DST/dedup/responsibility, no-rule behavior and shopping separation. `web/tests/unit/fileHierarchy.test.ts` covers ancestry and moving an unfiled task without binary duplication. The HEIC sample's source is recorded beside its test fixture; PNG/PDF fixtures are generated synthetic data. `web/tests/team/collaboration.spec.ts` exercises browser uploads, recovery, notes, Shopping and equipment cleanup; screenshots are `web/artifacts/screenshots/team-files-notes-{chromium,webkit}-{320,390,768,1280}.png` and `team-cleanup-{chromium,webkit}-{320,390,768,1280}.png` after a successful run.

Verification checkpoint:14 focused collaboration/files API/domain tests passed, including a real HEIC file converted through the authenticated route;2 hierarchy unit tests passed. The combined team browser scenarios passed2/2 in Chromium and2/2 in Playwright WebKit using a private local HTTPS harness. WebKit exercised real Secure-cookie session authentication, JPEG/PDF selection/upload, recoverable removal/restoration, paint notes, Shopping, cleanup dedup/completion, account permissions, updates, daily completion, Calendar and Add navigation.12 targeted WebKit files/notes/cleanup screenshots across320/390/768/1280px were opened and visually inspected; readable controls, responsive wrapping and scrolling were confirmed. This is WebKit-engine coverage, not an actual iPhone camera, Safari hardware or phone photo-library check. The separate real HEIC test is server decoding evidence.
