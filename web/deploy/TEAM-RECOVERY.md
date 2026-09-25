# Team release: deployment and recovery

This runbook supersedes the historical owner-only access and database-only backup
instructions for the team release. `deployed-release.json` records what is
actually deployed; source files alone do not establish production status.

## Current team update release — September 25, TBD-TIME UTC

Web `TBD-WEB` and API `TBD-API` are live and verified with schema 003
(`003-update-2026-09-25.sql`). This release adds four roles (owner, manager, sales,
worker), the Daily page with ordered day lists and the three-level task tree,
questions, day notes, nested templates, work shifts with approval and pay rates,
the Daily report, Hours and Project insights pages, CSV exports, the sales capture
flow with review gate, job facts, file tags/comments, materials requests, tool
sign-outs with per-person cleaning cycles and broken reports, the installable app
shell (manifest, service worker, icons), sliding 30-day sessions and Spanish.
Accounts, credentials, business data, uploads, timers and AI configuration were
preserved; the migration adds tables and columns only. The legacy role `employee`
and project status `open` remain stored unchanged and are read as `worker` and
`scheduled`.

Before publication, the complete online backup was:
`/var/backups/pirata/database/20260925T144917Z-cb173e39e9ac402caad4a4057e202409.sqlite`,
plus its matching `.files` and `.manifest.json`. The noninterrupting preflight
(`team-preflight-TBD-PREFLIGHT`) migrated a scratch copy of that backup with the
candidate CLI and compared every historical column and row. The cutover repeated
the check with the fresh closed-window backup recorded in
`/var/backups/pirata/team-upgrade-TBD-UPGRADE/upgrade.json`; the pre-migration
database and sidecars are retained in `/var/lib/pirata/upgrade-recovery-TBD-UPGRADE/`.

The previous compatible pair is web `20260921T175808Z-35477776` with API
`20260918T081813Z-a8592c71` on schema 002. The old API rejects schema 003, so a
code-only rollback of this release is not compatible with the migrated database;
recovery of the old state follows the full procedure below (close writes, back up,
restore the retained pre-migration database and uploads, select the old pair).

Root build/typechecks, lint, 176 server/API tests, 87 frontend tests, five team
Chromium cases, six integrated cases, 46 demo cases, the scoped module harness,
11 release, 5 team-release and 10 backup tests, the sealed candidate smoke and
CLI operations passed. The Caddy snippet now also serves `/manifest.webmanifest`,
`/sw.js` and `/icons/*` and allows `manifest-src`/`worker-src 'self'`.

Post-publish verification: TBD-VERIFY

## Historical Work release — September 21, 17:58 UTC

Web `20260921T175808Z-35477776` is live and verified. API
`20260918T081813Z-a8592c71` and schema 002 are unchanged. This release adds Work
assignment/Today and status filters, owner person groups and reassignment, and
dedicated subtask details/editing. Accounts, credentials, business data, uploads,
timers, daily plans and AI configuration were preserved.

Before publication, the complete online backup was:
`/var/backups/pirata/database/20260921T175358Z-94952f085437492caab156aa8e9d7493.sqlite`,
plus its matching `.files` and `.manifest.json`. Scratch restore with the current
API passed at `/var/backups/pirata/work-tasks-restore-20260921T175358`. There were
zero uploaded files in this production snapshot; populated-file recovery remains
covered by the passing isolated backup tests.

The previous compatible web release and its shared assets passed checksum
verification. Roll back this frontend update from the canonical project root:

```bash
sudo -n bash web/deploy/deploy.sh rollback 20260919T015539Z-7075cae7
```

Keep the live API, database and uploads. Do not restore an older database simply
to undo this frontend change. The existing full database/file recovery procedure
below remains applicable for disaster recovery.

Root build/typechecks, lint, 150 server/API tests, 75 frontend tests, five team
cases in each of Chromium and WebKit, 11 integrated cases, all 12 redesign cases
(split to respect sign-in limits), 25 deployment/backup/recovery tests and CLI
operations passed. The historical frozen-contract manifest still reports drift
from the earlier team implementation; its differing files match Git HEAD and
were not edited here. See [Work verification](../WORK-TASKS.md) for details.

