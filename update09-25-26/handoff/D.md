# Chunk D handoff — Materials, tools, cleaning, platform (update 2026-09-25)

Branch `update-2026-09-25/D`, built on top of chunk C. Implemented by Claude on
2026-09-25 following SKILL.md §7. `pnpm build` and `pnpm lint` pass (warnings
only); the server type-check passes; the unit tests below were run once.
Playwright was NOT run.

## What was built

**Server (`server/src/modules/materials-tools`, `server/src/modules/collaboration`)**
- Material requests live in `shopping_items`: `materialRequest.create` needs a
  project, a task (which implies its project) or a person; `update`,
  `setReceived` (stamps who and when, mirrors `checkedAt`) and `remove` (soft)
  are allowed for the requester or the office. `shopping.add` / `shopping.check`
  keep working for the assistant and mirror the received state.
- Tools: `tool.signOut` (one open sign-out per tool, `takenAt` defaults to now,
  logs activity, opens the taker's cleaning reminder), `tool.return` (taker or
  office), `equipment.setSignOutRequired` and `equipment.resolveReport`
  (`equipment.admin`), `equipment.reportBroken` (anyone; sets the tool
  `broken` until every report is resolved).
- Cleaning cycles are now **per person** (`openCleanupCycle()` exported from
  the collaboration module): each person who takes or uses a tool gets their
  own reminder; rules of a day or more (3 days for a sprayer) are due by the
  end of the workday before the hard deadline (so a snooze is still possible);
  `cleanup.complete` stamps `completedBy`.

**Web**
- `features/materials/`: Materials requests screen (view `materials`; the old
  `#/shopping` address redirects here): Open / Received / All, project and
  requester filters, received toggle, edit and remove for the requester or the
  office, `RequestDialog` (item, quantity, notes, for a project + optional
  task, or for a person) which is also the Add-menu dialog.
- `features/tools/`: Tools screen (view `tools`): sign-out board (tools that
  need sign-out) and all tools; each tool shows who has it and where since
  when, Take / Return / Return and take, Report broken, Mark repaired
  (office), the needs-sign-out toggle (office), and a history of sign-outs,
  cleanings and reports. `SignOutDialog` is the Add-menu dialog. `ToolStatus`
  is also mounted inside Inventory → equipment details.
- Cleanup panel (`collaboration/cleanup.tsx`) shows my reminders by default;
  the office can switch to everyone.
- Platform: the app no longer shows the sign-in form when it wakes without
  network: it keeps retrying (`serverStore.initialize`) and refreshes on
  `online` and `pageshow`. Install-to-home-screen: `manifest.webmanifest`,
  192/512 icons (rendered from the favicon), iOS meta tags, an app-shell
  service worker (`public/sw.js`, production only, never caches `/api/`), and
  an "Install this app" hint in the Menu account card (browser prompt when
  offered, Share-sheet instructions on iPhone).
- Sign-in screen translated; strings `materials.*`, `tools.*`, `signin.*` in
  English and Spanish.

## Tests
- `server/tests/modules/materials-tools/materials-tools.test.ts` (2 tests:
  request links and permissions incl. legacy shopping commands; sign-out
  uniqueness, per-person 3-day reminders, return permissions, cleaned-by,
  broken/resolve). Existing collaboration and inventory suites pass (one
  positional team insert in the collaboration test gained the `locale` column).
- `web/tests/unit/materials.test.ts` (2 tests).

## Deviations / notes for the lead
1. `features/quick-add/**` and `features/dialogs/**` were kept: the browser
   demo (`App.tsx`, `?demo=1`) still imports them.
2. The Spanish sweep for the existing Inventory, Spending, Ask and Updates
   screens was not done in this chunk (only new screens, sign-in and the shell
   are bilingual). It remains for the integration sweep.
3. The service worker only caches the built shell; offline writes are out of
   scope (AS-8). Vite serves `sw.js` from `public/`, so the file is copied
   as-is on build.
4. Reconnect-on-wake retries up to 12 times with growing waits (max 5 s) and
   only for network failures; server errors still surface immediately.

## For Andres to verify on the phone
Add → Material request "2 gal primer" for a task; a manager marks it
received. Tools → mark the sprayer "Needs sign-out", Take it on a project,
see "With Jose · project · since…", Return it; check the 3-day cleaning
reminder on Daily; Report broken and Mark repaired. Menu → Install this app;
lock the phone with the app open, reopen after hours: it reconnects without
the sign-in form.
