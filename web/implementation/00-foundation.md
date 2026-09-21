# Task 00 — shared backend foundation (stronger AI)

Implement this task, not just a design. Work in the LargeConcierge project.
Read AGENTS.md, the two project READMEs, web/README.md and this directory's
SHARED-CONTRACT.md. Canonical root is
`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.

## Goal

Create and verify the common backend so five Spark feature agents can work
without inventing incompatible auth, tables, API envelopes or UI interfaces.
Do not deploy, change DNS/firewalls, expose ports, or implement all five modules.

## First checkpoint

Inspect existing source and tests. Recheck whether Git exists. Make a private,
timestamped source-only backup and checksums before structural changes; exclude
dependencies, build output, reports, credentials and browser data. Preserve
planning docs. Request only needed filesystem access. Verify bundled Node/pnpm.

Review SHARED-CONTRACT.md and finalize concrete schemas, module exports and
table definitions. Ask only about consequential product ambiguity. Record
routine technical decisions yourself. Do not mark contracts frozen until the
code and test harness demonstrating those contracts exist.

## Implement, in order

1. Create sibling server/ and packages/domain + packages/contracts, a pnpm
   workspace and pinned compatible backend dependencies. Preserve frontend
   behavior and dependency resolutions. Add strict TS, lint, Vitest and scripts.
2. Establish all module DDL and numbered forward migrations, a schema version
   table, foreign keys, WAL, busy timeout, safe integer/check constraints,
   owner-scoped relationships, at-most-one task block and one running timer per
   owner. Use real temporary database fixtures. Never auto-reset an unknown DB.
3. Implement one-owner bootstrap/recovery CLI with concealed interactive input,
   current password hashing guidance and library verification, opaque server
   sessions, login/logout/status, rate limits, CSRF/origin defenses, safe logging.
   No credential defaults, signup, tokens in localStorage or accounts in samples.
4. Implement /api/v1/snapshot, transaction/revision/idempotency framework and
   strict command dispatch. Return NOT_IMPLEMENTED/blocked capability for module
   stubs; never a false success. Bind only loopback, fail on occupied port.
5. Extract existing pure schemas/calculations without changing v1 semantics.
   Create the versioned server DTOs and compatibility adapter. Preserve v1 key.
6. Provide core transaction context: ownerId, serverNow, typed SQL/repositories,
   owner revision, and error helpers. No feature agent commits independently.
   Implement shared cross-module helpers required for atomic task+schedule creation
   and task completion + timer closure. Define tested handler signatures.
7. Provide typed client service interfaces, frontend module props, an isolated
   test mount for feature UIs, and API test factories. Leave the deployed local
   Today mode untouched. A coordinator-owned file registers five module exports.
8. Implement private consistent SQLite backup and restore-to-scratch commands
   using SQLite backup facilities. Test restore integrity, not only file creation.
   Do not copy only the main .sqlite file while WAL writes may be outstanding.

## Exact deliverables needed before parallel work

- `web/implementation/CONTRACT-FROZEN.md`: version/hash, installed versions,
  actual DDL/schema paths, server DTOs, command input/output types, module handler
  signatures, UI props, test fixture helpers, allowed ownership and test commands.
- Five compiled stub module entrypoints matching Tasks 01–05, with explicit
  central registration. No runtime discovery or generic custom framework.
- Test cases demonstrating a real authenticated command transaction, rollback,
  revision conflict and retry after simulated lost response.
- Server README with dev/test/build/start/migrate/backup/restore commands,
  configuration variable names (no secrets), database paths and upgrade process.
- `web/implementation/handoffs/00-foundation.md`, READY only after tests pass.

## Acceptance tests

Anonymous requests cannot read or mutate business data. Wrong-owner IDs reveal
no records. Missing/wrong origin or CSRF fails every mutation. Logout/recovery
revokes sessions. Cookie flags and expiry are verified. Logs contain no passwords,
cookies, authorization headers or submitted customer payloads.

Identical request retry applies once; changed payload with the same requestId
fails; stale revision changes nothing; two concurrent writers cannot lose updates.
Database write failure cannot publish success. Restart retains records. Migration
failure leaves a recoverable database; unknown schema is not discarded. Backup
restores relationships and the active timer into an isolated test DB.

Run existing 51 unit cases plus new foundation tests, frontend lint/build and
relevant Chromium regressions. Record actual counts, not stale expectations.
Stop before implementing feature modules and deliver the READY handoff so the
five Spark tasks can start. If a blocker remains, name it precisely.