Post-publish verification passed trusted HTTPS, all four exact build hashes,
owner Work task totals and filters, read-only navigation, anonymous business and
file rejection, private-path rejection, and the unrelated Research 401 gate.
API, Caddy and the backup timer remain active/enabled. The temporary verification
session was revoked. No production business records were changed for testing.
Screenshots at 320/390/768/1280 are in `web/artifacts/work-tasks/`.
Physical iPhone/Safari and actual production password entry were not exercised.

## Historical Figma release — September 19, 01:55 UTC

Web `20260919T015539Z-7075cae7` is live and verified. API `20260918T081813Z-a8592c71` and
schema 002 remain unchanged. The prior compatible web `20260918T155018Z-e47e98e6`
and its retained shared assets passed checksum verification. Data, accounts,
passwords, timers and AI settings were preserved.

Before publication, the complete verified backup was:
`/var/backups/pirata/database/20260919T015117Z-c077de3f0803479f95eec81971390345.sqlite`,
plus matching `.files` and `.manifest.json`. Scratch restore with the current
API CLI passed at `/var/backups/pirata/figma-restore-20260919T015117`. This backup had zero live
uploads; isolated tests verified populated photo/PDF/preview recovery and refusal
of missing, tampered or symlinked files. Keep the full bundle together.

For this release, rollback only the web pointer from the project root:

```bash
sudo -n bash web/deploy/deploy.sh rollback 20260918T155018Z-e47e98e6
```

Do not restore an older database to undo this design release. Both web releases
use the existing team API/schema 002. The publisher's rollback tests and retained
release checksum verification passed; no unnecessary production rollback was run.
For a full database/file recovery, use the existing bundle procedure below.

Final HTTPS checks, exact live asset hashes, authenticated read-only navigation,
Add/Back, private API/file rejection, and Research 401 all passed. API, Caddy and
backup timer remain active/enabled. The temporary owner verification session was
revoked. No business records or employee accounts were added by live verification.
Physical iPhone/Safari and paid AI provider calls were not exercised.

Lint, root build and final frontend build passed; 150 server/API and 69 frontend tests,
26 deployment/backup/setup tests, existing module/integration/demo suites, 12 redesign
checks per engine, and 4 team checks per engine passed. See
[FIGMA-IMPLEMENTATION.md](../FIGMA-IMPLEMENTATION.md) for screen mapping, commands
and screenshots. Complete metadata is in [deployed-release.json](deployed-release.json).

Source recovery: `backups/before-figma-20260919T014254Z/` under the canonical project
contains `source.tar.gz`, the verified baseline hashes and `integration.json`.
The release rollback above does not alter source files or business data.

## Historical design release — September 18, 15:50 UTC

Web `20260918T155018Z-e47e98e6` is live. API
`20260918T081813Z-a8592c71` and schema 002 are unchanged. This is a frontend-only
release: no business data, account identities, credentials or AI settings were
changed. HTTPS, exact live asset hashes, authenticated read-only navigation,
task/file controls, all four calendar views, anonymous API/file rejection,
private-path rejection and unrelated Research access were verified. The temporary
owner verification session was revoked.

The previous compatible web release `20260918T082402Z-61595674` is retained.
For this design release only, a code-only rollback keeps the current API,
database and uploads:

```bash
sudo bash web/deploy/deploy.sh rollback 20260918T082402Z-61595674
```

Do not restore an older database merely to undo this frontend release. The
publisher's rollback checks passed in isolated deployment tests. The earlier
pre-team API is still incompatible with schema 002.

Immediately before publication, a complete verified backup was created at
`/var/backups/pirata/database/20260918T155003Z-cca5918303d54d4bb74d238998aa1c18.sqlite`,
with its matching `.files` directory and `.manifest.json`. Restore using the
current API CLI passed in `/var/backups/pirata/redesign-restore-20260918T155003`.
It contains no live attachments; populated image/PDF recovery remains covered
by isolated tests. Keep all three backup components together.

