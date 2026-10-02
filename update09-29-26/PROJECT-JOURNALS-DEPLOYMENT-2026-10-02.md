# Project journals — live October 2, 2026

Privacy follow-up: journals are now visible only to the primary owner account. The shared-journal behavior documented below is historical and superseded by `PRIVATE-JOURNALS-DEPLOYMENT-2026-10-02.md`.

Pirata web `20261002T020010Z-7e7349b5` and API `20261002T020005Z-191744e7` were published from commit `f52adf8` at https://pirata.andresinbox.tech. Migration 006 adds a constrained note kind to project notes. Existing notes retain every original value and default to regular notes.

## Use

- Add → Project journal → choose a project, write text, Save entry.
- On a project page, use Add journal entry (the project is already selected).
- Entries appear at the very bottom, newest first, as centered `yyyy-mm-dd` buttons. Click a date to read the entry; Edit entry changes its original text.
- Multiple entries on the same day are supported. The server records the creation date in Pirata's New York business timezone; editing never changes that date, the project, or original author.
- English and Spanish interface text is included. Journal bodies use the existing translation cache/provider when translation is configured. Original text is preserved. Entries are shared with the project team, up to 4,000 characters each.
- Journal deletion uses the existing restorable project-note Trash behavior. Deleting and restoring a project carries its journals with it.

## Verification

- 15 focused server/migration/collaboration tests, three dictionary tests, TypeScript builds and changed-file lint passed. Three existing Fast Refresh warnings and build chunk warnings remain.
- One Chromium phone workflow verified both creation paths, required fields, persistence across reloads, read/edit, unchanged creation date, multiple entries per day, project isolation, Spanish labels and centered date buttons.
- The sealed API + production web + isolated Caddy smoke passed journal creation/read, authentication, employee access protections, uploads and responsive screens. Fixed the smoke configuration to replace **every** upstream port: the added work-feed route had made its previous single replacement incomplete. The initial smoke login failed its CSRF check; the corrected isolated run passed.
- Live checks: all ten public files match the built checksums, health 200, anonymous snapshot 401, API and backup timer active. No live journal entries were created or read for testing. Full regression suites, WebKit, physical-device and authenticated live-browser tests were not run.

## Backup and recovery

Online backup: `/var/backups/pirata/database/20261002T015756Z-8dd5f2190ec24e75b94de0f359a5984e.sqlite`.

The migration rehearsal and final closed-write deployment independently restored a private backup, checked integrity and relationships, and compared every historical column and row before reopening access. Final pre-migration backup: `/var/backups/pirata/database/20261002T020009Z-8560184dd4cc40958e8896f59f355f60.sqlite`.

Preflight report: `/var/backups/pirata/team-preflight-20261002T015812Z-46119ff9/preflight.json`. Cutover report: `/var/backups/pirata/team-upgrade-20261002T020005Z-191744e7/upgrade.json`.

Previous API: `20261001T124102Z-151800ea`; previous web: `20261002T002351Z-2be6859d`. The previous API does not recognize schema 006. Recovery must follow the paired deployment runbook, preserving any writes made after release; do not simply switch the old API onto the migrated database.
