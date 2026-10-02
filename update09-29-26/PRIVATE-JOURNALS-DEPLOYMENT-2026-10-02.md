# Private project journals — October 2, 2026

Live API `20261002T021530Z-6a74c2b2`, web `20261002T021533Z-62c76e2e`, code commit `b8efc6c`.

Project journals now belong exclusively to the primary owner account (authenticated user ID equals the business owner ID, with owner role). This includes entries saved before this update, regardless of their original author. Regular paint/project notes remain shared.

The server excludes journals from other accounts' snapshots, search, translations, JSON exports, journal activity, Trash and journal-related batch summaries. Saved Ask Find responses are filtered against current visibility before being returned. Creation/edit authorization runs before command-receipt replay; direct journal deletion/restoration and reuse as a shopping source are also blocked. Project deletion/restoration still carries its records together without exposing private journals.

The server supplies a journal-visibility flag. Non-owner screens hide the journal section, Add menu entry and journal dialogs. English/Spanish copy now explains that entries are private.

Validation: 17 focused server/privacy/journal/Trash/Ask tests, three dictionary tests, TypeScript builds and changed-file lint passed. Role cases include worker, sales, manager and a second owner account; they also cover previously authored journals and previously cached AI/translation results. The owner phone browser workflow passed. The sealed backend, built frontend and isolated Caddy smoke confirmed employee API and UI exclusion plus owner API access. Existing Fast Refresh and build warnings remain.

Live checks: all ten public files match the build, health 200, anonymous snapshot 401, API and backup timer active. No live journal content was used in testing. Full regression suites, WebKit and authenticated live-browser tests were not run.

No new migration or record rewrite. The paired publisher verified a fresh database/upload backup and preserved every historical row and value. Backup: `/var/backups/pirata/database/20261002T021532Z-71f1bf20e7914bf88bd1f35992580829.sqlite`. Release report: `/var/backups/pirata/team-upgrade-20261002T021530Z-6a74c2b2/upgrade.json`.

Previous API/web: `20261002T020005Z-191744e7` / `20261002T020010Z-7e7349b5`. Reverting those releases would re-enable shared journal access; preserve the privacy guards in any rollback. Already-viewed information cannot be recalled; the update restricts subsequent access. Reload Pirata for the updated interface.
