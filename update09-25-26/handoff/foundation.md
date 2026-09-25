# Foundation (F) handoff — update 2026-09-25

Branch `update-2026-09-25/foundation` on top of the baseline commit
`2286c77` (the live 2026-09-21 code, committed first). Implemented by Claude
on 2026-09-25 following `update09-25-26/SKILL.md` §3. `pnpm build` and
`pnpm lint` pass (12 pre-existing style warnings remain); the server
type-check passes; the new unit tests were run once (see "Tests"). The
Playwright suites were NOT run (Andres runs them).

## What chunks may rely on

**Contracts (`packages/contracts/src`)**, re-exported from `@pirata/contracts/index`:
- `permissions.ts`: `ROLES`, `Role`, `ROLE_CAPS`, `Capability`, `CAPABILITIES`,
  `can(role, cap)`, `isOfficeRole(role)`, `COMMAND_CAPABILITY`.
- `daily.ts` (A): commands `task.reorder`, `dayList.replace/take/release/setPresence`,
  `question.ask/answer`, `taskTemplate.saveTree/applyTree`,
  `projectTemplate.save/apply/fromProject`; DTOs `DayAssignment`, `TaskQuestion`,
  `ProjectTemplate`; `TemplateNode`, `templateNodeSchema`, `templateTreeSchema`,
  `templateDepth`; helpers `taskDepth`, `orderedChildren`, `subtree`, `dayItems`,
  `presence`, `dayCompletion`; snapshot slices `dayAssignments`, `taskQuestions`,
  `projectTemplates`.
- `hours.ts` (B): commands `shift.submit/enter/update/approve/reject/remove`,
  `payRate.set/remove`, `dayNote.save`; DTOs `WorkShift`, `PayRate`, `DayNote`;
  `STANDARD_DAY_MINUTES`, `DAY_UNITS`; helpers `shiftMinutes`, `rateFor`,
  `shiftCostCents`, `laborCostCents`, `weekBounds`, `monthBounds`; slices
  `workShifts`, `payRates` (owner only), `dayNotes`.
- `sales.ts` (C): commands `projectFact.save/remove`, `attachment.tag`,
  `attachment.comment`; DTOs `ProjectFact`, `AttachmentTag`, `AttachmentComment`;
  `FACT_KEYS`, `PROJECT_STATUSES`, `PROJECT_TRANSITIONS`, `projectLabel`; slices
  `projectFacts` (hidden facts stripped for workers), `attachmentTags`,
  `attachmentComments`.
- `tools.ts` (D): commands `materialRequest.create/update/setReceived/remove`,
  `tool.signOut`, `tool.return`, `equipment.setSignOutRequired`,
  `equipment.reportBroken/resolveReport`, `user.setLocale`; DTOs `ToolSignOut`,
  `EquipmentReport`; `LOCALES`, `Locale`; slices `toolSignOuts`, `equipmentReports`.
- Changed existing schemas: `teamMemberSchema.role` is one of the four roles and
  has optional `locale`; `Task` has optional `description`, `position`,
  `completedAt`, `completedBy`; `Project.status` is
  `draft|sold|scheduled|completed` plus optional `startDate`, `endDate`,
  `salesPriceCents`, `materialsPriceCents`, `laborPriceCents`, `salesNote`,
  `salesRepId`, `reviewNote`, `soldAt`, `scheduledAt`, `completedAt`;
  `project.setStatus` takes the four statuses and an optional `note`;
  `ShoppingItem` has optional `quantity`, `taskId`, `forUserId`, `receivedAt`,
  `receivedBy`, `archivedAt`; `Equipment` has optional `requiresSignOut`,
  `status`; `CleanupObligation.completedBy`; `TaskTemplate.tree`.
  `CONTRACT_VERSION` is `3.0.0`.

**Server**
- Migration `003-update-2026-09-25.sql` exactly as SKILL.md §2.3 (roles,
  tasks columns, `day_assignments` with migrated daily goals, `task_questions`,
  `day_notes`, `project_templates`, projects rebuild with `open → scheduled`,
  `project_facts`, `pay_rates`, `work_shifts`, shopping columns,
  equipment columns, `tool_sign_outs`, `equipment_reports`, per-user cleanup
  index, `attachment_tags`, `attachment_comments`). Chunks add NO migrations.
