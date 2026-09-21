# Task 00 — READY

Verified 2026-09-17. The backend foundation, frozen shared contract and real
harness exist and pass the checks below. Tasks 01–05 can now implement their
owned modules. This does **not** claim those modules or production deployment
are finished. Every feature capability is still blocked and its command handler
returns HTTP501 NOT_IMPLEMENTED until its owning agent implements it.

Contract v2.0.0 aggregate SHA-256:
`6cb713a617dd455d1e17eb6b3e3398438343853592ed482d229478f925f962cf`.
See `../CONTRACT-FROZEN.md` and `../contract-manifest.json`; verify with
`python3 scripts/contract-manifest.py` from canonical Pirata root.

## Implemented changes

- Root pnpm workspace, one lockfile, pinned verified backend/native dependencies,
  strict TypeScript builds and lint. Existing frontend resolved versions retained.
- `packages/domain`: extracted unchanged v1 schemas, commands, selectors and
  pure helpers; original frontend paths remain compatibility re-exports.
- `packages/contracts`: strict schemas for every Task01–05 command, versioned
  DTOs and response schemas, service contracts and validated Today projection.
- `server/src/db`: normalized DDL for every module, forward/checksummed migration
  runner, STRICT tables, safe integer/date/owner-FK constraints, indexes, WAL,
  full synchronous writes, busy timeout, timer and reservation invariants.
- `server/src/auth`: concealed single-owner setup/recovery, tested Argon2id,
  hashed opaque sessions, expiry, revocation, login rotation, persisted rate
  limits, CSRF and exact-origin defenses; no credential defaults or signup.
- `server/src/core`: synchronous atomic revision/idempotency dispatcher, guarded
  owner-scoped typed repositories, rollback, expiring contexts, shared atomic
  task/schedule and task-status/timer-close helpers, consistent v2 snapshot.
- `server/src/app.ts`: session/login/logout/snapshot/commands/export/health,
  bounded bodies, no-store responses, safe failure envelopes and audit logging.
- Five explicitly registered compiled server modules and named UI stubs.
  `web/src/services` and isolated module harness provide real service/props/API
  fixtures without changing App.tsx, Today navigation or the local v1 key.
- Private SQLite Online Backup and scratch-restore commands, integrity checks,
  overwrite refusal and tested WAL/relationship/timer preservation.
- `server/README.md`: exact commands/configuration/paths/upgrades/security/test
  instructions. `server/scripts/verify-operations.py`: reproducible CLI/TTY/
  loopback process verification. `scripts/contract-manifest.py`: freeze checker.

## Actual verification

All commands ran in canonical LargeConcierge source using bundled Node 24.19.0
and pnpm 11.19.0. No live business DB, production credentials or services used.

| Check | Result |
| --- | --- |
| `pnpm build` | PASS — domain/contracts, strict server/source/tests, frontend TS and Vite |
| `pnpm lint` | PASS — server/packages/frontend, zero errors/warnings |
| `pnpm test` backend | 56 passed across 5 files |
| `pnpm test` frontend | 56 passed: original 51 plus 5 service/retry tests |
| existing `test:e2e` | 44 Chromium tests passed, desktop/phone plus 320/768/1280 layout checks |
| isolated `test:modules` | 1 Chromium phone test passed against real authenticated temporary SQLite API; reload/cookie flags/no localStorage verified |
| `python3 server/scripts/verify-operations.py` | PASS — migrate, concealed real-PTY setup/recovery, noninteractive refusal/no default owner, backup, scratch restore/integrity, overwrite refusal, occupied-port rejection, built loopback startup/health/shutdown |
| `python3 scripts/contract-manifest.py` | PASS — frozen shared source matches manifest |
| independent code/schema review | Initial date/nullable-date and changed-flag/lifetime findings fixed and covered by passing regression tests; no remaining concrete foundation blocker found |

The 56 backend cases include real authenticated transactions, identical retry
following a discarded response, changed-payload conflict, stale revision, actual
simultaneous worker-thread SQLite writers, cross-owner relationships, recovery/
logout/expiry, CSRF/origin on every mutation route, rate limits, safe logging,
strict input, write faults, rollback of receipt/interval/scheduled-task creation,
no-op semantics, async/late handler rejection, unknown/future/failed migrations,
restart persistence, and full-table WAL backup/restore with an active timer.

Earlier failures were resolved rather than bypassed: better-sqlite3 13 required
missing `make`; maintained 12.11.1 prebuilt was verified on Node24. Dependencies
and native builds were explicitly approved in project scope. SQLite NULL/date
checks were corrected (including nullable timer/reminder fields). The test build
now supports distributive TimeEntry patches. A hashing assertion was corrected
to compare Argon2 parameters independent of serialization order; installed
hashing/verification then passed. Local browser listeners initially hit sandbox
EPERM, then ran successfully with scoped execution approval.

WebKit/Safari coverage remains unavailable due to previously documented missing
host libraries and was not rerun; no system packages were installed. Public
HTTPS, audience/access policy, integration and deployment remain later work.
The API is loopback only; there is no DNS/firewall/proxy/service change here.

## Preservation and integration

No Git repository existed at the checkpoint. Private pre-change backup:
`/home/andre/Desktop/LargeConcierge/backups/pirata-foundation-20260917T045712Z/`
contains source.tar.gz, source-file SHA256SUMS and archive.sha256 (private
permissions). It contains 93 source/planning files including the original web
lockfile; dependencies, builds, reports, credentials and browser data excluded.

The existing local Today prototype passes its original unit/browser suite.
Its v1 key and semantics are unchanged. The two broad project planning READMEs
remain preserved; web README only explains the new sibling workspace/runtime.
The five blocked feature handoffs remain byte-for-byte unchanged for their
owners to update. Task00 did not edit implementation/README.md or STATUS.md.

Feature agents should reread their numbered packet plus the actual frozen
contract and this handoff. Use the already-created owned module paths, exact
handler keys and named UI exports. Do not create another server/schema/API,
install dependencies, edit migrations/core/auth/contracts/registries, replace
Today wiring, or relocate source. Ask the foundation coordinator for a concrete
shared interface change with a failing example instead of bypassing invariants.
Use server/tests/helpers/fixture.ts and web/tests/modules/helpers.ts. Only change
your own handoff to READY after real persistence and focused UI tests pass.

Task06 owns live store activation/navigation and validated import. Legacy
material/project duplicate requirements need explicit preview handling because
the new normalized pair is unique. Existing clientName/equipmentName fallback
text is preserved. No integration should persist the v2 compatibility projection
under the v1 browser key or silently fall back to a local business database.
