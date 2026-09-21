# Shared contract — proposal to be frozen by Task 00

## Locations and reading

Canonical root: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.
Existing frontend: `web/`. New backend: sibling `server/`. Shared code:
sibling `packages/domain/` and `packages/contracts/`. Keep authoritative code
here. Do not put code in `/home/andre/Desktop/Morgan The Undead/`.

Read `/home/andre/Desktop/LargeConcierge/AGENTS.md`, its README, the Pirata
README, `web/README.md`, this document, and your numbered task. The broad old
README is background, not permission to implement the whole future product.

The server and packages directories do not exist yet. The foundation owns their
creation and any scoped filesystem approval. Never broaden global permissions.
Host administration belongs in Server Upkeep, as the parent AGENTS.md directs.

## Technology and ownership

- Keep React, strict TypeScript, Vite, pnpm, plain CSS, Zod and lucide-react.
- One Fastify TypeScript API, SQLite via a maintained compatible better-sqlite3
  release, prepared statements, foreign keys, WAL, and explicit transactions.
- Foundation verifies Node 24.19.0 compatibility and pins backend dependencies.
  No global Node install or surprise paid service. No ORM or microservice split.
- Establish a pnpm workspace while preserving existing frontend dependency
  resolutions and scripts. One reviewed workspace lockfile after migration;
  preserve the original lockfile in the private source backup. Do not create
  npm/yarn lockfiles or let feature agents run dependency installation in parallel.
- Foundation owns `server/src/core`, `server/src/auth`, database migrations,
  app registration, shared contracts, package configs, lockfile and test harness.
- Feature agents own their numbered module paths. Coordinator owns cross-module
  imports, exported unions, Today integration and navigation. Module handlers
  are imported explicitly; no generic plugin discovery framework.
- Module handlers use a provided transaction context and must not commit,
  start a second transaction, bypass authentication, or perform network calls.

## Server boundary

Single owner initially. No registration, crews, invitations, tenants, or OAuth.
Use server-side sessions, an opaque random session token, a hashed server-side
token record, Secure/HttpOnly/SameSite cookies, expiry, logout/revocation and
CSRF protection for mutations. Owner setup and password recovery use a secure
interactive server command, never password arguments, chat, source or logs.
No tokens in localStorage. No private key in a VITE_ variable.

Every business query is scoped to the authenticated owner. Client-supplied owner
IDs cannot choose ownership. Reject unknown fields and cross-owner references.
Use parameterized SQL and database uniqueness/foreign-key/check constraints.

API routes use `/api/v1/`. Backend binds to an available explicit loopback port
(proposed 127.0.0.1:3001; verify first and fail rather than silently switching).
Database and configuration are outside served directories. Caddy proxies /api;
do not expose the API port or SQLite files. Proxy trust is limited to the actual
local proxy. The frontend uses relative URLs and same-origin credentials.

## Proposed HTTP contract

Foundation freezes actual Zod schemas and TS types matching this shape:

```ts
type MutationRequest = {
  requestId: string; // stable UUID for one user action and all its retries
  baseRevision: number; // last accepted owner-wide data revision
  command: BusinessCommand; // discriminated by type; strict schema
};
type MutationResult = {
  requestId: string;
  revision: number;
  serverNow: number;
  changed: boolean;
  result: { kind: string; id?: string };
};
type ApiFailure = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    currentRevision?: number;
  };
};
```

- `GET /api/v1/session`: session/CSRF status; no business data to anonymous users.
- `POST /api/v1/login`, `POST /api/v1/logout`: reviewed auth routes, rate limits,
  generic failures, session rotation and login-CSRF protection.
- `GET /api/v1/snapshot`: authenticated complete small-business snapshot,
  owner revision and serverNow; `Cache-Control: no-store`.
- `POST /api/v1/commands`: authenticated mutation envelope; success HTTP 200.
- `GET /api/v1/export`: authenticated business data download, no credentials.
- Import has separate preview and confirmed commit operations in Task 06.
- Health endpoint exposes only a minimal status, no versions, paths or secrets.

Errors: 400 invalid input, 401 unauthenticated, 403 invalid CSRF/origin,
404 inaccessible/missing record, 409 revision/idempotency/business conflict,
413 request too large, 429 rate limit, 503 unavailable storage. Never return a
stack trace or SQL to the browser. No generic successful response on a failed save.

