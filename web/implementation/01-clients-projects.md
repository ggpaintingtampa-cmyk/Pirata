# Task 01 — Clients, Leads and Projects (Codex Spark)

Implement a working module, UI and tests after the foundation gate.

## Start gate and shared rules

Use the LargeConcierge project. Root:
`/home/andre/Desktop/LargeConcierge/Morgan el Pirata/`.
Read `/home/andre/Desktop/LargeConcierge/AGENTS.md`, project README,
`web/README.md`, `web/implementation/SHARED-CONTRACT.md`,
`web/implementation/CONTRACT-FROZEN.md`, and foundation handoff
`web/implementation/handoffs/00-foundation.md`.
If frozen contracts or a READY foundation are missing, report that dependency;
do not scaffold an alternative backend or invent interfaces.

Implement only your owned paths below. Use the frozen handler/service interfaces,
shared transaction/validation/auth/revision/idempotency helpers and UI harness.
Do not modify lockfiles, migrations, auth, global CSS, App.tsx, Today wiring,
central registration or other agents' files. Put needed shared changes in your
handoff for the coordinator. No deployment or system changes. No new dependencies
unless the coordinator incorporates them. Do not send client messages or emails.

Every write is authenticated, owner-scoped, validated server-side and atomic.
Use stable request IDs. Server controls timestamps for ordinary actions. On
failure keep drafts and old saved state. Reuse existing cents/date/material/time
semantics. Use real SQLite/injection tests plus focused browser tests, with
isolated fixtures. Do not test mutations against live business data.

## Owned paths

- server/src/modules/clients-projects/**
- server/tests/modules/clients-projects/**
- web/src/features/clients-projects/**
- web/tests/modules/clients-projects/** (harness supplied by foundation)
- web/implementation/handoffs/01-clients-projects.md

## Build in this order

1. Client create/update/archive/unarchive handlers. Name 1–100 trimmed, optional
   human-readable phone, email validated only when entered, note max 1000.
   Archived records stay linked and visible in historical project details.
2. Lead create/update and follow-up handlers. Follow-up requires a trimmed note;
   optional next date, empty explicitly clears reminder. Preserve follow-up
   history. Atomic convert-to-client is explicit and idempotent; retain source
   lead and its history using the frozen conversion linkage.
3. Project create/update/complete/reopen handlers: title 1–160, optional client,
   address max 300, note max 1000. General business belongs to tasks/expenses,
   not a fabricated project. Preserve old clientName display mapping on import.
4. Clients view: searchable saved clients/leads, record details, edit actions,
   due follow-ups, optional contact details displayed as text. Project view:
   open/completed filter, create/edit, job details with client/address/notes.
5. Project details read task, duration and purchase totals from the shared
   snapshot/selectors; retain integer calculations. Do not add profit, invoices,
   payment status or duplicate totals to storage. Task/time/expense interactions
   use callbacks supplied by the coordinator rather than duplicating their forms.

Frozen command names: client.create, client.update, client.archive,
lead.create, lead.update, lead.followUp, lead.convertToClient,
project.create, project.update, project.setStatus. If contracts use different
names, use the frozen names and report the mapping.

## Business rules

Completing a project does not finish tasks, stop timers, delete blocks, delete
purchases, or release stock automatically. Show remaining work/reservations in
the completion UI. Reopening preserves every record. Existing links must belong
to this owner. Do not merge clients automatically because their names match.
Follow-ups due today or earlier remain available to Today attention selectors.

## Required tests and delivery

Create a client then project, restart backend, read both. Edit without duplicates.
Archive/unarchive keeps links. Complete/reopen a project preserves task/time/
purchase/reservation records. Reject another owner's client/project IDs and
invalid email/dates. Same retry creates only one client/project/follow-up.
Conversion commits all links or none. Follow-up with blank next date clears
attention; future next date removes it today; no message is sent.

Browser: create/edit client and job at 390px, find job from client details,
keyboard/dialog validation and dirty Cancel. Export the frozen UI entrypoints.
Run your tests, lint/typecheck and report results plus integration callbacks in
the handoff. Mark READY only with persistence verified against the real test DB.
