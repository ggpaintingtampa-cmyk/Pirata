# Workspace design update

September 18, 2026. Existing React/TypeScript application; no replacement scaffold,
new business API, database migration, or production sample records.

## Finding things

- **Phone/tablet:** Projects, Calendar and Tasks have direct shortcuts at the top.
  Work · Ask · Updates · Menu remains at the bottom. Menu groups pages by purpose
  and includes a Find a page search. Menu stays selected on secondary pages.
- **Desktop:** the sidebar exposes all permitted sections. Account & more opens
  sign-out, export and recovery tools. Employee navigation still omits owner-only
  spending and administration; server permissions are unchanged.
- **Page history:** page addresses use hashes such as `#/projects` and
  `#/project/<id>`. Refresh retains the selected page; Back/Forward restores it.
  Pending saves and unsaved drafts are protected. Native dialog Back handling
  closes the topmost in-app dialog layer.
- **Projects:** completion and task counts appear on each card. Inside a project,
  jump directly to Tasks, Notes, Files, Activity or owner-only Purchases.
- **Tasks:** search titles, notes, projects and parent tasks, combined with status,
  responsible-person and project filters. Completed tasks are available through
  the status filter. Work shows a bounded preview with All tasks/All projects.

## Everyday actions

Name-only capture stays fast; More task details holds estimates, assignment and
notes. Editing an existing task opens those details. Task details place Start,
Finish, Edit, Schedule, Time entries and Add subtask before files. Less frequent
timer operations remain under More timer actions.

The Photos & PDFs panel has normal horizontal recovery controls, Upload files and
Camera actions. Pending uploads keep the dialog open. Failed uploads retain Retry
upload and an explicit Dismiss upload action; retry uses the original upload ID.
Dismissing an uncertain request does not delete a file that may already be saved.
Remove and Restore continue to be recoverable server actions.

Child Add forms return to Add on Back, X, Cancel or Escape. Untouched forms do not
prompt. Nested task/template dialogs protect their own draft without closing or
dirtying their parent. Workday settings can be saved repeatedly without trapping
navigation. Ask suggestions fill a draft; they do not send a request automatically.

## Design and screenshots

Near-black backgrounds, charcoal surfaces, warm white actions, consistent Lucide
icons and system typography. Phone controls retain practical touch targets;
focus remains visible and reduced-motion preferences are respected.

- [Phone Work](artifacts/redesign/after/work-curated-390.png)
- [Desktop Work](artifacts/redesign/after/work-curated-1280.png)
- [Phone Menu](artifacts/redesign/after/menu-curated-390.png)
- [Fixed task files](artifacts/redesign/after/task-files-chromium-390.png)
- [Design comparison](artifacts/redesign/comparison-390.png)
- Responsive captures: `artifacts/redesign/after/` (320/390/768/1280).
- Projects: `artifacts/screenshots/redesign/`.
- Calendar: `tests/modules/tasks-time/artifacts/`.
- [Audit and visual QA](../design-qa.md).

Screenshots use disposable records. Physical iPhone/Safari behavior has not been
observed; automated Playwright WebKit is reported separately from Chromium.

## Repeating the checks

Use the bundled Node/pnpm PATH documented in the main README. From project root:

```bash
pnpm lint
pnpm build
pnpm test
python3 -m unittest discover -s web/deploy -p 'test_*.py'
```

From `web/`, run suites sequentially. Each starts a fresh disposable API/database:

```bash
pnpm exec playwright test --config tests/redesign/playwright.config.ts
pnpm exec playwright test --config tests/team/playwright.config.ts
PIRATA_TEST_WEBKIT=1 pnpm exec playwright test --config tests/redesign/playwright.config.ts
PIRATA_TEST_WEBKIT=1 pnpm exec playwright test --config tests/team/playwright.config.ts
pnpm exec playwright test --config tests/integration/playwright.config.ts
pnpm exec playwright test
```

The private WebKit wrapper/certificate fixture is documented in the existing team
configuration. No global package or certificate settings were changed. Keeping
redesign/team suites separate preserves real sign-in rate limits instead of
weakening them for a combined run. Avoid rebuilding shared packages during browser
runs; Vite can reload the page. Screenshot/report directories are ignored by the
team harness watcher.

Deployment uses the existing static publisher after a verified database/upload
backup and scratch restore. See [TEAM-RECOVERY.md](deploy/TEAM-RECOVERY.md) for the
exact live release and code-only rollback instructions. The API key, allowances,
user records and all business data remain on the existing server.
