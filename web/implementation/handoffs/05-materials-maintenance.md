# Task 05 — READY: Inventory and Maintenance

Implemented and verified by soldier 1 on 2026-09-17, together with Task 04, in
the canonical Pirata project. Replaces the historical foundation blocker.

## Delivered

All 12 frozen handlers are implemented; `capability` is `ready`:

- `material.create/update/adjust`: strict text/unit/quantity validation,
  owner-scoped access and server IDs/timestamps. Nonzero opening stock inserts
  a correction history record atomically; zero creates no zero adjustment.
  Updates preserve stock/history. Unit changes with stock/history/requirements
  are rejected with an explicit message.
- Adjustments update stock and insert immutable history in the dispatcher's
  existing transaction. No negative/unsafe stock, fractional pieces or stock
  below reservations. BigInt intermediate comparisons protect safe-integer
  boundaries. No expenses are created or changed.
- `requirement.set/remove`: owned material/project, nonnegative whole-minor
  quantities, reserved <= needed and total reservations <= physical stock.
  Set upserts the unique pair, preserving identity/createdAt; explicit removal
  releases its reservation atomically. Project completion preserves reservations.
- The UI uses the existing materialShortages selector and compatibility projection
  without changing stable project/requirement order. Free stock is allocated once,
  is not added to physical stock and is not persisted as a reservation.
- `equipment.create/update/archive`: names, notes and reversible archive state;
  no hard deletion or history loss.
- `maintenance.create/update/complete/reopen`: optional owned equipment link,
  retained historical text, real due date, idempotent completion with server time,
  explicit reopening. Current equipment name takes display precedence while
  fallback text stays available. Due-today/overdue incomplete work feeds the
  shared attention selectors; future work does not.
- Material search/list, stock/reserved/free quantities, create/edit, signed
  adjustments, immutable history, per-project needs/reservations and shortages.
  Equipment create/edit/archive/restore, maintenance forms, status and history.
- Native dialogs replace content, never nest. Labels, first-invalid focus,
  retained drafts, dirty cancellation, focus restoration, 44px controls and scoped
  CSS. Stable mutation envelopes, auth/CSRF recovery, duplicate-submit prevention,
  uncertain-save dismissal guards and refresh-only recovery after acknowledged
  saves. Opening revision is retained until explicit conflict review.

## Files

- `server/src/modules/inventory/index.ts`
- `server/tests/modules/inventory/inventory.test.ts`, `concurrent-writer.ts`
- `web/src/features/inventory/index.tsx`, `forms.tsx`, `RecordForm.tsx`,
  `RecordModal.tsx`, `styles.css`
- `web/tests/modules/inventory/inventory.spec.ts` and `artifacts/` screenshots
- This handoff. Shared Group B test launchers/helpers are under the assigned
  spending test directories, as listed in the Task 04 handoff. The production
  Inventory feature does not import private helpers from Spending or Clients.

## Exact verification commands

