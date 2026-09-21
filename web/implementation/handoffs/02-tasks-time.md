# Task 02 — Tasks and Time

Status: **READY for coordinator integration**

Verified September 17, 2026 by Soldier 2, together with Task 03. This replaces the historical missing-foundation handoff. Foundation READY and the frozen v2 interfaces were read and confirmed before coding. Final application wiring and deployment belong to the coordinator.

## Delivered

- All ten authenticated handlers implemented; `capability` is `ready`. The existing dispatcher owns authentication, strict validation, transactions, revision checks and request receipts. No alternative database, auth or command framework.
- Task create/update/status preserve identity and creation timestamps. Project references are owner-scoped. Estimate edits leave planned blocks unchanged. Initial task+plan creation uses the shared atomic helper, requires an estimate-length block, and rejects crossing midnight.
- One active timer per owner. Same-task start is a no-op; a different task needs an observed-session switch. Start/pause/switch/finish/block use authoritative server time and shared timer helpers. Stale sessions cannot stop a newer timer. Reopen retains history; finish/block affect only the selected task's timer. Zero-length closures create no entry; negative intervals require explicit correction/discard. Closed interval ID equals session ID. Cross-midnight timestamps remain exact.
- Manual time and explicit corrections preserve ID/task/source/creation time. Milliseconds are summed before display rounding. Running elapsed is included once, paused time excluded, and incomplete work never labels unused estimates as saved time.
- Native task editor, timer confirmations, manual/correction dialogs and task list. Timers display from snapshot.serverNow plus monotonic performance elapsed; display ticks never write. Clock inconsistencies are visible. No localStorage business data.
- Owned WorkForm/WorkDialog helpers preserve drafts and the original request through uncertain responses, 401/403 and actual session rotation. Re-authentication refreshes CSRF with service.session(). An acknowledged mutation with a failed refresh retries refresh only. In-flight/uncertain/acknowledged-but-unrefreshed dialogs cannot be dismissed via Escape/X/Cancel. Revision conflicts require explicit refresh/review; subsequent background refresh does not silently change a draft's reviewed base revision.

## Owned files

- `server/src/modules/tasks-time/index.ts`
- `server/tests/modules/tasks-time/tasks-time.test.ts`, `support.ts`, `harness.ts`, `tsconfig.harness.json`, `vitest.group-a.config.ts`
- `web/src/features/tasks-time/index.tsx`, `WorkForm.tsx`, `WorkDialog.tsx`, `time.ts`, `useServerNow.ts`, `styles.css`
- `web/tests/modules/tasks-time/tasks-time.spec.ts`, `time.test.ts`, `helpers.ts`, `harness/index.html`, `harness/mount.tsx`, `playwright.group-a.config.ts`, `vite.group-a.config.ts`, `vitest.group-a.config.ts`, `tsconfig.group-a.json`
- This handoff and owned test artifacts. Planning's owned changes are listed in Task 03's handoff.

No shared services/interfaces, central registration, App/Today components, global CSS, migrations, authentication, manifests, lockfiles, deployment or system configuration were edited. No other task was launched or messaged.

## Verification

Run from `/home/andre/Desktop/LargeConcierge/Morgan el Pirata` using the documented bundled runtime: Node v24.19.0, pnpm 11.19.0. Dependencies were not installed or upgraded.

```bash
pnpm --filter @pirata/server exec vitest run --config tests/modules/tasks-time/vitest.group-a.config.ts
pnpm --filter @pirata/server typecheck
pnpm --filter @pirata/server exec eslint src/modules/tasks-time src/modules/planning tests/modules/tasks-time tests/modules/planning
pnpm --filter morgan-el-pirata-web exec eslint src/features/tasks-time src/features/planning tests/modules/tasks-time tests/modules/planning
pnpm --filter morgan-el-pirata-web exec tsc -p tests/modules/tasks-time/tsconfig.group-a.json
pnpm --filter morgan-el-pirata-web exec vitest run --config tests/modules/tasks-time/vitest.group-a.config.ts
pnpm --filter morgan-el-pirata-web exec vite build --config tests/modules/tasks-time/vite.group-a.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/modules/tasks-time/playwright.group-a.config.ts
```

Results:

