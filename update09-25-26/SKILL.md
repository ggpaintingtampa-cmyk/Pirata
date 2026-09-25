---
name: pirata-update-2026-09-25
description: Morgan el Pirata (painting-company app) build spec for the 2026-09-25 update. Four roles with caps, three-level task tree, unlimited ordered Daily page with person/project day lists and a sticky timer bar, completion records, questions on steps, work-hours shifts with approval and owner-only pay rates and labor cost, daily report, manager project view, CSV export, sales-rep fast capture with project lifecycle (draft/sold/scheduled/partial/assigned/completed), job facts card, file tags and comments, material requests, tool sign-out with per-user cleaning reminders, broken reports, Spanish/English, install-to-home, sliding sessions. Organized as one Foundation step plus four chunks (A Daily, B Hours & reports, C Sales & projects, D Materials, tools & platform) that AI implementers build at the same time with exclusive file ownership. Use when implementing, reviewing or planning any part of this update.
---

# Morgan el Pirata — Update 2026-09-25: build specification

Code root: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/` (pnpm
workspace: `web/` React 19 + Vite, `server/` Fastify + SQLite, `packages/
contracts` zod commands/DTOs/snapshot, `packages/domain` legacy helpers).
Live app: https://pirata.andresinbox.tech. Owner account `andre` (display
name Andres). Everything below is normative unless marked *implementer's
choice*. Requirement IDs (R-…) refer to §1. Written 2026-09-25 from the
discovery Q&A with Andres and a read of the code at commit `17bb2aa` plus the
live uncommitted Work-tab changes.

## 0. How to use this file

**Who reads it.** One "lead" (Andres or his assistant) and five AI
implementers: **F** (Foundation, runs alone, first), then **A, B, C, D** at the
same time. Each implementer reads §0–§2 fully, then only its own chunk section
(§3–§7) and the appendix tables. Do not read other chunks' sections to "help";
their files are off limits to you (§2.7).

**Order of work.**
1. Lead: commit the live baseline (§8.1), then start F.
2. F finishes and commits; lead merges to `main` and runs build + lint.
3. Lead creates four worktrees (§8.2); A, B, C, D start simultaneously.
4. Each chunk commits on its own branch and writes
   `update09-25-26/handoff/<chunk>.md` (§2.8).
5. Lead merges, runs the full suite, does the Spanish sweep and deploys (§8).

**Token discipline (Andres's rule).** Implement, type-check and lint; write
tests; run only the unit tests you added; do NOT run the Playwright suites or
iterate on long test loops. Andres runs the suites himself. Read source files in
slices (`fold -w 200 <file> | sed -n '1,60p'`); files have very long lines.

**Commands** (bundled Node 24 first; from the code root):

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
pnpm install --frozen-lockfile --prod=false
pnpm build            # domain → contracts → server (tsc) → web (tsc -b && vite build)
pnpm lint             # eslint server packages, then web
pnpm --filter @pirata/server typecheck
pnpm --filter @pirata/server test          # vitest (server/tests)
pnpm --filter morgan-el-pirata-web test    # vitest (web/tests/unit + features)
# Playwright (Andres runs these): pnpm --filter morgan-el-pirata-web exec playwright test --config tests/integration/playwright.config.ts ; same with tests/team/playwright.config.ts
python3 scripts/contract-manifest.py --write   # after any change under packages/*/src, server/src/{core,auth,db,app.ts,config.ts,modules/index.ts}, web/src/services
```

**Git rules for every implementer.** Work only in your worktree/branch (§8.2).
`git add` only paths you own (never `git add -A` or `git add .`). Prefix
commits `F:`, `A:`, `B:`, `C:`, `D:`. Never run `git checkout <other branch>`,
`git restore`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge`,
`git pull`: any of them can destroy another implementer's work. The lead merges.

**Existing planning docs.** `FUTURE-IMPLEMENTATIONS.md` (sticky bar §1,
manager view §2, daily review §3, material requests §4) is superseded by this
file where they differ. `README.md`, `web/WORK-TASKS.md`, `web/deploy/
TEAM-RECOVERY.md` stay authoritative for what already exists.

---

## 1. What Andres decided (requirements digest)

Vocabulary. **Office group** = owner + manager + sales (same access for now).
**Worker** = today's `employee` role. **Money** = anything with a dollar value.
**Owner-only money** = expenses, pay rates, labor cost, profit. **Office
money** = a project's sales price, materials price, labor price (sales reps
enter them; workers never see money).

### R-ROLE — roles and permissions
- **R-ROLE-1** Roles `owner`, `manager`, `sales`, `worker`; caps 2 / 5 / 5 /
  10 active accounts, enforced server-side. Existing `employee` rows become
  `worker`. The old cap of four employees is gone.
- **R-ROLE-2** Manager and sales have owner access for now EXCEPT the
  owner-only items: owner-only money, team accounts, Ask settings, workday
  settings, export/import. Permissions are named capabilities in one shared
  helper (`packages/contracts/src/permissions.ts`) so roles can be separated
  later without touching screens.
- **R-ROLE-3** Workers see everything except money: all clients and contact
  info (unless a job fact is hidden from workers), all projects, tasks,
  notes, files, materials, tools; their own hours.
- **R-ROLE-4** Anyone can create and edit any OPEN task (title, description,
  notes, subtasks, assignee, order). A `done` task can be edited or reopened
  only by an owner, server-enforced; exception: the person who completed it
  may reopen it within 10 minutes (undo of an accidental tap).
- **R-ROLE-5** Sales reps see everyone's clients and projects.

### R-DAILY — Daily page and task tree
- **R-DAILY-1** The Work tab becomes the **Daily** page: an unlimited, ordered
  day list is the center of the screen; a sticky timer bar floats at the top
  of EVERY page; the bottom tab bar stays.
- **R-DAILY-2** Two ways to put a task on a day: (a) to a **person** for a
  date (visible to that person and to everyone); (b) to a **project** for a
  date with no person (a pool visible to everyone on that project that day;
  any worker can "take" it and own it). No crew entity: "who is on which
  project today" is a presence row on the same day list.
- **R-DAILY-3** Managers build tomorrow's list the night before: pick the
  date, pick tasks from any level of the tree, order them.
- **R-DAILY-4** Task tree has three levels: task → subtask → tiny task. The
  project screen lists top-level tasks; opening one shows its subtasks and
  tiny tasks. Every level has title, short description, notes, order, status,
  assignee, completion record, photos.
- **R-DAILY-5** Assignment cascades down: assigning a node assigns its
  subtree and the node is what shows in the person's list; assigning a child
  leaves siblings untouched.
- **R-DAILY-6** Daily card shows name, short description, children with done
  toggles; opening it shows notes, the project's pinned paint notes, tiny
  photo thumbnails (tap to open) and the question button.
- **R-DAILY-7** Every completion records who and when (`completedAt`,
  `completedBy`), including cascaded children. Completing a parent completes
  descendants; when all children are done the parent auto-completes.
- **R-DAILY-8** A **question** can be raised on any task node; it is
  catalogued on the project for everyone and listed in the daily report;
  office group can answer; open until answered.
- **R-DAILY-9** No strict hourly schedule; the calendar block stays optional.
- **R-DAILY-10** Retire the Today page objectives and the max-3 daily goals;
  migrate existing daily goals into the day list.
- **R-DAILY-11** Project templates and nested (3-level) task templates.
- **R-DAILY-12** Sticky timer bar: current task, live clock, Start / Pause /
  Complete; pause banks time and ends the session (no server change). Timers
  stay optional, quality-control only.
- **R-DAILY-13** New tasks need a project; new projects need a client.
  Existing unfiled tasks stay visible under "Unfiled" until filed.

### R-TIME / R-REPORT — hours, pay, reports
- **R-TIME-1** Work hours ("shifts") are separate from timers: person +
  project + date + either in/out times or a day count, optional note.
  Workers submit their own; a manager or owner approves before it counts.
  Managers/owners enter shifts for anyone in an attendance grid (date ×
  person × project); those count as approved.
- **R-TIME-2** Pay rate per person: hourly or daily, amount, effective-from
  date (history kept); owner-only.
- **R-TIME-3** Labor cost per project = approved shifts × rate in effect that
  date; shown next to expenses on the project; owner-only.
- **R-TIME-4** "Who worked where and when"; weekly and monthly hours per
  person and per project. Workers see own hours; office sees all; owner
  sees pay.
- **R-TIME-5** CSV export (Excel-compatible) of shifts / time cards and the
  daily report.
- **R-TIME-6** Time pickers replace typed ISO timestamps and HH:MM text.
- **R-REPORT-1** **Daily report** screen: date (default today), filters by
  project and person; sections: tasks completed (who, when, by project),
  hours (shifts per person per project with approval state), end-of-day
  notes, questions raised, materials requested, tools signed out/returned,
  broken reports, money spent per project (owner), labor cost (owner).
  Everyone can open it; money renders only for owner.
- **R-REPORT-2** End-of-day note: optional, one per worker per day, never
  required; the report exists without it.
- **R-REPORT-3** **Manager project view**: everything: tasks done and
  missing (who, when), notes, questions, materials, tools out, hours per
  person; owner-only: sales price, materials price, labor price, expenses,
  labor cost, profit = sales price − expenses − labor cost.

### R-SALES — sales capture, project lifecycle, facts, files
- **R-SALES-1** Project gains start date, end date, sales price, materials
  price, labor price, sales notes, sales rep (creator). Saving needs only
  client + name.
- **R-SALES-2** Fast capture: create project (client + name) → photo on the
  project → "New task" repeatedly with a title and optional photo per task →
  delete declined tasks, add forgotten ones, add subtasks → Save → `sold`.
- **R-SALES-3** Status lifecycle `draft` → `sold` (manager review) →
  `scheduled` (approved, waiting) with derived labels `partial` / `assigned`
  from top-level task assignment → `completed`. Existing `open` → `scheduled`.
  A manager can send `sold` back to `draft` with a note.
- **R-SALES-4** **Job facts card** at the top of the project: client phone,
  gate code, address, paint colors and codes with where each goes, job name
  at the store, client company name, second company point of contact; each
  fact can be hidden from workers; every value has a copy button; no
  tap-to-call.
- **R-SALES-5** Pinned paint notes show on the task detail.
- **R-SALES-6** Leads stay optional; project needs a client; task needs a
  project.
- **R-SALES-7** Files screen gains tags and comments; task cards show very
  small thumbnails that open the file. Keep it small.

### R-MAT / R-TOOL — materials and tools
- **R-MAT-1** Material request: item, quantity, date requested, received
  (who/when), notes; tied to a project, a task or an employee (≥1); anyone
  can request; not tied to expenses or inventory; listed on the project, the
  daily report and a Materials screen.
- **R-TOOL-1** Owner marks which tools need sign-out. Sign-out: tool, date
  taken (default now), project (optional), date returned (optional), note;
  nothing required beyond the tool. The tool shows who has it and where.
- **R-TOOL-2** Signing out creates the cleaning reminder; obligations are
  per user; a sprayer must be cleaned within 3 days of being taken (rule
  per tool).
- **R-TOOL-3** Broken flag with a report (who, when, what, optional photo);
  shows on the tool and the daily report.

### R-X — cross-cutting
- **R-X-1** Spanish and English, switchable per user; existing responsive
  code for iPhone and Android.
- **R-X-2** Install-to-home-screen. Full offline work is out of scope.
- **R-X-3** No more "logged out when the screen is off": sliding 30-day
  sessions, silent recovery when the app returns to the foreground, sign-in
  overlay that keeps the page and draft.
- **R-X-4** Retire duplicates: Today objectives, the hidden Quick Add menu.
- **R-X-5** Andres runs the test suites; implementers write tests, build,
  lint, stop.
- **R-X-6** Four parallel chunks plus a foundation, exclusive file ownership.

### Assumptions the build proceeds with (Andres may overrule)
- **AS-1** 10-minute undo window for the completer (R-ROLE-4).
- **AS-2** Managers and sales do NOT see owner-only money.
- **AS-3** Office money (three project prices) is visible to the office
  group and hidden from workers.
- **AS-4** Manager-entered shifts are approved immediately; approvers may
  edit any shift; a worker may edit or delete only their own `submitted`
  shift.
- **AS-5** A material request can be marked received by the requester or any
  office member.
- **AS-6** Existing `open` projects become `scheduled`; existing daily goals
  become day-list rows; the `objectives` and `daily_goals` tables and their
  commands stay in the code (unused by the UI) until a later cleanup.
- **AS-7** Internal work (shop cleaning, truck) lives under an internal
  client/project Andres creates by hand (for example client "GG Painting",
  project "Shop").
- **AS-8** A daily rate applied to an hours-shift counts `minutes / 480` of
  a day; an hourly rate applied to a day-shift counts 8 hours per day
  (`STANDARD_DAY_MINUTES = 480`).
- **AS-9** The 5-second snapshot polling stays; no websockets.

### Non-goals
Notifications, client-facing sharing, estimates/invoices, lock-screen
button, offline writes, automatic expenses from materials, crews as an entity.

---

## 2. Architecture that makes parallel work safe

The only files four implementers could collide on are the migration, the
contracts, the server core, module registration, the web shell, the i18n
layer and shared components. **F owns all of them and finishes before A–D
start.** F defines every new table, command, DTO and snapshot field
(additive; then frozen), registers stub handlers and stub screens, and each
chunk only fills its own folders. Chunks exchange data only through the
snapshot and the frozen commands, never by importing each other's UI.

### 2.1 Roles and capabilities — `packages/contracts/src/permissions.ts` (new, F)

```ts
export const ROLES=['owner','manager','sales','worker'] as const;
export type Role=typeof ROLES[number];
export const ROLE_CAPS:Record<Role,number>={owner:2,manager:5,sales:5,worker:10};
export type Capability=
 |'money.costs'        // expenses, pay rates, labor cost, profit, Spending & Pay screens
 |'money.sales'        // project salesPriceCents / materialsPriceCents / laborPriceCents
 |'team.admin'|'ask.admin'|'settings.admin'|'data.admin'   // existing owner-only screens
 |'project.review'     // sold→scheduled, sold→draft (send back)
 |'shift.approve'      // approve/reject/edit anyone's shift
 |'shift.enterForOthers' // attendance grid rows for other people
 |'task.editDone'      // edit/reopen a done task outside the 10-minute undo window
 |'plan.others'        // edit another person's or a project's day list, set presence
 |'equipment.admin'    // requires-sign-out flag, resolve broken report
 |'facts.hidden'       // read facts with workerVisible=0
 |'template.manage';   // save project/task templates
