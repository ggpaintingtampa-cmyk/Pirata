# Chunk B handoff — Hours, pay, reports, exports (update 2026-09-25)

Branch `update-2026-09-25/B`, built on top of chunk A. Implemented by Claude on
2026-09-25 following SKILL.md §5. `pnpm build` and `pnpm lint` pass (warnings
only); the server type-check passes; the unit tests below were run once.
Playwright was NOT run.

## What was built

**Server (`server/src/modules/hours`, `server/src/routes/export.ts`)**
- `shift.submit` (own, `submitted`), `shift.enter` (office for anyone,
  `approved` at once), `shift.update` (approver any row; owner of a submitted
  row), `shift.approve`, `shift.reject {note}`, `shift.remove` (own submitted
  or approver). Minutes come from `shiftMinutes()`; hours and days cannot mix;
  hours need in/out; the project cannot be a draft.
- `payRate.set` upserts on person + effective date (owner via dispatcher),
  `payRate.remove`; `dayNote.save` upserts my note for a date.
- CSV routes (UTF-8 BOM, CRLF, attachment): `GET /api/v1/export/shifts.csv?from&to&userId&projectId`
  (workers: own rows; rate/cost columns only with `money.costs`) and
  `GET /api/v1/export/daily-report.csv?date` (one row per report line;
  expenses and labor cost only for the owner).

**Web**
- `features/hours/`: Hours screen (view `hours`). *My hours*: week stepper,
  total, my entries with status chips, Add hours → `ShiftDialog` (project,
  date, Hours in/out + break with time pickers, or Days ¼…2), edit/remove while
  submitted. *Team* (office): pending approvals with Approve / Reject (reason),
  attendance grid for a date (person × project, tap a cell to enter or edit),
  per-person week and month totals, per-project month totals, Export CSV.
  `ShiftDialog` is also the Add-menu "Hours" dialog.
- `features/pay/`: Pay rates (owner): current rate per person, history,
  set/change (hourly or daily, amount, effective from), remove a future rate,
  labor cost this month per person.
- `features/report/`: Daily report (view `report/:date?`): date stepper,
  project and person filters, Export CSV, sections Tasks completed (by
  project, who/when, steps marked), Hours (with "planned on site, no hours"
  warnings from presence rows), End-of-day notes, Questions, Materials
  requested, Tools (taken/returned, broken), Money (owner: expenses and labor
  cost per project), and "My note for this day" (`dayNote.save`).
  `selectors.ts` holds the pure `reportData()`.
- `features/insights/`: Project insights (view `insights/:projectId?`):
  cross-project list (label, progress, hours this week, open questions) and
  the per-project view: header with lifecycle label and days active, progress
  and timers vs estimate, still-to-do, completed lately, questions, materials,
  tools on the job, hours per person, and the money block (three prices for
  the office; expenses, labor cost and profit for the owner).
- Calendar (`features/planning/index.tsx`) and the task editor schedule
  block now use native time pickers instead of typed HH:MM.
- Strings `hours.*`, `pay.*`, `report.*`, `insights.*` in English and Spanish.

## Tests
- `server/tests/modules/hours/hours.test.ts` (2 tests: permission matrix,
  minutes math, pay-rate upsert/owner-only, snapshot filtering, day notes; CSV
  content and role filtering).
- `web/tests/unit/report.test.ts` (2 tests). No Playwright spec was added for
  B (the flows are form-driven; Andres verifies on device).

## Deviations / notes for the lead
1. The "Insights" link on the project page belongs to chunk C; until then the
   view is reached from the Menu (cross-project list) and `#/insights/<id>`.
2. Timers vs estimate in Insights sums the whole task tree of the project.
3. A daily rate applied to hour-shifts counts `minutes / 480` of a day
   (AS-8 in SKILL.md); change `STANDARD_DAY_MINUTES` in contracts if crews work
   a different standard day.
4. Rejected shifts stay visible (red border) so the worker sees the reason;
   they never count toward hours or cost.

## For Andres to verify on the phone
As worker: Hours → Add hours 8:00–16:30 with a 30-minute break on a project;
see it "Waiting for approval". As manager: Hours → Team → Approve; open the
attendance grid and tap a cell to enter hours for someone. As owner: Pay
rates → set an hourly rate; Daily report shows labor cost and expenses;
Insights shows profit; Export CSV opens in Excel.
