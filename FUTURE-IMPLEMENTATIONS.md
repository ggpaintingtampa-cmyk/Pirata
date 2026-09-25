# Future implementations — planned, not built

Status: **specification only.** No code written. Source: Andres, Telegram,
2026-09-21. Read together with `README.md` and `web/deploy/TEAM-RECOVERY.md`
before building. Verify field names against `packages/contracts/src/index.ts`
and the server modules at build time — do not guess.

---

## 0. Work tab — team tasks section (approved 2026-09-21, pending build)

Owner view under Today's goals: toolbar (status toggle Active/Completed/All,
project dropdown, text search, unassigned-only toggle) + one group per person
(Andres first, then enabled employees, then Unassigned), live counts, inline
check-off, assignee picker per row firing `task.update` with full field set.
Employee view: personal list, same filters, no reassignment. Blocked counts as
Active. Archived hidden. Groups expanded by default, collapsible.
Files: `web/src/features/work/{myTasks.ts,index.tsx,styles.css}`.

## 1. Sticky work bar (always-visible timer header)

Goal: a bar pinned to the top of the app on every screen showing the current
task/subtask, its clocks, and timer actions — no scrolling to reach them.

### Layout
- Persistent chrome below the brand header in `live/LiveApp.tsx` (same layer
  as `WorkspaceSidebar`), `position: sticky` so it never scrolls away.
- Collapsed pill: task (or subtask) name + live session clock. Tap/click to
  expand. Desktop may default expanded; phone collapsed.
- Expanded: three time figures + four action buttons.
  - Session clock (large, live): `serverNow - runningTimer.startedAt`.
  - My total time on this task (medium).
  - Whole-team total on this task (small, secondary).
- No task selected: shows suggestion (current selection → running timer →
  first open task assigned to me; logic already exists in `TimerControls`)
  with a Start button. Nothing running: clock reads 00:00:00, Start enabled.

### Buttons → existing commands
- **Start** → `timer.start {taskId}` (or `timer.switch` when another task is
  running — keep the existing switch confirmation).
- **Pause** → `timer.pause {expectedSessionId}`.
- **Complete** → `task.setStatus {status:'done'}`; existing semantics save and
  stop the running timer; keep the existing confirm when unfinished subtasks
  or an affected timer exist (pattern in `TaskCheck`/`TimerControls`).
- **Stop (not complete)** → stops the clock, task stays open.

### Key design decision — pause vs stop
The server has no resumable pause today: `timer.pause` ends the session and
banks the elapsed time as an entry; starting again opens a new session and the
task totals keep accumulating. Options:
(a) Pause = `timer.pause` (bank + stop), Stop = same command but also clears
    the bar's selected task. No server change. Labels must say time is saved.
(b) True pause/resume: add `pausedAt` to `running_timers` + a `timer.resume`
    command. Small server + contracts change, real freeze/resume semantics.
Andres to choose; (a) ships faster, (b) matches the four-button mental model.

### Data notes
- `actualMilliseconds(snapshot, taskId, now)` (tasks-time/time.ts) sums ALL
  entries on a task — that is the **team** total already.
- **Verify before building:** per-person time needs user attribution on time
  entries (check `TimeEntry` in contracts and the `time_entries` table —
  direct `userId`, or derive via `sessions`). If absent, this is the one
  server/contracts addition feature 1 needs.
- Team running timers are already in the snapshot (`runningTimers`), so
  "someone else is on this task" indication is free.
- Reuse `badClock` handling (server clock before start) and the
  401/403 refresh-session retry pattern from `TaskChecklist`.

### Files
New `web/src/features/tasks-time/WorkBar.tsx` + styles in its `styles.css`;
mount in `live/LiveApp.tsx`; reuse `CommandButton`, `WorkDialog`/`WorkForm`
confirmations, `useServerNow`, `formatClock`/`formatDuration`.
No contracts/DB changes required under option (a).

## 2. Manager project view ("what a manager should know")

Goal: one screen answering, per project: how long it's taking, what's left,
time burned, money spent, and whether we're ahead or behind.

