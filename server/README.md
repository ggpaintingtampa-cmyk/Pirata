# Team API extension — September 18, 2026

Migration002 preserves the existing owner/business namespace and records while
adding team identities, assignments/subtasks, per-user timers, goals, private files,
activity, notes/shopping, cleanup cycles and disabled-by-default AI settings.
`001-foundation.sql` is unchanged. Historical owner-only statements below describe
version1 and are superseded by [the project README](../README.md).

Login accepts `{username,password}` (username defaults to owner for compatibility).
Sessions include a user identity; disable/reset revokes employee sessions. Employee
snapshots omit spending; exports/imports/admin APIs require owner role. Commands
check permissions before idempotency receipts. Binary routes authenticate before
body parsing and store files outside served roots; see files/ and deployment docs.
Polling every5seconds refreshes the shared snapshot; immutable IDs and revision
checks prevent duplicate events and stale overwrites.

Run [team recovery procedures](../web/deploy/TEAM-RECOVERY.md) before any production
migration. API backups now require matching uploaded-file manifests and bytes.

# Pirata backend foundation

The single-owner Fastify API and SQLite database now serve the integrated owner
workspace. All five feature modules are implemented: clients/projects, tasks/time,
planning, spending and inventory/maintenance. The normal frontend uses server
records; the original browser-local demo remains explicitly at `/?demo=1`.
Authenticated v1 import is previewed, confirmed, empty-workspace-only and atomic.

Production deployment and secure two-layer owner credential setup are described
in [the deployment runbook](../web/deploy/README.md). The production CLI runs as
`pirata`; do not create a root-owned live database or use the test harness password.

## Runtime and commands

From `/home/andre/Desktop/LargeConcierge/Morgan el Pirata`:

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm --filter morgan-el-pirata-web test:e2e
pnpm --filter morgan-el-pirata-web test:modules
python3 server/scripts/verify-operations.py
```

Use the one root lockfile. Build shared packages before tests after modifying
shared source. Node 24.19.0/pnpm 11.19.0 are verified. Native better-sqlite3
12.11.1 includes SQLite 3.53.2; its prebuilt binary works here. Version 13.0.3
required an unavailable system compiler and was rejected for this workspace.
No global runtimes/system packages were installed. Installation explicitly
allows better-sqlite3, Argon2 and esbuild setup scripts. Existing frontend
resolved package versions are retained; Vite's optional peer resolution now
also includes the workspace's tsx/esbuild.

Development/operations (environment variables contain configuration, not passwords):

```bash
export PIRATA_DB_PATH='/absolute/private/path/pirata.sqlite'
export PIRATA_ORIGIN='https://your-same-origin-host.example'
export PIRATA_PORT=3001
pnpm --filter @pirata/server migrate
pnpm --filter @pirata/server owner:setup
pnpm --filter @pirata/server dev
# Built executable instead of watch mode:
pnpm --filter @pirata/server start
# Password recovery revokes ALL existing sessions, retaining business data:
pnpm --filter @pirata/server owner:recover
pnpm --filter @pirata/server backup /absolute/private/path/new-backup.sqlite
pnpm --filter @pirata/server restore:scratch /absolute/private/path/new-backup.sqlite /absolute/private/path/new-scratch.sqlite
```

`owner:setup` and `owner:recover` require a real terminal and concealed password
entry twice; they reject password arguments, piped input, short passwords and
mismatched confirmation. There is no signup, default owner or sample live account.
Passwords are 15–128 characters, hashed using Argon2id v19, m=19456 KiB, t=2,
p=1 with independent random salts. The actual installed library is verified
with hashing and verification tests. The bootstrap and recovery changes are atomic.

Configuration: `PIRATA_DB_PATH` defaults to `server/var/pirata.sqlite` (outside
web); `PIRATA_PORT` defaults to 3001; `PIRATA_ORIGIN` defaults to
`https://localhost:5173`. Normal configuration requires an exact HTTPS origin.
The API always binds `127.0.0.1`, trusts no forwarded proxy addresses, and fails
on an occupied port. No service, HTTPS proxy, DNS, firewall or deployment is
created here. An explicitly configured same-origin HTTPS proxy is a later
integration/deployment prerequisite. Do not place DBs or backups in web/public,
dist, source-control, or any served folder. Run under a private service account
when deployed. The process uses umask 077; SQLite files and backups are 0600.

## HTTP and security

- `GET /api/v1/health`: minimal status only.
- `GET /api/v1/session`: creates a short-lived anonymous login-CSRF session or
  returns authenticated status/CSRF/expiry. It contains no business data.
- `POST /api/v1/login`: strict `{password}` body; requires the pre-auth session,
  exact configured Origin, and `X-CSRF-Token`. Successful login rotates both.
- `POST /api/v1/logout`: authenticated, same CSRF/origin checks, empty object;
  revokes the current session and expires its cookie.
- `GET /api/v1/snapshot`: authenticated v2 complete snapshot.
- `POST /api/v1/commands`: authenticated strict mutation envelope.
- `GET /api/v1/export`: authenticated v2 JSON attachment, no auth records.

