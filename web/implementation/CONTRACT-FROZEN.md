# Implemented shared contract v2.0.0

Status: **FROZEN / READY** — verified 2026-09-17. Aggregate SHA-256:
`9e705f2b0005d51c484b02c79bcd6c3e1e8f50be4b2405c6ce42b1dd8e85c101`. See `handoffs/00-foundation.md` for results.
Coordinator integration reviewed September 17: additive `@pirata/contracts/import` validation, authenticated import routes and `PirataService` extension, plus package file allowlists. Existing BusinessCommand/DTO/BusinessService interfaces and schema v2 are unchanged. See `handoffs/06-integration.md`.

This document specifies code that exists now,
not APIs for feature agents to invent. Canonical root remains
`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.

## Version, source and runtime

The checked `contract-manifest.json` records SHA-256 per shared file and the
aggregate hash. Verify from the root with `python3 scripts/contract-manifest.py`.
The manifest covers source contracts/domain, core/auth/DDL, central registration,
service interfaces, fixture helpers and dependency lock/config. Feature-owned
handler/component bodies are intentionally excluded, allowing their implementation
without changing the shared interface. Only the foundation/coordinator updates
this manifest after reviewed shared changes. Contract version is exported as
`CONTRACT_VERSION = '2.0.0'`; server snapshot `schemaVersion` is 2; SQL migration
version starts at 1 and is independently tracked in `schema_versions`.

Verified installed foundation: Node 24.19.0, pnpm 11.19.0, Fastify 5.12.5,
@fastify/cookie 11.1.2, better-sqlite3 12.11.1 / SQLite 3.53.2, Argon2 0.45.1,
Zod 4.6.5, tsx 4.23.13, Vitest 5.0.1, root TypeScript 6.0.2, ESLint 10.10.0.
The original frontend resolutions remain: React/ReactDOM 19.3.0, Vite 8.3.0,
TypeScript 6.0.3, Playwright 1.63.0, lucide-react 1.46.0. Optional Vite peers
now resolve the workspace's esbuild/tsx. One root pnpm lockfile; no npm/yarn locks.

## Actual contract exports

Import from `@pirata/contracts/index`. The exact authoritative declarations are
`packages/contracts/src/index.ts`. Every command is a **strict** discriminated
Zod object in `commandSchema`; do not add unrecognized fields or owner IDs.

- `BusinessCommand`, `CommandType`, `CommandOf<'expense.create'>`, etc.
- `mutationRequestSchema` / `MutationRequest`: `{requestId: UUID,
  baseRevision: safeNonnegativeInteger, command: BusinessCommand}`.
- `mutationResultSchema` / `MutationResult`: `{requestId, revision, serverNow,
  changed, result:{kind:string,id?:string}}`.
- `ApiFailure` / `apiFailureSchema`: `{error:{code,message,fields?,currentRevision?}}`.
- `BusinessSnapshot` / `snapshotSchema`, `SessionStatus` / `sessionStatusSchema`.
- DTOs `Client`, `Project`, `Task`, `Objective`, `ScheduleBlock`, `RunningTimer`,
  `TimeEntry`, `Expense`, `Material`, `MaterialRequirement`, `MaterialAdjustment`,
  `Equipment`, `MaintenanceItem`, `LeadRecord`, `LeadFollowUp`, and nested `Lead`.
- Record response schemas, `idSchema`, `safeInteger`, `timestampSchema`,
  `dateSchema`, `titleSchema`, `nameSchema`, `noteSchema`, `taskStatusSchema`,
  `blockInputSchema`, `objectiveInputSchema`.
- `BusinessService`, `ModuleName`, `Capabilities`.

IDs remain nonempty strings up to 100 characters, so existing validated IDs can
be retained by the later import. Ordinary create commands do not accept record
IDs/timestamps: handlers use `ctx.newId()` and `ctx.serverNow`. Request IDs are
UUIDs, generated once per intent. Timestamps are safe nonnegative epoch ms;
dates are real YYYY-MM-DD calendar dates; timezone America/New_York/currency USD.
Notes <=1000, titles <=160, contact names <=100, contact phones <=100,
project address <=300, material product/color/finish <=160. Optional contact
values are empty strings; nullable relationship/date values use `null`.

## Frozen commands and fields

All required fields appear below; no implicit patch semantics. Edits supply the
listed mutable fields, and handlers preserve ID/createdAt. Runtime Zod schemas
remain authoritative for refinements and limits.

| Commands | Payload fields besides type |
| --- | --- |
| client.create / client.update | name, phone, email, note; update also id |
| client.archive | id, archived:boolean (false unarchives) |
| project.create / project.update | name, clientId:null-or-ID, clientName, address, note; update also id |
| project.setStatus | id, status:open/completed |
| lead.create / lead.update | name, phone, email, workDescription, nextFollowUpDate:null-or-date; update also id |
| lead.followUp | id (lead), note (nonblank), nextFollowUpDate:null-or-date |
| lead.convertToClient | id (lead), clientId:null-or-existing-ID; null creates a client |
| task.create | projectId:null-or-ID, title, estimatedMinutes:1..1440, note, optional schedule |
| task.update | id plus projectId/title/estimatedMinutes/note; status is separate |
| task.setStatus | id, status:open/blocked/done, expectedSessionId:null-or-ID |
| timer.start | taskId |
| timer.pause / timer.discard | expectedSessionId |
| timer.switch | taskId, expectedSessionId |
| timer.correctStart | expectedSessionId, startedAt |
| timeEntry.createManual | taskId, date, minutes:1..1440, note |
| timeEntry.correct | id, correction:{source:manual,date,minutes,note} or {source:timer,startedAt,endedAt,note}; preserve original source/task |
| schedule.setTaskBlock | taskId, block:{date,startMinute:0..1439,endMinute:1..1440,allowOverlap:boolean}; end > start |
| schedule.removeTaskBlock | taskId |
| objectives.replaceForDate | date, objectives:[{id,title,taskId:null-or-ID,status:open/partial/blocked/done,note,rank:0..2}]; max3, unique IDs/ranks, blocked requires note |
| expense.create / expense.update | purchaseDate, description, category:materials/tools/fuel/maintenance/other, amountCents:positive safe integer, projectId:null-or-ID; update also id |
| material.create | name, product, color, finish, unit:gal/piece, stockMinor:nonnegative integer |
| material.update | id, name, product, color, finish, unit; stock only through adjustment |
| material.adjust | materialId, deltaMinor:nonzero signed safe integer, reason:restock/usage/correction, note |
| requirement.set | materialId, projectId, neededMinor, reservedMinor; upsert by material/project pair |
| requirement.remove | id |
| equipment.create / equipment.update | name, note; update also id |
| equipment.archive | id, archived:boolean |
| maintenance.create / maintenance.update | equipmentId:null-or-ID, equipmentName, title, dueDate; update also id |
| maintenance.complete / maintenance.reopen | id |

Initial task status is open. Completing a project has no cascading side effects.
Zero opening material stock creates no zero adjustment; nonzero opening stock
creates an explicit `correction` adjustment with opening-stock note in the same
transaction. Quantities are hundredths and pieces must be multiples of 100.
All relationship/business checks must also execute in the handler transaction.

Result `kind` convention: client/project/lead/task/timer/timeEntry/schedule/
objectives/expense/material/requirement/equipment/maintenance, and affected ID
when there is one. A timer close identifies its closed session if useful. No-op
returns `changed:false`; it must perform no business writes. Result semantics
are shared and do not require new per-module response envelopes.

## Handler entrypoints and transaction ownership

Each module exports `handlers` and `capability: 'blocked'|'ready'` from its
`server/src/modules/<name>/index.ts`. Central `server/src/modules/index.ts`
explicitly imports all five and exhaustively satisfies `HandlerMap`.

| Task | Module | Owned server and UI directory |
| --- | --- | --- |
| 01 | clients-projects | server/src/modules/clients-projects; web/src/features/clients-projects |
| 02 | tasks-time | server/src/modules/tasks-time; web/src/features/tasks-time |
| 03 | planning | server/src/modules/planning; web/src/features/planning |
| 04 | spending | server/src/modules/spending; web/src/features/spending |
| 05 | inventory | server/src/modules/inventory; web/src/features/inventory |

`server/src/core/context.ts` defines:

```ts
type CommandHandler<T extends CommandType> =
  (ctx: TransactionContext, command: CommandOf<T>) => HandlerResult;