- **21 real authenticated SQLite/API tests pass**: 12 Tasks/Time, 9 Planning. Includes actual DB reopen, cross-owner rejection, auth/CSRF checks, idempotent replay, stale revisions, two authenticated sessions racing timer mutations, clock errors, and injected interval/receipt/schedule/objective write failures with rollback.
- **15 Chromium browser cases pass**: 11 Tasks/Time, 4 Planning. Includes two independently authenticated browser contexts racing rendered start/switch/pause controls (one succeeds, one conflicts), reload reconstruction, no display-tick writes, manual corrections, invalid draft/focus retention, dirty cancellation/focus restoration, lost response retries, 503 active-state retention, actual CSRF rotation, signed-out recovery, acknowledged-save refresh recovery, and revision review including a later background refresh.
- **67 frontend unit tests pass** through the source-resolving Group A config, including four new calculation/parser cases and the current existing unit suite.
- Server typecheck, owned frontend/tests typecheck and both scoped ESLint commands **pass**.
- Isolated Group A production bundle **passes** (127 transformed modules). This verifies these UI modules and real shared services; it is not a production release.
- Layouts checked at 320, 390, 768 and 1280 pixels; dialogs fit, controls are at least 44px, keyboard focus is visible. Screenshots captured and visually inspected:
  - `web/tests/modules/tasks-time/artifacts/timer-390.png`
  - `web/tests/modules/tasks-time/artifacts/timer-1280.png`
  - Planning phone/desktop screenshots are listed in its handoff.
- No WebKit/Safari claim; known missing host libraries were not installed. No live business data was used.

Group A owns API `127.0.0.1:3003` and Vite `127.0.0.1:5182`, strict ports, fresh disposable `/tmp` SQLite fixtures, and `web/tests/modules/tasks-time/artifacts/results`. It mounts only Tasks/Time and Planning UIs. It uses actual canonical shared source via test-only aliases so another task's shared-package build is not required or triggered. Real authentication and the real rate limiter remain enabled. One interrupted Group A API process was identified by its exact command/PID and stopped; other agents' servers were untouched.

## Shared build issue observed during concurrent integration

The original default API command passed all 21 tests before the coordinator added shared import/export code. Later default API/unit/build commands encountered a newly referenced package export whose compiled output did not yet exist:

```text
Cannot find package '@pirata/contracts/import'
packages/contracts/src/import.ts exists
packages/contracts/dist/import.js is absent
```

Repro commands: `pnpm --filter @pirata/server exec vitest run tests/modules/tasks-time tests/modules/planning`, `pnpm --filter morgan-el-pirata-web test`, and `pnpm --filter morgan-el-pirata-web build`. The last normal build reached frontend typechecking, then failed resolving this export. An earlier transient missing `web/src/live/LiveApp` during coordinator edits had disappeared by that final build attempt.

The coordinator should finish its shared edits and run `pnpm --filter @pirata/contracts build` after other browser runs stop, then rerun normal workspace tests/build. No shared source workaround was applied. The passing Group A configurations resolve the same canonical contracts/domain source directly. This is a shared build-artifact prerequisite for the combined app, not an unfinished Tasks/Time operation.

## UI contract and existing-component adapters

Every export uses the frozen `ModuleProps`:

- `TaskList`: filters by `selection.projectId` when supplied, otherwise shows all tasks. Add calls `onAddTask(projectId|null)`; Open calls `onOpenTask(id)`.
- `TaskEditor`: directly opens a native modal. `selection.taskId` edits; absent task ID creates. `selection.projectId` initializes a new task's project. A successful acknowledged save+refresh calls `onSaved`, then `onClose`.
- `TimerControls`: an inline panel, initially selecting `selection.taskId`, otherwise the running or first task. It owns one confirmation/correction modal at a time and contains status/reopen controls. Mount outside another modal.
- `TimeEntriesView`: filters by `selection.taskId` when present; otherwise shows all entries. Manual/correction dialogs preserve source and identity. Explicit timestamp corrections accept ISO strings with Z or an offset; elapsed display never uses phone wall-clock authority.

Coordinator adapters: supply the live ModuleProps to TimerControls from CurrentTaskCard's task selection; route existing TaskDialog metadata editing to TaskEditor. Place TimerControls/TimeEntriesView in the non-modal task detail context rather than nesting their dialogs inside the old TaskDialog. Use onOpenTask/onAddTask callbacks to change views. These original shared components were not modified.

Keep forms mounted on ordinary snapshot/focus/polling refresh and through re-authentication. Guard external navigation before remounting a selection. Provide a focusable `#main` fallback when an opener is removed by navigation, and send onSaved messages to a polite live region. The coordinator owns accepted-snapshot publication, periodic/focus refresh, live navigation, final Today wiring and deployment.
