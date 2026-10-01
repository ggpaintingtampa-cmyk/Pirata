# September update deployed October 1

Live API: `20261001T122711Z-e890d0b7`; live web: `20261001T122716Z-f765bb4e` at https://pirata.andresinbox.tech.

Migration 005 applied using the paired publisher, with a verified DB/files backup, private scratch migration and historical-value preservation check before public access reopened. Recovery report: `/var/backups/pirata/team-upgrade-20261001T122711Z-e890d0b7`.

Validation: production build; 41 focused server tests; 110 web tests; server/web lint (35 non-blocking web Fast Refresh warnings); one Chromium phone daily workflow; live health and anonymous authorization checks; all 10 public release files match local build hashes; Spanish/English sign-in toggle; work-route bearer token reaches token validation; zero service restarts and active backup timer. Full regression suites and WebKit were not run.

Pre-release fixes cover test types/fixtures, stated source-language handling, original text on glossary refresh, 72 missing Spanish error translations, testable store timers, packaged Ask Markdown, worktree-aware dependency sealing and integration bearer-token forwarding.

Automatic content translation remains disabled until model/allowance configuration in Settings → Translation settings. Existing credentials/settings were preserved; no paid provider call was used for testing. Create the intended account's scoped token in Settings → Connections to activate Camino import/completion.

Combined deployment summary: `/home/andre/Personal Files/Camino Pirata Deployment October 1.md`.
