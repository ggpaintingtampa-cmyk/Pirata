# Update 2026-09-29 — consolidated verification (phase 7)

Run by the owner, once, at the end (Part I §7). No phase gates were run during implementation; every suite below was authored or extended with the code and has **not** been executed by the implementing agent. Expect first-run fixes.

## Pirata (`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/.worktrees/update-2026-09-29`)

```bash
pnpm install --frozen-lockfile --prod=false
pnpm --filter @pirata/contracts build
pnpm --filter @pirata/server typecheck
pnpm --filter @pirata/server test
pnpm --filter morgan-el-pirata-web lint
pnpm --filter morgan-el-pirata-web test
pnpm --filter morgan-el-pirata-web build
pnpm --filter morgan-el-pirata-web test:e2e
```

New or extended tests: `server/tests/migration-005.test.ts`, `translation.test.ts`, `template-requirements.test.ts`, `bulk-copy.test.ts`, `bulk-delete.test.ts`, `work-feed.test.ts`, `ask.test.ts` (+3 cases), `ask-order.test.ts`; `web/tests/unit/translated.test.ts`, `i18n-parity.test.ts`, `serverStore.test.ts` (+3, one expectation changed to 3 snapshot calls), `retryableCommand.test.ts`, `calendar-shift.test.ts`, `dayList.test.ts` (+2), `bulk.test.ts`.

Known follow-ups for the first run: Playwright specs that locate “Ask a question” must now match “Ask the team” (P07); the Daily list renders display numbers and a By time / By project control (P01/P06).

Browser scenarios (synthetic data only):
1. Language: switch to Spanish on Settings and on the sign-in screen; every live screen reads in Spanish; a task title written in English shows a translation chip with View original / Report translation; Written in… corrects the source language; search finds the Spanish text; CSV export with `locale=es` carries `_original` and `translation_status` columns.
2. Daily: tasks at 08:00 for two projects precede 09:00 tasks; Unscheduled last; numbers follow the displayed order after reorder, completion and refresh; Set time opens the schedule dialog; a reorder never changes a scheduled time.
3. Refresh: save an hours entry on one device while another device is open; the second device shows it on the next poll or Refresh; offline Refresh says “No connection…”; an uncertain save shows “Retry same action” and retrying never duplicates.
4. Calendar → Add hours on a past day prefills that date; two entries for one worker total once on Who worked; a worker sees only “Your hours”.
5. Templates: “Prepare wall” with patch compound, sanding block and a preparation note applied by a worker; editing the template afterwards leaves the created tasks unchanged; Bring → Request opens a prefilled material request.
6. Bulk: select a parent and its child, Copy to… copies the tree once with new ids and no history; Move to trash (owner) shows cascades and blocked items; Batches → Restore all.
7. Connections: create a token for an explicit account; revoke it; the feed answers `TOKEN_REVOKED`.
8. Ask: with the provider mocked, inspect the instruction payload per role and locale; Suggest order shows distinct options; applying changes only the order; a stale proposal is refused and a fresh one can be requested; Undo restores.

## Camino (`/home/andre/Desktop/camino/.worktrees/update-2026-09-29`, base `redesign/v3-integration` 453d97b)

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

New tests: `tests/work-sync.test.ts`, `tests/schema3-migration.test.ts`, `tests/server-integrations.test.ts`, `tests/e2e/work-connection.spec.ts`, `tests/e2e/planning.spec.ts` (+5 C01 cases). Existing tests that assert `Goal.targetDate` is required, `schemaVersion: 2`, or that completing a task checks its goal will need their expectations updated to schema 3 and goal independence (section 20.1).

Browser scenarios (two isolated synthetic services, per Part I §5 P10 acceptance): assigned work appears as standalone tasks with no goal created; more than three tasks can be planned for a day and the three-card summary opens the full list; completing a leaf task from Camino is confirmed in Pirata exactly once (replay by request id); a lost response shows “Confirmation pending” and Retry sends the same request; a parent task offers Open in Pirata only; disconnect marks imported tasks and keeps their history; personal notes never appear in the feed or the completion envelope; the wake picker is aligned at 320/390/768/desktop on Chromium and WebKit, and 12:05 AM, 12:00 PM, 11:55 PM and the autumn DST hour save and reload.
