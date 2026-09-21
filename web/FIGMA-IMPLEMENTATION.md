# Figma implementation — September 19, 2026

Source: [Morgan el Pirata in Figma](https://figma.com/design/uf6F2FArS37ia2QSMtSbNT).
The implementation uses the existing React application, contracts and authenticated
API. No production records, account IDs, passwords, timers, AI configuration,
uploads or migrations are replaced by the design update.

## Screens

| Figma node | Screen | Application location |
| --- | --- | --- |
| 11:3403 | Sign in | Signed-out `/` |
| 11:3450 | Work | `/#/work` |
| 11:3560 | Projects | `/#/projects` |
| 11:3674 | Project | `/#/project/<id>` |
| 11:3755 | Tasks | `/#/tasks` |
| 11:3859 | Task detail | Open any task |
| 11:4042 | Add task | Floating Add task button |
| 11:5227 | Ask | `/#/ask` |
| 11:5355 | Updates | `/#/updates` |
| 11:5444 | Menu | `/#/menu` |
| 11:5653 | Calendar | `/#/calendar` |
| 11:5874 | Files | `/#/files` |
| 11:3953 | Progress | `/#/progress` |
| 11:5964 | Settings | `/#/settings` (owner) |

Shared tokens define charcoal backgrounds, dark cards, amber actions, white text
and visible focus. Phone navigation stays Work · Ask · Updates · Menu, with
Projects/Calendar/Tasks shortcuts and a grouped searchable Menu. Wider screens
keep the full sidebar. Project detail has one meaningful title, progress, real
client/job information and section links to tasks, notes, files and activity.

Work and Progress use actual equally weighted goal/subtask fractions. Task sheets
retain title-only capture, assignment/estimate chips, optional details, rapid
subtasks, deliberate schedule editing and independent timers. The floating Add
opens a task in the current project; Back, X, Cancel and Escape from its child
return to the Add menu. Dirty and uncertain-save protection remains active.

Files supports real upload destinations, search, image/PDF filters, authenticated
preview/download, recoverable removal and task → project → client inheritance.
Updates filters the existing live feed and retains drafts while its message form
is hidden. Ask uses the existing allowed API operations and owner-configured
limits. The implementation does not add fake weekly statistics, unsupported
priority fields or cosmetic switches that do nothing. Existing working details
remain available even where omitted in the mockup.

## Validation and screenshots

Final results are recorded below and in `deploy/deployed-release.json`. Tests use disposable fixtures, never production business data.

Screenshots: [artifacts/figma-20260919](artifacts/figma-20260919/), named by screen,
engine and width (320, 390, 768, 1280). Examples:
[Work](artifacts/figma-20260919/work-chromium-390.png),
[Project](artifacts/figma-20260919/project-chromium-390.png),
[Menu](artifacts/figma-20260919/menu-chromium-390.png),
[Add task](artifacts/figma-20260919/add-task-chromium-390.png).
Populated upload evidence is in `artifacts/redesign/after/`; shared feed evidence
is `artifacts/screenshots/figma-updates-{engine}-{width}.png`.

Browser commands, from `web/` using the runtime PATH in the root README:

```bash
# Run separately so each suite gets an isolated sign-in rate-limit window.
for spec in figma navigation tasks collaboration; do
  pnpm exec playwright test --config tests/redesign/playwright.config.ts "$spec.spec.ts" || exit
done
for spec in figma navigation tasks collaboration; do
  PIRATA_TEST_WEBKIT=1 pnpm exec playwright test --config tests/redesign/playwright.config.ts "$spec.spec.ts" || exit
done
pnpm exec playwright test --config tests/team/playwright.config.ts
PIRATA_TEST_WEBKIT=1 pnpm exec playwright test --config tests/team/playwright.config.ts
pnpm exec playwright test --config tests/integration/playwright.config.ts
pnpm exec playwright test --config playwright.modules.config.ts clients-projects/ foundation.spec.ts
pnpm exec playwright test --config tests/modules/spending/playwright.group-b.config.ts
PIRATA_GROUP_A_API_PORT=3013 pnpm exec playwright test --config tests/modules/tasks-time/playwright.group-a.config.ts
```

Group A defaults to API port3003; the override avoids a separate service using
that port on this host. Module groups have their own fixture servers/configs;
do not run all groups under the generic modules config. The `.test.ts` files
are Vitest tests, separate from browser `.spec.ts` tests.

Playwright WebKit uses the existing private test runtime and HTTPS harness; it
is browser-engine coverage with iPhone emulation, not a physical iPhone/Safari
check. No paid AI request is needed for this UI release. Complete database/file
backup, scratch restore and code-only rollback instructions are in
[TEAM-RECOVERY.md](deploy/TEAM-RECOVERY.md).

## Completed behavior checks

| Check | Result |
| --- | --- |
| Server/API/domain tests | 150 passed |
| Frontend unit tests | 69 passed |
| Publisher, backup, recovery and setup tests | 26 passed |
| Preserved demo Chromium phone/desktop | 46 passed |
| Integrated legacy workflows and Add navigation | 11 passed |
| Clients/projects/foundation browser checks | 13 passed |
| Spending/inventory browser checks | 17 passed |
| Tasks/time/planning browser checks | 17 passed |
| Figma/redesign Chromium | 12 passed |
| Figma/redesign WebKit over HTTPS | 12 passed |
| Team workflows, uploads, updates and parent/child timers | 4 passed per engine |

The final team checks include employee access, two simultaneous browser sessions,
shared updates with no duplicate messages, hidden-draft retention, cleanup cycles,
photo/PDF recovery and parent/child timer completion. Blocking a parent now leaves
its independently running child timer intact; finishing the parent saves that
interval exactly once. Schedule editing and time correction remain explicit.

WebKit testing also found and fixed native-select overflow at 320px. The file
location picker now stays within its card, including long saved task names.
Native button bevels are removed so the intended gold controls render consistently.

The generic modules runner initially included unrelated fixture servers and a
Vitest file; each group was rerun using its own config. Stale test selectors were
updated for collapsed optional details, native progress accessibility values and
the revised calendar default. Authentication rate limits and Secure cookies were
not weakened. The PDF test uses an actual browser download and compares its bytes.


Release `20260919T015539Z-7075cae7` is live. Canonical lint/typecheck/build passed
(one existing Fast Refresh warning and one bundle-size advisory). The deployed
assets exactly match the tested build. Live authenticated navigation and private
API/file protection passed. A fresh signed-out page now presents the welcome
form without an incorrect expired-draft warning; real session-expiry protection
continues retaining loaded records and drafts.
