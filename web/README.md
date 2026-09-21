# Figma update — September 19, 2026

See [FIGMA-IMPLEMENTATION.md](FIGMA-IMPLEMENTATION.md) for the current Figma screen
mapping, responsive screenshots and validation. This extends the existing team
app with amber accents and clearer navigation. There is no new API or database
migration. [TEAM-RECOVERY.md](deploy/TEAM-RECOVERY.md) records deployment and
rollback; older sections below are historical context.

# Design update — September 18, 2026

See [REDESIGN.md](REDESIGN.md) for navigation, task and file improvements,
responsive screenshots, and the focused Chromium/WebKit checks. This extends the
existing team app with no new database migration or API change. The current
release and rollback details remain in [deployed-release.json](deploy/deployed-release.json)
and [TEAM-RECOVERY.md](deploy/TEAM-RECOVERY.md).

# Team version — September 18, 2026

Current behavior, employee setup and secure AI configuration are documented in
[the project README](../README.md). Work · Ask · Updates · Menu supersedes the
historical Today navigation below. The black/grey/white theme and Add child-form
Back/Cancel/Escape protections are preserved. Team APIs retain the owner business
namespace and enforce owner-only financial/administrative access.

Read [TEAM-RECOVERY.md](deploy/TEAM-RECOVERY.md) for the current migration and
file-inclusive backup/cutover procedure. `deployed-release.json` identifies the
actual live pair. Historical records below are retained as implementation context.

# Morgan el Pirata — owner workspace

Canonical source: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/`.

The default entrypoint is the integrated owner workspace: a React frontend using
the sibling authenticated Fastify API and SQLite database. Today, Projects,
Clients, Inventory and More are connected to saved server records. Spending and
task lists are available through their related actions. New live workspaces
start empty.

The original browser-local Today demo remains available explicitly at
**`/?demo=1`**, with its existing storage key and samples. It does not synchronize
with the server. Live mode never silently switches to local writes when the API
fails.

The owner selected private access for `https://pirata.andresinbox.tech`.
HTTPS is activated with an owner-only access gate. The owner reports successful
app use; actual device/browser details are not recorded. See [deployment and recovery](deploy/README.md)
for the current DNS, access setup, release and verification record.

## Runtime and installation