interface TransactionContext {
  readonly ownerId: string;
  readonly serverNow: number;
  readonly revision: number;
  readonly repo: Repositories;
  newId(): string;
}
interface HandlerResult {
  changed: boolean;
  result: {kind: string; id?: string};
}
```

Use `satisfies Pick<HandlerMap, ...owned command names...>` as the supplied stubs
do. Preserve exhaustive keys and change capability to ready only after your
module tests pass. Stubs currently throw `notImplemented()` (HTTP501), never
return fabricated success. Do not remove that protection for unfinished paths.

`core/repositories.ts` exposes typed owner-bound `list(table)`, `get(table,id)`,
`require(table,id)`, `insert(table,fullDTO)`, `update(table,id,mutablePatch)`.
`require`/update return 404 for missing or wrong-owner IDs. `update` preserves
ID/createdAt; TimeEntry patches retain their discriminated fields. `remove`
is limited to objectives/schedule_blocks/material_requirements. `getTimer`,
`insertTimer`, `correctTimerStart`, `removeTimer` are owner-bound as well.
There is no raw connection, SQL execution, commit or transaction method in the
context. Typed insert records exclude ownerId; repository SQL supplies it.

`core/shared.ts` supplies tested atomic helpers:

- `assertReference(ctx, table, id|null)` for clients/projects/tasks/materials/equipment.
- `setTaskBlock(ctx,taskId,blockInput)` returns `{id,changed}`; validates dates,
  checks current overlaps, respects allowOverlap, reuses existing block ID.
- `createTaskWithSchedule(ctx,fullTaskDTO,schedule?)` inserts task and optional
  block in the caller transaction. It never sends a second command.
- `expectTimer(ctx,expectedSessionId)` checks current observed session.
- `closeTimer(ctx,expectedSessionId)` closes at serverNow; removes the active
  row before inserting its interval with the **same session ID**, skips a zero
  interval, rejects negative time, and rolls back both on any failure.
- `setTaskStatus(ctx,taskId,status,expectedSessionId|null)` closes only the
  affected observed timer when finishing/blocking, keeps schedule/history.
- `assertQuantity(unit,quantity)` validates safe integer/whole piece quantities.

`core/errors.ts`: `ApiError(status,code,message,details?)`, `notFound`,
`conflict(message,code?)`, `invalid(message,fields?)`, `notImplemented`.
`core/commands.ts` supplies `executeCommand`, `canonical`, `revision`.
Do not call executeCommand inside handlers. The dispatcher owns BEGIN IMMEDIATE,
receipt checking, revision, rollback and commit. It rejects async handlers,
expires contexts on return, and verifies changed against actual SQLite writes.

## Normalized DDL, snapshot mapping and compatibility

Actual DDL: `server/src/db/migrations/001-foundation.sql`.
Runner: `server/src/db/database.ts`; backup: `server/src/db/backup.ts`.
Every business table has composite primary key `(owner_id,id)`, created_at and
updated_at. Foreign keys include owner_id and have no destructive cascades.
SQL uses snake_case; DTO/repository field names are camelCase, mapped by the
repository. `RecordBase` carries id/createdAt/updatedAt. The exact columns and
checks are in SQL, not inferred from v1 JSON.

| Table | DTO / extra fields and constraints |
| --- | --- |
| owners | singleton unique CHECK1, Argon2 password_hash, timestamps; not exported |
| sessions | hashed token, owner nullable for pre-auth, csrf, expiry; not exported |
| data_revisions | owner primary key, safe nonnegative revision; snapshot revision |
| command_receipts | owner/request primary key, fingerprint, validated result JSON; not exported |
| auth_rate_limits | hashed bucket, attempts/window; not exported |
| clients | Client; name/phone/email/note/archivedAt |
| projects | Project; clientId, retained clientName text, address/note/status |
| tasks | Task; projectId nullable, title/estimate/status/note |
| objectives | Objective; date/task/status/note/rank; unique owner/date/rank, rank0..2 |
| schedule_blocks | ScheduleBlock; unique owner/task, date/minutes/kind/title; task link matches kind |
| time_entries | TimeEntry timer/manual union; mutually exclusive real interval vs date/whole-minute seconds |
| running_timers | RunningTimer; owner primary key, sessionId/taskId/start; open task only, no closed-ID collision |
| expenses | Expense; positive safe cents/date/category/project |
| materials | Material; name/product/color/finish/unit/stock; whole pieces |
| material_requirements | MaterialRequirement; material/project/needed/reserved; unique pair, bounded reservation |
| material_adjustments | MaterialAdjustment; immutable nonzero delta/reason/note |
| equipment | Equipment; name/note/archivedAt |
| maintenance_items | MaintenanceItem; nullable equipmentId, preserved equipmentName, title/due/completedAt |
| leads | LeadRecord; contact/work/nextFollowUpDate nullable/convertedClientId nullable |
| lead_follow_ups | LeadFollowUp; leadId/at/nonblank note; nested under Lead in snapshot |

Every FK has an owner-leading index. Business creation order has an index on
(owner_id,created_at,id). Additional constraints/triggers enforce calendar
normalization (including NULL-only optional dates), safe integers, max three
objectives, one task block/active timer, task status before timer start, no
running/closed session duplication, immutable adjustments, piece quantities,
unit changes with history, reservations <= stock, and stock >= reservations.
No module should attempt to bypass these constraints with disabled pragmas.

`core/snapshot.ts` takes one consistent read transaction. Lists normally use
createdAt then ID; objectives use date/rank/ID; schedule uses date/start/ID.
Task schedule titles resolve the current task title when read, so editing a task
cannot leave stale schedule display text. `projects.clientName` and
`maintenance.equipmentName` retain imported/display fallback text; joined current
names take precedence in the compatibility view. Never rewrite fallback text
just because a linked record is archived. Leads retain convertedClientId and
nested follow-up history after explicit conversion.

`@pirata/domain/domain/{types,schema,commands,selectors}` and
`@pirata/domain/lib/{dates,money,time,ids}` contain the extracted v1 code.
Original frontend paths re-export these functions. All original 51 tests and
44 Chromium cases pass. The key `morgan-el-pirata:home-prototype:v1` is unchanged.
`@pirata/contracts/compatibility` exports `toLegacyState(snapshot)` solely as a
validated read projection for existing Today selectors. **Do not persist that
projection under the v1 key.** `seededOn` in this projection is the serverNow
business date, not a server seeding instruction. Live snapshot begins empty.

Task06 import is deferred. It must validate original v1 input and preview
mappings. Duplicate legacy requirements for one material/project can be valid
v1 data but conflict with the new normalized unique pair: preview/reject those
conflicts or obtain explicit aggregation approval, never silently discard them.
No production import/reset endpoint or automatic seed exists in this foundation.

## Frontend service and exact UI interfaces

`web/src/services/api.ts`: `createBusinessService(fetcher?)`, `ServiceError`
(status/code/fields/currentRevision), `createMutation(command,baseRevision,
requestId?)`, `createSubmission(service,envelope)`, `acceptedRevision`.
All network URLs are relative `/api/v1/*`, credentials same-origin. Service
methods are session/login/logout/snapshot/execute/exportData. `createSubmission`
retains a cloned envelope and shares concurrent submit promises; a subsequent
retry preserves its ID, command and original baseRevision. Never recreate an
intent automatically on 409; refresh/review first. Network/body interruption is
an uncertain error, retaining the original envelope. Publish only acknowledged
state; never decrease revision because an old receipt was replayed.

Every named UI below accepts the same `ModuleProps` from
`web/src/services/moduleProps.ts`:

```ts
interface ModuleProps {
  service: BusinessService;
  snapshot: BusinessSnapshot;
  businessDate: string;
  refresh(): Promise<void>;
  onClose(): void;
  onSaved(message: string): void;
  selection?: { clientId?: string; projectId?: string; taskId?: string;
    expenseId?: string; materialId?: string; equipmentId?: string;
    maintenanceId?: string; leadId?: string };
  onOpenTask(id: string): void;
  onAddTask(projectId: string|null): void;
  onOpenExpense(id: string): void;
  onAddExpense(projectId: string|null): void;
  onOpenProject(id: string): void;
  onOpenClient(id: string): void;
}
```

| Owned `web/src/features/<module>/index.tsx` | Required named exports |
| --- | --- |
| clients-projects | ClientsView, ProjectsView, ProjectDetail |
| tasks-time | TaskList, TaskEditor, TimerControls, TimeEntriesView |
| planning | ObjectiveEditor, ScheduleTaskDialog |
| spending | ExpenseForm, ExpensesView |
| inventory | InventoryView, MaterialDetail, MaintenanceDetail |

Use selection for edit/detail IDs; absent IDs mean create where appropriate.
`refresh` fetches/publishes an accepted snapshot; avoid resetting dirty form
state when props refresh. Use onSaved for polite success text. Cross-feature
navigation/actions use callbacks, not imports into another agent's owned tree.
Dialog lifecycle and native Modal integration remain feature responsibilities.
Only the coordinator changes central `web/src/testing/registry.ts`, App.tsx,
Today wiring/global navigation. The current app does not import this registry.

## Harness, ownership and test commands

Server fixture: `server/tests/helpers/fixture.ts` (`createFixture`, `Fixture`,
`TEST_ORIGIN`). It creates a real private temporary SQLite DB and random test
password, returning db/app/repo/ownerId/path/directory/password/authenticate/
envelope/close. Use auth headers from `authenticate()` with Fastify injection.
Use `createFixture({handlers:{...registeredHandlers,...featureHandlers}})`;
test handler overrides cannot be requested through HTTP. Use mutable `now`
closure for timer tests. Close fixtures after every test. The shared database
and package sources are never mocked for module persistence/security tests.

UI harness: `web/tests/modules/helpers.ts` exports
`openModule(page,module,view,selection?)`; `web/src/testing/mount.tsx` supplies
real API/snapshot/callbacks. It mounts `/tests/module-harness/` using the explicit
registry. `playwright.modules.config.ts` starts a fresh isolated API on 3002 and
harness Vite on 5174. No live path/env data or demo storage is used. Tests live
under your assigned `server/tests/modules/<module>` and
`web/tests/modules/<module>`; the config discovers them recursively.

From canonical root:

```bash
pnpm build
pnpm test
pnpm lint
pnpm --filter @pirata/server exec vitest run tests/modules/your-module
pnpm --filter morgan-el-pirata-web test:modules tests/modules/your-module
pnpm --filter morgan-el-pirata-web test:e2e
python3 server/scripts/verify-operations.py
python3 scripts/contract-manifest.py
```

Use the bundled PATH documented in server/README.md. Loopback browser/operations
tests need scoped local-listener approval in restrictive sandboxes. No system
package installation, deployment, user credentials, dependencies, shared schema
or parallel lockfile edits. Preserve other feature handoffs; each owner updates
only its own. Route concrete shared contract blockers back to the foundation
coordinator with expected behavior/repro; do not scaffold alternatives.
