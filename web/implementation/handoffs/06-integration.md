# Task06 — Integration and recovery

Status: **READY**, September18,2026UTC. Coordinator implemented and verified.

## Delivered

Normal frontend entry now authenticates and uses a shared server snapshot store.
All five feature modules are connected to Today, navigation, project/client/task
links and Quick Add. Time derives from server timestamps with a monotonic display
clock. Session expiry retains drafts; explicit reauthentication and retained
request IDs support retries. Conflicts require review; background refresh cannot
silently rebase a dirty draft. Success is announced only after acknowledged saves.

The original app remains explicitly at `/?demo=1`; original storage/schema and
recovery/reset semantics are preserved. Demo → Download demo export makes v1
migration possible from the original browser origin without an API login.

Authenticated, CSRF-protected `/api/v1/import/preview` and `/api/v1/import` strictly
validate v1 records/relationships, normalize distinct client/equipment identities,
preserve IDs, money, dates, stock and recorded time, reject duplicate requirement
pairs and import only into an empty workspace. Active session carry/discard and
sample import require explicit confirmation. Import, revision and receipt are one
transaction; replay survives restart. Original source is never overwritten.
Business export contains no credentials; server SQLite backups remain separate.

More's import controller persists across navigation and blocks unresolved-save
signout, handles out-of-order file reads and retries unknown outcomes with the
same request. Objective dialogs retain their opened business date across midnight.

## Owned changes

- web/src/main.tsx, live/, state/server*, services/api.ts.
- server/src/integration/import.ts, app.ts import routes.
- packages/contracts/src/import.ts and reviewed package file allowlists.
- server/tests/integration/, web/tests/integration/, unit/serverStore.test.ts.
- Focused Task01 RecordForm revision preservation fix.
- Original demo URL tests and DemoInfoDialog export action/test.
- Backend concealed-input CLI race fix and operations regression check.
- Documentation, deployment scripts and reviewed shared manifest.

## Verification

Workspace lint/build;120server/63frontend tests;44original demo +2export browser
cases;8real integrated Chromium cases;11Task01 browser cases. Includes import
preservation/rollback/late failure, timers/reload/switch/finish, allQuickAdd,
stock-versus-money, maintenance/follow-up, expense edits, cross-browser conflicts,
unknown-save retry, schedule warnings, keyboard/focus, export/signout and layouts.

Actual production bundles passed isolated real-Caddy authentication/CSP/private
path tests and timer/purchase persistence across a real backend restart.
Built preview at127.0.0.1:4173/?demo=1 was smoke-tested.

Inspected screenshots: artifacts/screenshots/live-today-phone.png and
live-today-desktop.png. WebKit/Safari blocked by missing system libraries.

Production private installation/backup verification is documented in Task07.
Owner credentials and public deployment verification remain a separate gate;
integration READY does not imply an externally verified public site.