Use the bundled Node.js 24.19.0 and pnpm 11.19.0. In each fresh shell:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata'
pnpm install --frozen-lockfile --prod=false
pnpm build
```

There is one root `pnpm-lock.yaml`. Shared domain and contract packages must be
built before the server/frontend and after shared-source changes; the root build
command does this in order. Do not add an npm/yarn lockfile or install a global
runtime for this project.

## Local development and preview

For the preserved demo, run from `web/`:

```bash
pnpm dev
```

Open **http://127.0.0.1:5173/?demo=1**. Vite binds to loopback with a strict port.
An occupied port is an error, preventing an accidental change of storage origin.

For a production build preview:

```bash
pnpm build
pnpm preview
```

Open **http://127.0.0.1:4173/?demo=1**. The dev and preview origins have separate
demo data. Vite's ordinary dev/preview config does not provide a live API proxy;
opening `/` there requires a separately configured same-origin backend. These
loopback addresses are not accessible from a separate phone.

For manual integrated development with a disposable real database, use the test
harness in two terminals, both with the runtime PATH above:

```bash
# Terminal 1, from the workspace root:
pnpm --filter @pirata/server harness
```

```bash
# Terminal 2, from web/:
pnpm exec vite --config vite.harness.config.ts
```

Open **http://127.0.0.1:5174/** for the actual integrated app. The harness creates
a temporary SQLite database and a synthetic owner; its fixture password is
`isolated-harness-password`. This password is only for disposable tests and is
not a production credential. The module-only entrypoint remains
`/tests/module-harness/`. The harness API listens on loopback port 3002 and never
uses the production database path. Stop it to discard its fixture.

Production uses same-origin HTTPS, a loopback API and managed services, not
Vite or this harness. See [backend operations](../server/README.md) and the
[deployment runbook](deploy/README.md) for the actual installation and owner setup.

## What is connected

- **Today:** up to three objectives per business date, current task, running
  timer, schedule, due follow-ups/maintenance/material shortages and daily spending.
  Objective completion is separate from task completion.
- **Clients and projects:** searchable clients/leads, contact details, archive
  and restore, required-note follow-up history, explicit lead conversion, linked
  projects, project details and completion/reopening. Completing a project does
  not finish tasks, stop a timer or release reservations.
- **Tasks and time:** create/edit tasks, estimates and notes, status changes,
  one active timer, pause/switch/finish, manual whole-minute entries and explicit
  corrections. Timed intervals retain real start/end timestamps across midnight.
- **Planning:** task scheduling/rescheduling and objective editing. Overlap
  handling is explicit; an estimate change does not move a saved schedule block.
- **Spending:** add/edit purchases, project or General business attribution,
  daily/project totals using integer cents. Editing updates the existing record.
- **Inventory:** materials, signed stock adjustments, requirements/reservations,
  equipment and maintenance. Stock adjustments do not create expenses.
- **Quick Add:** task, expense, manual time, material adjustment and lead.
- **More:** task/spending entrypoints, refresh, explicit active-session discard,
  business export, reviewed v1 demo import and sign-out.

The interface uses native dialogs, labelled fields, keyboard focus, dirty-draft
confirmation and success announcements. Follow-ups record history; they do not
send messages or email. There are no invoices, payments, profit calculations,
calendar-provider sync, service worker or offline install/write queue.

## Live state, retries and sessions

`src/state/serverStore.ts` owns accepted server snapshots. Successful mutations
use stable request IDs and refresh acknowledged state. The store does not publish
optimistic business writes or lower its accepted revision because an old receipt
is replayed. Drafts stay in their forms while snapshots refresh; stale revisions
require explicit refresh/review before a new save.

The visible workspace refreshes on focus/visibility changes and every 30 seconds.
The display clock advances from server time using a monotonic elapsed clock, with
America/New_York as the business timezone. Midnight changes the Today view, not
the stored dates of earlier objectives, purchases or schedule blocks. An open
objective editor retains the date it was opened for.

A lost save response is an unknown outcome: retry the same retained request.
If saving succeeded but refreshing failed, reload the saved result without
creating another mutation. Avoid reloading the whole page to dismiss an
unresolved save; form drafts and pending requests are held in memory.

Session expiry keeps loaded records and open drafts visible for recovery. Sign
in again in another tab when instructed, then retry the same save. Session/CSRF
values stay in memory or secure HTTP-only cookies; live business data is not
written into the demo's localStorage key. Successful sign-out clears loaded
business state from the page. It does not stop a running timer on the server.

Only one timer runs for the owner across devices. It continues while a tab or
browser is closed until explicitly paused, switched, finished or discarded.
The display tick does not create a database write each second.

## Export, import and recovery

**More → Data & recovery** downloads a credential-free v2 business export.
Database backup/restore is a separate private server operation; a business JSON
export is not a complete database backup. There is no production reset button
or automatic v2 export-restore endpoint.

The v1 demo import is explicit: read the same-origin browser demo or select a
previous export, validate it, inspect counts/warnings, choose how to handle an
active timer and confirm. Import only succeeds into an empty server workspace.
It preserves the original file/browser storage, keeps separate client/equipment
identities and rejects conflicts instead of replacing existing business records.
Samples remain labelled as samples in the import workflow.

Browser storage belongs to its browser and origin. Localhost, an IP address and
the HTTPS subdomain do not share records. In the original browser/origin, open `/?demo=1`, then Demo → Download demo export. Select that v1 file in the live workspace before moving data. VPS backups do not protect arbitrary phone localStorage or
files downloaded onto another device. See [deployment recovery](deploy/README.md)
for SQLite backups, scratch restores and off-VPS backup limitations.

## Preserved demo mode

`/?demo=1` uses the unchanged key:

```text
morgan-el-pirata:home-prototype:v1
```

The first launch or an explicit demo reset seeds fabricated data for the current
New York date: two projects, four tasks, three objectives, eight schedule blocks,
45 minutes of recorded work, $84.60 of purchases, materials, one maintenance item
and one lead. No timer starts automatically. Refresh and midnight do not reseed.

Demo commands validate a complete draft, persist it as one JSON value, then
publish it. Failed storage writes retain saved state and the open draft.
Corrupt content can be downloaded for recovery before an explicit reset.
Cross-tab changes to the demo key freeze editing until reload. If browser storage
is unavailable, the explicit in-memory demo warns that reload loses its changes.

A v1 export is available from **Demo → Download demo export** for migration or recovery. Demo reset is available from its **Demo** dialog and affects only this key.
It never resets live records or unrelated browser data. Private browsing or
browser cleanup can erase local demo records; this mode is not a server backup.

## Tests and verified results

Run the root checks after building shared packages:

```bash
# From the workspace root:
pnpm lint
pnpm test
pnpm build
python3 scripts/contract-manifest.py
python3 server/scripts/verify-operations.py
```

Browser commands, from `web/`:

```bash
pnpm test:e2e
pnpm exec playwright test --config tests/integration/playwright.config.ts
pnpm test:modules
```

The original E2E suite now explicitly opens `/?demo=1`. The integration suite
starts a fresh API and proxied Vite instance and exercises the actual default
app. Module tests use separate fixture harnesses; individual feature handoffs
record their focused commands and results. Do not run suites that need the same
ports concurrently. Build shared packages before browser runs; rebuilding them
while Vite serves tests can trigger HMR and invalidate a page.

Verified September 17, 2026:

- Workspace lint and build passed, including TypeScript checks.
- **120 server tests and 63 frontend unit tests passed.**
- The final UI rerun passed **44 original demo Chromium cases**, plus **two new demo-export cases** and **eight
  integrated app Chromium cases**.
- Integrated checks cover deliberate import/original preservation, objectives,
  purchase editing, Quick Add and attention actions, timer persistence,
  cross-context conflicts, navigation/keyboard behavior, export and sign-out.
- Layout checks cover 320px, 390×844, 768×1024 and 1280×900. Integrated screenshots
  are in `artifacts/screenshots/live-today-phone.png` and
  `artifacts/screenshots/live-today-desktop.png`.
- A sealed backend plus built frontend passed the isolated real-Caddy smoke
  test, including access gates, private paths, CSP, restart/timer persistence and
  purchase reload. Public HTTPS and anonymous-gate checks subsequently passed;
  the owner reports successful app use. Detailed device-specific checks remain
  separate from automated Chromium checks.

Playwright's Chromium/WebKit downloads can be installed when needed with
`pnpm exec playwright install chromium webkit`. WebKit is an explicit additional
project in the original demo suite:

```bash
PLAYWRIGHT_WEBKIT=1 pnpm test:e2e --project=webkit-phone
```

Historical note: the September 17 WebKit run was blocked by missing runtime
libraries. The current private runtime wrapper resolves that dependency issue,
and automated HTTPS WebKit checks now pass; see [REDESIGN.md](REDESIGN.md) for
coverage and repeatable commands. Physical iPhone/Safari testing remains
unavailable. Neither Chromium emulation nor automated WebKit is a device test.

## Source structure

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | Explicit live/default versus `demo=1` entry selection |
| `src/live/` | Live shell, sign-in, Today action wiring, dialogs and data tools |
| `src/services/` | Typed same-origin API adapter and shared module UI props |
| `src/state/serverStore.ts`, `serverProvider.tsx`, `serverContext.ts` | Accepted server state, refresh/session lifecycle and display clock |
| `src/features/clients-projects/`, `tasks-time/`, `planning/`, `spending/`, `inventory/` | Integrated feature interfaces and forms |
| `src/features/today/` | Shared Today presentation cards and preserved demo composition |
| `src/App.tsx`, `src/state/createAppStore.ts`, `AppProvider.tsx` | Original demo entry, transactional local store and context |
| `src/data/`, `src/features/dialogs/`, `src/features/quick-add/` | Preserved sample data, storage adapter and demo forms |
| `src/domain/`, `src/lib/` | Compatibility re-exports of shared domain/date/money/time code |
| `../packages/domain/`, `../packages/contracts/` | Shared validated business semantics, DTOs, commands and import contracts |
| `../server/` | Authenticated API, transactional handlers, SQLite migrations and recovery tools |
| `src/testing/`, `tests/module-harness/` | Explicit test-only module registry/mount |
| `tests/unit/`, `tests/e2e/`, `tests/integration/`, `tests/modules/` | Unit, preserved demo, full-app and focused module coverage |
| `deploy/` | Static release tooling, backend packaging/install, Caddy templates and backup/verification helpers |

The [implementation packets and handoffs](implementation/README.md) record
feature ownership and verified acceptance results. Production release IDs,
credentials setup completion, activation, rollback compatibility and external
checks belong in the [deployment record](deploy/README.md), not inferred from a
local build or test run.

## Quick Add navigation — September 18 update

In the live workspace, Back to Add menu, X, Cancel and native dialog dismissal
return each Add form to the choices. X/Escape from the choices closes Quick Add.
Unsaved edits require confirmation, and uncertain saves remain available for
retry. Successful saves still close the menu.

Verified: lint/build, 120 API tests, 63 frontend unit tests and 11 integrated
Chromium cases. New screenshots: `artifacts/screenshots/quick-add-phone.png` and
`artifacts/screenshots/quick-add-desktop.png`. Physical Android Back remains a
device check; no Android package, uploads or employee accounts were added by
this navigation release.

## Appearance

The default theme follows the owner's September 18 reference: black background,
charcoal cards and dialogs, grey controls, and white text. All live pages, sign-in
and the separate browser demo share these tokens. Native fields use the dark
color scheme even when the device is set to light. Status, warning and error
colors remain distinguishable with text labels.

Theme validation: lint/build and all 11 integrated Chromium checks passed, with
phone/desktop screenshots and a separate built-output preview covering feature
pages and dialogs. See `deploy/deployed-release.json` for the current release.