- `core/context.ts`: `ctx.role` is `Role`. `core/commands.ts`: the dispatcher
  checks `COMMAND_CAPABILITY[type]` with `can()`; everything else is open and
  record-level rules belong in handlers. `core/repositories.ts`: all new tables
  are in `Tables`/`TABLES`; `remove()` additionally allows `day_assignments`,
  `work_shifts`, `pay_rates`, `project_facts`, `attachment_tags`; `team()`
  returns `locale`; new `setLocale(locale, now)`.
- `core/snapshot.ts`: every new slice is served; filters: `expenses` and
  `payRates` need `money.costs`; project price fields and `salesNote` are
  nulled/blanked without `money.sales`; `workShifts` are own rows only for
  workers; `projectFacts` with `workerVisible=0` need `facts.hidden`.
- Module stubs (replace in your own file only): `modules/daily/index.ts` (A),
  `modules/hours/index.ts` (B), `modules/sales/index.ts` (C),
  `modules/materials-tools/index.ts` (D; `user.setLocale` is already real).
  `routes/export.ts` (B) registers `GET /api/v1/export/shifts.csv` and
  `GET /api/v1/export/daily-report.csv` (501 until implemented).
- `auth/team.ts`: `role` on create (default `worker`) and update, caps from
  `ROLE_CAPS`, explicit column list, primary owner protected by id (other
  owners editable); role changes revoke that person's sessions.
- Sessions: `SESSION_TTL` 30 days, sliding refresh after 1 hour of use via
  `touchSession()` on `GET /api/v1/session`, `SameSite=Lax`, `clearSessionCookie()`;
  `login:global` limit 100 per 15 minutes.
- `clients-projects`: `project.create` now stores status `scheduled` (C changes
  it to `draft` with the review flow). AI: `create_project` now answers
  CLARIFY (projects need a client); `create_task` unchanged (see deviations).
- Test helpers: `server/tests/helpers/roles.ts` (`userOf(f, role, ownerHeaders)`,
  `runAs(f, headers, command)`).

**Web**
- `web/src/i18n/`: `LocaleProvider` (mounted in `main.tsx` inside
  `ServerProvider`), `useT()`, `useLocale()`, `translate()`, `detectLocale()`,
  `LOCALE_NAMES`, `Strings` type; `shell.ts` holds the shell strings. Each
  feature folder may export `strings` from `strings.ts` (`{en:{}, es:{}}`);
  the glob `../features/*/strings.ts` merges them. Stub `strings.ts` files
  exist in every new folder.
- `web/src/state/permissions.ts`: `useCan(cap)`, `useRole()`, re-exports `can`.
- `web/src/components/`: `CopyField`, `TimeField` (+ `minuteToTime`,
  `timeToMinute`), `DateField` (+ `addDays`), `ThumbStrip` (+ `fileContentUrl`),
  `Money` (+ `formatMoney`, `parseMoney`).
- `web/src/live/navigation.ts`: new views `report/:date?`, `hours`, `pay`
  (money.costs), `insights/:projectId?`, `materials`, `tools`, `templates`;
  `readView(hash, role)`, `viewAllowed(name, role)`, `viewCapability`; aliases
  `#/today → work`, `#/shopping → materials`, `#/menu → more`.
- `web/src/live/WorkspaceNavigation.tsx`: menu groups per SKILL.md §3.1 step 8
  with i18n labels; props take `role` instead of `isOwner`.
- `web/src/live/LiveApp.tsx`: mounts `<WorkBar app onOpenTask/>` above the
  content viewport (stub in `features/work-bar/WorkBar.tsx`, chunk A); renders
  the stub views `ReportView`, `HoursView`, `PayView`, `InsightsView`,
  `MaterialsView`, `ToolsView`, `TemplatesView` (each receives `ModuleProps`
  plus `date` / `projectId` where relevant); language toggle in the Menu
  account card; sign-in overlay in `reauth` state; Today page removed from
  the shell (the folder `features/today/` stays because the `?demo=1` mode
  still uses it; the legacy Today cards are no longer reachable live).
