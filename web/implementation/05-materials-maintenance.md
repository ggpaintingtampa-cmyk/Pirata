# Task 05 — Materials, Reservations and Maintenance (Codex Spark)

Implement the stock and upkeep module. They share an Inventory view but keep
quantity adjustments, reservations, maintenance and purchases distinct.

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

- server/src/modules/inventory/**
- server/tests/modules/inventory/**
- web/src/features/inventory/**
- web/tests/modules/inventory/**
- web/implementation/handoffs/05-materials-maintenance.md

## Materials and requirements

Implement material.create/update, material.adjust, requirement.set,
requirement.remove, equipment.create/update/archive, maintenance.create/update,
maintenance.complete/reopen. Use frozen names/types. Material contains name,
product/color/finish, gal|piece and stockMinor. Validate text with the frozen
limits. Record opening stock as an explicit initial adjustment. Unit cannot be
changed while stock/requirements/history would become ambiguous; reject clearly.

Use integer hundredths for all quantities; pieces divisible by 100. Signed
adjustments have reason restock/usage/correction and optional <=1000 note.
No negative stock, and physical stock cannot fall below total saved reservations.
Adjustment record plus material stock change must commit atomically, once.
Keep history immutable; correct through a new adjustment with a reason.

Requirement belongs to owned material and project. needed >=0; 0<=reserved<=needed;
sum of material reservations <=physical stock. Adjust/release reservation
explicitly. Removing requirement releases its saved reservation in the same
transaction; completing a project does not silently release it. Stock already
reserved is INCLUDED in physical stock; do not add it twice.

Shortage calculation: start free=stock-sum(reserved). In frozen stable
project/requirement order, remaining=max(0,needed-reserved), allocation=min(free,
remaining), shortage=remaining-allocation; decrement free by allocation. Never
save this derived allocation as a reservation or offer the same free stock to
two projects. Preserve existing selector semantics and deterministic sorting.

## Equipment and maintenance

Equipment has name/note and archive state; no photo uploads. Maintenance title,
linked equipment, explicit due date, completedAt|null. Mark complete uses server
timestamp and is idempotent; reopen is explicit. Recurring generation is deferred.
Incomplete due-today/overdue items feed Today attention. Historical text survives
equipment archive and import mapping. No outbound notifications.

## UI

Inventory view with material stock/free/reserved amounts and per-project needs,
clear quantity/unit labels, adjustment/history forms, requirements editor,
equipment and maintenance list/details. Provide attention detail callbacks.
Use existing native modal system; replace content rather than nesting modals.
Material changes never create an expense or alter Spent today.

## Required tests

Initial paint shortage 300 minor=3gal; +300 restock removes it and spending stays
8460 cents. Free stock shared across two projects isn't allocated twice.
Fractions of pieces rejected, <=two-decimal gallons enforced, negative stock and
below-reservation adjustment rejected. Concurrent reservations cannot overbook.
Adjust retry changes stock once. Failed history insert rolls back stock. Owned
relationships enforced. Complete maintenance removes warning; reopen restores
it when due; future due date is absent today. Archived equipment keeps history.

Browser: create material/equipment, restock and inspect shortage, edit requirement,
complete maintenance, refresh persistence, field errors and dirty Cancel. Deliver
tests/results and integration exports in your handoff; no global wiring edits.
