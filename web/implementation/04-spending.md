# Task 04 — Recorded Spending (Codex Spark)

Implement durable purchases and useful date/project spending views.

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

- server/src/modules/spending/**
- server/tests/modules/spending/**
- web/src/features/spending/**
- web/tests/modules/spending/**
- web/implementation/handoffs/04-spending.md

## Backend

Implement expense.create and expense.update using frozen contracts. Store ID,
purchaseDate, description, category, amountCents, projectId|null, createdAt,
updatedAt. Category materials/tools/fuel/maintenance/other. Description 1–160
trimmed, amount positive safe integer cents, valid calendar date, owned project
or General business. Created timestamp and ID are immutable during editing.
No hard deletion in this wave. Empty project selection becomes null.

Parse positive decimal user input with at most two decimals using the existing
money helper. Do not calculate cents by naive floating-point multiplication;
do not accept NaN/infinity/exponents/negative or unsafe integers in the API.
Sum integer cents. Server validates separately from form validation.

Today is the actual New York date. Total includes all purchases with that
purchaseDate, including General business. Latest three use creation order,
deterministic tie-breaking; editing does not make a duplicate or new purchase.
Date edits move a purchase between daily totals. Project totals exclude General
business and other projects. Totals are derived, never stored as independent data.

## UI

Provide expense form for create/edit and list/detail view with date and project
filters, clear total for the active filter, description, category, project and
amount. Keep Today's three newest rows and View all compatible via adapter
callbacks. Default purchase date today. Field errors preserve original input;
focus first invalid field. Cancel saves nothing. Disable duplicate submit and
retain retry ID after uncertain network response.

This is recorded spending, not an accounting ledger. Do not build invoices,
payments, profitability, tax treatment, cash balance, bank integration, uploads,
or automatic expenses from inventory adjustments.

## Required tests

$0.10+$0.20 = 30 cents exactly. Sample $84.60 + $25 = $109.60.
Editing that new $25 purchase to $30 yields $114.60 with same record count/ID.
Date/project changes update proper totals without duplicates. Creation ordering
is preserved on edits. Reject invalid amounts/dates and inaccessible project.
General business counted daily but not in project sum. Duplicate request creates
one record; conflict/storage failure applies nothing and preserves UI input.

Browser: add/edit/refresh at phone size, date filters and field-error focus,
network failure plus retry, dirty Cancel. Hand off tested components, selectors,
commands/results and integration notes. No changes to global Today files yet.