const OFFICE:readonly Role[]=['owner','manager','sales'];
export const CAPABILITIES:Record<Capability,readonly Role[]>={
 'money.costs':['owner'],'money.sales':OFFICE,'team.admin':['owner'],'ask.admin':['owner'],'settings.admin':['owner'],'data.admin':['owner'],
 'project.review':['owner','manager'],'shift.approve':['owner','manager'],'shift.enterForOthers':['owner','manager'],'task.editDone':['owner'],
 'plan.others':OFFICE,'equipment.admin':['owner','manager'],'facts.hidden':OFFICE,'template.manage':OFFICE};
export function can(role:Role|undefined,cap:Capability):boolean{return !!role&&CAPABILITIES[cap].includes(role);}
/** Command types that need a capability; every other command is open to every signed-in role. Keyed by string to avoid an import cycle with index.ts. */
export const COMMAND_CAPABILITY:Readonly<Record<string,Capability>>={
 'expense.create':'money.costs','expense.update':'money.costs','payRate.set':'money.costs','payRate.remove':'money.costs',
 'settings.update':'settings.admin','shift.enter':'shift.enterForOthers','shift.approve':'shift.approve','shift.reject':'shift.approve',
 'dayList.setPresence':'plan.others','equipment.setSignOutRequired':'equipment.admin','equipment.resolveReport':'equipment.admin',
 'projectTemplate.save':'template.manage','projectTemplate.fromProject':'template.manage','taskTemplate.saveTree':'template.manage'};
```

Commands whose permission depends on the record (own shift vs someone
else's, done task, other person's day list, project.setStatus transitions)
check inside the handler with `can(ctx.role, …)`; §3–§7 say which.

Web: `web/src/state/permissions.ts` (F) exports `useCan(cap)` reading
`useServer().state.data?.currentUser?.role`. Replace every
`role!=='employee'` / `role==='owner'` site listed in fact §2.1 of the
handoff (LiveApp.tsx:31, navigation.ts:4/12, WorkspaceNavigation.tsx:16-50,
dialogs.tsx:33, clients-projects/index.tsx:119, work/index.tsx:43,
myTasks.ts:18/44, team/index.tsx:11/30/31/35) with `can()`.

### 2.2 Money visibility (server-enforced in the snapshot)

| Data | owner | manager / sales | worker |
|---|---|---|---|
| `expenses`, `payRates`, labor cost, profit | yes | no (`[]` / null) | no |
| project `salesPriceCents`, `materialsPriceCents`, `laborPriceCents`, `salesNote` | yes | yes | null / '' |
| `workShifts` | all | all | own rows only |
| `projectFacts` with `workerVisible=0` | yes | yes | omitted |
| everything else | yes | yes | yes |

The web additionally hides money blocks with `useCan('money.costs')` /
`useCan('money.sales')`, but the server filter is the guarantee.

### 2.3 Data model — `server/src/db/migrations/003-update-2026-09-25.sql` (F)

Constraints from `server/src/db/database.ts`: migrations are `NNN-*.sql`,
sorted, **contiguous** (`Migrations must be contiguous.`), sha256-checksummed
and applied on every `openDatabase` (the API service migrates on restart).
Therefore **003 is the only migration of this update**; chunks never add
migrations. A chunk that needs a column files a "contract change request"
in its handoff; the lead adds `004-*.sql` after integration. All tables are
`STRICT`; `CHECK` constraints cannot be altered, so `team_members` and
`projects` are rebuilt exactly like `002-team.sql` rebuilds `tasks`
(`CREATE … _new` → `INSERT … SELECT` → `DROP` → `RENAME` → recreate indexes
and triggers; `migrate()` runs with `foreign_keys=OFF` and validates with
`foreign_key_check`). Use explicit column lists in every INSERT and trigger.

```sql
-- Version 3: four roles, three-level tasks with completion records, day lists, questions, day notes,
-- project lifecycle + sales fields + facts, work shifts + pay rates, material requests, tool sign-outs,
-- broken reports, per-user cleanup cycles, nested templates, file tags + comments, user locale.

-- team_members: roles + locale (rebuild; CHECK cannot change)
CREATE TABLE team_members_new (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE, role TEXT NOT NULL CHECK(role IN ('owner','manager','sales','worker')), password_hash TEXT NOT NULL, disabled_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, locale TEXT NOT NULL DEFAULT 'en' CHECK(locale IN ('en','es')), UNIQUE(owner_id,id)) STRICT;
INSERT INTO team_members_new (id,owner_id,name,username,role,password_hash,disabled_at,created_at,updated_at) SELECT id,owner_id,name,username,CASE role WHEN 'employee' THEN 'worker' ELSE role END,password_hash,disabled_at,created_at,updated_at FROM team_members;
DROP TRIGGER owners_team_insert; DROP TRIGGER owners_team_password;
DROP TABLE team_members; ALTER TABLE team_members_new RENAME TO team_members;
CREATE TRIGGER owners_team_insert AFTER INSERT ON owners BEGIN INSERT INTO team_members (id,owner_id,name,username,role,password_hash,disabled_at,created_at,updated_at) VALUES (NEW.id,NEW.id,'Owner',CASE WHEN EXISTS(SELECT 1 FROM team_members WHERE username='owner') THEN 'owner-'||NEW.id ELSE 'owner' END,'owner',NEW.password_hash,NULL,NEW.created_at,NEW.updated_at); END;
CREATE TRIGGER owners_team_password AFTER UPDATE OF password_hash ON owners BEGIN UPDATE team_members SET password_hash=NEW.password_hash,updated_at=NEW.updated_at WHERE id=NEW.id; END;

-- tasks: description, order, completion record (depth <= 3 is enforced in code)
ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK(length(description) BETWEEN 0 AND 300);
ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 100000);
ALTER TABLE tasks ADD COLUMN completed_at INTEGER CHECK(completed_at BETWEEN 0 AND 9007199254740991);
ALTER TABLE tasks ADD COLUMN completed_by TEXT REFERENCES team_members(id);
UPDATE tasks SET completed_at=updated_at WHERE status='done';
UPDATE tasks SET position=(SELECT count(*) FROM tasks t2 WHERE t2.owner_id=tasks.owner_id AND coalesce(t2.parent_task_id,'')=coalesce(tasks.parent_task_id,'') AND coalesce(t2.project_id,'')=coalesce(tasks.project_id,'') AND (t2.created_at<tasks.created_at OR (t2.created_at=tasks.created_at AND t2.id<tasks.id)));

-- day lists (replaces daily_goals; daily_goals stays but is no longer written)
CREATE TABLE day_assignments (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, date TEXT NOT NULL CHECK(length(date)=10), project_id TEXT NOT NULL, task_id TEXT, user_id TEXT REFERENCES team_members(id), position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id), CHECK(task_id IS NOT NULL OR user_id IS NOT NULL)) STRICT;
CREATE INDEX day_assignments_date_idx ON day_assignments(owner_id,date);
INSERT INTO day_assignments (id,owner_id,created_at,updated_at,date,project_id,task_id,user_id,position,created_by) SELECT g.id,g.owner_id,g.created_at,g.updated_at,g.date,t.project_id,g.task_id,g.user_id,g.position,g.user_id FROM daily_goals g JOIN tasks t ON t.owner_id=g.owner_id AND t.id=g.task_id WHERE t.project_id IS NOT NULL;

