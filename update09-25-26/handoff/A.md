# Chunk A handoff — Daily page and task tree (update 2026-09-25)

Branch `update-2026-09-25/A`, built on top of the foundation branch. Implemented
by Claude on 2026-09-25 following SKILL.md §4. `pnpm build` and `pnpm lint`
pass (warnings only); the server type-check passes; the unit tests below were
run once. Playwright was NOT run (Andres runs it).

## What was built

**Server (`server/src/modules/tasks-time`, `server/src/modules/daily`)**
- Three-level tree: `task → subtask → tiny task`. `taskRelationships()` allows a
  parent of depth 0 or 1 and refuses moves that would push a subtree past the
  limit or under its own descendant. `createTask()` (exported) stores
  `description` and appends `position`; `propagate()` pushes project and
  inherited assignment through all descendants; `assignTask()` (exported)
  assigns a node explicitly and lets its subtree inherit.
- Completion record: `task.setStatus` stamps `completedAt`/`completedBy` on
  every node that became done in the same command (cascade and auto-completed
  parents included) and clears both on reopen. Deeper nodes (tiny tasks under a
  subtask) are completed before the shared `setTaskStatus()` runs, with the
  same teammate-timer protection.
- Done-task guard (`canEditDone` / `assertEditable`): `task.update`,
  `task.archive` and reopening need `task.editDone` (owner) unless the caller
  completed the node within `UNDO_WINDOW_MS` (10 minutes). Reordering is free.
- `task.archive` cascades through the whole subtree and removes the nodes from
  every day list.
- New handlers: `task.reorder` (siblings only; unlisted siblings keep their
  order after the listed ones), `dayList.replace` (person scope needs own list
  or `plan.others`; pool scope open; a person's list assigns unassigned or
  inherited tasks to that person), `dayList.take`, `dayList.release`,
  `dayList.setPresence`, `question.ask`, `question.answer` (office),
  `taskTemplate.saveTree`, `taskTemplate.applyTree` (depth-checked),
  `projectTemplate.save/apply/fromProject`.
- `dailyGoal.replace` and `objectives.replaceForDate` still exist (unused).

**Web**
- `features/work/index.tsx`: the **Daily** page (view `work`): date stepper,
  "whose list" selector (every person, then project pools), completion ring,
  project-grouped `DayCard`s (title, description, chips, three-level children
  with done toggles, details with notes, pinned paint notes, tiny photo strip,
  who completed it, Open / Ask / Take / Put back), Plan button → `PlanEditor`
  (tree browser per project, ordered list with up/down/remove, copy another
  day, presence checkboxes for pools), project strip with links to Projects and
  All tasks. `ProgressView` now shows per-person day completion (the old
  daily-goals page is gone). `features/work/dayList.ts` has the pure helpers
  (`canEditDone`, `treeCompletion`, `groupByProject`, `affectedSession`,
  scope keys) and `features/work/commands.ts` the `runCommand()` helper for
  inline actions.
- `features/work/QuestionDialog.tsx`: real question dialog (Add menu and Daily
  page).
- `features/work-bar/WorkBar.tsx`: sticky timer bar on every page: collapsed
  pill with the running task and live clock, or the first open task of my day
  list with Start; expanded: my time / team time, Pause (banks the interval),
  Complete, Open task.
- `features/tasks-time/TaskChecklist.tsx`: three-level checklist in the task
  sheet and project view, per-level quick capture, `ReorderButtons`
  (`task.reorder`), locked check for done tasks the user may not reopen.
  `TaskExtras.tsx`: completed-by line, pinned paint notes, photo strip,
  questions with inline answers for the office.
- `live/dialogs.tsx` (task sheet): description, `TaskExtras`, checklist for
  depth < 2, "Add subtask" / "Add tiny task", Reopen → "Undo (reopen)" for the
  completer or locked text; Edit hidden when locked; timer-start correction and
  timer-entry corrections use date + time pickers (device-local time) instead
  of ISO strings.
- `features/tasks-time/index.tsx`: `TaskEditor` has a Description field, the
  Project select is required for top-level tasks (no "Unfiled"), titles say
  task / subtask / tiny task; `TaskList` indents by depth.
- `features/templates/index.tsx`: Templates screen: project and task
  templates with tree preview, nested editor (three levels), apply to a
  project (office saves; anyone applies).
- Strings: `work.*`, `workbar.*`, `templates.*`, `tasks.*` in English and
  Spanish for every new label. Existing labels in `tasks-time/index.tsx`,
  `TaskChecklist.tsx` quick capture and `dialogs.tsx` remain English (leftover
  for the Spanish sweep).

## Tests
- `server/tests/modules/daily/daily.test.ts` (5 tests: depth and reorder,
  completion stamps + undo window + owner-only edit, day lists / take /
  release / presence / archive cleanup, questions, templates). Updated
  `server/tests/modules/tasks-time/team-work.test.ts` (the old one-level
  assertion now expects three levels).
- `web/tests/unit/dayList.test.ts` (4 tests). Playwright:
  `web/tests/team/daily.spec.ts` written, not run; `work-tasks.spec.ts`
  removed (it tested the retired Team tasks section); team specs now expect
  the "Daily." heading after sign-in.

## Deviations / notes for the lead
1. `TimeEntriesView` in `tasks-time/index.tsx` still has ISO inputs; it is not
   reachable in the live app (legacy), so it was left alone.
2. Timer corrections convert date + time with the device's local timezone;
   phones and the business are both in America/New_York.
3. The Daily page's "whose list" selector shows every person to every role
   (Andres: everyone can see everyone's list); editing is limited by
   `plan.others` and the server.
4. `projectTemplate.fromProject` has no UI button yet on the project page
   (chunk C owns that page); it can be called from Templates → later.
5. Spanish: new strings are bilingual; existing task-editor / checklist /
   sheet labels are still English (sweep).

## For Andres to verify on the phone
As owner: open Daily, tap "Plan this day", pick tomorrow, add a task and a
subtask from a project, save; switch "whose list" to a worker and plan for
them. As the worker: see the ordered list, check a tiny task, expand a card,
ask a question, take a pool task. Start a timer from the sticky bar on any
page, lock the phone, come back, pause it.
