# Task 04 — READY: Spending

Implemented and verified by soldier 1 on 2026-09-17 in the canonical Pirata
project. This replaces the historical missing-foundation handoff. Task 04 and
Task 05 were assigned together; no other AI task was launched or contacted.

## Delivered

- `expense.create` and `expense.update` are real synchronous authenticated
  handlers using the existing owner-bound repository/dispatcher. Capability is
  `ready`. Creation uses server IDs/timestamps; edits preserve ID/createdAt,
  replace the original record and detect no-ops.
- Frozen strict validation handles real purchase dates, trimmed descriptions,
  supported categories, positive safe integer cents and owned project references.
  General business is projectId null. No hard delete or accounting features.
- Native create/edit dialog, business-date default, project creation default,
  retained invalid drafts, field errors/first-invalid focus and dirty cancellation.
- Date/project filters, exact integer totals, project navigation and inline edit.
  `selectors.ts` exports `filteredExpenses`, `latestExpenses`, `expenseOrder` and
  `totalCents`. Latest-three order is createdAt descending, then ID ascending;
  updatedAt never changes that ordering. Aggregate overflow is detected instead
  of silently rounded. Money parsing/formatting uses shared helpers.
- Original mutation envelopes survive network loss and 401/403. Retry refreshes
  session/CSRF when necessary and retains request identity. In-flight/uncertain
  saves cannot be dismissed through Escape, X or Cancel. An acknowledged save
  whose refresh fails retries only refresh. No false success announcements.
- The form captures its opening revision. Background snapshot refresh cannot
  silently rebase a draft. Revision conflict requires explicit refresh/review;
  draft content survives that review. Business records never use localStorage.

## Files

- `server/src/modules/spending/index.ts`
- `server/tests/modules/spending/spending.test.ts` — 7 API/SQLite tests
- `server/tests/modules/spending/support.ts` — shared Group B fixture helpers
- `server/tests/modules/spending/harness.ts`, `tsconfig.harness.json`,
  `vitest.group-b.config.ts` — isolated Group B launch/configuration
- `web/src/features/spending/index.tsx`, `selectors.ts`, `RecordForm.tsx`,
  `RecordModal.tsx`, `styles.css`
- `web/tests/modules/spending/spending.spec.ts` — 9 Chromium tests
- Same test directory: `helpers.ts`, `mount.tsx`, `harness.html`,
  `playwright.group-b.config.ts`, `vite.group-b.config.ts`,
  `tsconfig.group-b.json`, and generated `artifacts/`
- This handoff. All authored files stay inside assigned Group B paths.

## Verification and exact commands