CREATE TABLE task_questions (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, task_id TEXT NOT NULL, project_id TEXT NOT NULL, asked_by TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), answered_at INTEGER, answered_by TEXT REFERENCES team_members(id), answer TEXT NOT NULL DEFAULT '' CHECK(length(answer) BETWEEN 0 AND 2000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,task_id) REFERENCES tasks(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)) STRICT;
CREATE TABLE day_notes (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), date TEXT NOT NULL CHECK(length(date)=10), body TEXT NOT NULL CHECK(length(body) BETWEEN 0 AND 4000), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,user_id,date)) STRICT;

-- templates: nested tree JSON (titles stays for old flat templates)
ALTER TABLE task_templates ADD COLUMN tree TEXT CHECK(tree IS NULL OR json_valid(tree));
CREATE TABLE project_templates (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160), note TEXT NOT NULL DEFAULT '', tree TEXT NOT NULL CHECK(json_valid(tree)), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id)) STRICT;

-- projects: lifecycle + sales fields (rebuild)
CREATE TABLE projects_new (id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100), owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160), client_id TEXT, client_name TEXT NOT NULL CHECK(length(client_name) BETWEEN 0 AND 100), address TEXT NOT NULL CHECK(length(address) BETWEEN 0 AND 300), note TEXT NOT NULL CHECK(length(note) BETWEEN 0 AND 1000), status TEXT NOT NULL CHECK(status IN ('draft','sold','scheduled','completed')), start_date TEXT CHECK(start_date IS NULL OR length(start_date)=10), end_date TEXT CHECK(end_date IS NULL OR length(end_date)=10), sales_price_cents INTEGER CHECK(sales_price_cents IS NULL OR sales_price_cents BETWEEN 0 AND 9007199254740991), materials_price_cents INTEGER CHECK(materials_price_cents IS NULL OR materials_price_cents BETWEEN 0 AND 9007199254740991), labor_price_cents INTEGER CHECK(labor_price_cents IS NULL OR labor_price_cents BETWEEN 0 AND 9007199254740991), sales_note TEXT NOT NULL DEFAULT '' CHECK(length(sales_note) BETWEEN 0 AND 4000), sales_rep_id TEXT REFERENCES team_members(id), review_note TEXT NOT NULL DEFAULT '' CHECK(length(review_note) BETWEEN 0 AND 1000), sold_at INTEGER, scheduled_at INTEGER, completed_at INTEGER, PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,client_id) REFERENCES clients(owner_id,id)) STRICT;
INSERT INTO projects_new (id,owner_id,created_at,updated_at,name,client_id,client_name,address,note,status) SELECT id,owner_id,created_at,updated_at,name,client_id,client_name,address,note,CASE status WHEN 'open' THEN 'scheduled' ELSE status END FROM projects;
DROP TABLE projects; ALTER TABLE projects_new RENAME TO projects;
CREATE INDEX projects_client_id_idx ON projects(owner_id,client_id); CREATE INDEX projects_order_idx ON projects(owner_id,created_at,id);

CREATE TABLE project_facts (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, project_id TEXT NOT NULL, key TEXT NOT NULL CHECK(key IN ('client_phone','gate_code','address','paint','store_job_name','client_company','company_contact','custom')), label TEXT NOT NULL CHECK(length(label) BETWEEN 0 AND 80), value TEXT NOT NULL CHECK(length(value) BETWEEN 0 AND 1000), worker_visible INTEGER NOT NULL DEFAULT 1 CHECK(worker_visible IN (0,1)), position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id)) STRICT;

-- work hours and pay
CREATE TABLE pay_rates (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), kind TEXT NOT NULL CHECK(kind IN ('hourly','daily')), amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991), effective_from TEXT NOT NULL CHECK(length(effective_from)=10), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,user_id,effective_from)) STRICT;
CREATE TABLE work_shifts (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), project_id TEXT NOT NULL, date TEXT NOT NULL CHECK(length(date)=10), kind TEXT NOT NULL CHECK(kind IN ('hours','day')), start_minute INTEGER CHECK(start_minute IS NULL OR start_minute BETWEEN 0 AND 1439), end_minute INTEGER CHECK(end_minute IS NULL OR end_minute BETWEEN 1 AND 1440), break_minutes INTEGER NOT NULL DEFAULT 0 CHECK(break_minutes BETWEEN 0 AND 600), days_minor INTEGER CHECK(days_minor IS NULL OR days_minor IN (25,50,75,100,150,200)), minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440), note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 1000), status TEXT NOT NULL CHECK(status IN ('submitted','approved','rejected')), submitted_by TEXT NOT NULL REFERENCES team_members(id), approved_by TEXT REFERENCES team_members(id), approved_at INTEGER, decision_note TEXT NOT NULL DEFAULT '' CHECK(length(decision_note) BETWEEN 0 AND 1000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), CHECK((kind='hours' AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute>start_minute AND days_minor IS NULL) OR (kind='day' AND days_minor IS NOT NULL AND start_minute IS NULL AND end_minute IS NULL))) STRICT;
CREATE INDEX work_shifts_date_idx ON work_shifts(owner_id,date); CREATE INDEX work_shifts_user_idx ON work_shifts(owner_id,user_id);

-- material requests (shopping_items keeps its name; the UI calls them material requests)
ALTER TABLE shopping_items ADD COLUMN quantity TEXT NOT NULL DEFAULT '' CHECK(length(quantity) BETWEEN 0 AND 80);
ALTER TABLE shopping_items ADD COLUMN task_id TEXT;
ALTER TABLE shopping_items ADD COLUMN for_user_id TEXT REFERENCES team_members(id);
ALTER TABLE shopping_items ADD COLUMN received_at INTEGER;
ALTER TABLE shopping_items ADD COLUMN received_by TEXT REFERENCES team_members(id);
ALTER TABLE shopping_items ADD COLUMN archived_at INTEGER;
UPDATE shopping_items SET received_at=checked_at WHERE checked_at IS NOT NULL;

-- tools
ALTER TABLE equipment ADD COLUMN requires_sign_out INTEGER NOT NULL DEFAULT 0 CHECK(requires_sign_out IN (0,1));
ALTER TABLE equipment ADD COLUMN status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','broken'));
CREATE TABLE tool_sign_outs (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, equipment_id TEXT NOT NULL, taken_by TEXT NOT NULL REFERENCES team_members(id), taken_at INTEGER NOT NULL, project_id TEXT, returned_at INTEGER, returned_by TEXT REFERENCES team_members(id), note TEXT NOT NULL DEFAULT '' CHECK(length(note) BETWEEN 0 AND 1000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id), FOREIGN KEY(owner_id,project_id) REFERENCES projects(owner_id,id), CHECK(returned_at IS NULL OR returned_at>=taken_at)) STRICT;
CREATE UNIQUE INDEX tool_sign_outs_open ON tool_sign_outs(owner_id,equipment_id) WHERE returned_at IS NULL;
CREATE TABLE equipment_reports (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, equipment_id TEXT NOT NULL, reported_by TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), attachment_id TEXT, resolved_at INTEGER, resolved_by TEXT REFERENCES team_members(id), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,equipment_id) REFERENCES equipment(owner_id,id), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
ALTER TABLE cleanup_obligations ADD COLUMN completed_by TEXT REFERENCES team_members(id);
DROP INDEX cleanup_open_cycle;
CREATE UNIQUE INDEX cleanup_open_cycle ON cleanup_obligations(owner_id,equipment_id,user_id) WHERE completed_at IS NULL;

