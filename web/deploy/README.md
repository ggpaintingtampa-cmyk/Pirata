# Pirata deployment and recovery

The **Work update is live and verified as of September 21, 2026, 17:58 UTC**.
Web `20260921T175808Z-35477776`; API `20260918T081813Z-a8592c71`; schema 002.
The previous web `20260919T015539Z-7075cae7` is retained and checksummed.
See [current backup and rollback](TEAM-RECOVERY.md#current-work-release--september-21-1758-utc),
[release metadata](deployed-release.json) and [Work verification](../WORK-TASKS.md).

## Historical September 19 Figma deployment

The **Figma update is live and verified as of September 19, 2026, 01:55 UTC**.
Web `20260919T015539Z-7075cae7`; API `20260918T081813Z-a8592c71`; schema 002.
The tested frontend implements the revised Figma designs and preserves accounts,
private data and existing API/AI configuration. The previous compatible web
`20260918T155018Z-e47e98e6` is retained and checksummed.

See [historical backup and rollback](TEAM-RECOVERY.md#historical-figma-release--september-19-0155-utc),
[exact deployment record](deployed-release.json) and
[Figma implementation/screenshots](../FIGMA-IMPLEMENTATION.md).

## Historical September 18 design deployment

The **design update is live and verified as of September 18, 2026, 15:50 UTC**.
Web: `20260918T155018Z-e47e98e6`; API: `20260918T081813Z-a8592c71`; schema: 002.
This frontend-only release improves navigation, phone layouts, task capture and
file controls. Existing data, accounts and owner-configured AI settings are
preserved. The compatible previous web release is `20260918T082402Z-61595674`.

Use [the current recovery runbook](TEAM-RECOVERY.md#current-design-release--september-18-1550-utc)
for the verified database/file backup, scratch restore and code-only rollback.
[deployed-release.json](deployed-release.json) records exact hashes and checks;
[REDESIGN.md](../REDESIGN.md) links screenshots and regression tests. Lint/build,
218 unit/API tests, 26 deployment tests, existing browser suites and separate
Chromium/WebKit redesign checks passed. Live HTTPS, private-data protection and
read-only navigation were verified. Physical iPhone/Safari remains untested.

## Historical September 18, 08:24 team deployment

The **team release is live and verified as of September 18, 2026, 08:24 UTC**.
Current web: `20260918T082402Z-61595674`; API: `20260918T081813Z-a8592c71`;
database migration: 002, with 001 unchanged. The final static-only update gives
the browser tab the Work title and a team-workspace description; JS/CSS, API and
data are unchanged. The compatible previous team web release
`20260918T081815Z-82bb2677` is retained with the same API. Separate owner/employee application
sign-in replaces Pirata's old Basic Auth prompt. Business APIs and files remain
private; the public page is the sign-in shell.

The team release uses the migration-aware
[team deployment and database/file recovery runbook](TEAM-RECOVERY.md). That
runbook supersedes the owner-only gate and database-only backup steps below.
Actual release hashes, prior pair, checks and recovery paths are in
[deployed-release.json](deployed-release.json). The remainder of this document
retains historical deployment context; its owner-only access statements apply to
the earlier release.

Final verification passed root build/lint, 150 server tests, 65 frontend unit
tests, 46 demo Chromium cases, 11 legacy integrated Chromium cases, 17 task/calendar
WebKit cases, two new team Chromium and two new team WebKit cases, and 25 isolated
deployment/backup/recovery tests. The sealed candidate passed the real-Caddy smoke,
including employee permissions and photo/PDF uploads/downloads. WebKit coverage is
now available and passed; a physical iPhone/Safari device remains untested.

Live HTTPS, redirects, assets, authenticated read-only Work/Projects/four Calendar
views, anonymous API/file rejection, private-path rejection and Research's 401
all passed. The temporary verification session was revoked. No production test
records or employee accounts were created. All original record values survived
migration; AI remains disabled awaiting owner configuration.

The new release briefly returned a static-page 403 because the private deployment
umask made its static directories 0700. Only those two new static directories
were corrected to 0755, and the publisher now forces these modes with a regression
test. No database rollback occurred, and all final verification passed afterward.

Before migration, the complete backup was
`/var/backups/pirata/database/20260918T081815Z-e71a353a6e7549eba9df70762aa07e84.sqlite`.
The post-deployment scheduled backup operation succeeded with
`20260918T082005Z-a2a46f2e933d44989bc6ff2d594254d1.sqlite` and its file bundle/manifest;
scratch restore passed at `/var/backups/pirata/team-postdeploy-restore-20260918T0820`.
Prior web `20260918T063858Z-771a3541` and API `20260918T050658Z-df2fe6d4` remain
retained, together with the old database and private configuration. Use the team
runbook before recovery; the old API cannot read schema 002.

Screenshots: `web/artifacts/screenshots/team-proxy-{320,390,768,1280}.png` and
the phone/desktop Quick Add images in that directory. All checks originated on
this VPS. Independent external-device access and an off-VPS backup destination
remain unverified/unconfigured respectively.

## Historical owner-only deployment record

Target: **https://pirata.andresinbox.tech**  
Access: **owner-only**, selected by the owner.  
Status as of September 18, 2026 UTC: **HTTPS active; the owner reports successful app use. The Quick Add navigation fix and requested black/grey/white theme are deployed. Device-specific verification remains unconfirmed.**

The application now has an integrated frontend, authenticated API and SQLite
storage. The normal entrypoint uses server records; `/?demo=1` keeps the separate
browser-local sample demo. New server workspaces start empty.

This document supersedes the earlier static-prototype deployment instructions.
Older README/status text describing missing modules, NXDOMAIN or no installed
web server is historical. The final deployment record below must be filled from
actual execution; candidate tests and DNS resolution do not establish a live site.

## Verified preparation

- DNS `A pirata → 2.25.184.103`, TTL 300, is present. Both authoritative
  nameservers, `artemis.dns-parking.com` and `hermes.dns-parking.com`, and the
  independent resolver `1.1.1.1` returned the expected address. Hostinger shows no attached VPS firewall; UFW already allows TCP80/443 for Research. No firewall rules changed. No Pirata IPv6
  record is part of this deployment. Preserve unrelated domain and mail records.
- Caddy already serves Research on this VPS. Preserve its site, configuration
  and service; integrate Pirata into the existing installation.
- Root workspace lint and build passed, with **120 server tests and 63 frontend
  unit tests** passing. The final UI rerun passed **44 original demo Chromium
  cases, two new export cases and eight full-application Chromium cases**.
- The sealed production backend and built frontend passed an isolated smoke
  test through real Caddy. It checked the whole-site page/asset/API gate, private
  path rejection, CSP, sign-in, timer persistence across a backend restart,
  exactly-once pause, purchase creation and reload, and the separate demo preview.
- That Caddy test used disposable data and loopback HTTP. It does **not** verify
  the public hostname's TLS, external reachability, actual owner credential or
  production business records.
- WebKit/Safari remains unverified. The downloaded WebKit browser cannot launch
  without the previously reported `libevent-2.1-7t64`,
  `libgstreamer-plugins-bad1.0-0`, `libflite1` and `libavif16` dependencies.
  Chromium phone-size tests are not an actual-phone or Safari result.

## Source, runtime and release preparation

Canonical workspace: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.
Build as the ordinary development user. Keep the single workspace lockfile.
Production services and files use separately scoped administrative operations.

```bash
export PATH="/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/andre/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata'
pnpm install --frozen-lockfile --prod=false
pnpm lint
pnpm test
pnpm build
pnpm --filter morgan-el-pirata-web exec playwright test --config tests/integration/playwright.config.ts
python3 scripts/contract-manifest.py
python3 server/scripts/verify-operations.py
bash web/deploy/deploy.sh inspect
python3 -B web/deploy/test_release.py
```

The web inspector accepts only the reviewed static build layout. It rejects
symlinks, source/maps, credentials, missing assets, inline scripts and unexpected
files. `dist-checksums.json` describes a candidate, not proof of deployment.

Package a new backend candidate under a previously unused
`/tmp/pirata-server-candidate-<suffix>` path. For example, replace `NEXT` below
with a new identifier:

```bash
pnpm --filter @pirata/server deploy --prod --legacy /tmp/pirata-server-candidate-NEXT
pnpm install --frozen-lockfile --prod=false
python3 web/deploy/seal-backend.py /tmp/pirata-server-candidate-NEXT
```

`seal-backend.py` copies built workspace dependencies into the package and
checks that package links stay inside it. It rejects private data and unexpected
dependency versions. Do not deploy an unsealed candidate or build on production
service startup.

The production-bundle smoke test is run from `web/`:

```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web'
node deploy/proxy-smoke.mjs /tmp/pirata-server-candidate-NEXT
```

It requires the reviewed `pnpm preview` process on loopback port 4173 for its
demo check, and available isolated test ports 5184/3006. It starts a separate
Caddy instance with its admin endpoint disabled, never the production database.

## Production layout

| Path | Purpose |
| --- | --- |
| `/srv/pirata/releases/<WEB-ID>/` | Root-owned static release |
| `/srv/pirata/current` | Atomic pointer to the active web release |
| `/srv/pirata/shared/assets/` | Retained immutable assets for old and new pages |
| `/srv/pirata/api-releases/<API-ID>/` | Sealed backend release |
| `/srv/pirata/api-current` | Pointer to the active backend release |
| `/srv/pirata/runtime/node` | Copied, checksummed production Node runtime |
| `/srv/pirata/operations/backup.py` | Installed backup operation |
| `/var/lib/pirata/pirata.sqlite` | Private live database and adjacent SQLite WAL files |
| `/etc/systemd/system/pirata-api.service` | Dedicated `pirata` service account, loopback API |
| `/etc/systemd/system/pirata-backup.{service,timer}` | Private verified daily backup |
| `/etc/caddy/Caddyfile` | Existing shared configuration; preserve Research |
| `/etc/caddy/pirata-access.caddy` | Owner access gate, root:caddy mode 0640 |
| `/var/backups/pirata/` | Private release manifests, configuration and database backups |

The API listens only on `127.0.0.1:3001`, with exact origin
`https://pirata.andresinbox.tech`. The systemd unit limits filesystem writes to
`/var/lib/pirata`, uses umask 0077 and allows only loopback network access.
Database directories are private; database files and backup manifests are 0600.
No database, credential or backup belongs in a served directory.

## Initial private installation and owner setup

`install-backend.py` is an **initial installer**, not an update tool. It refuses
an existing installation, requires the verified VPS and a sealed candidate, and
does not activate the public Caddy site or choose a password. It backs up the
existing Caddyfile, creates the service account and database, installs both
releases, records manifests, starts the loopback API and enables/runs backups.

After reviewing the candidate and current host state, the initial operation is:

```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web'
sudo python3 deploy/install-backend.py /tmp/pirata-server-candidate-NEXT
```

Record the actual web/API IDs and backup results before proceeding. Do not rerun
the installer to repair a partial or existing installation; inspect the state.

The owner then creates a separate Pirata password in a real interactive terminal:

```bash
cd '/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web'
sudo python3 deploy/setup-owner.py
```

Use **`setup-owner.py`**, not the older `setup_access.py`. The current helper
creates both the application owner and Caddy access gate. It asks for a hidden
15–128 character password twice, stores an Argon2id hash and refuses to replace
an existing owner or access file. It does not activate or reload Caddy.

At the browser's outer gate, use username **`owner`** and this Pirata password.
The application's sign-in then asks for the same password. This is separate from
the hosting account. Do not put passwords or hashes in chat, command arguments,
source, screenshots or logs. Existing-owner recovery requires a reviewed
procedure for both layers: the backend recovery command alone does not update
the Caddy gate.

## Caddy activation and public verification

Back up the current configuration and retain Research. Integrate
`Caddyfile.example` as an explicitly imported Pirata site. It gates the entire
site, including direct assets and `/api/*`, then proxies the API to loopback.
The outer `Authorization` header is removed before proxying. A missing access
snippet fails validation. Do not replace the shared Caddyfile with this example.

After owner setup, the guarded initial activation command is `sudo python3 deploy/activate-site.py`. It backs up and validates the additive configuration, reloads gracefully, verifies anonymous HTTPS rejection and Research, and restores its configuration on failure. It does not supply credentials or verify authorized UI use.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Reload only after owner setup and successful full-config validation. Preserve
the existing Caddy service and private certificate state. Verify the necessary
TCP 80/443 access in both host and applicable VPS firewall rules; retain
administration access and keep API, Vite, database and Caddy admin ports private.
Record actual firewall changes rather than carrying forward old preflight claims.

The CSP retains `script-src 'self'`. Only style attributes receive the inline
exception needed by the UI. There is no directory listing or blanket SPA
fallback. Do not weaken the policy to make a failed test pass.

After activation, substitute an actual release asset and run normal certificate
verification both on the VPS and from an independent external connection:

```bash
bash deploy/verify.sh private --asset /assets/ACTUAL-BUILT-ASSET.js
bash deploy/verify.sh private --asset /assets/ACTUAL-BUILT-ASSET.js --interactive
```

Anonymous private-mode checks intentionally exit 2 with a partial result.
Interactive verification prompts locally and checks the outer gate, assets,
headers and private paths. It does not test application session login or CRUD.
Complete these separately in an authorized browser:

- Verify HTTP redirects, correct-host TLS, anonymous page/asset/API rejection,
  and actual owner sign-in at both layers.
- Exercise dialogs, timer start/refresh/pause, expense save/edit and persistence;
  check for console, CSP and mixed-content errors. Use controlled test records
  only with permission to write them; do not import sample data automatically.
- Verify 390px and desktop layouts; record actual-phone results separately.
- Check service startup enablement, backup timer and latest successful backup,
  Research behavior and private ports. No reboot is needed for these checks.

DNS success and the isolated Caddy smoke test do not replace these public checks.

## Updates and rollback

Treat each deployment as a **web release + API release + compatible database
schema**. Record all three and the prior verified pair. Retained hashed assets
let already-open pages load their files; they do not guarantee old frontend/API
protocol compatibility.

For each update:

1. Build, test, seal and inspect a new pair as above. Back up production data and
   configuration before any migration. Restore the backup into a new private
   scratch database and test the candidate against it.
2. Check the applied migration versions/checksums and candidate compatibility.
   Migrations are forward-only. Never edit an applied migration or reset a
   database to make an older release start.
3. Stage a new root-owned backend release and record its hashes. During the
   coordinated cutover, stop the API if schema or protocol changes require it,
   apply reviewed migrations with that candidate and the private production
   database path, then atomically switch `api-current` and restart the service.
4. Publish the matching web build with `sudo bash deploy/deploy.sh publish`.
   This command verifies files, retains immutable assets and atomically switches
   **only** the web pointer. It does not deploy the API or migrate the database.
5. Run the public checks and record the resulting pair. A failed browser/HTTP
   check needs an explicit rollback; file publishing cannot determine success.

For a reviewed code-only update with identical migration files, use:

```bash
sudo python3 deploy/publish-backend.py /tmp/pirata-server-candidate-NEXT
```

It backs up, stages a root-owned release, records its checksum manifest, switches
the API pointer, restarts and checks health; startup failure restores the prior
API pointer. It refuses changed migration files. This is not automatic protocol
compatibility review or a general paired web/API/schema updater. Do not reuse
`install-backend.py` as an updater.

For a compatible rollback, stop/restart the API as required, restore the recorded
backend pointer and roll back the web release using its verified manifest:

```bash
sudo bash deploy/deploy.sh rollback PREVIOUS_VERIFIED_WEB_ID
```

The web command verifies release and shared-asset checksums before switching. It
does not revert the API, database, DNS or Caddy configuration. The previous API
must be able to read the current database. If a migration prevents that, a
reviewed database recovery or forward fix is required; restoring an older backup
may lose subsequent writes and is never an automatic rollback step.

On first-deployment failure, there may be no earlier pair. Disable only the new
Pirata site or restore only its introduced configuration changes, validate and
reload, leaving Research and unrelated services intact. Keep the private data
and recovery files. Do not reset the host, zone or firewall.

## Backups, exports and browser-demo import

`pirata-backup.timer` is configured for **05:20 UTC daily**, with up to five
minutes of randomized delay and a persistent catch-up run. The initial installer
also requests a backup. Confirm actual service success and record the file;
unit files alone do not prove a working schedule.

```bash
sudo systemctl start pirata-backup.service
sudo systemctl status pirata-backup.service --no-pager
sudo systemctl list-timers pirata-backup.timer --all --no-pager
```

`backup.py` uses SQLite's online backup API, includes committed WAL data and
checks database integrity and foreign keys. Files go to
`/var/backups/pirata/database/` with mode 0600. Never copy only the main live
SQLite file while WAL is active. Database backups contain password hashes and
sessions as well as business records; keep them private.

The backend CLI can verify a restore to a **new scratch path**:

```bash
sudo /srv/pirata/runtime/node /srv/pirata/api-current/dist/cli.js restore \
  /var/backups/pirata/database/ACTUAL-BACKUP.sqlite \
  /var/backups/pirata/NEW-UNUSED-SCRATCH.sqlite
```

This does not replace the live database. Review integrity, schema and records in
scratch before planning a live recovery. Account for session revocation during
recovery. Backup retention currently has no automatic deletion; off-VPS copies,
destination and retention policy still need a recorded operations decision.

The live **More → Data & recovery** screen downloads a credential-free v2
business export. This export is not a complete SQLite backup, and there is no
automatic v2 restore/reset endpoint. Explicit v1 demo import validates input,
shows counts and sample-data warnings, requires confirmation and imports only
into an empty live workspace. Active timers require an explicit carry/discard
choice. Imported client/equipment mappings preserve separate identities; original
browser data and the input file are unchanged.

The original demo uses `morgan-el-pirata:home-prototype:v1` and remains isolated
under `/?demo=1`. Browser storage is origin-specific: localhost, an IP address
and the new HTTPS hostname do not share it. On the original browser/origin, open `/?demo=1`, then Demo → Download demo export; explicitly select that v1 file on the live origin. Never reset or silently
migrate the original data. VPS backups do not back up arbitrary phone
localStorage or downloaded files.

## Deployment record

| Item | Actual result |
| --- | --- |
| Public Pirata activation time | September18,2026 05:16:45UTC; guarded activation passed |
| Audience | Owner-only, selected |
| DNS | A `pirata` → `2.25.184.103`, TTL 300; both authoritatives and 1.1.1.1 verified |
| Active web release ID / manifest | `20260918T063858Z-771a3541`; private manifest `/var/backups/pirata/20260918T063858Z-771a3541.json` |
| Active API release ID / manifest / runtime hash | `20260918T050658Z-df2fe6d4`; private `…-backend.json`; full runtime and web hashes in [deployed-release.json](deployed-release.json) |
| Previous compatible web/API pair | Web `20260918T062638Z-e23356f7` with current API `20260918T050658Z-df2fe6d4`; theme update changes only the frontend |
| Applied database migration versions/checksums | Version 1; checksum in deployed-release.json; integrity/FKs verified |
| Private configuration and DNS export backup paths | `/var/backups/pirata/configuration-before-pirata/{Caddyfile,dns-zone-before.txt}`, private0600 |
| Initial installer / API service checks | Passed; API enabled, restarted, healthy at `127.0.0.1:3001`; root-owned code/private pirata-owned data |
| Owner setup | Completed by owner; account and root:caddy0640 gate validated without disclosing credentials |
| Caddy Pirata snippet / validated shared config | `/etc/caddy/pirata.caddy` explicitly imported; full config validated, graceful reload passed; private activation backup in deployed-release.json |
| Host and VPS firewall changes/checks | No changes. UFW active, existing80/443 allowances. hPanel shows no attached VPS firewall. |
| HTTPS, certificate and gate checks | From VPS: HTTP308→HTTPS, trusted TLS1.3/hostname, Let’s Encrypt YE2 valid through December17,2026 04:18:16UTC; page+JS+CSS+API401. External web fetch unavailable; Check-Host API403 prevented remote probes. Owner reports successful app use; actual device and network not specified. |
| Actual production application/browser checks | Owner reports successful use before this navigation update. Updated authenticated UI tested with disposable integration data; no automated login to production. |
| Actual phone / Safari | **PENDING; WebKit dependencies blocked** |
| Latest verified database backup / scratch restore | Warm/cold service backups and scratch restore passed; paths in deployed-release.json and private initial-verification.json. A further backup succeeded before the code update. |
| Backup timer enabled / next run | Active/enabled; scheduled September18 05:21:55UTC run succeeded(exit0). Next observed September19 05:23:03UTC. |
| Off-VPS backup destination / retention | None configured; local backups retained without automatic deletion |
| Research and unrelated-service verification | Research HTTPS returned its expected401 before and after activation; existing config/services preserved |
| Production rollback exercise | **PENDING; isolated tooling tests are separate** |

The owner retains domain/VPS renewal and recovery access. Caddy manages TLS
renewal, which depends on persistent certificate state, valid DNS, required
network access and the running service. Record actual certificate and renewal
checks after activation. Do not label the deployment complete until the public
checks and deployment handoff are finished.

## Interrupted initial setup recovery

The installer intentionally fails closed on existing owned paths. Inspect the
private release manifests and service journal before recovering a partial
installation; preserve `/var/lib/pirata` and do not rerun by deleting state.
If owner setup was interrupted after the gate file was written but before its
database transaction committed, the gate file may exist with zero owner rows.
While Pirata routing remains inactive, an administrator should privately back up
that file, verify the owner count is exactly zero, move only that incomplete
gate aside, and let the owner repeat setup. Never remove a gate for an existing
owner or expose an unprotected route. A completed setup starts a fresh backup.

`verify-installed.py` exercises warm and cold backups and scratch restore only
before public activation. It deliberately refuses an active Pirata site because
its stop/start check would interrupt use. Use noninterrupting backup checks later.

Installed backup verification also passed with the API stopped and WAL sidecars
absent; the API restarted and DB/WAL ownership remained `pirata`. Nine static
release tests, six isolated backup tests and deterministic concealed-input CLI
checks passed. The latter caught and fixed a prompt-before-echo-disable race;
setup/recovery now restore terminal state on success and cancellation.

VPS expiration displayed in hPanel: **2026-10-11**. No renewal setting was changed.
Confirm domain renewal and external backup coverage separately; neither is
established by this deployment.

## Activation verification checkpoint

Fresh checks after activation confirm trusted hostname TLS1.3 and HTTP308 to the
exact HTTPS URL. Anonymous entrypoint, actual hashed JS/CSS and all checked API
endpoints return401. The API is healthy and listens only on127.0.0.1:3001;
Caddy admin remains127.0.0.1:2019 and Vite preview127.0.0.1:4173. No5173 listener
was present. Caddy/API are active and enabled; the backup timer is enabled and
its scheduled05:21:55UTC run on September18 completed successfully. Research
retains its401 access gate. These requests originated on the VPS; independent
owner phone sign-in and actual production UI/save checks remain unverified.
Caddy manages certificate renewal; a future renewal has not yet occurred.

## September 18 — Quick Add navigation update

Release `20260918T062638Z-e23356f7` changes the live Add workflow only. Back, X,
Cancel and the native dialog cancel action return a child form to Quick Add and
restore focus to its choice. The top-level menu closes normally. Dirty drafts
still require discard confirmation, unresolved saves stay open, and a confirmed
save closes the menu and returns to the workspace.

Lint, build, 120 server tests, 63 frontend tests and 11 integrated Chromium tests
passed. The navigation checks cover all five forms, clean/dirty cancellation,
uncertain save retry, focus and 320/390/768/1280px layouts. Phone and desktop
screenshots are `artifacts/screenshots/quick-add-phone.png` and
`artifacts/screenshots/quick-add-desktop.png`. Native Android hardware Back and
WebKit were not device-tested.

Publishing verified the static assets and atomically switched only the web
release. The production files match the tested build. Trusted HTTPS, exact HTTP
redirect, and anonymous page/new-asset rejection were rechecked from the VPS.
The API, database and access gate were unchanged. For this frontend-only update,
rollback is `sudo bash deploy/deploy.sh rollback 20260918T050659Z-4fc53dc1`; no
backend rollback or database restore is needed.

## September 18 — black/grey/white theme

The owner requested a black page, grey option boxes/cards/dialogs and white
text, based on their supplied phone reference. Theme tokens now cover the
live workspace, sign-in, all feature dialogs and the preserved local demo.
Inputs and native date/select controls use a dark color scheme. Warnings,
errors, selected states and keyboard focus retain readable contrast.

Web release `20260918T063858Z-771a3541` passed lint/build and all 11 existing
integrated Chromium checks. A separate built-output preview exercised sign-in,
sample import, all five navigation pages, three dialog families and Quick Add
using disposable data. Phone/desktop screenshots were inspected; no page errors
or horizontal overflow were observed. Main examples are
`artifacts/screenshots/live-today-phone.png`, `dark-today-desktop.png`,
`dark-add-menu-phone.png` and `quick-add-phone.png` in the same directory.

The deployed files match the tested build. Trusted HTTPS, exact HTTP redirect
and anonymous page/new-CSS rejection passed from the VPS. Production login was
not automated. API, data, access configuration and DNS are unchanged.
Frontend rollback: `sudo bash deploy/deploy.sh rollback 20260918T062638Z-e23356f7`.