From `/home/andre/Desktop/LargeConcierge/Morgan el Pirata`:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
pnpm --filter @pirata/server exec vitest run --config tests/modules/spending/vitest.group-b.config.ts
pnpm --filter @pirata/server typecheck
pnpm --filter @pirata/server exec eslint src/modules/spending src/modules/inventory tests/modules/spending tests/modules/inventory --max-warnings=0
pnpm --filter morgan-el-pirata-web exec eslint src/features/spending src/features/inventory tests/modules/spending tests/modules/inventory --max-warnings=0
pnpm --filter morgan-el-pirata-web exec tsc -p tests/modules/spending/tsconfig.group-b.json --noEmit
pnpm --filter morgan-el-pirata-web exec vite build --config tests/modules/spending/vite.group-b.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/modules/spending/playwright.group-b.config.ts --max-failures=3
```

- Node v24.19.0 / pnpm 11.19.0 verified; no installation or upgrades.
- **18 API/SQLite tests pass**, including 11 Inventory cases; **17 Chromium
  tests pass**, including 8 Inventory cases. Server typecheck, scoped lint with
  zero warnings, scoped frontend/test typecheck and Group B production build pass.
- API tests prove stock200/need500/reserved200 => shortage300; +300 restock
  clears it with spending unchanged; free stock isn't allocated twice; pieces,
  decimals, unsafe/negative/below-reservation stock rejected; pair identity kept;
  project completion preserves reservations; removal/receipt faults roll back;
  retry applies one adjustment; actual failed history insert rolls back stock
  (including opening-stock creation); unit history cannot be rewritten.
- Two actual simultaneous worker-thread SQLite writers cannot overbook stock;
  the stale writer conflicts, and retrying against the new revision rejects the
  unavailable reservation. No business constraints were disabled.
- Separate authenticated fixture owners supply inaccessible relationship IDs
  while preserving the production singleton-owner constraint. Tests reject those
  IDs, anonymous writes, wrong origin, invalid dates and unknown fields.
- Maintenance completion/reopening, future-date attention exclusion, renamed and
  archived equipment fallback/history, request replay and full backend/DB restart
  persistence are covered.
- Browser coverage: create material/equipment, edit reservation, restock and inspect
  shortage/history, remove reservation, maintain/archive equipment, complete/reopen,
  date filtering and refresh persistence. Invalid quantity focus/draft retention,
  dirty Cancel, uncertain adjustment replay with real CSRF rotation, stale revision
  review, refresh-only recovery and responsive/native-dialog behavior pass.
- Tested at 320, 390, 768 and 1280px; saved and visually inspected:
  `web/tests/modules/inventory/artifacts/inventory-390.png`,
  `web/tests/modules/inventory/artifacts/inventory-1280.png`, and
  `web/tests/modules/inventory/artifacts/material-dialog-390.png`.
- Latest browser report (the final two-case Spending rerun; the earlier full
  Group B suite passed all 17 cases): `web/tests/modules/spending/artifacts/report/index.html`.
  No WebKit/Safari or actual remote-phone coverage is claimed.

Group B uses a fresh disposable DB, strict API port3004 / Vite port5183 and only
these two UI modules. Its source aliases avoid shared package rebuilds while
other work is running. No live records, production credentials, schema/auth
bypasses, dependency changes or other AI's processes were used.

## Entry points and callbacks

`InventoryView`, `MaterialDetail`, `MaintenanceDetail` are exact ModuleProps
exports in `web/src/features/inventory/index.tsx`.

- InventoryView opens initial selection.materialId, equipmentId or maintenanceId
  when present; otherwise shows its material list. Tabs provide equipment and
  maintenance. selection.projectId is a default for a new requirement.
- MaterialDetail and MaintenanceDetail each open a native dialog directly using
  their selection ID. Today attention callbacks should mount these exports; for
  a shortage requirement, resolve its materialId from snapshot first. Do not wrap
  them in another modal. InventoryView owns its own native dialogs.
- Material requirement links call onOpenProject. The feature does not import
  another module's editors or add a separate store.
- Successful save calls refresh, then onSaved, then onClose. InventoryView's
  internal onClose returns to its list. External detail onClose belongs to the
  caller. Route onSaved to a polite live region.
- Keep forms mounted during ordinary snapshot refresh and reauthentication;
  do not throw away an uncertain request. Changing external selections should
  remount with a selection key only after guarding a draft. Publish monotonically
  accepted snapshots and keep review explicit after conflicts.

## Remaining coordinator work

No shared functional change is required by this module. Its handlers and exports
already use the central registry entries. Final Today/navigation wiring, all-app
integration/regression, deployment and live HTTPS remain coordinator work.

The full application build was attempted and failed at 14:13 UTC in concurrently
edited `web/src/live/LiveApp.tsx` and `web/src/live/dialogs.tsx`, outside ownership.
Exact errors/actions are recorded in `04-spending.md`. The default API command
also encountered an unbuilt new shared `@pirata/contracts/import` entrypoint;
current-source Group B API testing passes. Finish integration, coordinate a shared
package build if needed, then rerun the ordinary full build/test commands.

No auth, core transaction, migrations, contracts, shared service interfaces,
central registries, lockfiles, global styles, App.tsx, Today, deployment or system
configuration was edited. READY certifies these modules, not a finished live app.
