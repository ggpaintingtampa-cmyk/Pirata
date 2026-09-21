# Task 01 — READY: Clients, Leads and Projects

Implemented by the coordinator in the canonical project, September 17, 2026.
This supersedes the earlier missing-foundation report. Foundation v2.0.0 exists
and its frozen manifest still matches. Task 01 is implemented and tested against
the real SQLite/API foundation; production integration and deployment remain
Tasks 06 and 07.

## Delivered

- Authenticated, owner-scoped client create/update/archive/restore. Edits retain
  IDs and creation timestamps; archive preserves project links and history.
- Lead create/update, required-note follow-ups, optional next date with explicit
  clearing, retained history, and atomic conversion to a new or selected client.
  Repeating conversion does not create another client or replace the chosen link.
- Project create/update/complete/reopen with client/address/notes. Completion
  changes only project status; active timers, tasks, schedule, recorded time,
  purchases and reservations remain intact. Confirmation shows unfinished tasks,
  individual reserved materials and any active timer before completion.
- Searchable Clients/Leads UI, archived-client filter, due-follow-up filter,
  details and editing; Open/Completed project list and project details.
- Project tasks/time/spending are derived from the shared snapshot and existing
  selectors, with integer cents and milliseconds. Active elapsed time is included
  as of snapshot.serverNow and labelled as such. No profit/payment calculations.
- Native HTML dialogs, field labels/errors, first-invalid focus, Escape/focus
  restoration, dirty cancellation, responsive layouts and success announcements
  through onSaved. Save controls prevent repeat submissions. In-flight/uncertain
  saves cannot be discarded through Escape, X or Cancel.
- Request envelopes survive interrupted responses, real session/CSRF rotation,
  and retries; cached CSRF is refreshed through service.session without changing
  the request ID. An acknowledged save followed by failed refresh retries only
  refresh. Revision conflicts require explicit refresh/review while keeping drafts.

## Files

- `server/src/modules/clients-projects/index.ts` — ten actual handlers; capability ready.
- `server/tests/modules/clients-projects/clients-projects.test.ts` — 14 API/SQLite cases.
- `web/src/features/clients-projects/index.tsx` — required named UI entrypoints.
- Same UI folder: `forms.tsx`, `RecordForm.tsx`, `RecordModal.tsx`,
  `projectSummary.ts`, `styles.css`.
- `web/tests/modules/clients-projects/clients-projects.spec.ts` — 11 browser cases.
- `web/artifacts/screenshots/task01-projects-phone.png` and
  `web/artifacts/screenshots/task01-projects-desktop.png` — captured and inspected.

No migrations, auth implementation, shared contracts, lockfiles, dependencies,
global CSS, App.tsx, Today store or central registries changed for Task 01.
The coordinator also corrected implementation status documentation after verification.

## Verified

Run from `/home/andre/Desktop/LargeConcierge/Morgan el Pirata` with the bundled
Node 24.19.0 / pnpm 11.19.0 PATH documented in server/README.md:

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter @pirata/server exec vitest run tests/modules/clients-projects
pnpm --filter morgan-el-pirata-web test:modules tests/modules/clients-projects
pnpm --filter morgan-el-pirata-web test:e2e
python3 scripts/contract-manifest.py
```

- Lint: pass; strict workspace/server/tests/frontend build: pass.
- Full unit/API suite: 70 server tests and 56 frontend tests pass.
- Existing Today regression suite: all 44 Chromium desktop/phone cases pass.
- Task 01 subset: 14 real authenticated API/SQLite tests pass, including restart
  persistence, update identity, ownership, validation, conversion/receipt rollback,
  idempotent retries and completion preserving the active timer and related data.
- Task 01 browser suite: 11 pass using Chromium and a real temporary SQLite API.
  Includes phone CRUD, linked-project navigation callbacks, archive/restore,
  lead conversion/history, project completion/reopen, focus/dirty cancellation,
  lost response plus actual login rotation, stale revisions, failed refresh,
  in-flight dismissal guards and derived totals.
- Layouts checked at 320px, 390×844, 768×1024 and 1280×900: no horizontal
  overflow; dialogs fit and scroll; controls at least 44px; focus visible.
- Frozen contract manifest: unchanged and verified.
- WebKit/Safari remains untested because the host lacks previously documented
  libraries. No system packages were installed and no remote-phone claim is made.

The isolated browser suite uses a shared *test-only* browser context with a
fresh page per case, avoiding more than ten rapid fixture logins while leaving
the real login rate limiter enabled. It does not save or transfer cookies.
Its local openModule helper waits for the actual session response: the shared
helper has an initial-render/authenticated-reload race. Authentication, snapshot
and mutations all use the browser's real same-origin session. Playwright's
separate Node request client does not send Secure cookies to HTTP loopback.

Build before running the browser suites, not concurrently: rebuilding shared
packages while Vite is serving can trigger HMR and invalidate browser test pages.

## Integration contract for Task 06

Exports remain `ClientsView`, `ProjectsView`, `ProjectDetail`, each taking
`ModuleProps`. Existing explicit registry and server dispatch already discover
them; no registration changes are needed.

- `ClientsView` accepts initial `selection.clientId` or `selection.leadId` to
  open that detail dialog. For a new external selection, remount with a selection
  key after guarding any existing draft; ordinary snapshot refreshes must retain drafts.
- `ProjectsView` shows open/completed jobs. `onOpenProject(id)` selects
  `ProjectDetail` with `selection.projectId`.
- Client/project navigation uses `onOpenClient` and `onOpenProject`.
- Project task/expense interactions call `onOpenTask`, `onAddTask(projectId)`,
  `onOpenExpense`, `onAddExpense(projectId)`; their editors belong to Tasks 02/04.
- `onClose` from ProjectDetail returns to the project list; `onSaved` must feed
  a polite live region; `refresh` publishes only monotonic accepted snapshots.
- Keep unresolved feature forms mounted through re-authentication. Auth errors
  retain requests and refresh CSRF on retry; if signed out, the form explains
  signing in in another tab before retrying. Do not remount a failed form or
  generate a fresh mutation ID for an uncertain save.
- Follow-ups remain in the common snapshot and existing attention projection.
  No message or email is sent. Conversion retains lead/history/reminder fields.
- A linked project's `clientName` is retained fallback text: unrelated edits
  do not overwrite it. Display joins the client's current name. Linking a different
  client explicitly records that client's name; unlinked imported fallback is kept.
- Project totals include only that project's records; General business expenses
  remain projectId null and are excluded from project totals.

The actual Today app still uses its original local demo store and disabled
future navigation. Task 01 is ready for integration, not a claim that the normal
app now uses the server or that pirata.andresinbox.tech is deployed.

## Isolated manual preview

Use two terminals from the canonical root, setting the documented runtime PATH
in both. This uses fabricated records in a disposable test DB, not live business data:

```bash
# Terminal 1
pnpm --filter @pirata/server harness

# Terminal 2
pnpm --filter morgan-el-pirata-web exec vite --config vite.harness.config.ts
```

Open `http://127.0.0.1:5174/tests/module-harness/?module=clients-projects&view=ClientsView`
or change view to ProjectsView. Use the synthetic fixture password already
documented in `server/tests/harness.ts` (never a real account password).
Cross-feature callbacks intentionally display their destination in this harness;
Task 06 implements real navigation. Stop both processes before automated module
tests. The URL is loopback-only and is not exposed for remote phone access.

No DNS, firewall, proxy, production database, Hostinger credential, deployment
release or unrelated application was changed.
