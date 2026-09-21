# Task 07 — Pirata domain, access and deployment (stronger AI)

Run as a dedicated **Server Upkeep** task. This packet preserves the owner's
September 17 deployment requirements. Read LargeConcierge/AGENTS.md,
Pirata/web/README.md, web/deploy/README.md and implementation/STATUS.md first.
Recheck all live settings; observations are not permanent facts.

## Target and scope

Deploy existing built Today app at https://pirata.andresinbox.tech on the
Hostinger VPS srv1972305.hstgr.cloud / 2.25.184.103. Canonical source:
`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/web/`.
Do not relocate source or serve Vite. Initial static release remains a local
browser demo; later backend release needs Task 06's READY FOR DEPLOYMENT gate.

Verify hostname, public interface, user, services, containers, effective host and
Hostinger firewalls, relevant proxy configs and disk before changes. Current
preflight found no web listener/container and passwordless sudo available after
scoped tool approval. Existing public Remote Desktop rule and password-enabled
root SSH need assessment; don't break administration or call them secured.

## Access prerequisite

Read the owner's answer in the coordinating task: owner-only versus explicitly
public fabricated demo. If unanswered, prepare independent work and ask once
before exposure. Owner-only protects page AND assets with server-side auth.
Use separate app credential via secure interactive input, not Hostinger login.
For static release Caddy Basic Auth is acceptable; generate hash through its
interactive facility and keep config root:caddy 0640 outside source/web root.
Never put passwords/hashes in chat, shell arguments, screenshots, source or logs.
Don't ask the owner to paste a credential into chat. Basic Auth isn't data sync.

## DNS and hPanel

Use visible hPanel UI; existing sign-in may be shared or may require direct user
login. Never extract cookies or request an API token for this workflow.
https://hpanel.hostinger.com/domain/andresinbox.tech/dns
https://hpanel.hostinger.com/vps

Export zone before mutation; private backup outside web root. Reread A/AAAA/
CNAME/wildcard/CAA and nameservers. Create/reuse only A pirata -> 2.25.184.103,
TTL300 if accepted. Preserve @/www/mail/nameservers/unrelated records. No pirata
AAAA until IPv6 routing/firewall/web serving verified. No DNS reset, nameserver
change, purchase or DNSSEC disable. Confirm authoritative artemis and hermes
dns-parking.com and a public resolver agree; hPanel save alone is insufficient.

## Build/release/server

Use the bundled runtime PATH from web README. Build as andre with frozen lockfile
if installation needed; run lint/test/build. Inspect dist. Only index.html,
favicon.svg and reviewed hashed assets go to `/srv/pirata/releases/<UTC-ID>/`.
Copy dist CONTENTS. Reject source/maps/.env/backups/unexpected files and symlinks.
Use root-owned 0755 dirs/0644 files readable, not writable, by web server.
Keep private manifests/config backups in `/var/backups/pirata/`.
Switch `/srv/pirata/current` atomically; retain rollback release and checksums.
Keep old /assets URLs reachable across new deploy AND rollback; merely retaining
a previous release directory is insufficient. Review the deploy.sh implementation.

If no web server owns80/443, install Caddy from its official supported apt source
with required approval; use its managed service. Back up existing configs first,
preserve other sites and explicitly import snippets. Root /srv/pirata/current,
domain pirata.andresinbox.tech, no directory browsing or blanket SPA fallback.
Keep Caddy administration on loopback and certificate state private/persistent.

Review Caddyfile.example: whole-site auth before file handling, strict script
policy, inline style attributes allowed only as needed for existing progress
bars, nosniff/frame protection/referrer policy, conservative cache. Validate
actual config before enabling/reload. Missing/private paths are errors even
after auth. Add HSTS only after HTTPS verified; no domain-wide preload policy.

Open only required TCP80/443 in host and applicable Hostinger firewall, preserve
SSH/VPN access and outboundDNS/HTTPS. Do not expose5173/4173/3001/database/Codex/
desktop/admin interfaces. Existing exposure is a separate finding, never silently
claimed fixed. Do not disable/reset firewall or reboot shared VPS.

## Verification and rollback

Outside-VPS checks: correct DNS, HTTP->HTTPS, valid certificate/hostname,
unauthenticated page AND direct assets rejected in private mode, authorized
Today and assets actually load, no console/mixed content/CSP errors, dialogs/
timer/expense/refresh persistence, missing assets/private files not served,
required ports work and private services remain protected. Test phone-sized UI
and actual phone access if owner can verify; distinguish them in report.

Check managed startup enabled and certificate renewal arrangement. Existing
services still work. No reboot for testing. On failure restore only own release/
config changes, leaving unrelated services intact. Document exact rollback and
update commands. A template validation isn't proof of public HTTPS or auth.

Record in web/deploy/README.md: liveURL/access withoutsecrets, releaseID/checksums,
paths, exact DNS/firewall changes, verified/blockers, update/rollback, renewal
responsibilities, backups and origin-specific localStorage limitations. HTTPS
origin gets separate records; don't reset or silently migrate old demo storage.

For later backend deployment, add private managed pirata-api service and database,
same-origin /api proxy, tested sessions/CSRF/authorization, migrations and backups
from Task06. Preserve the static gate until replacement access control is fully
tested; don't silently make an owner-only site public while changing auth.

Write implementation/handoffs/07-deployment.md. Claim live only after external
HTTPS and actual application behavior verification, and disclose remaining limits.