Validation passed lint/build, 150 API/server and 68 frontend unit tests, 26
deployment/backup/recovery tests, existing browser suites, and eight redesign
cases each in Chromium and WebKit. Responsive screenshots cover 320/390/768/1280.
See [the redesign guide](../REDESIGN.md) for evidence and test commands. Actual
iPhone/Safari hardware was unavailable. No paid AI calls were made; the owner's
existing configuration is preserved.

## Private team access

The owner and employees sign into the application with separate accounts. The
login shell and its static assets are public; business APIs, previews, downloads,
updates and AI operations authenticate the application session. The owner creates,
resets and disables employees in Menu → Team accounts. Employees never receive
the owner's password. Existing owner credentials and business namespace survive
the migration. The owner's current username is `andre` (changed from `owner` on
September 18); display name `Andres`, password, account IDs and business namespace
are unchanged. Username recovery must preserve the existing `team_members.id`
and `owner_id`; do not create a replacement business. Historical backups can
contain the earlier username.

`Caddyfile.team.example` replaces only `/etc/caddy/pirata.caddy`. The shared
`/etc/caddy/Caddyfile`, Research site, DNS, firewall and administrative access are
unchanged. The old `/etc/caddy/pirata-access.caddy` stays private for rollback but
is no longer imported by Pirata. The proxy permits 27 MB requests; the API enforces
20 MiB per image and 25 MiB per PDF, actual content validation and authenticated
access. Uploads are never served directly from Caddy.

## Configuration

Production state stays in `/var/lib/pirata` under the `pirata` account:

- `pirata.sqlite` and its WAL/SHM files hold the database.
- `uploads/` holds immutable photos, previews and PDFs. Removing an attachment
  marks it removed in the database and retains recoverable bytes.
- `PIRATA_UPLOADS_PATH` can configure upload location, but production uses
  `/var/lib/pirata/uploads`. A different location also requires an explicit
  backup-path and systemd write-path update; changing only the variable would
  leave incomplete recovery coverage.
- `PIRATA_STORAGE_LIMIT_BYTES` sets the shared storage allowance. The application
  default is 2 GiB; increasing it does not change individual file limits.

AI credentials are server-only. Leave live calls disabled until the owner has
set both a key and usage allowance. The API service initially permits loopback
networking only, so the AI configuration procedure must deliberately enable its
outbound HTTPS access. Do not put a key in command arguments, VITE variables,
source control, logs or chat. See the main application documentation for the
current secret file and model configuration procedure.

## Build and preflight

Use the bundled Node/pnpm runtime and root lockfile as in README.md. Run root lint,
test and build, relevant API/browser suites, and these isolated operation checks:

```bash
PIRATA_TEST_CLI='/srv/pirata/api-current/dist/cli.js' python3 -B web/deploy/test_backup.py
python3 -B web/deploy/test_team_release.py
python3 -B web/deploy/test_release.py
bash web/deploy/deploy.sh inspect
```

Create a new sealed backend candidate; never reuse an old candidate directory:

```bash
pnpm --filter @pirata/server deploy --prod --legacy /tmp/pirata-server-candidate-UNIQUE
pnpm install --frozen-lockfile --prod=false
python3 web/deploy/seal-backend.py /tmp/pirata-server-candidate-UNIQUE
```

Run the integrated built frontend/backend/Caddy smoke on disposable data before
cutover:

```bash
cd web
node deploy/proxy-team-smoke.mjs /tmp/pirata-server-candidate-UNIQUE
```

Check the actual migrations against copies with historical records;
`001-foundation.sql` must retain its exact applied checksum.

For a noninterrupting production preflight, create a fresh complete online backup
and point the candidate checker at the actual resulting SQLite path:

```bash
sudo python3 web/deploy/backup.py
sudo python3 web/deploy/preflight-team.py \
  /tmp/pirata-server-candidate-UNIQUE \
  /var/backups/pirata/database/ACTUAL-BACKUP.sqlite
```