For each command: authenticate and validate; begin one write transaction;
look up (owner, requestId); replay identical prior requests without reapplying;
reject reuse with different canonical payload; check baseRevision; enforce
relationships and business rules; apply all changes; increment revision once
if changed; record idempotent result; commit; then report success. Failed
transactions leave business state and revision untouched. The foundation
provides a safe canonical fingerprint and serializes writes correctly.

An old pause/finish/correct/discard request must include its expected session ID.
It must never affect a newer timer started from another device. Retries after
a dropped response reuse the original requestId and original payload. The
client never rolls its state backward to an older replay revision.

## Data and migration

Existing `web/src/domain/types.ts`, schema.ts, commands.ts and selectors.ts
define business semantics. Keep v1 browser data and storage key readable and
unchanged. Extract pure reusable functions into packages/domain only with
compatibility re-exports and the existing tests passing.

New server snapshot/schema has its own explicit version (proposed 2). Do not
cast old JSON to the new type or secretly overwrite the old localStorage key.
Foundation creates the normalized tables for all five modules before they
start. Use owner_id, stable ID, created/updated timestamps where meaningful;
preserve meaningful original IDs and timestamps on a validated import.

Tables include owners, sessions, data_revisions, command_receipts, clients,
projects, tasks, objectives, schedule_blocks, time_entries, running_timers,
expenses, materials, material_requirements, material_adjustments, equipment,
maintenance_items, leads and lead_follow_ups. The foundation records exact
DDL, indexes, constraints and extension mappings in CONTRACT-FROZEN.md.

Retain cents as safe integers. Displayed material quantities use integer
hundredths; pieces are multiples of 100. Dates are validated YYYY-MM-DD calendar
dates. Business timezone is America/New_York, currency USD. Timestamps and
elapsed calculations use epoch milliseconds. Do not use UTC dates for Today.

Client: id, name, optional phone/email, note, archivedAt, timestamps.
Project: existing fields plus clientId|null, address, note, timestamps. Retain
clientName as an import/display compatibility snapshot with an explicit policy.
Equipment: id, name, note, archivedAt, timestamps. Maintenance adds equipmentId
while preserving imported equipmentName text. Leads remain leads; an explicit
atomic conversion can create/link a client and preserve follow-up history.

New live business workspace starts empty. Samples are only an explicit demo
mode/fixture; never reseed production on restart or date change. Completing a
project preserves tasks, schedules, expenses, time and reservations; it does not
silently finish, stop or delete any of them. No destructive cascades or hard
deletion of business records in this wave.

## Frontend behavior shared by every module

Keep the current local demo fully working until the integration task explicitly
activates server mode. Demo reset only affects demo data. Never expose a demo
reset endpoint that can erase live records. Server failure must not cause a
silent fallback into a second local business database.

The integration task supplies one async store/context/API client. Feature UI
uses its typed services, not direct storage, raw fetch calls in cards, or a new
state framework. Only publish successful acknowledged changes. Preserve drafts
on 400/409/503/network failure; on 409 show refresh/review conflict handling.
Disable duplicate submits and retain the request ID until its outcome is known.
Refresh snapshots on visibility/focus and bounded polling while visible; don't
claim instantaneous sync/offline support. Do not replace dirty form drafts.

Body/inputs 16px, useful labels, visible focus, 44px targets, 320px no overflow,
reserved bottom-nav/Add space. Keep native dialog behavior, dirty confirmation,
focus restoration, field errors and polite success messages. Never announce
the timer every second. Only enable nav destinations with working views.

## Quality gates and handoff

Every module tests authorization, input validation, idempotent retries, stale
revision conflicts, relationship failures and rollback as well as its business
rules. Use real temporary SQLite databases and Fastify injection. Browser tests
must use isolated fixtures, never the live database or the user's demo storage.

Run existing frontend lint/unit/build and relevant browser tests. WebKit has
known missing system libraries; report blocked coverage accurately, do not
install system packages inside a feature task. Integrator runs all combined tests.

Each agent writes its own `implementation/handoffs/NN-*.md` with changed files,
commands/results, integration instructions, unresolved issues, and READY or
BLOCKED. No secrets or customer record dumps. A typecheck, stub, screenshot,
or mocked save alone does not prove backend behavior.

Technical reference points (verify current versions when implementing):
- https://fastify.dev/docs/latest/Reference/Server/
- https://github.com/WiseLibs/better-sqlite3
- https://www.sqlite.org/backup.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
