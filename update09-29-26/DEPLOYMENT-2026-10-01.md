# September update deployed October 1

## Password minimum follow-up

Deployed API `20261001T124102Z-151800ea`, web `20261001T124107Z-592f2cec`: eight-character minimum for owner setup/recovery and team creation/reset, with matching English/Spanish form prompts. Existing passwords keep working; no schema or credential changes. Eight password/team tests, three dictionary tests, server/web builds and changed server-file lint passed. Boundary tests cover eight accepted, seven rejected, reset and login. Live health, anonymous access protection and public file hashes passed. Private report: `/var/backups/pirata/password8-deploy-20261001.json`. Pre-release backup completed. The initial combined deployment rolled code back after a Camino private documentation asset check; the corrected check passed on reactivation.

Live API: `20261001T122711Z-e890d0b7`; live web: `20261001T122716Z-f765bb4e` at https://pirata.andresinbox.tech.

Migration 005 applied using the paired publisher, with a verified DB/files backup, private scratch migration and historical-value preservation check before public access reopened. Recovery report: `/var/backups/pirata/team-upgrade-20261001T122711Z-e890d0b7`.

Validation: production build; 41 focused server tests; 110 web tests; server/web lint (35 non-blocking web Fast Refresh warnings); one Chromium phone daily workflow; live health and anonymous authorization checks; all 10 public release files match local build hashes; Spanish/English sign-in toggle; work-route bearer token reaches token validation; zero service restarts and active backup timer. Full regression suites and WebKit were not run.

Pre-release fixes cover test types/fixtures, stated source-language handling, original text on glossary refresh, 72 missing Spanish error translations, testable store timers, packaged Ask Markdown, worktree-aware dependency sealing and integration bearer-token forwarding.

Automatic content translation remains disabled until model/allowance configuration in Settings → Translation settings. Existing credentials/settings were preserved; no paid provider call was used for testing. Create the intended account's scoped token in Settings → Connections to activate Camino import/completion.

Combined deployment summary: `/home/andre/Personal Files/Camino Pirata Deployment October 1.md`.