The checker privately copies current Pirata configuration, restores database/files
into a new scratch directory, migrates that copy and compares historical records.
It does not stop services or modify live data. Final cutover repeats these checks
with a newer backup after public writes are closed.

## Paired migration cutover

After the integrated candidate has passed tests, invoke only the scoped updater:

```bash
sudo python3 web/deploy/publish-team.py /tmp/pirata-server-candidate-UNIQUE
```

The updater stages immutable API files and records their hashes. It temporarily
answers 503 only for Pirata, stops its API, and creates a fresh verified database
and upload backup. It then restores that backup into a new scratch directory using
the candidate CLI, which applies pending migrations. Every historical column and
row is compared against the original snapshot; changed IDs, lost rows or changed
business namespaces fail the operation. Foreign keys and database integrity must
also pass.

The previous live SQLite file and sidecars move together into
`/var/lib/pirata/upgrade-recovery-<ID>/`. The tested migrated copy becomes the new
database, the matching API and web releases are selected, and private health and
anonymous API/file rejection are checked. Only then is the team Caddy snippet
loaded. The updater installs the new backup operation and the reviewed Pirata
service unit. It does not replace shared Caddy configuration or other services.

Each attempt records private details in
`/var/backups/pirata/team-upgrade-<ID>/upgrade.json`, together with the original
Pirata site, shared Caddyfile, unit, old access gate, backup operation, and migrated
scratch database/files. Previous static and API releases remain in `/srv/pirata`.

Before public access is opened, failures restore the previous API, web, database
and configuration automatically. Once opening the site has been attempted,
automatic database rollback is disabled: new writes might already exist. A
subsequent failure is reported as requiring review and preserves the new data.

## Database and file backups

The existing daily timer remains in effect. `backup.py` first uses SQLite's online
backup API as `pirata`, preserving committed WAL data. It copies every original
and preview file referenced by that snapshot, including removed attachments.
Unfinished uploads are excluded. Uploaded bytes must be immutable and committed
to disk before their database row; a missing, changed or linked file rejects the
backup. The completion marker is a manifest published after all files verify.

A complete backup consists of all three siblings in `/var/backups/pirata/database/`:

```text
<timestamp>-<token>.sqlite
<timestamp>-<token>.files/
<timestamp>-<token>.manifest.json
```

Copy all three together for off-host recovery. The manifest contains database and
file checksums. All paths remain private, backups contain credential hashes and
sessions, and no automatic retention deletion is enabled. Off-VPS destination and
retention remain unconfigured; do not describe local backup as off-host protection.

Verify recovery into a new unused private directory:

```bash
sudo python3 web/deploy/restore-bundle.py \
  /var/backups/pirata/database/ACTUAL-BACKUP.sqlite \
  /var/backups/pirata/NEW-SCRATCH-DIRECTORY \
  --node /srv/pirata/runtime/node \
  --cli /srv/pirata/api-current/dist/cli.js
```

This checks hashes, file bytes, database integrity and relationships, and applies
only known forward migrations with the selected CLI. It never overwrites live
data or an existing scratch directory. Omit `--node`/`--cli` to verify and recover
the exact backup without migration. Historical pre-team `.sqlite` backups lack
file manifests and use the older CLI scratch-restore procedure; they contain no
team uploads.

## Recovery after the site has opened

Prefer a forward fix preserving new records. If an older release is compatible
with the current schema, a reviewed code-only rollback can retain the database.
The original single-owner API rejects the upgraded schema and cannot be started
against it. Rolling back only the web pointer does not restore compatibility.

If a full old-state recovery is necessary, close Pirata writes, stop the API,
create a fresh complete backup of the current state, and record the cutoff time.
Restore the chosen database **and its corresponding upload bundle** into a new
scratch directory and verify with the matching release. Review all writes after
the chosen snapshot before replacing anything: restoring an older state excludes
those later records. Keep the newer database/uploads and every backup for
reconciliation. Move live SQLite/WAL/SHM together, select the recorded compatible
web/API pair and matching Pirata site/unit, set state ownership to `pirata` with
0700 directories/0600 files, and revoke restored sessions before reopening. Use
the reviewed owner credential recovery flow if restoring the historical Basic
gate; never print credentials. A scratch restore is not a live cutover command.