- `web/src/live/dialogs.tsx`: the Add menu (`{kind:'quick'}`) is an explicit
  list (Task, Project, Material request, Hours, Tool sign-out, Question,
  Expense [money.costs], Lead) with no "Back to Add menu" step; a new dialog
  kind `{kind:'registry', name, projectId?, id?}` renders a chunk dialog from
  `web/src/live/dialogRegistry.ts` (`RegisteredDialogProps = {app, projectId?,
  taskId?, onClose, onDone}`): `features/materials/RequestDialog.tsx` (D),
  `features/hours/ShiftDialog.tsx` (B), `features/tools/SignOutDialog.tsx` (D),
  `features/work/QuestionDialog.tsx` (A), `features/sales/CaptureDialog.tsx` (C).
  Open a task sheet from anywhere with `open({kind:'task', id})`.
- Role comparisons replaced with `can()` in `work/index.tsx`, `work/myTasks.ts`,
  `clients-projects/index.tsx`; `team/index.tsx` no longer assumes `employee`.
  Project "open" comparisons became `!== 'completed'`.
- CSS added at the end of `web/src/live/live.css` (`.work-bar`,
  `.reauth-overlay`, `.language-toggle`, `.copy-field*`, `.thumb-strip*`).

## Deviations from SKILL.md (lead decides)

1. **`task.create` still accepts `projectId: null`** and `project.create`
   still accepts `clientId: null` at the contract level. Making them required
   broke dozens of existing tests and the AI path; the app UI must enforce
   both (A: TaskEditor with no "Unfiled" choice; C: capture flow requires a
   client). Tighten the contracts after A and C land if wanted.
2. New optional command fields use `.optional()` instead of `.default()` so
   existing code that builds typed `BusinessCommand` objects keeps compiling
   (`description`, project prices/dates/`salesNote`, `project.setStatus.note`).
   Handlers must treat `undefined` as empty / null.
3. The AI `create_task` CLARIFY for missing project was dropped (the AI test
   creates a task without a project); the instructions text still tells the
   model that every task belongs to a project.
4. `features/today/` is kept for the browser demo mode instead of deleted.
5. `web/src/live/dialogs.tsx` retains the `objectives` dialog kind (unused).

## Tests

Written: `server/tests/migration-003.test.ts`, `server/tests/contracts-helpers.test.ts`,
`server/tests/team.test.ts` (rewritten for roles and caps, plus a manager
permission test), `web/tests/unit/navigation.test.ts` (rewritten),
`web/tests/unit/foundation.test.ts`. Updated: `server/tests/api.test.ts`
(SameSite=Lax), `server/tests/schema.test.ts`, `server/tests/modules/
clients-projects/clients-projects.test.ts`, `server/tests/modules/tasks-time/
tasks-time.test.ts`, `server/tests/modules/collaboration/collaboration.test.ts`,
`web/tests/unit/myTasks.test.ts`, `web/tests/modules/clients-projects/
clients-projects.spec.ts` (project status values). Run once: the five server
files above and the three web unit files (results in the session log). Full
suites and Playwright: Andres.

## For Andres to verify on the phone after deploy

Sign in as owner and as the existing employee (now a worker); every menu entry
opens; the Add button shows the new list; the language toggle switches the
shell to Spanish; lock the phone for two hours and reopen without signing in.

## Deploy-time deviation (2026-09-25)

The production publisher (`web/deploy/publish-team.py`) compares every historical column value before and after
migrating a copy of the live database and refuses a cutover that rewrites any of them. Migration 003 therefore
keeps the legacy role `employee` and project status `open` in place (both stay valid in the widened CHECK
constraints) instead of remapping them. The server reads them as `worker` / `scheduled`
(`normalizeRole`, `normalizeProjectStatus` in `server/src/core/repositories.ts`, plus the session and team-admin
queries); writes always use the current vocabulary. `daily_goals` is kept as a read-only legacy table.