-- files
CREATE TABLE attachment_tags (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attachment_id TEXT NOT NULL, tag TEXT NOT NULL CHECK(length(tag) BETWEEN 1 AND 40), created_by TEXT NOT NULL REFERENCES team_members(id), PRIMARY KEY(owner_id,id), UNIQUE(owner_id,attachment_id,tag), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
CREATE TABLE attachment_comments (id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES owners(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attachment_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES team_members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,attachment_id) REFERENCES attachments(owner_id,id)) STRICT;
```

Repository wiring (F, `server/src/core/repositories.ts`): add to `Tables`
and `TABLES`: `day_assignments`, `task_questions`, `day_notes`,
`project_templates`, `project_facts`, `pay_rates`, `work_shifts`,
`tool_sign_outs`, `equipment_reports`, `attachment_tags`,
`attachment_comments`. Extend `remove()`'s allow-list with
`day_assignments`, `work_shifts`, `pay_rates`, `project_facts`,
`attachment_tags`. `team()` must select `locale` too. Columns map
snake→camel automatically (`days_minor`→`daysMinor`, `for_user_id`→
`forUserId`, `worker_visible`→`workerVisible`, `requires_sign_out`→
`requiresSignOut`).

### 2.4 Contracts (F writes all of it; chunks implement against it)

`CONTRACT_VERSION` → `'3.0.0'`. One new file per chunk, re-exported from
`packages/contracts/src/index.ts`, each exporting `…Commands` (array of
`command()` schemas appended to `commandSchema`), DTO schemas/types and a
`…Snapshot` slice merged into `extraSnapshot`/`snapshotSchema`
(`.optional()` so an old server never breaks a new web). Field rules:
`id`/`title`/`note`/`dateSchema`/`safeInteger` as in `index.ts`; new command
fields get `.default()` or `.optional()` so the AI assistant's
`commandSchema.parse` keeps working.

**Changed existing schemas (`index.ts`, `extra.ts`)**
- `teamMemberSchema.role` → `z.enum(ROLES)`; add `locale:z.enum(['en','es']).optional()`.
- `task` input: `projectId:idSchema` (required, non-null) in `task.create`;
  `task.update` keeps nullable for legacy rows; add
  `description:z.string().trim().max(300).default('')`. `taskSchema` adds
  `description`, `position`, `completedAt`, `completedBy` (all optional/
  nullable). `Task` type likewise.
- `project` input: `clientId:idSchema` required in `project.create`
  (nullable stays in `project.update`); add `startDate:dateSchema.nullable().default(null)`,
  `endDate`, `salesPriceCents:safeInteger.nullable().default(null)`,
  `materialsPriceCents`, `laborPriceCents`, `salesNote:z.string().trim().max(4000).default('')`.
  `project.setStatus` → `{id, status:z.enum(['draft','sold','scheduled','completed']), note:noteSchema.default('')}`.
  `projectSchema`/`Project` add those plus `salesRepId`, `reviewNote`,
  `soldAt`, `scheduledAt`, `completedAt` (optional/nullable).
  `compatibility.ts` `toLegacyState` maps status to
  `p.status==='completed'?'completed':'open'` (it runs `validateState` on
  every render; an unmapped status crashes the app).
- `shoppingItemSchema` adds `quantity`, `taskId`, `forUserId`, `receivedAt`,
  `receivedBy`, `archivedAt` (optional/nullable).
- `equipmentSchema` adds `requiresSignOut:z.number().int().min(0).max(1).optional()`, `status:z.enum(['ok','broken']).optional()`.
- `cleanupObligationSchema` adds `completedBy:id.nullable().optional()`.
- `taskTemplateSchema` adds `tree:z.string().nullable().optional()`.

**`daily.ts` (chunk A)**
```ts
export const templateNodeSchema:z.ZodType<TemplateNode>=z.lazy(()=>z.object({title,description:z.string().trim().max(300).default(''),children:z.array(templateNodeSchema).max(50).default([])}).strict());
export type TemplateNode={title:string;description:string;children:TemplateNode[]};   // depth is checked in handlers (max 3 levels)
export const dayScopeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('person'),userId:id}).strict(),z.object({kind:z.literal('project'),projectId:id}).strict()]);
export const dailyCommands=[
 command('task.reorder',{projectId:id,parentTaskId:nullableId.default(null),orderedIds:z.array(id).min(1).max(500)}),
 command('dayList.replace',{date:dateSchema,scope:dayScopeSchema,taskIds:z.array(id).max(500).refine(a=>new Set(a).size===a.length)}),
 command('dayList.take',{id}),                               // pool item -> me
 command('dayList.release',{id}),                            // my item -> project pool
 command('dayList.setPresence',{date:dateSchema,projectId:id,userIds:z.array(id).max(50)}),
 command('question.ask',{taskId:id,body:z.string().trim().min(1).max(2000)}),
 command('question.answer',{id,answer:z.string().trim().min(1).max(2000)}),
 command('taskTemplate.saveTree',{name:title,tree:z.array(templateNodeSchema).min(1).max(50)}),
 command('taskTemplate.applyTree',{templateId:id,projectId:id,parentTaskId:nullableId.default(null)}),
 command('projectTemplate.save',{name:title,note:z.string().trim().max(1000).default(''),tree:z.array(templateNodeSchema).min(1).max(50)}),
 command('projectTemplate.apply',{templateId:id,projectId:id}),
 command('projectTemplate.fromProject',{projectId:id,name:title}),
] as const;
export const dayAssignmentSchema=z.object({...record,date:z.string(),projectId:id,taskId:nullableId,userId:nullableId,position:z.number().int(),createdBy:id}).strict();
export const taskQuestionSchema=z.object({...record,taskId:id,projectId:id,askedBy:id,body:z.string(),answeredAt:stamp.nullable(),answeredBy:nullableId,answer:z.string()}).strict();
export const projectTemplateSchema=z.object({...record,name:z.string(),note:z.string(),tree:z.string(),createdBy:id}).strict();
export const dailySnapshot={dayAssignments:z.array(dayAssignmentSchema).optional(),taskQuestions:z.array(taskQuestionSchema).optional(),projectTemplates:z.array(projectTemplateSchema).optional()};
// pure helpers shared by A and B (F writes them, with unit tests):
export function taskDepth(tasks:Task[],id:string):0|1|2;            // throws if deeper than 2 (corrupt data)
export function subtree(tasks:Task[],id:string):Task[];               // node + all descendants, ordered by position
export function orderedChildren(tasks:Task[],parentId:string|null,projectId:string|null):Task[];
export function dayItems(snapshot:BusinessSnapshot,date:string,scope:DayScope):DayAssignment[];   // ordered rows for a person or a project pool
export function dayCompletion(tasks:Task[],rows:DayAssignment[]):number;   // 0..1 over the rows' tasks incl. subtrees, done = 1
```

**`hours.ts` (chunk B)**
```ts
export const STANDARD_DAY_MINUTES=480;
const shiftFields={projectId:id,date:dateSchema,kind:z.enum(['hours','day']),startMinute:z.number().int().min(0).max(1439).nullable().default(null),endMinute:z.number().int().min(1).max(1440).nullable().default(null),breakMinutes:z.number().int().min(0).max(600).default(0),daysMinor:z.union([z.literal(25),z.literal(50),z.literal(75),z.literal(100),z.literal(150),z.literal(200)]).nullable().default(null),note:z.string().trim().max(1000).default('')};
export const hoursCommands=[
 command('shift.submit',shiftFields),                       // own, status submitted
 command('shift.enter',{userId:id,...shiftFields}),         // office for anyone, status approved
 command('shift.update',{id,...shiftFields}),
 command('shift.approve',{id}), command('shift.reject',{id,note:z.string().trim().min(1).max(1000)}), command('shift.remove',{id}),
 command('payRate.set',{userId:id,kind:z.enum(['hourly','daily']),amountCents:safeInteger,effectiveFrom:dateSchema}), command('payRate.remove',{id}),
 command('dayNote.save',{date:dateSchema,body:z.string().trim().max(4000)}),   // own only; empty body keeps the row with ''
] as const;
export const workShiftSchema=z.object({...record,userId:id,projectId:id,date:z.string(),kind:z.enum(['hours','day']),startMinute:z.number().nullable(),endMinute:z.number().nullable(),breakMinutes:z.number(),daysMinor:z.number().nullable(),minutes:z.number(),note:z.string(),status:z.enum(['submitted','approved','rejected']),submittedBy:id,approvedBy:nullableId,approvedAt:stamp.nullable(),decisionNote:z.string()}).strict();
export const payRateSchema=z.object({...record,userId:id,kind:z.enum(['hourly','daily']),amountCents:z.number(),effectiveFrom:z.string(),createdBy:id}).strict();
export const dayNoteSchema=z.object({...record,userId:id,date:z.string(),body:z.string()}).strict();
export const hoursSnapshot={workShifts:z.array(workShiftSchema).optional(),payRates:z.array(payRateSchema).optional(),dayNotes:z.array(dayNoteSchema).optional()};
export function shiftMinutes(s:{kind:'hours'|'day';startMinute:number|null;endMinute:number|null;breakMinutes:number;daysMinor:number|null}):number;  // hours: end-start-break; day: daysMinor/100*480
export function rateFor(rates:PayRate[],userId:string,date:string):PayRate|undefined;   // latest effectiveFrom <= date
export function shiftCostCents(shift:WorkShift,rate:PayRate|undefined):number;          // hourly: amount*minutes/60; daily: amount*minutes/480; rounded
export function laborCostCents(shifts:WorkShift[],rates:PayRate[],filter:{projectId?:string;from?:string;to?:string}):number;  // approved only
export function weekBounds(date:string):{from:string;to:string};                        // Monday..Sunday, America/New_York calendar dates
```

**`sales.ts` (chunk C)**
```ts
export const factKeySchema=z.enum(['client_phone','gate_code','address','paint','store_job_name','client_company','company_contact','custom']);
export const salesCommands=[
 command('projectFact.save',{id:id.optional(),projectId:id,key:factKeySchema,label:z.string().trim().max(80).default(''),value:z.string().trim().max(1000),workerVisible:z.boolean().default(true),position:z.number().int().min(0).max(1000).default(0)}),
 command('projectFact.remove',{id}),
 command('attachment.tag',{attachmentId:id,tag:z.string().trim().min(1).max(40),add:z.boolean()}),
 command('attachment.comment',{attachmentId:id,body:z.string().trim().min(1).max(2000)}),
] as const;
export const projectFactSchema=z.object({...record,projectId:id,key:factKeySchema,label:z.string(),value:z.string(),workerVisible:z.number(),position:z.number(),createdBy:id}).strict();
export const attachmentTagSchema=z.object({...record,attachmentId:id,tag:z.string(),createdBy:id}).strict();
export const attachmentCommentSchema=z.object({...record,attachmentId:id,userId:id,body:z.string()}).strict();
export const salesSnapshot={projectFacts:z.array(projectFactSchema).optional(),attachmentTags:z.array(attachmentTagSchema).optional(),attachmentComments:z.array(attachmentCommentSchema).optional()};
export type ProjectLabel='draft'|'sold'|'scheduled'|'partial'|'assigned'|'completed';
export function projectLabel(project:Project,tasks:Task[]):ProjectLabel;   // scheduled + all top-level non-archived tasks assigned -> assigned; some -> partial
export const PROJECT_TRANSITIONS:Record<Project['status'],Project['status'][]>={draft:['sold'],sold:['scheduled','draft'],scheduled:['completed'],completed:['scheduled']};
```

**`tools.ts` (chunk D)**
```ts
export const toolsCommands=[
 command('materialRequest.create',{title,quantity:z.string().trim().max(80).default(''),note:z.string().trim().max(4000).default(''),projectId:nullableId.default(null),taskId:nullableId.default(null),forUserId:nullableId.default(null)}),
 command('materialRequest.update',{id,title,quantity:z.string().trim().max(80).default(''),note:z.string().trim().max(4000).default('')}),
 command('materialRequest.setReceived',{id,received:z.boolean()}),
 command('materialRequest.remove',{id}),                     // soft: archivedAt
 command('tool.signOut',{equipmentId:id,projectId:nullableId.default(null),takenAt:stamp.nullable().default(null),note:z.string().trim().max(1000).default('')}),
 command('tool.return',{id,returnedAt:stamp.nullable().default(null)}),
 command('equipment.setSignOutRequired',{id,required:z.boolean()}),
 command('equipment.reportBroken',{id,body:z.string().trim().min(1).max(2000),attachmentId:nullableId.default(null)}),
 command('equipment.resolveReport',{id}),
 command('user.setLocale',{locale:z.enum(['en','es'])}),
] as const;
export const toolSignOutSchema=z.object({...record,equipmentId:id,takenBy:id,takenAt:stamp,projectId:nullableId,returnedAt:stamp.nullable(),returnedBy:nullableId,note:z.string()}).strict();
export const equipmentReportSchema=z.object({...record,equipmentId:id,reportedBy:id,body:z.string(),attachmentId:nullableId,resolvedAt:stamp.nullable(),resolvedBy:nullableId}).strict();
export const toolsSnapshot={toolSignOuts:z.array(toolSignOutSchema).optional(),equipmentReports:z.array(equipmentReportSchema).optional()};
```

`shopping.add` / `shopping.check` stay (the AI assistant's `add_shopping`
uses them) and write the same table; `shopping.check` also sets
`receivedAt`/`receivedBy`.

### 2.5 Server conventions

- Handler signature (`server/src/core/context.ts`):
  `(ctx:TransactionContext, c:CommandOf<T>) => {changed:boolean; result:{kind:string; id?:string}}`,
  synchronous, inside one SQLite transaction. `ctx` = `{ownerId, userId,
  role, serverNow, revision, repo, newId()}`. `ctx.role` becomes `Role`.
- `modules/index.ts` spreads every module's `handlers` and the object
  `satisfies HandlerMap`, which requires a handler for EVERY command type.
  F therefore creates `server/src/modules/{daily,hours,sales,materials-tools}/index.ts`
  exporting `handlers` where each new command is a stub
  `(ctx,c)=>notImplemented()` (`core/errors.ts`). Chunks replace the stubs in
  their own module file only.
- Dispatcher (`core/commands.ts:17`): replace the hard-coded owner check with
  `const cap=COMMAND_CAPABILITY[request.command.type]; if(cap&&!can(role,cap)) throw new ApiError(403,'FORBIDDEN','You do not have permission for this action.');`
- Activity: the dispatcher logs one `activity` row per changed command (kind
  = command type, `taskId` when the result kind is `task`). Chunk B's report
  reads tables, not activity, except for messages and file uploads.
- Snapshot (`core/snapshot.ts`): F adds every slice (`r.list('…')`) and the
  role filters of §2.2. Chunks do not touch it.
- Errors: `invalid(message, fields?)` → 400, `conflict()` → 409,
  `notFound()` → 404, `new ApiError(403,'FORBIDDEN',…)`.
- Money is always integer cents; quantities in hundredths; dates are
  `YYYY-MM-DD` in America/New_York (`isLocalDate`), timestamps are ms.
- Direct-DB admin routes (team) must bump `data_revisions` (see `auth/team.ts`).

### 2.6 Web conventions

- Views are hash routes (`web/src/live/navigation.ts`: `ViewName`, `names`,
  `readView(hash, role)` after F, `viewHref`). Param views: `project`,
  `clients`, plus new `insights` (project id) and `report` (optional date).
- New views (F adds names, menu entries and stub components; chunks fill the
  components): `work` (label "Daily"; A), `report` (B), `hours` (B), `pay`
  (owner; B), `insights/:id` (B), `materials` (D; `shopping` redirects to it),
  `tools` (D), `templates` (A). `today` is removed (redirects to `work`).
- `web/src/live/LiveApp.tsx` renders `<WorkBar/>` (from
  `features/work-bar/WorkBar.tsx`) between the header and `content-viewport`
  on every page; the floating button opens the explicit Add menu (F rebuilds
  the existing `{kind:'quick'}` dialog as a plain list, no "Back to Add
  menu" step) whose entries open dialogs through `web/src/live/dialogRegistry.ts`
  (`{ 'material-request': lazy(()=>import('../features/materials/RequestDialog')), 'shift': …/hours/ShiftDialog, 'tool-signout': …/tools/SignOutDialog, 'question': …/work/QuestionDialog }`).
  F creates those four stub dialog files; the owning chunk fills them.
- Data access: `useServer()` (`web/src/state/serverContext.ts`) → `{store,
  state, now}`; `state.data` is the `BusinessSnapshot`; commands go through
  `createMutation(command, state.data.revision)` + `store`/`app.service.execute`
  as existing features do (copy `features/tasks-time/WorkForm.tsx`, which
  handles 401/403 and 409 messages). Feature screens receive `ModuleProps`
  (`web/src/services/moduleProps.ts`) as `app` (`app.snapshot`,
  `app.refresh()`, `app.service`).
- Task detail sheet: `LiveDialogs` in `web/src/live/dialogs.tsx` with
  `Dialog` kinds such as `{kind:'task-new', projectId?}`; open tasks with the
  `open(dialog)` callback the shell passes down. Chunks B/C/D open a task
  with `open({kind:'task', id})` (kind name as existing; A must keep it).
- i18n (F, `web/src/i18n/`): `useT()` returns `t(key, vars?)`; keys are
  `namespace.key`; per-feature `strings.ts` exports `{en:{…}, es:{…}}` and is
  merged with `import.meta.glob('../features/*/strings.ts',{eager:true})`;
  shell strings in `web/src/i18n/shell.ts`. Locale = `currentUser.locale`,
  else `navigator.language.startsWith('es')?'es':'en'`. The language toggle
  lives in the Menu account card (F) and sends `user.setLocale`. Every NEW
  string goes through `t()`; each chunk also translates the existing
  screens in the folders it owns.
- Shared primitives (F, `web/src/components/`): `CopyField` (label, value,
  copy button using `navigator.clipboard`, fallback select-all),
  `TimeField` (`<input type="time">` → minute-of-day number), `DateField`
  (`<input type="date">` → `YYYY-MM-DD`), `ThumbStrip` (tiny 40px
  thumbnails from `attachments` for a parent, `onOpen(id)` opens
  `/api/v1/files/:id/content` in a new tab or the Files view), `Money`
  (cents → `$1,234.56`).
- Styling: dark charcoal surfaces, amber primary (`web/src/styles/
  figma.css`, `tokens.css`); reuse existing classes (task rows, chips,
  rings) — copy from `features/work/styles.css`, `features/tasks-time/styles.css`.
  Rules from `web/REDESIGN.md`: no fake affordances, no priority fields, no
  switches that do nothing, phone-first at 320/390, desktop at 1280.
- Screenshots: each chunk stores evidence in `web/artifacts/update-2026-09-25/<chunk>/`
  (390 and 1280 widths at least) only if it already has a browser harness
  running; otherwise skip (Andres verifies on device).

### 2.7 File ownership — the law during the parallel phase

Frozen after F (nobody edits; change requests go in the handoff):
`server/src/db/migrations/**`, `packages/**`, `server/src/core/**`,
`server/src/modules/index.ts`, `server/src/auth/**`, `server/src/app.ts`,
`server/src/config.ts`, `server/src/ai/**`, `server/src/integration/**`,
`web/src/live/{LiveApp.tsx,navigation.ts,WorkspaceNavigation.tsx,dialogRegistry.ts,DataTools.tsx}`,
`web/src/i18n/**`, `web/src/components/**`, `web/src/state/{permissions.ts,serverContext.ts}`,
`web/src/services/**`, `web/src/styles/**`, root configs.

| Chunk | Owns (may create/edit/delete) |
|---|---|
| **A** | `server/src/modules/{tasks-time,planning,daily}/**`; `web/src/features/{work,work-bar,tasks-time,templates}/**`; `web/src/live/dialogs.tsx`; `server/tests/modules/{tasks-time,planning,daily}/**`; `web/tests/unit/{myTasks,dayList,taskTree}.test.ts`; `web/tests/team/{daily,work-tasks}.spec.ts`; `update09-25-26/handoff/A.md` |
| **B** | `server/src/modules/hours/**`; `server/src/routes/export.ts`; `web/src/features/{hours,pay,report,insights,planning}/**`; `server/tests/modules/hours/**`; `web/tests/unit/{hours,report}.test.ts`; `web/tests/team/{hours,report}.spec.ts`; `update09-25-26/handoff/B.md` |
| **C** | `server/src/modules/{clients-projects,sales}/**`; `server/src/files/**`; `web/src/features/{clients-projects,sales,facts,files,team}/**`; `web/src/features/collaboration/files.tsx`; `server/tests/modules/{clients-projects,sales}/**`; `web/tests/unit/{sales,facts,fileHierarchy}.test.ts`; `web/tests/team/{sales,team}.spec.ts`; `update09-25-26/handoff/C.md` |
| **D** | `server/src/modules/{inventory,collaboration,materials-tools}/**`; `web/src/features/{inventory,materials,tools,spending,ask,quick-add}/**`; `web/src/features/collaboration/{index,actions,cleanup}.tsx`, `hierarchy.ts`, `styles.css`; `web/src/live/SignIn.tsx`; `web/src/state/{serverStore.ts,serverProvider.tsx}`; `web/src/main.tsx`; `web/index.html`; `web/public/**`; `server/tests/modules/{inventory,collaboration,materials-tools}/**`; `web/tests/unit/{serverStore,materials,tools}.test.ts`; `web/tests/team/{materials,tools,collaboration}.spec.ts`; `update09-25-26/handoff/D.md` |

Shared-but-safe: each feature folder's own `strings.ts` and `styles.css`.
If you believe you must edit a file outside your list, stop, write the
request in your handoff, and implement the rest.

### 2.8 Tests and handoff

- Server: copy the pattern in `server/tests/helpers/fixture.ts`
  (`createFixture`) and `server/tests/team-harness.ts`; F adds
  `server/tests/helpers/roles.ts` with `userOf(fixture,'manager'|'sales'|'worker')`.
  Put module tests under `server/tests/modules/<module>/`.
- Web unit: vitest in `web/tests/unit/` (see `myTasks.test.ts`,
  `serverStore.test.ts`) and pure helpers next to features.
- Playwright: team suite in `web/tests/team/` (see `work-tasks.spec.ts` for
  login and seeding); write specs, do not run them (Andres does).
- Every chunk must pass `pnpm build` and `pnpm lint` before committing.
- Handoff file `update09-25-26/handoff/<chunk>.md`: what was built (screen
  by screen), commands implemented, tests written, anything skipped and
  why, contract change requests (exact zod/SQL you need), strings left in
  English, and verification steps for Andres.

---

## 3. Foundation (F) — runs first, alone

Goal: land every shared change so A–D can start together. Nothing in F is
visible to users except the sign-in fix, the language toggle, the Add menu,
the removed Today page and empty "coming soon" screens.

### 3.1 Deliverables, in order
1. **Contracts** exactly as §2.4 (`permissions.ts`, `daily.ts`, `hours.ts`,
   `sales.ts`, `tools.ts`, edits to `index.ts`, `extra.ts`, `compatibility.ts`),
   with the pure helpers implemented and unit-tested in
   `packages/contracts` (vitest via the server workspace or a new
   `packages/contracts/test/*.test.ts` run by `pnpm --filter @pirata/contracts test`; add the script).
   `CONTRACT_VERSION='3.0.0'`.
2. **Migration 003** exactly as §2.3. Test: `server/tests/schema.test.ts`
   style test that opens a copy of a v2 database fixture (create one in the
   test from the 001+002 SQL plus a few rows: an `employee`, an `open`
   project, a done task, a daily goal, a checked shopping item) and asserts
   the mappings (`worker`, `scheduled`, `completed_at`, `day_assignments`
   row, `received_at`).
3. **Server core**: `Role` type in `context.ts`, `commands.ts`,
   `snapshot.ts`, `auth/sessions.ts`; capability check in the dispatcher
   (§2.5); repositories (§2.3); snapshot slices + filters (§2.2): expenses
   and `payRates` only with `money.costs`; `workShifts` filtered to own rows
   for workers; project price fields nulled and `salesNote` blanked without
   `money.sales`; `projectFacts` with `workerVisible=0` dropped without
   `facts.hidden`; `shoppingItems` are all included (the UI hides archived
   rows).
4. **Team admin** (`auth/team.ts`): `role` in create (default `worker`) and
   update; per-role caps from `ROLE_CAPS` on create, re-enable and role
   change; explicit column list in the INSERT; the primary owner row
   (`m.id===s.owner_id`) stays protected, other owners are editable;
   `Repositories.team()` returns `locale`. Update
   `server/tests/team.test.ts` (cap of 4 → caps per role).
5. **Sessions (R-X-3, server side)** in `auth/sessions.ts` + `app.ts`:
   `SESSION_TTL = 30 days`, `SESSION_REFRESH_AFTER = 1 hour`,
   `touchSession()` called from `GET /api/v1/session` (extends
   `expires_at` and re-sets the cookie when more than an hour old),
   `sameSite:'lax'` on set and clear (CSRF is already enforced by Origin +
   `X-CSRF-Token`), raise `login:global` to 100 per 15 min. Update
   `server/tests/api.test.ts` (SameSite assertion).
   Web side in `LiveApp.tsx`: in `reauth` state render `<SignIn/>` as an
   overlay above the workspace (keep `state.data`, hash and drafts) instead
   of the "sign in in another tab" text. (D does the reconnect-on-boot and
   `online`/`pageshow` refresh in `serverStore.ts`/`serverProvider.tsx`.)
6. **AI assistant** (`server/src/ai/index.ts`): `create_task` without a
   resolvable `projectId` → `ApiError(400,'CLARIFY','Choose the project for this task.')`;
   `create_project` → `CLARIFY` telling the user to create projects from the
   Projects screen (client required); say both in the `instructions` string.
7. **Module stubs**: `server/src/modules/{daily,hours,sales,materials-tools}/index.ts`
   exporting `handlers` with `notImplemented()` stubs for every command in
   §2.4 (and a `capability` export if the module type requires it); register
   in `modules/index.ts`. `server/src/routes/export.ts` exporting
   `registerExports(app, deps)` with a stub `GET /api/v1/export/shifts.csv`
   and `GET /api/v1/export/daily-report.csv` returning 501; call it from
   `app.ts` next to the existing `/export` route (`requireSession`, not
   owner).
8. **Web shell**: `web/src/state/permissions.ts` (`useCan`); replace all
   role comparisons (§2.1); `navigation.ts` (`readView(hash, role)`, view
   capability map instead of `ownerViews`, new view names, `today` and
   `shopping` redirects); `WorkspaceNavigation.tsx` menu groups with the new
   entries and i18n keys: Plan & work → Daily, Projects, Calendar, All tasks,
   Templates, Daily report; Hours → My hours / Team hours (`hours`), Pay
   rates (`pay`, owner); Your business → Clients, Materials requests, Tools,
   Inventory, Spending (owner); Files & team → Files, Team accounts (owner);
   Settings unchanged. Remove Team Progress and Today entries.
   `LiveApp.tsx`: mount `<WorkBar/>`, remove the Today view and its import,
   delete `web/src/features/today/`, the explicit Add menu (Task, Material
   request, Hours, Tool sign-out, Question, Expense [money.costs], Lead)
   opening dialogs through `dialogRegistry.ts`; page titles for the new
   views. Stub screens: `web/src/features/{work-bar/WorkBar.tsx, report,
   hours, pay, insights, materials, tools, templates, sales, facts, files}/index.tsx`
   each rendering an `EmptyState` "Coming in this update" plus a `strings.ts`
   with `{en:{},es:{}}`; stub dialogs `features/materials/RequestDialog.tsx`,
   `features/hours/ShiftDialog.tsx`, `features/tools/SignOutDialog.tsx`,
   `features/work/QuestionDialog.tsx`.
9. **i18n** (§2.6): provider in `main.tsx`, `useT`, shell strings in English
   and Spanish for the header, bottom bar, menu, sign-in overlay, Add menu.
   Language toggle in the Menu account card → `user.setLocale`. F implements
   `user.setLocale` fully inside `server/src/modules/materials-tools/index.ts`
   (the one non-stub handler in that file; D keeps it untouched).
10. **Shared components** (§2.6) with tiny unit tests.
11. `python3 scripts/contract-manifest.py --write`; `pnpm build && pnpm lint`;
    commit `F: foundation for update 2026-09-25`; write
    `update09-25-26/handoff/foundation.md` listing every exported name
    chunks may import (helpers, components, hooks, dialog kinds, view
    names, i18n usage) and every stub they must replace.

### 3.2 Acceptance
- App builds, lints, signs in as owner and as a worker (existing employee
  account now `worker`), every menu entry opens (stubs show EmptyState).
- Migration test passes on a v2 fixture; `pnpm --filter @pirata/server test` passes.
- Sessions survive a `GET /session` after 2 hours (test with fake clock).
- A worker cannot open Spending, Pay, Team accounts, settings; a manager can
  open Daily report but sees no money; `expense.create` as manager → 403.

---

## 4. Chunk A — Daily page and task tree

Requirements: R-DAILY-1..13, R-ROLE-4, R-TIME-6 (timer inputs), R-SALES-5
(paint notes on task; C's data, A's screen), R-X-1 for owned screens.
Owns: see §2.7. Depends only on F.

### 4.1 Server — `modules/tasks-time`, `modules/planning`, `modules/daily`

**Task tree (tasks-time)**
- Depth: in `taskRelationships()` (`tasks-time/index.ts:22-31`) replace the
  "one checklist level" rule with: parent may be depth 0 or 1
  (`taskDepth(parent) <= 1`); re-parenting a task that has descendants is
  allowed only if `taskDepth(newParent)+1+subtreeDepth(task) <= 2`, else
  `invalid('Tasks can only nest three levels deep.')`.
- `task.create`: `projectId` required (contracts); `description`; new tasks
  get `position = 1 + max(position of siblings)`; subtasks inherit project and
  assignee as today. Keep `createTaskWithSchedule`.
- `task.update`: `description`; done-task guard (below).
- `task.reorder`: all `orderedIds` must be siblings under
  (`projectId`, `parentTaskId`), not archived; write `position` 0..n-1;
  done-task guard does not apply to reordering.
- `task.setStatus` (`core/shared.ts:41 setTaskStatus` is frozen; wrap it in
  the tasks-time handler): before calling it, if the task (or any node the
  cascade will touch) is `done` and the new status is not `done`, require
  `can(ctx.role,'task.editDone')` OR (`completedBy===ctx.userId` and
  `serverNow-completedAt <= 10*60*1000`); after `setTaskStatus` returns,
  stamp `completedAt=serverNow, completedBy=ctx.userId` on every node that
  changed to `done` (the task, cascaded children, auto-completed parent) and
  clear both on every node that reopened. Cascade now goes through three
  levels: reuse `subtree()`.
- Done-task guard for `task.update`, `task.archive`, `task.reorder` of a
  done node: require `task.editDone`. Message: `'Only an owner can change a
  completed task.'`
- `task.archive` cascades through the subtree (today one level).
- Templates: `taskTemplate.saveTree`, `taskTemplate.applyTree` (depth check:
  tree depth + target depth ≤ 3), `projectTemplate.save`,
  `projectTemplate.apply` (creates the tree under the project; positions in
  tree order), `projectTemplate.fromProject` (serializes the project's
  non-archived tree to `tree`). Old `taskTemplate.save/apply` unchanged.
- Completion math: `packages/contracts/src/progress.ts` (frozen) counts one
  subtask level. Implement `treeCompletion(tasks, id)` (leaves of the whole
  subtree; a task with 2 subtasks of 3 tiny tasks each has 6 leaves) in
  `web/src/features/tasks-time/time.ts`, use it in your screens, and file a
  change request to fold it into `progress.ts` after integration.

**Day lists (daily)**
- `dayList.replace {date, scope, taskIds}`: scope `person` → requires
  `userId===ctx.userId` or `plan.others`; scope `project` (pool) → anyone.
  Replaces all rows for that (date, scope) that have `taskId` set (presence
  rows untouched); `projectId` = task's project; tasks must be non-archived;
  for a person scope, tasks that are unassigned or inherited get
  `assigneeId=userId` through the existing cascade (`task.update` semantics
  with `assignmentExplicit=1`); explicitly assigned to someone else → left
  as is (two people may share a task). Position = index.
- `dayList.take {id}`: pool row → `userId=ctx.userId`; assign the task to
  the taker if unassigned.
- `dayList.release {id}`: own personal row → `userId=null` (back to pool).
- `dayList.setPresence {date, projectId, userIds}`: replaces the rows with
  `taskId IS NULL` for that (date, project).
- `question.ask {taskId, body}` → row with `projectId` from the task;
  `question.answer {id, answer}` → office only (`can(role,'plan.others')`),
  sets `answeredAt/By`.
- `dailyGoal.replace` and `objectives.replaceForDate`: leave the handlers
  (AS-6) but nothing in the UI calls them.

### 4.2 Web — Daily page (`features/work/`, view `work`)

Layout (phone first): header row = date stepper (‹ yesterday | date | ›
tomorrow, tap opens `DateField`) + person/project switcher (office: any
person, "Project pools"; worker: self, and pools of projects where they have
a presence row or an item that day). Center = the ordered list, grouped by
project (project name header with facts link → `open({kind:'project'…})`
via `navigate`), one **DayCard** per row:
- title, short description (2 lines), assignee chip, status chip
  (open/blocked/done), "Take" button on pool rows, "Release" on own rows;
- children: the node's subtree rendered as indented checklists (subtasks →
  tiny tasks) with done toggles (`task.setStatus`); a parent toggle asks
  confirmation (existing pattern in `TaskChecklist.tsx`);
- expand → notes, pinned paint notes of the project (`projectNotes` where
  `pinned=1`, show product / color / colorCode / finish), `ThumbStrip` of the
  node's attachments (and subtree's), buttons: "Open task" (task sheet),
  "Ask a question" (`QuestionDialog`), "Start timer".
- A completion ring for the day (`dayCompletion`) at the top.
- Plan mode (office; workers only for themselves): "Plan this day" opens a
  full-screen editor: project picker → tree browser (top-level tasks with
  disclosure to subtasks/tiny tasks; picking a node picks its subtree) →
  chosen list with up/down and remove (drag on desktop is *implementer's
  choice*) → Save (`dayList.replace`). "Copy from…" copies another date's
  list. Presence editor: checkboxes of people per project for the date
  (`dayList.setPresence`).
- Empty day: "Nothing planned" + Plan button.
- Keep the existing `WorkView` sections that still make sense: projects
  strip, cleanup panel (D's component `CleanupPanel` keeps its export name;
  import it as today). Remove daily goals (max 3), Team tasks section
  (replaced by All tasks + Daily), Next steps.

**Task sheet (`live/dialogs.tsx`)**: show description, notes, three-level
subtasks with "Add subtask" / "Add tiny task", reorder (up/down), question
list for this task (with answers), `ThumbStrip`, paint notes, completed-by
line ("Done by Jose, Sep 25 4:12 pm"), and the owner-only unlock when done
(`useCan('task.editDone')`; completer gets "Undo" for 10 minutes).
`TaskEditor`: add Description (short) field; Project required (no
"Unfiled"); subtask/tiny-task creation from a parent; template apply.

**All tasks (`features/tasks-time/TaskList`)**: show the tree (indent by
depth), filters unchanged; time entry and timer correction inputs use
`TimeField`/`DateField` (R-TIME-6).

**Templates screen (`features/templates/`, view `templates`)**: list task
templates (tree preview) and project templates; create/edit a tree in a
simple nested editor (title + description per node, add child up to depth
3); "Apply to project…"; office only for saving (`template.manage`).

**WorkBar (`features/work-bar/WorkBar.tsx`)**: sticky bar per
`FUTURE-IMPLEMENTATIONS.md` §1 option (a): collapsed pill (task title +
live clock; or "No timer" + Start on the first open item of my day list);
expanded: session clock, my total on the task, team total, buttons Start /
Pause (banks time) / Complete / Switch. Uses `useServerNow`, existing
`timer.*` commands, the confirmation patterns from `TimerControls`.

**Strings**: `work.*`, `tasks.*`, `templates.*`, `workbar.*` in each
folder's `strings.ts`, English and Spanish; translate the existing
`work`, `tasks-time` and `dialogs.tsx` labels.

### 4.3 Tests
- Server: depth rule (3 ok, 4 rejected), reorder, completion stamps incl.
  cascade and auto-complete, undo window, owner-only edit of done, day list
  replace/take/release/presence permissions, question ask/answer,
  template tree apply depth.
- Web unit: `dayItems` ordering/grouping selectors, `treeCompletion`.
- Playwright spec (not run): manager plans tomorrow for a worker; worker
  sees it, checks a tiny task, asks a question.

### 4.4 Acceptance
- A worker opens Daily and sees today's ordered list with children toggles;
  a manager plans tomorrow for a person or a project pool; a worker takes a
  pool task; completions show who/when; a done task cannot be edited by a
  worker after 10 minutes; the WorkBar is visible on every page.

---

## 5. Chunk B — Hours, pay, reports, exports

Requirements: R-TIME-1..5, R-REPORT-1..3, R-TIME-6 for the calendar.
Owns: see §2.7. Depends only on F (reads A/C/D data through the snapshot;
sections simply show "none yet" while those chunks are unfinished).

### 5.1 Server — `modules/hours`, `routes/export.ts`
- `shift.submit`: own row, `status='submitted'`, `submittedBy=userId`,
  `minutes=shiftMinutes()` (validate ≥1); project must exist and not be
  `draft`.
- `shift.enter {userId,…}`: `shift.enterForOthers`; `status='approved'`,
  `approvedBy=userId`, `approvedAt=serverNow`.
- `shift.update`: approver (`shift.approve`) may edit any row (stays
  approved); the owner of a `submitted` row may edit it; anything else 403.
- `shift.approve`/`shift.reject {note}`: `shift.approve` cap; sets status,
  `approvedBy/At`, `decisionNote`.
- `shift.remove`: own `submitted` row or approver → hard delete.
- `payRate.set` (upsert on user+effectiveFrom), `payRate.remove`: dispatcher
  already requires `money.costs`.
- `dayNote.save`: own row upsert on (user, date).
- CSV routes in `routes/export.ts` (`requireSession`; Excel-compatible UTF-8
  with BOM, CRLF, `Content-Disposition: attachment`):
  `GET /api/v1/export/shifts.csv?from&to&userId?&projectId?` → columns date,
  person, project, kind, start, end, break, minutes, hours(decimal), status,
  note, and only with `money.costs`: rate kind, rate, cost. Workers get only
  their own rows. `GET /api/v1/export/daily-report.csv?date` → one row per
  report line (section, project, person, text, minutes, cents[owner]).

### 5.2 Web
**Hours (`features/hours/`, view `hours`)**
- Tabs: *My hours* (everyone) and *Team* (office). My hours: week strip
  (Mon–Sun, `weekBounds`) with total minutes; list of my shifts with status
  chips; "Add hours" → `ShiftDialog` (project select, date `DateField`, kind
  toggle Hours/Day; hours: in `TimeField`, out `TimeField`, break minutes;
  day: ¼ ½ ¾ 1 1½ 2 chips; note) → `shift.submit`; edit/delete while
  submitted.
- Team: attendance grid for a date (rows = active people, columns = projects
  with presence or shifts that day, cells = minutes; tap a cell → dialog to
  enter/approve) → `shift.enter`; pending approvals list with Approve /
  Reject (note) buttons; person × week and person × month summaries;
  "Export CSV" (link to the route with current filters).
- Pending shifts appear with an amber "Waiting for approval" chip;
  rejected show the note.

**Pay rates (`features/pay/`, view `pay`, owner)**: per person: current
rate (kind, amount, since), history, "New rate" (kind, amount `Money`
input in dollars → cents, effective from `DateField`) → `payRate.set`;
remove a future-dated rate. Labor cost this month per person.

**Daily report (`features/report/`, view `report`, optional `/YYYY-MM-DD`)**
- Header: date stepper, project filter, person filter, "Export CSV".
- Sections (each collapsible, with counts): Tasks completed (from `tasks`
  where `completedAt` is on that date, grouped by project, "by Jose 4:12
  pm"; cascaded children indented), Hours (approved and pending shifts per
  person per project, minutes; presence rows with no shift flagged
  "no hours submitted"), End-of-day notes (`dayNotes`), Questions
  (`taskQuestions` created that day, with answer state), Materials
  requested (`shoppingItems` created that day, received state), Tools
  (sign-outs and returns that day, broken reports), Money (owner only:
  expenses that date per project; labor cost of approved shifts that date
  per project), plus "My note for today" editor at the bottom for the
  signed-in user (`dayNote.save`, optional).
- "Today" in America/New_York; date math via `packages/domain/src/lib/dates`.

**Manager project view (`features/insights/`, view `insights/:projectId`)**
- Reached from the project page ("Insights" link that C adds) and the Menu.
- Header: label (`projectLabel`), client, dates, days active.
- Blocks: progress (done/total leaves), tasks missing (open/blocked list,
  grouped by parent), completed with who/when, questions (open first),
  materials requested (unreceived first), tools currently out on this
  project, hours per person (approved) and pending, timers total vs
  estimate (`actualMilliseconds` from `features/tasks-time/time.ts` — A
  owns that file but its export is stable), and **Money** (only with
  `money.costs`): sales price, materials price, labor price, expenses
  (`totalCents` from `features/spending/selectors.ts`), labor cost
  (`laborCostCents`), profit = sales − expenses − labor cost, and the same
  three prices without costs when only `money.sales`.
- Cross-project list at `insights` without id: one row per non-completed
  project with label, progress, hours this week, open questions.

**Calendar (`features/planning/`)**: replace the HH:MM text inputs in
`CalendarView.tsx` and `ScheduleTaskDialog` with `TimeField`; day list
items with no block still show in a "Planned (no time)" lane per person.
Remove `ObjectiveEditor` usage.

**Strings**: `hours.*`, `pay.*`, `report.*`, `insights.*`, `calendar.*`;
translate the existing planning screen.

### 5.3 Tests
- Server: shift permissions matrix (worker own submit/edit/delete, manager
  enter/approve/reject, worker editing approved → 403), minutes math,
  pay-rate upsert and owner-only, CSV route content and role filtering.
- Web unit: `weekBounds`, `laborCostCents` cases (hourly/daily × hours/day),
  report selectors by date.

### 5.4 Acceptance
- Worker submits 8:00–16:30 with 30 min break on a project; manager sees it
  pending, approves; owner sees labor cost on the project and in Insights;
  Daily report for that date lists it; CSV downloads open in Excel.

---

## 6. Chunk C — Sales capture, project lifecycle, facts, files, team roles UI

Requirements: R-SALES-1..7, R-ROLE-1 (UI), R-ROLE-5, R-DAILY-13 (project
side). Owns: see §2.7. Depends only on F. Task creation inside the capture
flow uses the frozen `task.create`/`task.archive` commands (A implements
depth rules; while A is unfinished the existing one-level handler already
accepts top-level tasks and subtasks, which is enough for capture).

### 6.1 Server — `modules/clients-projects`, `modules/sales`, `files`
- `project.create`: `clientId` required; `status='draft'`; `salesRepId=userId`;
  new fields stored; `clientName` denormalized as today.
- `project.update`: new fields; price fields only with `money.sales` (a
  worker sending prices → 403); once `completed`, only office may edit.
- `project.setStatus {id, status, note}`: allowed transitions from
  `PROJECT_TRANSITIONS`; `sold→scheduled` and `sold→draft` need
  `project.review` (`draft` requires a non-empty `note` stored in
  `reviewNote`); stamp `soldAt`, `scheduledAt`, `completedAt`; `completed`
  keeps the existing behaviour (nothing else changes).
- `projectFact.save/remove`: any role may add or edit a visible fact
  (open information is shared); only the office group may set
  `workerVisible=false`, edit or remove a hidden fact.
- `attachment.tag`/`attachment.comment`: any role; the attachment must not
  be removed.
- Files (`server/src/files/index.ts`): no route changes required. Optional
  *implementer's choice*: accept `?tag=` on upload to tag in one step.

### 6.2 Web
**Projects list (`features/clients-projects/`)**: tabs become Draft / Sold
(review) / Scheduled / Completed with counts, each card shows the derived
label chip (`projectLabel`), client, dates, and for office the sales price.

**Project page** (restructure `ProjectDetail`; keep section anchors Tasks ·
Notes · Files · Activity · Purchases and add Facts · Insights):
1. Header: name, label chip, client link, address (copyable), dates.
   Lifecycle buttons by state and role: draft → "Send to review"; sold →
   "Approve for scheduling" / "Send back" (note dialog) for `project.review`,
   else "Waiting for review"; scheduled → "Complete project"; completed →
   "Reopen".
2. **Job facts card** (`features/facts/FactsCard.tsx`): fixed rows in this
   order with `CopyField`: Client phone (from the client record, editable
   override as a fact), Address, Gate code, Job name at store, Client
   company, Company contact, then Paint (one row per pinned paint note:
   product · color · code · finish · "where it goes" = note title), then
   custom facts. "Edit facts" → list editor (label, value, hide-from-workers
   toggle, order). Workers never receive hidden facts (server filter).
3. Sales block (office): start/end dates, sales price, materials price,
   labor price, sales note; edit via `RecordForm`. Owner additionally sees
   "Open Insights" (B's view) — the link is always rendered; B's screen
   gates money.
4. Tasks: three-level list — top-level tasks with progress and assignee;
   tapping opens the task sheet (`open({kind:'task', id})`, A's sheet);
   "Add task" here and "Use a template" (`projectTemplate.apply`, A's
   command; the button lists `projectTemplates` from the snapshot).
5. Notes, Files (with tags/comments), Activity, Purchases (owner) as today.

**Fast capture (`features/sales/CaptureFlow.tsx`)**, reached from Projects →
"New project" and from the Add menu → Project:
- Step 1: client picker (search existing, or "New client" inline: name,
  phone) + project name → `client.create` if needed → `project.create`
  (draft). Optional: address, start/end dates, prices (office).
- Step 2 ("Walkthrough"): big "Take photo" (project attachment, camera
  capture) and a running task list: text box + Add → `task.create`
  immediately (so nothing is lost if the phone locks); each task row has
  camera (attachment on that task), "Add subtask", rename, delete
  (`task.archive`). Works one task per line, fast.
- Step 3: review list; "Save as draft" (stays `draft`) or "Send to review"
  (`project.setStatus sold`). Everything is saved continuously; the buttons
  only change status.

**Files (`features/files/` + `collaboration/files.tsx`)**: on each file
row: tag chips (add from a small set of suggestions: before, after,
reference, damage, receipt, label — free text allowed) → `attachment.tag`;
comment thread (`attachment.comment`) below the preview; filter by tag on
the Files page. Provide `TinyPhotos` wrapper if `ThumbStrip` needs project +
subtree logic (`hierarchy.ts` is D's — copy the small helper you need).

**Team accounts (`features/team/`)**: role select (owner, manager, sales,
worker) on create and edit; caps text "x of 10 workers, y of 5 managers…"
from `ROLE_CAPS`; language shown per member (read-only).

**Clients**: unchanged except phone/email rendered with `CopyField`, and a
"New project" button that opens the capture flow with the client preset.

**Strings**: `projects.*`, `sales.*`, `facts.*`, `files.*`, `team.*`,
`clients.*`; translate the existing clients-projects, files and team screens.

### 6.3 Tests
- Server: transitions matrix (worker cannot approve; manager can; note
  required on send-back), price fields 403 for workers, facts hidden from
  workers in the snapshot, tag uniqueness, comment on removed file → 400.
- Web unit: `projectLabel` cases; facts ordering.
- Playwright spec (not run): sales rep captures a deck project with two
  tasks and photos, sends to review; manager approves; worker sees the
  facts card without the hidden gate code.

### 6.4 Acceptance
- A sales rep creates a project with only client + name, adds tasks with
  photos in under a minute, sends to review; manager approves; the project
  shows `partial` once one top-level task is assigned; workers see facts
  except hidden ones and can copy the phone with one tap.

---

## 7. Chunk D — Materials, tools, cleaning, platform

Requirements: R-MAT-1, R-TOOL-1..3, R-X-2, R-X-3 (web side), R-X-4 (Quick
Add code), R-X-1 for owned screens. Owns: see §2.7. Depends only on F.

### 7.1 Server — `modules/materials-tools`, `modules/collaboration`, `modules/inventory`
- `materialRequest.create`: at least one of `projectId`, `taskId`,
  `forUserId`; if `taskId` is set, `projectId := task.projectId`; stores
  `createdBy=userId`; `checkedAt=null`.
- `materialRequest.update`: requester or office.
- `materialRequest.setReceived {received}`: sets/clears `receivedAt`,
  `receivedBy` and mirrors `checkedAt` (AS-5: requester or office).
- `materialRequest.remove`: requester or office → `archivedAt`.
- `shopping.add`/`shopping.check` keep working (AI) and mirror the fields.
- `tool.signOut`: equipment must be active; one open sign-out per tool
  (unique index → `conflict('This tool is already signed out.')`, the UI
  offers "Return and take"); `takenAt` defaults to `serverNow`; then run the
  cleanup-cycle logic below for the taker.
- `tool.return {id, returnedAt}`: taker or office; `returnedAt` default now.
- `equipment.setSignOutRequired`, `equipment.reportBroken` (sets
  `equipment.status='broken'`, logs the report), `equipment.resolveReport`
  (resolves and sets `status='ok'` when no open report remains).
- `equipment.use` (`collaboration/index.ts:58-70`): extract
  `openCleanupCycle(ctx, tool, taskId)`; per-user open cycle (index changed
  by F): a second user using the tool gets their own obligation;
  `dueAt = deadlineAt` when `maxCleaningDelayMinutes >= 1440`, else the
  existing `min(workdayEnd, deadline)`; `cleanup.complete` stamps
  `completedBy`. Default rule suggestion in the UI for sprayers: 30 min
  cleaning, 4320 min (3 days) delay.

### 7.2 Web
**Materials requests (`features/materials/`, view `materials`; replaces
`ShoppingView`)**: list with filters Open / Received / All and project /
person; each row: item, quantity, for (project / task / person chips),
requested by + date, "Received" toggle, edit, remove; "Request materials"
→ `RequestDialog` (item, quantity, notes, target: project select, task
picker within the project, or "for me / for person"). A project page
section "Materials requested" is rendered by C's page via the snapshot
(C reads `shoppingItems`; you export nothing to C).

**Tools (`features/tools/`, view `tools`)**: two tabs. *Sign-out board*:
tools with `requiresSignOut` — status line "In the shop" or "With Jose ·
Smith exterior · since Sep 24", buttons Take (→ `SignOutDialog`: project
optional, note) / Return / "Return and take"; broken tools flagged red
with the report; "Report broken" (text + optional photo picked from the
project's files or uploaded to the project) on every tool. *All tools*:
existing equipment list (owner/manager: "Needs sign-out" toggle →
`equipment.setSignOutRequired`). History per tool: sign-outs and cleanings.

**Cleanup panel (`collaboration/cleanup.tsx`)**: cards are per person;
show only the signed-in user's reminders by default with a "Everyone"
toggle for office; "Mark cleaned" stamps completedBy; snooze unchanged.

**Inventory (`features/inventory/`)**: equipment detail gets Sign-out
required toggle, current holder, broken state; Shopping list removed (link
to Materials requests).

**Platform**
- Session resilience (web): `serverStore.initialize()` on `NETWORK_ERROR`
  with no data stays `loading` with a "Reconnecting…" line and retries every
  5 s and on `online`; `serverProvider.tsx` also refreshes on `online` and
  `pageshow`; never render the sign-in form for a network failure.
- PWA: `web/public/manifest.webmanifest` (`name`, `short_name` "Pirata",
  `display: standalone`, `start_url: ./`, `theme_color #000000`,
  `background_color #000000`, icons 192/512 PNG generated from
  `favicon.svg`), `<link rel="manifest">`, `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `apple-touch-icon`, in `web/index.html`; `web/public/sw.js` caching only
  the built app shell (`index.html`, `/assets/*`), never `/api/*`, registered
  from `main.tsx` in production builds only; a small "Install this app"
  hint in the Menu (uses `beforeinstallprompt` when available, otherwise
  shows the iOS Share → Add to Home Screen instruction).
- Retire `features/quick-add/**` and the legacy demo dialogs in
  `features/dialogs/**` (both demo-only) only after a grep shows no import
  outside `web/src/data/demo.ts` and `App.tsx`'s demo branch; if the demo
  mode still needs them, leave them and note it in the handoff.
- Spanish: translate the existing inventory, spending, ask, updates,
  cleanup and sign-in screens.

### 7.3 Tests
- Server: request link rule (none → 400), task implies project, received
  by requester/office only, sign-out uniqueness, return by taker/office,
  broken → status and resolve → ok, per-user cleanup cycles, multi-day due.
- Web unit: `serverStore` reconnect behaviour; materials filters.
- Playwright spec (not run): worker requests 2 gal of primer for a task,
  manager marks received; worker takes a sprayer, sees the 3-day cleaning
  reminder, returns it.

### 7.4 Acceptance
- Materials requests replace the Shopping list with quantity and target;
  tools show who has them; taking a sprayer creates a personal cleaning
  reminder due in 3 days; the app installs to the home screen and, after
  the phone was locked for hours, opens on the same page without a sign-in.

---

## 8. Integration, QA, deploy (lead)

### 8.1 Baseline first
```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata'
git add -A && git commit -m "Baseline: live 2026-09-21 Work tab, subtask sheet, deploy docs"
git checkout -b update-2026-09-25/foundation
```
F works on that branch; when done: `git checkout main && git merge --no-ff update-2026-09-25/foundation`.

### 8.2 Worktrees for the parallel phase
```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata'
for c in A B C D; do git worktree add "../pirata-wt-$c" -b "update-2026-09-25/$c" main; done
# in each worktree: pnpm install --frozen-lockfile --prod=false  (pnpm store makes this fast)
```
Each implementer gets one worktree path and must not leave it. Playwright
and the dev server bind fixed ports; only one worktree runs them at a time
(Andres runs suites after merging anyway).

### 8.3 Merge and verify
Merge order A → C → B → D (any order works; conflicts are limited to
`strings.ts`/`styles.css` of shared folders, which should not exist). Then
`pnpm build && pnpm lint && pnpm test`, then the Playwright suites
(integration + team + the new specs), `python3 scripts/contract-manifest.py --write`.
Spanish sweep: grep for literal English labels outside `t()` in `web/src`
and translate leftovers. Update `README.md` (roles, Daily, Hours, Materials,
Tools sections), `web/WORK-TASKS.md` successor `update09-25-26/handoff/RELEASE.md`.

### 8.4 Deploy
Full deploy (migration + API + web) per `web/deploy/TEAM-RECOVERY.md`
("Build and preflight", "Paired migration cutover", "Database and file
backups", "Post-deployment verification"): backup first (`backup.py` /
CLI `backup`), publish backend + web with `deploy.sh`/`release.py`,
restart `pirata-api.service` (it migrates on start), run
`verify-live-team.mjs`, update `web/deploy/deployed-release.json`. Tell
every user to sign in once (sessions from before the update keep working
but roles changed name). Check on a real iPhone: install to home screen,
lock 2 hours, reopen.

---

## 9. Open questions for Andres (answer any time; defaults in §1)
1. AS-1 undo window 10 minutes: keep, change, or remove?
2. AS-2/AS-3 money tiers for managers and sales: as specified?
3. AS-8 daily-rate ↔ hours conversion at 8 h/day: correct for your crews?
4. Should a worker be able to mark a request received (AS-5)?
5. Should "Send back to draft" notify the sales rep (no notifications in
   this update; it appears in their Projects list under Draft with the note)?

---

## Appendix A — command → capability → chunk

| Command | Capability (dispatcher) | In-handler rule | Chunk |
|---|---|---|---|
| task.create / update / archive / setStatus / batchCreate / templates | — | done-task guard (`task.editDone` or 10-min undo); depth ≤ 3 | A |
| task.reorder | — | siblings only | A |
| dayList.replace / take / release | — | own list or `plan.others`; pool open to all | A |
| dayList.setPresence | plan.others | — | A |
| question.ask / question.answer | — | answer: office | A |
| taskTemplate.saveTree / projectTemplate.save / fromProject | template.manage | — | A |
| taskTemplate.applyTree / projectTemplate.apply | — | depth | A |
| shift.submit / update / remove | — | own submitted, or approver | B |
| shift.enter | shift.enterForOthers | — | B |
| shift.approve / reject | shift.approve | — | B |
| payRate.set / remove | money.costs | — | B |
| dayNote.save | — | own | B |
| project.create / update | — | prices need money.sales; clientId required on create | C |
| project.setStatus | — | transitions; review needs project.review | C |
| projectFact.save / remove | — | hidden facts: office | C |
| attachment.tag / comment | — | file not removed | C |
| materialRequest.* / shopping.* | — | ≥1 link; received/remove by requester or office | D |
| tool.signOut / return | — | one open per tool; return by taker or office | D |
| equipment.setSignOutRequired / resolveReport | equipment.admin | — | D |
| equipment.reportBroken / use, cleanup.* | — | per-user cycles | D |
| user.setLocale | — | own | F (D keeps) |
| expense.* | money.costs | — | existing |
| settings.update | settings.admin | — | existing |

## Appendix B — screens after the update

Bottom bar: Daily (`work`) · Ask · Updates · Menu. Menu: Daily, Projects,
Calendar, All tasks, Templates, Daily report, Hours, Pay rates (owner),
Clients, Materials requests, Tools, Inventory, Spending (owner), Files,
Team accounts (owner), Ask settings (owner), Workday settings (owner).
Dialogs from the Add button: Task, Material request, Hours, Tool sign-out,
Question, Expense (owner), Lead, Project (capture flow).

## Appendix C — i18n namespaces
`shell.*` (F), `work.*` `tasks.*` `templates.*` `workbar.*` (A), `hours.*`
`pay.*` `report.*` `insights.*` `calendar.*` (B), `projects.*` `sales.*`
`facts.*` `files.*` `team.*` `clients.*` (C), `materials.*` `tools.*`
`inventory.*` `spending.*` `ask.*` `updates.*` `cleanup.*` `signin.*` (D).
