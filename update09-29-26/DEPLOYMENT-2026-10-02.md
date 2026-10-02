# Employee task views and Spanish layout

Published Pirata web release `20261002T002351Z-2be6859d` from code commit `a3c5407` at https://pirata.andresinbox.tech. Previous web release: `20261001T124107Z-592f2cec` (retained for rollback). API remains `20261001T124102Z-151800ea`. This release changes the frontend only; no database migration or service restart.

## Changes

- All tasks: Spanish filter actions wrap without compressing the task count. Filters fit narrow phones; selection checkboxes remain beside task rows.
- Daily: choose Employee / project, then Day plan or All assigned tasks. The latter includes assigned tasks across all dates and projects, including completed tasks; archived tasks remain in the archive. Filters reset within the chosen employee's list.
- Assign tasks changes responsibility without scheduling a date, using the existing revision-checked, retry-safe task command. Inherited subtasks follow; explicitly assigned subtasks keep their employee.
- Plan this day is visible beside Assign tasks. The person planner browses all active projects by default and shows the current employee and project for each task. Saving uses existing day-list rules, including preserving another employee's explicit assignment.
- All new interface text is provided in English and Spanish.

## Verification

- Two isolated Chromium phone workflows passed: Spanish filters and bulk-selection layout at 320/390/768/1280 widths; employee-wide assignments, undated assignment, day-plan save, and Spanish Daily controls at phone widths.
- Eleven focused unit tests passed (dictionary parity, day-list grouping and bulk selection).
- Web TypeScript build, changed-file ESLint and production Vite build passed. Existing bundle-size/dynamic-import warnings remain. Full regression suites and WebKit were not run.
- Screenshots with synthetic records are saved under `web/artifacts/screenshots/employee-*.png`. No user attachment was available; layout verification used synthetic long titles and an employee filter in Spanish.
- All ten public release files match the local build hashes. Live health returned 200; anonymous snapshot access returned 401.

Reload or reopen Pirata to load the new interface. Spanish path: Diario → Empleado / proyecto → choose employee → Todas las tareas asignadas. Use Asignar tareas for responsibility, or choose a date and use Planear este día for that day's list.

Release manifest: `/var/backups/pirata/20261002T002351Z-2be6859d.json`. Roll back with the established static publisher's `rollback 20261001T124107Z-592f2cec` command if needed.
