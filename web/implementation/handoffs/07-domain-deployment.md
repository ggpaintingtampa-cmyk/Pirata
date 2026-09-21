# Task07 — Domain and production deployment

Status: **HTTPS ACTIVE AND PROTECTED; AUTHENTICATED OWNER/PHONE VERIFICATION PENDING**.
September18,2026UTC. Owner explicitly chose owner-only access.

Canonical scripts/runbook: web/deploy/. DNS A pirata→2.25.184.103 TTL300 saved
through authenticated hPanel and checked against both nameservers and1.1.1.1.
Zone export and original Caddyfile backed up privately. Existing records,
Research Caddy site/services and firewall rules remain intact. Hostinger has no
attached VPS firewall; UFW already allows80/443.

Installed root-owned immutable web/API releases, dedicated pirata user, private
SQLite state, loopback127.0.0.1:3001API, enabled systemd service, daily backup timer.
No live sample seed or owner default. Code/release manifests recorded at
/var/backups/pirata; nonsecret release IDs/checksums in deploy/deployed-release.json.

Warm and stopped-API backups verified, scratch restore passed, API restarted,
DB/WAL permissions remain private. No off-VPS backup destination configured.

## Activation — September18,2026 05:16:45UTC

Owner confirmed secure setup complete. The activation guard verified one owner,
correct credential file permissions and private API health, made a fresh backup,
validated the additive Caddy configuration and reloaded gracefully.

HTTPS now answers at https://pirata.andresinbox.tech with401 for unauthenticated
access. Research returned its expected401 before and after activation. The
original Caddy configuration and access snippet were backed up privately in
`/var/backups/pirata/activation-20260918T051645Z-ead13f40/`.

## Remaining verification

The owner has been asked to open the site on a phone, use outer username owner
and the Pirata password, then sign into the app with the same password. No agent
knows the credential. Actual owner sign-in/app interactions and outside-VPS phone
access remain pending. The external web-fetch tool could not open the gated URL;
a Check-Host API attempt returned403 before creating probes. This is not evidence
of an application outage or completed external verification.

The tested template protects all files and API, strips outer auth upstream,
keeps the API private, enforces CSP/headers, denies private/missing paths and
preserves old hashed assets. Isolated real-Caddy/production-bundle tests passed.
WebKit remains unavailable. Do not mark full deployment verified until owner
access and actual external application behavior have been confirmed.

## Verified live infrastructure results

HTTP308 exact redirect; trusted hostname TLS1.3 with Let’s Encrypt YE2 certificate
valid to2026-12-17T04:18:16Z. Anonymous page, actual JS/CSS, session, snapshot and
health routes all401. Research401 retained. Both authoritative DNS servers and
1.1.1.1 return the intendedA record. API healthy/private3001, Caddy admin private2019,
preview private4173. Caddy/API active+enabled. Daily backup timer active+enabled;
September18 05:21:55UTC scheduled backup exited0. Full details and remaining
owner/device verification are in deploy/deployed-release.json and deploy/README.md.
