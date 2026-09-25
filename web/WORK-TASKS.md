# Work assignments and subtask editing — September 21, 2026

Work opens with daily goals and the timer, followed by **Team tasks** for the
owner or **My tasks** for an employee. The default is all active assignments.

- **All assignments / Assigned to me** includes work planned for any date.
  The owner also sees unassigned work and work assigned to inactive accounts.
- **Today** selects today's daily goals and scheduled tasks, including their
  subtasks. Employees see their assignments and any unassigned goal they
  deliberately selected for their own daily plan. Ordinary capture never changes
  the daily plan or its completion percentage.
- **Active / Completed / All** combines with project and text search. Active
  includes blocked work. Completed history has no three-task limit and is ordered
  by most recent update. Archived tasks and children of archived parents are hidden.
- The owner also has a **Person** filter, including **Unassigned only**, and
  collapsible groups ordered owner, employees, then unassigned.
- **Assign: name** opens a focused responsible-person picker. Save uses the
  existing revision-checked command and preserves title, notes, estimate, project,
  and parent. An uncertain save retains its request for safe retry. Inherited
  subtasks move with their parent; explicit subtask assignments remain as chosen.
  For a child, the empty choice means **Inherit from parent**, not an independent
  unassigned override. Timers and daily goals are not moved by reassignment.

Open a subtask by tapping its title. Its own detail sheet shows its parent,
assignment, notes, timer, scheduling, time entries, files, and **Edit subtask**.
Editing or canceling returns to that subtask; **Back to parent task** returns to
the parent. A child no longer repeats the whole parent's checklist as if it were
its own. Existing dirty-draft and uncertain-save protections remain in force.

This is a frontend-only change. Contracts, API handlers, server permissions,
database schema and account credentials are unchanged. The Work reassignment
shortcut is owner-only; existing shared-task editing permissions remain intact
elsewhere, as agreed for the team app.

## Verification and screenshots

The focused case in `tests/team/work-tasks.spec.ts` uses disposable owner and
employee accounts. It exercises combined filters, blocked and unassigned work,
four completed tasks, Today goals/schedules, parent reassignment and child
inheritance, a committed save whose response is lost, employee subtask edits,
dirty cancellation, and parent navigation. No employee password is needed from
the real workspace.

Run with the documented bundled Node/pnpm runtime:

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/team/playwright.config.ts
PIRATA_TEST_WEBKIT=1 pnpm --filter morgan-el-pirata-web exec playwright test --config tests/team/playwright.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/integration/playwright.config.ts
# Run redesign files in separate disposable harnesses to respect the real login limit.
for spec in collaboration figma navigation tasks; do
  pnpm --filter morgan-el-pirata-web exec playwright test --config tests/redesign/playwright.config.ts "$spec.spec.ts" || exit
done
```

Screenshots are saved in `web/artifacts/work-tasks/`, including owner Work at
320, 390, 768 and 1280px and employee/subtask screens at 390px, with separate
Chromium and WebKit filenames. Playwright WebKit is not a physical iPhone test.

Verified: root build/typechecks and lint (one pre-existing Fast Refresh warning),
150 server/API tests, 75 frontend unit tests, 5 team cases per engine, 11 integrated
Chromium cases and all 12 redesign Chromium cases. The new Work case also passed
again in both engines after adding concurrent-edit and sticky Edit-button checks.
25 publisher/backup/recovery tests and the concealed-credential CLI operations
check passed. The complete backup restored successfully before publication.

The legacy frozen-contract checksum checker reports drift from the earlier team
release. Every mismatched file was compared with Git HEAD and is unchanged by
this update; the historical checksum manifest was not rewritten. A single combined
redesign run hit the existing ten-login limit at its last two tests; the affected
four-test file passed against a fresh isolated harness. Production limits were
not weakened. Actual production password entry, physical Safari/iPhone and paid
AI calls are outside these checks.

See [deployment and recovery](deploy/TEAM-RECOVERY.md) and
[the live release record](deploy/deployed-release.json) for verified deployment
status, the complete database/file backup and compatible web rollback.
