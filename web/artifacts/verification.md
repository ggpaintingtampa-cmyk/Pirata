# Verification record

Today home-screen prototype, verified September 17, 2026 (UTC).

## Passed

- ESLint: no errors or warnings.
- Vitest: 51 tests across four files.
- Strict TypeScript: source, configuration, and tests.
- Vite production build.
- Playwright: 44 tests, 22 each in desktop Chromium and mobile Chromium.
- Responsive inspection: 320px, 390 × 844, 768 × 1024, 1280 × 900.
- No horizontal overflow at required widths; final records scroll above the
  reserved Add/navigation area. Long task titles wrap at 320px.
- Keyboard focus, native dialogs, Escape, dirty cancellation/navigation,
  first invalid field focus, and focus restoration.
- Refresh persistence, editable records, all Quick Add forms, task timers,
  schedule conflicts, stock allocation, maintenance and follow-up completion.
- Corrupt-data preservation/download, failed-write rollback, explicit memory
  mode, cross-tab editing freeze, app-key-only reset, and New York midnight.
- Built-output smoke at http://127.0.0.1:4173/: production assets, phone layout,
  expense save and refresh, timer refresh and pause, reset, and no browser
  exceptions.

## Blocked

WebKit downloaded but did not launch. Playwright identified missing host
libraries: libevent-2.1-7t64, libgstreamer-plugins-bad1.0-0, libflite1, libavif16.
No system packages were installed. WebKit/Safari is not claimed as verified.
Enable its optional project with PLAYWRIGHT_WEBKIT=1 after the host provides
compatible dependencies.

Actual access from a physical remote phone was not configured or tested.
Both Vite servers bind to 127.0.0.1; no public or LAN exposure was introduced.

## Inspected captures

- screenshots/today-phone.png — 390 × 844.
- screenshots/today-desktop.png — 1280 × 900.
- screenshots/today-320.png — 320 × 844.
- screenshots/today-768.png — 768 × 1024.
- screenshots/lead-dialog-phone.png — native phone dialog.
- screenshots/preview-phone.png — built-output phone smoke.

The main Today captures use a deterministic September 16 fixture. The app
itself derives Today from the actual America/New_York date. Its business data
is seeded once and does not shift or reset automatically when that date changes.
