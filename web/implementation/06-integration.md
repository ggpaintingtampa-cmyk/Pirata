# Task 06 — Integration, migration and release review (stronger AI)

Run in LargeConcierge after READY handoffs from foundation and all five features.
Read their full code changes, frozen contracts and tests. Do not rely only on
agents' summaries. Source remains at `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.

## Integrate

1. Register the five modules and resolve shared changes yourself. Recheck atomic
   cross-module behavior: create scheduled task, timer switch/finish, lead
   conversion, material adjustment and reservation changes.
2. Implement one async application store/context and typed API adapter; connect
   every Today action and new module UI. Remove no-op placeholder success paths.
   Preserve existing browser-local demo mode and storage schema separately.
3. Connect real Projects, Clients and Inventory navigation. Add Spending through
   its View all entrypoint. Keep other unimplemented navigation visibly disabled.
   Preserve Today's mobile order, date, timer, sections, dialog behavior and FAB
   clearance. Retain draft input on failed saves and conflicts.
4. Add sign-in/logout/session expiry. Keep server data out of localStorage tokens
   and unrelated demo keys. After logout remove business data from client memory.
   Never fall back silently to local-only writes when the API fails.
5. Implement explicit validated v1 local-demo export and import preview. Import
   shows counts, validation errors and the fact that samples are samples. New
   live workspace starts empty. Import only into an empty live business workspace
   in this wave, with explicit confirmation; a nonempty workspace is rejected
   rather than overwritten or heuristically merged. Preserve browser original.
   Imported clientName/equipmentName fields have deterministic mapping; don't
   merge different people solely by name. Active timer import requires explicit
   carry/discard choice and conflict validation, not a hidden running timer.
6. Test server export/download, schema validation and restore into a scratch
   database. Record backup policy and actual coverage; VPS files do not back up
   arbitrary phone localStorage. Keep production reset disabled.

## Release gates

- All original money/date/objective/timer/stock invariants still pass.
- Two independent browser contexts share server records after refresh/focus,
  stale edits cannot overwrite each other, request retries are idempotent, and
  there is one active timer across both. Restart the test backend mid-scenario.
- Real auth/session/CSRF/authorization tests, SQL parameterization, no private
  payload logs, bounded requests and invalid record rejection. API route and
  static asset behavior tested through the proposed reverse proxy.
- DB migration, backup integrity and isolated restore tested. Unknown schema and
  bad imports preserve originals. No destructive migration hidden in startup.
- Existing + new lint/unit/integration/build/Chromium e2e checks pass. Test
  320,390x844,768x1024,1280x900; inspect screenshots and keyboard behavior.
- WebKit remains explicitly blocked until needed libraries are authorized and
  tests actually run. No claims based on Chromium alone.
- Production CSP works without weakening script-src. No mixed content, console
  errors, secret bundles, exposed DB/API port, service worker, or unintended routes.

Write `web/implementation/handoffs/06-integration.md` with verified acceptance
results, source/deployment artifacts, migration/rollback compatibility and READY
FOR DEPLOYMENT only when complete. The Server Upkeep task handles live service,
DNS/firewall/proxy changes. Don't mark the entire future Pirata product finished.
