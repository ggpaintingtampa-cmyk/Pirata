# Team version verification — September 18, 2026

Canonical implementation: `/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.
This report supersedes earlier owner-only/home-screen delivery boundaries.

## Evidence

- Workspace strict TypeScript/server/test compilation, Vite build and ESLint.
- 150 server API/domain/security tests and 65 frontend unit tests passed.
  Includes account/AI/subtask/progress/cleanup/files coverage.
- Original browser-local demo: 46 Chromium tests.
- Legacy integrated owner app: 11 Chromium tests, preserving imports, spending,
  stock separation, clients, maintenance, timers, retries and Add behavior.
- Task/planning browser suite: 17 WebKit tests using HTTPS and real Secure cookies.
- New integrated team suite: 2 Chromium and 2 HTTPS WebKit cases covering employee
  accounts, role restrictions, name-only tasks, rapid subtasks, the 25% completion
  example, project Add context, synchronized updates, calendar modes, image/PDF
  uploads, recoverable removal, paint notes/shopping and cleanup.
- Real HEIC fixture converts through authenticated upload into a compatible JPEG.
- Sealed candidate behind isolated real Caddy validates the production bundle,
  CSP, >2MiB photo upload, PDFs, permission-checked downloads and no page errors.
- 25 isolated release/backup/recovery cases exercise file checksums, scratch
  recovery, schema preservation and rollback before reopening public writes.
- A private copy of the production SQLite database migrates with every original
  column/value/record preserved, including business IDs and existing receipts.

## Screenshots

All 320/390/768/1280px phone/tablet/desktop widths were checked for overflow.
Screenshots were saved and visually inspected:

- `screenshots/team-proxy-WIDTH.png`: sealed production bundle Work screen.
- `screenshots/team-calendar-WIDTH.png` and
  `screenshots/team-calendar-webkit-WIDTH.png`: integrated calendar.
- `screenshots/team-files-notes-{chromium,webkit}-WIDTH.png`: file hierarchy.
- `screenshots/team-notes-{chromium,webkit}-WIDTH.png`: pinned supply details.
- `screenshots/team-cleanup-{chromium,webkit}-WIDTH.png`: equipment reminders.
- `../tests/modules/tasks-time/artifacts/`: Work and calendar module screenshots.

The app uses an internal scroll area, so feature screenshots deliberately scroll
the relevant section into view; a page screenshot alone cannot show all content.

## Limitations

WebKit engine coverage uses a private extracted test runtime and local HTTPS;
no host package installation or Secure-cookie weakening was used. No physical
iPhone/Safari camera or actual-device check was available.

No live provider calls ran. Ask remains disabled pending the owner's API key,
chosen model, token rates and allowance. Mocked-provider tests cover allowlisting,
review, Undo, usage reservation and request limits.

Backups remain on the VPS; no off-host destination was configured. See
`../deploy/TEAM-RECOVERY.md` for database/file backup and recovery instructions.
Actual live release IDs and post-deployment results are in
`../deploy/deployed-release.json`.
