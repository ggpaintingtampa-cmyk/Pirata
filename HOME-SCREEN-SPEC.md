# Morgan el Pirata — home screen implementation specification

**Version:** 1.0  
**Prepared:** 2026-09-16  
**Deliverable:** A working, responsive prototype of the Today screen with sample data.  
**Status:** Ready for a coding handoff; application code has not been created by this specification.

## 1. What to build

Build a small web application for the owner of a painting business to try on a phone. Its home screen must answer four questions:

1. What should I finish today?
2. What am I working on now, and how long is it taking?
3. What is scheduled next?
4. What needs attention, and how much have I spent today?

The owner has confirmed painting and related work, owner-operated data entry, and phone use at jobs. The broader eight business requirements live in `README.md` next to this file. This specification chooses the implementation details for the first prototype. Treat it as a bounded first milestone, not an instruction to implement the entire future business system.

### Included in this milestone

- A polished Today screen, responsive application shell, and working navigation.
- Up to three daily objectives with editable status and notes.
- A current task selector, estimate, start/pause timer, and task completion.
- A daily timeline with simple task scheduling and conflict warnings.
- Attention items derived from sample material shortages, maintenance, and follow-ups.
- Daily expense total and a short list of recent expenses.
- Quick Add forms for task, expense, manual time, material quantity adjustment, and lead.
- Small supporting views that make navigation and saved changes inspectable: project list/detail, inventory, clients, and More.
- Sample records and browser-local persistence so refreshing preserves demo changes.
- Meaningful unit tests, browser tests, and screenshots of the completed screen.

### Deferred to later milestones

Backend/API, database, user accounts, crew access, cross-device synchronization, production hosting, real client imports, receipts/photos, OCR, estimates/invoices, payments, profitability, automatic purchasing, AI/LLM calls, push notifications, full lead pipeline, tool checkout workflows, recurring maintenance generation, calendar synchronization, offline installation, and service workers.

The supporting views are intentionally small. Do not expand them into full inventory, CRM, or project-management products. Do not create controls that pretend these deferred capabilities work.

## 2. Save locations and workspace rules

The project already exists here:

```text
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/
```

Before coding, read:

```text
/home/andre/Desktop/LargeConcierge/AGENTS.md
/home/andre/Desktop/LargeConcierge/README.md
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/README.md
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/HOME-SCREEN-SPEC.md
```

Save all application source under:

```text
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/
```

Preserve the planning README and this specification. Keep runtime dependencies, generated files, tests, and application documentation inside `web/`. Do not scaffold into the parent directory or overwrite the planning README. Reinspect `web/` before scaffolding; if another agent has already created code, adapt it rather than replacing it.

The original conversation's working directory is `/home/andre/Desktop/Morgan The Undead`; that is not the application source directory. If the coding session cannot write to the target, request the specific access or use a user-selected workspace at the target. Do not relocate the app as a workaround.

Existing LilPace and ScatterBrain files, calendar records, services, and credentials stay in place. This prototype uses fabricated data and performs no operations on those apps. Do not initialize a remote repository, push code, or create a deployment as part of this milestone.

## 3. Technical choices and setup

Use these choices for this prototype:

| Concern | Choice |
| --- | --- |
| UI | React with TypeScript in strict mode |
| Build/dev server | Vite, React TypeScript template |
| Package manager | pnpm; retain `pnpm-lock.yaml` |
| Routing | `react-router`, declarative `HashRouter` |
| Styling | Plain CSS with shared CSS custom properties |
| Icons | `lucide-react`, accompanied by text labels |
| State | One React context backed by an in-memory store and pure transition function |
| Runtime validation | Zod schemas at storage and form boundaries |
| Persistence | One versioned localStorage document behind a repository interface |
| Dates | ISO date strings, epoch milliseconds, and `Intl` formatting |
| Money | Integer USD cents |
| Tests | Vitest for behavior; Playwright for browser workflows |