Recommendation: a **new screen**, not more sections in Work. Add to the Menu
sidebar under "Your business", owner-only (`owner: true` in
`live/WorkspaceNavigation.tsx`), because spending is owner-only by server
design (snapshots already filter it for employees). Employees keep Team
Progress.

### Per-project card
- Days active (`createdAt` → now), days since last activity.
- Completion ring (`projectCompletion`) + done/total top-level tasks.
- Steps remaining: open + blocked counts, next ~5 steps (by schedule block
  date, then estimate).
- Time: total team time on the project (sum `actualMilliseconds` over its
  tasks) vs total estimated (sum `estimatedMinutes`) → over/under per task and
  rolled up.
- People: time per person on the project (needs the entry-user attribution
  from feature 1).
- Money (owner only): expenses linked to the project + material usage/adjust
  costs. Verify exact link fields (`expense` shape, `material_adjustments`,
  `requirement`s) at build time.
- Health signal: % of estimated time consumed vs % of tasks complete →
  simple ahead/behind label.

### Cross-project summary (top of screen)
Open projects count, team time this week, spend this month (owner).

### Files
New `web/src/features/insights/` (view + styles), nav entry in
`WorkspaceNavigation.tsx` (+ `readView` allowlist in `live/navigation.ts`),
reuse `CompletionRing`, `projectCompletion`, `actualMilliseconds`, spending
view logic. Phase 1 is read-only over existing data — **no schema changes**.
Optional phase 2: a `budget` field on projects (contracts + server +
migration — bigger change, only if wanted).

## 3. Owner daily review screen — requested, not built

Goal: give the owner one screen to review the day's completed work and notes.

Requested scope:
- Show tasks completed that day.
- Show who completed each task, not just its current assignee.
- Show notes for the day alongside the completed work.
- Owner-only review screen.

Implementation considerations (verify before building):
- Use completion events/timestamps and recorded actors rather than inferring
  completion from the current task status or assignee. If historical attribution
  is missing, display it as unknown rather than guessing.
- Define the business timezone for day boundaries. A date picker defaulting to
  today is a proposed convenience, not a separately approved requirement.
- Reuse existing task, note and activity data where possible; verify whether
  additional API fields or persisted completion history are needed.

## 4. Employee materials requests and broken equipment — requested, not built

Goal: let employees report what they need and flag broken machines/tools in
one accessible section.

Requested scope:
- Employees can add materials they need.
- Each request identifies whether the materials are for a specific project or
  for the employee personally (work supplies for that employee).
- Project requests select the relevant job; personal requests identify the
  requesting employee without requiring a project.
- Include a **Broken** option for reporting machines and tools that break.

Implementation considerations (proposals, not yet approved details):
- Reuse or extend Shopping and Inventory/Maintenance rather than create a
  disconnected duplicate system.
- Suggested request fields: item, quantity/unit, notes, requester, and project
  or employee destination. Suggested breakage fields: machine/tool, what broke,
  reporter, and optional photo/project context.
- Owner review and fulfillment/repair statuses could track follow-through;
  decide the exact workflow and permissions before implementation.
- Requests and breakage reports must not automatically create spending,
  inventory deductions, purchases, or equipment disposal.
- Verify existing contracts and role permissions before deciding whether
  server/schema changes are needed. No code or live records changed for this
  planning update.

## Build & ship checklist (original items 0–2; extend for new features)

1. `pnpm install --frozen-lockfile --prod=false && pnpm build && pnpm lint && pnpm test`
2. Playwright: integration + team suites; add cases for owner grouping +
   reassignment, work-bar actions from a non-Work screen, manager view
   (owner) and its absence for employees.
3. Web-only deploy per `web/deploy/TEAM-RECOVERY.md`; update
   `web/deploy/deployed-release.json`.
4. Browser verification as `andre`; employee-side check by Andres (agent
   cannot see employee passwords).

## Open questions for Andres

1. Pause vs Stop: option (a) no server change, or (b) true pause/resume with
   a small server addition?
2. Should employees see the small team-total time on their bar? (Assumed yes;
   time is not money.)
3. Manager view owner-only, or a reduced employee version without money?
   (Assumed owner-only to match the spending permission model.)
4. Add a project budget field now (schema change) or keep phase 1 read-only?