Every response is `no-store`. Opaque 256-bit cookie tokens are hashed in SQLite;
CSRF tokens are separate, returned only through same-origin JSON and kept in
client memory. Cookie: `__Host-pirata_session`, Secure, HttpOnly, SameSite=Strict,
Path=/, no Domain. Authenticated expiry is absolute 12 hours, pre-auth 10 minutes.
Logout and recovery revoke sessions; login rechecks password version/session
inside its transaction after asynchronous Argon2 verification. Session creation
is limited to 60 per IP/15 minutes; login 10/IP and 30 global/15 minutes. Buckets
are hashed and persisted across process restart; expired buckets are pruned.
No raw password, token, headers, URL parameters or business payload reaches the
safe audit sink, which emits only method/status/event. Proxy trust is disabled,
so behind a loopback proxy IP rate limits conservatively apply to that proxy.

Errors: 400 invalid input, 401 sign-in required/invalid login, 403 CSRF/origin,
404 inaccessible record, 409 revision/idempotency/relationship/business conflict,
413 body >64KiB, 429 rate limit, 501 unimplemented module, 503 storage/internal
contract failure. Errors never expose SQL or stacks. Constraint failures are
409 and write/unavailable failures are 503; both roll back before response.

## Transactions and database upgrades

`src/db/migrations/001-foundation.sql` is the actual numbered DDL.
`schema_versions` records its checksum and application time. Foreign keys,
STRICT tables, WAL, FULL synchronous mode and 5000ms busy timeout are enabled.
No known/unknown database is reset. Unknown databases, future versions, modified
migration checksums and noncontiguous migration history fail closed. A failed
migration rolls back its DDL/data/version record. Startup applies known pending
forward migrations only; run the explicit migration command after a backup as
part of an upgrade. Never edit a migration already applied to real data; append
a numbered migration and review/test restore first.

Command execution owns one `BEGIN IMMEDIATE` transaction. It authenticates and
validates before dispatch, checks canonical request receipt before revision,
executes one synchronous handler using expiring owner-bound repositories,
verifies actual writes match `changed`, increments the owner revision once,
stores the receipt, commits, then returns success. A stale revision writes
nothing. An identical retry replays the original result even after later
revisions; changed content under the same request ID conflicts. The canonical
fingerprint hashes sorted-key JSON after strict Zod parsing, including the
original base revision. Receipts are retained indefinitely in this first wave.
Clients retain the original envelope after uncertain responses and never roll
their accepted revision backward to an old replay.

Handlers must not start/commit transactions, access a separate database, perform
network I/O or return Promises. The typed context has no transaction/SQL escape
hatch. Async functions are rejected before invocation; retained repositories
expire when a handler returns. The tests prove rollback even when a handler
lies about `changed`, returns a disguised Promise or attempts a late write.

## Backup and restore

Backup uses better-sqlite3's SQLite Online Backup API, including committed WAL
contents, into a new file with exclusive creation and 0600 permissions. It
checks `integrity_check` and `foreign_key_check` on the result. Never copy only
the main SQLite file while WAL is active. Backups contain password hashes and
server sessions as well as business data; treat them as private recovery files.

Restore always writes a **new scratch path**, never overwrites a destination,
checks integrity/relationships, validates schema checksums, and applies only
known forward migrations. Tests restore all module relationships, active timer,
and owner revision while the source retains uncheckpointed WAL writes. Review
the scratch restore before a separately authorized live replacement. Recovery
CLI can revoke restored sessions. Retention/off-host backup scheduling and live
cutover belong to later operations work.

## Feature development and isolated tests

Read `../web/implementation/CONTRACT-FROZEN.md` and its foundation handoff first.
Each feature owns its module directory and corresponding tests/UI. Change its
`handlers` functions and `capability` to ready when verified; preserve the
exhaustive command list. Foundation owns core/auth/DDL/contracts/registration.
No dependency installations or migration edits during parallel feature work.

`tests/helpers/fixture.ts` exports `createFixture`, which creates a private
`/tmp/pirata-test-*` DB, random test owner password, real API, owner-bound repo,
`authenticate()`, `envelope(command, baseRevision?, requestId?)`, and `close()`.
Pass `{handlers: {...registeredHandlers, ...moduleHandlers}, now:()=>clock}` to
exercise chosen actual handlers through Fastify injection. Cleanup in afterEach.
The override is trusted in-process test configuration, never an HTTP route.

`pnpm --filter morgan-el-pirata-web test:modules` starts fresh test-only processes:
API on 127.0.0.1:3002 and harness Vite on 127.0.0.1:5174. It never reads a
production DB environment path. Its synthetic test password exists only in
`tests/harness.ts` and `web/tests/modules/helpers.ts`. These files are excluded
from the production server build. Chromium permits Secure cookies on trusted
loopback HTTP; normal server configuration still requires HTTPS.

Module URL:
`/tests/module-harness/?module=clients-projects&view=ClientsView`.
`openModule(page,module,view,selection?)` logs in and mounts the requested
registered UI. Each browser suite owns its fixture data; use unique IDs/names
or create its own independent server fixture for races. No reset endpoint exists.
The harness supplies current snapshot/services/callbacks and real session/API;
feature components can reuse existing native Modal and form helpers.

Verification includes true simultaneous worker-thread SQLite writers, API
injection, schema/relationship violations, auth/recovery, readonly storage,
receipt/interval write faults and interrupted client response retries. Existing
Today browser tests remain on their original isolated local-storage fixture.
WebKit still has previously documented missing host libraries; no Safari result
is claimed and no host packages were installed.

Technical references checked during implementation:
[Fastify server](https://fastify.dev/docs/latest/Reference/Server/),
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3),
[SQLite backup](https://www.sqlite.org/backup.html),
[OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