React documents Vite as an option for a client application, and Vite provides a `react-ts` template. This prototype does not need server rendering. Use the current compatible stable packages at initial scaffolding and retain the resolved lockfile; later runs use the lockfile. [React setup](https://react.dev/learn/build-a-react-app-from-scratch), [Vite setup](https://vite.dev/guide/).

Use `react-router` imports, including `HashRouter`, `Routes`, `Route`, `Navigate`, `NavLink`, `Link`, and `useParams`. Hash-based URLs let the built app navigate without configuring server-side route rewriting. [Router installation](https://reactrouter.com/start/declarative/installation), [HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter).

### Runtime found on this machine

On 2026-09-16, the regular shell did not have `node` or `npm` on PATH. A bundled Node **24.19.0** and pnpm **11.19.0** were verified at the paths below. Use them when they remain available. Do not install Node globally or modify the system merely to start this prototype.

Run the following in one shell session when implementing; these are instructions, not commands already executed for this handoff:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
node --version
pnpm --version
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata'
pnpm dlx create-vite@latest web --template react-ts --no-interactive
cd web
pnpm install
pnpm add --save-exact react-router lucide-react zod
pnpm add -D --save-exact vitest @playwright/test
```

The scaffold supplies React, TypeScript, Vite, the React plugin, and lint tooling. Do not add another package manager lockfile. If network or filesystem restrictions block dependency installation, request the scoped access through the normal approval mechanism.

The verified Node runtime meets the currently documented Vite and Vitest requirements. Recheck requirements if an implementation occurs with a newer scaffold. [Vite requirements](https://vite.dev/guide/), [Vitest requirements](https://vitest.dev/guide/).

### Required package scripts

Retain the scaffold's package metadata and dependencies. Set `private` to true, package name to `morgan-el-pirata-web`, and include these scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

Use the current template's recommended lint configuration and TypeScript configuration. Do not disable strictness, replace errors with `any`, or silence hooks warnings to make checks pass.

### Required Vite configuration

Save this as `web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
```

Keep the server on loopback for development. A fixed port preserves the localStorage origin and exposes port conflicts instead of silently choosing another port. [Vite server configuration](https://vite.dev/config/server-options.html).

## 4. Required file structure and responsibilities

Use this structure. Small internal helper components may remain in their feature file; do not create a generic framework for this prototype.

```text
Morgan el Pirata/
  README.md                         existing requirements; preserve
  HOME-SCREEN-SPEC.md                this handoff
  web/
    README.md                       setup, scope, commands, persistence, preview
    package.json
    pnpm-lock.yaml
    index.html
    vite.config.ts
    vitest.config.ts
    playwright.config.ts
    eslint.config.js
    tsconfig*.json                  retain scaffold configuration
    .gitignore
    public/
      favicon.svg                   simple original mark
    src/
      main.tsx                      mount React, import CSS, install router/provider
      App.tsx                       route definitions and application shell
      styles/
        tokens.css                  colors, spacing, type, radii
        global.css                  reset, page layout, shared controls, focus
        app.css                     shell, Today sections, forms, responsive rules
      domain/
        types.ts                    contracts from section 7
        schema.ts                   Zod shapes and relationship validation
        commands.ts                 pure command-to-next-state transitions
        selectors.ts                derived totals, attention, timeline, task time
      data/
        demo.ts                     deterministic sample-state factory
        repository.ts               persistence interface
        localStorageRepository.ts   load, validate, save, targeted reset
      state/
        createAppStore.ts           serial command execution and subscriptions
        AppProvider.tsx             context, repository initialization, useApp hook
      lib/
        dates.ts                    business date and display formatting
        money.ts                    decimal input to cents and currency formatting
        time.ts                     interval and duration calculations
        ids.ts                      generated client-side IDs
      components/
        AppShell.tsx                header, navigation, Add button, outlet
        Modal.tsx                   native dialog wrapper, focus and close handling
        EmptyState.tsx              reusable short empty-state message/action
        StatusBadge.tsx             text + color status
        StorageNotice.tsx           loading/save problems
        ErrorBoundary.tsx           render failures with reload action
      features/
        today/
          TodayPage.tsx
          ObjectivesCard.tsx
          CurrentTaskCard.tsx
          ScheduleCard.tsx
          AttentionCard.tsx
          SpendingCard.tsx
          ObjectiveDialog.tsx
          TaskDialog.tsx
          ScheduleTaskDialog.tsx
        quick-add/
          QuickAddDialog.tsx
          ExpenseForm.tsx
          TaskForm.tsx
          TimeEntryForm.tsx
          MaterialAdjustmentForm.tsx
          LeadForm.tsx
        projects/
          ProjectsPage.tsx
          ProjectPage.tsx
        inventory/
          InventoryPage.tsx
        clients/
          ClientsPage.tsx
        more/
          MorePage.tsx
    tests/
      unit/
        commands.test.ts
        selectors.test.ts
        persistence.test.ts
        money-and-dates.test.ts
      e2e/
        today.spec.ts
        navigation.spec.ts
        persistence.spec.ts
    artifacts/
      screenshots/
```

Add `node_modules/`, `dist/`, `.vite/`, `.vitest/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo`, and local environment files to `.gitignore`. Keep source, configuration, the lockfile, and application documentation as durable project files. Screenshots go under the application artifact directory, not elsewhere in the user's projects.

### Routes

| URL fragment | Component | Required behavior |
| --- | --- | --- |
| `#/today` | TodayPage | Main interactive home screen |
| `#/projects` | ProjectsPage | Sample projects with open task counts, time, and spending |
| `#/projects/:projectId` | ProjectPage | Client name, tasks, expenses, and time entries for one project |
| `#/inventory` | InventoryPage | Tools and materials; maintenance and quantity actions described below |
| `#/clients` | ClientsPage | Sample client/lead list and follow-up controls |
| `#/more` | MorePage | Project totals, storage explanation, and reset demo action |

Redirect `/` to `/today`. Render an unknown route or unknown project as a friendly not-found view with a working Today link. Use active navigation styling and `aria-current`. Preserve browser back/forward behavior.

## 5. Visual design and home screen

Use a clean, practical appearance suited to outdoor phone use: light background, dark navy text, dark teal action buttons, clearly labeled amber warnings, readable contrast, and limited decoration. The name can suggest a nautical identity; do not add a pirate illustration or a large marketing banner.

Initial CSS tokens in `tokens.css`:

```css
:root {
  --color-bg: #f4f6f7;
  --color-surface: #ffffff;
  --color-text: #14263d;
  --color-muted: #526173;
  --color-border: #c8d1d9;
  --color-primary: #0f675d;
  --color-on-primary: #ffffff;
  --color-warning-bg: #fff4d6;
  --color-warning-text: #774b00;
  --color-danger: #a82424;
  --radius-card: 16px;
  --radius-control: 10px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color-scheme: light;
}
```

Use 16px body text and form inputs, 14px secondary text, 20px section headings, and 28px page heading. Buttons and tappable rows need at least 44px effective height. Show visible focus indicators; distinguish state by words as well as color. Use locally bundled icons and system fonts so no external font service is needed.

### Mobile order

```text
Morgan el Pirata                         Demo
Today                      Wednesday, September 16

Today's objectives                        0 of 3
  Finish preparing the north wall        [status]
  Apply the first coat                   [status]
  Send the estimate                      [status]

Current task
  Smith exterior painting
  Prepare north wall
  Estimated 2h       Logged 45m
  [ Start timer ]    [ Finish task ]

Today's schedule
  08:00  Pick up supplies
  09:00  Prepare north wall
  ...

Needs attention
  Need 3 gal of exterior white            [View]
  Clean the sprayer                       [View]
  Follow up with Taylor                   [View]

Spent today                              $84.60
  Supplies — $62.40
  Fuel — $22.20

                                   [ + Add ]
Today   Projects   Inventory   Clients   More
```

The date in the wireframe is an example. Render the real current date in `America/New_York`. Seed records relative to that date on first use, as described later.

At widths below 900px, use a single column, 16px horizontal page padding, and fixed bottom navigation with five equal targets. Keep the Add button above it and reserve sufficient bottom padding so neither covers content. Account for `env(safe-area-inset-bottom)`.

At widths of 900px and above, use a 220px navigation sidebar and a content area capped at 1120px. At 1100px and above, objectives/current task/schedule occupy the larger left column; attention/spending occupy the right. Preserve logical reading order. Avoid horizontal scrolling at 320px and larger.

The header includes a compact **Demo** label. More explains: “Sample data. Changes are saved in this browser only.” Do not fill the main screen with implementation details.

Use an accessible native `<dialog>` through `showModal()` for editing and quick entry. On phones it can look like a bottom sheet; on desktop it is centered. Give each dialog a visible heading, labels, Cancel/Save actions, sensible initial focus, Escape handling, and focus restoration to its opener. A dirty form asks before discarding. Do not nest dialogs. [Native dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## 6. Exact interactions

### Objectives

- Show objectives whose date equals the current business date, ordered by rank.
- Limit each date to three objectives, including completed ones.
- Provide Edit objectives, which can add, edit, remove, and reorder those three entries with Up/Down buttons.
- Each objective has title, optional project/task link, status, and optional note. Statuses: open, partial, blocked, done.
- Require a note when selecting blocked; keep notes available when reopening.
- Changing an objective does not silently complete its linked task, and finishing a task does not silently complete an objective.
- A completion counter is derived from actual objective state. With no objectives, show “Choose up to three outcomes for today.”

### Current task and timer

- If a timer is running, show that task. Otherwise default to the earliest open task scheduled today, then the first open task by creation time. Blocked tasks remain available for inspection in their projects but are not chosen automatically for work.
- Provide a task selector so the owner can choose another open task. Completed tasks remain visible in project history.
- Show task title, project, total estimated time, total logged time, and current session elapsed time while running.
- Start persists a single running timer. Pause saves that elapsed session as a completed time entry and clears the running timer.
- Resume creates a new session; total logged time sums sessions. Do not count paused time.
- Starting a different task while one is running offers “Pause current and start this task.” A single atomic transition closes the old interval and opens the new one at the same timestamp.
- Finish task closes a running session for that task, if any, and marks it done. Reopen is available in TaskDialog; it preserves prior time entries.
- Blocked tasks cannot start until explicitly changed to open. Completing or blocking a task must never leave its timer running.
- A display refresh every second updates the clock only. Persist on actions, not each second.
- Refreshing or reopening the app reconstructs elapsed time from stored timestamps. The timer continues until paused even while the page is closed; explain this beside the active session and permit correction of completed entries in the project view.
- If there are no open tasks, show “No task selected” and an Add task action. Never invent an active job.

### Schedule

- Show schedule blocks for the business date in start-time order. Times are local wall-clock minutes in `America/New_York`.
- Task rows open TaskDialog. Other blocks are informational sample commitments such as travel, lunch, and supply collection.
- Add task accepts an optional date and start time; when supplied, create one linked schedule block whose length is the estimate. A task may have at most one scheduled block in this prototype.
- TaskDialog includes Schedule/Edit schedule and Remove from schedule. Scheduling does not start a timer; completing work does not rewrite the original planned block.
- Edit schedule accepts date, start, and end. End must be after start within the same local day. Reject overnight blocks in this prototype with a clear field message.
- Show overlapping blocks with a text warning; never silently shift another block. Unscheduled tasks remain visible in their projects and can be selected in Current task.
- Changing the task estimate later does not silently resize an existing block; Edit schedule makes that change explicitly.
- No calendar writes, drag-and-drop scheduling, or automatic rescheduling in this milestone.

### Needs attention

Generate this list from source records; do not maintain a second list of alert objects in saved state.

- Material shortage: remaining project requirements for open projects minus stock and existing reservations, using the allocation rules in section 9.
- Maintenance: incomplete maintenance items whose due date is today or earlier. View opens Inventory with the item expanded; Mark complete removes the due warning and records completion time. No recurrence is generated yet.
- Follow-up: non-lost clients/leads with a next follow-up date today or earlier. View opens Clients with the contact expanded; Mark followed up opens a small form with a required note and optional next follow-up date. Blank next date clears the due reminder.
- Order overdue items first by due date, then today's maintenance, material shortages, and follow-ups. Give each item a stable source-derived ID.
- Use query parameters such as `#/inventory?material=m-white&project=p-smith`, `#/inventory?maintenance=maint-sprayer`, and `#/clients?client=c-taylor` to expand the relevant record. Unknown IDs show a short not-found message without crashing.
- When nothing needs attention, show “Nothing needs attention today.” Do not render fake counts.

### Spending

- Spent today equals the sum of expense cents whose purchase date equals the current business date.
- Show the three most recently entered expenses for that date, each with description, amount, and project or General business.
- Tapping a row opens the same expense form in edit mode. More provides the full expense list with the same edit action.
- Project totals include only that project's assigned expenses. General business expenses appear separately and still count toward daily total.
- Do not label spending as profit, outstanding balance, or inventory value.

### Quick Add forms

The Add button opens a five-choice menu. Selecting a choice replaces the dialog content with that form; Cancel returns to the menu or closes it without saving. A successful save closes the dialog and announces a concise result through a polite live region.

| Form | Required fields and defaults | Result |
| --- | --- | --- |
| Task | Title; project or General business; estimated minutes; optional schedule date and start time | Add an open task, optionally add its scheduled block, and allow immediate selection in Current task |
| Expense | Description; amount; purchase date defaulting to today; category; project or General business | Update daily/project expense views; editing replaces the existing record by ID |
| Time entry | Task; work date defaulting to today; duration in minutes; optional note | Add a manual duration to that task, distinct from timer sessions |
| Material adjustment | Material; signed quantity adjustment; reason: restock, usage, or correction; optional explanatory note | Adjust stock and rederive shortages; this action records quantities only and does not create an expense |
| Lead | Name; optional phone/email; work description; optional next follow-up date | Create a contact in New inquiry stage and update Clients/attention |

Validation: trim text; title/description 1–160 characters; names 1–100; notes up to 1000; estimated/manual minutes whole numbers 1–1440; money positive with at most two decimal places and no scientific notation; material quantities use at most two decimals, with pieces requiring whole units. Dates must be real calendar dates. Lead email is validated only when entered; phone accepts human formatting. Show errors beside fields, retain input, and focus the first invalid field.

Task scheduling requires both date and start or neither. A blocked or done task cannot be started accidentally. A quantity adjustment cannot make physical stock negative or lower than stock already reserved for projects; report the reservation conflict. Usage/reallocation workflows are a later milestone.

Disable Save while processing and make ID-based commands idempotent, so double taps do not duplicate expenses, time entries, or adjustments. Do not use receipt upload buttons or other inactive affordances for deferred features.

### Supporting pages

- Projects: two sample projects, status, open task count, logged time, and spending. Project detail shows related tasks, expenses, and time entries with relevant view/edit actions; full project creation/editing is deferred.
- Inventory: sample tools and their locations/condition, material stock and reservations, and maintenance items. It supports the material adjustment and maintenance completion actions only.
- Clients: sample contacts, stage text, notes, and follow-up dates. Add lead and Mark followed up work; pipeline drag-and-drop and conversion to a project are deferred.
- More: all expenses, time/spending totals by project, a short browser-storage explanation, and Reset demo data. Reset explicitly confirms that this browser's prototype records will be replaced; it never clears unrelated localStorage keys.

## 7. TypeScript data contracts

Create these contracts in `src/domain/types.ts`. The storage schema in `schema.ts` must validate the same shapes and relationships; a TypeScript assertion after JSON parsing is not validation.

```ts
export type Id = string;
export type LocalDate = string; // validated YYYY-MM-DD calendar date
export type TaskStatus = 'open' | 'blocked' | 'done';
export type ObjectiveStatus = 'open' | 'partial' | 'blocked' | 'done';
export type ExpenseCategory =
  | 'materials' | 'tools' | 'fuel' | 'maintenance' | 'other';
export type LeadStage =
  | 'new' | 'visit_planned' | 'estimate_sent' | 'won' | 'lost';

export interface Client {
  id: Id;
  name: string;
  phone: string;
  email: string;
  workDescription: string;
  stage: LeadStage;
  nextFollowUpDate: LocalDate | null;
  followUps: { id: Id; at: number; note: string }[];
}

export interface Project {
  id: Id;
  clientId: Id;
  name: string;
  status: 'open' | 'completed';
}

export interface Task {
  id: Id;
  projectId: Id | null;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  note: string;
  createdAt: number;
}

export interface Objective {
  id: Id;
  date: LocalDate;
  title: string;
  projectId: Id | null;
  taskId: Id | null;
  status: ObjectiveStatus;
  note: string;
  rank: number;
}

export interface ScheduleBlock {
  id: Id;
  date: LocalDate;
  startMinute: number; // 0..1439
  endMinute: number;   // startMinute < endMinute <= 1440
  kind: 'task' | 'appointment' | 'travel' | 'supply_run' | 'break' | 'cleanup';
  taskId: Id | null;   // non-null only for kind === 'task'
  title: string;
}

export type TimeEntry =
  | {
      id: Id;
      taskId: Id;
      source: 'timer';
      startedAt: number;
      endedAt: number;
      note: string;
    }
  | {
      id: Id;
      taskId: Id;
      source: 'manual';
      date: LocalDate;
      durationSeconds: number;
      note: string;
    };

export interface RunningTimer {
  sessionId: Id;
  taskId: Id;
  startedAt: number; // epoch milliseconds
}

export interface Expense {
  id: Id;
  projectId: Id | null;
  date: LocalDate;
  description: string;
  category: ExpenseCategory;
  amountCents: number;
  createdAt: number;
}

export interface Tool {
  id: Id;
  name: string;
  location: string;
  condition: 'ready' | 'needs_cleaning' | 'needs_repair';
}

export interface Material {
  id: Id;
  name: string;
  product: string;
  color: string;
  finish: string;
  unit: 'gal' | 'piece';
  stockMinor: number; // hundredths of the displayed unit
}

export interface MaterialRequirement {
  id: Id;
  projectId: Id;
  materialId: Id;
  neededMinor: number; // remaining need, not historical total used
  reservedMinor: number; // stock committed to this requirement
}

export interface MaterialAdjustment {
  id: Id;
  materialId: Id;
  deltaMinor: number;
  reason: 'restock' | 'usage' | 'correction';
  note: string;
  createdAt: number;
}

export interface MaintenanceItem {
  id: Id;
  toolId: Id;
  kind: 'cleaning' | 'service' | 'repair';
  title: string;
  dueDate: LocalDate;
  completedAt: number | null;
}

export interface AppState {
  schemaVersion: 1;
  revision: number;
  timezone: 'America/New_York';
  currency: 'USD';
  seededOn: LocalDate;
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  objectives: Objective[];
  schedule: ScheduleBlock[];
  timeEntries: TimeEntry[];
  runningTimer: RunningTimer | null;
  expenses: Expense[];
  tools: Tool[];
  materials: Material[];
  materialRequirements: MaterialRequirement[];
  materialAdjustments: MaterialAdjustment[];
  maintenance: MaintenanceItem[];
}
```

Use integer minor units for materials as well as money. Examples: five gallons = `500`, two gallons = `200`, three pieces = `300`. Piece quantities must be divisible by 100. Do not convert between units automatically.

Validate unique IDs per collection, valid foreign keys, compatible objective task/project links, nonnegative integer quantities, valid dates, finite safe integer timestamps/cents, at most three objectives per date, at most one block per task, one open-task running timer, and reservation totals within available stock. Unknown schema versions are not silently migrated or discarded.

Use Zod `safeParse` plus explicit relationship checks. Keep validation results as helpful errors, not raw stack traces in the UI. [Zod validation](https://zod.dev/basics).

## 8. Store, commands, and persistence

### Component wiring

`main.tsx` imports all three CSS files and mounts `StrictMode → ErrorBoundary → AppProvider → HashRouter → App`. App supplies the route table and AppShell. Presentational cards get data/callbacks from TodayPage; they do not read localStorage or calculate totals independently.

Create one store per provider using a lazy `useState` initializer. Expose the store through context and subscribe with `useSyncExternalStore`. Constructing a store must not write data, start timers, or have other side effects; initialize storage in an idempotent `initialize()` method called by an effect. This avoids duplicate initialization under StrictMode.

### Repository interface

```ts
import type { AppState } from '../domain/types';

export const STORAGE_KEY = 'morgan-el-pirata:prototype:v1';

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; state: AppState }
  | { kind: 'invalid'; raw: string; message: string }
  | { kind: 'unavailable'; message: string };

export type SaveResult =
  | { ok: true }
  | { ok: false; message: string };

export interface AppRepository {
  load(): LoadResult;
  save(state: AppState): SaveResult;
}
```

Implement this interface in `localStorageRepository.ts`; inject it for tests. Only this file accesses localStorage. Store serialized data under the single key above. localStorage is tied to the site's origin and browser, persists across ordinary sessions, and may be unavailable or cleared; it is not cross-device storage. [Storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

Initialization rules:

1. Empty storage: create the demo state once and attempt to save it. Display it only after successful initialization, or enter the explicit memory-only demo mode below.
2. Valid storage: load it exactly; do not reseed because the date changed or collections are empty.
3. Invalid JSON, invalid records, or unknown version: preserve the stored value, show a recovery screen, and offer Download saved data or Reset demo data. Reset requires explicit confirmation and overwrites this key only.
4. Unavailable storage: show an explanation with a “Try demo without saving” action. If selected, use in-memory state and a persistent compact notice that changes will be lost on reload.

Normal mutation ordering: read current state, apply/validate a command, increment revision, serialize/save, and then publish the new state. If saving fails, keep the prior state, keep form values open, and show a failure message; do not show a Saved toast. In explicit memory-only mode, publish without storage and retain its visible warning.

A storage event for this key from another tab or a revision mismatch before saving freezes editing with “This demo changed in another tab. Reload to continue.” Do not overwrite a newer document. This is a one-tab prototype, not a concurrent editing system; simultaneous multi-tab editing is not supported and is not a production data guarantee.

### Command boundary

Implement a pure transition function:

```ts
export type CommandResult =
  | { ok: true; state: AppState }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

// Implement the function body in commands.ts; this is its signature.
export declare function applyCommand(
  state: AppState, command: AppCommand,
): CommandResult;
```

Define `AppCommand` as a discriminated union covering these actions, with typed payloads from section 7:

| Command | Payload/behavior |
| --- | --- |
| `objectives.replaceDay` | date plus 0–3 objectives in display order; preserve other dates |
| `task.save` | complete task record; new records must be open; an existing ID updates title/project/estimate/note while preserving status and createdAt; status uses the dedicated command |
| `task.setStatus` | task ID, status, note, now; close that task's timer if status changes away from open |
| `schedule.saveTask` | task ID, date, startMinute, endMinute; upsert one deterministic linked block |
| `schedule.removeTask` | task ID; remove its linked block |
| `timer.start` | task ID, new session ID, now; same running task is a no-op; reject if a different timer is running |
| `timer.pause` | now; close the session and clear runningTimer; no active timer is a no-op |
| `timer.switch` | next task ID, new session ID, now; same running task is a no-op; otherwise close old/start new in one state transition |
| `timer.correctStart` | active session ID, new startedAt, now; correction must be finite, no later than now, and match the active session |
| `timeEntry.save` | timer or manual entry; same ID edits, new ID creates; cannot edit an active session |
| `expense.save` | expense record; same ID edits, new ID creates |
| `material.adjust` | adjustment record; apply delta once, retain audit record, reject negative/reservation-breaking result |
| `lead.add` | client record with stage new; duplicate ID is a no-op |
| `client.followUp` | client ID, follow-up ID, note, next date or null, now; append once per follow-up ID and replace follow-up date |
| `maintenance.complete` | maintenance ID, now; completion is idempotent |

Do not expose arbitrary state replacement to ordinary UI components. Reset demo data belongs to the store's confirmed reset method. Completing a tool's maintenance with kind `cleaning` sets `needs_cleaning` to `ready` only when all its cleaning items are complete; never clear `needs_repair` as a side effect. Service/repair completions record completion without automatically changing the tool's condition in this prototype.

Use this exact command shape, importing its referenced types from `./types`:

```ts
export type AppCommand =
  | { type: 'objectives.replaceDay'; date: LocalDate; objectives: Objective[] }
  | { type: 'task.save'; task: Task }
  | { type: 'task.setStatus'; taskId: Id; status: TaskStatus; note: string; now: number }
  | { type: 'schedule.saveTask'; taskId: Id; date: LocalDate; startMinute: number; endMinute: number }
  | { type: 'schedule.removeTask'; taskId: Id }
  | { type: 'timer.start'; taskId: Id; sessionId: Id; now: number }
  | { type: 'timer.pause'; now: number }
  | { type: 'timer.switch'; taskId: Id; sessionId: Id; now: number }
  | { type: 'timer.correctStart'; sessionId: Id; startedAt: number; now: number }
  | { type: 'timeEntry.save'; entry: TimeEntry }
  | { type: 'expense.save'; expense: Expense }
  | { type: 'material.adjust'; adjustment: MaterialAdjustment }
  | { type: 'lead.add'; client: Client }
  | { type: 'client.followUp'; clientId: Id; followUpId: Id; note: string; nextDate: LocalDate | null; now: number }
  | { type: 'maintenance.complete'; maintenanceId: Id; now: number };
```

Task creation with a schedule must use one store transaction applying `task.save` and `schedule.saveTask` against a draft before validating and saving once. If either command fails, save neither. Expose `executeBatch(commands: AppCommand[])` for this use, with the same revision/save/error rules as `execute`. A normal single command delegates to a batch of one. Creation with an invalid schedule must not leave an invisible unscheduled duplicate.

Generate form/session IDs outside the pure transition function and reuse them for retries. New IDs can use `crypto.randomUUID()` when available, with a local fallback using `crypto.getRandomValues()` for a preview on a non-secure private origin. Seed IDs are fixed strings for repeatable tests. Avoid IDs derived only from array positions or timestamps.

The store publishes stable snapshots, serializes synchronous mutations, and exposes `execute(command)` results to forms. Keep dialogs, draft input, selected task, and the once-per-second display clock out of the persisted document.

## 9. Required calculations and correctness rules

### Money input

Create `parseMoneyToCents(input: string): number | null` and `formatMoney(cents: number): string`. Parse the decimal string into whole and fractional parts instead of multiplying a floating-point dollar value. Accept `12`, `12.3`, and `12.30`; reject blank, negatives, zero for an expense, more than two decimals, commas, currency symbols, and exponent notation. The form displays a dollar prefix and explains the expected format.

Example core implementation for `money.ts`:

```ts
export function parseMoneyToCents(input: string): number | null {
  const value = input.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(cents / 100);
}
```

### Timer durations

Closed timer duration in milliseconds is `endedAt - startedAt`. Manual duration is `durationSeconds * 1000`. Active elapsed is `max(0, now - startedAt)`. Sum milliseconds across closed entries and the optional running interval, then round down once for display; do not discard partial seconds separately for every session.

```ts
import type { AppState, Id } from '../domain/types';

export function taskActualMilliseconds(
  state: AppState, taskId: Id, now: number,
): number {
  const saved = state.timeEntries
    .filter((entry) => entry.taskId === taskId)
    .reduce((sum, entry) => sum + (
      entry.source === 'timer'
        ? entry.endedAt - entry.startedAt
        : entry.durationSeconds * 1000
    ), 0);
  const running = state.runningTimer;
  return saved + (running?.taskId === taskId
    ? Math.max(0, now - running.startedAt)
    : 0);
}
```

When pausing, a completed entry uses the running session's ID; if it already exists, do not append a second entry. Ending at exactly the start produces no time entry and clears the timer. If the clock moved backward, reject the close operation and show a correction message rather than save a negative interval. Offer edit of the running start as a recovery action through the timer dialog, validated as a finite time no later than now and committed through a dedicated typed timer-correction command.

Validate `endedAt > startedAt` for edited completed timer intervals. Editing a timer entry uses two `datetime-local` inputs labeled with the device's display timezone and converts through the browser's local Date representation; round-trip their calendar components to reject silently normalized impossible local times. Show the resulting interval in the business timezone before Save. Ambiguous repeated-hour inputs use the browser's chosen occurrence, visibly confirmed by that preview. Project time is the sum of its tasks' actual time. Do not implement or claim daily labor totals yet; cross-midnight sessions are retained as intervals rather than assigned wholly to the wrong date.

Show estimate variance only after a task is done or once actual time exceeds its estimate. Before completion, use “Estimated 2h • Logged 45m,” not “75m saved.” A completed task with 3h actual against 2h estimated shows “1h over estimate.”

### Business dates

Use `America/New_York` for Today and purchase-date defaults; do not use the server's UTC day or assume the phone has the same timezone. This matches the existing confirmed planning timezone, but no calendar integration occurs.

```ts
import type { LocalDate } from '../domain/types';

export function businessDate(now: number): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
```

Validate date strings with a calendar round-trip, not only a regular expression. Date-only purchases and planned dates stay date strings; do not run them through UTC midnight conversion. Display headings from the current instant with `Intl` and the business timezone. Format date-only labels from validated components without timezone shifts. Refresh Today on visibility/focus and when the business date changes. Do not move old tasks, reset objectives, or reseed records at midnight.

### Material shortages

For each material, physical stock includes reserved stock. First subtract all reservations to get the free pool. For each open project's requirement in stable project-ID then requirement-ID order, compute unmet need as `max(0, neededMinor - reservedMinor)`. Allocate the free pool to unmet needs in that order without saving the simulated allocation; missing quantity is what remains after that allocation. Reduce the pool before examining the next requirement.

This prevents the same free gallons from appearing available to two projects at once. Mark the computed amount as “Available to this job” rather than implying it is already reserved. Explicit reservation editing is deferred. For the initial sample, need 500 and reserved stock 200 gives shortage 300 = 3 gal. Quantity adjustments alter stock only; expense entry records money separately in this milestone.

### Derived values

Provide selectors for: today's objectives, sorted timeline, overlaps, open tasks, task/project actual time, task estimate variance, today's expenses/total, per-project expense totals, general business expenses, attention items, and material stock/free/shortage display.

Keep these calculations in selectors and helpers with tests. Components render selector results. Use IDs and relationships rather than copying totals or client names into multiple saved records.

## 10. Exact sample records

Create `createDemoState(now: number): AppState` in `src/data/demo.ts`. Use `businessDate(now)` as the sample day, fixed IDs below, revision 0, schema version 1, no running timer, and integer timestamps derived from the supplied `now`. Avoid random sample values. Reset recreates records for the then-current date; ordinary reload does not.

### Contacts and projects

| ID | Record |
| --- | --- |
| `c-smith` | Alex Smith; won; exterior painting; no follow-up due |
| `c-rivera` | Jordan Rivera; won; interior painting; no follow-up due |
| `c-taylor` | Casey Taylor; estimate sent; cabinet painting; follow-up due on sample day |
| `p-smith` | Smith exterior painting; client c-smith; open |
| `p-rivera` | Rivera living room; client c-rivera; open |

Use blank phone/email fields for sample contacts. Do not invent working contact details or use actual private client data.

### Tasks and objectives

| Task ID | Project | Task | Estimate | Initial status |
| --- | --- | --- | --- | --- |
| `t-prep` | p-smith | Prepare north wall | 120 min | open |
| `t-coat` | p-smith | Apply first coat | 180 min | open |
| `t-estimate` | General business | Send Taylor estimate | 30 min | open |
| `t-rivera` | p-rivera | Mask living room | 60 min | open |

Create three open objectives for the sample day: finish preparing north wall linked to t-prep, apply first coat linked to t-coat, send the estimate linked to t-estimate. Rank them 0, 1, 2. Seed one manual time entry of 2700 seconds (45 minutes) for t-prep on the sample day.

### Timeline

| Local time | Kind | Title/link |
| --- | --- | --- |
| 08:00–08:30 | supply_run | Pick up supplies |
| 08:30–09:00 | travel | Travel to Smith project |
| 09:00–11:00 | task | t-prep |
| 11:00–12:00 | appointment | Site walk-through |
| 12:00–12:30 | break | Lunch |
| 12:30–15:30 | task | t-coat |
| 15:30–16:00 | cleanup | Pack and clean up |
| 16:00–16:30 | task | t-estimate |

Seed initial expenses on the sample day: 6240 cents for materials assigned to p-smith, and 2220 cents for fuel under General business. Initial Spent today is **$84.60**. Project p-smith spending is **$62.40**.

### Equipment, stock, and maintenance

- `tool-sprayer`: Airless sprayer; in the van; needs_cleaning.
- `tool-ladder`: Extension ladder; in storage; ready.
- `tool-sander`: Orbital sander; at Smith project; needs_repair.
- `m-white`: Exterior white paint; illustrative product name; white; satin; gal; stockMinor 200.
- `m-tape`: Masking tape; illustrative product name; neutral color/finish labels; piece; stockMinor 400.
- Requirement for p-smith/m-white: neededMinor 500, reservedMinor 200.
- Requirement for p-smith/m-tape: neededMinor 200, reservedMinor 0.
- `maint-sprayer`: tool-sprayer; kind cleaning; Clean the sprayer; due on sample day; completedAt null.

Initial attention contains the sprayer cleaning, 3-gallon paint shortage, and Taylor follow-up. Add a restrained equipment warning in Inventory for the sander; tool assignment warnings are deferred because assignment is not implemented yet.

## 11. Testing and acceptance

Save the following as `web/vitest.config.ts`. The unit tests cover pure logic and the framework-independent store; use browser tests for components. Inject a fake repository and fixed timestamps to test business behavior; do not write tests that only repeat JSX or assert CSS class names.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

Required unit scenarios:

1. Expense parsing and editing: $0.10 + $0.20 totals exactly 30 cents; editing replaces rather than duplicates; invalid decimals are rejected.
2. Timer: start/pause/resume, refresh reconstruction, switching, double pause, completion, blocked task, clock moving backward, and estimate variance before/after completion.
3. Persistence: valid reload, empty initialization once, malformed JSON, unknown version, quota/storage errors with no false save, memory-only mode, and stale revision refusal.
4. Objectives: cap of three, blocked-note validation, independent task/objective status, and preservation of other dates.
5. Materials: initial 3-gallon shortage, stock restock clears it, no double-allocation across two projects, idempotent adjustment, and reservation constraints.
6. Dates/schedule: the instant `2026-09-16T02:00:00Z` is September 15 in New York; reject February 30; sort local schedule; detect overlaps; reject overnight blocks.

Use Playwright to exercise the actual built UI behavior. `webServer` starts the local development server during tests; reuse an existing server only outside CI. [Playwright web server setup](https://playwright.dev/docs/test-webserver).

Suggested exact `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium-phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'webkit-phone',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
});
```

Browser scenarios:

- Fresh load shows all six home sections and the expected sample totals.
- Complete an objective, add a $25 expense, reload: objective remains done and total is $109.60.
- Start a timer, navigate away, reload, pause: elapsed time remains consistent and only one interval is saved.
- Switch tasks and finish a task without leaving a hidden running timer.
- Each Quick Add form saves a usable record visible in its related view.
- Add three gallons to paint stock: shortage disappears; expenses are unchanged.
- Complete maintenance and record a follow-up: their attention items update.
- Edit a schedule block into a conflict: warning appears and existing blocks stay in place.
- Navigate all five destinations, open a project, and reload a deep hash URL.
- Cancel a dirty form, use keyboard navigation, close dialogs with Escape, and verify focus returns.
- Confirm Reset demo data touches only the prototype key and restores seed totals.
- Malformed storage presents recovery without overwriting the stored bytes.
- At 320px, 390px, 768px, and 1280px widths, no horizontal overflow or covered controls.

Run these commands from `web/` using the runtime PATH from section 3:

```bash
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

Reuse already available Playwright browsers when compatible. If browser system dependencies are missing, report the exact missing dependencies; do not silently install system packages or use sudo. Separate checks that passed from checks that were blocked.

Capture and visually inspect `web/artifacts/screenshots/today-phone.png` and `today-desktop.png`; fix clipping, unreadable text, covered controls, and broken interactions. Start `pnpm preview` and smoke-check the built app at `http://127.0.0.1:4173/#/today` as well. Storage at port 4173 is separate from port 5173 because the origins differ.

## 12. Local run, phone preview, and completion report

For normal development:

```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web'
pnpm dev
```

The runtime PATH setup is needed in a fresh shell on the currently inspected machine. Document that in `web/README.md`.

Local URL: `http://127.0.0.1:5173/#/today`. This address works on the machine running the app; it is not a phone-accessible link by itself. Phone-sized browser testing satisfies this coding milestone's responsive check. An actual remote-phone link needs a separately configured, reachable preview address.

Do not change firewall rules, existing reverse proxies, system services, Tailscale settings, or public exposure while implementing this frontend. The subsequent phone-preview task should inspect the existing authorized access arrangement and serve the built `dist/` through that arrangement. Keep a public development server out of this handoff. No hosting service or deployment destination has yet been selected.

Implementation sequence:

1. Read the project instructions, confirm target paths/runtime, and scaffold only `web/`.
2. Add types, validation, sample data, calculations, repository, and store.
3. Build the application shell and Today layout.
4. Wire task/timer, objectives, schedule, and Quick Add forms.
5. Add the small supporting pages and attention deep links.
6. Run the required checks, inspect screenshots, and fix failures.
7. Write `web/README.md` with exact run/test commands, scope, storage behavior, timer behavior, known limitations, and preview address.
8. Add a short implementation-status/link section to the parent planning README, preserving all original requirements and marking only delivered capabilities as implemented.

Completion report must include source location, what works, what remains a demo, exact checks run and their results, screenshot locations, how to start/stop the preview process, and whether a phone-accessible URL was actually configured. Do not claim a deployment, calendar connection, durable business database, or device synchronization.

## 13. Copy-paste handoff prompt

```text
Build the Morgan el Pirata Today-screen prototype described in:
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/HOME-SCREEN-SPEC.md

Read that complete specification, the adjacent README.md, and the parent
LargeConcierge/AGENTS.md before coding. Save application source under:
/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/

Implement the specified interactive frontend, sample data, browser persistence,
small supporting views, and required tests. Follow the runtime setup and exact
behavior rules in the specification. Preserve the existing planning files and
other apps. Request scoped filesystem/network access if required.

Run the checks, visually inspect the phone and desktop screenshots, and report
what passed, what was blocked, and the exact local run instructions. This task
ends with a verified local prototype; production hosting and integrations are
separate milestones.
```
