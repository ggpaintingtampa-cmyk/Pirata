# Morgan el Pirata

Private painting-business workspace at **https://pirata.andresinbox.tech**.
Canonical source: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.

The current team version extends the existing application. Historical
`HOME-SCREEN-SPEC.md` and implementation packets describe earlier versions; the
September 18 team requirements supersede their home-screen/owner-only boundaries.

## September 25 team update

Four roles now share the business: owner, manager, sales and worker (2/5/5/10
active accounts). Everyone sees the same work; money stays with the office roles
and pay rates with the owner. **Daily** replaces Work and Today: the night before,
a manager or the owner plans each person's ordered list for a date; workers open
the same list, expand tasks into subtasks and tiny steps, tick what is done (with
who and when, and a ten-minute undo), and ask a question on any step. Hours are
entered as in/out times or days worked, approved by a manager, and priced with
per-person pay rates; the Daily report, Hours and Project insights pages and CSV
exports use them. Sales reps capture a job on site (client, address, photos,
price, notes) and the office reviews it before it is scheduled. Projects carry a
facts card (gate code, paint, store job name and more), templates seed nested task
trees, materials requests replace Shopping, tools are signed out and returned
with per-person sprayer cleaning cycles and broken reports, files take tags and
comments, the app installs to the phone home screen, sessions slide for 30 days,
and every screen is available in Spanish from the account menu.

Every record a person creates has a **Delete** control (tasks, projects, clients,
leads, purchases, material requests, tool sign-outs, questions, hours entries,
templates, equipment, materials, maintenance, broken reports and notes). Deleting
moves the record to **Menu → Deleted items**, where the owner or a manager can
restore it; a project takes its tasks, questions, requests and notes with it and
brings them back together. Owner and manager can delete anything they see; a
sales rep their own draft projects; everyone the unprocessed items they created.
Nothing is destroyed (schema version 4 adds only nullable columns).

The build spec and per-chunk handoffs live in [update09-25-26](update09-25-26/SKILL.md).
Schema version 3 (`003-update-2026-09-25.sql`) adds tables and columns only and
never rewrites historical values: the legacy role `employee` and project status
`open` stay stored as they are and are read as `worker` and `scheduled`.

## September 21 Work update

Work now offers all assignments or Today, active/completed/all statuses, search
and project filters. The owner gets person groups, unassigned work and a safe
assignment picker. Employees get their own complete task history. Subtasks have
their own details, bottom Edit action and parent navigation.
See [Work update and verification](web/WORK-TASKS.md).

## September 19 Figma update