Run from `/home/andre/Desktop/LargeConcierge/Morgan el Pirata`:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
node --version
pnpm --version
pnpm --filter @pirata/server exec vitest run --config tests/modules/spending/vitest.group-b.config.ts
pnpm --filter @pirata/server typecheck
pnpm --filter @pirata/server exec eslint src/modules/spending src/modules/inventory tests/modules/spending tests/modules/inventory --max-warnings=0
pnpm --filter morgan-el-pirata-web exec eslint src/features/spending src/features/inventory tests/modules/spending tests/modules/inventory --max-warnings=0
pnpm --filter morgan-el-pirata-web exec tsc -p tests/modules/spending/tsconfig.group-b.json --noEmit
pnpm --filter morgan-el-pirata-web exec vite build --config tests/modules/spending/vite.group-b.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/modules/spending/playwright.group-b.config.ts --max-failures=3
```

- Runtime verified: Node v24.19.0; pnpm 11.19.0. No dependencies changed.
- Group B API suite: **18 passed** (7 spending, 11 inventory), real temporary
  SQLite and authenticated requests. Server typecheck: pass.
- Scoped server/frontend lint: pass, zero warnings. Group B frontend/tests
  strict typecheck: pass. Group B production Vite build: pass.
- Group B Chromium suite: **17 passed** (9 spending, 8 inventory), 40.2 seconds.
  Uses only 127.0.0.1:3004 and :5183, strict ports and a fresh temporary DB.
- API evidence includes exact 10+20=30 cents, 8460+2500=10960 then edit to
  11460 with same ID/count, date/project reassignment, general-business totals,
  creation timestamps, idempotency, stale revision, strict input/auth/ownership,
  real read-only storage and receipt faults, rollback and complete DB restart.
- Browser evidence includes phone add/edit/filter/reload; invalid-focus/dirty
  Cancel; lost successful response followed by real session rotation; signed-out
  recovery; unchanged retry payloads; explicit conflict review; failed refresh
  without a second mutation; in-flight dismissal guards and native keyboard focus.
- Layouts checked at 320, 390, 768 and 1280px. Saved and visually inspected:
  `web/tests/modules/spending/artifacts/spending-390.png` and
  `web/tests/modules/spending/artifacts/spending-1280.png`.
- Final targeted check: `pnpm --filter morgan-el-pirata-web exec playwright test
  --config tests/modules/spending/playwright.group-b.config.ts --grep 'phone purchase|decimal totals'`
  passed **2/2** after correcting the list's General business creation default and
  using locale-independent ID tie-breaking. Scoped lint/typecheck and the Group B
  production bundle were then rerun successfully.
- Latest browser HTML report (the final 2-case rerun):
  `web/tests/modules/spending/artifacts/report/index.html`.
  Isolated production bundle: `web/tests/modules/spending/artifacts/build/`.
- WebKit/Safari and actual remote phones were not tested. No system installs.

The original suggested API command without the Group B config passed all 18
cases initially. On a later run, coordinator changes imported
`@pirata/contracts/import` before its dist/import.js existed, preventing test
collection. The Group B configs resolve current canonical package source to
avoid rebuilding shared packages during parallel browser tests; the same 18
cases then passed against current source. This is test resolution only, not an
alternative backend or a change to shared contracts.

## UI entrypoints and integration

Both exports in `web/src/features/spending/index.tsx` take exact `ModuleProps`:

- `ExpenseForm`: `selection.expenseId` edits that purchase; absent ID creates.
  `selection.projectId` supplies the creation default. It opens its own native
  dialog: mount directly, do not wrap in another dialog. Calls onSaved only after
  mutation acknowledgment and successful refresh, then onClose.
- `ExpensesView`: defaults its date filter to businessDate and project filter to
  `selection.projectId` when supplied. It owns its add/edit dialogs; an initial
  `selection.expenseId` opens that editor. Project links call onOpenProject.
- Today View all should mount ExpensesView. Today's purchase edit callback and
  ProjectDetail's onOpenExpense should mount ExpenseForm with expenseId;
  onAddExpense should pass the desired projectId (or no ID for General business).
- Remount for a new external selection only after handling any open draft.
  Ordinary snapshot refresh must keep the component/form mounted. Keep unresolved
  requests mounted through sign-in, expose onSaved via a polite live region and
  publish only monotonic accepted snapshots from refresh.

## Coordinator work / shared findings

No shared code change is required for these module operations. No auth,
transaction, contracts, migration, lockfile, registry, global CSS, App.tsx,
Today/navigation or deployment file was edited.

`pnpm --filter morgan-el-pirata-web build` was attempted after the browser run.
At 14:13 UTC it failed only in concurrently edited integration files:

- `web/src/live/LiveApp.tsx`: missing `./DataTools` import target.
- `web/src/live/dialogs.tsx`: Dialog union access to `.id` without narrowing;
  quantity validator inferred a string-or-undefined record; objective validation
  errors inferred only `{count:string}` rather than a general field-error map.

The coordinator must finish those files and rerun the full application build.
It must also build current shared packages at a coordinated time before ordinary
non-source-alias commands if dist/import.js is still absent. These files were
left untouched; the independent Group B build/typechecks/tests pass.
Final Today/navigation wiring, import/export, full-app regression, deployment
and live-domain verification remain with the coordinator. READY here certifies
this implemented module, not the whole application or a public release.
