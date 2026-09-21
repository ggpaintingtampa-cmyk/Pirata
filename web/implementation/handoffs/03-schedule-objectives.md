# Task 03 — Planning: Schedule and Daily Objectives

Status: **READY for coordinator integration**

Verified September 17, 2026 by Soldier 2, implemented together with Tasks/Time. This supersedes the historical missing-foundation report. Final app wiring and deployment belong to the coordinator.

## Delivered

- `objectives.replaceForDate`: at most three objectives including completed records, trimmed validated titles/notes, required blocker explanation, owned optional task links, stable IDs and ranks. Changes only the requested date. Rejects reusing an existing objective ID from another date. Reordering removes/reinserts only that date's rows inside the existing transaction to satisfy immediate unique-rank constraints, retaining IDs and createdAt (and unchanged rows' updatedAt). Failures restore the entire previous set and revision. No-op replacement performs no business writes. Task completion and objective completion stay independent.
- `schedule.setTaskBlock`: uses the shared helper, validates explicit date/minutes and same-day end-after-start, preserves one block per task and its identity on reschedule. Current task titles resolve through the existing snapshot mapping. Estimate/status edits preserve plan timing.
- Strict overlap predicate, same date, excluding the edited block; touching endpoints are allowed. UI explains conflicts and requires the explicit Save with overlap choice. The server rechecks the current transaction state and revision. Other blocks never move.
- `schedule.removeTaskBlock`: owner-scoped task check, removes only that task's plan, repeats as a no-op. Non-task commitments remain informational.
- Server capability is `ready`. All writes use existing validation/auth/transaction/revision/receipt infrastructure.

## Owned files

- `server/src/modules/planning/index.ts`
- `server/tests/modules/planning/planning.test.ts`
- `web/src/features/planning/index.tsx`, `styles.css`
- `web/tests/modules/planning/planning.spec.ts`
- `web/tests/modules/planning/artifacts/objectives-390.png`, `objectives-1280.png`
- This handoff.

The two modules share small feature-owned WorkForm/WorkDialog/time helpers under Tasks/Time, which is also owned by this assignment. No dependency on clients-projects private internals. Common Group A harness/config/helper files reside under the owned Tasks/Time test directories; see its handoff for the complete list. No shared infrastructure, central registration, Today/dialog wiring, global CSS, other feature modules or deployment files were edited.

## UI exports and integration

Both exports accept the existing `ModuleProps`:

- `ObjectiveEditor`: inline date-specific outcomes and derived completion count, with Edit outcomes opening one native modal. Defaults to the supplied businessDate (continues following that prop until the user explicitly chooses a date). An open draft keeps its original date through snapshot refresh/midnight. Choose another date outside the modal, then edit that date. Empty state: “Choose up to three outcomes for today.” Supports add/remove, Up/Down, statuses, optional task link and notes. Successful save refreshes and calls onSaved. Linked task navigation calls onOpenTask.
- `ScheduleTaskDialog`: directly opens a native modal; selection.taskId preselects a task and its existing plan. Without selection, choose a task; changing task loads its existing plan. It supports save/reschedule/removal, date and HH:MM fields (24:00 is accepted only as an end), and explicit overlap acceptance. Success refreshes, announces through onSaved, then calls onClose.

Mount these on Today and its planning actions; no full calendar page or external calendar was added. Do not wrap ScheduleTaskDialog in another modal. Keep dirty forms mounted across refresh/re-authentication. The common form helper retains original envelopes through uncertain saves/auth changes, pins initial/reviewed revisions, requires explicit conflict review, and retries only refresh after an acknowledged save. Escape/X/Cancel cannot discard an unresolved request. Native focus, field-error focus, dirty cancellation, polite announcements and 44px targets are supported.

## Verification

From the canonical root using bundled Node 24.19.0 and pnpm 11.19.0:

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

- **21 combined real SQLite/API tests pass**, including all **9 Planning cases**: fourth including done, blocker note, reorder/identity/date preservation, cross-date ID rejection, completion independence, invalid dates/times/ranks, touching endpoints vs overlap, edit self-exclusion, reschedule identity, removal/no-op, retries/stale revision, auth/CSRF/ownership and injected replacement rollback.
- **15 combined Chromium browser cases pass**, including **4 Planning cases**: empty state/three-outcome limit/status/validation/reorder/save/reload; date-specific edits and dirty removal cancellation; actual overlap rejection followed by explicit acceptance, unchanged other blocks, adjacency/reschedule/removal; lost objective response retries and stale scheduling refresh/review. Shared save/re-auth/dialog cases are also covered by Tasks/Time.
- **67 frontend unit tests pass** via the Group A source-resolving config.
- Scoped ESLint, full server typecheck, owned frontend/tests typecheck and isolated Group A production build **pass**.
- Planning phone and desktop screenshots listed above were captured and visually inspected. Objective dialog checked at 320/390/1280 widths; common dialog controls also tested at 768, with at least 44px targets and visible/restored focus.
- API 3003 / Vite 5182 use strict ports and disposable real fixtures; shared-source aliases avoid rebuilding packages during other browser runs. No live data, external calendar, outbound messages or system changes. No Safari/WebKit claim.

## Remaining coordinator work

There is no Planning-specific shared API/schema fix required. Wire the exports into Today with live services, monotonic snapshot publication, businessDate updates, guarded navigation and polite onSaved announcements.

During concurrent integration, default workspace tests/build began referencing `@pirata/contracts/import` before `packages/contracts/dist/import.js` existed. Default commands reproduced that missing compiled export; the Group A configs passed against the actual canonical shared source. The coordinator should finish its shared edits, build `@pirata/contracts` when browser runs are stopped, and rerun normal combined checks. Task 02's handoff records the exact repro and results. Do not mistake the passing isolated module build for final production integration or deployment.