The revised [Figma designs](https://figma.com/design/uf6F2FArS37ia2QSMtSbNT)
are implemented in the existing app: charcoal surfaces, amber actions, daily
completion rings, clearer project cards, task sheets, updates filters and a
shared Files page. The floating **Add task** button opens quick task capture;
**Back to Add menu** reveals the other record types. All existing operations,
role permissions and private storage are retained.

See [Figma implementation and browser evidence](web/FIGMA-IMPLEMENTATION.md).

## September 18 design update

The black/grey/white workspace now has direct phone shortcuts for Projects,
Calendar and Tasks, a searchable grouped Menu, and a persistent desktop sidebar.
Pages retain their location on refresh and support browser Back/Forward. Project
section links jump directly to tasks, notes, files, activity and purchases.
Task search combines status, person and project filters. Title-only capture keeps
optional fields under More task details; all existing business operations remain.

See [redesign guide and screenshots](web/REDESIGN.md) and [visual QA](design-qa.md).

## Application

- **Daily** opens on the signed-in person's ordered list for the day: the
  three-level task tree, completion with undo, questions, the current timer,
  project shortcuts and cleanup reminders. Office roles pick whose list to plan.
- **Ask** provides allowlisted business assistance, with owner-managed model,
  request and spending allowances. Live calls stay disabled until configured.
- **Updates** shows team activity, human messages and project files.
- **Menu** includes Projects, Calendar, All tasks, Templates, Daily report,
  Project insights, Hours, Pay rates, Clients, Materials requests, Tools,
  Inventory, Files and role-appropriate settings. Spending, pay rates, account
  and API controls belong to the owner; approvals to managers and the owner.

A title alone saves an unfiled task. Add one level of subtasks, assign a responsible
person, paste several lines, save another, or reuse a list template. Up to three
explicit daily goals carry equal weight; a goal's subtasks divide its share
equally. Project completion uses top-level tasks without double counting.

Files attach directly to a task, project or client and appear through the hierarchy
without binary duplication. Photos (including converted HEIC) and PDFs are private
server files, with recoverable removal. Paint notes optionally keep product,
color/code, finish, quantity, store and a label attachment. Adding/checking shopping
items does not create spending or stock changes.

Equipment rules configure cleaning minutes and a maximum delay. Use creates one
open cleanup obligation with a fixed latest deadline. Snoozes are attributed and
cannot move that deadline; cleaning ends the cycle. Estimates never create time
entries.

## Structure and development

`web/`: React 19, TypeScript, Vite frontend. `server/`: authenticated Fastify API,
SQLite persistence, bounded file processing, business commands. `packages/domain/`:
original domain utilities and demo compatibility. `packages/contracts/`: shared
validated commands, DTOs and progress calculations. One pnpm workspace/lockfile.

Use the bundled Node 24 runtime:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
pnpm install --frozen-lockfile --prod=false
pnpm build
pnpm lint
pnpm test
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/integration/playwright.config.ts
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/team/playwright.config.ts
```

The old browser-local demo stays isolated at `/?demo=1`; live data never falls back
to localStorage. No production business records are seeded or reset.

## Accounts

Sign in with username **andre** and the existing Pirata application password.
The owner's display name is **Andres**. The username changed from `owner` on
September 18 without changing account IDs, passwords or business records. If the
sign-in form or password manager still fills `owner`, replace it with `andre`.
The old browser Basic Auth prompt is replaced by application authentication after
the team deployment. In **Menu → Team accounts**, create a person's name, username,
role (owner, manager, sales or worker) and unique password of at least 15
characters. Share credentials privately. Up to 2 owners, 5 managers, 5 sales reps
and 10 workers may be enabled. The same screen changes roles, resets passwords or
disables access; sessions are revoked and active work is saved/stopped on disable.
Each person picks English or Spanish from the account menu. Owner recovery uses
the existing concealed-input server CLI.

Everyone shares the existing business; accounts do not create new businesses.
Server checks protect finances, account administration, exports/imports and AI
settings. Business snapshots filter owner-only spending. Private files require
an active team session.

## Configure Ask securely

The app uses the official OpenAI Responses API with a configurable provider model;
it does not assume the coding model is the application model. Official reference:
https://developers.openai.com/api/docs/guides/function-calling

From a private administrator terminal, run:

```bash
sudo python3 '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/scripts/configure-ai-key.py'
```

The script reads the API key twice without echo, writes only
`/etc/pirata/openai.key` (0600, readable by `pirata`) and sets the service's
`PIRATA_OPENAI_API_KEY_FILE`. It deliberately permits outbound networking for
**only** `pirata-api.service` and restarts it. It changes no firewall or unrelated
service. The fixed provider endpoint is `https://api.openai.com/v1/responses`.
Never put the key in chat, source, frontend variables or command arguments.

Then open **Menu → Ask settings & usage**. Enter the chosen API model ID, current
input/output prices in US cents per million tokens, a daily request limit and
monthly budget in US cents. Enable requests only after all are configured.
Limits are team-wide in UTC; requests reserve a conservative maximum before calling
the provider. Uncertain/failed provider calls retain their reservation. Usage
shows token counts and calculated charges based on the configured rates; provider
billing is authoritative. Set provider-side project limits as an additional cap.

Ask can create a task immediately with Undo, search matching business records,
or prepare supported changes for review. It has no shell, SQL, hosting or arbitrary
file access. Uploaded images/PDFs are never automatically sent. Record names and
text are treated as untrusted data. The key is excluded from business exports and
uploaded-file backups; retain it in your own secret manager for disaster recovery.

## Deployment and recovery

Read [team deployment and recovery](web/deploy/TEAM-RECOVERY.md) before deploying or
restoring. It covers migration checksums, production-copy verification, coordinated
web/API/database cutover, uploaded-file backup manifests, scratch restore and
rollback limitations after new writes. Older applied migrations are immutable.
The latest verified live pair is recorded in
[deployed-release.json](web/deploy/deployed-release.json).

Screenshots and verification notes live in `web/artifacts/`.
Physical iPhone/Safari verification is reported separately from desktop Chromium
and Playwright WebKit; responsive emulation alone is not a device test.
