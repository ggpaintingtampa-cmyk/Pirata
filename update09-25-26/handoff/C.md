# Chunk C handoff — Sales capture, project lifecycle, facts, files, team roles UI (update 2026-09-25)

Branch `update-2026-09-25/C`, built on top of chunk B. Implemented by Claude on
2026-09-25 following SKILL.md §6. `pnpm build` and `pnpm lint` pass (warnings
only); the server type-check passes; the unit tests below were run once.
Playwright was NOT run.

## What was built

**Server (`server/src/modules/clients-projects`, `server/src/modules/sales`)**
- `project.create`: a **sales rep's** project starts as `draft` and carries
  `salesRepId`; projects created by the office start `scheduled` (no review of
  your own work). Prices need `money.sales`. New fields stored: dates, three
  prices, sales note.
- `project.update`: dates for everyone; prices and sales note only with
  `money.sales` (a worker sending a changed price → 403); completed projects
  are editable by the office only.
- `project.setStatus`: transitions from `PROJECT_TRANSITIONS`
  (draft→sold, sold→scheduled|draft, scheduled→completed, completed→scheduled);
  moving a `sold` project needs `project.review`; sending back to `draft`
  needs a note (stored in `reviewNote`); `soldAt` / `scheduledAt` /
  `completedAt` are stamped.
- `projectFact.save/remove`: anyone edits visible facts; only the office can
  hide a fact, or change/remove a hidden one. `attachment.tag` (lower-cased,
  idempotent) and `attachment.comment` refuse removed files.

**Web**
- Projects list: tabs Drafts / In review / Scheduled / Completed with counts;
  cards show the derived label chip (`ProjectStatusChip`), the client and
  (office) the sales price. "Add project" opens the **capture flow**.
- `features/sales/CaptureFlow.tsx` (also the Add-menu "Project" dialog):
  step 1 client (existing or new with phone) + project name + address; step 2
  the walkthrough: project photos, one task per line (saved immediately),
  per task Rename / Subtask / Photo / Remove; finish with "Send to review"
  or "Save as draft" (reps) or "Done" (office).
- Project page: label chip in the header, `ProjectLifecycle` card (Send to
  review; Approve for scheduling / Send back with a note; "Waiting for
  review"), **Job facts card** (`features/facts/FactsCard.tsx`: client phone,
  address, gate code, job name at the store, client company, company contact,
  pinned paint notes, custom facts; each a `CopyField`; editor with
  hide-from-workers toggles), `SalesBlock` (office: dates, prices, sales note,
  edit dialog), an **Insights** link, and the Complete/Reopen footer only for
  scheduled/completed projects.
- Client page: phone and email are `CopyField`s (no tap-to-call).
- Files: every file row has tags (suggestions before/after/reference/damage/
  receipt/label, free text allowed) and a comment thread
  (`features/files/FileExtras.tsx`); the Files page has an "All tags" filter.
- Team accounts (`features/team/index.tsx`): role selector on create (with
  live caps 2/5/5/10), role change per member, language shown per member,
  reset password and enable/disable as before; the primary owner stays
  protected. `AISettingsView` moved unchanged to `team/aiSettings.tsx`.
- Strings `sales.*`, `facts.*`, `files.*`, `team.*` in English and Spanish.
  Existing clients-projects labels remain English (Spanish sweep).

## Tests
- `server/tests/modules/sales/sales.test.ts` (2 tests: lifecycle + prices +
  snapshot filtering; facts visibility + tags + comments). Existing
  clients-projects, inventory and hours suites still pass.
- No new web unit test (the new components are UI over tested commands);
  no Playwright spec added.

## Deviations / notes for the lead
1. **Draft only for sales reps.** The spec said every new project starts as a
   draft; here office-created projects are `scheduled` immediately so the
   office never reviews its own projects (and existing tests keep working).
2. `project.create` still accepts `clientId: null` at the contract level; the
   capture flow requires a client and the plain project form now labels the
   select "Client" with "Choose a client" first. Tighten in a later cleanup.
3. `projectTemplate.apply` has no button on the project page yet ("Use a
   template" lives on the Templates screen).
4. Client page "Add project" still opens the plain project form with the
   client preset; the capture flow is reached from Projects and the Add menu.
5. Tags are stored lower-cased; the suggestion labels are translated, free
   text is shown as typed.

## For Andres to verify on the phone
As a sales rep: Add → Project, pick a client, name it, take a photo, add
three tasks and a subtask, Send to review. As a manager: Projects → In review
→ open it → Approve for scheduling (or Send back with a note; the rep sees the
note under Drafts). As a worker: open the project, copy the phone from the
facts card, confirm the gate code is hidden when the office marked it so;
open Files, tag a photo "before" and comment on it. As owner: Team accounts
→ add a sales rep and change a worker to manager.