## Post-deployment verification

```bash
bash web/deploy/verify.sh team --asset /assets/ACTUAL-NEW-BUILD.js
```

Verify trusted HTTPS, exact HTTP redirect, public sign-in shell, anonymous 401 for
snapshot/export/download, and private-path 404s. Verify owner and employee sign-in,
server authorization, independent timers, uploads/downloads, and live updates
through the actual application. Confirm Pirata API remains loopback-only,
Research still answers its expected 401, services remain enabled, and a new
complete bundled backup restores successfully. Update `deployed-release.json`
with actual results and retained prior release/recovery paths.

Phone-sized Chromium screenshots do not establish Safari compatibility. Record
WebKit results separately; an unavailable Safari or physical iPhone check remains
an explicit verification limitation.

The read-only production browser check can be repeated from `web/` with the bundled
Node runtime:

```bash
node deploy/verify-live-team.mjs
```

It uses a scoped `sudo -u pirata` subprocess to mint one five-minute owner session,
passes the cookie only through private process memory, and revokes the session in
`finally`. It prints neither credentials nor business records, captures no live
screenshots/traces, and blocks non-GET business requests. This validates application
access and navigation but does not test the owner's actual password entry.

## Historical September 18, 08:24 team release

Web `20260918T082402Z-61595674` and API `20260918T081813Z-a8592c71` were verified with
schema 002. The previous compatible team web release is
`20260918T081815Z-82bb2677`, with the same API; only HTML title/description changed
in the final static update. The pre-migration pair is web `20260918T063858Z-771a3541` and API
`20260918T050658Z-df2fe6d4`. Every original database column/value compared equal
in the migrated copy; namespace and record IDs were retained. Final checks
verified HTTPS, application access, owner read-only Work/Projects/Calendar,
anonymous business/file denial, private-path 404s, active/enabled services,
loopback ports and Research's existing 401.

Private configuration/manifests and the migrated scratch state are under
`/var/backups/pirata/team-upgrade-20260918T081813Z-a8592c71/`. The exact closed-window
backup is `/var/backups/pirata/database/20260918T081815Z-e71a353a6e7549eba9df70762aa07e84.sqlite`.
Original SQLite files are retained in
`/var/lib/pirata/upgrade-recovery-20260918T081813Z-a8592c71/`.

The installed daily backup operation successfully produced
`/var/backups/pirata/database/20260918T082005Z-a2a46f2e933d44989bc6ff2d594254d1.sqlite`
plus its `.files` directory and `.manifest.json`. Its exact scratch restore passed
at `/var/backups/pirata/team-postdeploy-restore-20260918T0820`. There were no live
attachments yet; populated photo/PDF backup, preview, tamper, missing-file and
recoverable-removal behavior passed isolated tests. No production business test
records or employee accounts were created.

Twenty-five isolated deployment tests passed, including pre-open rollback,
post-open preservation of new state, WAL-aware backup, and DB/file restore.
The deployment's private umask initially restricted new static release directories
to 0700; the observed 403 was fixed by setting only those directories to 0755.
The publisher now explicitly enforces static directory modes and has a regression
test. New database writes were never rolled back. The preceding historical
production pair remains recoverable with its matching schema/data backup.

Final application coverage includes 150 server and 65 frontend unit tests, 46
demo Chromium, 11 legacy integration Chromium, 17 task/calendar WebKit, two new
team Chromium and two new team WebKit cases. The sealed real-Caddy smoke passed
with a photo larger than the old 2 MB proxy cap and a PDF. Screenshots at
320/390/768/1280px were inspected. Playwright WebKit is a separate passed result;
the physical iPhone/Safari device check remains unavailable. AI awaits the owner's
key and allowance; no paid live provider calls were made.
